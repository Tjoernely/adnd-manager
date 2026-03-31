#!/bin/bash
set -e

APP=/var/www/adnd-manager

cd $APP
git fetch origin
git reset --hard origin/main

if [ ! -f $APP/server/.env ]; then
  echo "ERROR: server/.env not found"
  exit 1
fi

# Install dependencies
npm --prefix $APP ci
npm --prefix $APP/server ci

# Build — call tsc and vite directly via node_modules/.bin
cd $APP
node_modules/.bin/tsc -b
node_modules/.bin/vite build

pm2 restart adnd-backend
pm2 save

echo "Deploy complete"
