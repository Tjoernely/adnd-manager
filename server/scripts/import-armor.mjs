/**
 * Import armor & shields catalog from AD&D 2E S&P data.
 * Usage:
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \
 *   DB_USER=adnduser DB_PASSWORD=... \
 *   node server/scripts/import-armor.mjs [--dry-run]
 */
import pg from 'pg';

const dryRun = process.argv.includes('--dry-run');

const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD || '',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

const ARMOR = [
  {name:"No Armor/Clothes",item_type:"armor",armor_class_type:"Ultra Light",weight_modifier:-1,ac_bonus:0,dr_slashing:0,dr_piercing:0,dr_bludgeoning:0},
  {name:"Padded",item_type:"armor",armor_class_type:"Light",weight_modifier:0,ac_bonus:-3,dr_slashing:3,dr_piercing:3,dr_bludgeoning:4},
  {name:"Leather",item_type:"armor",armor_class_type:"Light",weight_modifier:0,ac_bonus:-3,dr_slashing:4,dr_piercing:3,dr_bludgeoning:3},
  {name:"Studded Leather",item_type:"armor",armor_class_type:"Light",weight_modifier:1,ac_bonus:-4,dr_slashing:5,dr_piercing:4,dr_bludgeoning:4},
  {name:"Ring Mail",item_type:"armor",armor_class_type:"Medium",weight_modifier:2,ac_bonus:-4,dr_slashing:6,dr_piercing:5,dr_bludgeoning:5},
  {name:"Hide Armor",item_type:"armor",armor_class_type:"Medium",weight_modifier:1,ac_bonus:-5,dr_slashing:6,dr_piercing:4,dr_bludgeoning:5},
  {name:"Scale Mail",item_type:"armor",armor_class_type:"Medium",weight_modifier:2,ac_bonus:-5,dr_slashing:6,dr_piercing:5,dr_bludgeoning:5},
  {name:"Chain Mail",item_type:"armor",armor_class_type:"Medium",weight_modifier:2,ac_bonus:-6,dr_slashing:6,dr_piercing:5,dr_bludgeoning:5},
  {name:"Brigandine",item_type:"armor",armor_class_type:"Medium",weight_modifier:2,ac_bonus:-6,dr_slashing:6,dr_piercing:5,dr_bludgeoning:5},
  {name:"Splint Mail",item_type:"armor",armor_class_type:"Heavy",weight_modifier:3,ac_bonus:-7,dr_slashing:7,dr_piercing:6,dr_bludgeoning:6},
  {name:"Banded Mail",item_type:"armor",armor_class_type:"Heavy",weight_modifier:4,ac_bonus:-7,dr_slashing:7,dr_piercing:5,dr_bludgeoning:8},
  {name:"Plate Mail",item_type:"armor",armor_class_type:"Heavy",weight_modifier:4,ac_bonus:-8,dr_slashing:8,dr_piercing:8,dr_bludgeoning:5},
  {name:"Field Plate",item_type:"armor",armor_class_type:"Very Heavy",weight_modifier:5,ac_bonus:-12,dr_slashing:8,dr_piercing:8,dr_bludgeoning:5},
  {name:"Full Plate",item_type:"armor",armor_class_type:"Very Heavy",weight_modifier:6,ac_bonus:-14,dr_slashing:8,dr_piercing:8,dr_bludgeoning:5},
];

const SHIELDS = [
  {name:"Buckler",item_type:"shield",armor_class_type:"Small",weight_modifier:0,ac_bonus:-1,dr_slashing:12,dr_piercing:16,dr_bludgeoning:8},
  {name:"Shield, Medium",item_type:"shield",armor_class_type:"Medium",weight_modifier:0,ac_bonus:-2,dr_slashing:12,dr_piercing:16,dr_bludgeoning:10},
  {name:"Tower Shield",item_type:"shield",armor_class_type:"Large",weight_modifier:0,ac_bonus:-3,dr_slashing:14,dr_piercing:16,dr_bludgeoning:12},
];

const ALL = [...ARMOR, ...SHIELDS];

async function main() {
  const client = await pool.connect();
  try {
    if (dryRun) {
      console.log('[DRY-RUN] Would insert', ALL.length, 'armor/shield entries');
      ALL.forEach(a => console.log(' -', `[${a.item_type}]`, a.name));
      return;
    }

    let inserted = 0, skipped = 0;
    for (const a of ALL) {
      const result = await client.query(
        `INSERT INTO armor_catalog
           (name, item_type, armor_class_type, weight_modifier,
            ac_bonus, dr_slashing, dr_piercing, dr_bludgeoning, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
         ON CONFLICT (name) DO NOTHING`,
        [a.name, a.item_type, a.armor_class_type ?? null,
         a.weight_modifier ?? 0, a.ac_bonus ?? 0,
         a.dr_slashing ?? 0, a.dr_piercing ?? 0, a.dr_bludgeoning ?? 0,
         a.notes ?? null],
      );
      if (result.rowCount > 0) inserted++; else skipped++;
    }
    console.log(`[import-armor] Done: ${inserted} inserted, ${skipped} already existed`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('[import-armor] Error:', e.message); process.exit(1); });
