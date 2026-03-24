/**
 * import-variants.mjs
 *
 * Fetches dragon wiki pages and parses their age-category tables.
 * Stores per-age variant data (body_length, ac, breath_weapon, spells,
 * magic_resistance, treasure_type, xp_value) as a JSONB array in
 * monsters.variants.
 *
 * Usage (run from project root or server/):
 *   node server/scripts/import-variants.mjs
 *   node server/scripts/import-variants.mjs --dry-run
 *   node server/scripts/import-variants.mjs --limit 10
 *   node server/scripts/import-variants.mjs --name "Red Dragon"
 *
 * Env vars (mirrors db.js):
 *   DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

// Load .env from server/
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const DRY_RUN    = args.includes('--dry-run');
const limitIdx   = args.indexOf('--limit');
const LIMIT      = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const nameIdx    = args.indexOf('--name');
const NAME_FILTER = nameIdx > -1 ? args[nameIdx + 1] : null;
const DELAY_MS   = 300;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Wiki fetch ────────────────────────────────────────────────────────────────
function titleFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchWikiContent(pageTitle) {
  const url = `https://adnd2e.fandom.com/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=revisions&rvprop=content&format=json&origin=*&redirects=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ADnD-Manager-VariantImport/1.0' },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page.missing !== undefined) return null;
    return page?.revisions?.[0]?.['*'] ?? null;
  } catch {
    return null;
  }
}

// ── Strip wiki markup from a single cell ─────────────────────────────────────
function cleanCell(s) {
  if (!s) return '';
  return s
    .replace(/\{\{br\}\}/gi, ' ')              // {{br}} → space BEFORE general template strip
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[\d+\]/g, '')
    .trim();
}

// ── Normalise a header string to our field key ────────────────────────────────
function normHeader(h) {
  const s = h.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/^age(cat|category)?$/.test(s) || s === 'age')           return 'age_category';
  if (/ageyear|ageyrs|yearsofage/.test(s))                     return 'age_years';
  if (/^hd$|hitdice|hitdie/.test(s))                           return 'hit_dice';
  if (/^(body)?len(gth)?|bodysize|bodylgt|^lgt$/.test(s))      return 'body_length';
  if (/wingspan/.test(s))                                      return 'wingspan';
  if (/^ac$|armorclass/.test(s))                               return 'armor_class';
  if (/breathweapon|breathwpn|breathdmg|breathdamage/.test(s)) return 'breath_weapon';
  if (/spell(ability|abil|lvl|level|use)?s?$/.test(s))         return 'spells';
  if (/magic(res|resist)|mr$/.test(s))                         return 'magic_resistance';
  if (/treasure(type|table)?|treas/.test(s))                   return 'treasure_type';
  if (/xp(value)?|expvalue|exppts/.test(s))                    return 'xp_value';
  return null;
}

// ── Parse one MediaWiki table block into rows ─────────────────────────────────
function parseWikiTable(tableText) {
  const sections = tableText.split(/\n\s*\|-[^\n]*\n/);
  let headers = [];
  const rows  = [];

  for (const section of sections) {
    const headerCells = [];
    const dataCells   = [];
    const lines = section.split('\n');

    for (const line of lines) {
      const t = line.trim();
      if (t.startsWith('!')) {
        // "! Foo !! Bar" or "! Foo\n! Bar"
        const cells = t.slice(1).split(/!!/).map(cleanCell).filter(Boolean);
        headerCells.push(...cells);
      } else if (t.startsWith('|') && !t.startsWith('{|') && !t.startsWith('|}')) {
        const inner = t.slice(1);
        // Inline style prefix "style=...| value" — strip it
        const stripped = inner.includes('|') && /style=|class=|align=|bgcolor=/i.test(inner)
          ? inner.slice(inner.lastIndexOf('|') + 1)
          : inner;
        const cells = stripped.split('||').map(cleanCell).filter(c => c !== '');
        dataCells.push(...cells);
      }
    }

    if (headerCells.length > 0) {
      headers = headerCells;
    } else if (dataCells.length > 0 && headers.length > 0) {
      const obj = {};
      headers.forEach((h, i) => {
        if (dataCells[i] !== undefined) obj[h] = dataCells[i];
      });
      rows.push(obj);
    }
  }

  return { headers, rows };
}

// ── Build label from age-category cell ("1 (Hatchling)" → "Age 1 – Hatchling") ──
function buildLabel(ageCell) {
  if (!ageCell) return null;
  const m = ageCell.match(/(\d+)\s*[\-–]?\s*(?:\(([^)]+)\))?/);
  if (m && m[2]) return `Age ${m[1]} – ${m[2]}`;
  if (m && m[1]) return `Age ${m[1]}`;
  return ageCell;
}

// ── Parse all age-category tables from a wiki page ───────────────────────────
function parseVariants(raw) {
  if (!raw) return null;

  // Find all {| ... |} table blocks (non-greedy, but handle nesting)
  const tableRx = /\{\|[^]*?\|\}/g;
  const tables  = raw.match(tableRx) ?? [];

  for (const tbl of tables) {
    // Accept tables that use a known infobox class AND have an Age column, OR
    // that explicitly mention "age cat" / "age category" in their content.
    const isKnownClass = /\{\|\s*class="(?:wikitable|article-table)"/i.test(tbl);
    const hasAgeCat    = /age\s*cat/i.test(tbl) || /age\s*category/i.test(tbl);
    const hasAgeCol    = /!\s*Age\b/i.test(tbl);
    if (!hasAgeCat && !(isKnownClass && hasAgeCol)) continue;

    const { headers, rows } = parseWikiTable(tbl);
    if (rows.length < 2) continue;

    // Map header positions to our field names
    const colMap = {};
    headers.forEach((h, i) => {
      const key = normHeader(h);
      if (key && !(key in colMap)) colMap[key] = i;
    });

    // We need at least an age_category column
    if (!('age_category' in colMap) && !('hit_dice' in colMap)) continue;

    const variants = [];
    for (const rawRow of rows) {
      // Rebuild the row by header index
      const headerValues = headers.map(h => rawRow[h] ?? '');

      const variant = {};
      for (const [key, idx] of Object.entries(colMap)) {
        const val = cleanCell(headerValues[idx]);
        if (val) variant[key] = val;
      }

      if (!variant.age_category && !variant.hit_dice) continue;

      variant.label = buildLabel(variant.age_category) ?? `Variant ${variants.length + 1}`;
      delete variant.age_category;

      // Coerce numeric fields
      if (variant.armor_class) {
        const ac = parseInt(variant.armor_class);
        if (!isNaN(ac)) variant.armor_class = ac;
      }
      if (variant.xp_value) {
        const xp = parseInt(String(variant.xp_value).replace(/,/g, ''));
        if (!isNaN(xp)) variant.xp_value = xp;
      }

      variants.push(variant);
    }

    if (variants.length >= 2) return variants;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Dragon Age-Category Variant Importer                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit  : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  if (NAME_FILTER) console.log(`  Filter : name ILIKE '%${NAME_FILTER}%'`);
  console.log('');

  let query, params;
  if (NAME_FILTER) {
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE name ILIKE $1 AND wiki_url IS NOT NULL
               ORDER BY name LIMIT $2`;
    params = [`%${NAME_FILTER}%`, LIMIT === Infinity ? 9999 : LIMIT];
  } else {
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL
                 AND variants IS NULL
                 AND (name ILIKE 'Dragon%' OR name ILIKE '%Dragon,%')
               ORDER BY name LIMIT $1`;
    params = [LIMIT === Infinity ? 9999 : LIMIT];
  }

  const { rows } = await pool.query(query, params);
  console.log(`  Found ${rows.length} dragons to process.\n`);

  let updated = 0, notFound = 0, noTable = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];
    const pct = Math.round(((i + 1) / rows.length) * 100);
    process.stdout.write(
      `\r  [${String(pct).padStart(3)}%] ${String(i + 1).padStart(4)}/${rows.length}  ${name.substring(0, 30).padEnd(30)}`
    );

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noTable++; continue; }

      const raw = await fetchWikiContent(pageTitle);
      if (!raw) { notFound++; await sleep(DELAY_MS); continue; }

      const variants = parseVariants(raw);
      if (!variants) { noTable++; await sleep(DELAY_MS); continue; }

      if (!DRY_RUN) {
        await pool.query('UPDATE monsters SET variants=$1 WHERE id=$2', [
          JSON.stringify(variants), id,
        ]);
      }
      updated++;
      process.stdout.write(`  → ${variants.length} ages`);
    } catch (e) {
      errors++;
      process.stdout.write(`  ✗ ${e.message?.slice(0, 35)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  ── Results ──────────────────────────────────');
  console.log(`  Updated    : ${updated}`);
  console.log(`  Not found  : ${notFound}`);
  console.log(`  No table   : ${noTable}`);
  console.log(`  Errors     : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
