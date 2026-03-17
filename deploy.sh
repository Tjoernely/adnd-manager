#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# deploy.sh  –  Kør dette script på din Oracle Ubuntu VM
# Hvad det gør:
#   1. Installerer Node.js 20 + npm + pm2
#   2. Henter seneste kode fra GitHub
#   3. Installerer dependencies (frontend + backend)
#   4. Bygger React frontend ind i server/public/
#   5. Starter/genstarter serveren med pm2 på port 3000
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="$HOME/dnd-manager"
REPO="https://github.com/Tjoernely/adnd-manager.git"

echo "──────────────────────────────────────────"
echo " AD&D Manager – Deploy"
echo "──────────────────────────────────────────"

# ── 1. Node.js 20 (spring over hvis allerede installeret) ──────────────────
if ! command -v node &>/dev/null; then
  echo "→ Installerer Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "✓ Node $(node -v) allerede installeret"
fi

# ── 2. PM2 ────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
  echo "→ Installerer pm2..."
  sudo npm install -g pm2
else
  echo "✓ PM2 allerede installeret"
fi

# ── 3. Klon eller opdater repo ─────────────────────────────────────────────
if [ -d "$APP_DIR/.git" ]; then
  echo "→ Henter seneste kode..."
  cd "$APP_DIR"
  # Remove npm-generated files that would block git pull
  rm -f "$APP_DIR/server/package-lock.json"
  git pull
else
  echo "→ Kloner repository..."
  git clone "$REPO" "$APP_DIR"
  cd "$APP_DIR"
fi

# ── 4. Installer frontend dependencies & byg ──────────────────────────────
echo "→ Installerer frontend dependencies..."
npm install

echo "→ Bygger React app..."
npm run build

# ── 5. Installer backend dependencies ─────────────────────────────────────
echo "→ Installerer backend dependencies..."
cd "$APP_DIR/server"
npm install

# ── 6. Start / genstart med PM2 ───────────────────────────────────────────
echo "→ Starter server med PM2..."
cd "$APP_DIR/server"

if pm2 describe dnd-manager &>/dev/null; then
  pm2 restart dnd-manager
else
  pm2 start index.js --name dnd-manager
fi

pm2 save
pm2 startup | tail -1 | sudo bash || true   # auto-start ved reboot

echo ""
echo "✅ Deploy færdig!"
echo "   App kører på http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "   Nyttige kommandoer:"
echo "   pm2 logs dnd-manager   – se server logs"
echo "   pm2 status             – se status"
echo "   pm2 restart dnd-manager – genstart"
