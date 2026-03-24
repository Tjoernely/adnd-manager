/**
 * reimport-monster-stats.mjs  (v2)
 *
 * For monsters whose stats are missing, fetches the wiki page and writes all
 * known Creature template fields back to the DB.
 *
 * Fix log (v2):
 *   • Integer fields (armor_class, thac0, xp_value, morale) are now parsed
 *     with parseIntField() to handle "7 (base)", "32,000", "−10", etc.
 *   • Template detection now tries {{Creature}}, {{Monster}}, plus a raw
 *     key=value line-scan fallback for pages that use non-standard templates.
 *   • Query changed to OR: monsters missing ANY of hit_dice / armor_class /
 *     thac0 / attacks are now included.
 *
 * Usage:
 *   node scripts/reimport-monster-stats.mjs
 *   node scripts/reimport-monster-stats.mjs --dry-run
 *   node scripts/reimport-monster-stats.mjs --limit 20
 *   node scripts/reimport-monster-stats.mjs --name "Goblin"
 *
 * Env vars: DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD  DB_SSL
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

// ── Field maps ────────────────────────────────────────────────────────────────

// Wiki template key (lower-case, no spaces/dashes) → DB column name
const FIELD_MAP = {
  armorclass:        'armor_class',
  hitdice:           'hit_dice',
  thac0:             'thac0',
  movement:          'movement',
  move:              'movement',
  numberofattacks:   'attacks',
  noattacks:         'attacks',
  attacks:           'attacks',
  damageattack:      'damage',
  damageperhit:      'damage',
  damage:            'damage',
  alignment:         'alignment',
  numberappearing:   'no_appearing',
  noappearing:       'no_appearing',
  size:              'size',
  magicalresistance: 'magic_resistance',
  mr:                'magic_resistance',
  specialattack:     'special_attacks',
  specialattacks:    'special_attacks',
  specialdefense:    'special_defenses',
  specialdefenses:   'special_defenses',
  moral:             'morale',
  morale:            'morale',
  intelligence:      'intelligence',
  terrain:           'habitat',
  habitat:           'habitat',
  frequency:         'frequency',
  organization:      'organization',
  activitycycle:     'activity_cycle',
  diet:              'diet',
  xp:                'xp_value',
  xpvalue:           'xp_value',
  experience:        'xp_value',
  treasure:          'treasure',
  treasuretype:      'treasure',
  saveas:            'save_as',
  saves:             'save_as',
};

// DB columns that must be stored as integers
const INT_COLS = new Set(['armor_class', 'thac0', 'xp_value', 'morale']);

// ── Value parsers ─────────────────────────────────────────────────────────────

/**
 * Parse an integer from messy wiki values like:
 *   "7 (base)", "32,000", "−10", "-10", "5 or 10", "As fighter"
 * Returns null if no integer can be found.
 */
function parseIntField(val) {
  if (val == null) return null;
  const s = String(val)
    .replace(/\u2212/g, '-')   // Unicode minus sign → hyphen
    .replace(/&minus;/g, '-')  // HTML entity
    .replace(/,/g, '');        // thousands separator
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/** Strip wiki markup: links, templates, HTML, bold/italic, refs */
function cleanValue(s) {
  if (!s) return null;
  const v = s
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/<br\s*\/?>/gi, ' / ')
    .replace(/<[^>]+>/g, '')
    .replace(/'{2,}/g, '')
    .replace(/\[\d+\]/g, '')
    .trim();
  return v || null;
}

// ── Wiki fetch ────────────────────────────────────────────────────────────────
function titleFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchWikiContent(pageTitle) {
  const url =
    `https://adnd2e.fandom.com/api.php?action=query` +
    `&titles=${encodeURIComponent(pageTitle)}` +
    `&prop=revisions&rvprop=content&format=json&origin=*&redirects=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ADnD-Manager-StatsImport/2.0' },
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
 * Parse a named template (e.g. "Creature") from raw wikitext.
 * Returns { wikiKey: rawValue } or null if the template isn't present.
 */
function parseTemplate(wikitext, templateName) {
  const rx = new RegExp(`\\{\\{${templateName}\\s*\\|`, 'i');
  const startMatch = wikitext.match(rx);
  if (!startMatch) return null;

  const startIdx = wikitext.indexOf(startMatch[0]);
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
  for (const param of splitParams(templateContent.slice(firstPipe + 1))) {
    const eqIdx = param.indexOf('=');
    if (eqIdx === -1) continue;
    const key = param.slice(0, eqIdx).trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = param.slice(eqIdx + 1).trim();
    if (key && val !== '') fields[key] = val;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

/**
 * Fallback: scan raw wikitext for lines containing "| key = value".
 * Catches pages with non-standard or undocumented infobox template names.
 */
function scanKeyValueLines(wikitext) {
  const fields = {};
  // Matches:  | armorclass = 5   OR   |armorclass=5
  const lineRx = /^\s*\|\s*([a-z][a-z0-9 _-]*?)\s*=\s*(.+)$/gim;
  let m;
  while ((m = lineRx.exec(wikitext)) !== null) {
    const key = m[1].trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = m[2].trim();
    // Only keep keys that are in our field map (avoids noise)
    if (FIELD_MAP[key] && val) fields[key] = val;
  }
  return fields;
}

/**
 * Try multiple strategies to extract creature stats from wikitext.
 * Returns { wikiKey: rawValue } or null if nothing useful found.
 */
function extractWikiFields(wikitext) {
  // Strategy 1: known infobox template names (case-insensitive)
  const candidates = [
    'Creature', 'Monster', 'CreatureTemplate',
    'Infobox Creature', 'Infobox Monster', 'MonsterBox',
  ];
  for (const name of candidates) {
    const result = parseTemplate(wikitext, name);
    if (result) return result;
  }

  // Strategy 2: raw | key = value line scan
  const fields = scanKeyValueLines(wikitext);
  if (Object.keys(fields).length >= 2) return fields;

  return null;
}

// ── Field value mapper ────────────────────────────────────────────────────────

/**
 * Convert raw wiki fields to { dbColumn: typedValue } pairs.
 * Integer columns are coerced; others are cleaned text strings.
 */
function mapFields(wikiFields) {
  const updates = {};
  for (const [wikiKey, rawVal] of Object.entries(wikiFields)) {
    const col = FIELD_MAP[wikiKey];
    if (!col) continue;

    if (INT_COLS.has(col)) {
      const n = parseIntField(rawVal);
      if (n != null) updates[col] = n;
    } else {
      const v = cleanValue(rawVal);
      if (v != null) updates[col] = v;
    }
  }
  return updates;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Monster Stats Re-Importer v2 (wiki template parser) ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit  : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  if (NAME_FILTER) console.log(`  Filter : name ILIKE '%${NAME_FILTER}%'`);
  console.log('');

  let query, params;
  if (NAME_FILTER) {
    // When filtering by name, process regardless of existing stats
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL AND name ILIKE $1
               ORDER BY name LIMIT $2`;
    params = [`%${NAME_FILTER}%`, LIMIT === Infinity ? 99999 : LIMIT];
  } else {
    // Include monsters missing ANY key stat (not just those missing all)
    query  = `SELECT id, name, wiki_url FROM monsters
               WHERE wiki_url IS NOT NULL
                 AND (   hit_dice   IS NULL
                      OR armor_class IS NULL
                      OR thac0       IS NULL
                      OR attacks     IS NULL )
               ORDER BY name LIMIT $1`;
    params = [LIMIT === Infinity ? 99999 : LIMIT];
  }

  const { rows } = await pool.query(query, params);
  console.log(`  Found ${rows.length} monsters to process.\n`);

  let updated = 0, notFound = 0, noTemplate = 0, noFields = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];

    if (i > 0 && i % 50 === 0) {
      console.log(
        `\n  ── [${i}/${rows.length}]  updated=${updated}  noTemplate=${noTemplate}  errors=${errors} ──`
      );
    }

    process.stdout.write(
      `\r  [${String(i + 1).padStart(5)}/${rows.length}]  ${name.substring(0, 35).padEnd(35)}`
    );

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noTemplate++; continue; }

      const raw = await fetchWikiContent(pageTitle);
      if (!raw) { notFound++; await sleep(DELAY_MS); continue; }

      const wikiFields = extractWikiFields(raw);
      if (!wikiFields) { noTemplate++; await sleep(DELAY_MS); continue; }

      const updates = mapFields(wikiFields);
      if (Object.keys(updates).length === 0) { noFields++; await sleep(DELAY_MS); continue; }

      const cols       = Object.keys(updates);
      const vals       = Object.values(updates);
      const setClauses = cols.map((c, idx) => `${c} = $${idx + 1}`).join(', ');

      process.stdout.write(`  → ${cols.join(', ')}`);

      if (!DRY_RUN) {
        await pool.query(
          `UPDATE monsters SET ${setClauses} WHERE id = $${cols.length + 1}`,
          [...vals, id],
        );
      }
      updated++;
    } catch (e) {
      errors++;
      process.stdout.write(`  ✗ ${e.message?.slice(0, 50)}`);
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
