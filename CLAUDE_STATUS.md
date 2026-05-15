# AD&D Manager — Project Status

_Last updated: 2026-05-15_

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
- Claude Haiku 4.5 for monster tag classification (one-shot, all 3781 monsters classified ~$3-4)

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

**Combat Manager Extensions (v1, 2026-05-06)**
- Inline 2E statblock in CombatantCard (lazy-loaded from full monster record)
- Conditions system — 28 conditions in `conditions.json` (Charmed, Stunned, Paralyzed, etc.) with duration tracking, apply/tick/remove
- Save-roll buttons (DPP/RSW/PP/BW/Spell) using PHB tables in `savingThrows.json`
- Per-round initiative reroll (1d10 + modifier, low-goes-first)
- Files: `src/rulesets/{conditions,savingThrows}.json`, `src/rules-engine/combat/{types,conditions,savingThrows,initiative,index}.ts`, `src/components/Encounters/{InlineStatblock,ConditionBadges,ConditionPicker,SaveButtons,CombatantCard,RoundControls}.tsx`

**Spell Auto-linking + Custom Abilities (v2, 2026-05-06)**
- `parseAbilities.ts` scans ability text against `knownSpells.json` (top 200+ common 2E spells)
- Spell matches wrapped in clickable `SpellLink` → opens `SpellModal` with full spell description
- DM can add per-combatant custom abilities via `CustomAbilityEditor`
- Bug fix: short values like "Magic" or "See below" no longer hidden — render as hint banner
- Files: `src/components/Encounters/{SpellModal,SpellLink,AbilityText,CustomAbilityEditor}.tsx`, `src/rules-engine/monsters/parseAbilities.ts`, `src/rulesets/knownSpells.json`

**Lazy-load Full Monster (v3, 2026-05-07)**
- `monsterCache.ts` — global cache + inflight Map so 7 Beholders in one encounter trigger 1 fetch
- `useFullMonster.ts` hook returning `{ monster, isLoading }`
- Fixes v2 issue where saved combatants only carry sparse stats (ac, thac0, attacks, damage, max_hp, monster_id, monster_name)
- Files: `src/rules-engine/monsters/monsterCache.ts`, `src/components/Encounters/useFullMonster.ts`

**Add to Encounter Button (v4, 2026-05-07)**
- Library card + monster detail modal both have "Add to Encounter" button
- Modal with Existing/New tabs + count selector
- Added new backend route `POST /api/saved-encounters/:id/creatures` (mirrors existing creature-update middleware)
- Files: `backend/add-creature-route.js`, `src/api/encounterApi.ts`, `src/components/Encounters/{AddToEncounterModal,AddToEncounterButton}.tsx`

**Monster Tag Classification (v5, 2026-05-07)**
- All 3781 monsters classified into 23 primary + 60 subtype + 16 modifier tags
- Heuristic auto-tags from structured fields first (alignment, intelligence, MR, regeneration), then Haiku 4.5 for the rest
- Verified samples: Beholder → `[aberration, beholder-kin, evil, flying, intelligent, lawful]`, Lich → `[evil, intelligent, lich, magic-resistant, spellcaster, undead]`, Zombie Plant → `[plant, mindless]` (correctly NOT undead)
- Files: `backend/data/tag-vocabulary.json`, `backend/scripts/classify-monsters.js`, `backend/routes/monster-tags.js`
- npm scripts: `classify-monsters`, `classify-monsters:dry`, `classify-monsters:force`

**Tag Filter Panel — Monster Library (v6, 2026-05-13)**
- Sidebar with Quick filters (12 chips), per-category AND/OR (Primary OR / Modifier AND / Subtype OR defaults), live counts on every chip
- Free-text search across name + tags + alignment (multi-word AND)
- Size/Frequency/Habitat structured filters (always OR within each)
- Custom search modal for finding tags across all 102 tags
- Selected sticky bar with × remove + clear-all
- sessionStorage per panel: `adnd_filter_library`, `adnd_filter_generator`
- 30+ Vitest unit tests including 4000-monster perf test under 50ms
- Files: `src/rulesets/{filterConfig,tag-vocabulary}.json`, `src/components/Encounters/{filterTypes,useFilterState}.ts`, `src/components/Encounters/{TagFilterPanel.tsx, TagFilterPanel.module.css}`, `src/rules-engine/monsters/{filterEngine,filterEngine.test}.ts`

**Database Reference Data**
- 4,400 spells
- 5,725 magical items
- 3,781 monsters (with tags, classified May 2026)
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

**Tag Filter Panel — Encounter Builder (v6 Generator side)**
- Filter panel works in Library, FREEZES the browser in Encounter Builder (see bug #5 below)
- Same component, same data — bug is in EncounterBuilder integration, not the panel itself

**Custom XP Range (v7, 2026-05-14)**
- "Custom XP range" toggle under Difficulty buttons in Encounter Builder
- Min/Max XP inputs, sessionStorage-persisted (`adnd_custom_xp_range`)
- "Target: 2,000–5,000 XP (medium)" indicator always visible
- Generator should use range instead of Difficulty thresholds when active; "Couldn't reach target — closest was X XP" warning when unsatisfiable
- **Status: deployed but NOT VERIFIED — freeze bug intervened before testing**
- Files: `src/components/Encounters/{xpThresholds,useXpRangeState}.ts`, `src/components/Encounters/XpRangePanel.tsx`

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

**Possible v8+ encounter features (deferred)**
- Theme presets ("Undead crypt", "Goblin ambush" → combine tag filters)
- Saved filter presets per campaign
- Backend filter endpoint (currently 100% client-side, fine for 3781 monsters)
- Mobile-responsive collapsible sidebar

**ChatGPT-suggested encounter features explicitly NOT pursued (not 2E-compatible)**
- CR ranges — 2E uses HD + XP, not CR
- Legendary / Lair actions — 5e only
- Source filter (Volo's, Mordenkainen, Fizban's) — 5e sourcebooks
- Monstrosity type — 5e term
- Damage type + condition tags — would require re-classification with bigger vocab + cost

---

## 3. Known Bugs & Problems

| # | Severity | Description | Status |
|---|---|---|---|
| 1 | High | `sketchSpec.cells` not confirmed saved to DB — three-layer fix deployed, needs one test | Needs verification |
| 2 | Low | `auto-migrate` errors for monsters/items table (ownership) — cosmetic, does not affect app | Ignored (DB permissions) |
| 3 | Low | Gemini sometimes renders mountains only in top corner even when they span full eastern edge | Partially mitigated by dominant-edge fact in promptBuilder |
| 4 | Low | Swamp can be rendered as forest by Gemini | Mitigated by TERRAIN_ID_GUIDE in prompt |
| 5 | **🔥 Critical** | **Encounter Builder freezes browser with React error #520 (infinite render loop)** | **Under investigation — see below** |

### Bug #5 — Encounter Builder freeze (active)

**Symptom:** Opening Encounter Builder tab triggers 10,000+ React error #520 ("Maximum update depth exceeded") in <1s, browser becomes unresponsive. Library uses same `TagFilterPanel` component and does NOT freeze.

**Fix attempts deployed (didn't resolve):**

1. **Commit `ee2e8c5` — perf angle:**
   - `useMemo` → `useEffect` for `onFilteredChange(filtered)` propagate-up
   - Precomputed projectedCounts Map (per-chip render becomes O(1) lookup)
   - `React.memo` wrapper around export
   - Result: build clean, 32/32 tests pass, still freezes

2. **Commit `34da522` — render-loop defensive layers:**
   - `onFilteredChangeRef` — stash callback in ref so effect doesn't list it as dep
   - Content-equality gate — compare filtered list by length + first/last id, skip when content unchanged
   - `monstersStable` ref — keep previous monsters ref when length + first/last id match
   - Result: build clean, 32/32 tests pass, still freezes

**Current diagnosis:** Library works = loop is not in panel itself. Must be in EncounterBuilder.tsx integration or a bidirectional flow that survives the defensive fixes.

**Next diagnostic steps (sent to Claude Code):**
- **TRIN 1:** Decode actual #520 message (build with `vite build --mode development` or grep `node_modules/react-dom/cjs/react-dom.production.min.js | grep '"520[^"]*"'`)
- **TRIN 2:** Binary search — comment out `<TagFilterPanel/>` in EncounterBuilder.tsx, build, deploy. If still freezes → loop is in EncounterBuilder itself. If not → panel integration on EncounterBuilder side.
- **TRIN 3:** Critical read of EncounterBuilder.tsx — look for useEffect depending on `filteredPool` setting state that affects `monsters`/`onFilteredChange` (circular), render-side state updates, JSON.stringify in dep arrays
- **TRIN 4:** Render counters in both components if 1-3 reveal nothing

Stop and report after TRIN 1+2 before further changes.

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

### Monster Tag Classification
- **Vocabulary:** 102 tags total (23 primary + 60 subtype + 16 modifier) in `backend/data/tag-vocabulary.json`
- Mirrored to `src/rulesets/tag-vocabulary.json` for clean frontend Vite-bundling (avoids cross-folder imports)
- **Schema decision:** `monsters.tags = text[]` (Postgres native array, NOT jsonb)
  - GIN-indexable, use `cardinality()` and `unnest()` (NOT jsonb functions)
  - pg driver auto-converts JS array → text[] in INSERT/UPDATE
  - The `001-tags-to-jsonb.sql` migration file is NOT used — text[] was the right shape
- **Two-pass classification:**
  1. Heuristic auto-tags from structured fields (free, instant): alignment, intelligence, MR, regeneration
  2. LLM (Haiku 4.5) for everything else: structured prompt returning validated JSON, costs ~$1/1000 monsters
- Reclassify all: `npm run classify-monsters:force` (~$3-4 for full 3781)

### Encounter Filter Engine (v6)
- **Pure functions in `src/rules-engine/monsters/filterEngine.ts`** — no React deps, fully testable
- `filterMonsters(state, monsters)` returns matched subset
- `projectedCount(state, monsters, kind, value)` answers "what would count be if I added this filter?"
- Per-category AND/OR logic: Primary OR (defaults), Modifier AND, Subtype OR
- Size/Frequency/Habitat: always OR within each
- Free-text search: name + tags + alignment, multi-word AND across whitespace tokens
- Performance: 4000 monsters filtered <50ms (unit-tested)
- Habitat list derived from data at runtime via `extractHabitats(monsters)` — no hardcoded list

### Encounter XP Budget (v7)
- Generator is **100% client-side** — only `GET /api/monsters`, no backend changes for encounter logic
- XP thresholds reverse-engineered from UI footer ("Easy < 2,000 · Medium < 5,000 · Hard < 10,000" at partySize=4, level=5)
- Scales linearly with `(partySize × partyLevel) / (4 × 5)` for other party shapes
- Defined in `src/components/Encounters/xpThresholds.ts` — single source of truth, can be replaced/wrapped by existing generator function if one exists

### API Quirks (encounter system)
- `GET /api/saved-encounters?campaign_id=X` (list) → JSON ✓
- `GET /api/saved-encounters/:id` (singular) → returns SPA HTML, NOT JSON ✗ (use list + find by id)
- `PUT /api/saved-encounters/:id` → updates metadata only, IGNORES `creatures` array silently
- `PUT /api/saved-encounters/:encId/creatures/:crId` → updates one creature
- `POST /api/saved-encounters/:id/creatures` → adds a creature (v4 added)
- `DELETE /api/saved-encounters/:id` → cascades creatures
- `PUT /api/monsters/:id` → works, accepts partial updates including `tags: [...]`

### Monster Data Sparsity (discovered during v2 audit)
- ~30% of monsters have rich `description` (1000-13000 chars wiki-formatted)
- ~70% have no description (skeleton entries from incomplete wiki scrape)
- 69% lack `special_attacks`, 72% lack `special_defenses`, 98% lack `magic_resistance`
- 100% lack `save_as` (not populated by scraper)
- **Implication:** Saved encounter combatants only carry sparse stats — full monster must be lazy-loaded from `/api/monsters/:id` for stat-block display (handled by v3 `monsterCache.ts`)

### State Persistence Convention
- localStorage: `dnd_token` (JWT, survives browser restart)
- sessionStorage (per-tab):
  - `adnd_campaign` — active campaign id
  - `adnd_filter_<storageKey>` — filter panel state (e.g. `adnd_filter_library`, `adnd_filter_generator`)
  - `adnd_custom_xp_range` — Custom XP Range panel state

---

## 5. Next Priorities

These are suggested based on current state — confirm with user before starting:

1. **🔥 Fix Encounter Builder freeze (bug #5)** — TRIN 1+2 first (decode #520, binary search), then narrow from there. Stop and report between trins.
2. **Verify v7 Custom XP Range** — once freeze is fixed, test the deployed but unverified feature
3. **Verify sketch cells persistence** — generate one sketch map, query DB, confirm `cells.length > 0`
4. **Weapon proficiencies in DB** — import from `src/data/` to PostgreSQL, update `/api/proficiencies`
5. **Seamless tile transitions** — edge tiles for biome boundaries (coast→plains, forest→plains, etc.)
6. **stat limits validation in ScoresTab** — use `statLimits` from `races.js` to warn/block invalid scores
7. **Resume Map Generator improvements** — when user is ready
8. **Consider v8 encounter features** — theme presets, saved filter presets per campaign (only after freeze is fixed and v7 verified)

---

## 6. Environment Variables (server/.env)

| Key | Purpose | Required for |
|---|---|---|
| `DB_*` | PostgreSQL connection | Everything |
| `JWT_SECRET` | Auth tokens | Everything |
| `ANTHROPIC_API_KEY` | Claude AI (map lore, POIs, monster tag classification) | Map generator + tag classifier |
| `OPENAI_API_KEY` | DALL-E 3 + GPT-Image-1 | Map images |
| `GOOGLE_AI_API_KEY` | Gemini image generation | Sketch-to-map |
| `WEBHOOK_SECRET` | GitHub webhook HMAC | Auto-deploy |
| `PORT` | Express port (default 3000 local, 3001 prod) | Backend |
