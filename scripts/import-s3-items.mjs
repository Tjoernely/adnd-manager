#!/usr/bin/env node
/**
 * scripts/import-s3-items.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches S3 special weapon descriptions from the Fandom wiki (MediaWiki API)
 * and UPSERTs them into the magical_items table in PostgreSQL.
 *
 * Full display names are built from category + partial name (e.g. "Arrow of Aggravation").
 * Wiki page titles use the "(Magic {Category})" suffix matching the Fandom wiki format.
 *
 * Run from the server/ directory (so .env is found automatically):
 *   cd server && node ../scripts/import-s3-items.mjs [options]
 *
 * Or via npm script in server/:
 *   npm run import:s3items
 *
 * Options:
 *   --dry-run     Fetch + parse but don't write to DB
 *   --limit  N    Stop after N items (testing)
 *   --offset N    Skip first N items (resuming a partial run)
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

// Import S3 item data from the frontend source
import { S3_DATA } from '../src/components/items/s3_data.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env ────────────────────────────────────────────────────────────────
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

// ── pg Pool — lazy init so --dry-run works without DB ────────────────────────
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

// ── CLI args ─────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = (() => { const i = args.indexOf('--limit');  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();
const OFFSET  = (() => { const i = args.indexOf('--offset'); return i !== -1 ? parseInt(args[i + 1], 10) : 0; })();

// ── Constants ─────────────────────────────────────────────────────────────────
const WIKI_API   = 'https://adnd2e.fandom.com/api.php';
const WIKI_BASE  = 'https://adnd2e.fandom.com/wiki/';
const USER_AGENT = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS   = 200;
const MAX_RETRY  = 3;

// ── Category → wiki suffix (singular) map ────────────────────────────────────
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

// ── Build full display name: "of X" → "{Cat} of X", else "{name} {Cat}" ──────
function buildFullName(catKey, partialName) {
  const norm  = String(partialName).replace(/[\u2018\u2019\u02BC]/g, "'");
  const lcN   = norm.toLowerCase();
  return (lcN.startsWith('of ') || lcN.startsWith('the '))
    ? `${catKey} ${norm}`
    : `${norm} ${catKey}`;
}

// ── Build wiki page title: "{fullName} (Magic {Singular})" ────────────────────
function buildWikiTitle(catKey, partialName) {
  const fullName = buildFullName(catKey, partialName);
  const singular = WIKI_SINGULAR[catKey] ?? catKey;
  return `${fullName} (Magic ${singular})`;
}

// ── Convert wiki page title to URL (spaces → underscores) ────────────────────
function toWikiUrl(title) {
  return WIKI_BASE + title.replace(/\s+/g, '_');
}

// ── Build flat item list from S3_DATA ─────────────────────────────────────────
function buildItemList() {
  const items = [];
  const seen  = new Set();

  for (const [catKey, entries] of Object.entries(S3_DATA)) {
    if (catKey === '__special__') continue; // skip meta/redirect entries
    for (const entry of entries) {
      const raw = entry.name ?? '';
      if (!raw) continue;
      // Strip trailing * (marks cross-reference entries like "Missile Weapon of Distance*")
      const partial = raw.replace(/\*+$/, '').trim();
      if (!partial) continue;
      const fullName  = buildFullName(catKey, partial);
      const wikiPage  = buildWikiTitle(catKey, partial);
      if (seen.has(fullName)) continue;
      seen.add(fullName);
      items.push({ displayName: fullName, wikiPage });
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

// ── Fetch raw wikitext for a page title ───────────────────────────────────────
// Returns null if the page does not exist (page.missing).
async function fetchWikitext(pageTitle) {
  const data = await wikiFetch({
    action: 'query',
    titles: pageTitle,
    prop:   'revisions',
    rvprop: 'content',
  });
  const pages = data?.query?.pages ?? {};
  const page  = Object.values(pages)[0];
  if (!page || page.missing !== undefined) return null;
  return page?.revisions?.[0]?.['*'] ?? null;
}

// ── Parse wikitext → plain-text description + stat fields ────────────────────
function parseWikitext(raw) {
  if (!raw) return { description: null, valueGp: null };

  // Extract fields from {{Item\n...\n}} multi-line template
  const stats = {};
  const templateMatch = raw.match(/\{\{Item([\s\S]*?)\n\}\}/);
  if (templateMatch) {
    for (const line of templateMatch[1].split('\n')) {
      const m = line.match(/\|\s*(\w+)\s*=\s*(.+)/);
      if (m) stats[m[1].toLowerCase().trim()] = m[2].trim();
    }
  }

  // Body text: everything after the closing }} of the Item template
  let body = raw.replace(/\{\{Item[\s\S]*?\n\}\}\n?/, '');

  // Strip Category links
  body = body.replace(/\[\[Category:[^\]]+\]\]\n?/g, '');

  // Safety: strip any stray }} remnant on its own line
  body = body.replace(/^[^\n]*\}\}\n?/, '');

  // Convert [[Page|Display text]] → Display text
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');

  // Convert [[Page]] → Page
  body = body.replace(/\[\[([^\]]+)\]\]/g, '$1');

  // Strip '''bold''' and ''italic'' markers
  body = body.replace(/'''([^']+)'''/g, '$1');
  body = body.replace(/''([^']+)''/g, '$1');

  // {{br}} → line break
  body = body.replace(/\{\{br\}\}/gi, '\n');

  // Strip remaining {{ ... }} templates
  body = body.replace(/\{\{[^}]*\}\}/g, '');

  // Normalise whitespace
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  // Parse value_gp from template (first integer found in value/gp/cost field)
  let valueGp = null;
  const rawVal = stats.value ?? stats.gp ?? stats.cost ?? null;
  if (rawVal) {
    const m = rawVal.match(/\d+/);
    if (m) valueGp = parseInt(m[0], 10);
  }

  return {
    description: body || null,
    valueGp,
  };
}

// ── DB upsert ─────────────────────────────────────────────────────────────────
// Only overwrites description/source_url if the existing row has no description.
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
  if (LIMIT < Infinity)  console.log(`  Limit    : first ${LIMIT} items`);
  if (OFFSET > 0)        console.log(`  Offset   : skipping first ${OFFSET} items`);

  const allItems = buildItemList();
  const slice    = allItems.slice(OFFSET, LIMIT < Infinity ? OFFSET + LIMIT : undefined);

  console.log(`\n  Items in S3_DATA : ${allItems.length}`);
  console.log(`  Processing       : ${slice.length}  (offset ${OFFSET})\n`);

  let success = 0, noPage = 0, noDesc = 0, failed = 0;

  for (let n = 0; n < slice.length; n++) {
    const { displayName, wikiPage } = slice[n];
    const sourceUrl = toWikiUrl(wikiPage);

    // ── Fetch wikitext ───────────────────────────────────────────────────────
    let raw = null;
    try {
      raw = await fetchWikitext(wikiPage);
    } catch (err) {
      process.stderr.write(`\n  ✗ Fetch "${wikiPage}": ${err.message}`);
      failed++;
      await sleep(500);
      progress(n + 1, slice.length, failed, noPage);
      continue;
    }

    if (raw === null) {
      // Wiki page does not exist — skip (don't write a blank row)
      noPage++;
      progress(n + 1, slice.length, failed, noPage);
      await sleep(DELAY_MS);
      continue;
    }

    // ── Parse ────────────────────────────────────────────────────────────────
    const { description, valueGp } = parseWikitext(raw);

    if (!description) noDesc++;

    if (DRY_RUN) {
      const preview = description
        ? description.slice(0, 70).replace(/\n/g, ' ') + (description.length > 70 ? '…' : '')
        : '(no description parsed)';
      console.log(`  [DRY] ${displayName.padEnd(42)} ${wikiPage}`);
      console.log(`         ${preview}`);
    } else {
      try {
        await upsertItem({ displayName, description, sourceUrl, valueGp });
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
  console.log(`\n  ✅ ${success} upserted, ${noDesc} had no description text, ${noPage} wiki pages missing, ${failed} failed`);
  console.log(`${'═'.repeat(58)}`);

  if (!DRY_RUN && _pool) await _pool.end();
}

function progress(done, total, errors, missing) {
  const pct = Math.floor((done / total) * 50);
  const bar = '█'.repeat(pct) + '░'.repeat(50 - pct);
  process.stdout.write(`\r  [${bar}] ${done}/${total}  (${errors} err, ${missing} missing)`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
