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

# 2. Stop PM2 before touching node_modules to prevent crash-loop during install
pm2 stop adnd-backend 2>/dev/null || true

# 3. Install server deps (clean to avoid ENOTEMPTY from concurrent activity)
rm -rf $APP/server/node_modules
npm install --prefix server

# 4. Start PM2 with --update-env so new env-vars are loaded
pm2 start adnd-backend --update-env
pm2 save

echo "=== Deploy complete ==="
