#!/usr/bin/env bash
# One-time setup of Hotel Desk on a fresh Ubuntu 24.04 server (AWS Lightsail, Mumbai).
# Run as the default "ubuntu" user:
#   curl -fsSL https://raw.githubusercontent.com/neelsanjaypatel/hotel-managment/main/deploy/aws/setup.sh -o setup.sh
#   bash setup.sh desk24.in
# It asks for the secrets (hidden as you paste), installs Node 22 + Caddy, builds the app, and
# runs it as a systemd service behind Caddy. Caddy gets the HTTPS certificates once the domain's
# @ and www A records point at this server's static IP, so the live site can stay where it is
# until the build has finished. Running it again is safe.
set -euo pipefail

DOMAIN="${1:?Usage: bash setup.sh <domain>  e.g. bash setup.sh desk24.in}"
REPO="${REPO:-https://github.com/neelsanjaypatel/hotel-managment.git}"
APP_DIR=/opt/hotel-desk
ENV_FILE=/etc/hotel-desk.env

ask() { # variable, label: hidden, so a pasted secret stays off the screen
  local value
  read -rsp "$2: " value; echo
  case "$value" in *\'*) echo "$1 cannot contain a single quote"; exit 1 ;; esac
  printf -v "$1" '%s' "$value"
}
ask DATABASE_URL "DATABASE_URL (Supabase Transaction pooler string)"
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is empty"; exit 1; }
ask DATA_KEY "DATA_KEY (the same key as before; without it saved Aadhaar numbers cannot be read)"
[ "$(printf '%s' "$DATA_KEY" | base64 -d 2>/dev/null | wc -c)" = 32 ] || { echo "DATA_KEY must be 32 bytes in base64"; exit 1; }
ask GOOGLE_CLIENT_ID "GOOGLE_CLIENT_ID (blank turns Google login off)"
ask GOOGLE_CLIENT_SECRET "GOOGLE_CLIENT_SECRET (blank turns Google login off)"
read -rp "PLATFORM_PAYMENT_NOTE (UPI / bank / WhatsApp for renewals, can be blank): " PAYMENT_NOTE
PAYMENT_NOTE=${PAYMENT_NOTE//\'/}

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
  # Single quotes: both bash and systemd read this file, and a database URL can hold & or $.
  printf "NODE_ENV=production\nAPP_URL='https://www.%s'\n" "$DOMAIN"
  printf "DATABASE_URL='%s'\nDATA_KEY='%s'\n" "$DATABASE_URL" "$DATA_KEY"
  if [ -n "$GOOGLE_CLIENT_ID" ] && [ -n "$GOOGLE_CLIENT_SECRET" ]; then
    printf "GOOGLE_CLIENT_ID='%s'\nGOOGLE_CLIENT_SECRET='%s'\n" "$GOOGLE_CLIENT_ID" "$GOOGLE_CLIENT_SECRET"
  fi
  if [ -n "$PAYMENT_NOTE" ]; then printf "PLATFORM_PAYMENT_NOTE='%s'\n" "$PAYMENT_NOTE"; fi
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
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null http://127.0.0.1:3000/login; then READY=1; break; fi
  sleep 3
done
[ "${READY:-}" = 1 ] || { echo "The app did not start. See: journalctl -u hotel-desk -n 50"; exit 1; }
echo "App is running on this server. Now point @ and www at this server's static IP in DNS."
echo "HTTPS then starts by itself, usually within a few minutes of DNS changing."
echo "Later updates: sudo hotel-desk-update"
