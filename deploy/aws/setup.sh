#!/usr/bin/env bash
# One-time setup of Hotel Desk on a fresh Ubuntu 24.04 server (AWS Lightsail, Mumbai).
# Run as the default "ubuntu" user:
#   curl -fsSL https://raw.githubusercontent.com/neelsanjaypatel/hotel-managment/main/deploy/aws/setup.sh -o setup.sh
#   bash setup.sh hoteldesk.in
# It asks for DATABASE_URL (not echoed), installs Node 22 + Caddy, builds the app, and runs
# it as a systemd service behind Caddy, which gets the HTTPS certificate by itself.
# Point the domain's A record at this server's static IP before running it.
set -euo pipefail

DOMAIN="${1:?Usage: bash setup.sh <domain>  e.g. bash setup.sh hoteldesk.in}"
REPO="${REPO:-https://github.com/neelsanjaypatel/hotel-managment.git}"
APP_DIR=/opt/hotel-desk
ENV_FILE=/etc/hotel-desk.env

read -rsp "DATABASE_URL (Supabase Transaction pooler string): " DATABASE_URL; echo
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is empty"; exit 1; }
read -rp "PLATFORM_PAYMENT_NOTE (UPI / bank / WhatsApp for renewals, can be blank): " PAYMENT_NOTE

echo "== Swap (next build needs more than 2 GB at peak)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

echo "== Packages"
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl gnupg git debian-keyring debian-archive-keyring apt-transport-https unattended-upgrades
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt | sudo tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
sudo apt-get update -y && sudo apt-get install -y caddy

echo "== App user and code"
id hoteldesk >/dev/null 2>&1 || sudo useradd --system --create-home --shell /usr/sbin/nologin hoteldesk
[ -d "$APP_DIR/.git" ] || sudo git clone "$REPO" "$APP_DIR"
sudo chown -R hoteldesk:hoteldesk "$APP_DIR"

echo "== Environment ($ENV_FILE, readable by the app user only)"
sudo install -m 600 -o hoteldesk -g hoteldesk /dev/null "$ENV_FILE"
{
  printf 'NODE_ENV=production\nPORT=3000\nHOSTNAME=127.0.0.1\n'
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  [ -n "$PAYMENT_NOTE" ] && printf 'PLATFORM_PAYMENT_NOTE=%s\n' "$PAYMENT_NOTE"
} | sudo tee "$ENV_FILE" >/dev/null

echo "== Service"
sudo cp "$APP_DIR/deploy/aws/hotel-desk.service" /etc/systemd/system/hotel-desk.service
sudo install -m 755 "$APP_DIR/deploy/aws/update.sh" /usr/local/bin/hotel-desk-update
sudo systemctl daemon-reload
sudo systemctl enable hotel-desk

echo "== Build and start"
sudo /usr/local/bin/hotel-desk-update --no-pull

echo "== HTTPS (Caddy)"
sed "s/{DOMAIN}/$DOMAIN/g" "$APP_DIR/deploy/aws/Caddyfile" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy

echo
echo "Done. Open https://$DOMAIN (the certificate can take a minute on first visit)."
echo "Later updates: sudo hotel-desk-update"
