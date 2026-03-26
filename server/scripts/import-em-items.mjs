/**
 * import-em-items.mjs
 *
 * Scrapes magical item tables from adnd2e.fandom.com (EM sourcebook)
 * and writes parsed items to a staging table for review / merge.
 *
 * Default (safe): --table A --dry-run --limit 10
 */

import { load }          from 'cheerio';
import pg                from 'pg';
import fs                from 'fs';
import path              from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool }  = pg;

// ── CLI parsing ───────────────────────────────────────────────────────────────
const ARGV = process.argv.slice(2);

function getFlag(name, defaultVal = null) {
  const i = ARGV.indexOf(name);
  return (i !== -1 && i + 1 < ARGV.length) ? ARGV[i + 1] : defaultVal;
}
function hasFlag(name) { return ARGV.includes(name); }

const tableArg  = (getFlag('--table', 'A')).toUpperCase();
const doAll     = hasFlag('--all');
const upsertDb  = hasFlag('--upsert-db') && !hasFlag('--dry-run');
const dryRun    = !upsertDb;
const writeJson = hasFlag('--write-json');
const delayMs   = parseInt(getFlag('--delay', '500'), 10);

// Limit defaults to 10 in dry-run, unlimited in upsert mode
const hasLimitFlag = ARGV.includes('--limit');
const limitN       = hasLimitFlag
  ? parseInt(getFlag('--limit', '10'), 10)
  : (upsertDb ? Number.MAX_SAFE_INTEGER : 10);

const tablesToProcess = doAll ? 'ABCDEFGHIJKLMNOPQRST'.split('') : [tableArg];

console.log('─'.repeat(64));
console.log('  import-em-items.mjs');
console.log(`  Tables  : ${doAll ? 'ALL (A–T)' : tablesToProcess.join(', ')}`);
console.log(`  Mode    : ${dryRun ? 'dry-run (no DB write)' : 'UPSERT to staging table'}`);
console.log(`  Limit   : ${limitN === Number.MAX_SAFE_INTEGER ? 'all' : limitN}`);
console.log(`  Delay   : ${delayMs}ms`);
console.log(`  JSON    : ${writeJson}`);
console.log('─'.repeat(64));

// ── Lazy DB pool ──────────────────────────────────────────────────────────────
let pool = null;
function getPool() {
  if (!pool) {
    pool = new Pool({
      host:     process.env.DB_HOST     || 'localhost',
      port:     parseInt(process.env.DB_PORT || '5432', 10),
      database: process.env.DB_NAME     || 'adnddb',
      user:     process.env.DB_USER     || 'adnduser',
      password: process.env.DB_PASSWORD || '',
    });
  }
  return pool;
}

// ── Table metadata ────────────────────────────────────────────────────────────
const BASE_WIKI = 'https://adnd2e.fandom.com';

const TABLE_WIKI_NAMES = {
  A: 'Magical Liquids',
  B: 'Scrolls',
  C: 'Rings',
  D: 'Rods',
  E: 'Staves',
  F: 'Wands',
  G: 'Books & Tomes',
  H: 'Gems & Jewelry',
  I: 'Clothing',
  J: 'Boots, Gloves & Accessories',
  K: 'Girdles & Helmets',
  L: 'Bags, Bands & Bottles',
  M: 'Dusts & Stones',
  N: 'Household Items',
  O: 'Musical Instruments',
  P: 'Weird Stuff',
  Q: 'Humorous Items',
  R: 'Armor & Shields',
  S: 'Weapons',
  T: 'Artifacts & Relics',
};

// Fallback URLs — used if index page discovery misses a table
const TABLE_URL_FALLBACKS = {
  A: BASE_WIKI + '/wiki/Magical_Liquids_(EM)',
  B: BASE_WIKI + '/wiki/Scrolls_(EM)',
  C: BASE_WIKI + '/wiki/Rings_(EM)',
  D: BASE_WIKI + '/wiki/Rods_(EM)',
  E: BASE_WIKI + '/wiki/Staves_(EM)',
  F: BASE_WIKI + '/wiki/Wands_(EM)',
  G: BASE_WIKI + '/wiki/Books_%26_Tomes_(EM)',
  H: BASE_WIKI + '/wiki/Gems_%26_Jewelry_(EM)',
  I: BASE_WIKI + '/wiki/Clothing_(EM)',
  J: BASE_WIKI + '/wiki/Boots%2C_Gloves_%26_Accessories_(EM)',
  K: BASE_WIKI + '/wiki/Girdles_%26_Helmets_(EM)',
  L: BASE_WIKI + '/wiki/Bags%2C_Bands_%26_Bottles_(EM)',
  M: BASE_WIKI + '/wiki/Dusts_%26_Stones_(EM)',
  N: BASE_WIKI + '/wiki/Household_Items_(EM)',
  O: BASE_WIKI + '/wiki/Musical_Instruments_(EM)',
  P: BASE_WIKI + '/wiki/Weird_Stuff_(EM)',
  Q: BASE_WIKI + '/wiki/Humorous_Items_(EM)',
  R: BASE_WIKI + '/wiki/Armor_%26_Shields_(EM)',
  S: BASE_WIKI + '/wiki/Weapons_(EM)',
  T: BASE_WIKI + '/wiki/Artifacts_%26_Relics_(EM)',
};

// ── Rate-limited fetch with retries ──────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, retries = 3, baseDelay = delayMs) {
  let currentDelay = baseDelay;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'ADnD-Manager-Bot/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (e) {
      if (attempt === retries) throw new Error(`${e.message} — ${url}`);
      console.warn(`    ⚠ Attempt ${attempt}/${retries} failed: ${e.message} — retry in ${currentDelay * 2}ms`);
      await sleep(currentDelay * 2);
      currentDelay *= 2;
    }
  }
}

// ── Discover table URLs from index page ───────────────────────────────────────
async function discoverTableUrls() {
  const INDEX_URL = BASE_WIKI + '/wiki/Magical_Item_Random_Determination_Tables_(EM)';
  const result    = { ...TABLE_URL_FALLBACKS };

  // Reverse map: normalized wiki name → letter
  const nameToLetter = {};
  for (const [letter, name] of Object.entries(TABLE_WIKI_NAMES)) {
    nameToLetter[name.toLowerCase()] = letter;
  }

  try {
    console.log(`\nDiscovering table URLs from index page…`);
    const html = await fetchWithRetry(INDEX_URL);
    await sleep(delayMs);
    const $ = load(html);
    let found = 0;

    $('.mw-parser-output a[href*="_(EM)"]').each((_, el) => {
      const href = $(el).attr('href') ?? '';
      if (!href.startsWith('/wiki/')) return;
      // Decode path, strip _(EM) suffix, replace underscores → spaces
      const pageName = decodeURIComponent(href.slice(6).replace('_(EM)', '')).replace(/_/g, ' ');
      const letter   = nameToLetter[pageName.toLowerCase()];
      if (letter) {
        result[letter] = BASE_WIKI + href;
        found++;
      }
    });

    console.log(`  Discovered ${found} table links (using fallbacks for the rest)`);
  } catch (e) {
    console.warn(`  ⚠ Index page fetch failed: ${e.message} — using fallback URLs`);
  }

  return result;
}

// ── Roll text parsing ─────────────────────────────────────────────────────────
function parseRoll(rollText) {
  // Normalise em/en dashes → hyphen
  const norm  = rollText.trim().replace(/[–—]/g, '-');
  const parts = norm.split('-').map(s => s.trim());
  const toNum = s => (s === '000' ? 1000 : parseInt(s.replace(/^0+/, '') || '0', 10));
  if (parts.length >= 2) {
    return { rollMin: toNum(parts[0]), rollMax: toNum(parts[parts.length - 1]) };
  }
  const n = toNum(parts[0]);
  return { rollMin: n, rollMax: n };
}

function isRollText(text) {
  const t = text.trim();
  return /^\d{1,4}[-–—]\d{1,4}$/.test(t) || /^\d{1,4}$/.test(t);
}

// ── Parse a single table page ─────────────────────────────────────────────────
function parseTablePage(tableCode, tableUrl, html) {
  const $       = load(html);
  const items   = [];
  let   currentCategory = '';

  // Target the first wikitable in the article body
  const table = $('.mw-parser-output table.wikitable, .mw-parser-output table').first();
  if (!table.length) {
    console.warn(`  ⚠ No table found at ${tableUrl}`);
    return items;
  }

  table.find('tr').each((_, tr) => {
    const cells     = $(tr).find('td, th');
    const cellCount = cells.length;
    if (!cellCount) return;

    const firstText = cells.eq(0).text().trim();

    // ── Category row ──────────────────────────────────────────────────────────
    // 1–2 cells and first cell is NOT a roll number
    if (cellCount <= 2 && !isRollText(firstText)) {
      const cat = firstText.replace(/\s+/g, ' ').trim();
      if (cat) currentCategory = cat;
      return;
    }

    // ── Item row ─────────────────────────────────────────────────────────────
    if (!isRollText(firstText)) return;

    const rollText = firstText;
    const { rollMin, rollMax } = parseRoll(rollText);

    const secondCell = cells.eq(1);
    const rawName    = secondCell.text().trim();
    if (!rawName) return;

    const anchor    = secondCell.find('a').first();
    const href      = anchor.attr('href') ?? null;
    const sourceUrl = (href && href.startsWith('/wiki/')) ? BASE_WIKI + href : null;
    const slug      = href ? href.slice(6) : null; // strip leading /wiki/

    // Apply final name rule
    const finalName = rawName.toLowerCase().startsWith('of ')
      ? `${currentCategory} ${rawName}`.trim()
      : rawName;

    items.push({
      tableCode,
      tableUrl,
      rollText,
      rollMin,
      rollMax,
      category:      currentCategory || null,
      rawName,
      finalName,
      slug,
      hasDetailPage: !!sourceUrl,
      sourceUrl,
      descTitle:     null,
      description:   null,
      warnings:      sourceUrl ? null : 'No detail page link',
    });
  });

  return items;
}

// ── Fetch description from a detail page ─────────────────────────────────────
async function fetchDescription(url) {
  try {
    const html = await fetchWithRetry(url);
    const $    = load(html);

    const title = ($('.page-header__title, h1.page-title, h1').first().text().trim()) || null;

    const paras = [];
    $('.mw-parser-output > p').each((_, el) => {
      if (paras.length >= 3) return false; // stop iteration
      const t = $(el).text().trim();
      if (t) paras.push(t);
    });

    const description = paras.join('\n').slice(0, 1000) || null;
    return { title, description, warning: null };
  } catch (e) {
    return { title: null, description: null, warning: e.message };
  }
}

// ── Get existing DB count for a table letter ──────────────────────────────────
async function getDbCount(letter) {
  try {
    const res = await getPool().query(
      `SELECT COUNT(*) AS cnt FROM magical_items WHERE UPPER(table_letter) = $1`,
      [letter],
    );
    return parseInt(res.rows[0].cnt, 10);
  } catch {
    return null;
  }
}

// ── Ensure staging table exists ───────────────────────────────────────────────
async function ensureStagingTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS magical_items_em_import (
      id                SERIAL PRIMARY KEY,
      slug              VARCHAR(300),
      name              VARCHAR(300) NOT NULL,
      raw_name          VARCHAR(300),
      category          VARCHAR(200),
      table_code        VARCHAR(5),
      table_url         TEXT,
      roll_text         VARCHAR(50),
      roll_min          INTEGER,
      roll_max          INTEGER,
      source_url        TEXT,
      description_title VARCHAR(300),
      description       TEXT,
      has_detail_page   BOOLEAN DEFAULT FALSE,
      import_warnings   TEXT,
      created_at        TIMESTAMP DEFAULT NOW(),
      updated_at        TIMESTAMP DEFAULT NOW(),
      UNIQUE(table_code, roll_min, roll_max)
    )
  `);

  const dbUser = process.env.DB_USER || 'adnduser';
  try {
    await client.query(`GRANT ALL ON magical_items_em_import TO ${dbUser}`);
    await client.query(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${dbUser}`);
  } catch { /* ignore on managed DBs */ }
}

// ── Upsert items into staging table ──────────────────────────────────────────
async function upsertItems(items) {
  const client = await getPool().connect();
  try {
    await ensureStagingTable(client);

    let inserted = 0, updated = 0;
    for (const item of items) {
      const { rows } = await client.query(
        `INSERT INTO magical_items_em_import
           (slug, name, raw_name, category, table_code, table_url,
            roll_text, roll_min, roll_max, source_url,
            description_title, description, has_detail_page, import_warnings)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         ON CONFLICT (table_code, roll_min, roll_max) DO UPDATE SET
           name              = EXCLUDED.name,
           raw_name          = EXCLUDED.raw_name,
           category          = EXCLUDED.category,
           source_url        = EXCLUDED.source_url,
           description_title = EXCLUDED.description_title,
           description       = EXCLUDED.description,
           has_detail_page   = EXCLUDED.has_detail_page,
           import_warnings   = EXCLUDED.import_warnings,
           updated_at        = NOW()
         RETURNING (xmax = 0) AS was_inserted`,
        [
          item.slug, item.finalName, item.rawName, item.category,
          item.tableCode, item.tableUrl, item.rollText, item.rollMin, item.rollMax,
          item.sourceUrl, item.descTitle, item.description, item.hasDetailPage, item.warnings,
        ],
      );
      if (rows[0]?.was_inserted) inserted++; else updated++;
    }
    console.log(`  DB: ${inserted} inserted, ${updated} updated`);
  } finally {
    client.release();
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const tableUrls = await discoverTableUrls();

  for (const tableCode of tablesToProcess) {
    const tableUrl = tableUrls[tableCode];
    if (!tableUrl) {
      console.error(`\n✗ No URL known for table ${tableCode} — skipping`);
      continue;
    }

    console.log(`\n${'═'.repeat(64)}`);
    console.log(`  Table ${tableCode} — ${TABLE_WIKI_NAMES[tableCode]}`);
    console.log(`  ${tableUrl}`);
    console.log('═'.repeat(64));

    // Fetch and parse the table page
    let html;
    try {
      html = await fetchWithRetry(tableUrl);
      await sleep(delayMs);
    } catch (e) {
      console.error(`  ✗ Failed to fetch: ${e.message}`);
      continue;
    }

    const allItems = parseTablePage(tableCode, tableUrl, html);
    console.log(`  Parsed ${allItems.length} items from wiki`);

    if (!allItems.length) {
      console.warn('  ⚠ No items parsed — check table format on the wiki page');
      continue;
    }

    // Apply limit
    const items = allItems.slice(0, limitN);

    // Fetch descriptions for items that have a detail page link
    const withLink = items.filter(it => it.hasDetailPage);
    if (withLink.length) {
      console.log(`  Fetching ${withLink.length} description page${withLink.length !== 1 ? 's' : ''}…`);
      for (const item of withLink) {
        const { title, description, warning } = await fetchDescription(item.sourceUrl);
        item.descTitle   = title;
        item.description = description;
        if (warning) item.warnings = (item.warnings ? item.warnings + '; ' : '') + warning;
        process.stdout.write('.');
        await sleep(delayMs);
      }
      process.stdout.write('\n');
    }

    // ── Print first 10 parsed items ──────────────────────────────────────────
    console.log(`\n  First ${Math.min(10, items.length)} items:`);
    for (const item of items.slice(0, 10)) {
      console.log(JSON.stringify({
        tableCode:     item.tableCode,
        rollText:      item.rollText,
        rollMin:       item.rollMin,
        rollMax:       item.rollMax,
        category:      item.category,
        rawName:       item.rawName,
        finalName:     item.finalName,
        hasDetailPage: item.hasDetailPage,
        sourceUrl:     item.sourceUrl,
      }, null, 2));
    }

    // ── Summary ──────────────────────────────────────────────────────────────
    const dbCount   = await getDbCount(tableCode);
    const wikiCount = allItems.length;
    const diff      = dbCount != null ? wikiCount - dbCount : null;
    console.log(
      `\n  Wiki item count: ${wikiCount} | DB item count: ${dbCount ?? '(no connection)'} | Difference: ${diff ?? '?'}`,
    );

    // ── Write JSON ───────────────────────────────────────────────────────────
    if (writeJson) {
      const tmpDir  = path.join(__dirname, '..', 'tmp');
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      const outPath = path.join(tmpDir, `em-items-${tableCode}.json`);
      fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
      console.log(`  JSON → ${outPath}`);
    }

    // ── Upsert to staging table ───────────────────────────────────────────────
    if (upsertDb) {
      console.log(`  Upserting ${items.length} items to staging table…`);
      await upsertItems(items);
    } else {
      console.log('  (dry-run — no DB write)');
    }
  }

  if (pool) await pool.end();

  // ── Usage reminder ───────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(64)}`);
  console.log('  Usage examples:\n');
  console.log('  # Safe test — Table A, no DB write, first 10 items:');
  console.log('  DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \\');
  console.log('  DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \\');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --table A --dry-run --write-json --limit 10\n');
  console.log('  # Write Table A to staging DB:');
  console.log('  DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \\');
  console.log('  DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \\');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --table A --upsert-db --delay 500\n');
  console.log('  # Import all tables to staging:');
  console.log('  DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \\');
  console.log('  DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \\');
  console.log('  node server/scripts/import-em-items.mjs \\');
  console.log('    --all --upsert-db --delay 500');
  console.log('─'.repeat(64));
}

main().catch(e => {
  console.error('\n✗ Fatal:', e.message);
  if (pool) pool.end().catch(() => {});
  process.exit(1);
});
