# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Frontend dev server (port 5173, proxies /api to :3000)
npm run dev

# Build frontend → outputs to server/public/
npm run build

# Lint
npm run lint

# Start backend only
node server/index.js

# Deploy to production
cd /var/www/adnd-manager && git pull && npm ci && npm --prefix server ci && npm run build && pm2 restart adnd-backend
```

## Architecture

**Stack:** React 19 + Vite 7 frontend, Express.js + PostgreSQL backend (`pg` pool), JWT auth, PM2 + nginx in production.

**Dev proxy:** Vite proxies `/api/*` → `http://localhost:3000`. In production, nginx routes `/api/` to Express on port 3001; the built React SPA is served statically from `server/public/`.

**Backend entry:** `server/index.js` — mounts 20+ route files under `/api/*`, runs `auto-migrate.js` on startup (idempotent: `IF NOT EXISTS`), falls back to `server/public/index.html` for non-API routes.

**Database:** `server/db.js` exports a thin pool wrapper (`db.query`, `db.one`, `db.all`). Schema lives in `server/schema.sql`; incremental changes go in `server/auto-migrate.js`. Large reference datasets: 4 400 spells, 5 725 magical items, 3 781 monsters, 311 nonweapon proficiencies, 137 kits.

**Frontend state:** All character sheet state lives in `src/hooks/useCharacter.js` and is exported in its return object. `serializeCharacter()` / `loadCharacterState()` handle persistence (session storage). `src/App.jsx` is the top-level component: auth gate → campaign gate → header + tab router + modals.

**Game data files** (`src/data/`): static JS modules for classes, races, traits, kits, abilities, etc. used by character builder tabs in `src/components/tabs/`.

**AI integration:** `server/routes/ai.js` calls Anthropic API (requires `ANTHROPIC_API_KEY` in env). Frontend client at `src/api/aiClient.js`.

## Environment

Copy `server/.env.example` → `server/.env` and fill in:
- `DB_*` — PostgreSQL connection
- `JWT_SECRET`
- `ANTHROPIC_API_KEY`
- `PORT` (default 3000 locally, 3001 in production)

## Key API Endpoints

All require `/api/` prefix and JWT `Authorization: Bearer <token>` header.

```
/api/auth
/api/proficiencies?class=fighter
/api/kits?class=ranger
/api/kits/:canonical_id
/api/characters, /api/npcs, /api/spells, /api/monsters
/api/magical-items, /api/weapons-catalog, /api/armor-catalog
/api/maps, /api/party-hub, /api/party-inventory, /api/party-equipment
/api/character-equipment, /api/character-spells, /api/saved-encounters
/api/quests, /api/encounters, /api/loot, /api/party-knowledge, /api/ai
```

## Production Server

- Host: `ubuntu@158.180.63.20`, app root `/var/www/adnd-manager`
- PM2 process name: `adnd-backend`
- nginx: port 80, `/api/` → Express :3001, everything else → `server/public/`

## Preview / Verification

Do NOT start a local dev server or run preview verification after edits. All changes are deployed to the remote production server (`158.180.63.20`) — there is no local browser preview for this project. Skip the preview workflow silently on every turn.

## Known Outstanding Work

- Webhook-based deploy is fixed (detached spawn)
- sp_cp_cost updated for 311 NWPs
- Weapon proficiencies not yet imported to DB
