#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  –  Run on the Oracle Ubuntu VM (as ubuntu user)
# What it does:
#   1. Install Node.js 20 + PM2 if missing
#   2. Clone repo to /var/www/adnd-manager, or pull latest
#   3. Install frontend + backend dependencies
#   4. Build React app → server/public/
#   5. Copy build to nginx public folder
#   6. Start/restart backend via ecosystem.config.js (single PM2 process)
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="/var/www/adnd-manager"
REPO="https://github.com/Tjoernely/adnd-manager.git"

echo "──────────────────────────────────────────"
echo " AD&D Manager – Deploy"
echo "──────────────────────────────────────────"

# ── 1. Node.js 20 ─────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  echo "→ Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "✓ Node $(node -v) already installed"
fi

# ── 2. PM2 ────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "→ Installing PM2..."
  sudo npm install -g pm2
else
  echo "✓ PM2 $(pm2 --version) already installed"
fi

# ── 3. Ensure /var/www/adnd-manager exists and is owned by this user ──────
sudo mkdir -p "$APP_DIR"
sudo chown -R "$USER":"$USER" "$APP_DIR"

# ── 4. Clone or pull repo ─────────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "→ Pulling latest code..."
  cd "$APP_DIR"
  git fetch --all
  git reset --hard origin/main
else
  echo "→ Cloning repository..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 5. Frontend dependencies + build ──────────────────────────────────────
echo "→ Installing frontend dependencies..."
cd "$APP_DIR"
npm install

echo "→ Building React app..."
npm run build

# Copy built assets to the nginx-served public folder
echo "→ Copying build to /var/server/public..."
sudo mkdir -p /var/server/public
sudo cp -r "$APP_DIR/server/public/." /var/server/public/
sudo chown -R www-data:www-data /var/server/public 2>/dev/null || true

# ── 6. Backend dependencies ───────────────────────────────────────────────
echo "→ Installing backend dependencies..."
cd "$APP_DIR/server"
npm install

# ── 7. PM2 — clean slate via ecosystem.config.js ─────────────────────────
echo "→ Restarting backend with PM2..."

# Tear down any old/conflicting processes
pm2 delete adnd-backend 2>/dev/null || true
pm2 delete dnd-manager  2>/dev/null || true

# Free the port if anything is still holding it
fuser -k 3001/tcp 2>/dev/null || true
sleep 1

# Start the backend using the ecosystem config (cwd, env, name all fixed)
cd "$APP_DIR"
pm2 start ecosystem.config.js

pm2 save
pm2 startup | tail -1 | sudo bash || true   # persist across reboots

echo ""
echo "✅ Deploy complete!"
echo "   Backend : port 3001 (PM2 name: adnd-backend)"
echo "   Frontend: served by nginx from /var/server/public"
echo "   App URL : http://$(hostname -I | awk '{print $1}')"
echo ""
echo "   Useful commands:"
echo "   pm2 logs adnd-backend    – live logs"
echo "   pm2 status               – process list"
echo "   pm2 restart adnd-backend – restart backend"
