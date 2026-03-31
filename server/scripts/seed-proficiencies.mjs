#!/usr/bin/env node
/**
 * seed-proficiencies.mjs  v5
 * Trin 1: Fix class-access (allerede klar - idempotent)
 * Trin 2: Import 375 NWPs fra wiki-nwp-data.json
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import { readFileSync } from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

function toId(name) {
  return name.toLowerCase()
    .replace(/[(),\\/:]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function abilityToStat(a) {
  const m = { strength:'muscle',str:'muscle',dexterity:'aim',dex:'aim',
    constitution:'fitness',con:'fitness',intelligence:'knowledge',
    int:'knowledge',intellect:'knowledge',wisdom:'intuition',wis:'intuition',
    charisma:'leadership',cha:'leadership' };
  return m[(a||'').toLowerCase().split(' ')[0]] ?? null;
}
const VALID = new Set(['muscle','stamina','aim','balance','fitness','health',
  'reason','knowledge','intuition','willpower','leadership','appearance']);
function vs(s) { return VALID.has(s) ? s : null; }

async function fixClassAccess() {
  console.log('Trin 1: class-access...');
  const genProfs = await db.query("SELECT id FROM nonweapon_proficiencies WHERE prof_group='general'");
  let ins=0;
  for (const row of genProfs.rows) {
    try { await db.query('INSERT INTO proficiency_class_access(prof_id,class_group) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.id,'any']); ins++; } catch(_){}
  }
  for (const g of ['priest','rogue','warrior','wizard','psionicist','chronomancer']) {
    const rows = await db.query('SELECT id FROM nonweapon_proficiencies WHERE prof_group=$1',[g]);
    for (const row of rows.rows) {
      try { await db.query('INSERT INTO proficiency_class_access(prof_id,class_group) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.id,g]); } catch(_){}
    }
  }
  const t = await db.query('SELECT COUNT(*)::int AS n FROM proficiency_class_access');
  console.log('  Total class-access rows: '+t.rows[0].n);
}

async function importWikiProfs() {
  console.log('Trin 2: Import wiki NWPs...');
  const dataPath = path.join(__dirname, 'wiki-nwp-data.json');
  const wikiProfs = JSON.parse(readFileSync(dataPath, 'utf8'));
  console.log('  Loaded '+wikiProfs.length+' profs from file');

  let newCount=0, updCount=0;
  for (const p of wikiProfs) {
    const cid   = toId(p.name);
    const stat1 = vs(abilityToStat(p.ability));
    try {
      const ex = await db.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
      if (ex.rows.length > 0) {
        await db.query(`UPDATE nonweapon_proficiencies SET
          check_ability=COALESCE(check_ability,$2),
          check_modifier=CASE WHEN check_modifier=0 THEN $3 ELSE check_modifier END,
          source_book=COALESCE(source_book,$4),
          prof_group=CASE WHEN prof_group='general' THEN $5 ELSE prof_group END,
          updated_at=NOW() WHERE canonical_id=$1`,
          [cid,p.ability,p.modifier,p.source,p.group]);
        updCount++;
        continue;
      }
      const res = await db.query(`
        INSERT INTO nonweapon_proficiencies
          (canonical_id,name,prof_group,slots_required,check_ability,
           check_modifier,source_book,is_sp_native,sp_stat_1,conversion_note)
        VALUES($1,$2,$3,$4,$5,$6,$7,false,$8,'Wiki-import — sp_cp_cost kræver review')
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [cid,p.name,p.group,p.slots,p.ability,p.modifier,p.source,stat1]);
      if (res.rows.length > 0) {
        await db.query('INSERT INTO proficiency_aliases(prof_id,alias) VALUES($1,$2) ON CONFLICT DO NOTHING',[res.rows[0].id,p.name]);
        newCount++;
      }
    } catch(e) { console.error('  ERR '+p.name+':',e.message); }
  }

  console.log('  Nye: '+newCount+', Opdateret: '+updCount);
  const t = await db.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies');
  const nr = await db.query('SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies WHERE sp_cp_cost IS NULL');
  console.log('  Total NWPs: '+t.rows[0].n);
  console.log('  Mangler sp_cp_cost: '+nr.rows[0].n+' (kræver manuel review)');

  // Also seed class-access for new groups
  for (const g of ['psionicist','chronomancer','avariel','other']) {
    const rows = await db.query('SELECT id FROM nonweapon_proficiencies WHERE prof_group=$1',[g]);
    for (const row of rows.rows) {
      try { await db.query('INSERT INTO proficiency_class_access(prof_id,class_group) VALUES($1,$2) ON CONFLICT DO NOTHING',[row.id,g]); } catch(_){}
    }
  }
}

async function main() {
  console.log('=== seed-proficiencies.mjs v5 ===');
  try {
    await fixClassAccess();
    await importWikiProfs();
    console.log('Faerdig');
  } finally { await db.pool.end(); }
}
main().catch(e => { console.error('Fatal:',e.message); process.exit(1); });
