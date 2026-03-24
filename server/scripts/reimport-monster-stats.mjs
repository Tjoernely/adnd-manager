/**
 * reimport-monster-stats.mjs  (v3)
 *
 * For monsters whose stats are missing, fetches the wiki page and writes all
 * known Creature template fields back to the DB.
 *
 * Fix log (v4):
 *   • FIELD_MAP massively widened with short-form aliases (ac, hd, na, ml,
 *     mv, att, dmg, al, sa, sd, mr, treas, freq, org, etc.) that the wiki
 *     uses instead of the long canonical names.
 *   • --debug-keys [N] flag: for the first N "no fields" cases, prints the
 *     raw extracted template keys so new aliases can be identified.
 *   • Error logging improved: prints monster name + full error on its own line.
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
 *   node scripts/reimport-monster-stats.mjs --debug-keys 10   (show raw keys)
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
const args           = process.argv.slice(2);
const DRY_RUN        = args.includes('--dry-run');
const limitIdx       = args.indexOf('--limit');
const LIMIT          = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const nameIdx        = args.indexOf('--name');
const NAME_FILTER    = nameIdx > -1 ? args[nameIdx + 1] : null;
const debugKeysIdx   = args.indexOf('--debug-keys');
// --debug-keys N  → print raw template keys for first N "no fields" monsters
const DEBUG_KEYS_MAX = debugKeysIdx > -1 ? (parseInt(args[debugKeysIdx + 1]) || 20) : 0;
const DELAY_MS       = 250;

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
  // ── Armor Class ───────────────────────────────────────────────────────────
  armorclass:        'armor_class',
  ac:                'armor_class',
  armourclass:       'armor_class',  // British spelling
  armour:            'armor_class',

  // ── Hit Dice ──────────────────────────────────────────────────────────────
  hitdice:           'hit_dice',
  hd:                'hit_dice',
  hitdie:            'hit_dice',
  hd1:               'hit_dice',     // some templates use hd1/hd2 for range
  dice:              'hit_dice',

  // ── THAC0 ─────────────────────────────────────────────────────────────────
  thac0:             'thac0',
  thaco:             'thac0',        // common mis-spelling
  thac:              'thac0',
  tohit:             'thac0',

  // ── Movement ──────────────────────────────────────────────────────────────
  movement:          'movement',
  move:              'movement',
  mv:                'movement',
  spd:               'movement',
  speed:             'movement',
  movementrate:      'movement',

  // ── Attacks ───────────────────────────────────────────────────────────────
  numberofattacks:   'attacks',
  noofattacks:       'attacks',  // used as base key after stripping suffix from noofattacks1/2
  noattacks:         'attacks',
  numberattacks:     'attacks',
  attacks:           'attacks',
  att:               'attacks',
  atk:               'attacks',
  atts:              'attacks',
  noa:               'attacks',

  // ── Damage ────────────────────────────────────────────────────────────────
  damageattack:      'damage',
  damageperhit:      'damage',
  damageperattack:   'damage',
  damage:            'damage',
  dmg:               'damage',
  dam:               'damage',

  // ── Alignment ─────────────────────────────────────────────────────────────
  alignment:         'alignment',
  align:             'alignment',
  al:                'alignment',

  // ── Number Appearing ──────────────────────────────────────────────────────
  numberappearing:   'no_appearing',
  noappearing:       'no_appearing',
  numappearing:      'no_appearing',
  na:                'no_appearing',
  appearing:         'no_appearing',

  // ── Size ──────────────────────────────────────────────────────────────────
  size:              'size',
  sz:                'size',

  // ── Magic Resistance ──────────────────────────────────────────────────────
  magicalresistance: 'magic_resistance',
  magicresistance:   'magic_resistance',
  mr:                'magic_resistance',
  magicres:          'magic_resistance',
  magres:            'magic_resistance',
  resistance:        'magic_resistance',

  // ── Special Attacks ───────────────────────────────────────────────────────
  specialattack:     'special_attacks',
  specialattacks:    'special_attacks',
  sa:                'special_attacks',
  specatt:           'special_attacks',
  spec:              'special_attacks',

  // ── Special Defenses ──────────────────────────────────────────────────────
  specialdefense:    'special_defenses',
  specialdefenses:   'special_defenses',
  sd:                'special_defenses',
  specdef:           'special_defenses',

  // ── Morale ────────────────────────────────────────────────────────────────
  moral:             'morale',
  morale:            'morale',
  ml:                'morale',
  mor:               'morale',

  // ── Intelligence ──────────────────────────────────────────────────────────
  intelligence:      'intelligence',
  intel:             'intelligence',
  int:               'intelligence',
  iq:                'intelligence',

  // ── Habitat / Terrain ─────────────────────────────────────────────────────
  terrain:           'habitat',
  habitat:           'habitat',
  terr:              'habitat',
  climate:           'habitat',
  climateterrain:    'habitat',

  // ── Frequency ─────────────────────────────────────────────────────────────
  frequency:         'frequency',
  freq:              'frequency',
  rarity:            'frequency',

  // ── Organization ──────────────────────────────────────────────────────────
  organization:      'organization',
  org:               'organization',
  social:            'organization',

  // ── Activity Cycle ────────────────────────────────────────────────────────
  activitycycle:     'activity_cycle',
  actcycle:          'activity_cycle',
  active:            'activity_cycle',
  activecycle:       'activity_cycle',

  // ── Diet ──────────────────────────────────────────────────────────────────
  diet:              'diet',

  // ── XP Value ──────────────────────────────────────────────────────────────
  xp:                'xp_value',
  xpvalue:           'xp_value',
  experience:        'xp_value',
  expvalue:          'xp_value',
  xpval:             'xp_value',
  exp:               'xp_value',

  // ── Treasure ──────────────────────────────────────────────────────────────
  treasure:          'treasure',
  treasuretype:      'treasure',
  treas:             'treasure',
  tt:                'treasure',
  treastype:         'treasure',

  // ── Save As ───────────────────────────────────────────────────────────────
  saveas:            'save_as',
  saves:             'save_as',
  save:              'save_as',
  savingthrow:       'save_as',
};

const INT_COLS = new Set(['armor_class', 'thac0', 'xp_value', 'morale']);

// Max character lengths for text columns (matches widened schema).
// Values exceeding these limits are silently truncated rather than erroring.
const COL_MAX_LEN = {
  hit_dice:         500,   // TEXT in widened schema, but cap runaway values
  size:             100,
  magic_resistance: 200,
  save_as:          100,
  treasure:         100,
  movement:         100,
  alignment:        100,
  no_appearing:     100,
  special_attacks:  2000,
  special_defenses: 2000,
  attacks:          200,
  damage:           500,
  habitat:          300,
  frequency:        100,
  organization:     200,
  activity_cycle:   100,
  diet:             200,
  intelligence:     100,
};

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
 * Handle dual-variant templates that use numbered suffixes for each column
 * (e.g. armorclass1/armorclass2, hitdice1/hitdice2, name1/name2).
 *
 * This is the most common multi-variant pattern on the wiki — a single
 * {{Creature}} template with every field duplicated as field1/field2.
 * name1/name2 identify the sub-types ("Warrior"/"Elder", "Adult"/"Young").
 *
 * Returns a plain fields object with suffixes stripped, or null if the
 * template doesn't use this pattern.
 */
function resolveNumberedSuffixFields(rawFields, monsterName) {
  // Detect the pattern: at least 4 keys ending in a digit
  const numberedKeys = Object.keys(rawFields).filter(k => /\d+$/.test(k));
  if (numberedKeys.length < 4) return null;

  // Find distinct suffix values ('1', '2', sometimes more)
  const suffixes = [...new Set(numberedKeys.map(k => k.match(/(\d+)$/)[1]))].sort();
  if (suffixes.length < 2) return null;

  // Determine which suffix matches this monster's sub-type via name1/name2
  let targetSuffix = suffixes[0]; // default: first variant

  if (monsterName) {
    // "Aartuk, Elder"             → parts = ["elder"]
    // "Amphibian, Poisonous, Frog"→ parts = ["poisonous", "frog"]
    const parts = monsterName.split(',').slice(1).map(p => p.trim().toLowerCase());

    outer:
    for (const suf of suffixes) {
      const nameVal = (rawFields[`name${suf}`] ?? '').toLowerCase().trim();
      if (!nameVal) continue;
      // Strip trailing 's' for loose plural matching ("Frogs" ↔ "Frog")
      const nameNorm = nameVal.replace(/s$/, '');
      for (const part of parts) {
        const partNorm = part.replace(/s$/, '');
        if (partNorm.length >= 3 && (nameNorm.includes(partNorm) || partNorm.includes(nameNorm))) {
          targetSuffix = suf;
          break outer;
        }
      }
    }
  }

  // Build result: de-suffixed target fields + any un-suffixed non-metadata fields
  const SKIP = new Set(['caption', 'name', 'source', 'source1', 'source2', 'image',
                        'name1', 'name2', 'name3', 'name4']);
  const result = {};

  // Plain (non-numbered) fields first
  for (const [key, val] of Object.entries(rawFields)) {
    if (!/\d+$/.test(key) && !SKIP.has(key) && val) result[key] = val;
  }

  // Numbered fields for the chosen suffix — strip the suffix to get base key
  for (const [key, val] of Object.entries(rawFields)) {
    if (key.endsWith(targetSuffix)) {
      const baseKey = key.slice(0, key.length - targetSuffix.length);
      if (baseKey && !SKIP.has(baseKey) && val) result[baseKey] = val;
    }
  }

  return Object.keys(result).length > 0 ? result : null;
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

  // ── Strategy A: numbered-suffix dual-variant template ─────────────────────
  // Most common multi-variant pattern: single template, every field doubled as
  // field1/field2.  Resolve before trying multi-template header matching.
  const firstFields = allTemplates[0].fields;
  const resolved = resolveNumberedSuffixFields(firstFields, monsterName);
  if (resolved) return resolved;

  // ── Strategy B: single template, no suffix — return as-is ─────────────────
  if (allTemplates.length === 1 || !monsterName) {
    return firstFields;
  }

  // ── Strategy C: multiple separate {{Creature}} blocks — match by section ───
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
    // No header match — try 'name' field inside the template
    for (const { fields } of allTemplates) {
      const tmplName = (fields.name ?? '').toLowerCase();
      if (tmplName.includes(subtype)) return fields;
    }
  }

  // Fall back to first template
  return firstFields;
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
      let v = cleanValue(rawVal);
      if (v == null) continue;
      // Truncate to column limit to prevent "value too long" errors
      const maxLen = COL_MAX_LEN[col];
      if (maxLen && v.length > maxLen) v = v.slice(0, maxLen);
      updates[col] = v;
    }
  }
  return updates;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Monster Stats Re-Importer v3 (wiki template parser) ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode      : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit     : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  if (NAME_FILTER)    console.log(`  Filter    : name ILIKE '%${NAME_FILTER}%'`);
  if (DEBUG_KEYS_MAX) console.log(`  Debug keys: first ${DEBUG_KEYS_MAX} "no fields" cases`);
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
  let debugKeysSeen = 0;

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
      if (Object.keys(updates).length === 0) {
        noFields++;
        // --debug-keys: dump the raw extracted keys so we can add them to FIELD_MAP
        if (DEBUG_KEYS_MAX && debugKeysSeen < DEBUG_KEYS_MAX) {
          debugKeysSeen++;
          const allKeys = Object.keys(wikiFields);
          console.log(`\n  [debug-keys] "${name}"`);
          console.log(`    raw keys (${allKeys.length}): ${allKeys.join(', ')}`);
          // Show a sample value for each key
          for (const k of allKeys.slice(0, 12)) {
            console.log(`      ${k.padEnd(24)} = ${String(wikiFields[k]).slice(0, 60)}`);
          }
        }
        await sleep(DELAY_MS);
        continue;
      }

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
      // Full error on its own line so it's readable
      console.log(`\n  ✗ [${name}] ${e.message}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  ── Results ──────────────────────────────────');
  console.log(`  Updated      : ${updated}`);
  console.log(`  URL fixed    : ${urlFixed}`);
  console.log(`  Not found    : ${notFound}`);
  console.log(`  No template  : ${noTemplate}`);
  console.log(`  No fields    : ${noFields}  ← run with --debug-keys to inspect`);
  console.log(`  Errors       : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
