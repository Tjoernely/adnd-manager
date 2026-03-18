#!/usr/bin/env node
/**
 * scripts/import-item-descriptions.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches descriptions for ALL magical item categories (A–T) from the Fandom
 * wiki and UPSERTs them into the magical_items table in PostgreSQL.
 *
 * Two modes:
 *   1. UPDATE existing items that have no description (--missing flag)
 *   2. DISCOVER new items from wiki category pages and insert them
 *
 * Run from the server/ directory (so .env is found automatically):
 *   cd /var/www/adnd-manager/server && npm run import:items-all
 *
 * Options:
 *   --table A      Only process table A (can repeat: --table A --table C)
 *   --missing      Only process items with no description (skip discovery)
 *   --limit N      Stop after N items per table
 *   --dry-run      Fetch + parse but don't write to DB
 *
 * Examples:
 *   npm run import:items-all -- --missing               # fix all missing descs
 *   npm run import:items-all -- --table A --dry-run     # preview table A
 *   npm run import:items-all -- --table C --table D     # rings + rods only
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
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const MISSING = args.includes('--missing');
const LIMIT   = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();

// --table can be given multiple times; collect all values
const TABLE_FILTER = new Set(
  args.flatMap((a, i) => a === '--table' ? [args[i + 1]?.toUpperCase()] : []).filter(Boolean),
);

// ── Constants ──────────────────────────────────────────────────────────────────
const WIKI_API   = 'https://adnd2e.fandom.com/api.php';
const WIKI_BASE  = 'https://adnd2e.fandom.com/wiki/';
const USER_AGENT = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS   = 200;
const MAX_RETRY  = 3;

// ── Table configuration ───────────────────────────────────────────────────────
// wikiSuffixes: ordered list of "(…)" suffixes to append to base name when
//               building title candidates for items lacking a source_url.
// wikiCategories: Fandom wiki category names to crawl for new items.
const TABLE_CONFIG = {
  A: {
    category:       'liquid',
    wikiSuffixes:   ['(Magical Liquid)', '(EM)'],
    wikiCategories: ['Magical_Liquids', 'Potions'],
  },
  B: {
    category:       'scroll',
    wikiSuffixes:   ['(Enchantment)', '(EM)', '(Magic Scroll)'],
    wikiCategories: ['Scrolls_(AD&D)', 'Magic_scrolls'],
  },
  C: {
    category:       'ring',
    wikiSuffixes:   ['(Magic Ring)', '(EM)'],
    wikiCategories: ['Magic_rings'],
  },
  D: {
    category:       'rod',
    wikiSuffixes:   ['(Magic Rod)', '(EM)'],
    wikiCategories: ['Magic_rods'],
  },
  E: {
    category:       'staff',
    wikiSuffixes:   ['(Magic Staff)', '(EM)'],
    wikiCategories: ['Magic_staves'],
  },
  F: {
    category:       'wand',
    wikiSuffixes:   ['(Magic Wand)', '(EM)'],
    wikiCategories: ['Magic_wands'],
  },
  G: {
    category:       'book',
    wikiSuffixes:   ['(EM)', '(Magic Book)'],
    wikiCategories: ['Magic_books'],
  },
  H: {
    category:       'gem',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: ['Jewelry_(AD&D)'],
  },
  I: {
    category:       'clothing',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: [],
  },
  J: {
    category:       'boots_gloves',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: [],
  },
  K: {
    category:       'girdle_helm',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: [],
  },
  L: {
    category:       'bag_bottle',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: [],
  },
  M: {
    category:       'dust_stone',
    wikiSuffixes:   ['(EM)'],
    wikiCategories: [],
  },
  N: {
    category:       'household',
    wikiSuffixes:   ['(Household Item)', '(EM)', '(Magic Item)'],
    wikiCategories: [],
  },
  O: {
    category:       'instrument',
    wikiSuffixes:   ['(EM)', '(Magical Liquid)'],
    wikiCategories: [],
  },
  P: {
    category:       'weird',
    wikiSuffixes:   ['(EM)', '(Magical Liquid)', '(Wizard Spell)', '(Enhancement)', '(Magic Item)'],
    wikiCategories: [],
  },
  Q: {
    category:       'humorous',
    wikiSuffixes:   ['(Humorous Item)', '(EM)', '(Magic Item)'],
    wikiCategories: [],
  },
  R: {
    category:       'armor',
    wikiSuffixes:   ['(Magic Armor)', '(EM)'],
    wikiCategories: ['Magic_armor'],
  },
  T: {
    category:       'artifact',
    wikiSuffixes:   ['(Artifact)', '(EM)', '(Magic Item)'],
    wikiCategories: ['Artifacts_(AD&D)'],
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Extract wiki page title from a Fandom URL. */
function titleFromUrl(url) {
  if (!url) return null;
  try {
    const path = new URL(url).pathname; // "/wiki/Foo_Bar_(Baz)"
    const raw  = path.replace(/^\/wiki\//, '');
    return decodeURIComponent(raw).replace(/_/g, ' ');
  } catch {
    return null;
  }
}

/** Strip any trailing "(…)" suffix to get a base item name. */
function stripSuffix(name) {
  return name.replace(/\s*\([^)]+\)\s*$/, '').trim();
}

/** Build candidate wiki page titles for an item, in priority order. */
function buildCandidates(name, sourceUrl, conf) {
  const seen = new Set();
  const out  = [];
  const add  = t => { if (t && !seen.has(t)) { seen.add(t); out.push(t); } };

  // 1. From source_url — most reliable when present
  add(titleFromUrl(sourceUrl));

  // 2. Name as-is — works when name already includes suffix, e.g. "Crown (EM)"
  add(name);

  // 3. Strip existing suffix, then try each wikiSuffix
  const baseName = stripSuffix(name);
  if (baseName && baseName !== name) {
    for (const sfx of conf.wikiSuffixes) {
      add(`${baseName} ${sfx}`);
    }
  }

  // 4. Try each suffix on the full name too (e.g. name has no suffix yet)
  for (const sfx of conf.wikiSuffixes) {
    if (!name.endsWith(sfx)) add(`${name} ${sfx}`);
  }

  // 5. Plain name without any suffix — last resort before wiki search
  add(baseName);

  return out;
}

/** Convert wiki page title to canonical URL. */
function toWikiUrl(title) {
  return WIKI_BASE + title.replace(/\s+/g, '_');
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

/** Try multiple page titles; return { raw, foundTitle } for first hit or nulls. */
async function fetchWikitextWithFallback(candidates) {
  for (const title of candidates) {
    let data;
    try {
      data = await wikiFetch({ action: 'query', titles: title, prop: 'revisions', rvprop: 'content' });
    } catch (err) {
      throw err;
    }
    const page = Object.values(data?.query?.pages ?? {})[0];
    if (!page || page.missing !== undefined) { await sleep(50); continue; }
    const raw = page?.revisions?.[0]?.['*'] ?? null;
    if (raw !== null) return { raw, foundTitle: title };
    await sleep(50);
  }
  return { raw: null, foundTitle: null };
}

/** Search the wiki API for a page matching a name. Returns best-match title or null. */
async function searchWiki(query) {
  try {
    const data = await wikiFetch({
      action:      'query',
      list:        'search',
      srsearch:    query,
      srnamespace: '0',
      srlimit:     '3',
    });
    const results = data?.query?.search ?? [];
    if (!results.length) return null;
    // Prefer exact title match, else return first result
    const exact = results.find(r => r.title.toLowerCase() === query.toLowerCase());
    return (exact ?? results[0]).title;
  } catch {
    return null;
  }
}

/** Fetch all pages in a Fandom wiki category (handles continuation). */
async function fetchCategoryMembers(categoryName) {
  const members = [];
  let cmcontinue;
  do {
    const params = {
      action:  'query',
      list:    'categorymembers',
      cmtitle: `Category:${categoryName}`,
      cmtype:  'page',
      cmlimit: '500',
    };
    if (cmcontinue) params.cmcontinue = cmcontinue;
    let data;
    try {
      data = await wikiFetch(params);
    } catch (err) {
      process.stderr.write(`\n  ⚠ Failed to fetch category "${categoryName}": ${err.message}`);
      break;
    }
    const batch = data?.query?.categorymembers ?? [];
    members.push(...batch);
    cmcontinue = data?.continue?.cmcontinue;
  } while (cmcontinue);
  return members; // [{ title, pageid, ns }]
}

// ── Wikitext parser ───────────────────────────────────────────────────────────
function parseWikitext(raw) {
  if (!raw) return { description: null, valueGp: null };

  // Extract stat fields from {{Item\n...\n}} or {{Potion\n...\n}} etc.
  const stats = {};
  const tmplMatch = raw.match(/\{\{\w[^|{]*\n([\s\S]*?)\n\}\}/);
  if (tmplMatch) {
    for (const line of tmplMatch[1].split('\n')) {
      const m = line.match(/\|\s*(\w+)\s*=\s*(.+)/);
      if (m) stats[m[1].toLowerCase().trim()] = m[2].trim();
    }
  }

  // Body: strip the first {{...}} template block, then clean up
  let body = raw.replace(/\{\{\w[^|{]*[\s\S]*?\n\}\}\n?/, '');

  body = body.replace(/\[\[Category:[^\]]+\]\]\n?/g, '');
  body = body.replace(/^[^\n]*\}\}\n?/, '');                      // stray }}
  body = body.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2');      // [[Page|Text]] → Text
  body = body.replace(/\[\[([^\]]+)\]\]/g, '$1');                  // [[Page]] → Page
  body = body.replace(/'''([^']+)'''/g, '$1');                     // bold
  body = body.replace(/''([^']+)''/g, '$1');                       // italic
  body = body.replace(/\{\{br\}\}/gi, '\n');
  body = body.replace(/\{\{[^}]*\}\}/g, '');                       // remaining templates
  body = body.replace(/==+[^=]+==+\n?/g, '');                      // section headings
  body = body.replace(/\n{3,}/g, '\n\n').trim();

  let valueGp = null;
  const rawVal = stats.value ?? stats.gp ?? stats.cost ?? null;
  if (rawVal) {
    const m = rawVal.match(/\d+/);
    if (m) valueGp = parseInt(m[0], 10);
  }

  let xpValue = null;
  const rawXp = stats.xp ?? null;
  if (rawXp && rawXp !== '—' && rawXp !== '-') {
    const m = rawXp.match(/\d+/);
    if (m) xpValue = parseInt(m[0], 10);
  }

  return { description: body || null, valueGp, xpValue };
}

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Fetch items for a table (or all tables) from DB. */
async function fetchDbItems(tables, missingOnly) {
  const pool = getPool();
  const whereParts = [];
  const vals = [];

  if (tables.length) {
    whereParts.push(`table_letter = ANY($${vals.length + 1})`);
    vals.push(tables);
  }
  if (tables.includes('S')) {
    // Skip S — handled by import-s3-items.mjs
    whereParts.push(`table_letter != 'S'`);
  } else if (!tables.length) {
    whereParts.push(`table_letter != 'S'`);
  }

  if (missingOnly) {
    whereParts.push(`(description IS NULL OR description = '')`);
  }

  const where = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const res = await pool.query(
    `SELECT id, name, category, table_letter, source_url,
            (description IS NOT NULL AND description != '') AS has_desc
     FROM magical_items ${where}
     ORDER BY table_letter, name`,
    vals,
  );
  return res.rows;
}

/** Fetch all existing item names for collision detection during discovery. */
async function fetchExistingNames() {
  const res = await getPool().query(
    `SELECT LOWER(name) AS lname FROM magical_items`,
  );
  return new Set(res.rows.map(r => r.lname));
}

/** Upsert: insert new item or fill in missing description on existing row. */
async function upsertItem({ name, category, tableLetter, description, sourceUrl, valueGp, xpValue }) {
  await getPool().query(
    `INSERT INTO magical_items
       (name, category, table_letter, description, source_url, value_gp, xp_value)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name, category) DO UPDATE SET
       description = EXCLUDED.description,
       source_url  = COALESCE(EXCLUDED.source_url, magical_items.source_url),
       xp_value    = COALESCE(EXCLUDED.xp_value, magical_items.xp_value)
     WHERE magical_items.description IS NULL
        OR magical_items.description = ''`,
    [name, category, tableLetter, description, sourceUrl, valueGp, xpValue],
  );
}

// ── Process a single item: find its wiki page, parse, upsert ─────────────────
async function processItem({ name, category, table_letter: tableLetter, source_url: sourceUrl, conf, stats }) {
  const candidates = buildCandidates(name, sourceUrl, conf);

  // Fetch wikitext via candidate titles
  let raw = null, foundTitle = null;
  try {
    ({ raw, foundTitle } = await fetchWikitextWithFallback(candidates));
  } catch (err) {
    process.stderr.write(`\n  ✗ Fetch "${name}": ${err.message}`);
    stats.failed++;
    return;
  }

  // Fallback: wiki search
  if (!raw) {
    const baseName  = stripSuffix(name);
    const searchHit = await searchWiki(baseName || name);
    if (searchHit) {
      try {
        ({ raw, foundTitle } = await fetchWikitextWithFallback([searchHit]));
      } catch { /* ignore */ }
    }
  }

  if (!raw) {
    stats.noPage++;
    return;
  }

  const { description, valueGp, xpValue } = parseWikitext(raw);
  if (!description) stats.noDesc++;

  const resolvedUrl = toWikiUrl(foundTitle);

  if (DRY_RUN) {
    const preview = description
      ? description.slice(0, 65).replace(/\n/g, ' ') + (description.length > 65 ? '…' : '')
      : '(no description)';
    console.log(`  [DRY] [${tableLetter}] ${name.padEnd(45)} → ${foundTitle}`);
    console.log(`        ${preview}`);
    stats.success++;
    return;
  }

  try {
    await upsertItem({ name, category, tableLetter, description, sourceUrl: resolvedUrl, valueGp, xpValue });
    stats.success++;
  } catch (err) {
    process.stderr.write(`\n  ✗ DB "${name}": ${err.message}`);
    stats.failed++;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  AD&D 2E Magical Items Description Importer              ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Wiki     : ${WIKI_BASE}`);
  if (envFile)           console.log(`  Env      : ${envFile}`);
  if (DRY_RUN)           console.log('  Mode     : DRY RUN — no DB writes');
  if (MISSING)           console.log('  Mode     : MISSING ONLY — update items with no description');
  if (TABLE_FILTER.size) console.log(`  Tables   : ${[...TABLE_FILTER].join(', ')}`);
  if (LIMIT < Infinity)  console.log(`  Limit    : ${LIMIT} items per table`);

  // Determine which tables to process
  const allTables = Object.keys(TABLE_CONFIG).filter(t => t !== 'S');
  const tables    = TABLE_FILTER.size
    ? [...TABLE_FILTER].filter(t => TABLE_CONFIG[t] && t !== 'S')
    : allTables;

  if (!tables.length) {
    console.error('\n  ERROR: No valid tables to process (Table S is handled by import-s3-items.mjs)');
    process.exit(1);
  }

  console.log(`\n  Tables to process: ${tables.join(', ')}\n`);

  const totalStats = { success: 0, noPage: 0, noDesc: 0, failed: 0, discovered: 0 };

  for (const tbl of tables) {
    const conf = TABLE_CONFIG[tbl];
    console.log(`\n── Table ${tbl} (${conf.category}) ──────────────────────────────────────────`);

    const stats = { success: 0, noPage: 0, noDesc: 0, failed: 0, discovered: 0 };

    // ── Phase 1: Update existing items missing descriptions ──────────────────
    let items;
    try {
      items = await fetchDbItems([tbl], true /* missingOnly */);
    } catch (err) {
      console.error(`  ERROR fetching items: ${err.message}`);
      continue;
    }

    if (items.length) {
      console.log(`  Existing items missing description: ${items.length}`);
      const slice = items.slice(0, LIMIT < Infinity ? LIMIT : undefined);
      for (let n = 0; n < slice.length; n++) {
        const item = slice[n];
        await processItem({ ...item, conf, stats });
        progressLine(n + 1, slice.length, `${tbl} update`, stats.failed, stats.noPage);
        await sleep(DELAY_MS);
      }
      if (slice.length) process.stdout.write('\n');
      console.log(`  Updated: ${stats.success} filled, ${stats.noPage} not on wiki, ${stats.failed} errors`);
    } else {
      console.log('  All existing items already have descriptions ✓');
    }

    // ── Phase 2: Discover new items from wiki category pages ─────────────────
    if (!MISSING && conf.wikiCategories.length) {
      console.log(`  Discovering new items from ${conf.wikiCategories.length} wiki category page(s)…`);

      // Build set of existing names for this table (lowercase for comparison)
      const existingRes = await getPool().query(
        `SELECT LOWER(name) AS lname FROM magical_items WHERE table_letter = $1`,
        [tbl],
      );
      const existing = new Set(existingRes.rows.map(r => r.lname));

      for (const catName of conf.wikiCategories) {
        console.log(`  ↳ Category: ${catName}`);
        const members = await fetchCategoryMembers(catName);
        console.log(`    Found ${members.length} pages`);

        // Filter to pages not already in DB
        const newPages = members.filter(m => !existing.has(m.title.toLowerCase()));
        console.log(`    New (not in DB): ${newPages.length}`);

        const slice = newPages.slice(0, LIMIT < Infinity ? LIMIT : undefined);
        for (let n = 0; n < slice.length; n++) {
          const { title } = slice[n];
          const sourceUrl = toWikiUrl(title);

          let raw = null, foundTitle = null;
          try {
            ({ raw, foundTitle } = await fetchWikitextWithFallback([title]));
          } catch (err) {
            process.stderr.write(`\n  ✗ Fetch "${title}": ${err.message}`);
            stats.failed++;
            await sleep(500);
            continue;
          }

          if (!raw) {
            stats.noPage++;
            await sleep(DELAY_MS);
            continue;
          }

          const { description, valueGp, xpValue } = parseWikitext(raw);
          if (!description) stats.noDesc++;

          if (DRY_RUN) {
            const preview = description
              ? description.slice(0, 60).replace(/\n/g, ' ') + '…'
              : '(no description)';
            console.log(`    [DRY] ${title.padEnd(48)} ${preview}`);
            stats.discovered++;
          } else {
            try {
              await upsertItem({
                name:        title,
                category:    conf.category,
                tableLetter: tbl,
                description,
                sourceUrl:   toWikiUrl(foundTitle),
                valueGp,
                xpValue,
              });
              existing.add(title.toLowerCase());
              stats.discovered++;
            } catch (err) {
              process.stderr.write(`\n  ✗ DB "${title}": ${err.message}`);
              stats.failed++;
            }
          }

          progressLine(n + 1, slice.length, `${tbl} discover`, stats.failed, stats.noPage);
          await sleep(DELAY_MS);
        }
        if (slice.length) process.stdout.write('\n');
        console.log(`    Inserted/updated: ${stats.discovered} new items`);

        await sleep(500); // polite gap between category fetches
      }
    }

    // Accumulate totals
    for (const k of Object.keys(totalStats)) totalStats[k] += stats[k];

    console.log(
      `  Table ${tbl} totals: ${stats.success} updated, ${stats.discovered} discovered, ` +
      `${stats.noPage} not on wiki, ${stats.noDesc} no text, ${stats.failed} errors`,
    );
  }

  console.log('\n' + '═'.repeat(58));
  console.log(
    `  TOTAL: ${totalStats.success} updated, ${totalStats.discovered} discovered, ` +
    `${totalStats.noPage} not on wiki, ${totalStats.failed} errors`,
  );
  console.log('═'.repeat(58));

  if (!DRY_RUN && _pool) await _pool.end();
}

function progressLine(done, total, label, errors, missing) {
  const pct = Math.floor((done / total) * 40);
  const bar = '█'.repeat(pct) + '░'.repeat(40 - pct);
  process.stdout.write(`\r  [${bar}] ${done}/${total} ${label}  (${errors} err, ${missing} not found)`);
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
