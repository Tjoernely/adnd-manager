#!/bin/bash
set -e

cd /var/www/adnd-manager
git fetch origin
git reset --hard origin/main

# ecosystem.config.cjs is NOT in git (credentials).
# If it already exists, leave it alone.
# If missing, the admin must run server/setup-secrets.sh first.
if [ ! -f /var/www/adnd-manager/ecosystem.config.cjs ]; then
  echo "ERROR: ecosystem.config.cjs is missing."
  echo "Run server/setup-secrets.sh once on the server to create it."
  exit 1
fi

npm install
cd server && npm install && cd ..
npm run build

# Restart backend
fuser -k 3001/tcp 2>/dev/null || true
sleep 1
pm2 delete adnd-backend 2>/dev/null || true
pm2 start /var/www/adnd-manager/ecosystem.config.cjs
pm2 save

# Copy build to nginx
sudo chown -R ubuntu:ubuntu /var/server/public/ 2>/dev/null || true
cp -r /var/www/adnd-manager/server/public/* /var/server/public/
echo "Deploy complete"
