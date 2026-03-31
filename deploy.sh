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

npm --prefix $APP ci
npm --prefix $APP/server ci
npm run --prefix $APP build

pm2 restart adnd-backend
pm2 save

echo "Deploy complete"
