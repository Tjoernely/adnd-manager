#!/bin/bash
# Deploy script — runs ON THE SERVER (called via SSH or webhook).
# Builds frontend on server so bundle hash always matches index.html.
set -e

APP=/var/www/adnd-manager

cd $APP

echo "=== Deploy started ==="

# 1. Pull latest code
git fetch origin main
git reset --hard origin/main

if [ ! -f $APP/server/.env ]; then
  echo "ERROR: server/.env not found"
  exit 1
fi

# 2. Install frontend deps and build
npm install
npm run build

# 3. Copy built assets to server public dir
cp -r dist/* server/public/

# 4. Install server deps (clean install avoids ENOTEMPTY from concurrent activity)
rm -rf $APP/server/node_modules
npm install --prefix server

# 5. Restart PM2 with --update-env so new env-vars are loaded
pm2 restart adnd-backend --update-env
pm2 save

# 6. Wait for server to be healthy
sleep 2
curl -s -o /dev/null -w "Server status: %{http_code}\n" http://localhost:3001/api/maps

echo "=== Deploy complete. Bundle: $(ls dist/assets/index-*.js 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'unknown') ==="
