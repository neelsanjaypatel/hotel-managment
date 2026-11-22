#!/usr/bin/env bash
# Nightly copy of the app's database, kept on this server for 14 days.
# Installed as /usr/local/bin/hotel-desk-backup and run by /etc/cron.d/hotel-desk-backup.
# It exists so a bad day at the database host (or a wrong delete) is not the end of the
# data: the database lives at Supabase, these copies live at AWS.
#
# Restore into an EMPTY Postgres 17 database:
#   pg_restore --no-owner --no-privileges --dbname="postgres://..." /var/backups/hotel-desk/<file>.dump
# Needs pg_dump 17 or newer (the database is Postgres 17): package postgresql-client-17.
set -euo pipefail
DIR=/var/backups/hotel-desk
KEEP_DAYS=14
MIN_TABLES=20

umask 077 # the copies hold every hotel's books: readable by root only
mkdir -p "$DIR"
set -a; . /etc/hotel-desk.env; set +a

out="$DIR/hotel-desk-$(date -u +%Y%m%d-%H%M%S).dump"
# "public" is the app's data, "drizzle" its migration history. The rest of a Supabase
# database is Supabase's own and is not ours to copy.
pg_dump --dbname="$DATABASE_URL" --format=custom --no-owner --no-privileges \
  --schema=public --schema=drizzle --file="$out.part"

# A copy that cannot be read back is worse than none, so open it before keeping it.
tables=$(pg_restore --list "$out.part" | grep -c ' TABLE DATA ')
if [ "$tables" -lt "$MIN_TABLES" ]; then
  echo "$(date -u +%FT%TZ) FAILED: copy has only $tables tables, discarded" >&2
  rm -f "$out.part"
  exit 1
fi
mv "$out.part" "$out"
find "$DIR" -name 'hotel-desk-*.dump' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) ok $(basename "$out") $(du -h "$out" | cut -f1) $tables tables, $(find "$DIR" -name 'hotel-desk-*.dump' | wc -l) copies kept"
