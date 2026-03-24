/**
 * reimport-monster-stats.mjs  (v3)
 *
 * For monsters whose stats are missing, fetches the wiki page and writes all
 * known Creature template fields back to the DB.
 *
 * Fix log (v3):
 *   • URL fallbacks: when the stored wiki_url returns 404, tries alternative
 *     title formats ("Base, Sub" → "Base_(Sub)", "Sub_(Base)") and updates
 *     wiki_url in the DB when a working URL is found.
 *   • Multi-template support: pages with multiple {{Creature}} blocks (e.g.
 *     "Aartuk") are parsed to find the template nearest to the matching
 *     section header (e.g. "== Elder ==" for "Aartuk, Elder").
 *
 * Fix log (v2):
 *   • Integer fields parsed with parseIntField() ("7 (base)", "32,000", etc.)
 *   • Template detection tries {{Creature}}, {{Monster}}, fallback key=value scan
 *   • Query uses OR across hit_dice / armor_class / thac0 / attacks
 *
 * Usage:
 *   node scripts/reimport-monster-stats.mjs
 *   node scripts/reimport-monster-stats.mjs --dry-run
 *   node scripts/reimport-monster-stats.mjs --limit 20
 *   node scripts/reimport-monster-stats.mjs --name "Aarakocra, Athasian"
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

const INT_COLS = new Set(['armor_class', 'thac0', 'xp_value', 'morale']);

// ── Value parsers ─────────────────────────────────────────────────────────────

function parseIntField(val) {
  if (val == null) return null;
  const s = String(val)
    .replace(/\u2212/g, '-')
    .replace(/&minus;/g, '-')
    .replace(/,/g, '');
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : null;
}

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

/**
 * Fetch a single wiki page by title.
 * Returns { raw: string, resolvedTitle: string } or null if missing/error.
 */
async function fetchOnePage(pageTitle) {
  const url =
    `https://adnd2e.fandom.com/api.php?action=query` +
    `&titles=${encodeURIComponent(pageTitle)}` +
    `&prop=revisions&rvprop=content&format=json&origin=*&redirects=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ADnD-Manager-StatsImport/3.0' },
      signal:  AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page.missing !== undefined) return null;
    const raw = page?.revisions?.[0]?.['*'] ?? null;
    if (!raw) return null;
    // Fandom API echoes back the resolved (post-redirect) title
    const resolvedTitle = page.title ?? pageTitle;
    return { raw, resolvedTitle };
  } catch {
    return null;
  }
}

/**
 * Generate alternative wiki title candidates when the stored URL 404s.
 *
 *   "Aarakocra, Athasian" → stored as Aarakocra,_Athasian (missing)
 *     → try: Aarakocra_(Athasian)
 *     → try: Athasian_(Aarakocra)   ← Aasimon-style inversion
 *   "Aasimon, Light"      → try: Light_(Aasimon)
 */
function alternativeTitles(originalTitle, monsterName) {
  const alts = [];
  const name = monsterName ?? originalTitle.replace(/_/g, ' ');

  if (name.includes(',')) {
    const parts = name.split(',').map(p => p.trim());
    if (parts.length >= 2) {
      const base = parts[0].replace(/ /g, '_');
      const sub  = parts.slice(1).join(',').trim().replace(/ /g, '_');
      // "Base_(Sub)"
      alts.push(`${base}_(${sub})`);
      // "Sub_(Base)"  — inversion used for e.g. Aasimon, Light → Light_(Aasimon)
      alts.push(`${sub}_(${base})`);
      // Plain sub-type, sometimes the sub-type is the main page
      alts.push(sub);
    }
  }

  // Ensure spaces are underscores (already handled by encodeURIComponent, but
  // having it explicit helps avoid duplicates)
  const underscored = originalTitle.replace(/ /g, '_');
  if (underscored !== originalTitle) alts.push(underscored);

  return [...new Set(alts)];
}

/**
 * Fetch a wiki page, falling back to alternative title formats on 404.
 * Returns { raw, resolvedTitle, fixedUrl } or null.
 *   fixedUrl — the new canonical URL to write back to the DB (or null if unchanged)
 */
async function fetchWithFallbacks(originalTitle, monsterName) {
  // Primary attempt
  const primary = await fetchOnePage(originalTitle);
  if (primary) return { ...primary, fixedUrl: null };

  // Try alternatives
  for (const alt of alternativeTitles(originalTitle, monsterName)) {
    await sleep(150); // be kind to the wiki API
    const result = await fetchOnePage(alt);
    if (result) {
      const fixedUrl = `https://adnd2e.fandom.com/wiki/${encodeURIComponent(result.resolvedTitle)}`;
      return { ...result, fixedUrl };
    }
  }

  return null;
}

// ── Template parser ───────────────────────────────────────────────────────────

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
 * Parse ALL occurrences of a named template in the wikitext.
 * Returns an array of { fields, nearestHeader, startIdx }.
 */
function parseAllTemplates(wikitext, templateName) {
  const results = [];
  const rx = new RegExp(`\\{\\{${templateName}\\s*\\|`, 'gi');
  let m;
  while ((m = rx.exec(wikitext)) !== null) {
    const startIdx = m.index;
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
    if (end === -1) continue;

    // Find the nearest section heading (== ... ==) that appears before this template
    const before      = wikitext.slice(0, startIdx);
    const headerMatch = before.match(/==+\s*([^=\n]+?)\s*==+\s*\n?$/);
    const nearestHeader = headerMatch ? headerMatch[1].trim() : null;

    const templateContent = wikitext.slice(startIdx + 2, end - 2);
    const firstPipe = templateContent.indexOf('|');
    if (firstPipe === -1) continue;

    const fields = {};
    for (const param of splitParams(templateContent.slice(firstPipe + 1))) {
      const eqIdx = param.indexOf('=');
      if (eqIdx === -1) continue;
      const key = param.slice(0, eqIdx).trim().toLowerCase().replace(/[\s_-]/g, '');
      const val = param.slice(eqIdx + 1).trim();
      if (key && val !== '') fields[key] = val;
    }

    if (Object.keys(fields).length > 0) {
      results.push({ fields, nearestHeader, startIdx });
    }
  }
  return results;
}

function scanKeyValueLines(wikitext) {
  const fields = {};
  const lineRx = /^\s*\|\s*([a-z][a-z0-9 _-]*?)\s*=\s*(.+)$/gim;
  let m;
  while ((m = lineRx.exec(wikitext)) !== null) {
    const key = m[1].trim().toLowerCase().replace(/[\s_-]/g, '');
    const val = m[2].trim();
    if (FIELD_MAP[key] && val) fields[key] = val;
  }
  return fields;
}

/**
 * Extract wiki fields, choosing the best-matching template when there are
 * multiple (sub-type pages like "Aartuk, Elder" / "Aartuk, Warrior").
 *
 * @param {string} wikitext
 * @param {string|null} monsterName  Full DB name, e.g. "Aartuk, Elder"
 */
function extractWikiFields(wikitext, monsterName = null) {
  const TEMPLATE_NAMES = [
    'Creature', 'Monster', 'CreatureTemplate',
    'Infobox Creature', 'Infobox Monster', 'MonsterBox',
  ];

  let allTemplates = [];
  for (const tname of TEMPLATE_NAMES) {
    allTemplates = parseAllTemplates(wikitext, tname);
    if (allTemplates.length > 0) break;
  }

  if (allTemplates.length === 0) {
    // Fallback: raw key=value scan
    const fields = scanKeyValueLines(wikitext);
    return Object.keys(fields).length >= 2 ? fields : null;
  }

  if (allTemplates.length === 1 || !monsterName) {
    return allTemplates[0].fields;
  }

  // Multiple templates on the page — try to pick the one closest to the
  // matching section header.
  // "Aartuk, Elder"   → subtype "Elder"
  // "Aasimon, Light"  → subtype "Light"
  const commaIdx = monsterName.indexOf(',');
  if (commaIdx !== -1) {
    const subtype = monsterName.slice(commaIdx + 1).trim().toLowerCase();
    for (const { fields, nearestHeader } of allTemplates) {
      if (nearestHeader && nearestHeader.toLowerCase().includes(subtype)) {
        return fields;
      }
    }
    // No header match — try matching the subtype against a 'name' field inside
    // the template itself, if present
    for (const { fields } of allTemplates) {
      const tmplName = (fields.name ?? '').toLowerCase();
      if (tmplName.includes(subtype)) return fields;
    }
  }

  // Fall back to first template
  return allTemplates[0].fields;
}

// ── Field value mapper ────────────────────────────────────────────────────────

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
  console.log('║  Monster Stats Re-Importer v3 (wiki template parser) ║');
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
                 AND (   hit_dice    IS NULL
                      OR armor_class IS NULL
                      OR thac0       IS NULL
                      OR attacks     IS NULL )
               ORDER BY name LIMIT $1`;
    params = [LIMIT === Infinity ? 99999 : LIMIT];
  }

  const { rows } = await pool.query(query, params);
  console.log(`  Found ${rows.length} monsters to process.\n`);

  let updated = 0, urlFixed = 0, notFound = 0, noTemplate = 0, noFields = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];

    if (i > 0 && i % 50 === 0) {
      console.log(
        `\n  ── [${i}/${rows.length}]  updated=${updated}  urlFixed=${urlFixed}  noTemplate=${noTemplate}  errors=${errors} ──`
      );
    }

    process.stdout.write(
      `\r  [${String(i + 1).padStart(5)}/${rows.length}]  ${name.substring(0, 35).padEnd(35)}`
    );

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noTemplate++; continue; }

      const result = await fetchWithFallbacks(pageTitle, name);
      if (!result) { notFound++; await sleep(DELAY_MS); continue; }

      const { raw, fixedUrl } = result;

      // If the URL was corrected, log it and save to DB
      if (fixedUrl) {
        const oldSlug = pageTitle;
        const newSlug = titleFromUrl(fixedUrl) ?? fixedUrl;
        process.stdout.write(`\n  ✓ URL fixed: ${oldSlug} → ${newSlug}`);
        if (!DRY_RUN) {
          await pool.query('UPDATE monsters SET wiki_url=$1 WHERE id=$2', [fixedUrl, id]);
        }
        urlFixed++;
      }

      const wikiFields = extractWikiFields(raw, name);
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
  console.log(`  URL fixed    : ${urlFixed}`);
  console.log(`  Not found    : ${notFound}`);
  console.log(`  No template  : ${noTemplate}`);
  console.log(`  No fields    : ${noFields}`);
  console.log(`  Errors       : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
