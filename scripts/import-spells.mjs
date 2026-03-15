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
 *   --limit N               Stop after N spells per group (testing)
 *
 * Title-discovery waterfall (per group):
 *   1. MediaWiki category  "Wizard spells"   (space)
 *   2. MediaWiki category  "Wizard_spells"   (underscore)
 *   3. MediaWiki category  "Wizard Spells"   (capital S)
 *   4. parse prop=links from  All_Wizard_Spells  list page
 *   5. parse prop=links from  Wizard_Spells_Level_1 … Level_9  pages
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

// ── pg Pool — lazy init so --dry-run works without pg installed ───────────────
// On the production server, pg lives in server/node_modules/.
// Locally (dev) it may not be installed, but that's fine for dry-run.
const serverDir = join(__dirname, '..', 'server');
const serverReq = createRequire(join(serverDir, 'index.js'));

let _pool = null;
function getPool() {
  if (_pool) return _pool;
  let Pool;
  try {
    ({ Pool } = serverReq('pg'));
  } catch {
    // pg not in server/node_modules — try root node_modules (unlikely)
    try { ({ Pool } = serverReq('../node_modules/pg/lib/index.js')); }
    catch { throw new Error('Cannot find "pg" module. Run: cd server && npm install'); }
  }
  _pool = new Pool({
    host:     process.env.DB_HOST     ?? 'localhost',
    port:     parseInt(process.env.DB_PORT ?? '5432'),
    database: process.env.DB_NAME     ?? 'adnd_manager',
    user:     process.env.DB_USER     ?? 'adnd',
    password: process.env.DB_PASSWORD,
    max: 3,
    connectionTimeoutMillis: 8_000,
  });
  return _pool;
}

// ── CLI args ─────────────────────────────────────────────────────────────────
const args         = process.argv.slice(2);
const DRY_RUN      = args.includes('--dry-run');
const GROUP_FILTER = (() => { const i = args.indexOf('--group');  return i !== -1 ? args[i + 1] ?? null : null; })();
const LIMIT        = (() => { const i = args.indexOf('--limit');  return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();

// ── Constants ────────────────────────────────────────────────────────────────
const WIKI_API   = 'https://adnd2e.fandom.com/api.php';
const WIKI_BASE  = 'https://adnd2e.fandom.com';
const USER_AGENT = 'adnd-campaign-manager/1.0 (https://github.com/Tjoernely/adnd-manager)';
const DELAY_MS   = 200;
const MAX_RETRY  = 3;

// Non-spell pages to skip when harvesting links from list pages
const SKIP_PREFIXES = [
  'Category:', 'File:', 'Template:', 'Help:', 'User:', 'Talk:',
  'Special:', 'MediaWiki:', 'AD&D', 'Main Page', 'Spell', 'List',
  'All ', 'Wizard Spells', 'Priest Spells',
];
const SKIP_EXACT = new Set([
  'Wizard', 'Priest', 'Magic', 'Cleric', 'Druid',
  'Spells', 'Spell list', 'Spell List',
]);

// ── HTTP helper ───────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function wikiFetch(params, retry = 0) {
  const url = new URL(WIKI_API);
  url.search = new URLSearchParams({ ...params, format: 'json' }).toString();

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

// ── Method A: MediaWiki category API ─────────────────────────────────────────
async function tryCategory(categoryTitle) {
  const titles = [];
  let cmcontinue;

  do {
    const data = await wikiFetch({
      action:  'query',
      list:    'categorymembers',
      cmtitle: `Category:${categoryTitle}`,
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

// ── Method B: parse prop=links from a wiki list page ────────────────────────
// Returns article titles (namespace 0) linked from the given page title.
async function titlesFromListPage(pageTitle) {
  // Use allpages iteration + prop=links to stay within API
  // Fetch rendered links list — prop=links gives all [[...]] targets
  const data = await wikiFetch({
    action:  'parse',
    page:    pageTitle,
    prop:    'links',
    disablelimitreport: '1',
  });

  const raw = data?.parse?.links ?? [];
  return raw
    .filter(l => l.ns === 0 && l['*'])        // namespace 0 = articles
    .map(l => l['*'])
    .filter(t => !SKIP_EXACT.has(t))
    .filter(t => !SKIP_PREFIXES.some(p => t.startsWith(p)));
}

// ── Method C: scan individual level pages ────────────────────────────────────
async function titlesFromLevelPages(group) {
  const prefix = group === 'wizard' ? 'Wizard_Spells_Level_' : 'Priest_Spells_Level_';
  const allTitles = new Set();

  for (let lvl = 1; lvl <= 9; lvl++) {
    try {
      const titles = await titlesFromListPage(`${prefix}${lvl}`);
      titles.forEach(t => allTitles.add(t));
      process.stdout.write(`    Level ${lvl}: ${titles.length} links\n`);
      await sleep(DELAY_MS);
    } catch (err) {
      process.stdout.write(`    Level ${lvl}: not found (${err.message})\n`);
    }
  }

  return [...allTitles];
}

// ── Master title discovery ────────────────────────────────────────────────────
async function discoverSpellTitles(group) {
  const G = group === 'wizard' ? 'Wizard' : 'Priest';

  // Category name candidates — most-likely first (confirmed: capital-S form works)
  const categoryVariants = [
    `${G} Spells`,         // ✓ confirmed: "Wizard Spells" / "Priest Spells"
    `${G}_Spells`,
    `${G} spells`,         // lower-s variants as fallback
    `${G}_spells`,
  ];

  for (const variant of categoryVariants) {
    process.stdout.write(`  Trying category "${variant}" … `);
    try {
      const titles = await tryCategory(variant);
      if (titles.length > 0) {
        process.stdout.write(`✓ ${titles.length} pages\n`);
        return { titles, method: `Category:${variant}` };
      }
      process.stdout.write('0 results\n');
    } catch (err) {
      process.stdout.write(`error (${err.message})\n`);
    }
    await sleep(DELAY_MS);
  }

  // Fallback B: "All Wizard Spells" list page
  const listPage = `All_${G}_Spells`;
  process.stdout.write(`  Trying list page "${listPage}" … `);
  try {
    const titles = await titlesFromListPage(listPage);
    if (titles.length > 0) {
      process.stdout.write(`✓ ${titles.length} links\n`);
      return { titles, method: `links:${listPage}` };
    }
    process.stdout.write('0 links\n');
  } catch (err) {
    process.stdout.write(`error (${err.message})\n`);
  }

  // Fallback C: individual level pages
  process.stdout.write(`  Trying individual level pages for ${group}…\n`);
  const titles = await titlesFromLevelPages(group);
  if (titles.length > 0) {
    return { titles, method: 'level-pages' };
  }

  return { titles: [], method: 'none' };
}

// ── Wikitext fetcher ──────────────────────────────────────────────────────────
async function fetchWikitext(title) {
  const data = await wikiFetch({
    action:             'parse',
    page:               title,
    prop:               'wikitext|categories',
    disablelimitreport: '1',
  });
  return {
    wikitext:   data?.parse?.wikitext?.['*']                 ?? '',
    categories: (data?.parse?.categories ?? []).map(c => c['*'] ?? ''),
  };
}

// ── Wikitext infobox parser ───────────────────────────────────────────────────
function extractTemplateFields(wikitext) {
  const start = wikitext.indexOf('{{');
  if (start === -1) return {};

  // Walk forward tracking nesting depth to find the closing }}
  let depth = 0, end = -1;
  for (let i = start; i < wikitext.length - 1; i++) {
    if      (wikitext[i] === '{' && wikitext[i + 1] === '{') { depth++; i++; }
    else if (wikitext[i] === '}' && wikitext[i + 1] === '}') { if (--depth === 0) { end = i + 2; break; } i++; }
  }

  const block = end !== -1 ? wikitext.slice(start + 2, end - 2) : wikitext.slice(start + 2);

  // Split on pipes that are not inside nested {{ }}
  const parts = [];
  let cur = '', d = 0;
  for (let i = 0; i < block.length; i++) {
    if      (block[i] === '{' && block[i + 1] === '{') { d++; cur += block[i]; }
    else if (block[i] === '}' && block[i + 1] === '}') { d--; cur += block[i]; }
    else if (block[i] === '|' && d === 0)               { parts.push(cur); cur = ''; continue; }
    else                                                { cur += block[i]; }
  }
  if (cur) parts.push(cur);

  const fields = {};
  for (const part of parts.slice(1)) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const k = part.slice(0, eq).trim().toLowerCase();
    const v = part.slice(eq + 1).trim()
      .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
      .replace(/\{\{[^}]*\}\}/g, '')
      .replace(/<[^>]+>/g, '')
      .replace(/'{2,3}/g, '')
      .trim();
    if (k && v) fields[k] = v;
  }
  return fields;
}

function parseSpellPage(title, wikitext, categories, hintGroup) {
  const fields = extractTemplateFields(wikitext);
  const get    = (...keys) => { for (const k of keys) if (fields[k]) return fields[k]; return null; };

  // ── spell_group ──────────────────────────────────────────────────────────
  let spell_group = hintGroup;
  if (!spell_group) {
    if (fields['level wizard'] !== undefined || fields['wizard'] !== undefined) {
      spell_group = 'wizard';
    } else if (fields['level priest'] !== undefined || fields['sphere'] !== undefined) {
      spell_group = 'priest';
    } else {
      const catLower = categories.join(' ').toLowerCase();
      spell_group = (catLower.includes('priest') || catLower.includes('cleric') || catLower.includes('druid'))
        ? 'priest' : 'wizard';
    }
  }

  // ── level ────────────────────────────────────────────────────────────────
  let level = null;
  const levelRaw = get(`level ${spell_group}`, `${spell_group} level`, 'level', 'spell level');
  if (levelRaw) { const m = levelRaw.match(/\d+/); if (m) level = parseInt(m[0], 10); }

  // ── stat fields ──────────────────────────────────────────────────────────
  const school         = get('school', 'magic school', 'school of magic');
  const sphere         = get('sphere', 'spheres', 'sphere(s)');
  const source         = get('source', 'sourcebook', 'references', 'book');
  const casting_time   = get('casting time', 'casting_time', 'ct', 'castingtime');
  const duration       = get('duration');
  const range          = get('range');
  const area_of_effect = get('area of effect', 'area_of_effect', 'aoe', 'area');
  const saving_throw   = get('saving throw', 'saving_throw', 'save', 'st');
  const components     = get('components', 'component');
  const reversible     = /^(yes|y|true|1)$/i.test((get('reversible') ?? '').trim());

  // ── description: text outside the first template block ──────────────────
  const templateEnd = (() => {
    let d = 0, i = wikitext.indexOf('{{');
    if (i === -1) return 0;
    for (; i < wikitext.length - 1; i++) {
      if      (wikitext[i] === '{' && wikitext[i + 1] === '{') { d++; i++; }
      else if (wikitext[i] === '}' && wikitext[i + 1] === '}') { if (--d === 0) return i + 2; i++; }
    }
    return 0;
  })();

  const descRaw = wikitext.slice(templateEnd)
    .replace(/\{\{[\s\S]*?\}\}/g, ' ')
    .replace(/==+\s*[^=]+\s*==+/g, '\n')
    .replace(/\[\[(?:[^\]|]+\|)?([^\]]+)\]\]/g, '$1')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/'{2,3}/g, '')
    .replace(/^ *[*#:;]+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 8000);

  // ── tags ─────────────────────────────────────────────────────────────────
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

// ── DB upsert ─────────────────────────────────────────────────────────────────
async function upsertSpell(spell) {
  await getPool().query(
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
      spell.name, spell.spell_group, spell.level, spell.school, spell.sphere,
      spell.source, spell.description, spell.casting_time, spell.duration,
      spell.range, spell.area_of_effect, spell.saving_throw, spell.components,
      spell.reversible,
      JSON.stringify(spell.tags),
      JSON.stringify(spell.raw_import_data),
    ],
  );
}

// ── Import one group ──────────────────────────────────────────────────────────
async function importGroup(group) {
  const G = group === 'wizard' ? 'Wizard' : 'Priest';
  console.log(`\n${'─'.repeat(58)}`);
  console.log(`  ${G} spells`);
  console.log(`${'─'.repeat(58)}`);

  // ── Discover spell titles ────────────────────────────────────────────────
  console.log('  Discovering spell titles…');
  const { titles, method } = await discoverSpellTitles(group);

  if (titles.length === 0) {
    console.log(`  ✗ Could not find any ${group} spell pages. Skipping.`);
    return { processed: 0, errors: 0 };
  }

  const cap = LIMIT < Infinity ? Math.min(titles.length, LIMIT) : titles.length;
  console.log(`  Found ${titles.length} titles via [${method}] — importing ${cap}`);
  if (DRY_RUN) console.log('  (DRY RUN — no DB writes)\n');

  let processed = 0, errors = 0, skipped = 0;
  const work = titles.slice(0, cap);

  for (const title of work) {
    let wikitext = '', cats = [];
    try {
      ({ wikitext, categories: cats } = await fetchWikitext(title));
    } catch (err) {
      process.stderr.write(`\n  ✗ Fetch "${title}": ${err.message}`);
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
      spell = parseSpellPage(title, wikitext, cats, group);
    } catch (err) {
      process.stderr.write(`\n  ✗ Parse "${title}": ${err.message}`);
      errors++;
      await sleep(DELAY_MS);
      continue;
    }

    if (DRY_RUN) {
      const loc = spell.school ?? spell.sphere ?? '—';
      console.log(
        `  [DRY] ${spell.name.padEnd(42)} Lv${String(spell.level ?? '?').padStart(2)}  ${loc}`,
      );
    } else {
      try {
        await upsertSpell(spell);
      } catch (err) {
        process.stderr.write(`\n  ✗ DB "${title}": ${err.message}`);
        errors++;
        await sleep(DELAY_MS);
        continue;
      }
      processed++;

      const done  = processed + errors + skipped;
      const pct   = Math.floor((done / work.length) * 50);
      const bar   = '█'.repeat(pct) + '░'.repeat(50 - pct);
      process.stdout.write(`\r  [${bar}] ${done}/${work.length}  (${errors} err)`);
    }

    await sleep(DELAY_MS);
  }

  process.stdout.write('\n');
  console.log(`  ✅ ${processed} upserted, ${skipped} skipped, ${errors} errors`);
  return { processed, errors };
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║  AD&D 2E Spell Importer                                  ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Wiki     : ${WIKI_BASE}`);
  if (envFile)           console.log(`  Env      : ${envFile}`);
  if (DRY_RUN)           console.log('  Mode     : DRY RUN — no DB writes');
  if (LIMIT < Infinity)  console.log(`  Limit    : ${LIMIT} spells per group`);
  if (GROUP_FILTER)      console.log(`  Filter   : ${GROUP_FILTER} only`);

  const groups = GROUP_FILTER ? [GROUP_FILTER] : ['wizard', 'priest'];

  for (const g of groups) {
    if (g !== 'wizard' && g !== 'priest') {
      console.error(`Unknown --group "${g}". Valid values: wizard | priest`);
      process.exit(1);
    }
  }

  let totalProcessed = 0, totalErrors = 0;
  for (const g of groups) {
    const { processed, errors } = await importGroup(g);
    totalProcessed += processed;
    totalErrors    += errors;
  }

  console.log(`\n${'═'.repeat(58)}`);
  console.log(`  Grand total: ${totalProcessed} spells imported, ${totalErrors} errors`);
  console.log(`${'═'.repeat(58)}`);

  if (!DRY_RUN && _pool) await _pool.end();
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
