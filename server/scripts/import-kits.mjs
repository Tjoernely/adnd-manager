/**
 * import-kits.mjs  (v2 — fixed dotenv path + dynamic import)
 * Kør: node server/scripts/import-kits.mjs
 * Forudsætning: import-proficiencies.mjs er kørt først
 */
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

function toId(name) {
  return name.toLowerCase().replace(/[(),\/]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}

async function resolveProfId(raw) {
  const clean = raw.replace(/\s*\*\s*$/,'').trim();
  const cid   = toId(clean);
  let r = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE canonical_id=$1',[cid]);
  if (r.rows.length) return r.rows[0].id;
  r = await pool.query('SELECT prof_id FROM proficiency_aliases WHERE LOWER(alias)=LOWER($1)',[clean]);
  if (r.rows.length) return r.rows[0].prof_id;
  r = await pool.query('SELECT id FROM nonweapon_proficiencies WHERE LOWER(name) ILIKE $1 LIMIT 1',['%'+clean.toLowerCase()+'%']);
  if (r.rows.length) return r.rows[0].id;
  return null;
}

async function seedKits() {
  console.log('[kits] Indlæser kits fra source …');
  const kitsPath = path.join(__dirname, '../../src/data/kits.js');
  const { SP_KITS, CLASS_KITS } = await import(kitsPath);

  // Flatten: SP_KITS (universal) + CLASS_KITS (class-specific)
  const allKits = [];

  // SP_KITS — universal S&P kits
  for (const k of (SP_KITS || [])) {
    allKits.push({ ...k, kit_class: null, is_universal: true, is_racial: false });
  }

  // CLASS_KITS — { fighter: [...], ranger: [...], ... }
  const classMap = { fighter:'fighter', ranger:'ranger', paladin:'paladin',
    wizard:'wizard', mage:'wizard', illusionist:'wizard',
    cleric:'cleric', druid:'druid', thief:'thief', bard:'bard' };
  for (const [cls, kitsArr] of Object.entries(CLASS_KITS || {})) {
    for (const k of (kitsArr || [])) {
      allKits.push({ ...k, kit_class: classMap[cls]??cls, is_universal: false, is_racial: false });
    }
  }

  console.log('[kits] Fandt '+allKits.length+' kits i alt');

  let ins=0, skip=0;
  for (const k of allKits) {
    if (!k.id || !k.name) continue;
    try {
      const res = await pool.query(`
        INSERT INTO kits
          (canonical_id,name,kit_class,is_universal,is_racial,
           description,benefits_text,hindrances_text,requirements_text,wealth_text,source_book)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (canonical_id) DO NOTHING RETURNING id`,
        [k.id, k.name, k.kit_class, k.is_universal, k.is_racial,
         k.desc??null, k.benefits??null, k.hindrances??null,
         k.reqText??null, k.wealth??null, k.source??null]);
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
    const kr = await pool.query('SELECT id FROM kits WHERE canonical_id=$1',[k.id]);
    if (!kr.rows.length) continue;
    const kitId = kr.rows[0].id;

    const nwpRequired   = Array.isArray(k.nwpRequired)   ? k.nwpRequired   : [];
    const nwpRecommended= Array.isArray(k.nwpRecommended) ? k.nwpRecommended: [];
    const wpRequired    = Array.isArray(k.wpRequired)     ? k.wpRequired    : [];
    const wpRecommended = Array.isArray(k.wpRecommended)  ? k.wpRecommended : [];

    for (const [arr, rel] of [[nwpRequired,'required'],[nwpRecommended,'recommended']]) {
      for (const pn of arr) {
        const pid = await resolveProfId(String(pn));
        try {
          await pool.query(`INSERT INTO kit_proficiency_links(kit_id,prof_id,prof_name_raw,relation_type)
            VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING`,[kitId,pid,String(pn),rel]);
        } catch(_) {}
        pid ? linked++ : unres++;
      }
    }
    for (const [arr, rel] of [[wpRequired,'required'],[wpRecommended,'recommended']]) {
      for (const wn of arr) {
        try {
          await pool.query('INSERT INTO kit_weapon_links(kit_id,weapon_name_raw,relation_type) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
            [kitId,String(wn),rel]);
        } catch(_) {}
      }
    }
  }
  console.log('  Prof links: '+linked+' løst, '+unres+' uløst');
}

async function main() {
  console.log('=== import-kits.mjs v2 ===');
  try {
    const allKits = await seedKits();
    await seedLinks(allKits);
    const t = await pool.query('SELECT COUNT(*)::int AS n FROM kits');
    const l = await pool.query('SELECT COUNT(*)::int AS n FROM kit_proficiency_links');
    console.log('✓ Færdig. '+t.rows[0].n+' kits, '+l.rows[0].n+' prof-links.');
  } finally { await pool.end(); }
}
main().catch(e => { console.error('Fatal:',e.message); process.exit(1); });
