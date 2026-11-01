#!/usr/bin/env bash
# Twin Queens Chess — one-time server setup on a fresh Ubuntu 22.04/24.04 VPS.
# Run as root in the server console:
#   curl -fsSL https://raw.githubusercontent.com/myanshin-pixel/twin-queens/main/deploy/setup.sh | bash -s -- play.twinqueens.com
# It installs Docker, downloads the game, creates secret keys, opens the firewall, starts
# the game with an HTTPS certificate, and turns on automatic updates and daily backups.
set -euo pipefail

DOMAIN="${1:-}"
REPO="https://github.com/myanshin-pixel/twin-queens.git"
DIR="/opt/twinqueens"

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo -i)."; exit 1; fi
if [ -z "$DOMAIN" ]; then echo "Usage: bash setup.sh play.twinqueens.com"; exit 1; fi

say() { printf '\n\033[1;32m== %s\033[0m\n' "$*"; }

say "Swap file (helps the build on small servers)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

say "System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -yq git curl ca-certificates ufw unattended-upgrades openssl python3

say "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker

say "Game code"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q && git -C "$DIR" reset -q --hard origin/main
else
  git clone -q "$REPO" "$DIR"
fi
cd "$DIR/deploy"
mkdir -p backups

say "Settings and secret keys (deploy/.env)"
if [ ! -f .env ]; then
  FERNET_KEY=$(python3 -c 'import base64,os;print(base64.urlsafe_b64encode(os.urandom(32)).decode())')
  FISHNET_KEY=$(openssl rand -hex 16)
  cat > .env <<ENV
# Twin Queens Chess server settings. After editing run: bash /opt/twinqueens/deploy/update.sh --force
DOMAIN=$DOMAIN
URI=https://$DOMAIN
FERNET_KEY=$FERNET_KEY
MONGO_ADMIN_PASS=$(openssl rand -hex 24)
FISHNET_KEY=$FISHNET_KEY
FISHNET_KEYS='{"$FISHNET_KEY":"twinqueens-engine"}'
ALLOWED_ORIGINS=https://twinqueens.com,https://www.twinqueens.com
# Usernames with admin rights, comma separated (set after you register):
ADMINS=
# "Sign in with Google": create an OAuth client in Google Cloud Console
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Email for confirmation and password reset (for example Yandex 360: smtp.yandex.ru, port 465)
SMTP_HOST=
SMTP_PORT=465
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=
ENV
  chmod 600 .env
fi

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

say "Building and starting (first time takes 5-15 minutes)"
docker compose up -d --build

say "Automatic updates from GitHub (every 5 minutes) and daily backups"
cat > /etc/systemd/system/tq-update.service <<UNIT
[Unit]
Description=Twin Queens: update from GitHub
[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/deploy/update.sh
UNIT
cat > /etc/systemd/system/tq-update.timer <<UNIT
[Unit]
Description=Twin Queens: check GitHub for updates
[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now tq-update.timer
cat > /etc/cron.d/tq-backup <<CRON
30 3 * * * root bash $DIR/deploy/backup.sh >> /var/log/tq-backup.log 2>&1
CRON

IP=$(curl -fsS https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')
say "Done"
echo "Game: https://$DOMAIN   (DNS record: $DOMAIN -> $IP)"
echo "The HTTPS certificate is issued automatically as soon as the DNS record points to this server."
echo "Logs: cd $DIR/deploy && docker compose logs -f server"
