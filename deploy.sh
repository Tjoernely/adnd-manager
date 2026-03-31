#!/bin/bash
set -e

APP=/var/www/adnd-manager

cd $APP
git fetch origin
git reset --hard origin/main

# ecosystem.config.cjs is NOT in git (credentials).
# If it already exists, leave it alone.
# If missing, the admin must run server/setup-secrets.sh first.
if [ ! -f $APP/server/.env ]; then
  echo "ERROR: server/.env not found. Run setup-secrets.sh first"
  exit 1
fi

# Install dependencies
cd $APP && npm ci
cd $APP/server && npm ci

# Build frontend — cd into dir so npm finds local node_modules/.bin/tsc
cd $APP && npm run build

# Restart server
pm2 restart adnd-backend
pm2 save

echo "Deploy complete"
