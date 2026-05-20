#!/usr/bin/env bash
# Deploy Quick Flip Brochures to srv1410919 (clea-solutions VPS).
#
# Build is done ON THE VPS, not locally — that ensures the .next/standalone
# bundle is built against the VPS's exact node + glibc, avoiding native-module
# mismatches (sharp, bcrypt, etc.) the day they get added.
#
# Usage:  ./deploy.sh        (rsync + build + restart)
#         ./deploy.sh logs   (tail PM2 logs after deploying)
set -euo pipefail

HOST="root@srv1410919"
REMOTE="/var/www/quick-flip-brochures"
NAME="quick-flip-brochures"

cd "$(dirname "$0")"

echo "→ rsync source to $HOST:$REMOTE"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude '*.log' \
  --exclude .env \
  --exclude .env.local \
  --exclude .env.production \
  --exclude tsconfig.tsbuildinfo \
  ./ "$HOST:$REMOTE/"

echo "→ install deps + build on remote"
ssh "$HOST" "set -e
  cd $REMOTE
  npm ci --no-audit --no-fund --prefer-offline
  npm run build
  # Standalone build needs static + public copied in next to server.js.
  rm -rf .next/standalone/.next/static .next/standalone/public
  cp -r .next/static  .next/standalone/.next/static
  cp -r public        .next/standalone/public
"

echo "→ restart PM2 process"
ssh "$HOST" "pm2 restart $NAME --update-env && pm2 save"

if [[ "${1:-}" == "logs" ]]; then
  echo "→ tailing logs (Ctrl-C to stop)"
  ssh -t "$HOST" "pm2 logs $NAME --lines 30"
else
  ssh "$HOST" "pm2 list | grep -E 'name|$NAME' | head -3"
fi
