#!/usr/bin/env bash
# Hash-deduped, age-tiered snapshot of a SQLite DB.
#
# Behavior:
#   1. SHA-256 the DB. If it matches the last snapshot's hash, skip —
#      log "SKIP unchanged" and exit. (Quiescent days cost ~10ms.)
#   2. Otherwise, atomic snapshot via SQLite Online Backup API to
#      $BACKUP_DIR/dev-YYYYMMDD-HHMMSS.db, record the new hash.
#   3. Rotation (single dir, age-bucketed):
#        - last 10 min  → keep every snapshot
#        - 10 min – 24 h → keep ONE per hour bucket  (max 24 files)
#        - 24 h  – 30 d → keep ONE per day bucket   (max 30 files)
#        - > 30 days     → delete
#   4. Every action appends a line to $BACKUP_DIR/audit.log.
#
# Configuration (env vars):
#   BACKUP_DB   absolute path to the DB. Defaults to the dev SQLite file at
#               <repo>/api/prisma/dev.db
#               (path derived from this script's location, so cwd doesn't
#               matter). prod sets it explicitly.
#   BACKUP_DIR  destination dir for snapshots + audit.log + .last-hash.
#               Defaults to <repo>/api/data/backups.
#
# Portability: works on macOS (BSD date/shasum) and Linux (GNU
# date/sha256sum). Auto-detects.

set -uo pipefail

# ────────────────────────────────────────────────────────────────
# Portability helpers
# ────────────────────────────────────────────────────────────────

# SHA-256 of a file → hex string only. Tries the most common binaries
# in order; errors out if none are present.
hash_file() {
  local f="$1"
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$f" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$f" | awk '{print $1}'
  elif command -v openssl >/dev/null 2>&1; then
    openssl dgst -sha256 "$f" | awk '{print $NF}'
  else
    echo "no sha256 binary found (sha256sum/shasum/openssl)" >&2
    return 1
  fi
}

# Parse a YYYYMMDD-HHMMSS timestamp to epoch seconds.
# BSD date (mac): -j -f "<fmt>" "<input>"
# GNU date (linux): -d "<ISO-ish>"
to_epoch() {
  local ts="$1"
  if date -j -f "%Y%m%d-%H%M%S" "$ts" +%s >/dev/null 2>&1; then
    date -j -f "%Y%m%d-%H%M%S" "$ts" +%s
  else
    # ts = YYYYMMDD-HHMMSS  (indices: 0..7, 9..14)
    local iso="${ts:0:4}-${ts:4:2}-${ts:6:2}T${ts:9:2}:${ts:11:2}:${ts:13:2}"
    date -d "$iso" +%s
  fi
}

# ────────────────────────────────────────────────────────────────
# Resolve paths relative to THIS script, so it runs from any cwd.
# Layout: deploy/backup-dev-db.sh → ../api
# ────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/../api"

# Dev state lives under api/ (DATABASE_URL=file:./dev.db, BASE_DIR=./data).
# Derived from the repo location so the script runs from any cwd. Override via
# BACKUP_DB/BACKUP_DIR (prod sets both explicitly).
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$REPO_ROOT/api/data"
DB="${BACKUP_DB:-$REPO_ROOT/api/prisma/dev.db}"

DIR="${BACKUP_DIR:-$DATA_ROOT/backups}"
HASH_FILE="$DIR/.last-hash"
AUDIT="$DIR/audit.log"

# Tier windows (in seconds).
MINUTE_KEEP_SEC=$((10 * 60))         #  10 min
HOUR_KEEP_SEC=$((24 * 60 * 60))      #  24 h
DAY_KEEP_SEC=$((30 * 24 * 60 * 60))  #  30 d

if [[ ! -f "$DB" ]]; then
  exit 0
fi
if [[ ! -s "$DB" ]]; then
  exit 0
fi

mkdir -p "$DIR"

NOW_EPOCH=$(date +%s)
NOW_ISO=$(date "+%Y-%m-%dT%H:%M:%S")

log() { echo "$NOW_ISO $1" >> "$AUDIT"; }

# ────────────────────────────────────────────────────────────────
# 1) Hash dedup
# ────────────────────────────────────────────────────────────────
NEW_HASH=$(hash_file "$DB")
OLD_HASH=""
[[ -f "$HASH_FILE" ]] && OLD_HASH=$(cat "$HASH_FILE")

if [[ "$NEW_HASH" == "$OLD_HASH" ]]; then
  log "SKIP unchanged hash=${NEW_HASH:0:12}"
  # NOTE: we do NOT exit here. Even when the DB hasn't changed, we
  # still want rotation to run so age-based pruning keeps draining
  # the older tiers as wall-clock time advances.
  SNAPSHOT_OUT=""
else
  # ────────────────────────────────────────────────────────────
  # 2) Snapshot
  # ────────────────────────────────────────────────────────────
  TS=$(date "+%Y%m%d-%H%M%S")
  OUT="$DIR/dev-$TS.db"

  if ! sqlite3 "$DB" ".backup '$OUT'"; then
    log "ERROR sqlite3 .backup failed"
    exit 1
  fi

  # Update hash file ONLY after successful backup.
  echo "$NEW_HASH" > "$HASH_FILE"

  SIZE=$(du -h "$OUT" | awk '{print $1}')
  log "BACKUP $OUT $SIZE hash=${NEW_HASH:0:12}"
  SNAPSHOT_OUT=$OUT
fi

# ────────────────────────────────────────────────────────────────
# 3) Rotation — age-tiered bucketed retention
# ────────────────────────────────────────────────────────────────
# Avoids bash 4 associative arrays so this still runs on macOS's
# default /bin/bash 3.2.
#
# Algorithm: walk snapshots NEWEST-first. For each snapshot we
# classify into a tier (minute / hour / day / too-old). For hour
# and day tiers we keep ONE per bucket — since we iterate newest
# first, the first time we see a bucket we keep it; later (older)
# entries in the same bucket get deleted.
#
# "Seen" buckets are stored as pipe-bracketed strings, e.g.
#   HOUR_SEEN="|3|7|15|"
# so a presence check is just a substring match.

HOUR_SEEN="|"
DAY_SEEN="|"

# Sort by reverse filename = reverse time (timestamps are
# YYYYMMDD-HHMMSS, lex-sortable). Newest first.
removed=0
for f in $(ls -1 "$DIR"/dev-*.db 2>/dev/null | sort -r); do
  [[ -e "$f" ]] || continue
  base=${f##*/}
  ts=${base#dev-}
  ts=${ts%.db}
  file_epoch=$(to_epoch "$ts" 2>/dev/null) || continue
  age=$((NOW_EPOCH - file_epoch))

  if (( age <= MINUTE_KEEP_SEC )); then
    continue   # minute tier — keep all
  fi

  if (( age <= HOUR_KEEP_SEC )); then
    bucket=$((age / 3600))
    case "$HOUR_SEEN" in
      *"|$bucket|"*) rm -f "$f"; removed=$((removed + 1)) ;;
      *)             HOUR_SEEN="${HOUR_SEEN}${bucket}|" ;;
    esac
    continue
  fi

  if (( age <= DAY_KEEP_SEC )); then
    bucket=$((age / 86400))
    case "$DAY_SEEN" in
      *"|$bucket|"*) rm -f "$f"; removed=$((removed + 1)) ;;
      *)             DAY_SEEN="${DAY_SEEN}${bucket}|" ;;
    esac
    continue
  fi

  # > 30 days — delete.
  rm -f "$f"
  removed=$((removed + 1))
done

if (( removed > 0 )); then
  log "ROTATE removed=$removed (age-tier bucket subsample)"
fi

# Also trim the audit log if it gets huge (> 5 MB).
if [[ -f "$AUDIT" ]] && [[ $(wc -c < "$AUDIT") -gt 5242880 ]]; then
  tail -c 2097152 "$AUDIT" > "$AUDIT.tmp" && mv "$AUDIT.tmp" "$AUDIT"
fi

# Friendly stdout when run interactively (silent when run from
# launchd/cron so logs don't fill up with "skipped" lines).
if [[ -t 1 ]]; then
  if [[ -n "$SNAPSHOT_OUT" ]]; then
    echo "✓ snapshot → $SNAPSHOT_OUT ($SIZE)"
  else
    echo "· unchanged — skipped"
  fi
  total=$(ls -1 "$DIR"/dev-*.db 2>/dev/null | wc -l | tr -d ' ')
  echo "  total kept: $total"
  if (( removed > 0 )); then echo "  rotated out: $removed"; fi
fi
