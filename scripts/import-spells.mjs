#!/usr/bin/env node
/**
 * scripts/import-spells.mjs
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches every AD&D 2e spell from the Fandom wiki via the MediaWiki API
 * (raw wikitext), parses infobox fields, and UPSERTs into PostgreSQL.
 *
 * Run from the server/ directory (so .env is found automatically):
 *   cd server && node ../scripts/import-spells.mjs [options]
 *
 * Or via npm script in server/:
 *   npm run import:spells
 *
 * Options:
 *   --group wizard|priest   Import only one group  (default: both)
 *   --dry-run               Parse + print without writing to DB
 *   --limit N               Stop after N spells (testing)
 *
 * Prerequisites:
 *   Node 18+ (native fetch required)
 *   server/.env with DB_* vars (or export them beforehand)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createRequire }  from 'module';
import { readFileSync }   from 'fs';
import { fileURLToPath }  from 'url';
import { dirname, join }  from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

// ── Load .env from cwd (server/) or adjacent server/ dir ────────────────────
function loadEnv() {
  const candidates = [
    join(process.cwd(), '.env'),                   // cwd (server/) when run via npm script
    join(__dirname, '..', 'server', '.env'),        // project-root relative fallback
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
    } catch { /* file not found — try next */ }
  }
  return null;
}
const envFile = loadEnv();

// ── pg Pool — resolve from server/node_modules ───────────────────────────────
const serverDir = join(__dirname, '..', 'server');
const req       = createRequire(join(serverDir, 'package.json'));
const { Pool }  = req('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     ?? 'localhost',
  port:     parseInt(process.env.DB_PORT ?? '5432'),
  database: process.env.DB_NAME     ?? 'adnd_manager',
  user:     process.env.DB_USER     ?? 'adnd',
  password: process.env.DB_PASSWORD,
  max: 3,
  connectionTimeoutMillis: 8_000,
});

// ── CLI args ─────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const GROUP_FILTER = (() => { const i = args.indexOf('--group'); return i !== -1 ? args[i + 1] ?? null : null; })();
const LIMIT        = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();

// ── Constants ────────────────────────────────────────────────────────────────
const WIKI_API    = 'https://adnd2e.fandom.com/api.php';
const USER_AGENT  = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS    = 200;
const MAX_RETRIES = 3;

// Category → expected spell_group (null = infer from wikitext)
const TARGETS = [
  { category: 'Wizard_spells', group: 'wizard' },
  { category: 'Priest_spells', group: 'priest' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiFetch(params, retry = 0) {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    if (retry < MAX_RETRIES) {
      const wait = 1000 * (2 ** retry);
      process.stderr.write(`\n  ⚠ Network error (${err.message}), retry in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw err;
  }

  if (!res.ok) {
    if (retry < MAX_RETRIES && res.status >= 500) {
      const wait = 1000 * (2 ** retry);
      process.stderr.write(`\n  ⚠ HTTP ${res.status}, retry in ${wait}ms…`);
      await sleep(wait);
      return wikiFetch(params, retry + 1);
    }
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${url}`);
  }

  return res.json();
}

// ── Paginated category member fetch ──────────────────────────────────────────
async function fetchCategoryMembers(category) {
  const titles = [];
  let cmcontinue;

  do {
    const data = await wikiFetch({
      action:  'query',
      list:    'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: 500,
      cmtype:  'page',
      ...(cmcontinue ? { cmcontinue } : {}),
    });

    const pages = data?.query?.categorymembers ?? [];
    titles.push(...pages.map(p => p.title));
    cmcontinue = data?.continue?.cmcontinue;
    if (cmcontinue) await sleep(DELAY_MS);
  } while (cmcontinue);

  return titles;
}

// ── Fetch raw wikitext + page categories ────────────────────────────────────
async function fetchWikitext(title) {
  const data = await wikiFetch({
    action:             'parse',
    page:               title,
    prop:               'wikitext|categories',
    disablelimitreport: '1',
  });
  return {
    wikitext:   data?.parse?.wikitext?.['*']                             ?? '',
    categories: (data?.parse?.categories ?? []).map(c => c['*'] ?? ''),
  };
}

// ── Wikitext infobox parser ───────────────────────────────────────────────────
/**
 * Extracts the outermost template block and parses its key=value pairs.
 * Returns a flat {key: value} map, all keys lowercase.
 */
function extractTemplateFields(wikitext) {
  // Find outermost {{ ... }} — handle nesting up to depth 2
  let start = wikitext.indexOf('{{');
  if (start === -1) return {};

  let depth = 0, end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    if (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') {
      depth--;
      if (depth === 0) { end = i + 2; break; }
      i++;
    }
  }

  const block = end !== -1 ? wikitext.slice(start + 2, end - 2) : wikitext.slice(start + 2);

  // Split on pipe characters that are NOT inside nested {{ }}
  const parts = [];
  let current = '', d = 0;
  for (let i = 0; i < block.length; i++) {
    if (block[i] === '{' && block[i + 1] === '{')      { d++; current += block[i]; }
    else if (block[i] === '}' && block[i + 1] === '}') { d--; current += block[i]; }
    else if (block[i] === '|' && d === 0)               { parts.push(current); current = ''; continue; }
    else                                                { current += block[i]; }
  }
  if (current) parts.push(current);

  const fields = {};
  for (const part of parts.slice(1)) { // parts[0] is the template name
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim()
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1') // unwrap [[link|text]] → text
      .replace(/\{\{[^}]*\}\}/g, '')                     // remove sub-templates
      .replace(/<[^>]+>/g, '')                           // strip HTML tags
      .replace(/'{2,3}/g, '')                            // remove bold/italic markers
      .trim();
    if (k && v) fields[k] = v;
  }
  return fields;
}

function parseSpellPage(title, wikitext, categories, hintGroup) {
  const fields = extractTemplateFields(wikitext);

  // Helper: first matching value among candidate keys
  const get = (...keys) => {
    for (const k of keys) if (fields[k]) return fields[k];
    return null;
  };

  // ── Determine spell_group ────────────────────────────────────────────────
  let spell_group = hintGroup; // may be pre-set from category
  if (!spell_group) {
    if (fields['level wizard'] !== undefined || fields['wizard'] !== undefined) {
      spell_group = 'wizard';
    } else if (fields['level priest'] !== undefined || fields['sphere'] !== undefined) {
      spell_group = 'priest';
    } else {
      const catLower = categories.join(' ').toLowerCase();
      if (catLower.includes('wizard') || catLower.includes('magic-user') || catLower.includes('mage')) {
        spell_group = 'wizard';
      } else if (catLower.includes('priest') || catLower.includes('cleric') || catLower.includes('druid')) {
        spell_group = 'priest';
      } else {
        spell_group = 'wizard'; // final fallback
      }
    }
  }

  // ── Level ────────────────────────────────────────────────────────────────
  let level = null;
  const levelRaw = get(
    `level ${spell_group}`,
    `${spell_group} level`,
    'level',
    'spell level',
  );
  if (levelRaw) {
    const m = levelRaw.match(/\d+/);
    if (m) level = parseInt(m[0], 10);
  }

  // ── Combat stats ─────────────────────────────────────────────────────────
  const school         = get('school', 'magic school', 'school of magic');
  const sphere         = get('sphere', 'spheres', 'sphere(s)');
  const source         = get('source', 'sourcebook', 'references', 'book');
  const casting_time   = get('casting time', 'casting_time', 'ct', 'castingtime');
  const duration       = get('duration');
  const range          = get('range');
  const area_of_effect = get('area of effect', 'area_of_effect', 'aoe', 'area');
  const saving_throw   = get('saving throw', 'saving_throw', 'save', 'st');
  const components     = get('components', 'component');

  const revRaw   = get('reversible') ?? '';
  const reversible = /^(yes|y|true|1)$/i.test(revRaw.trim());

  // ── Description: everything outside the first template block ────────────
  const templateEnd = (() => {
    let d = 0, i = wikitext.indexOf('{{');
    if (i === -1) return 0;
    for (; i < wikitext.length - 1; i++) {
      if (wikitext[i] === '{' && wikitext[i + 1] === '{')      { d++; i++; }
      else if (wikitext[i] === '}' && wikitext[i + 1] === '}') { if (--d === 0) return i + 2; i++; }
    }
    return 0;
  })();

  const descRaw = wikitext.slice(templateEnd)
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')                       // remove remaining templates
    .replace(/==+\s*[^=]+\s*==+/g, '\n')                     // section headers → newline
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')        // unwrap [[links]]
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')               // remove <ref> blocks
    .replace(/<[^>]+>/g, '')                                  // strip remaining HTML
    .replace(/\[\[[^\]]+\]\]/g, '')                           // remove orphan [[...]]
    .replace(/'{2,3}/g, '')                                   // bold/italic markers
    .replace(/^ *[*#:;]+/gm, '')                              // wiki list markers
    .replace(/\n{3,}/g, '\n\n')                               // collapse blank lines
    .trim()
    .slice(0, 8000);

  // ── Tags ─────────────────────────────────────────────────────────────────
  const tags = new Set();
  if (school) school.toLowerCase().split(/[/,]/).forEach(s => { const t = s.trim(); if (t) tags.add(t); });
  if (sphere) sphere.toLowerCase().split(/[/,]/).forEach(s => { const t = s.trim(); if (t && t !== 'all') tags.add(t); });

  return {
    name:           title.slice(0, 255),
    spell_group,
    level,
    school:         school         ? school.slice(0, 100)         : null,
    sphere:         sphere         ? sphere.slice(0, 100)         : null,
    source:         source         ? source.slice(0, 255)         : null,
    description:    descRaw,
    casting_time:   casting_time   ? casting_time.slice(0, 100)   : null,
    duration:       duration       ? duration.slice(0, 100)       : null,
    range:          range          ? range.slice(0, 100)          : null,
    area_of_effect: area_of_effect ? area_of_effect.slice(0, 100) : null,
    saving_throw:   saving_throw   ? saving_throw.slice(0, 100)   : null,
    components:     components     ? components.slice(0, 100)     : null,
    reversible,
    tags:           [...tags].slice(0, 20),
    raw_import_data: fields,
  };
}

// ── DB upsert ────────────────────────────────────────────────────────────────
async function upsertSpell(spell) {
  await pool.query(
    `INSERT INTO spells
       (name, spell_group, level, school, sphere, source, description,
        casting_time, duration, range, area_of_effect, saving_throw,
        components, reversible, tags, raw_import_data)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
     ON CONFLICT (name, spell_group, COALESCE(source, ''))
     DO UPDATE SET
       level          = EXCLUDED.level,
       school         = EXCLUDED.school,
       sphere         = EXCLUDED.sphere,
       description    = EXCLUDED.description,
       casting_time   = EXCLUDED.casting_time,
       duration       = EXCLUDED.duration,
       range          = EXCLUDED.range,
       area_of_effect = EXCLUDED.area_of_effect,
       saving_throw   = EXCLUDED.saving_throw,
       components     = EXCLUDED.components,
       reversible     = EXCLUDED.reversible,
       tags           = EXCLUDED.tags,
       raw_import_data= EXCLUDED.raw_import_data,
       updated_at     = NOW()`,
    [
      spell.name,           spell.spell_group,   spell.level,
      spell.school,         spell.sphere,         spell.source,
      spell.description,    spell.casting_time,   spell.duration,
      spell.range,          spell.area_of_effect, spell.saving_throw,
      spell.components,     spell.reversible,
      JSON.stringify(spell.tags),
      JSON.stringify(spell.raw_import_data),
    ],
  );
}

// ── Import one category ───────────────────────────────────────────────────────
async function importCategory(category, spellGroup) {
  console.log(`\n📚  Category : ${category}`);
  console.log(  `    Group   : ${spellGroup ?? '(detect from wikitext)'}`);

  const titles = await fetchCategoryMembers(category);
  console.log(`    Pages   : ${titles.length}`);
  if (titles.length === 0) {
    console.log('    ⚠ No pages found — skipping category');
    return { processed: 0, errors: 0 };
  }

  let processed = 0, errors = 0, skipped = 0;
  const progressCols = 60;

  for (const title of titles) {
    if (processed + errors >= LIMIT) break;

    let wikitext = '', cats = [];
    try {
      ({ wikitext, categories: cats } = await fetchWikitext(title));
    } catch (err) {
      process.stderr.write(`\n  ✗ Fetch failed for "${title}": ${err.message}`);
      errors++;
      await sleep(500);
      continue;
    }

    if (!wikitext.trim()) {
      skipped++;
      await sleep(DELAY_MS);
      continue;
    }

    let spell;
    try {
      spell = parseSpellPage(title, wikitext, cats, spellGroup);
    } catch (err) {
      process.stderr.write(`\n  ✗ Parse failed for "${title}": ${err.message}`);
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    if (DRY_RUN) {
      const loc = spell.school ?? spell.sphere ?? '—';
      console.log(
        `  [DRY] ${spell.name.padEnd(40)} | Lv${String(spell.level ?? '?').padStart(2)} | ${spell.spell_group.padEnd(6)} | ${loc}`,
      );
    } else {
      try {
        await upsertSpell(spell);
      } catch (err) {
        process.stderr.write(`\n  ✗ DB error for "${title}": ${err.message}`);
        errors++;
        await sleep(DELAY_MS);
        continue;
      }
      processed++;

      // Inline progress bar
      const done    = processed + errors;
      const total   = Math.min(titles.length, LIMIT === Infinity ? titles.length : LIMIT);
      const pct     = total > 0 ? Math.floor((done / total) * progressCols) : 0;
      const bar     = '█'.repeat(pct) + '░'.repeat(progressCols - pct);
      process.stdout.write(`\r  [${bar}] ${done}/${total}  (${errors} err)`);
    }

    await sleep(DELAY_MS);
  }

  process.stdout.write('\n');
  console.log(`  ✅ Done: ${processed} upserted, ${skipped} skipped, ${errors} errors`);
  return { processed, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AD&D 2E Spell Importer — wikitext mode      ║');
  console.log('╚══════════════════════════════════════════════╝');
  console.log(`  Source  : ${WIKI_API}`);
  if (envFile) console.log(`  Env     : ${envFile}`);
  if (DRY_RUN)        console.log('  Mode    : DRY RUN (no DB writes)');
  if (LIMIT < Infinity) console.log(`  Limit   : ${LIMIT} spells per category`);
  if (GROUP_FILTER)   console.log(`  Filter  : ${GROUP_FILTER} only`);
  console.log('');

  // Determine which categories to run
  let targets = TARGETS;
  if (GROUP_FILTER) {
    targets = TARGETS.filter(t => t.group === GROUP_FILTER);
    if (targets.length === 0) {
      console.error(`Unknown --group "${GROUP_FILTER}". Valid: wizard | priest`);
      process.exit(1);
    }
  }

  let totalProcessed = 0, totalErrors = 0;
  for (const { category, group } of targets) {
    const { processed, errors } = await importCategory(category, group);
    totalProcessed += processed;
    totalErrors    += errors;
  }

  console.log('');
  console.log(`📊 Grand total: ${totalProcessed} spells imported, ${totalErrors} errors`);

  if (!DRY_RUN) await pool.end();
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
