#!/bin/bash
# Deploy script — runs ON THE SERVER (called via SSH or webhook).
# Frontend is pre-built locally (deploy-frontend.bat) and uploaded via scp.
# Server NEVER runs npm run build — OOM on Oracle free-tier 1 GB instance.
set -e

APP=/var/www/adnd-manager

cd $APP

echo "=== Deploy started ==="

# 1. Pull latest code (server code + any committed assets)
git fetch origin main
git reset --hard origin/main

if [ ! -f $APP/server/.env ]; then
  echo "ERROR: server/.env not found"
  exit 1
fi

# 2. Install server deps (clean to avoid ENOTEMPTY from concurrent activity)
rm -rf $APP/server/node_modules
npm install --prefix server

# 3. Restart PM2 with --update-env so new env-vars are loaded
pm2 restart adnd-backend --update-env
pm2 save

echo "=== Deploy complete ==="
