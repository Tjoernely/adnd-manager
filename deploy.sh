#!/bin/bash
set -e

cd /var/www/adnd-manager
git fetch origin
git reset --hard origin/main

# Recreate ecosystem config if missing (deleted by git reset)
cat > /var/www/adnd-manager/ecosystem.config.cjs << 'ECOEOF'
module.exports = {
  apps: [{
    name: 'adnd-backend',
    script: './server/index.js',
    cwd: '/var/www/adnd-manager',
    env: {
      NODE_ENV: 'production',
      PORT: '3001',
      DB_HOST: 'localhost',
      DB_PORT: '5432',
      DB_NAME: 'adnddb',
      DB_USER: 'adnduser',
      DB_PASSWORD: 'ADTjoernely53',
      JWT_SECRET: 'DungeonMaster2026!FireballOfDoom#42xQzPrk'
    },
    watch: false,
    max_restarts: 5,
    restart_delay: 3000
  }]
};
ECOEOF

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
