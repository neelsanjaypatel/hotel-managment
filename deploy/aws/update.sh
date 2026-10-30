#!/usr/bin/env bash
# Pull the latest code from GitHub, rebuild (which also applies database migrations) and
# restart. Installed as /usr/local/bin/hotel-desk-update by setup.sh; run with sudo.
# The running site stays up during the build and is swapped in by the restart at the end.
set -euo pipefail
APP_DIR=/opt/hotel-desk
cd "$APP_DIR"
run() { sudo -u hoteldesk bash -c "set -a; . /etc/hotel-desk.env; set +a; cd $APP_DIR; $1"; }

[ "${1:-}" = "--no-pull" ] || run "git pull --ff-only"
run "npm ci --no-audit --no-fund"
run "npm run build"
systemctl restart hotel-desk
sleep 3
systemctl --no-pager --lines=5 status hotel-desk
