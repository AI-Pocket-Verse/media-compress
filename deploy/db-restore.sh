#!/usr/bin/env bash
# Restore dev.db from a snapshot. Safe-by-default:
#   1. Takes a "predo" snapshot of the CURRENT dev.db before overwriting,
#      so a wrong restore is always reversible.
#   2. Asks for confirmation unless --yes is passed.
#   3. Warns if the API process is currently holding the file.
#
# Usage (runs from any cwd):
#   bash deploy/db-restore.sh              # interactive picker
#   bash deploy/db-restore.sh <filename>   # restore that exact file
#   bash deploy/db-restore.sh latest       # most recent snapshot
#   bash deploy/db-restore.sh --yes <file> # skip confirmation

set -euo pipefail

# Resolve paths relative to THIS script (deploy → ../api).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/../api"
# Dev state lives under api/ (DATABASE_URL=file:./dev.db, BASE_DIR=./data).
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$REPO_ROOT/api/data"
DB="${BACKUP_DB:-$REPO_ROOT/api/prisma/dev.db}"
DIR="${BACKUP_DIR:-$DATA_ROOT/backups}"

YES=0
TARGET=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --yes|-y) YES=1; shift ;;
    *)        TARGET=$1; shift ;;
  esac
done

if [[ ! -d "$DIR" ]]; then
  echo "no backups dir at $DIR" >&2
  exit 1
fi

# ────────────────────────────────────────────────────────────────
# Resolve TARGET → absolute path of a snapshot file
# ────────────────────────────────────────────────────────────────
list_backups() {
  ls -1 "$DIR"/dev-*.db 2>/dev/null | sort -r
}

if [[ -z "$TARGET" ]]; then
  # Interactive picker — print last 20 newest first, ask user.
  # Portable array fill (avoids bash 4+ `mapfile`).
  echo "Recent snapshots:"
  OPTIONS=()
  while IFS= read -r line; do
    OPTIONS+=("$line")
  done < <(list_backups | head -20)
  if [[ ${#OPTIONS[@]} -eq 0 ]]; then
    echo "no snapshots found in $DIR" >&2
    exit 1
  fi
  for i in "${!OPTIONS[@]}"; do
    f=${OPTIONS[$i]}
    base=${f##*/}
    ts=${base#dev-}; ts=${ts%.db}
    pretty=$(date -j -f "%Y%m%d-%H%M%S" "$ts" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$ts")
    size=$(du -h "$f" | awk '{print $1}')
    printf "  %2d) %s  %s  %s\n" "$((i + 1))" "$pretty" "$size" "$base"
  done
  echo
  read -r -p "Pick a number (1-${#OPTIONS[@]}, or q to abort): " choice
  if [[ ! "$choice" =~ ^[0-9]+$ ]] || (( choice < 1 || choice > ${#OPTIONS[@]} )); then
    echo "aborted"
    exit 1
  fi
  TARGET=${OPTIONS[$((choice - 1))]}
elif [[ "$TARGET" == "latest" ]]; then
  TARGET=$(list_backups | head -1)
  [[ -z "$TARGET" ]] && { echo "no snapshots found" >&2; exit 1; }
elif [[ ! -f "$TARGET" ]]; then
  # User probably gave just the basename; try resolving in $DIR.
  if [[ -f "$DIR/$TARGET" ]]; then
    TARGET="$DIR/$TARGET"
  else
    echo "snapshot not found: $TARGET" >&2
    exit 1
  fi
fi

# ────────────────────────────────────────────────────────────────
# Show what we're about to do, confirm, then act
# ────────────────────────────────────────────────────────────────
echo "About to restore:"
echo "  from: $TARGET"
echo "  to:   $DB"

CUR_SIZE=$([[ -f "$DB" ]] && du -h "$DB" | awk '{print $1}' || echo "(missing)")
NEW_SIZE=$(du -h "$TARGET" | awk '{print $1}')
echo "  current dev.db: $CUR_SIZE"
echo "  snapshot size:  $NEW_SIZE"

# Warn if the API is currently holding the DB.
if command -v lsof >/dev/null 2>&1; then
  HOLDERS=$(lsof -nP -- "$DB" 2>/dev/null | tail -n +2 | awk '{print $2}' | sort -u | tr '\n' ' ' || true)
  if [[ -n "$HOLDERS" ]]; then
    echo
    echo "⚠ dev.db is currently open by PID(s): $HOLDERS"
    echo "  Stop the API (or whoever) first — restoring while the file"
    echo "  is open will leave stale connections holding the old data."
  fi
fi

if (( YES == 0 )); then
  echo
  read -r -p "Continue? (yes/N): " ans
  if [[ "$ans" != "yes" ]]; then
    echo "aborted"
    exit 1
  fi
fi

# ────────────────────────────────────────────────────────────────
# Safety net: snapshot the CURRENT dev.db with a "predo-" prefix
# ────────────────────────────────────────────────────────────────
if [[ -f "$DB" ]] && [[ -s "$DB" ]]; then
  TS=$(date "+%Y%m%d-%H%M%S")
  PREDO="$DIR/predo-restore-$TS.db"
  sqlite3 "$DB" ".backup '$PREDO'" || { echo "predo snapshot failed; aborting" >&2; exit 1; }
  echo "✓ pre-restore safety snapshot → $PREDO"
fi

# ────────────────────────────────────────────────────────────────
# Restore = atomic move-in-place
# ────────────────────────────────────────────────────────────────
TMP="$DB.restore-tmp"
cp -p "$TARGET" "$TMP"
mv -f "$TMP" "$DB"

# Drop the OLD db's WAL sidecars. The snapshot is a self-contained `sqlite3
# .backup` (no pending WAL), so a leftover -wal/-shm from the previous db would be
# replayed on top of the fresh file on next open and corrupt it. (The predo
# snapshot above already checkpointed the current db, so nothing is lost.)
rm -f "$DB-wal" "$DB-shm"

# Refresh the last-hash so the next backup recognizes the new state.
shasum -a 256 "$DB" | awk '{print $1}' > "$DIR/.last-hash"

# Append a clear audit line.
NOW_ISO=$(date "+%Y-%m-%dT%H:%M:%S")
echo "$NOW_ISO RESTORE from=${TARGET##*/} predo=${PREDO##*/}" >> "$DIR/audit.log"

echo "✓ restored $DB from ${TARGET##*/}"
echo "  if this was a mistake: bash deploy/db-restore.sh ${PREDO##*/}"
