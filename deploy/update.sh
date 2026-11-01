#!/usr/bin/env bash
# Twin Queens Chess — pull the latest code from GitHub and rebuild if anything changed.
# Runs every 5 minutes from tq-update.timer; "--force" rebuilds even without new commits
# (use it after editing deploy/.env).
set -euo pipefail
DIR="/opt/twinqueens"
cd "$DIR"
exec 9>/run/tq-update.lock
flock -n 9 || exit 0
git fetch -q origin main
if [ "${1:-}" != "--force" ] && [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  exit 0
fi
git reset -q --hard origin/main
cd deploy
docker compose up -d --build --remove-orphans
docker image prune -f >/dev/null
echo "$(date -Is) updated to $(git rev-parse --short HEAD)"
