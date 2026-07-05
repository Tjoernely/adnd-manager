# AD&D Manager — Project Status

_Last updated: 2026-07-05_

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
| Domain | **`realmkeep.app` (+ www) → HTTPS live (2026-06-04)**, Let's Encrypt, auto-renew |
| Web server | nginx — **443 TLS** (`/api/` → Express :3001, else `server/public/`); **port 80 301-redirects to https**. Cert: `/etc/letsencrypt/live/realmkeep.app/`. |
| Database | PostgreSQL (managed Oracle DB) |

> **nginx custom config** (`/etc/nginx/sites-enabled/adnd-manager` — lives only
> on the server, not in the repo):
> - **`/api/ai/` timeout (2026-05-17):** dedicated `location /api/ai/` block with
>   `proxy_read_timeout 600s` / `proxy_send_timeout 600s` /
>   `proxy_connect_timeout 60s` + `proxy_buffering off`, so long AI quest
>   generations don't hit a gateway timeout. The general `/api/` block keeps
>   `proxy_read_timeout 180s`.
> - **`client_max_body_size 20M` (2026-05-19):** server-level — nginx default is
>   1M, which 413'd gpt-image-1 map PNG uploads (1–2.5 MB) to
>   `POST /api/maps/:id/image`. Matches the route's multer limit (20M).
> - Backups of pre-change configs: `…/adnd-manager.bak-20260517`,
>   `…/adnd-manager.bak-20260519`.

### Database backups (2026-06-30)
- **Daily `pg_dump`** via `scripts/backup-db.sh` (version-controlled in the repo)
  → ubuntu cron **`0 3 * * *`** on the instance (cron daemon active). It reads
  `DB_*` from `server/.env` (password passed via the `PGPASSWORD` env var —
  never hardcoded, never in argv), writes a gzipped timestamped plain-SQL dump to
  **`/var/backups/realmkeep/`**, and keeps the **7 most recent** (older pruned).
  Cron log: `/var/backups/realmkeep/backup.log`.
- The backup dir is **outside the repo AND the nginx web root** (`server/public`),
  so dumps are never web-served and never committed to git. Dir mode `700`,
  files `600`, owned by `ubuntu`.
- **Verified (2026-06-30):** a manual dump (~7.8 MB) restored cleanly into a temp
  DB (`realmkeep_restore_test`) — every row count matched prod (users 4,
  characters 5, campaigns 4, invites 1, quests 1, npcs 32; 33 public tables) —
  then the temp DB was dropped (prod `adnddb` untouched). Rotation tested
  separately (8 dummies → run → 7 kept, 2 oldest pruned). An untested backup
  isn't a backup; this one restores.
- **Re-verified (2026-07-05):** cron entry present + cron daemon active; the
  nightly 03:00 run had fired every day since setup (7 dumps on disk). A fresh
  manual dump was restored into a temp DB (`realmkeep_restore_test_20260705`,
  created via `sudo -u postgres` — the app DB user has no CREATEDB) and **all 33
  public tables row-count-matched prod exactly** (incl. spells 4400, magical_items
  5725, monsters 3781); temp DB dropped afterward, prod untouched. Rotation
  observed live: the manual run pruned the oldest dump, keeping exactly 7.
- ⚠ **Dumps live ONLY on the instance.** A copy **off the instance** (Oracle
  Object Storage, or a periodic `scp`/rsync download) is the next step for real
  disaster recovery — losing the instance currently loses the backups with it.

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
- ⚠ **Reliability:** observed intermittent non-delivery in May 2026 — several pushes did not auto-deploy and needed a manual `ssh … "git pull && pm2 restart adnd-backend"`. Always verify the server commit after a push; fall back to manual deploy if it lags. Worth investigating the webhook handler / GitHub delivery log.

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

**Portrait generation — gpt-image-1 (2026-06-04)**
- NPC + character portraits (`NPCManager.jsx`, `NPCGenerator.jsx`,
  `PortraitTab.jsx`) generate **browser-side on the user's own OpenAI key**
  (`localStorage.openai_api_key`) — not the owner's key, so no approval gate.
- Migrated dall-e-3 → **gpt-image-1** (`b214a69`) after OpenAI removed dall-e-3
  on 2026-05-12 (portraits had been failing). Shared helper
  `generateOpenAIImage(prompt, {size, apiKey})` in `src/api/aiClient.js`:
  `/v1/images/generations`, `model: 'gpt-image-1'`, no `style`/`response_format`/
  `quality`; returns a `data:image/png;base64,…` URL from the b64 response
  (permanent, unlike the old ~1h-expiry dall-e-3 URLs). End-to-end verified
  (HTTP 200, ~2.1 MB image). Data URLs are large (~1.5-3 MB): NPC
  `portraitHistory` capped at 3; PortraitTab localStorage history capped at 3
  with a quota-resilient writer.
- **NPC list omits portraits (perf, `a9a629b`).** `GET /api/npcs` (list) used to
  `SELECT *` + return the full `data` JSONB, so opening the NPC module pulled
  ~8 MB **per NPC**. `stripPortraitForList()` now drops `data.portrait` +
  `data.portraitHistory` from list rows and adds a `has_portrait` flag; the
  single-NPC `GET /:id` is unchanged. `NPCManager` fetches the full record
  (`api.getNpc`) only when opening a card that `has_portrait`; cards show
  🖼 / ⏳ / 🎭. Verified: list omits portrait + history (keeps other fields +
  `has_portrait`), single GET includes them.

**AI Feature-Gate — owner approval (2026-06-04)**
- The server-side AI routes run on the owner's shared `ANTHROPIC_API_KEY`, so
  they are **locked behind owner approval**. Everyone can register, log in, and
  use the free features; only `ai_approved` accounts can call the shared-key AI.
- Enforced **server-side** in `requireAiApproval` middleware (after `auth`) on
  `/api/ai/prompt`, `/api/ai/loot`, `/api/ai/generate`. Unapproved → `403
  { error: "ai_not_approved" }`. The middleware reads `ai_approved` **fresh from
  the DB** per call, so an SQL approval takes effect immediately — no re-login.
- **Not gated:** image / portrait generation (runs on the user's OWN OpenAI key,
  direct browser → api.openai.com) and `/api/maps/:id/image/from-url` (only
  persists an already-generated image). These stay on plain `auth`.
- Frontend gating is **UX only** (the server is the real gate): `isAiApproved()`
  reads the persisted user; Generate NPC / Quest / Encounter / Rumors
  (`GenerateButton`), Map generation (`MapGenerator`), and NPC text generation
  (`NPCGenerator`) disable + show "Awaiting approval for AI features" when
  unapproved. `callClaude` + `apiFetch` map a stray 403 to that friendly message.
- **Approval is via SQL for now** (no admin UI yet):
  `UPDATE users SET ai_approved=true WHERE email='…';`
- `is_admin` column (owner seeded true) backs the **global admin override** on
  character DM-approval/reassignment AND the **admin API** (`requireAdmin` +
  `/api/admin`, 2026-06-28); it is **not** wired to this AI gate. Admin *UI* still
  pending (backend only).
- Verified live (2026-06-04): unapproved account → 403 on all three AI routes,
  200 on free routes; flipping `ai_approved=true` opened the gate on the **same
  token** (200, no re-login); owner `jesper@olesen.nu` approved.
- **Approved accounts (2026-06-04):** `jesper@olesen.nu` (+ `is_admin`),
  `jarlehenssel`, `thogrizzly`, `runeilsted` — the 3 existing real players were
  approved by SQL after the gate shipped. All future registrations default to
  unapproved. (Note: `runeilsted`'s username is stored `Runeilsted` — match on
  email/id, not a lower-cased username, when approving.)

**Character DM-Approval — rule-breaker flow (2026-06-28)**
- House-rule-breaking characters now require DM sign-off. `characters.rule_breaker`
  + `characters.dm_approved` are **columns** (indexed by `idx_characters_ruleflags`
  on `(campaign_id, rule_breaker, dm_approved)`) so status is query-filterable;
  `rule_violations` (a short string list of what was broken, ≤20 items) lives in
  `character_data`. Derived **status** — `clean` (no break) / `pending` (break,
  not approved) / `approved` (break + DM-approved) — is added to every character
  response by `fmt()`.
- **Save logic** (`POST` / `PUT /api/characters`) persists `rule_breaker` +
  `rule_violations` from the payload (top-level `rule_breaker`, else fallback to
  the builder's `character_data.ruleBreaker`). Every save **forces
  `dm_approved=false`** — clients can never self-approve, and any edit to an
  approved rule-breaking character re-enters `pending` (DM must re-approve).
- **Approval endpoint** `PUT /api/characters/:id/approval { approved: bool }` —
  only the **campaign DM** (`campaign.dm_user_id`) or a **global admin**
  (`users.is_admin`, read fresh from the DB) may flip `dm_approved`. The owner /
  any player gets **403**. Roles are contextual (DM = owner of that campaign).
- Party list (`/party/:campaignId`) now surfaces `status` + `rule_violations` per
  character (kept out of `PARTY_HIDDEN`, so the DM + party can see who's pending).
- Backfill: existing rows with `character_data.ruleBreaker = true` were flipped to
  `rule_breaker = true` (idempotent).
- **Frontend (`bad49df`):**
  - **Persistence + badge** (`App.jsx`): the loaded character's backend `status`
    is hydrated into `savedStatus` on load/save; a player badge in the builder
    shows "⚠ Rule-Breaker — Awaiting DM approval" (red) / "✓ DM-approved
    (house rules)" (green) / nothing (clean). `effectiveStatus` = clean if
    `!ruleBreaker`, else `approved` only when the saved sheet is approved AND
    not dirty, else `pending` — so a pending char stays red across reload and any
    unsaved edit shows pending immediately. Editing/using is never blocked.
  - **Dirty-guard** (`App.jsx`): a baseline of the serialized sheet is captured on
    load/save; `saveCharacter` skips the network write when an existing sheet is
    unchanged, and the Save button disables when there are no unsaved changes —
    so opening (or a DM viewing) an approved character never triggers the
    server-side approval reset. (UI text stays English per project convention.)
  - **Honor button folded in** (`useCharacter.js`): the DISADV CP-cap "DM
    Approved — Proceed" box no longer self-approves; proceeding sets
    `ruleBreaker=true` (→ pending) and uses the standard "Enable Rule-Breaker &
    Proceed" treatment.
  - **DM approvals panel** (`CampaignDashboard.jsx`, DM-only): lists the
    campaign's rule-breaking characters (via `getPartyView`) with status pill +
    `rule_violations`; pending rows get **Approve**, approved rows **Revoke**,
    both calling `api.approveCharacter` (`PUT /:id/approval`). Renders nothing
    when there are no rule-breakers.
- Verified **backend** live (3 throwaway accounts, 20/20 checks): player saves
  rule-breaking char → pending; player (incl. owner) approval → 403; DM approve
  true/false toggles status; re-save after approval resets to pending;
  `dm_approved` in a save body is ignored; admin (non-DM) approval works; party
  list carries status + violations. Throwaways cleaned up (4 real accounts intact).
- Verified **frontend** live (browser, owner DM on a throwaway campaign): toggle
  Rule-Breaker → red badge; save → pending persists + Save shows "✓ Saved"
  disabled; **reload → still red**; DM dashboard panel shows the pending char +
  violations → Approve → green "Approved" + Revoke; player reload → green badge;
  **dashboard→builder open/close keeps approval**; a real edit → badge back to
  red + Save re-enables, save → DM panel back to "1 pending". Throwaway campaign +
  character deleted afterward (real `test` campaign + 4 users intact).

**Character ownership reassignment — DM-assignment (2026-06-28)**
- DMs can transfer a character to a different player. `PUT /api/characters/:id/owner
  { player_user_id }` sets `player_user_id`. **Server-enforced:** only the campaign
  DM (`campaign.dm_user_id`) or a global admin (`users.is_admin`) may call; a
  player — including the current owner — gets **403**. The target **must be a
  participant of the character's campaign** (the DM or a `campaign_members` row,
  checked via `campaignAccess`), else **400** — never an arbitrary user. Accepts a
  number or a numeric string (a `<select>` value).
- **Only `player_user_id` changes** — `rule_breaker` + `dm_approved` are untouched
  (orthogonal to the rule-breaker flow). The new owner can then edit via `PUT /:id`
  (its owner check is by `player_user_id`); the previous owner can no longer edit.
- **Party view** (`/party/:campaignId`) joins the owner (`owner_username` +
  `owner_email`); **PartyHub** shows `👤 <owner>` per character for the DM.
- **DM assignment UI (`3fddfaa`):** the dashboard's DM-only panel
  (`CampaignDashboard.jsx`, renamed Rule-Breaker Approvals → **Party Characters**)
  now lists EVERY campaign character with its owner (`👤`), an **Assign to player**
  picker (campaign members via `getCampaignMembers`, current owner excluded), and
  a confirm modal before transfer (warns when the DM is the current owner). It
  keeps the rule-breaker Approve/Revoke inline. Gated by `isDM` — players never
  see it. `api.assignCharacterOwner(id, player_user_id)` calls the endpoint, then
  the panel refetches.
- **Members-endpoint bug fixed (`f3b5df2`):** `GET /campaigns/:id/members`
  destructured `const [dm, ...players]`, which nested the player array — it
  returned `[dm, [p1,p2,…]]` instead of a flat `[dm, p1, p2, …]`. Surfaced by the
  assignment picker (a blank member entry). Changed to `const [dm, players]`.
  (Only consumer was this new panel.)
- **Edit-access nuance:** "previous owner can no longer edit" holds for a *player*
  former owner (`PUT /:id` → 403). A *DM* former owner keeps raw API edit (the
  `isDM` branch of `PUT /:id`), but has no UI path to a character they don't own
  (the builder lists only own characters), so the confirm modal's "you'll lose
  edit access" note is practically accurate from the DM's UI.
- Verified **backend** live (3 throwaway accounts + a non-member + an admin,
  17/17): DM assigns A→C; new owner C can edit, former owner A → 403; a player
  (incl. the owner) reassign → 403; non-member / nonexistent / non-integer → 400;
  admin (non-DM) reassign works; **approving then reassigning leaves status
  `approved`**; party list carries owner_username.
- Verified **frontend** live (DM=owner on a throwaway campaign + a throwaway
  member): DM builds a character, opens Party Characters, Assign to player →
  member picker → confirm (with the lose-edit-access warning) → **owner line
  flips `👤 jesper` → `👤 <member>`**; viewing the same dashboard as the player
  (token-swapped test account) shows **no Party Characters panel / no Assign
  button**. FK-safe cleanup (4 real accounts intact).

**Admin API + UI + account suspension (2026-06-28)**
- Minimal admin backend behind `auth` + **`requireAdmin`** (`is_admin` read FRESH
  from the DB per request — granting/revoking admin via SQL is immediate;
  non-admin → 403 `admin_required`; fails closed). Routes under **`/api/admin`**:
  - `GET /users` — id, username, email, created_at, ai_approved, is_admin,
    suspended. **Never** password_hash or other secrets.
  - `PUT /users/:id/approval { approved }` — set `ai_approved`.
  - `PUT /users/:id/suspend { suspended }` — set `suspended`.
- **Migration:** `users.suspended BOOLEAN NOT NULL DEFAULT false` (idempotent).
- **Immediate suspension:** rejected at **login** AND in the **auth middleware**
  (fresh per-request `SELECT suspended`, one PK lookup) — error code
  `account_suspended` — so a suspend bites mid-session, not just at next login.
  (Auth fails OPEN on a DB error so a transient blip can't lock everyone out.)
- **Self-protection (anti-lockout):** an admin can't suspend themselves
  (`cannot_suspend_self`), can't revoke their own `ai_approved`
  (`cannot_revoke_own_approval`), and can't suspend the last active admin
  (`cannot_suspend_last_admin`, defense-in-depth). There is **no is_admin
  mutation endpoint**, so admin rights change only via direct DB — which keeps
  "can't de-admin yourself" inherently true and the admin set stable.
- **Signup notification (dormant):** `server/lib/notify.js` `notifyNewSignup` —
  fire-and-forget on register, sends a Discord webhook ONLY if
  `DISCORD_WEBHOOK_URL` is set (it isn't yet), else a silent no-op; a webhook
  failure never breaks registration. Documented optional in `.env.example` (§6).
- **Admin UI (`7fee73e`):** `AdminScreen` overlay
  (`src/components/admin/AdminScreen.jsx`), opened from a **⚙ Admin** entry in the
  CampaignSelector + CampaignDashboard headers shown **only when `user.is_admin`**
  (the overlay also guards defensively; the server enforces regardless). A
  highlighted **"Awaiting Approval"** panel up top is the primary who's-waiting
  view (lists `!ai_approved && !suspended`), above a full user table (username,
  email, created, status badges Approved/Pending/Suspended + Admin chip). Per-row
  **Approve/Revoke** + **Suspend/Reactivate**, reconciled from the server
  response. **Self-guards:** Suspend + Revoke are disabled on your own row.
- **`account_suspended` handling:** `apiFetch` catches a 403 `account_suspended`
  mid-session, clears creds, and reuses the **`auth:expired`** mechanic with
  `detail.reason='suspended'`; `useAuth` then logs the user out cleanly and shows
  "Your account has been suspended." on the login screen (not a generic error).
- Verified **backend** live (3 throwaway accounts, 20/20): non-admin → 403 on all
  3 routes; admin lists (no password_hash) / approves / suspends; suspended user
  → 403 `account_suspended` at login AND mid-session (`/me`), reversible on
  unsuspend; admin can't suspend self / revoke own approval (403); no de-admin
  route (404); fresh `is_admin` confirmed (admin token predated the SQL flip).
- Verified **frontend** live (admin jesper, 1 throwaway): the table shows all 4
  real accounts + the throwaway with status; Approve/Revoke + Suspend/Reactivate
  cycle works; jesper's own Suspend/Revoke are disabled; a token-swapped
  non-admin sees **no ⚙ Admin entry**; the throwaway suspended mid-session is
  **logged cleanly out with the suspended message**. Throwaway deleted (4 real
  accounts intact; jesper still the sole admin).

**Players & Invites + working join links (2026-06-28)**
- **DM-only "Players & Invites" panel** (`CampaignDashboard.jsx`, `PlayersInvites`):
  invite a player by email (`createInvite`) → shows the join link
  (`https://realmkeep.app/join/<token>`) with a **Copy** button; a members list
  with a **Remove** action (`kickMember`, hidden on the DM + on yourself); and a
  pending-invites list (`getCampaignInvites`), each with a copyable link. Gated by
  `isDM` — a non-DM (incl. a regular member) never sees it.
- **Working join links (`JoinScreen` + App `/join/<token>` gate):** the link was
  previously **dead** (no frontend handler / no `acceptInvite` usage). Now it
  previews the invite (`previewInvite`, no auth), shows login/register if logged
  out, then accepts (`acceptInvite`) and drops the user straight into the campaign
  (URL cleaned via `history.replaceState`). nginx already SPA-falls-back
  (`try_files … /index.html`), so no nginx change was needed.
- **Server-side admin override added:** `POST /api/auth/invite`,
  `DELETE /api/campaigns/:id/members/:userId`, and `GET /:id/invites` now allow the
  campaign **DM or a global admin** (new `dmOrAdmin` helper in campaigns.js +
  `isAdmin` in auth.js) — previously DM-only. Non-DM/non-admin still 403.
- Verified live end-to-end (DM jesper + 1 throwaway): DM creates an invite via the
  panel → join link; throwaway opens the link → preview → **Join → becomes a
  member** (role player); the throwaway (non-DM) sees **no panel**; the DM's
  **Remove** kicks the member (members back to DM-only). Throwaway campaign +
  invite + user cleaned up FK-safe (4 real accounts intact).
- **Bug caught in browser (`b074d4a`):** `CampaignDashboard.jsx` referenced `C.*`
  (theme colors) without importing `C` → white-screen crash once the panel
  rendered. Vite/tsc don't flag an undefined identifier in `.jsx`; fixed by adding
  the import. (Lesson: browser-verify panels, not just the build.)

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

**Tag Filter Panel (v6, 2026-05-13 — Library + Encounter Builder)**
- Sidebar with Quick filters (12 chips), per-category AND/OR (Primary OR / Modifier AND / Subtype OR defaults), live counts on every chip
- Free-text search across name + tags + alignment (multi-word AND)
- Size/Frequency/Habitat structured filters (always OR within each)
- Custom search modal for finding tags across all 102 tags
- Selected sticky bar with × remove + clear-all
- sessionStorage per panel: `adnd_filter_library`, `adnd_filter_generator`
- 30+ Vitest unit tests including 4000-monster perf test under 50ms
- Files: `src/rulesets/{filterConfig,tag-vocabulary}.json`, `src/components/Encounters/{filterTypes,useFilterState}.ts`, `src/components/Encounters/{TagFilterPanel.tsx, TagFilterPanel.module.css}`, `src/rules-engine/monsters/{filterEngine,filterEngine.test}.ts`
- Encounter Builder integration was blocked for ~2 days by a render-loop in XpRangePanel (not in this panel) — see bug #5. Library worked from day one; Generator side became usable after `60bed3e`.

**Custom XP Range (v7, 2026-05-14)**
- "Custom XP range" toggle under Difficulty buttons in Encounter Builder
- Min/Max XP inputs, sessionStorage-persisted (`adnd_custom_xp_range`)
- "Target: 2,000–5,000 XP (medium)" indicator always visible
- Generator uses range instead of Difficulty thresholds when active; "Couldn't reach target — closest was X XP" warning when unsatisfiable
- Files: `src/components/Encounters/{xpThresholds,useXpRangeState}.ts`, `src/components/Encounters/XpRangePanel.tsx`
- The shipped panel originally contained a render-loop bug (state-update-during-render). Fixed in `60bed3e` — see bug #5 history.
- Verified end-to-end 2026-05-15. Three tests passed:
  - Custom override of Difficulty works (3 runs hit target 3000-3500 with 1-4% overshoot tolerance — acceptable for quantized monster XP)
  - sessionStorage persistence across page reload
  - Extreme range triggers 'Could not assemble an encounter' warning

**Database Reference Data**
- 4,400 spells
- 5,725 magical items
- 3,781 monsters (with tags, classified May 2026)
- 311 nonweapon proficiencies (with sp_cp_cost)
- 137 kits
- Weapons catalog + armor catalog

**Quest Module (Stages 1–3 + follow-ups, May 2026)**
- Full quest tracker: kanban board (Concept / Draft / Ready / Active / Completed / Failed / Abandoned), 7-tab editor (Overview / Hooks / Objectives / Plot / Clues / Complications / Notes), AI quest generation, NPC auto-creation.
- Wired into `App.jsx` (`screen === 'quests'`) + `CampaignDashboard.jsx`; `← Dashboard` back button.
- AI generation: model picker (Claude Opus 4.7 / Sonnet 4.6 default / GPT-5.4 / GPT-5.5), length + detail two-axis picker with scope-dependent labels, live token + USD/EUR cost estimate, generation-time forecast + elapsed counter + reassurance banner, "Generate in chunks" placeholder (disabled, Stage 4).
- Global AI defaults in Settings (model / length / detail, localStorage keys `quest-default-*`); per-quest override in the Generate dialog.
- All UI in English; AI generates quest content in English.
- AD&D-themed: quest palette re-pointed to the gold theme, `AdndModuleHeader` banner, tome-gradient kanban cards, parchment-gold buttons.
- NPC auto-creation (`npcResolution.ts`): fuzzy-matches existing NPCs or creates new ones; `personality` stored as a trait array (see bug #6).
- Files: `src/rules-engine/quests/*.ts`, `src/components/quests/*` (incl. `aiGenConfig.ts`), `src/rulesets/quests/*.json`, `src/api/aiClient.d.ts`.
- Verified live: NPC module (quest-generated NPCs) confirmed by user; quest UI in active use. AI generation end-to-end relies on the 504 + truncation fixes (bug #7) — works for normal sizes; very large Campaign-arc generations are slow but no longer time out.

---

### ⏸ On hold / not started

**sketchSpec.cells persistence**
- Three-layer fix (PUT /api/maps/:id/sketch + jsonb_set in PUT /:id + explicit PUT /sketch in MapManager.handleSketchGenerate) is deployed. DB inspection 2026-05-15 confirmed 3 maps with 1024 persisted cells each — the fix does work at the DB layer.
- Map sketcher never reached working state — requires larger rework. Deferred indefinitely.

**Map Generator (MapGenerator.jsx) from sketch**
- Sketch → image → MapGenerator form → Claude AI → new map record flow.
- Map sketcher never reached working state — requires larger rework. Deferred indefinitely.

**Map Generator general improvements**
- User has paused work on this area
- 2026-05-18: `MapGenerator.css` (which was imported nowhere — bug #9) is now wired in, so the "Generate from Prompt" modal renders correctly again. The CSS predates the AD&D gold theme pass, so the Maps module still looks a step behind the newly-themed modules — a Maps theming pass is a candidate follow-up.

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
| 2 | Low | `auto-migrate` errors for monsters/items table (ownership) — cosmetic, does not affect app | Ignored (DB permissions) |
| 3 | Low | Gemini sometimes renders mountains only in top corner even when they span full eastern edge | Partially mitigated by dominant-edge fact in promptBuilder |
| 4 | Low | Swamp can be rendered as forest by Gemini | Mitigated by TERRAIN_ID_GUIDE in prompt |
| 5 | ~~Critical~~ Resolved | Encounter Builder freeze (React error #520, infinite render loop) | **Fixed in commit `60bed3e` on 2026-05-15. Verified live, 0 console errors.** |
| 6 | ~~Critical~~ Resolved | NPC module blank page — crashed on quest-generated NPCs (`personality` stored as a string, NPC list does `.slice().map()` expecting an array) | **Fixed `82e41ac` — `npcResolution.ts` now stores `personality` as a trait array; `questPrompts.ts` schema requests an array; `NPCManager.jsx` defensively normalizes either shape. Verified by user.** |
| 7 | ~~High~~ Resolved | Long AI quest generations (Campaign arc) failed with HTTP 504 after ~180s | **Fixed — nginx gained a dedicated `/api/ai/` block with `proxy_read_timeout 600s` (see §1 note). Server-side config only.** |
| 8 | ~~Low~~ Resolved | Quest banners showed invisible light-on-light text | **Fixed `59c432b` — opaque banner backgrounds + explicit dark text.** |
| 9 | ~~Low~~ Resolved | AI Map Generator modal rendered completely unstyled (overlapping labels, no backdrop) | **Fixed `8a1e574` — `MapGenerator.css` was imported nowhere; added the missing `import`. Verified by user.** |
| 10 | Low | Cancel during AI quest generation closes the dialog but does not abort the in-flight `fetch` (no `AbortController` wired up) — generation continues in the background | Open — cosmetic, no data harm. Wire an `AbortController` in a future pass. |
| 11 | ~~High~~ Resolved | **Kits 401 regression** — the security pass (commit `0e7d595`) added `auth` to `/api/kits`, but `useKits.js` has THREE hooks and only `useKitsByClass` + `useKit` got the JWT; the base `useKits()` hook kept a raw `fetch("/api/kits")` with no Authorization header. Logged in, the Kits tab silently fell back to the static bundle (lost the live DB's 137 kits) because the live call 401'd. Other libraries (proficiencies, spells, monsters, magical-items) were unaffected — their callers already sent the token. | **Fixed `d206107` (2026-06-04). All three `useKits` hooks now route through a shared `authFetch`. Browser-verified: `GET /api/kits` → 200 on reload; full session showed 5/5 `/api/*` calls at 200, zero 401s, zero CSP violations.** |

### Bug #5 — Encounter Builder freeze (RESOLVED 2026-05-15)

**Symptom:** Opening Encounter Builder tab triggered 10,000+ React error #520 ("Maximum update depth exceeded") in <1s, browser became unresponsive. Library used same `TagFilterPanel` component and did NOT freeze.

**Root cause:** `XpRangePanel.tsx` (v7) called the parent's state setter synchronously during its own render, on every render:

```tsx
// Original shipped v7 code, lines 132-137 — BAD
if (onRangeChange) {
  onRangeChange(effective);   // calls EncounterBuilder's setEffectiveRange
}
```

This is a state-update-during-render on the parent — a React anti-pattern. Compounded by `effective` being a fresh object literal every render, so `setEffectiveRange` received a new reference every pass → guaranteed re-render of EncounterBuilder → re-render of XpRangePanel → calls `onRangeChange` again → infinite loop. React's concurrent renderer caught each thrown error and wrapped it as #520.

The v7 author (chat-Claude) had even written a justifying comment claiming "useEffect delays the notification by one render which makes Generate race-prone" — this was wrong. useEffect runs after every commit, long before any click handler fires.

**Fix (commit `60bed3e`):**
- Memoize `effective` on primitive deps (stable identity instead of fresh literal each render)
- Stash `onRangeChange` in a ref
- Call it from a `useEffect` keyed on `effective` (runs after commit, not during render)

**Diagnostic timeline — including misdirections worth recording:**

| Commit | What was tried | Outcome |
|---|---|---|
| `ee2e8c5` | Perf fixes in TagFilterPanel (projectedCounts useMemo, useMemo→useEffect for propagate-up, React.memo) | Did not fix freeze — wrong component. **Kept in code as defense-in-depth, makes panel genuinely faster.** |
| `34da522` | Defensive layers in TagFilterPanel (onFilteredChangeRef, content-equality gate, monstersStable ref) | Did not fix freeze — wrong component. **Kept in code as defense-in-depth, makes panel loop-resistant.** |
| `276e706` | TRIN 2 binary-search: commented out `<TagFilterPanel/>` in EncounterBuilder | **This isolated the bug — proved loop was NOT in TagFilterPanel.** Cleanly reverted by 60bed3e. |
| `60bed3e` | Actual fix in XpRangePanel + restore TagFilterPanel | ✅ Resolved |

**Process lesson (recorded for future debugging):** The first two attempts assumed the loop was in the most recently/heavily-touched component (TagFilterPanel, v6) without proving it. The binary-search diagnostic (disable a component, observe) should have been step 1, not step 4. Two deploys wasted. **Future rule: before applying defensive fixes to a component you suspect, prove it's the source by disabling it first.**

**Status of defensive fixes from earlier attempts:** All still in code, all worth keeping. They are legitimate improvements to TagFilterPanel even though they weren't the cure:
- `ee2e8c5`: projectedCounts single-pass useMemo, useMemo→useEffect for propagate-up, React.memo wrapper
- `34da522`: monstersStableRef + onFilteredChangeRef + content-equality gate

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

### React Rendering Conventions (recorded after bug #5)
- **Never call a parent's state setter during render.** It's a React anti-pattern that causes infinite re-render loops. Use `useEffect` keyed on the value that should trigger the notification.
- **Memoize values passed up to parents.** A child returning `{ a, b }` literal on every render breaks parent's `useState`-based memoization. Wrap in `useMemo` on primitive dependencies.
- **Refs for callbacks.** When a child should call a parent callback from an effect, stash the callback in a ref so the effect's dep array stays stable. Pattern:
  ```tsx
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; });
  useEffect(() => { callbackRef.current(value); }, [value]);
  ```
- **Before defensive fixes, isolate.** When diagnosing a render loop, the FIRST step is to disable suspected components one at a time to prove which is the source. Don't apply fixes to components you only suspect.

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
  - `quest-default-model` / `quest-default-length-tier` / `quest-default-detail-tier` — global AI generation defaults (set in Settings)
  - `quest-editor-view-mode` — quest editor modal vs. fullpage
- sessionStorage (per-tab):
  - `adnd_campaign` — active campaign id
  - `adnd_screen` — active module screen (`dashboard` | `characters` | `quests` | …)
  - `adnd_filter_<storageKey>` — filter panel state (e.g. `adnd_filter_library`, `adnd_filter_generator`)
  - `adnd_custom_xp_range` — Custom XP Range panel state

### Quest Module
- Data layer (`src/rules-engine/quests/`): `questSchema.ts` (types — stable, do not edit casually), `defaultQuest.ts`, `questPrompts.ts` (AI prompt builders + `QuestAIModel` type), `questAI.ts` (orchestrator), `npcResolution.ts` (fuzzy NPC match/create).
- `quest.data` is a JSONB blob; the `quests` table hoists `title` to a column.
- `npcResolution.ts` writes NPC `personality` as a **trait array** — the NPC module reads it with `.map()`. Quest-AI suggestions may arrive as a string and are split into an array (see bug #6).
- Vocabulary in `src/rulesets/quests/*.json` (scopes, types, tones, environments, challenges, antagonists, complication + moral-dilemma presets) — slugs are stable English keys; labels/descriptions are user-facing English.

### Multi-provider AI endpoint
- `POST /api/ai/prompt` accepts an optional `model` param: `claude-opus-4-7` / `claude-sonnet-4-6` (default) / `gpt-5.4` / `gpt-5.5`.
- `claude-*` → Anthropic SDK; `gpt-*` → OpenAI SDK (chat completions). Both normalized to `{ text }`.
- A `MODEL_REGISTRY` in `server/routes/ai.js` carries each model's provider + real max-output tokens; the requested `maxTokens` is capped to that (replaced the old hard 4096 cap that caused truncation).
- Omitting `model` → defaults to Sonnet 4.6, so NPCGenerator / MapGenerator (which never pass `model`) keep working unchanged.
- `OPENAI_API_KEY` missing → `503 "OPENAI_API_KEY not configured on server"`.

### AI feature-gate — schema + enforcement (2026-06-04)
- **Schema:** `users` gains `ai_approved BOOLEAN NOT NULL DEFAULT false` and
  `is_admin BOOLEAN NOT NULL DEFAULT false` (auto-migrate, idempotent). Owner
  `jesper@olesen.nu` seeded `true/true` (re-asserted every boot); all others
  default `false`.
- **Why the whole endpoint is blocked (not BYOK-bypassed):** investigation
  showed `getClientForRequest()` prefers the env key
  (`process.env.ANTHROPIC_API_KEY || header`) and `/generate` uses `getClient()`
  directly, so in production the routes ALWAYS use the shared server key — a
  user-supplied `x-anthropic-key` is not honoured. Therefore unapproved users
  are blocked outright rather than allowed a (non-functional) own-key path.
  *If* BYOK-bypass is ever wanted, flip the key priority in
  `getClientForRequest` to prefer the header, then relax `requireAiApproval` to
  allow requests carrying a non-empty `x-anthropic-key`.
- **Enforcement** lives in `requireAiApproval` (in `server/routes/ai.js`),
  mounted after `auth` on `/prompt`, `/loot`, `/generate`. It SELECTs
  `ai_approved` by `req.user.id` per request (fresh, no JWT staleness) — an SQL
  approval is effective immediately. `is_admin` is surfaced here but *used* by
  character DM-approval/reassignment and the admin API (`requireAdmin`), not by
  this AI gate.
- **Approve a user:** `UPDATE users SET ai_approved=true WHERE email='…';`
  (admin UI deferred). The frontend reflects it after the next `/api/auth/me`
  (page reload); server enforcement is immediate regardless.

### Character DM-approval — rule-breaker flow (2026-06-28)
- **Columns, not JSON, for the flags.** `rule_breaker` + `dm_approved` are real
  `BOOLEAN` columns (idempotent auto-migrate) so the derived status can be
  filtered/indexed in SQL (`idx_characters_ruleflags`). `rule_violations` stays in
  `character_data` JSON — it's display-only narrative ("what was broken"), never
  queried. Status (`clean`/`pending`/`approved`) is *derived* in `fmt()`, not
  stored, so it can never drift from the two flags.
- **Server is the only thing that can approve.** Same hardening as the `role`
  field on register: the client may send `rule_breaker` + `rule_violations`, but
  any `dm_approved` in a save body is ignored. `POST`/`PUT /api/characters` always
  write `dm_approved=false`; the *only* path to `true` is
  `PUT /:id/approval`, guarded by `isCampaignDM(campaign_id, user) || isAdmin(user)`.
  A player — even the character's owner — gets 403.
- **Roles are contextual.** DM-ness is per-campaign (`campaign.dm_user_id`), looked
  up against the character's own `campaign_id`; `is_admin` is the global override,
  read fresh from `users` (never trusted from the JWT). A character with no
  campaign can only be approved by an admin.
- **Any edit re-enters pending.** Because saves force `dm_approved=false`, editing
  an approved rule-breaking character invalidates the approval automatically — the
  DM re-approves the *current* sheet, not a stale one. Clean characters
  (`rule_breaker=false`) report `clean` regardless of the (unused) `dm_approved`.
- **Compat:** `rule_breaker` is read from a top-level field if present, else from
  the legacy `character_data.ruleBreaker` the builder already writes — so the gate
  works before the Prompt-2 frontend lands. A boot-time backfill flips existing
  `ruleBreaker=true` rows to the new column.

### Character ownership reassignment (2026-06-28)
- **Reuses the contextual-role guard.** `PUT /api/characters/:id/owner` uses the
  same shape as approval — `isCampaignDM(campaign_id, user) || isAdmin(user)` — and
  never special-cases the owner: a player (even the current owner) can't reassign.
- **Target validated against campaign participation, not a free-form id.** The
  target must pass `campaignAccess(campaign_id, target)` (campaign DM or a
  `campaign_members` row), so a DM can only hand a character to someone actually in
  the campaign — never an arbitrary user. Reuses the existing helper rather than a
  new membership query.
- **Orthogonal to the rule-breaker flow.** The `/owner` UPDATE touches only
  `player_user_id`; it deliberately does NOT reset `dm_approved` (unlike a normal
  save) because transferring custody is not an edit of the sheet. Edit rights
  "follow" automatically — `PUT /:id`'s owner check reads `player_user_id`, so the
  new owner gains edit access and the previous owner loses it with no extra code.
- **Owner surfaced for the DM.** `/party/:campaignId` joins `users` for
  `owner_username` + `owner_email`; PartyHub renders `👤 <owner>` per character
  (DM-only). `api.assignCharacterOwner` exists for a later assignment UI.

### Admin API + suspension (2026-06-28)
- **Same fresh-read gate pattern as `requireAiApproval`.** `requireAdmin` reads
  `is_admin` from the DB per request (not the JWT), so SQL grants/revokes are
  immediate. The admin gate **fails closed** (403 on DB error); the auth
  suspension check **fails open** — a transient DB error must not lock every user
  out (the route fails anyway if the DB is truly down, and a suspended user can do
  nothing useful in that window).
- **Suspension enforced in two places** so it's immediate: at login (after the
  password check, so account state isn't leaked to wrong-password probes) and in
  the `auth` middleware (one extra PK lookup per authenticated request). Both
  return `account_suspended`. That per-request lookup is the price of "works
  mid-session, not just next login" — fine at this app's scale.
- **Anti-lockout is structural, not just guarded.** Self-suspend and self-revoke
  of `ai_approved` are blocked, and the last active admin can't be suspended.
  Crucially there is **no is_admin-mutation endpoint** at all, so the admin set
  changes only via direct DB — no API path can strand the system with zero admins.
- **Notification is fire-and-forget + opt-in.** `notifyNewSignup` is dormant until
  `DISCORD_WEBHOOK_URL` is set; it swallows every error and is never awaited, so a
  webhook outage can't fail or slow registration. Swappable for email later
  without touching the register route.

### Shared AD&D theming
- `src/styles/adnd-theme.css` holds the canonical theme variables (`--adnd-gold`, `--adnd-bg`, `--adnd-surface`, `--adnd-border`, …) plus reusable `.adnd-divider`, `.adnd-card`, `.adnd-module-header`.
- `src/components/ui/AdndModuleHeader.tsx` — reusable edition banner + centered gold title + ornate divider. Currently used by the Quests module; retrofitting the other modules is a pending follow-up.
- Project-scoped Anthropic `frontend-design` skill installed at `.claude/skills/frontend-design/SKILL.md` (tracked via a `.gitignore` exception) — auto-activates for UI work.

---

## 5. Next Priorities

These are suggested based on current state — confirm with user before starting:

1. **Retrofit `AdndModuleHeader` + AD&D theming to the remaining modules** — NPCs, Monsters, Spells, Magical Items, Party Hub, Characters. Component exists and is proven on Quests; rollout needs in-browser visual iteration.
2. **Maps module theming pass** — `MapGenerator.css` predates the gold theme; the Maps overlay looks a step behind the rest.
3. **Quest Stage 4** — "Generate in chunks" (split very long generations across multiple AI calls); the button placeholder is already in the dialog, disabled.
4. **Off-instance backup copy** — DB dumps live ONLY on the instance
   (`/var/backups/realmkeep/`, see §1); losing the instance loses the backups
   with it. Push a copy off the box (Oracle Object Storage via a lifecycle-
   managed bucket, or a periodic `scp`/rsync pull to another machine) for real
   disaster recovery.
5. **Webhook reliability** — investigate intermittent auto-deploy non-delivery (see §1 webhook note).
6. **Weapon proficiencies in DB** — import from `src/data/` to PostgreSQL, update `/api/proficiencies`
7. **Seamless tile transitions** — edge tiles for biome boundaries (coast→plains, forest→plains, etc.)
8. **stat limits validation in ScoresTab** — use `statLimits` from `races.js` to warn/block invalid scores
9. **Consider v8 encounter features** — theme presets, saved filter presets per campaign
10. **Production readiness** (before opening the app to other DMs) — multi-user auth review, SQL-injection sweep, rate limiting on AI endpoints, a per-user daily AI cost cap, and React error boundaries so one crashing card cannot blank a whole module.

---

## 6. Environment Variables (server/.env)

| Key | Purpose | Required for |
|---|---|---|
| `DB_*` | PostgreSQL connection | Everything |
| `JWT_SECRET` | Auth tokens — MUST be ≥32 chars; server refuses to start in production without it (security pass 2026-06-04) | Everything |
| `NODE_ENV` | `production` enables strict rate-limits + JWT_SECRET guard | Prod |
| `CORS_ORIGINS` | Comma-separated origin allowlist. **Prod (2026-06-04): `https://realmkeep.app,https://www.realmkeep.app`** (bare-IP dropped after TLS). Falls back to built-in defaults if unset. | Optional |
| `ANTHROPIC_API_KEY` | Claude AI (map lore, POIs, monster tag classification) — **shared key, gated behind `ai_approved`** | Map generator + tag classifier |
| `OPENAI_API_KEY` | DALL-E 3 + GPT-Image-1 | Map images |
| `GOOGLE_AI_API_KEY` | Gemini image generation | Sketch-to-map |
| `WEBHOOK_SECRET` | GitHub webhook HMAC | Auto-deploy |
| `APP_URL` | Base URL for invite links (`auth.js`). **Set 2026-06-04: `https://realmkeep.app`** — verified a fresh invite mints `https://realmkeep.app/join/…`. Read at module load, so a change needs a PM2 restart. | Invites |
| `DISCORD_WEBHOOK_URL` | **Optional (2026-06-28, unset for now).** If set, a fire-and-forget Discord webhook fires on each registration: `New RealmKeep signup: {username} ({email}) — pending approval`. Unset → silent no-op; a webhook failure never affects registration (`server/lib/notify.js`). Could be swapped for email later. | Signup alerts |
| `PORT` | Express port (default 3000 local, 3001 prod) | Backend |

---

## 7. Security Hardening Pass (2026-06-04)

Pre-beta backend security review. Externally-verified findings (HTTP only,
open reference routes, nginx version banner leak) all addressed in code +
config. Server-side ops (HTTPS + nginx hardening) still outstanding —
they are NOT committable from the repo and require explicit go-ahead.

### Done in this pass

| # | Severity | Fix |
|---|---|---|
| Auth | **CRITICAL** | `/auth/register` no longer accepts `role` from body; every new account is a `player`. DM rights are granted per-campaign only. Minimum password length 8 enforced. bcrypt cost bumped 10 → 12. |
| JWT | **CRITICAL** | Removed hardcoded `'dnd-manager-secret'` fallback. `middleware/auth.js` now throws at startup in production if `JWT_SECRET` is missing or <32 chars; dev/test uses a per-process random secret with a console warning. |
| IDOR | HIGH | All `:id` routes (characters, npcs, maps, map_connectors, quests, encounters, loot, party-*, character-*, saved-encounters, campaigns) already verify campaign ownership / DM via per-route checks. Audit confirmed every write path goes through `isDM()` or `campaignAccess()`. |
| IDOR (latent bug) | MED | `character-equipment.js` + `character-spells.js` `canEdit()` queried `characters WHERE id=$1 AND user_id=$2` — actual column is `player_user_id`. Fixed: owners can now edit again (previously only DMs could). |
| Reference routes | HIGH | `auth` middleware added to `proficiencies`, `kits`, `spells` (5 routes), `monsters` GETs (3 routes), `magical-items` (8 routes), `weapons-catalog` (2 routes), `armor-catalog`. Frontend hooks `useKits` + `useProficiencies` + `lootRollEngine.ts` now pass the JWT. `monster-tags.js` left untouched — dead code (not mounted). |
| SQL parametrisation | OK | Audit pass found one `${t.table_name}` interpolation in `campaigns.js` `delete-preview` — value comes from `information_schema`, never user input. All other queries parametrised. |
| Rate-limit (auth) | HIGH | New `middleware/rate-limit.js` — `loginLimiter` (10/15m per IP+email in prod), `registerLimiter` (5/h per IP), mounted in `index.js` before the auth router. |
| Rate-limit (AI) | HIGH | `aiLimiter` (60/h per user) on `/api/ai/*`; `imageLimiter` (20/h per user) layered on top of `/api/maps/:id/image*` + `/generate-from-sketch`. |
| helmet | HIGH | Installed + configured with strict CSP (`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'` for JSX inline styles, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`), HSTS one-year, COEP disabled (would block base64 image flows). |
| CORS | HIGH | Locked allowlist via new `CORS_ORIGINS` env (comma-separated). Built-in defaults: `localhost:5173`, `127.0.0.1:5173`, `http://158.180.63.20`, `https://158.180.63.20`. Old `origin: true` (reflected any caller) is gone. |
| `trust proxy` | — | `app.set('trust proxy', 1)` so rate-limiters see the real client IP behind nginx. |
| npm audit | HIGH | Server: 9 vulnerabilities (1 critical protobufjs, 2 high path-to-regexp) → all resolved via `npm audit fix`. Now 0. Root: was already 0. |
| .env | OK | `.env.example` exists; real `.env` is gitignored AND has never been committed (`git log --all -- server/.env` empty). `.env.example` extended with new `NODE_ENV` + `CORS_ORIGINS` keys. |

### Follow-up pass — same day (commits `d206107` + nginx config)

After the passive live-test, two items were addressed:

1. **Kits 401 regression** (see §3 bug #11) — `useKits()` base hook was the
   one caller still missing the JWT. Fixed; all three kit hooks now share an
   `authFetch` helper. Browser-verified `/api/kits` → 200.

2. **Security headers moved to nginx (on the HTML document, not /api JSON).**
   A CSP on JSON responses does nothing for XSS — the browser enforces CSP
   from the document, which nginx serves directly. helmet's CSP is now
   DISABLED (`contentSecurityPolicy: false`); the real CSP lives in
   `/etc/nginx/snippets/adnd-security.conf`, `include`d into the three static
   location blocks (`= /index.html`, `/assets/`, `/`). helmet still sets
   HSTS / XFO / nosniff / COOP / CORP and strips X-Powered-By on /api.
   - **`server_tokens off;`** added to the server block — `Server:` header is
     now just `nginx` (version banner gone). ✓ verified.
   - **`connect-src` includes `https://api.openai.com`** — the SPA calls the
     OpenAI image API directly from the browser (map generation + NPC /
     character portraits, 4 call sites). A naive `connect-src 'self'` would
     have broken all image generation; audited before writing the policy.
   - Added `X-Forwarded-For` / `X-Real-IP` / `X-Forwarded-Proto` to the
     `/api/` proxy block — the old block forwarded only `Host`, so the
     rate-limiters couldn't see the real client IP.
   - Config backed up to `/etc/nginx/adnd-manager.bak-20260604`. Applied via
     `nginx -t` (pass) + `systemctl reload nginx` (no restart). The full
     live config now lives ONLY on the server (snippet + sites-enabled),
     mirrored in this doc for reference.
   - **Browser verification (Claude-in-Chrome, real session):** app shell +
     gold theme + all module counts (3781 monsters / 5725 items / 4400
     spells) + character builder + full kit grid all render; 5/5 `/api/*`
     calls returned 200; **zero CSP violations** in console.

### Outstanding (server-side ops, not committable)

These require SSH + sudo on the live server and an explicit go-ahead:

1. ~~**HTTPS via certbot**~~ — **DONE 2026-06-04. HTTPS is LIVE on
   `https://realmkeep.app` (+ www).** See the "HTTPS / TLS" section below for
   the full setup; `CORS_ORIGINS` scoped to the https origins.
2. ~~**`server_tokens off;`**~~ — **DONE** in the follow-up pass (above).
3. ~~**Stale nginx backups in `sites-enabled`**~~ — **DONE 2026-06-04.** Moved
   `adnd-manager.bak-20260517/.bak-20260519` (and the new `.bak-20260604`) into
   `/etc/nginx/site-backups/` (outside the include glob). `nginx -t` is now
   warning-free; reloaded; site serves 200 with headers intact.
4. ~~**Throwaway verification account**~~ — **DONE 2026-06-04.** Verified it
   owned 0 campaigns / characters / memberships, then
   `DELETE FROM users WHERE email='sectest-20260604@example.invalid'`
   (DELETE 1, confirmed 0 rows remain).
5. JWT TTL is currently 30 days — leave for beta, consider 7d post-beta.
6. ~~Latent bug: `routes/ai.js` `/generate` used `model: 'claude-opus-4-6'`~~ —
   **FIXED 2026-06-04 (`6f14991`).** It was hardcoded straight to the SDK
   (bypassing MODEL_REGISTRY), so every `/api/ai/generate` call 404'd at the
   Anthropic API. Corrected to `claude-opus-4-7` (the registry's Opus id).
   Also aligned the monster-classify script off the dated
   `claude-sonnet-4-5-20250929` snapshot → `claude-sonnet-4-6`. Verified live:
   `/api/ai/prompt` → `{"text":"PONG"}`, `/api/ai/generate` → full NPC, for an
   approved user. All other chat-model refs already match the registry.
7. **`dall-e-3` cost-route review — CLARIFIED + the real gap FIXED (2026-06-04,
   `f4f3584`).** Grepped dall-e-3 / dall-e / dalle / images/generations across
   server + frontend. Three buckets:
   - **Browser, user's own key (`localStorage.openai_api_key`) → no gate (costs
     the user, not the owner).** Map image (`MapGenerator.jsx`) was already
     `gpt-image-1`. The NPC/character **portraits** (`NPCManager.jsx`,
     `NPCGenerator.jsx`, `PortraitTab.jsx`) still used `dall-e-3` — which OpenAI
     removed 2026-05-12, so portrait generation was **broken**. **MIGRATED to
     gpt-image-1 (2026-06-04, `b214a69`)** — see the "Portrait generation" entry
     in §2 Fully working.
   - **Server, owner's key, but DEAD CODE → DELETED (2026-06-04, `59c2bdf`).**
     `server/lib/dalleProvider.js` + `visionProvider.js` (dall-e-3 on
     `process.env.OPENAI_API_KEY`) were imported only by
     `server/lib/rendererFactory.js`, which nothing required. The live renderer
     is `server/lib/mapRenderers/rendererFactory.js` (gpt-image-1 / Gemini),
     used by `routes/maps.js`. All three deleted after confirming zero importers
     (no test / JSON / dynamic refs). build ✓ · vitest 32/32 ✓ · server boots
     clean (no "Cannot find module") · `generate-from-sketch` + maps router
     still respond (401 without token, not 500).
     **`server/lib/replicateProvider.js`** was orphaned by that deletion (used
     only by the deleted factory) — **also DELETED 2026-06-04 (`a9a629b`)** after
     grep confirmed zero importers; build ✓ · vitest 32/32 ✓ · clean boot.
     `server/lib/` is now just `access.js`, `magicItemParser/`, `mapRenderers/`.
   - **Server, owner's key, LIVE + was UNGATED → FIXED.**
     `POST /api/maps/generate-from-sketch` runs gpt-image-1 / Gemini on the
     shared `OPENAI_API_KEY` / `GOOGLE_AI_API_KEY`. It had `auth` + `imageLimiter`
     but **not** the approval gate, so an authenticated-but-unapproved user could
     spend the owner's image budget. **Added `requireAiApproval` (after `auth`).**
     `requireAiApproval` was extracted to `middleware/aiApproval.js` (single
     source; `routes/ai.js` imports it). Verified live: unapproved →
     403 `ai_not_approved`; approved → passes the gate (400 `sketchSpec required`
     on an empty body — no image generated); `/api/ai/*` gates still work.

### HTTPS / TLS — LIVE (2026-06-04)

**Domain:** `realmkeep.app` (+ `www.realmkeep.app`) → A record to `158.180.63.20`.
Oracle security list + OS firewall both allow 443. The app is now served at
**https://realmkeep.app**.

- **Firewall:** TCP 443 was already ACCEPT-before-REJECT in iptables (line 5);
  80 at line 6. Persisted with `netfilter-persistent save` → `/etc/iptables/
  rules.v4`. (Two dead duplicate 443/80 rules sit *after* the REJECT — harmless,
  left in place.)
- **nginx:** `server_name realmkeep.app www.realmkeep.app;` added to the vhost.
  `certbot --nginx --redirect` then converted the main block to `listen 443 ssl`
  (LE cert + `options-ssl-nginx.conf` + `ssl_dhparam`) and added a second
  port-80 server block that 301-redirects both hosts to https. The 3
  security-header `include`s stayed in the 443 block (verified) — CSP/HSTS/XFO/
  XCTO/Referrer-Policy all present on the HTTPS response; `Server: nginx` only.
- **Certbot:** v1.21.0 (apt). Cert at `/etc/letsencrypt/live/realmkeep.app/`,
  expires **2026-09-21**. Auto-renewal via `certbot.timer` (active);
  `certbot renew --dry-run` passes. LE account registered to jesper@olesen.nu.
  - *Install gotcha:* `python3-certbot-nginx` pulled an nginx package upgrade
    that stalled on the `sites-available/default` conffile prompt
    (non-interactive EOF). Resolved with
    `apt-get install -f -o Dpkg::Options::=--force-confold` (kept existing
    configs). Our `sites-enabled/adnd-manager` was untouched.
- **CORS:** `CORS_ORIGINS=https://realmkeep.app,https://www.realmkeep.app` in
  `server/.env` (bare-IP origin dropped). Verified: allowed origin gets the
  `Access-Control-Allow-Origin` echo; the old bare-IP origin is rejected;
  no-Origin tool requests still pass. PM2 restarted.
- **Frontend:** already uses relative `/api` + relative asset/image paths — no
  hardcoded `http://158.180.63.20` anywhere, so it works under https with no
  rebuild and no mixed content.
- **Config backups:** `/etc/nginx/site-backups/adnd-manager.bak-20260604-pretls`
  (before server_name) and `…-precertbot` (before certbot). Live config now only
  on the server.
- **Side effect:** `http://158.180.63.20` (bare IP, port 80) now returns 404 —
  the port-80 block only redirects the two domains. Use the domain. Reaching the
  app by bare IP over https shows a cert-name mismatch (cert is for the domain).
- **Verified live (browser, Claude-in-Chrome):** https padlock (trusted cert,
  no `-k`); `http://` → 301 → `https://` (apex + www); register + login over
  HTTPS through the real frontend; 5/5 `/api/*` calls 200 over
  `https://realmkeep.app` (incl. `/api/auth/me`); a 3 MB map PNG served over
  https (`image/png`, 200); **no mixed-content, no console errors**.

### Follow-ups (still server-side, optional)
- ~~**`APP_URL`**~~ — **DONE 2026-06-04.** Set to `https://realmkeep.app` in
  `server/.env`, PM2 restarted. Verified via a throwaway DM→campaign→invite
  that a fresh link mints `https://realmkeep.app/join/<token>` (not localhost);
  throwaway artifacts deleted afterward.
- HSTS `preload` is off (max-age + includeSubDomains only) — **left off
  intentionally for now**. Enable preload + submit to the HSTS preload list
  once you're confident HTTPS stays up.

### Cross-user isolation (IDOR) — empirically verified (2026-06-04)

Static audit (above, "Done in this pass") was confirmed with a live two-account
behavioural test on `https://realmkeep.app`. Two throwaway accounts A + B; B
built a full set (campaign, character, npc, map, party-knowledge, party-
inventory, party-equipment, character-equipment, character-spell, quest, loot,
encounter, saved-encounter). Then A — with A's own valid token — hit every
`:id` route against B's ids: GET / PUT / DELETE, plus `npcs/:id/reveal|hide`,
`party-equipment/:id/assign`, `character-equipment/:id/equip`,
`characters/party/:campaignId`, `saved-encounters/:id/creatures`.

**Result: 0 leaks (40 attempts).** Every cross-user call returned **403**
(`campaigns/:id` GET returns **404** by design — the `WHERE` excludes
non-members; still no data exposed). Positive control: B reads all of B's own
resources → 200, proving the 403s are real ownership enforcement, not absent
resources. Both throwaways deleted FK-safe (characters → campaigns → users,
scoped to the two accounts); the 4 real accounts untouched. No code changes
needed — server-side `isDM()` / `campaignAccess()` / `canEdit()` checks hold on
every write path.

### Verification (run after deploy)

```bash
# Reference routes now 401 without token (regression check)
curl -i http://158.180.63.20/api/proficiencies      # → 401 No token
curl -i http://158.180.63.20/api/spells/meta        # → 401 No token
curl -i http://158.180.63.20/api/kits               # → 401 No token

# Auth endpoints still respond OK
curl -i http://158.180.63.20/api/auth/me            # → 401 No token (was 401 before too — no change)

# Helmet headers present
curl -sI http://158.180.63.20/                      # X-Content-Type-Options, X-Frame-Options, CSP

# Rate limit fires after 11 quick logins
for i in {1..12}; do curl -s -o /dev/null -w "%{http_code}\n" \
  -X POST -H "Content-Type: application/json" \
  -d '{"email":"x@x","password":"x"}' http://158.180.63.20/api/auth/login; done
# expected: 401 × 10, then 429
```
