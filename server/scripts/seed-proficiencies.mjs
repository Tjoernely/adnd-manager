#!/usr/bin/env node
/**
 * seed-proficiencies.mjs  v4
 * - Trin 1: Fix class-access records (korrekt type casting)
 * - Trin 2: Import alle NWPs fra wiki (DOM-scraping via puppeteer-free approach)
 * Kør: node server/scripts/seed-proficiencies.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

function toId(name) {
  return name.toLowerCase()
    .replace(/[(),\/:]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
function abilityToStat(a) {
  const m = {
    strength:'muscle', str:'muscle',
    dexterity:'aim', dex:'aim',
    constitution:'fitness', con:'fitness',
    intelligence:'knowledge', int:'knowledge', intellect:'knowledge', intellig:'knowledge',
    wisdom:'intuition', wis:'intuition',
    charisma:'leadership', cha:'leadership',
  };
  return m[(a||'').toLowerCase().substring(0,10)] ?? null;
}
const VALID = new Set(['muscle','stamina','aim','balance','fitness','health',
  'reason','knowledge','intuition','willpower','leadership','appearance']);
function vs(s) { return VALID.has(s) ? s : null; }

// ── Trin 1: Fix class-access ─────────────────────────────────────────────
async function fixClassAccess() {
  console.log('Trin 1: Fix class-access records...');

  // General -> any (use $1 and $2 as separate params to avoid type ambiguity)
  const genProfs = await db.query(
    "SELECT id FROM nonweapon_proficiencies WHERE prof_group = 'general'"
  );
  let ins = 0;
  for (const row of genProfs.rows) {
    try {
      await db.query(
        'INSERT INTO proficiency_class_access(prof_id, class_group) VALUES($1, $2) ON CONFLICT DO NOTHING',
        [row.id, 'any']
      );
      ins++;
    } catch(_) {}
  }
  console.log('  general -> any: ' + ins + ' inserted');

  // Group-specific
  for (const g of ['priest','rogue','warrior','wizard','psionicist','chronomancer']) {
    const rows = await db.query(
      'SELECT id FROM nonweapon_proficiencies WHERE prof_group = $1', [g]
    );
    let gIns = 0;
    for (const row of rows.rows) {
      try {
        await db.query(
          'INSERT INTO proficiency_class_access(prof_id, class_group) VALUES($1, $2) ON CONFLICT DO NOTHING',
          [row.id, g]
        );
        gIns++;
      } catch(_) {}
    }
    console.log('  ' + g + ': ' + gIns + ' inserted');
  }

  const total = await db.query('SELECT COUNT(*)::int AS n FROM proficiency_class_access');
  console.log('  Total class-access rows: ' + total.rows[0].n);
}

// ── Trin 2: Wiki NWPs (375 proficiencies) ───────────────────────────────
// Data scraped from DOM on adnd2e.fandom.com/wiki/Nonweapon_Proficiencies
// Groups: general(~80), priest(~50), rogue(~45), warrior(~45), wizard(~55),
//         psionicist, chronomancer, avariel, other
async function importWikiProfs() {
  console.log('Trin 2: Import wiki proficiencies...');

  // Fetch wiki and parse with Node's built-in (no puppeteer needed)
  // We use a simple regex approach on the raw HTML since we know the structure
  let html;
  try {
    const { default: https } = await import('https');
    html = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'adnd2e.fandom.com',
        path: '/wiki/Nonweapon_Proficiencies',
        headers: { 'User-Agent': 'Mozilla/5.0' }
      };
      https.get(options, res => {
        let data = '';
        res.on('data', d => data += d);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  } catch(e) {
    console.error('  Wiki fetch failed:', e.message);
    return;
  }

  // Extract section -> group mapping from h2 headers
  const sectionMap = {
    'General':'general','Priest':'priest','Rogue':'rogue',
    'Warrior':'warrior','Wizard':'wizard','Psionicist':'psionicist',
    'Chronomancer':'chronomancer','Avariel':'avariel'
  };

  let currentGroup = 'general';
  let newCount = 0, updCount = 0;

  // Split by lines and process
  const lines = html.split('\n');
  for (const line of lines) {
    // Detect section from h2 id
    const secMatch = line.match(/id="(General|Priest|Rogue|Warrior|Wizard|Psionicist|Chronomancer|Avariel[^"]*)">/i);
    if (secMatch) {
      const key = Object.keys(sectionMap).find(k =>
        secMatch[1].toLowerCase().startsWith(k.toLowerCase())
      );
      if (key) currentGroup = sectionMap[key];
      continue;
    }

    // Parse table rows — wiki renders each row on one line
    // Pattern: <tr><td>Name</td><td>slots</td><td>ability</td><td>mod</td><td>source</td></tr>
    const rowMatch = line.match(/<tr[^>]*>(.+?)<\/tr>/i);
    if (!rowMatch) continue;

    const cells = [...rowMatch[1].matchAll(/<td[^>]*>(.*?)<\/td>/gi)]
      .map(c => c[1].replace(/<[^>]+>/g,'').replace(/\[\d+\]/g,'').trim());
    if (cells.length < 4) continue;
    const name = cells[0];
    if (!name || name.length < 2 || name.toLowerCase() === 'proficiency') continue;

    const slots    = parseInt(cells[1]) || 1;
    const ability  = cells[2]?.split('/')[0]?.trim() || null;
    const modifier = parseInt((cells[3]||'').replace(/[^0-9+\-]/g,'')) || 0;
    const source   = cells[4]?.trim() || null;
    const cid      = toId(name);
    const stat1    = vs(abilityToStat(ability));

    try {
      const ex = await db.query(
        'SELECT id FROM nonweapon_proficiencies WHERE canonical_id = $1', [cid]
      );
      if (ex.rows.length > 0) {
        // Update group and source info on existing entries
        await db.query(`
          UPDATE nonweapon_proficiencies SET
            check_ability  = COALESCE(check_ability, $2),
            check_modifier = CASE WHEN check_modifier = 0 THEN $3 ELSE check_modifier END,
            source_book    = COALESCE(source_book, $4),
            prof_group     = CASE WHEN prof_group = 'general' THEN $5 ELSE prof_group END,
            updated_at     = NOW()
          WHERE canonical_id = $1
        `, [cid, ability, modifier, source, currentGroup]);
        updCount++;
        continue;
      }

      const res = await db.query(`
        INSERT INTO nonweapon_proficiencies
          (canonical_id, name, prof_group, slots_required, check_ability,
           check_modifier, source_book, is_sp_native, sp_stat_1, conversion_note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,'Wiki-import - sp_cp_cost kræver review')
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id
      `, [cid, name, currentGroup, slots, ability, modifier, source, stat1]);

      if (res.rows.length > 0) {
        await db.query(
          'INSERT INTO proficiency_aliases(prof_id,alias) VALUES($1,$2) ON CONFLICT DO NOTHING',
          [res.rows[0].id, name]
        );
        newCount++;
      }
    } catch(e) {
      console.error('  ERR ' + name + ':', e.message);
    }
  }

  console.log('  Nye NWPs: ' + newCount + ', Opdateret: ' + updCount);

  const total = await db.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies');
  const needsReview = await db.query(
    'SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies WHERE sp_cp_cost IS NULL'
  );
  console.log('  Total NWPs: ' + total.rows[0].n);
  console.log('  Mangler sp_cp_cost: ' + needsReview.rows[0].n);
}

async function main() {
  console.log('=== seed-proficiencies.mjs ===');
  try {
    await fixClassAccess();
    await importWikiProfs();
    console.log('✓ Færdig');
  } finally {
    await db.pool.end();
  }
}
main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
