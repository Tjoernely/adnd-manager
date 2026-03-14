#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup-db.sh
# Sets up PostgreSQL on an Oracle Ubuntu 22.04 server for AD&D Manager.
#
# Run as root or with sudo on the Oracle Cloud / Ubuntu server:
#   sudo bash setup-db.sh
#
# After running, edit /var/www/adnd-manager/server/.env with the
# DB_PASSWORD you chose below.
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
DB_NAME="adnd_manager"
DB_USER="adnd"
# Change this before running!
DB_PASSWORD="${ADND_DB_PASSWORD:-change_me_in_env}"

echo "=== AD&D Manager — PostgreSQL Setup ==="
echo "  DB name : $DB_NAME"
echo "  DB user : $DB_USER"
echo ""

# ── 1. Install PostgreSQL ─────────────────────────────────────────────────────
echo "[1/5] Installing PostgreSQL …"
apt-get update -qq
apt-get install -y postgresql postgresql-contrib

# Ensure service is running and enabled
systemctl enable postgresql
systemctl start postgresql

# ── 2. Create database + user ─────────────────────────────────────────────────
echo "[2/5] Creating database and user …"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
-- Create user if not exists
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$DB_USER') THEN
    CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER ROLE $DB_USER WITH PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;

-- Create database if not exists
SELECT 'CREATE DATABASE $DB_NAME OWNER $DB_USER'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$DB_NAME')\gexec

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;
SQL

echo "    ✓ Database '$DB_NAME' and user '$DB_USER' ready."

# ── 3. Configure pg_hba for local password auth ───────────────────────────────
echo "[3/5] Configuring pg_hba.conf …"
PG_VERSION=$(psql --version | grep -oP '\d+' | head -1)
PG_HBA="/etc/postgresql/${PG_VERSION}/main/pg_hba.conf"

# Ensure the adnd user can authenticate with md5 from localhost
if ! grep -q "adnd" "$PG_HBA"; then
  echo "host    $DB_NAME    $DB_USER    127.0.0.1/32    md5" >> "$PG_HBA"
  echo "host    $DB_NAME    $DB_USER    ::1/128         md5" >> "$PG_HBA"
  systemctl reload postgresql
  echo "    ✓ pg_hba.conf updated."
else
  echo "    ✓ pg_hba.conf already has entry for $DB_USER."
fi

# ── 4. Run schema migration ───────────────────────────────────────────────────
echo "[4/5] Running schema migration …"
APP_DIR="${APP_DIR:-/var/www/adnd-manager/server}"

if [ -f "$APP_DIR/migrate.js" ]; then
  cd "$APP_DIR"
  node migrate.js
  echo "    ✓ Schema applied."
else
  echo "    ⚠ $APP_DIR/migrate.js not found — run 'node migrate.js' manually after deploy."
fi

# ── 5. Create / update .env file hint ────────────────────────────────────────
echo "[5/5] Checking .env …"
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ] && [ -f "$APP_DIR/.env.example" ]; then
  cp "$APP_DIR/.env.example" "$ENV_FILE"
  # Fill in the values we know
  sed -i "s/^DB_HOST=.*/DB_HOST=localhost/"   "$ENV_FILE"
  sed -i "s/^DB_PORT=.*/DB_PORT=5432/"        "$ENV_FILE"
  sed -i "s/^DB_NAME=.*/DB_NAME=$DB_NAME/"    "$ENV_FILE"
  sed -i "s/^DB_USER=.*/DB_USER=$DB_USER/"    "$ENV_FILE"
  sed -i "s/^DB_PASSWORD=.*/DB_PASSWORD=$DB_PASSWORD/" "$ENV_FILE"
  echo "    ✓ .env created from template."
  echo ""
  echo "  ⚠ IMPORTANT: Edit $ENV_FILE and set:"
  echo "     JWT_SECRET=<a long random string>"
  echo "     APP_URL=https://yourdomain.com"
else
  echo "    ✓ .env already exists — update it manually if needed."
fi

echo ""
echo "=== Setup complete! ==="
echo ""
echo "Next steps:"
echo "  1. cd $APP_DIR && npm install"
echo "  2. Edit .env (JWT_SECRET, APP_URL)"
echo "  3. node migrate.js   (if not run above)"
echo "  4. pm2 restart adnd-manager"
echo "  5. (optional) node scripts/import-spells.js"
