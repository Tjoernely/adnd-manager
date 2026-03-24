/**
 * reimport-monster-stats.mjs
 *
 * For monsters with a wiki_url but null hit_dice AND null armor_class, fetches
 * the wiki page, parses the {{Creature}} template, and writes all known fields
 * back to the DB.
 *
 * Field mapping (wiki template param → DB column):
 *   armorclass       → armor_class
 *   hitdice          → hit_dice
 *   thac0            → thac0
 *   movement         → movement
 *   numberofattacks  → attacks
 *   damageattack     → damage
 *   alignment        → alignment
 *   numberappearing  → no_appearing
 *   size             → size
 *   magicalresistance→ magic_resistance
 *   specialattack    → special_attacks
 *   specialdefenses  → special_defenses
 *   moral            → morale
 *   intelligence     → intelligence
 *   terrain          → habitat
 *   frequency        → frequency
 *   organization     → organization
 *   activitycycle    → activity_cycle
 *   diet             → diet
 *   xp               → xp_value  ("32,000" → 32000)
 *   treasure         → treasure
 *   saveas           → save_as
 *
 * Usage (from project root or server/):
 *   node server/scripts/reimport-monster-stats.mjs
 *   node server/scripts/reimport-monster-stats.mjs --dry-run
 *   node server/scripts/reimport-monster-stats.mjs --limit 50
 *   node server/scripts/reimport-monster-stats.mjs --name "Goblin"
 *
 * Env vars: DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const limitIdx    = args.indexOf('--limit');
const LIMIT       = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const nameIdx     = args.indexOf('--name');
const NAME_FILTER = nameIdx > -1 ? args[nameIdx + 1] : null;
const DELAY_MS    = 250;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Wiki field → DB column mapping ───────────────────────────────────────────
const FIELD_MAP = {
  armorclass:        'armor_class',
  hitdice:           'hit_dice',
  thac0:             'thac0',
  movement:          'movement',
  numberofattacks:   'attacks',
  damageattack:      'damage',
  alignment:         'alignment',
  numberappearing:   'no_appearing',
  size:              'size',
  magicalresistance: 'magic_resistance',
  specialattack:     'special_attacks',
  specialdefense:    'special_defenses',
  specialdefenses:   'special_defenses',
  moral:             'morale',
  morale:            'morale',
  intelligence:      'intelligence',
  terrain:           'habitat',
  frequency:         'frequency',
  organization:      'organization',
  activitycycle:     'activity_cycle',
  diet:              'diet',
  xp:                'xp_value',
  xpvalue:           'xp_value',
  treasure:          'treasure',
  saveas:            'save_as',
};

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
      headers: { 'User-Agent': 'ADnD-Manager-StatsImport/1.0' },
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

// ── Template parser ───────────────────────────────────────────────────────────

/** Split template params on `|` while respecting nested {{ }} and [[ ]] */
function splitParams(content) {
  const params = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if ((c === '{' || c === '[') && content[i + 1] === c) { depth++; i++; }
    else if ((c === '}' || c === ']') && content[i + 1] === c) { depth--; i++; }
    else if (c === '|' && depth === 0) {
      params.push(content.slice(start, i));
      start = i + 1;
    }
  }
  params.push(content.slice(start));
  return params;
}

/**
 * Parse a {{Creature|...}} template from raw wikitext.
 * Returns a plain object of { wikiKey: rawValue } or null if not found.
 */
function parseCreatureTemplate(wikitext) {
  const startMatch = wikitext.match(/\{\{Creature\s*\|/i);
  if (!startMatch) return null;

  let startIdx = wikitext.indexOf(startMatch[0]);
  let depth = 0;
  let i     = startIdx;
  let end   = -1;

  while (i < wikitext.length) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i += 2; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) { end = i + 2; break; }
      i += 2;
    } else { i++; }
  }

  if (end === -1) return null;

  const templateContent = wikitext.slice(startIdx + 2, end - 2);
  const firstPipe = templateContent.indexOf('|');
  if (firstPipe === -1) return null;

  const fields = {};
  const params = splitParams(templateContent.slice(firstPipe + 1));
  for (const param of params) {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) continue;
    const key = param.slice(0, eqIdx).trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = param.slice(eqIdx + 1).trim();
    if (key && val !== '') fields[key] = val;
  }

  return fields;
}

/** Strip wiki markup: links, templates, HTML, bold/italic, refs */
function cleanValue(s) {
  if (!s) return null;
  let v = s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')   // [[Page|Text]] → Text
    .replace(/\[\[([^\]]+)\]\]/g, '$1')                // [[Page]] → Page
    .replace(/\{\{[^}]*\}\}/g, '')                     // {{template}} → ''
    .replace(/<br\s*\/?>/gi, ' / ')                    // <br> → ' / '
    .replace(/<[^>]+>/g, '')                           // other HTML
    .replace(/'{2,}/g, '')                             // bold/italic
    .replace(/\[\d+\]/g, '')                           // footnotes
    .trim();
  return v || null;
}

/** Parse XP: "32,000" → 32000, "320" → 320 */
function parseXp(s) {
  if (!s) return null;
  const n = parseInt(String(s).replace(/[^0-9-]/g, ''));
  return isNaN(n) ? null : n;
}

/**
 * Map raw wiki fields to { dbColumn: cleanedValue } pairs.
 * Returns only entries where the value is non-null.
 */
function mapFields(wikiFields) {
  const updates = {};
  for (const [wikiKey, rawVal] of Object.entries(wikiFields)) {
    const col = FIELD_MAP[wikiKey];
    if (!col) continue;
    let val = cleanValue(rawVal);
    if (val == null) continue;
    if (col === 'xp_value') {
      val = parseXp(rawVal);
      if (val == null) continue;
    }
    updates[col] = val;
  }
  return updates;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Monster Stats Re-Importer (from wiki Creature tmpl) ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit  : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  if (NAME_FILTER) console.log(`  Filter : name ILIKE '%${NAME_FILTER}%'`);
  console.log('');

  let query, params;
  if (NAME_FILTER) {
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL AND name ILIKE $1
               ORDER BY name LIMIT $2`;
    params = [`%${NAME_FILTER}%`, LIMIT === Infinity ? 99999 : LIMIT];
  } else {
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL
                 AND hit_dice IS NULL
                 AND armor_class IS NULL
               ORDER BY name LIMIT $1`;
    params = [LIMIT === Infinity ? 99999 : LIMIT];
  }

  const { rows } = await pool.query(query, params);
  console.log(`  Found ${rows.length} monsters to process.\n`);

  let updated = 0, notFound = 0, noTemplate = 0, noFields = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];

    if (i > 0 && i % 50 === 0) {
      console.log(`\n  ── Progress: ${i}/${rows.length} — updated=${updated} noTemplate=${noTemplate} ──`);
    }

    process.stdout.write(
      `\r  [${String(i + 1).padStart(5)}/${rows.length}]  ${name.substring(0, 35).padEnd(35)}`
    );

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noTemplate++; continue; }

      const raw = await fetchWikiContent(pageTitle);
      if (!raw) { notFound++; await sleep(DELAY_MS); continue; }

      const wikiFields = parseCreatureTemplate(raw);
      if (!wikiFields) { noTemplate++; await sleep(DELAY_MS); continue; }

      const updates = mapFields(wikiFields);
      if (Object.keys(updates).length === 0) { noFields++; await sleep(DELAY_MS); continue; }

      const cols   = Object.keys(updates);
      const vals   = Object.values(updates);
      const setClauses = cols.map((c, idx) => `${c} = $${idx + 1}`).join(', ');

      process.stdout.write(`  → ${cols.length} fields`);

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE monsters SET ${setClauses} WHERE id = $${cols.length + 1}`,
          [...vals, id],
        );
      }
      updated++;
    } catch (e) {
      errors++;
      process.stdout.write(`  ✗ ${e.message?.slice(0, 40)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  ── Results ──────────────────────────────────');
  console.log(`  Updated      : ${updated}`);
  console.log(`  Not found    : ${notFound}`);
  console.log(`  No template  : ${noTemplate}`);
  console.log(`  No fields    : ${noFields}`);
  console.log(`  Errors       : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
