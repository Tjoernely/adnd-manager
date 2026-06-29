#!/usr/bin/env bash
#
# Daily PostgreSQL backup for RealmKeep.
#
#   - DB credentials are read from server/.env at run time — never hardcoded and
#     never passed on the command line. pg_dump receives the password via the
#     PGPASSWORD environment variable (so it isn't visible in argv / `ps`).
#   - Output is a gzipped, timestamped plain-SQL dump written to
#     /var/backups/realmkeep/ — outside the repo AND outside the nginx web root,
#     so the dumps are never web-served and never committed to git.
#   - Rotation keeps the 7 most recent dumps and prunes anything older.
#
# Runs from cron (daily 03:00, see the ubuntu crontab); also safe to run by hand:
#   bash /var/www/adnd-manager/scripts/backup-db.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-$SCRIPT_DIR/../server/.env}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/realmkeep}"
KEEP="${KEEP:-7}"

[ -f "$ENV_FILE" ] || { echo "[backup] env file not found: $ENV_FILE" >&2; exit 1; }

# Read one key's value from .env (strips surrounding quotes). Never echoes it.
env_val() { sed -n -E "s/^$1=//p" "$ENV_FILE" | head -1 | sed -E 's/^["'\'']//; s/["'\'']$//'; }

DB_HOST="$(env_val DB_HOST)"; DB_HOST="${DB_HOST:-localhost}"
DB_PORT="$(env_val DB_PORT)"; DB_PORT="${DB_PORT:-5432}"
DB_NAME="$(env_val DB_NAME)"
DB_USER="$(env_val DB_USER)"
DB_PASS="$(env_val DB_PASSWORD)"

[ -n "$DB_NAME" ] && [ -n "$DB_USER" ] || { echo "[backup] DB_NAME/DB_USER missing in $ENV_FILE" >&2; exit 1; }

mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR" 2>/dev/null || true

TS="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/${DB_NAME}_${TS}.sql.gz"
TMP="$OUT.partial"

# PGPASSWORD is set only for this command's environment — not in argv. pipefail
# makes a pg_dump failure abort the script (so a broken dump isn't kept).
PGPASSWORD="$DB_PASS" pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" \
  --no-owner --no-privileges \
  | gzip -c > "$TMP"

mv "$TMP" "$OUT"
chmod 600 "$OUT"
echo "[backup] $(date -Is) wrote $OUT ($(du -h "$OUT" | cut -f1))"

# Rotation — keep the newest $KEEP, prune older.
mapfile -t OLD < <(ls -1t "$BACKUP_DIR"/"${DB_NAME}"_*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))")
for f in "${OLD[@]:-}"; do
  [ -n "$f" ] || continue
  rm -f "$f" && echo "[backup] pruned $f"
done
