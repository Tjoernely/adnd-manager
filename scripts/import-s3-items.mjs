#!/usr/bin/env node
/**
 * scripts/import-s3-items.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches S3 special weapon descriptions from the Fandom wiki (MediaWiki API)
 * and UPSERTs them into the magical_items table in PostgreSQL.
 *
 * For each item, multiple wiki page title formats are tried in order until one
 * resolves to a real page. This handles the many title variations on the wiki.
 *
 * Run from the server/ directory (so .env is found automatically):
 *   cd /var/www/adnd-manager/server && npm run import:s3items
 *
 * Options:
 *   --dry-run       Fetch + parse but don't write to DB
 *   --missing-only  Only process items not yet in DB with a description
 *   --limit  N      Stop after N items (testing)
 *   --offset N      Skip first N items (resuming a partial run)
 *
 * Prerequisites:
 *   Node 18+ (native fetch required)
 *   server/.env with DB_* vars (or export them beforehand)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createRequire } from 'module';
import { readFileSync }  from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { S3_DATA } from '../src/components/items/s3_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env ─────────────────────────────────────────────────────────────────
function loadEnv() {
  const candidates = [
    join(process.cwd(), '.env'),
    join(__dirname, '..', 'server', '.env'),
  ];
  for (const p of candidates) {
    try {
      const text = readFileSync(p, 'utf8');
      for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const k = line.slice(0, eq).trim();
        const v = line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
        if (k && !(k in process.env)) process.env[k] = v;
      }
      return p;
    } catch { /* try next */ }
  }
  return null;
}
const envFile = loadEnv();

// ── pg Pool ───────────────────────────────────────────────────────────────────
const serverDir = join(__dirname, '..', 'server');
const serverReq = createRequire(join(serverDir, 'index.js'));

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  let Pool;
  try {
    ({ Pool } = serverReq('pg'));
  } catch {
    throw new Error('Cannot find "pg" module. Run: cd server && npm install');
  }
  _pool = new Pool({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME     ?? 'adnddb',
    user:     process.env.DB_USER     ?? 'adnduser',
    password: process.env.DB_PASSWORD,
    max: 3,
    connectionTimeoutMillis: 8_000,
  });
  return _pool;
}

// ── CLI args ──────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const MISSING_ONLY = args.includes('--missing-only');
const LIMIT        = (() => { const i = args.indexOf('--limit');  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();
const OFFSET       = (() => { const i = args.indexOf('--offset'); return i !== -1 ? parseInt(args[i + 1], 10) : 0; })();

// ── Constants ──────────────────────────────────────────────────────────────────
const WIKI_API   = 'https://adnd2e.fandom.com/api.php';
const WIKI_BASE  = 'https://adnd2e.fandom.com/wiki/';
const USER_AGENT = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS   = 200;
const MAX_RETRY  = 3;

// ── Category → wiki suffix (singular) ─────────────────────────────────────────
const WIKI_SINGULAR = {
  'Arrow':                    'Arrow',
  'Axe':                      'Axe',
  'Ballista':                 'Ballista',
  'Battering Ram':            'Battering Ram',
  'Blowgun':                  'Blowgun',
  'Bow':                      'Bow',
  'Catapult':                 'Catapult',
  'Club':                     'Club',
  'Dagger':                   'Dagger',
  'Dart':                     'Dart',
  'Explosive Device':         'Explosive Device',
  'Flail Weapon':             'Flail',
  'Hammer':                   'Hammer',
  'Harpoon':                  'Harpoon',
  'Helmseeker':               'Helmseeker',
  'Javelin':                  'Javelin',
  'Jettison':                 'Jettison',
  'Lance':                    'Lance',
  'Mace':                     'Mace',
  'Mattock':                  'Mattock',
  'Net':                      'Net',
  'Paddleboard':              'Paddleboard',
  'Pellet':                   'Pellet',
  'Polearm':                  'Polearm',
  'Quiver':                   'Quiver',
  'Shot':                     'Shot',
  'Sickle':                   'Sickle',
  'Sling':                    'Sling',
  'Spear':                    'Spear',
  'Spelljamming Ram':         'Spelljamming Ram',
  'Sword':                    'Sword',
  'Throwing Star (Shuriken)': 'Shuriken',
  'Whip':                     'Whip',
};

// ── Per-item wiki title overrides ──────────────────────────────────────────────
// Keys are short names as they appear in s3_data.js (entry.name, * stripped).
// Values are the exact wiki page title (including "(Magic X)" suffix).
// This map covers items whose wiki title doesn't follow the standard patterns.
const S3_WIKI_LINKS_MAP = {
  // ── Specials ──
  'Enchanted Enhancements':    'Enchanted Enhancements (EM)',
  'Weapon Enhancements':       'Weapon Enhancements (EM)',
  'Accelerator':               'Accelerator (Magic Weapon)',
  // ── Arrows ──
  "Abaris'":                   "Abaris's Arrow (Magic Arrow)",
  'Acid':                      'Acid Arrow (Magic Arrow)',
  'of Aggravation':            'Arrow of Aggravation (Magic Arrow)',
  'Antimagic':                 'Antimagic Arrow (Magic Arrow)',
  "Apollo's":                  "Apollo's Arrow (Magic Arrow)",
  'of Attraction':             'Arrow of Attraction (Magic Arrow)',
  'of Biting':                 'Arrow of Biting (Magic Arrow)',
  'Black of Iuz':              'Black Arrow of Iuz (Magic Arrow)',
  'of Blinding':               'Arrow of Blinding (Magic Arrow)',
  'of Blinking':               'Arrow of Blinking (Magic Arrow)',
  'Bolt of Lightning':         'Bolt of Lightning (Magic Bolt)',
  'of Bow-Breaking':           'Arrow of Bow-Breaking (Magic Arrow)',
  'of Burning':                'Arrow of Burning (Magic Arrow)',
  'of Charming':               'Arrow of Charming (Magic Arrow)',
  'of Charming II':            'Arrow of Charming II (Magic Arrow)',
  'of Clairaudience':          'Arrow of Clairaudience (Magic Arrow)',
  'of Clairvoyance':           'Arrow of Clairvoyance (Magic Arrow)',
  'of Climbing':               'Arrow of Climbing (Magic Arrow)',
  'of Connection':             'Arrow of Connection (Magic Arrow)',
  'of Curing':                 'Arrow of Curing (Magic Arrow)',
  'of Darkness':               'Arrow of Darkness (Magic Arrow)',
  'of Detonation':             'Arrow of Detonation (Magic Arrow)',
  'of Direction':              'Arrow of Direction (Magic Arrow)',
  'of Disarming':              'Arrow of Disarming (Magic Arrow)',
  'of Disintegration':         'Arrow of Disintegration (Magic Arrow)',
  'of Dispelling':             'Arrow of Dispelling (Magic Arrow)',
  'of Distance':               'Arrow of Distance (Magic Arrow)',
  'of Draconian Slaying':      'Arrow of Draconian Slaying (Magic Arrow)',
  'Elven':                     'Elven Arrow (Magic Arrow)',
  'of Enchantment':            'Arrow of Enchantment (Magic Arrow)',
  'of Explosions':             'Arrow of Explosions (Magic Arrow)',
  'of Extended Range':         'Arrow of Extended Range (Magic Arrow)',
  'Faerie Fire':               'Faerie Fire Arrow (Magic Arrow)',
  'of Fire':                   'Arrow of Fire (Magic Arrow)',
  'Fire Seed':                 'Fire Seed Arrow (Magic Arrow)',
  'Fire Trap':                 'Fire Trap Arrow (Magic Arrow)',
  'Flaming':                   'Flaming Arrow (Magic Arrow)',
  'of Flying':                 'Arrow of Flying (Magic Arrow)',
  'of Force':                  'Arrow of Force (Magic Arrow)',
  'of Harm':                   'Arrow of Harm (Magic Arrow)',
  'of Holding':                'Arrow of Holding (Magic Arrow)',
  'of Holding II':             'Arrow of Holding II (Magic Arrow)',
  'of Ice':                    'Arrow of Ice (Magic Arrow)',
  'of Illumination':           'Arrow of Illumination (Magic Arrow)',
  'Illusory Missile':          'Illusory Missile (Magic Arrow)',
  'of Justice':                'Arrow of Justice (Magic Arrow)',
  'of Law':                    'Arrow of Law (Magic Arrow)',
  'of Light':                  'Arrow of Light (Magic Arrow)',
  'of Lighting':               'Arrow of Lighting (Magic Arrow)',
  'of Lightning':              'Arrow of Lightning (Magic Arrow)',
  'Lycanthrope Slayer':        'Lycanthrope Slayer Arrow (Magic Arrow)',
  "Maglubiyet's Wounding":     "Arrow of Maglubiyet's of Wounding (Magic Arrow)",
  'of Misdirection':           'Arrow of Misdirection (Magic Arrow)',
  'Missile Weapon of Accuracy':'Missile Weapon of Accuracy (Magic Arrow)',
  'Missile Weapon of Distance':'Missile Weapon of Distance (Magic Arrow)',
  'of Multiplicity':           'Arrow of Multiplicity (Magic Arrow)',
  'Nilbog':                    'Nilbog (Magic Arrow)',
  "Oberon's of Subduing":      "Oberon's Arrow of Subduing (Magic Arrow)",
  "Oberon's of Slaying":       "Oberon's Arrow of Slaying (Magic Arrow)",
  'of Paralyzation':           'Arrow of Paralyzation (Magic Arrow)',
  'of Penetrating':            'Arrow of Penetrating (Magic Arrow)',
  'of Penetration':            'Arrow of Penetration (Magic Arrow)',
  'of Perseverance':           'Arrow of Perseverance (Magic Arrow)',
  'of Piercing':               'Arrow of Piercing (Magic Arrow)',
  'of Polymorphing':           'Arrow of Polymorphing (Magic Arrow)',
  'of Pursuit':                'Arrow of Pursuit (Magic Arrow)',
  'Quarrel of Biting (Acid)':  'Quarrel of Biting (Magic Arrow)',
  'Quarrel of Biting (Normal)':'Quarrel of Biting (Magic Arrow)',
  'Quarrel of Biting (Poison)':'Quarrel of Biting (Magic Arrow)',
  'Red':                       'Red Shafted Arrow (Magic Arrow)',
  'of Refilling':              'Refilling Arrow (Magic Arrow)',
  'of Returning':              'Arrow of Returning (Magic Arrow)',
  'of Rock Piercing':          'Arrow of Rock Piercing (Magic Arrow)',
  'of Roping':                 'Arrow of Roping (Magic Arrow)',
  'of Scent Detection':        'Arrow of Scent Detection (Magic Arrow)',
  'of Screaming':              'Arrow of Screaming (Magic Arrow)',
  'of Screaming II':           'Arrow of Screaming II (Magic Arrow)',
  'of Seeking':                'Arrow of Seeking (Magic Arrow)',
  'of Seeking II':             'Arrow of Seeking II (Magic Arrow)',
  'of Set':                    'Arrow of Set (Magic Arrow)',
  'of Signaling':              'Arrow of Signaling (Magic Arrow)',
  'of Silence':                'Arrow of Silence (Magic Arrow)',
  'of Sinking':                'Arrow of Sinking (Magic Arrow)',
  'of Slaying':                'Arrow of Slaying (Magic Arrow)',
  'of Slaying II':             'Arrow of Slaying II (Magic Arrow)',
  'of Slaying III':            'Arrow of Slaying III (Magic Arrow)',
  'of Slaying IV':             'Arrow of Slaying IV (Magic Arrow)',
  'Snake':                     'Snake Arrow (Magic Arrow)',
  'of Speaking':               'Arrow of Speaking (Magic Arrow)',
  'Stun Bolt':                 'Stun Bolt (Magic Bolt)',
  'of Stunning':               'Arrow of Stunning (Magic Arrow)',
  "Stirge's Bite":             "Stirge's Bite (Magic Arrow)",
  'of Teleporting':            'Arrow of Teleporting (Magic Arrow)',
  'of Transporting':           'Arrow of Transporting (Magic Arrow)',
  'Wooden':                    'Wooden Arrow (Magic Arrow)',
  'of Wounding':               'Arrow of Wounding (Magic Arrow)',
  'Arrowhead of Marking':      'Arrowhead of Marking (Magic Item)',
  // ── Axes ──
  "Agni's Red":                "Agni's Red Axe (Magic Axe)",
  "Ama-Tsu-Mara's Vorpal":    "Ama-Tsu-Mara's Vorpal Axe (Magic Axe)",
  'Arumdina':                  'Arumdina (Magic Axe)',
  'Azuredge':                  'Azuredge, Slayer of the Netherborn (Magic Axe)',
  'of Brotherhood':            'Axe of Brotherhood (Magic Axe)',
  'Callarduran Smoothhands':   "Callarduran Smoothhands's Axe (Magic Axe)",
  'Cursed Battle':             'Cursed Battle Axe (Magic Axe)',
  'of Cutting':                'Axe of Cutting (Magic Axe)',
  'Deathstriker':              'Deathstriker (Magic Axe)',
  'of the Dwarvish Lords':     'Axe of the Dwarvish Lords (Magic Axe)',
  'Frostreaver':               'Frostreaver (Magic Axe)',
  "Garl Glittergold's Battle": "Garl Glittergold's Battle Axe (Magic Axe)",
  "Gnarldan's Battle":         "Gnarldan's Battle Axe (Magic Axe)",
  "Hastseltsi's Hand":         "Hastseltsi's Hand Axe (Magic Axe)",
  "Hastsezini's Hand":         "Hastsezini's Hand Axe (Magic Axe)",
  'of Hurling':                'Axe of Hurling (Magic Axe)',
  "Lortz's Battle":            "Lortz's Battle Axe (Magic Axe)",
  'Might of Heroes':           'Might of Heroes (Magic Axe)',
  'Motopua':                   'Motopua (Magic Axe)',
  "Nanna Sin's Black":         "Nanna Sin's Black Axe (Magic Axe)",
  "Nomog-Geaya's Hand":        "Nomog-Geaya's Hand Axe (Magic Axe)",
  'Pickaxe of Piercing':       'Pickaxe of Piercing (Magic Axe)',
  'Rocksplitter':              'Rocksplitter Axe (Magic Axe)',
  "Sampsa's Golden":           "Sampsa's Golden Axe (Magic Axe)",
  "Shag's Battle":             "Shag's Battle Axe (Magic Axe)",
  "Sulward's":                 "Sulward's Axe (Magic Axe)",
  "Thor's Kiss":               "Thor's Kiss (Magic Axe)",
  'Torshorak':                 'Torshorak Axe (Magic Axe)',
  "Tunnelrunner's":            "Tunnelrunner's Axe (Magic Axe)",
  'Withering Pickaxe':         'Withering Pickaxe (Magic Axe)',
  'of the Woodsman':           'Axe of the Woodsman (Magic Axe)',
  "Zebulon's of Leaving":      "Zebulon's Axe of Leaving (Magic Axe)",
  "Zzzzzz's of Snoring":       "Zzzzzz's Axe of Snoring (Magic Axe)",
  // ── Famous swords ──
  'Frost Brand':               'Frost Brand (Magic Sword)',
  'Holy Avenger':              'Holy Avenger (Magic Sword)',
  'Excalibur':                 'Excalibur (Magic Sword)',
  'Blackrazor':                'Blackrazor (Magic Sword)',
  'Stormbringer':              'Stormbringer (Magic Sword)',
  'Defender':                  'Defender (Magic Sword)',
  'Flame Tongue':              'Flame Tongue (Magic Sword)',
  'Sun Blade':                 'Sun Blade (Magic Sword)',
  'Luck Blade':                'Luck Blade (Magic Sword)',
};

// ── Build full display name ────────────────────────────────────────────────────
// "of X" / "the X" → "{Cat} of X" / "{Cat} the X", else "{name} {Cat}"
function buildFullName(catKey, norm) {
  const lc = norm.toLowerCase();
  return (lc.startsWith('of ') || lc.startsWith('the '))
    ? `${catKey} ${norm}`
    : `${norm} ${catKey}`;
}

// ── Build wiki page title (standard format) ────────────────────────────────────
function buildWikiTitle(catKey, norm) {
  const fullName = buildFullName(catKey, norm);
  const singular = WIKI_SINGULAR[catKey] ?? catKey;
  return `${fullName} (Magic ${singular})`;
}

// ── Build all candidate wiki page titles to try in order ─────────────────────
// Returns a deduped array of title strings, first match wins.
function buildTitleCandidates(catKey, norm) {
  const singular = WIKI_SINGULAR[catKey] ?? catKey;
  const lc       = norm.toLowerCase();
  const isOf     = lc.startsWith('of ');
  const isThe    = lc.startsWith('the ');

  const seen = new Set();
  const out  = [];
  const add  = t => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };

  // 1. Manual override from S3_WIKI_LINKS_MAP (verified correct title)
  const mapped = S3_WIKI_LINKS_MAP[norm];
  if (mapped) add(mapped);

  // 2. Standard computed format — handles "of X" / "the X" inversion
  //    e.g. "of Aggravation" → "Arrow of Aggravation (Magic Arrow)"
  //         "Acid"           → "Acid Arrow (Magic Arrow)"
  add(buildWikiTitle(catKey, norm));

  // 3. Always category-first (no inversion): "[Cat] [name] (Magic [Sing])"
  //    e.g. "Acid" → "Arrow Acid (Magic Arrow)"  (catches oddly titled pages)
  add(`${catKey} ${norm} (Magic ${singular})`);

  // 4. Item name only: "[name] (Magic [Sing])"
  //    e.g. "of Aggravation" → "of Aggravation (Magic Arrow)"
  add(`${norm} (Magic ${singular})`);

  // 5. "[Cat] of [name] (Magic [Sing])" — try "Cat of Name" for non-"of" items
  //    e.g. "Acid" → "Arrow of Acid (Magic Arrow)"
  if (!isOf && !isThe) {
    add(`${catKey} of ${norm} (Magic ${singular})`);
  }

  // 6. Plain category (no "Magic"): "[name] ([Cat])"
  //    e.g. "Acid" → "Acid (Arrow)"
  add(`${norm} (${catKey})`);

  // 7. "[name] (Magic Weapon)" — some items use the generic suffix
  add(`${norm} (Magic Weapon)`);

  // 8. "[Cat] [name] (Magic Weapon)" — category-first with generic suffix
  add(`${catKey} ${norm} (Magic Weapon)`);

  return out;
}

// ── Normalise short name ───────────────────────────────────────────────────────
function normaliseName(raw) {
  return String(raw)
    .replace(/[\u2018\u2019\u02BC]/g, "'")  // curly → straight apostrophe
    .replace(/\*+$/, '')                      // strip trailing *
    .trim();
}

// ── Convert wiki title to URL ──────────────────────────────────────────────────
function toWikiUrl(title) {
  return WIKI_BASE + title.replace(/\s+/g, '_');
}

// ── Strip disambig suffix to get DB name: "Foo (Magic Bar)" → "Foo" ───────────
function stripSuffix(title) {
  return title.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

// ── Build flat item list from S3_DATA ──────────────────────────────────────────
function buildItemList() {
  const items = [];
  const seen  = new Set();

  for (const [catKey, entries] of Object.entries(S3_DATA)) {
    if (catKey === '__special__') continue;
    for (const entry of entries) {
      const raw = entry.name ?? '';
      if (!raw) continue;
      const norm        = normaliseName(raw);
      if (!norm) continue;
      const displayName = buildFullName(catKey, norm);
      if (seen.has(displayName)) continue;
      seen.add(displayName);
      items.push({ catKey, norm, displayName });
    }
  }

  return items;
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiFetch(params, retry = 0) {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ ...params, format: 'json', origin: '*' }).toString();

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: { 'User-Agent': USER_AGENT, 'Accept': 'application/json' },
      signal:  AbortSignal.timeout(25_000),
    });
  } catch (err) {
    if (retry < MAX_RETRY) {
      const wait = 1_000 * 2 ** retry;
      process.stderr.write(`\n  ⚠ Network error (${err.message}) — retrying in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw err;
  }

  if (!res.ok) {
    if (retry < MAX_RETRY && res.status >= 500) {
      const wait = 1_000 * 2 ** retry;
      process.stderr.write(`\n  ⚠ HTTP ${res.status} — retrying in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  return res.json();
}

// ── Try multiple wiki page titles, return first hit ───────────────────────────
// Returns { raw, foundTitle } or { raw: null, foundTitle: null }
async function fetchWikitextWithFallback(candidates) {
  for (const title of candidates) {
    let data;
    try {
      data = await wikiFetch({
        action: 'query',
        titles: title,
        prop:   'revisions',
        rvprop: 'content',
      });
    } catch (err) {
      throw err; // propagate network errors; caller handles
    }

    const pages = data?.query?.pages ?? {};
    const page  = Object.values(pages)[0];

    // page.missing means 404; keep trying
    if (!page || page.missing !== undefined) {
      await sleep(50); // small gap between probes
      continue;
    }

    const raw = page?.revisions?.[0]?.['*'] ?? null;
    if (raw !== null) return { raw, foundTitle: title };

    await sleep(50);
  }

  return { raw: null, foundTitle: null };
}

// ── Parse wikitext → plain-text description + stat fields ────────────────────
function parseWikitext(raw) {
  if (!raw) return { description: null, valueGp: null };

  const stats = {};
  const templateMatch = raw.match(/\{\{Item([\s\S]*?)\n\}\}/);
  if (templateMatch) {
    for (const line of templateMatch[1].split('\n')) {
      const m = line.match(/\|\s*(\w+)\s*=\s*(.+)/);
      if (m) stats[m[1].toLowerCase().trim()] = m[2].trim();
    }
  }

  let body = raw.replace(/\{\{Item[\s\S]*?\n\}\}\n?/, '');
  body = body.replace(/\[\[Category:[^\]]+\]\]\n?/g, '');
  body = body.replace(/^[^\n]*\}\}\n?/, '');
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');
  body = body.replace(/\[\[([^\]]+)\]\]/g, '$1');
  body = body.replace(/'''([^']+)'''/g, '$1');
  body = body.replace(/''([^']+)''/g, '$1');
  body = body.replace(/\{\{br\}\}/gi, '\n');
  body = body.replace(/\{\{[^}]*\}\}/g, '');
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  let valueGp = null;
  const rawVal = stats.value ?? stats.gp ?? stats.cost ?? null;
  if (rawVal) {
    const m = rawVal.match(/\d+/);
    if (m) valueGp = parseInt(m[0], 10);
  }

  return { description: body || null, valueGp };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertItem({ displayName, description, sourceUrl, valueGp }) {
  await getPool().query(
    `INSERT INTO magical_items (name, category, description, source_url, table_letter, value_gp)
     VALUES ($1, 'weapon', $2, $3, 'S', $4)
     ON CONFLICT (name, category) DO UPDATE SET
       description = EXCLUDED.description,
       source_url  = EXCLUDED.source_url
     WHERE magical_items.description IS NULL
        OR magical_items.description = ''`,
    [displayName, description, sourceUrl, valueGp],
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  AD&D 2E S3 Special Weapons Importer                     ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Wiki     : ${WIKI_BASE}`);
  if (envFile)           console.log(`  Env      : ${envFile}`);
  if (DRY_RUN)           console.log('  Mode     : DRY RUN — no DB writes');
  if (MISSING_ONLY)      console.log('  Mode     : MISSING ONLY — skipping already-described items');
  if (LIMIT < Infinity)  console.log(`  Limit    : first ${LIMIT} items`);
  if (OFFSET > 0)        console.log(`  Offset   : skipping first ${OFFSET} items`);

  const allItems = buildItemList();

  // ── --missing-only: fetch names already in DB with a description ─────────
  let existingNames = new Set();
  if (MISSING_ONLY && !DRY_RUN) {
    const res = await getPool().query(
      `SELECT name FROM magical_items
       WHERE table_letter = 'S'
         AND description IS NOT NULL
         AND description != ''`,
    );
    existingNames = new Set(res.rows.map(r => r.name));
    console.log(`  Already described in DB: ${existingNames.size} items`);
  }

  // ── Apply --missing-only filter, then --offset / --limit ─────────────────
  const filtered = MISSING_ONLY
    ? allItems.filter(it => !existingNames.has(it.displayName))
    : allItems;

  const slice = filtered.slice(OFFSET, LIMIT < Infinity ? OFFSET + LIMIT : undefined);

  console.log(`\n  Total in S3_DATA    : ${allItems.length}`);
  if (MISSING_ONLY) console.log(`  Pending (no desc)   : ${filtered.length}`);
  console.log(`  Processing          : ${slice.length}  (offset ${OFFSET})\n`);

  let success = 0, noPage = 0, noDesc = 0, failed = 0, altHit = 0;

  for (let n = 0; n < slice.length; n++) {
    const { catKey, norm, displayName } = slice[n];
    const candidates = buildTitleCandidates(catKey, norm);

    // ── Try all candidate titles ────────────────────────────────────────────
    let raw = null, foundTitle = null;
    try {
      ({ raw, foundTitle } = await fetchWikitextWithFallback(candidates));
    } catch (err) {
      process.stderr.write(`\n  ✗ Fetch "${displayName}": ${err.message}`);
      failed++;
      await sleep(500);
      progress(n + 1, slice.length, failed, noPage);
      continue;
    }

    if (raw === null) {
      noPage++;
      progress(n + 1, slice.length, failed, noPage);
      await sleep(DELAY_MS);
      continue;
    }

    // Track when we used a non-primary candidate
    const isAltHit = foundTitle !== candidates[0] && foundTitle !== buildWikiTitle(catKey, norm);
    if (isAltHit) altHit++;

    // ── Parse ────────────────────────────────────────────────────────────────
    const { description, valueGp } = parseWikitext(raw);
    if (!description) noDesc++;

    const sourceUrl = toWikiUrl(foundTitle);

    if (DRY_RUN) {
      const cIdx    = candidates.indexOf(foundTitle) + 1;
      const preview = description
        ? description.slice(0, 65).replace(/\n/g, ' ') + (description.length > 65 ? '…' : '')
        : '(no description parsed)';
      const flag = isAltHit ? ` [alt:${cIdx}]` : '';
      console.log(`  [DRY]${flag} ${displayName.padEnd(40)} → ${foundTitle}`);
      console.log(`        ${preview}`);
    } else {
      try {
        // Always store under the canonical display name ("Abaris' Arrow")
        await upsertItem({ displayName, description, sourceUrl, valueGp });

        // Also store under the wiki page base name if it differs
        // e.g. "Abaris's Arrow" (from wiki) ≠ "Abaris' Arrow" (display)
        const wikiBaseName = stripSuffix(foundTitle);
        if (wikiBaseName && wikiBaseName !== displayName) {
          await upsertItem({
            displayName: wikiBaseName,
            description,
            sourceUrl,
            valueGp,
          });
        }

        success++;
      } catch (err) {
        process.stderr.write(`\n  ✗ DB "${displayName}": ${err.message}`);
        failed++;
        await sleep(DELAY_MS);
        progress(n + 1, slice.length, failed, noPage);
        continue;
      }
    }

    progress(n + 1, slice.length, failed, noPage);
    await sleep(DELAY_MS);
  }

  process.stdout.write('\n');
  console.log(
    `\n  ✅ ${success} upserted, ` +
    `${altHit} via alternate title, ` +
    `${noDesc} had no description text, ` +
    `${noPage} pages not found, ` +
    `${failed} failed`,
  );
  console.log(`${'═'.repeat(58)}`);

  if (!DRY_RUN && _pool) await _pool.end();
}

function progress(done, total, errors, missing) {
  const pct = Math.floor((done / total) * 50);
  const bar = '█'.repeat(pct) + '░'.repeat(50 - pct);
  process.stdout.write(`\r  [${bar}] ${done}/${total}  (${errors} err, ${missing} not found)`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
