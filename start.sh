#!/usr/bin/env bash
# PM2-launched entrypoint. Sources .env.production (kept OUT of rsync so
# secrets never come from the dev box) then exec's the Next.js standalone
# server. Has to live in-repo, otherwise deploy.sh's rsync --delete will
# wipe it on the next push.
set -e
cd "$(dirname "$0")"
set -a
. ./.env.production
set +a
exec node .next/standalone/server.js
