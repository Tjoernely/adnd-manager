/**
 * import-proficiencies.mjs  (v2 — fixed dotenv path + dynamic import)
 * Kør: node server/scripts/import-proficiencies.mjs
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const VALID_STATS = new Set(['muscle','stamina','aim','balance','fitness','health',
  'reason','knowledge','intuition','willpower','leadership','appearance']);
function validStat(s) { return (s && VALID_STATS.has(s)) ? s : null; }
function toId(name) {
  return name.toLowerCase().replace(/[(),\/]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function abilityToStat(a) {
  return ({strength:'muscle',str:'muscle',dexterity:'aim',dex:'aim',
    constitution:'fitness',con:'fitness',intelligence:'knowledge',int:'knowledge',
    wisdom:'intuition',wis:'intuition',charisma:'leadership',cha:'leadership'})[a?.toLowerCase()]??null;
}

async function seedFromSource() {
  console.log('[profs] Trin 1: seed fra proficiencies.js …');
  // Dynamic import of the source data
  const profsPath = path.join(__dirname, '../../src/data/proficiencies.js');
  const { PROFICIENCY_GROUPS } = await import(profsPath);

  const groupTagMap = { general:'general', priest:'priest', rogue:'rogue', warrior:'warrior', wizard:'wizard' };
  let ins=0, skip=0;

  for (const grp of PROFICIENCY_GROUPS) {
    const profGroup = groupTagMap[grp.groupTag] ?? grp.groupTag;
    for (const p of (grp.profs || [])) {
      const cid = toId(p.name);
      const stat1 = validStat(p.stats?.[0] ?? null);
      const stat2 = validStat(p.stats?.[1] ?? null);
      try {
        const res = await pool.query(`
          INSERT INTO nonweapon_proficiencies
            (canonical_id,name,prof_group,sp_cp_cost,sp_rank,sp_stat_1,sp_stat_2,
             is_sp_native,description,source_book)
          VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9)
          ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
          [cid,p.name,profGroup,p.cp??null,p.rank??null,stat1,stat2,
           p.desc??null,"Player's Option: Skills & Powers"]);
        if (res.rows.length) {
          await pool.query('INSERT INTO proficiency_aliases(prof_id,alias) VALUES($1,$2) ON CONFLICT DO NOTHING',
            [res.rows[0].id, p.id]);
          ins++;
        } else skip++;
      } catch(e) { console.error('  ERR '+p.name+': '+e.message); }
    }
  }
  console.log('  Inserted: '+ins+', skipped: '+skip);
}

async function scrapeWiki() {
  console.log('[profs] Trin 2: scrape wiki …');
  let html;
  try { html = await fetch('https://adnd2e.fandom.com/wiki/Nonweapon_Proficiencies').then(r=>r.text()); }
  catch(e) { console.error('  Wiki fetch failed: '+e.message); return; }

  const sectionMap = {General:'general',Priest:'priest',Rogue:'rogue',
    Warrior:'warrior',Wizard:'wizard',Psionicist:'psionicist',Chronomancer:'chronomancer',Avariel:'avariel'};
  let currentGroup = 'general';
  let newCount = 0;

  for (const line of html.split('\n')) {
    const sec = line.match(/id="(General|Priest|Rogue|Warrior|Wizard|Psionicist|Chronomancer|Avariel)"/);
    if (sec) { currentGroup = sectionMap[sec[1]]; continue; }
    const cells = [...line.matchAll(/<td[^>]*>(.*?)<\/td>/gi)].map(c=>c[1].replace(/<[^>]+>/g,'').trim());
    if (cells.length < 4) continue;
    const name = cells[0].replace(/\[\d+\]/g,'').trim();
    if (!name || name.length < 2 || name === 'Proficiency') continue;
    const slots    = parseInt(cells[1])||1;
    const ability  = cells[2]?.split('/')[0]?.trim()||null;
    const modifier = parseInt((cells[3]||'0').replace(/[^0-9+\-]/g,''))||0;
    const source   = cells[4]?.trim()||null;
    const cid = toId(name);

    const ex = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
    if (ex.rows.length) {
      await pool.query(`UPDATE nonweapon_proficiencies SET
        check_ability=COALESCE(check_ability,$2),
        check_modifier=CASE WHEN check_modifier=0 THEN $3 ELSE check_modifier END,
        source_book=COALESCE(source_book,$4),
        prof_group=CASE WHEN prof_group='general' THEN $5 ELSE prof_group END,
        updated_at=NOW() WHERE canonical_id=$1`,
        [cid,ability,modifier,source,currentGroup]);
      continue;
    }
    try {
      const res = await pool.query(`
        INSERT INTO nonweapon_proficiencies
          (canonical_id,name,prof_group,slots_required,check_ability,check_modifier,
           source_book,is_sp_native,sp_stat_1,conversion_note)
        VALUES ($1,$2,$3,$4,$5,$6,$7,false,$8,'Wiki-import — sp_cp_cost kræver review')
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [cid,name,currentGroup,slots,ability,modifier,source,abilityToStat(ability)]);
      if (res.rows.length) {
        await pool.query('INSERT INTO proficiency_aliases(prof_id,alias) VALUES($1,$2) ON CONFLICT DO NOTHING',[res.rows[0].id,name]);
        newCount++;
      }
    } catch(e) { console.error('  ERR '+name+': '+e.message); }
  }
  console.log('  Nye fra wiki: '+newCount);
  const nr = await pool.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies WHERE sp_cp_cost IS NULL');
  console.log('  Mangler sp_cp_cost: '+nr.rows[0].n);
}

async function seedClassAccess() {
  console.log('[profs] Trin 3: class-access …');
  await pool.query(`INSERT INTO proficiency_class_access(prof_id,class_group)
    SELECT id,'any' FROM nonweapon_proficiencies WHERE prof_group='general' ON CONFLICT DO NOTHING`);
  for (const g of ['priest','rogue','warrior','wizard','psionicist','chronomancer']) {
    await pool.query(`INSERT INTO proficiency_class_access(prof_id,class_group)
      SELECT id,$1 FROM nonweapon_proficiencies WHERE prof_group=$1 ON CONFLICT DO NOTHING`,[g]);
  }
  const t = await pool.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies');
  console.log('✓ Færdig. '+t.rows[0].n+' NWPs i DB.');
}

async function main() {
  console.log('=== import-proficiencies.mjs v2 ===');
  try {
    await seedFromSource();
    await scrapeWiki();
    await seedClassAccess();
  } finally { await pool.end(); }
}
main().catch(e => { console.error('Fatal:',e.message); process.exit(1); });
