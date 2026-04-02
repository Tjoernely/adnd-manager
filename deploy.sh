#!/bin/bash
# Deploy script — runs ON THE SERVER (called via SSH or webhook).
# Frontend is pre-built locally and committed to git (server/public/).
# Server NEVER runs npm run build — saves ~500 MB RAM on 1 GB instance.
set -e

APP=/var/www/adnd-manager

cd $APP
git fetch origin
git reset --hard origin/main

if [ ! -f $APP/server/.env ]; then
  echo "ERROR: server/.env not found"
  exit 1
fi

# Install server-side dependencies only (no frontend build)
npm --prefix $APP/server ci --omit=dev

pm2 restart adnd-backend
pm2 save

echo "Deploy complete"
