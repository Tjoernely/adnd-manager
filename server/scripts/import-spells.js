#!/usr/bin/env node
/**
 * import-spells.js
 * ────────────────────────────────────────────────────────────────────────────
 * Scrapes AD&D 2e spells from the Forgotten Realms / AD&D 2e Fandom wikis
 * using the MediaWiki API + cheerio HTML parsing, then upserts them into
 * the PostgreSQL `spells` table.
 *
 * Usage:
 *   node scripts/import-spells.js [--group wizard|priest] [--dry-run]
 *
 * Options:
 *   --group wizard   Import only wizard spells (default: both)
 *   --group priest   Import only priest spells
 *   --dry-run        Parse + print without writing to DB
 *   --limit N        Stop after N spells (useful for testing)
 *
 * Prerequisites:
 *   npm install  (axios and cheerio must be in server/package.json)
 *   .env with DB_* vars must be present in server/
 * ────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: `${__dirname}/../.env` });

const axios   = require('axios');
const cheerio = require('cheerio');
const db      = require('../db');

// ── CLI args ──────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const LIMIT   = (() => { const i = args.indexOf('--limit'); return i !== -1 ? parseInt(args[i + 1], 10) : Infinity; })();
const GROUP_FILTER = (() => { const i = args.indexOf('--group'); return i !== -1 ? args[i + 1] : null; })();

// ── Wiki configuration ────────────────────────────────────────────────────────
const WIKI_API = 'https://adnd2e.fandom.com/api.php';

const CATEGORY_MAP = {
  wizard: 'Wizard_spells',
  priest: 'Priest_spells',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchCategoryMembers(category) {
  const members = [];
  let cmcontinue = undefined;

  do {
    const params = {
      action:  'query',
      list:    'categorymembers',
      cmtitle: `Category:${category}`,
      cmlimit: 500,
      cmtype:  'page',
      format:  'json',
      ...(cmcontinue ? { cmcontinue } : {}),
    };

    const { data } = await axios.get(WIKI_API, { params, timeout: 15000 });
    const pages = data?.query?.categorymembers ?? [];
    members.push(...pages.map(p => p.title));

    cmcontinue = data?.continue?.cmcontinue;
    await sleep(200);
  } while (cmcontinue);

  return members;
}

async function fetchPageHTML(title) {
  const { data } = await axios.get(WIKI_API, {
    params: {
      action: 'parse',
      page:   title,
      prop:   'text',
      format: 'json',
    },
    timeout: 20000,
  });
  return data?.parse?.text?.['*'] ?? null;
}

/**
 * Extract spell fields from a Fandom wiki page's HTML.
 * The AD&D 2e wiki uses infobox tables with class "wikitable" or similar.
 */
function parseSpellPage(title, html, spellGroup) {
  const $ = cheerio.load(html);
  const spell = {
    name:           title,
    spell_group:    spellGroup,
    level:          null,
    school:         null,
    sphere:         null,
    source:         null,
    description:    '',
    casting_time:   null,
    duration:       null,
    range:          null,
    area_of_effect: null,
    saving_throw:   null,
    components:     null,
    reversible:     false,
    tags:           [],
    raw_import_data: {},
  };

  // ── Infobox parsing ──────────────────────────────────────────────────────
  // Fandom infoboxes render as tables or portable-infobox divs
  const rawFields = {};

  // Portable infobox (newer style)
  $('div.pi-item[data-source]').each((_, el) => {
    const key = $(el).attr('data-source')?.toLowerCase().trim();
    const val = $(el).find('.pi-data-value').text().trim();
    if (key && val) rawFields[key] = val;
  });

  // Classic wikitable rows (th → td)
  $('table.wikitable tr, table.infobox tr').each((_, row) => {
    const th = $(row).find('th').first().text().trim().toLowerCase();
    const td = $(row).find('td').first().text().trim();
    if (th && td) rawFields[th] = td;
  });

  spell.raw_import_data = rawFields;

  // Map raw fields to structured columns
  const get = (...keys) => {
    for (const k of keys) {
      const v = rawFields[k];
      if (v) return v;
    }
    return null;
  };

  const levelRaw = get('level', 'spell level');
  if (levelRaw) {
    const m = levelRaw.match(/\d+/);
    spell.level = m ? parseInt(m[0], 10) : null;
  }

  spell.school         = get('school', 'magic school', 'school of magic');
  spell.sphere         = get('sphere', 'spheres');
  spell.source         = get('source', 'sourcebook', 'book');
  spell.casting_time   = get('casting time', 'casting_time', 'ct');
  spell.duration       = get('duration');
  spell.range          = get('range');
  spell.area_of_effect = get('area of effect', 'area_of_effect', 'aoe');
  spell.saving_throw   = get('saving throw', 'saving_throw', 'st');
  spell.components     = get('components');

  const revRaw = get('reversible');
  spell.reversible = /yes|true/i.test(revRaw ?? '');

  // ── Description: main content paragraphs ────────────────────────────────
  // Remove infobox and nav elements, grab the remaining text
  $('table.wikitable, table.infobox, div.pi-item, .navbox, .toc, script, style').remove();
  const contentParts = [];
  $('div.mw-parser-output p').each((_, p) => {
    const text = $(p).text().trim();
    if (text.length > 20) contentParts.push(text);
  });
  spell.description = contentParts.join('\n\n').slice(0, 8000); // reasonable cap

  // ── Tags derived from school / sphere ────────────────────────────────────
  if (spell.school) spell.tags.push(spell.school.toLowerCase().split('/')[0].trim());
  if (spell.sphere) {
    spell.sphere.split(/[,/]/).forEach(s => {
      const t = s.trim().toLowerCase();
      if (t && t !== 'all') spell.tags.push(t);
    });
  }

  return spell;
}

async function upsertSpell(spell) {
  await db.query(
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
      spell.reversible, JSON.stringify(spell.tags), JSON.stringify(spell.raw_import_data),
    ],
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function importGroup(groupKey) {
  const category = CATEGORY_MAP[groupKey];
  console.log(`\n📚 Fetching category: ${category} …`);

  const titles = await fetchCategoryMembers(category);
  console.log(`   Found ${titles.length} pages`);

  let count  = 0;
  let errors = 0;

  for (const title of titles) {
    if (count >= LIMIT) break;

    try {
      const html = await fetchPageHTML(title);
      if (!html) { console.warn(`  ⚠ No HTML for: ${title}`); continue; }

      const spell = parseSpellPage(title, html, groupKey);

      if (DRY_RUN) {
        console.log(`  [DRY] ${spell.name} | Lv${spell.level} | ${spell.school ?? spell.sphere ?? '—'}`);
      } else {
        await upsertSpell(spell);
        process.stdout.write('.');
      }

      count++;
      await sleep(300); // be polite to the wiki
    } catch (err) {
      console.error(`\n  ✗ Error processing "${title}": ${err.message}`);
      errors++;
    }
  }

  console.log(`\n✅ ${groupKey}: ${count} spells processed, ${errors} errors`);
}

async function main() {
  const groups = GROUP_FILTER
    ? [GROUP_FILTER]
    : ['wizard', 'priest'];

  for (const g of groups) {
    if (!CATEGORY_MAP[g]) {
      console.error(`Unknown group: ${g}. Must be 'wizard' or 'priest'.`);
      process.exit(1);
    }
    await importGroup(g);
  }

  if (!DRY_RUN) await db.pool.end();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
