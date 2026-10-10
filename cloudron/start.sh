#!/bin/bash
set -eu

echo "==> Preparing directories"
mkdir -p /app/data /run/next-cache
# Ownership is not preserved across restarts, updates and restores.
chown -R cloudron:cloudron /app/data /run/next-cache

# Access control is done by Cloudron (proxyAuth addon) in front of the app, so the app's own
# login stays off. Every project database and the auth/secret files derive from DB_PATH.
export DB_PATH=/app/data/seo-playground.db
unset AUTH_ENABLED BETTER_AUTH_URL BETTER_AUTH_SECRET

# Private secret shared by the web server and the Geo-grid worker (both started by launcher.mjs).
CRON_SECRET="$(head -c 48 /dev/urandom | base64 | tr -d '\n=+/')"
export CRON_SECRET

echo "==> Starting SEO Playground ${APP_VERSION:-}"
exec /usr/local/bin/gosu cloudron:cloudron node /app/code/launcher.mjs
