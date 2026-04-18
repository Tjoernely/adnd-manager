# AD&D Manager — Project Status

_Last updated: 2026-04-18_

---

## 1. Server Setup

| Property | Value |
|---|---|
| Provider | Oracle Cloud free-tier |
| IP | `158.180.63.20` |
| User | `ubuntu` |
| SSH key | `C:/DnD_manager_app/ssh-key-2026-03-11.key` |
| App root | `/var/www/adnd-manager` |
| Process manager | PM2, process name: `adnd-backend` |
| Web server | nginx — port 80, `/api/` → Express :3001, everything else → `server/public/` |
| Database | PostgreSQL (managed Oracle DB) |

### Deploy flows

**Frontend (requires build):**
```bat
# Local: build React → commit server/public/ → push
npm run build
git add server/public/ src/ && git commit -m "..." && git push
ssh -i C:/DnD_manager_app/ssh-key-2026-03-11.key ubuntu@158.180.63.20 \
  "cd /var/www/adnd-manager && git pull && pm2 restart adnd-backend"
```

**Backend only (no build needed):**
```bash
git add server/... && git commit -m "..." && git push
ssh -i C:/DnD_manager_app/ssh-key-2026-03-11.key ubuntu@158.180.63.20 \
  "cd /var/www/adnd-manager && git pull && pm2 restart adnd-backend"
```

**Webhook (automatic on `git push` to main):**
- GitHub webhook → `POST /api/webhook/deploy` → `deploy.sh` runs `git pull + pm2 restart`
- HMAC signature verified via `WEBHOOK_SECRET` in `server/.env`
- Lock file prevents concurrent deploys
- Frontend assets are NOT rebuilt by webhook (frontend requires manual build + commit of `server/public/`)

---

## 2. Feature Status

### ✅ Fully working

**Character Builder**
- All 10 tabs: Scores, Races, Classes, Kits, Traits, Proficiencies, Weapons, Thief, Mastery, Portrait
- Race/class restrictions (`RACE_CLASS_CAPS` in `classes.js`)
- Specialist wizard schools + extra opposition picker
- Sphere major/minor three-way toggle
- Fanaticism sub-options
- Social Status (2d6) with rank table
- Kit selection + display
- Nonweapon proficiencies (311 NWPs in DB with sp_cp_cost)
- Character save/load via session storage + DB

**Campaign & Party**
- Campaign creation, DM/player roles, campaign switching
- NPC management
- Party hub, party inventory, party equipment
- Party knowledge (shared notes)
- Quest tracker
- Encounter manager + saved encounters
- Random encounter tables

**Map System (core)**
- Map list, map viewer, POI system (DM-only + player-visible)
- POI drill-down (child map creation)
- Map image upload + DALL-E 3 generation (via OpenAI key)
- Map hierarchy (parent/child maps)
- Map visibility toggle (DM-only / shared with players)

**AI Integration**
- Claude (Anthropic) for map metadata, POIs, lore generation
- DALL-E 3 for map images (optional, requires OpenAI key)
- Gemini Image for sketch-to-map rendering (requires `GOOGLE_AI_API_KEY`)
- GPT-Image-1 as alternative sketch renderer (requires `OPENAI_API_KEY`)

**Terrain Sketch Editor**
- 32×32 grid tile painter
- 9 biome categories with all tile variants (28 unique tiles in `tiles_64/`)
- Collapsible category palette with 48×48px tile chips
- River + road overlay drawing
- Brush sizes: 1×1, 3×3, 5×5
- Canvas zoom (Ctrl+scroll) + pan
- Smart coast orientation (water edge faces nearest ocean neighbor)
- Seeded per-cell rotation for natural variation
- Fill empty cells: nearest-neighbor or flood-fill
- Sketch → Gemini/GPT-Image generation (async job with polling)
- Generated image attached to existing map record

**Prompt Builder (server-side)**
- 32×32 ASCII terrain grid sent to AI renderer
- `buildMustKeepFacts()` — 4 general algorithms (max 8 facts):
  1. Dominant edges (≥60% of edge band → "render along FULL border")
  2. Large connected components via BFS flood-fill (>50 cells)
  3. Isolated small features (3-14 cell components)
  4. Interesting terrain adjacencies (forest/coast, mountains/swamp, etc.)
- Terrain ID guide (distinguishes swamp vs forest vs mountains for Gemini)
- Freedom modes: strict / balanced / creative

**Database Reference Data**
- 4,400 spells
- 5,725 magical items
- 3,781 monsters
- 311 nonweapon proficiencies (with sp_cp_cost)
- 137 kits
- Weapons catalog + armor catalog

---

### 🔶 Partially implemented / needs verification

**sketchSpec.cells persistence**
- Three-layer fix has been deployed but not yet confirmed working:
  1. `PUT /api/maps/:id/sketch` endpoint (jsonb_set, bypasses enrichMapData)
  2. Belt-and-suspenders in `PUT /api/maps/:id` — re-patches via jsonb_set if body has sketch cells
  3. Explicit `PUT /sketch` call in `MapManager.handleSketchGenerate` before `api.updateMap`
- DB has `has_sketch=false` for maps created before fix — historical data not backfilled
- **Next step**: generate one map from sketch and check DB with `SELECT data->'sketch'->'cells' FROM maps WHERE id=X`

**Map Generator (MapGenerator.jsx) from sketch**
- Sketch → image → MapGenerator form → Claude AI → new map record flow works
- sketchSpec persistence to new maps: same three-layer fix above
- **Status: put on hold by user** — will revisit later

---

### ⏸ On hold / not started

**Map Generator general improvements**
- User has paused work on this area

**Weapon proficiencies in DB**
- Weapon prof data exists in `src/data/` but not yet imported to PostgreSQL
- Currently read from static JS files client-side

**Seamless tile variants**
- Current tiles show visible seams at biome boundaries
- Plan: create edge/transition tile variants
- Status: not started

**stat limits UI validation**
- `statLimits` per race exists in `races.js`
- Not yet used for validation in ScoresTab
- Status: not started

---

## 3. Known Bugs & Problems

| # | Severity | Description | Status |
|---|---|---|---|
| 1 | High | `sketchSpec.cells` not confirmed saved to DB — three-layer fix deployed, needs one test | Needs verification |
| 2 | Low | `auto-migrate` errors for monsters/items table (ownership) — cosmetic, does not affect app | Ignored (DB permissions) |
| 3 | Low | Gemini sometimes renders mountains only in top corner even when they span full eastern edge | Partially mitigated by dominant-edge fact in promptBuilder |
| 4 | Low | Swamp can be rendered as forest by Gemini | Mitigated by TERRAIN_ID_GUIDE in prompt |

---

## 4. Architecture Decisions

### Tile-based Sketch Editor
- SVG `<image>` elements for rendering (not `<canvas>`) — canvas had blank display issues
- Each cell: `{ x, y, biome, tileKey, relief? }` — tileKey stored explicitly so renderer uses exact tile
- 32×32 grid = 1024 max cells, ~50–100KB JSON
- `seededRandom(x*31+y)` — deterministic rotation per cell (same sketch always renders same)
- coast_flat: smart rotation via 4-directional neighbor scan (water edge faces ocean)
- Tiles stored in `tiles_64/` locally, served from `server/public/tiles/` in production

### SketchSpec Data Model
```javascript
{
  grid_size: 32, scope: 'region',
  cells: [{ x, y, biome, tileKey, relief? }],
  overlays: [{ type: 'river'|'road', points: [{x,y},...] }],
  modifiers: [],
  climate?: string, scale?: string,
  ai_freedom: 'balanced'|'strict'|'creative',
  lore_mode: boolean, user_prompt?: string
}
```
- Stored in `maps.data->sketch` (JSONB)
- `PUT /api/maps/:id/sketch` patches only this key via `jsonb_set` — safe, no enrichMapData side effects

### Gemini Image Renderer
- Model: `gemini-2.5-flash-image` (Gemini Image Generation via `@google/genai`)
- Input: base64 PNG of sketch (rendered client-side by `sketchToPng.ts`)
- Prompt: base prompt + terrain grid + must-keep facts + connectors + freedom mode
- Output: PNG saved to `server/public/uploads/maps/`
- Async job pattern: POST returns `{jobId}` immediately, client polls `/sketch-job/:jobId`
- Jobs expire after 30 minutes (in-memory store, cleared on restart)

### GPT-Image-1 Renderer (alternative)
- Uses OpenAI Responses API with `gpt-4o` + image generation tool
- Same async job pattern as Gemini
- Requires `OPENAI_API_KEY` in `server/.env`

### enrichMapData (server-side)
- Runs on every `POST /` and `PUT /:id` for maps
- Derives `scope`, `context`, `tags`, `settlement` from `generated_params`
- If no `generated_params` → returns data unchanged (stub maps are safe)
- `PUT /:id/sketch` bypasses this entirely (direct jsonb_set)

### Body Parser Limit
- `express.json({ limit: '50mb' })` — needed for 1024-cell sketch + base64 PNG in same request

---

## 5. Next Priorities

These are suggested based on current state — confirm with user before starting:

1. **Verify sketch cells persistence** — generate one sketch map, query DB, confirm `cells.length > 0`
2. **Weapon proficiencies in DB** — import from `src/data/` to PostgreSQL, update `/api/proficiencies`
3. **Seamless tile transitions** — edge tiles for biome boundaries (coast→plains, forest→plains, etc.)
4. **stat limits validation in ScoresTab** — use `statLimits` from `races.js` to warn/block invalid scores
5. **Resume Map Generator improvements** — when user is ready

---

## 6. Environment Variables (server/.env)

| Key | Purpose | Required for |
|---|---|---|
| `DB_*` | PostgreSQL connection | Everything |
| `JWT_SECRET` | Auth tokens | Everything |
| `ANTHROPIC_API_KEY` | Claude AI (map lore, POIs) | Map generator |
| `OPENAI_API_KEY` | DALL-E 3 + GPT-Image-1 | Map images |
| `GOOGLE_AI_API_KEY` | Gemini image generation | Sketch-to-map |
| `WEBHOOK_SECRET` | GitHub webhook HMAC | Auto-deploy |
| `PORT` | Express port (default 3000 local, 3001 prod) | Backend |
