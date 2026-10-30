#!/usr/bin/env bash
# List all dev.db snapshots, classified into tiers (minute/hour/day),
# with timestamps + sizes + a recent slice of the audit log so you
# can see WHAT happened in addition to WHEN.
#
# Usage (runs from any cwd):
#   bash deploy/db-audit.sh           # full listing
#   bash deploy/db-audit.sh --tail N  # also tail last N audit lines

set -uo pipefail

# Resolve the snapshot dir relative to THIS script (deploy → ../api),
# matching backup-dev-db.sh. Override with BACKUP_DIR.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$SCRIPT_DIR/../api"
# Dev state lives under api/ (DATABASE_URL=file:./dev.db, BASE_DIR=./data).
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DATA_ROOT="$REPO_ROOT/api/data"
DIR="${BACKUP_DIR:-$DATA_ROOT/backups}"
AUDIT="$DIR/audit.log"
TAIL_N=20

while [[ $# -gt 0 ]]; do
  case "$1" in
    --tail) TAIL_N=${2:-20}; shift 2 ;;
    *)      shift ;;
  esac
done

if [[ ! -d "$DIR" ]]; then
  echo "no backup directory at $DIR — agent never ran?"
  exit 0
fi

NOW_EPOCH=$(date +%s)

# Bucket the files for the listing display (same logic as backup-dev-db.sh).
MIN_LIMIT=600           # 10 min
HOUR_LIMIT=86400        # 24 h
DAY_LIMIT=2592000       # 30 d

printf "%-8s  %-21s  %5s  %10s  %s\n" "TIER" "TIMESTAMP" "AGE" "SIZE" "FILE"
printf "%-8s  %-21s  %5s  %10s  %s\n" "----" "---------" "---" "----" "----"

total=0
total_bytes=0
for f in $(ls -1 "$DIR"/dev-*.db 2>/dev/null | sort); do
  total=$((total + 1))
  base=${f##*/}
  ts=${base#dev-}
  ts=${ts%.db}
  file_epoch=$(date -j -f "%Y%m%d-%H%M%S" "$ts" +%s 2>/dev/null) || continue
  age=$((NOW_EPOCH - file_epoch))
  size_bytes=$(stat -f "%z" "$f" 2>/dev/null || echo 0)
  total_bytes=$((total_bytes + size_bytes))
  size_h=$(du -h "$f" | awk '{print $1}')

  if   (( age <= MIN_LIMIT  )); then tier="minute"
  elif (( age <= HOUR_LIMIT )); then tier="hour"
  elif (( age <= DAY_LIMIT  )); then tier="day"
  else                                tier="stale"
  fi

  # Pretty age string.
  if   (( age < 60 ));       then age_h="${age}s"
  elif (( age < 3600 ));     then age_h="$((age / 60))m"
  elif (( age < 86400 ));    then age_h="$((age / 3600))h"
  else                              age_h="$((age / 86400))d"
  fi

  pretty_ts=$(date -j -f "%Y%m%d-%H%M%S" "$ts" "+%Y-%m-%d %H:%M:%S" 2>/dev/null || echo "$ts")
  printf "%-8s  %-21s  %5s  %10s  %s\n" "$tier" "$pretty_ts" "$age_h" "$size_h" "$base"
done

echo
total_h=$(echo "$total_bytes" | awk '{
  if ($1 > 1073741824) printf "%.2f GB\n", $1 / 1073741824
  else if ($1 > 1048576) printf "%.1f MB\n", $1 / 1048576
  else if ($1 > 1024) printf "%.0f KB\n", $1 / 1024
  else print $1 " B"
}')
echo "total: $total snapshots, $total_h"

if [[ -f "$AUDIT" ]] && (( TAIL_N > 0 )); then
  echo
  echo "── audit log (last $TAIL_N entries) ──"
  tail -n "$TAIL_N" "$AUDIT"
fi
