/**
 * fix-monster-variants.mjs
 *
 * Finds monsters whose description mentions "Age Category" (dragons, etc.),
 * fetches each monster's wiki page, parses the age-category table from the
 * MediaWiki markup, and stores the result in monsters.variants (JSONB).
 *
 * Each variant object:
 *   { label, hit_dice, armor_class, xp_value, breath_damage, ... }
 *
 * Usage (run from server/ directory):
 *   node fix-monster-variants.mjs
 *   node fix-monster-variants.mjs --dry-run
 *   node fix-monster-variants.mjs --limit 20
 *   node fix-monster-variants.mjs --name "Red Dragon"
 *
 * Env vars (mirrors db.js):
 *   DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// Load .env
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {}

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT    = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const nameIdx  = args.indexOf('--name');
const NAME_FILTER = nameIdx > -1 ? args[nameIdx + 1] : null;
const DELAY_MS = 300;

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
      headers: { 'User-Agent': 'ADnD-Manager-VariantFix/1.0' },
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

// ── Strip wiki markup from a cell value ───────────────────────────────────────
function cleanCell(s) {
  if (!s) return '';
  return s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2') // [[target|text]] → text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')             // [[text]] → text
    .replace(/\{\{[^}]*\}\}/g, '')                  // {{template}} → ''
    .replace(/<[^>]+>/g, '')                        // HTML tags
    .replace(/'{2,}/g, '')                          // '' ''' bold/italic
    .replace(/\[\d+\]/g, '')                        // [1] references
    .trim();
}

// ── Parse a MediaWiki table into array of row-objects ─────────────────────────
function parseWikiTable(tableText) {
  // Split into rows at "|-"
  const rawRows = tableText.split(/\n\s*\|-\s*\n/);

  let headers = [];
  const rows  = [];

  for (const rawRow of rawRows) {
    const lines = rawRow.split('\n');
    const headerCells = [];
    const dataCells   = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('!')) {
        // Header row — split on "!!" or "|"
        const cells = trimmed.slice(1).split(/!!|\|(?!\|)/).map(cleanCell).filter(Boolean);
        headerCells.push(...cells);
      } else if (trimmed.startsWith('|') && !trimmed.startsWith('|{') && !trimmed.startsWith('|}')) {
        // Data row — split on "||"
        const cells = trimmed.slice(1).split('||').map(cleanCell).filter(c => c !== '');
        dataCells.push(...cells);
      }
    }

    if (headerCells.length > 0) {
      headers = headerCells;
    } else if (dataCells.length > 0 && headers.length > 0) {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = dataCells[i] ?? ''; });
      rows.push(obj);
    }
  }

  return rows;
}

// ── Normalise a header string to a known field key ────────────────────────────
function normHeader(h) {
  const lower = h.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (/agecategory|agecat/.test(lower)) return 'age_category';
  if (/ageyear|ageyr/.test(lower))     return 'age_years';
  if (/hitdice|hd/.test(lower))        return 'hit_dice';
  if (/hitpoints|hp/.test(lower))      return 'hit_points';
  if (/armorclass|ac$/.test(lower))    return 'armor_class';
  if (/breathweapon|breath/.test(lower)) return 'breath_damage';
  if (/xpvalue|xp|expvalue/.test(lower)) return 'xp_value';
  if (/specialabil|spellabil|spells/.test(lower)) return 'spell_ability';
  if (/attack|atks|att/.test(lower))   return 'attacks';
  if (/damage|dmg/.test(lower))        return 'damage';
  if (/size/.test(lower))              return 'size';
  if (/movement|move|mv/.test(lower))  return 'movement';
  return null;
}

// ── Extract a label from an age-category cell ("1 (Hatchling)" → "Age 1 – Hatchling") ──
function buildLabel(ageCell) {
  if (!ageCell) return null;
  const m = ageCell.match(/(\d+)\s*\(([^)]+)\)/);
  if (m) return `Age ${m[1]} – ${m[2]}`;
  const n = ageCell.match(/^(\d+)$/);
  if (n) return `Age ${n[1]}`;
  return ageCell;
}

// ── Parse age-category variants from raw wikitext ────────────────────────────
function parseVariants(raw) {
  if (!raw) return null;

  // Find all {| ... |} table blocks
  const tablePattern = /\{\|[^]*?\|\}/g;
  const tables = raw.match(tablePattern) ?? [];

  for (const tbl of tables) {
    // Only process tables whose headers include age-category-like content
    if (!/age\s*cat/i.test(tbl) && !/Age\s*Category/i.test(tbl)) continue;

    const rawRows = parseWikiTable(tbl);
    if (rawRows.length === 0) continue;

    const variants = [];
    for (const row of rawRows) {
      const variant = {};

      // Map each cell to a known key
      for (const [rawKey, val] of Object.entries(row)) {
        const key = normHeader(rawKey);
        if (!key || !val) continue;
        variant[key] = val;
      }

      if (!variant.age_category && !variant.hit_dice) continue;

      // Build a human-readable label
      variant.label = buildLabel(variant.age_category) ?? `Variant ${variants.length + 1}`;

      // Parse AC to integer if possible
      if (variant.armor_class) {
        const ac = parseInt(variant.armor_class);
        if (!isNaN(ac)) variant.armor_class = ac;
      }

      // Parse XP to integer if possible
      if (variant.xp_value) {
        const xp = parseInt(String(variant.xp_value).replace(/[^0-9-]/g, ''));
        if (!isNaN(xp)) variant.xp_value = xp;
      }

      delete variant.age_category; // already in label
      variants.push(variant);
    }

    if (variants.length >= 2) return variants;
  }

  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Monster Variant / Age-Category Fixer                ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit  : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  if (NAME_FILTER) console.log(`  Filter : name ILIKE '%${NAME_FILTER}%'`);
  console.log('');

  // Find candidates: monsters with "Age Category" in description, or wiki_url + dragon type
  let query, params;
  if (NAME_FILTER) {
    query  = `SELECT id, name, wiki_url FROM monsters WHERE name ILIKE $1 AND wiki_url IS NOT NULL ORDER BY name LIMIT $2`;
    params = [`%${NAME_FILTER}%`, LIMIT === Infinity ? 99999 : LIMIT];
  } else {
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL
                 AND variants IS NULL
                 AND (
                       description ILIKE '%age category%'
                    OR description ILIKE '%age cat%'
                    OR name        ILIKE '%dragon%'
                 )
               ORDER BY name
               LIMIT $1`;
    params = [LIMIT === Infinity ? 99999 : LIMIT];
  }

  const { rows } = await pool.query(query, params);
  console.log(`  Found ${rows.length} candidates.\n`);

  let updated = 0, notFound = 0, noVariants = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];
    const pct = Math.round(((i + 1) / rows.length) * 100);
    process.stdout.write(`\r  [${String(pct).padStart(3)}%] ${String(i + 1).padStart(4)}/${rows.length}  ${name.substring(0, 35).padEnd(35)}`);

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noVariants++; continue; }

      const raw = await fetchWikiContent(pageTitle);
      if (!raw) { notFound++; await sleep(DELAY_MS); continue; }

      const variants = parseVariants(raw);
      if (!variants) { noVariants++; await sleep(DELAY_MS); continue; }

      if (!DRY_RUN) {
        await pool.query(
          'UPDATE monsters SET variants=$1 WHERE id=$2',
          [JSON.stringify(variants), id],
        );
      }
      updated++;
      process.stdout.write(`  → ${variants.length} variants`);
    } catch (e) {
      errors++;
      process.stdout.write(`  ✗ ${e.message?.slice(0, 40)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  ── Results ──────────────────────────────────');
  console.log(`  Updated      : ${updated}`);
  console.log(`  Not on wiki  : ${notFound}`);
  console.log(`  No variants  : ${noVariants}`);
  console.log(`  Errors       : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
