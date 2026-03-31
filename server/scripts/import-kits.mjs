#!/usr/bin/env node
/**
 * import-kits.mjs  (v3)
 * Bruger db.js via createRequire — samme mønster som import-spells.js
 * Forudsætning: import-proficiencies.mjs er kørt først
 * Kør fra: /var/www/adnd-manager/server/
 *   node scripts/import-kits.mjs
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// db.js håndterer selv dotenv
const db = require('../db');

function toId(name) {
  return name.toLowerCase().replace(/[(),\/]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

async function resolveProfId(raw) {
  const clean = raw.replace(/\s*\*\s*$/,'').trim();
  const cid   = toId(clean);
  let r = await db.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
  if (r.rows.length) return r.rows[0].id;
  r = await db.query('SELECT prof_id FROM proficiency_aliases WHERE LOWER(alias)=LOWER($1)',[clean]);
  if (r.rows.length) return r.rows[0].prof_id;
  r = await db.query('SELECT id FROM nonweapon_proficiencies WHERE LOWER(name) ILIKE $1 LIMIT 1',['%'+clean.toLowerCase()+'%']);
  if (r.rows.length) return r.rows[0].id;
  return null;
}

async function seedKits() {
  console.log('[kits] Indlaser kits fra source …');
  const kitsPath = path.join(__dirname, '../../src/data/kits.js');
  const { SP_KITS, CLASS_KITS } = await import(kitsPath);

  const allKits = [];
  for (const k of (SP_KITS || [])) {
    allKits.push({ ...k, kit_class: null, is_universal: true, is_racial: false });
  }
  const classMap = { fighter:'fighter',ranger:'ranger',paladin:'paladin',
    wizard:'wizard',mage:'wizard',illusionist:'wizard',
    cleric:'cleric',druid:'druid',thief:'thief',bard:'bard' };
  for (const [cls, arr] of Object.entries(CLASS_KITS || {})) {
    for (const k of (arr || [])) {
      allKits.push({ ...k, kit_class: classMap[cls]??cls, is_universal: false, is_racial: false });
    }
  }
  console.log('[kits] Fandt '+allKits.length+' kits');

  let ins=0, skip=0;
  for (const k of allKits) {
    if (!k.id || !k.name) continue;
    try {
      const res = await db.query(`
        INSERT INTO kits
          (canonical_id,name,kit_class,is_universal,is_racial,
           description,benefits_text,hindrances_text,requirements_text,wealth_text,source_book)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [k.id,k.name,k.kit_class,k.is_universal,k.is_racial,
         k.desc??null,k.benefits??null,k.hindrances??null,
         k.reqText??null,k.wealth??null,k.source??null]);
      res.rows.length ? ins++ : skip++;
    } catch(e) { console.error('  ERR '+k.name+': '+e.message); }
  }
  console.log('  Inserted: '+ins+', skipped: '+skip);
  return allKits;
}

async function seedLinks(allKits) {
  console.log('[kits] Opretter prof-links …');
  let linked=0, unres=0;
  for (const k of allKits) {
    if (!k.id) continue;
    const kr = await db.query('SELECT id FROM kits WHERE canonical_id=$1',[k.id]);
    if (!kr.rows.length) continue;
    const kitId = kr.rows[0].id;
    const nwpReq  = Array.isArray(k.nwpRequired)    ? k.nwpRequired    : [];
    const nwpRec  = Array.isArray(k.nwpRecommended)  ? k.nwpRecommended : [];
    const wpReq   = Array.isArray(k.wpRequired)      ? k.wpRequired     : [];
    const wpRec   = Array.isArray(k.wpRecommended)   ? k.wpRecommended  : [];
    for (const [arr,rel] of [[nwpReq,'required'],[nwpRec,'recommended']]) {
      for (const pn of arr) {
        const pid = await resolveProfId(String(pn));
        try { await db.query(`INSERT INTO kit_proficiency_links(kit_id,prof_id,prof_name_raw,relation_type)
          VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[kitId,pid,String(pn),rel]); }
        catch(_){}
        pid ? linked++ : unres++;
      }
    }
    for (const [arr,rel] of [[wpReq,'required'],[wpRec,'recommended']]) {
      for (const wn of arr) {
        try { await db.query('INSERT INTO kit_weapon_links(kit_id,weapon_name_raw,relation_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[kitId,String(wn),rel]); }
        catch(_){}
      }
    }
  }
  console.log('  Prof links: '+linked+' løst, '+unres+' uløst');
}

async function main() {
  console.log('=== import-kits.mjs v3 ===');
  try {
    const allKits = await seedKits();
    await seedLinks(allKits);
    const t = await db.query('SELECT COUNT(*)::int AS n FROM kits');
    const l = await db.query('SELECT COUNT(*)::int AS n FROM kit_proficiency_links');
    console.log('\u2713 Faerdig. '+t.rows[0].n+' kits, '+l.rows[0].n+' prof-links.');
  } finally {
    await db.pool.end();
  }
}
main().catch(e => { console.error('Fatal:',e.message); process.exit(1); });
