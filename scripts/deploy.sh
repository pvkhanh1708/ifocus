#!/usr/bin/env bash
# Update the app on the server (e.g. Hostinger over SSH) after pushing to main.
# The Vite build is committed (public/), so the server needs no Node.js.
#
#   bash scripts/deploy.sh
#
# Override the binaries if the defaults are not right on your host:
#   PHP=/opt/alt/php84/usr/bin/php COMPOSER=composer2 bash scripts/deploy.sh
set -euo pipefail

PHP="${PHP:-php}"
COMPOSER="${COMPOSER:-composer}"

cd "$(dirname "$0")/.."

echo "→ Pulling latest code"
git pull --ff-only

echo "→ Installing PHP dependencies"
"$COMPOSER" install --no-dev --optimize-autoloader --no-interaction

echo "→ Running migrations"
"$PHP" artisan migrate --force

echo "→ Caching config, routes, events"
"$PHP" artisan optimize

echo "✓ Deployed $(git rev-parse --short HEAD)"
