/**
 * import-proficiencies.mjs
 * Trin 1: Seed 100 NWPs fra src/data/proficiencies.js (S&P-format, allerede klar)
 * Trin 2: Scrape wiki og tilføj manglende NWPs
 * Trin 3: Seed class-access records
 * Kør: node server/scripts/import-proficiencies.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toCanonicalId(name) {
  return name.toLowerCase().replace(/[(),\/]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

function abilityToStat(ability) {
  const map = { strength:'muscle',str:'muscle',dexterity:'aim',dex:'aim',
    constitution:'fitness',con:'fitness',intelligence:'knowledge',int:'knowledge',
    wisdom:'intuition',wis:'intuition',charisma:'leadership',cha:'leadership' };
  return map[ability?.toLowerCase()] ?? null;
}

const VALID_STATS = new Set(['muscle','stamina','aim','balance','fitness','health',
  'reason','knowledge','intuition','willpower','leadership','appearance']);

function validStat(s) { return VALID_STATS.has(s) ? s : null; }

async function seedFromBundle() {
  console.log('[import-proficiencies] Trin 1: seed fra proficiencies.js …');
  const profsPath = path.join(__dirname, '../../src/data/proficiencies.js');
  const src = fs.readFileSync(profsPath, 'utf8');
  const re = /\{id:"(n[grwpq]\d+)",name:"([^"]+)",cp:(\d+),rank:(\d+),stats:\[([^\]]*)\](?:,desc:"([^"]*)")?\}/g;
  const groupMap = { ng:'general', np:'priest', nr:'rogue', nw:'warrior', nq:'wizard' };
  let m, inserted=0, skipped=0;
  while ((m = re.exec(src)) !== null) {
    const [,bid,name,cp,rank,statsRaw,desc] = m;
    const stats = statsRaw.match(/"([^"]+)"/g)?.map(s=>s.replace(/"/g,'')) ?? [];
    const group = groupMap[bid.slice(0,2)] ?? 'general';
    const cid = toCanonicalId(name);
    try {
      const res = await pool.query(`INSERT INTO nonweapon_proficiencies
        (canonical_id,name,prof_group,sp_cp_cost,sp_rank,sp_stat_1,sp_stat_2,is_sp_native,description,source_book)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9) ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [cid,name,group,+cp,+rank,validStat(stats[0]??null),validStat(stats[1]??null),desc??null,"Player's Option: Skills & Powers"]);
      if (res.rows.length) {
        await pool.query('INSERT INTO proficiency_aliases (prof_id,alias) VALUES ($1,$2) ON CONFLICT DO NOTHING',
          [res.rows[0].id, bid]);
        inserted++;
      } else skipped++;
    } catch(e) { console.error('  ERR '+name+': '+e.message); }
  }
  console.log('  Inserted: '+inserted+', skipped: '+skipped);
}

async function scrapeWiki() {
  console.log('[import-proficiencies] Trin 2: scrape wiki …');
  let html;
  try { const r = await fetch('https://adnd2e.fandom.com/wiki/Nonweapon_Proficiencies'); html = await r.text(); }
  catch(e) { console.error('  Wiki fetch failed: '+e.message); return; }

  let currentGroup = 'general';
  const sectionMap = { General:'general',Priest:'priest',Rogue:'rogue',
    Warrior:'warrior',Wizard:'wizard',Psionicist:'psionicist',Chronomancer:'chronomancer',Avariel:'avariel' };

  // Parse sections and rows together
  const lines = html.split('\n');
  let newCount = 0;
  for (const line of lines) {
    // Detect section headers
    const secMatch = line.match(/id="(General|Priest|Rogue|Warrior|Wizard|Psionicist|Chronomancer|Avariel)"/);
    if (secMatch) { currentGroup = sectionMap[secMatch[1]] ?? 'general'; continue; }
    // Parse table rows
    const cells = [...line.matchAll(/<td[^>]*>(.*?)<\/td>/gi)].map(c=>c[1].replace(/<[^>]+>/g,'').trim());
    if (cells.length < 4) continue;
    const name = cells[0].replace(/\[\d+\]/g,'').trim();
    if (!name || name==='Proficiency' || name.length < 2) continue;
    const slots = parseInt(cells[1])||1;
    const ability = cells[2]?.split('/')[0]?.trim()||null;
    const modifier = parseInt(cells[3]?.replace(/[^0-9+\-]/g,''))||0;
    const source = cells[4]?.trim()||null;
    const cid = toCanonicalId(name);
    const stat1 = abilityToStat(ability);
    const existing = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
    if (existing.rows.length) {
      await pool.query(`UPDATE nonweapon_proficiencies SET
        check_ability=COALESCE(check_ability,$2), check_modifier=CASE WHEN check_modifier=0 THEN $3 ELSE check_modifier END,
        source_book=COALESCE(source_book,$4), prof_group=CASE WHEN prof_group='general' THEN $5 ELSE prof_group END,
        updated_at=NOW() WHERE canonical_id=$1`,
        [cid,ability,modifier,source,currentGroup]);
      continue;
    }
    try {
      const res = await pool.query(`INSERT INTO nonweapon_proficiencies
        (canonical_id,name,prof_group,slots_required,check_ability,check_modifier,source_book,is_sp_native,sp_stat_1,conversion_note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,'Konverteret fra wiki — sp_cp_cost kræver review')
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [cid,name,currentGroup,slots,ability,modifier,source,stat1]);
      if (res.rows.length) {
        await pool.query('INSERT INTO proficiency_aliases (prof_id,alias) VALUES ($1,$2) ON CONFLICT DO NOTHING',[res.rows[0].id,name]);
        newCount++;
      }
    } catch(e) { console.error('  ERR '+name+': '+e.message); }
  }
  console.log('  Nye fra wiki: '+newCount);

  const needsReview = await pool.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies WHERE sp_cp_cost IS NULL');
  console.log('  Mangler sp_cp_cost: '+needsReview.rows[0].n+' (kræver manuel review)');
}

async function seedClassAccess() {
  console.log('[import-proficiencies] Trin 3: class-access …');
  await pool.query(`INSERT INTO proficiency_class_access (prof_id,class_group)
    SELECT id,'any' FROM nonweapon_proficiencies WHERE prof_group='general' ON CONFLICT DO NOTHING`);
  for (const g of ['priest','rogue','warrior','wizard','psionicist','chronomancer']) {
    await pool.query(`INSERT INTO proficiency_class_access (prof_id,class_group)
      SELECT id,$1 FROM nonweapon_proficiencies WHERE prof_group=$1 ON CONFLICT DO NOTHING`,[g]);
  }
  console.log('  Done');
}

async function main() {
  console.log('=== import-proficiencies.mjs ===');
  try {
    await seedFromBundle();
    await scrapeWiki();
    await seedClassAccess();
    const t = await pool.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies');
    console.log('✓ Færdig. '+t.rows[0].n+' NWPs i DB.');
  } finally { await pool.end(); }
}
main().catch(e => { console.error('Fatal:',e); process.exit(1); });
