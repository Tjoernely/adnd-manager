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

# Ensure nginx config is correct
sudo tee /etc/nginx/sites-enabled/adnd-manager > /dev/null << 'NGINXEOF'
server {
  listen 80;
  location /api/ {
    proxy_pass http://localhost:3001;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_read_timeout 120s;
    proxy_connect_timeout 30s;
    proxy_send_timeout 120s;
  }
  location / {
    root /var/server/public;
    try_files $uri $uri/ /index.html;
  }
}
NGINXEOF
sudo nginx -t && sudo nginx -s reload

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
