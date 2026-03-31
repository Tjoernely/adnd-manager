/**
 * import-kits.mjs
 * Seed 102 kits fra src/data/kits.js + kit->proficiency links
 * Forudsætning: import-proficiencies.mjs er kørt først
 * Kør: node server/scripts/import-kits.mjs
 */
import 'dotenv/config';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toCanonicalId(name) {
  return name.toLowerCase().replace(/[(),\/]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

const PREFIX_CLASS = { fig:'fighter',ran:'ranger',pal:'paladin',mag:'wizard',
  cle:'cleric',dru:'druid',thi:'thief',bar:'bard',uni:null };

async function resolveProfId(raw) {
  const clean = raw.replace(/\s*\*\s*$/,'').trim();
  const cid = toCanonicalId(clean);
  let r = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
  if (r.rows.length) return r.rows[0].id;
  r = await pool.query('SELECT prof_id FROM proficiency_aliases WHERE LOWER(alias)=LOWER($1)',[clean]);
  if (r.rows.length) return r.rows[0].prof_id;
  r = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE LOWER(name) ILIKE $1 LIMIT 1',['%'+clean.toLowerCase()+'%']);
  if (r.rows.length) return r.rows[0].id;
  return null;
}

async function parseBundleKits() {
  const src = fs.readFileSync(path.join(__dirname,'../../src/data/kits.js'),'utf8');
  const kits = [];
  const re = /\{id:"([a-z]{2,4}_[a-z0-9-]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const startPos = m.index;
    let depth=0, endPos=startPos;
    for (let i=startPos;i<src.length;i++) {
      if (src[i]==='{') depth++;
      if (src[i]==='}') { depth--; if(depth===0){endPos=i;break;} }
    }
    const ks = src.slice(startPos,endPos+1);
    const get = f => ks.match(new RegExp(f+':"((?:[^"\\\\]|\\\\.)*)"'))?.[1]??null;
    const getArr = f => { const raw=ks.match(new RegExp(f+':\\[([^\\]]*)\\]'))?.[1]??''; return raw.match(/"([^"]+)"/g)?.map(s=>s.slice(1,-1))??[]; };
    const prefix = m[1].split('_')[0];
    kits.push({
      canonical_id: m[1], name: get('name'), kit_class: PREFIX_CLASS[prefix]??null,
      is_universal: prefix==='uni', is_racial: false,
      description: get('desc'), benefits_text: get('benefits'),
      hindrances_text: get('hindrances'), requirements_text: get('requirements'),
      wealth_text: get('wealth'), source_book: get('source'),
      nwpRequired: getArr('nwpRequired'), nwpRecommended: getArr('nwpRecommended'),
      wpRequired: getArr('wpRequired'), wpRecommended: getArr('wpRecommended'),
    });
  }
  return kits;
}

async function seedKits(kits) {
  console.log('[import-kits] Indsætter '+kits.length+' kits …');
  let ins=0,skip=0;
  for (const k of kits) {
    if (!k.name) continue;
    try {
      const r = await pool.query(`INSERT INTO kits
        (canonical_id,name,kit_class,is_universal,is_racial,description,benefits_text,
         hindrances_text,requirements_text,wealth_text,source_book)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [k.canonical_id,k.name,k.kit_class,k.is_universal,k.is_racial,
         k.description,k.benefits_text,k.hindrances_text,k.requirements_text,k.wealth_text,k.source_book]);
      r.rows.length ? ins++ : skip++;
    } catch(e) { console.error('  ERR '+k.name+': '+e.message); }
  }
  console.log('  Inserted: '+ins+', skipped: '+skip);
}

async function seedLinks(kits) {
  console.log('[import-kits] Opretter prof-links …');
  let linked=0,unres=0;
  for (const k of kits) {
    const kr = await pool.query('SELECT id FROM kits WHERE canonical_id=$1',[k.canonical_id]);
    if (!kr.rows.length) continue;
    const kitId = kr.rows[0].id;
    for (const [arr,rel] of [[k.nwpRequired,'required'],[k.nwpRecommended,'recommended']]) {
      for (const pn of arr) {
        const pid = await resolveProfId(pn);
        try { await pool.query(`INSERT INTO kit_proficiency_links (kit_id,prof_id,prof_name_raw,relation_type)
          VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[kitId,pid,pn,rel]); }
        catch(_) {}
        pid ? linked++ : unres++;
      }
    }
    for (const [arr,rel] of [[k.wpRequired,'required'],[k.wpRecommended,'recommended']]) {
      for (const wn of arr) {
        try { await pool.query('INSERT INTO kit_weapon_links (kit_id,weapon_name_raw,relation_type) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[kitId,wn,rel]); }
        catch(_) {}
      }
    }
  }
  console.log('  Prof links: '+linked+' løst, '+unres+' uløst');
}

async function main() {
  console.log('=== import-kits.mjs ===');
  try {
    const kits = await parseBundleKits();
    console.log('  Parsede '+kits.length+' kits');
    await seedKits(kits);
    await seedLinks(kits);
    const t = await pool.query('SELECT COUNT(*)::int AS n FROM kits');
    const l = await pool.query('SELECT COUNT(*)::int AS n FROM kit_proficiency_links');
    console.log('✓ Færdig. '+t.rows[0].n+' kits, '+l.rows[0].n+' prof-links.');
  } finally { await pool.end(); }
}
main().catch(e => { console.error('Fatal:',e); process.exit(1); });
