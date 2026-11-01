#!/usr/bin/env bash
# Twin Queens Chess — daily database backup, keeps the last 14 days in deploy/backups.
set -euo pipefail
cd /opt/twinqueens/deploy
set -a; . ./.env; set +a
name="tq-$(date +%F).archive.gz"
docker compose exec -T mongodb mongodump --quiet --username admin --password "$MONGO_ADMIN_PASS" \
  --authenticationDatabase admin --archive="/backups/$name" --gzip
find backups -name 'tq-*.archive.gz' -mtime +14 -delete
echo "$(date -Is) backup $name"
