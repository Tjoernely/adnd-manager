/**
 * Import weapons catalog from AD&D 2E S&P data.
 * Usage:
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \
 *   DB_USER=adnduser DB_PASSWORD=... \
 *   node server/scripts/import-weapons.mjs [--dry-run]
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

const WEAPONS = [
  {name:"Adze",weight:4,size:"S",weapon_type:"S/P",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4+1",damage_l:"1d4",knockdown:"d6"},
  {name:"Ankus",weight:4,size:"M",weapon_type:"P/B",speed_category:"Average",speed_factor:6,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4",damage_l:"1d4",knockdown:"d8"},
  {name:"Axe, Battle",weight:7,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d8",knockdown:"d10"},
  {name:"Axe, Hand/Throwing",weight:5,size:"M",weapon_type:"S",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d6",damage_l:"1d4",knockdown:"d8"},
  {name:"Axe, Two-handed",weight:10,size:"L",weapon_type:"S",speed_category:"Slow",speed_factor:9,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d10",damage_l:"2d8",knockdown:"d12",is_two_handed:true},
  {name:"Bo Stick",weight:4,size:"L",weapon_type:"B",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d4",knockdown:"d8"},
  {name:"Bolas",weight:2,size:"M",weapon_type:"B",speed_category:"Slow",speed_factor:8,melee_reach:null,missile_rof:"1/rnd",range_short:6,range_medium:12,range_long:18,damage_sm:"1d3",damage_l:"1d2",knockdown:"d6"},
  {name:"Bow, Composite Long",weight:3,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:null,missile_rof:"2/rnd",range_short:12,range_medium:24,range_long:42,damage_sm:"1d6",damage_l:"1d6",knockdown:"d6",is_two_handed:true},
  {name:"Bow, Composite Short",weight:2,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:6,melee_reach:null,missile_rof:"2/rnd",range_short:10,range_medium:20,range_long:36,damage_sm:"1d6",damage_l:"1d6",knockdown:"d6",is_two_handed:true},
  {name:"Bow, Long",weight:3,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:null,missile_rof:"2/rnd",range_short:14,range_medium:28,range_long:42,damage_sm:"1d6",damage_l:"1d6",knockdown:"d6",is_two_handed:true},
  {name:"Bow, Short",weight:2,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:null,missile_rof:"2/rnd",range_short:10,range_medium:20,range_long:30,damage_sm:"1d6",damage_l:"1d6",knockdown:"d6",is_two_handed:true},
  {name:"Cestus",weight:2,size:"S",weapon_type:"B",speed_category:"Fast",speed_factor:2,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4",damage_l:"1d3",knockdown:"d6"},
  {name:"Chain",weight:3,size:"L",weapon_type:"B",speed_category:"Average",speed_factor:5,melee_reach:2,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4+1",damage_l:"1d4",knockdown:"d6",is_two_handed:true},
  {name:"Club",weight:3,size:"M",weapon_type:"B",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d6",damage_l:"1d3",knockdown:"d8"},
  {name:"Club, Great",weight:15,size:"L",weapon_type:"B",speed_category:"Slow",speed_factor:9,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"1d6+1",knockdown:"d12",is_two_handed:true},
  {name:"Crossbow, Hand",weight:3,size:"S",weapon_type:"P",speed_category:"Average",speed_factor:5,melee_reach:null,missile_rof:"1/rnd",range_short:4,range_medium:8,range_long:12,damage_sm:"1d3",damage_l:"1d2",knockdown:"d4"},
  {name:"Crossbow, Heavy",weight:14,size:"M",weapon_type:"P",speed_category:"Slow",speed_factor:10,melee_reach:null,missile_rof:"1/2 rnd",range_short:16,range_medium:32,range_long:48,damage_sm:"1d8+1",damage_l:"1d10+1",knockdown:"d6",is_two_handed:true},
  {name:"Crossbow, Light",weight:7,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:null,missile_rof:"1/rnd",range_short:12,range_medium:24,range_long:36,damage_sm:"1d6+1",damage_l:"1d8+1",knockdown:"d6",is_two_handed:true},
  {name:"Dagger",weight:1,size:"S",weapon_type:"P",speed_category:"Fast",speed_factor:2,melee_reach:1,missile_rof:"2/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d4",damage_l:"1d3",knockdown:"d6"},
  {name:"Dagger, Main-gauche",weight:2,size:"S",weapon_type:"P/S",speed_category:"Fast",speed_factor:2,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4",damage_l:"1d3",knockdown:"d6"},
  {name:"Dart",weight:0.5,size:"S",weapon_type:"P",speed_category:"Fast",speed_factor:2,melee_reach:null,missile_rof:"3/rnd",range_short:2,range_medium:4,range_long:8,damage_sm:"1d3",damage_l:"1d2",knockdown:"d4"},
  {name:"Flail, Footman's",weight:15,size:"L",weapon_type:"B",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"2d4",knockdown:"d12",is_two_handed:true},
  {name:"Flail, Horseman's",weight:5,size:"M",weapon_type:"B",speed_category:"Average",speed_factor:6,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4+1",damage_l:"1d4+1",knockdown:"d10"},
  {name:"Fork",weight:6,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d6+1",knockdown:"d6"},
  {name:"Halberd",weight:15,size:"L",weapon_type:"P/S",speed_category:"Slow",speed_factor:9,melee_reach:2,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d10",damage_l:"2d6",knockdown:"d12",is_two_handed:true},
  {name:"Hammer",weight:3,size:"S",weapon_type:"B",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d4",damage_l:"1d3",knockdown:"d6"},
  {name:"Harpoon",weight:6,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:2,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"2d4",damage_l:"2d6",knockdown:"d8",is_two_handed:true},
  {name:"Hatchet",weight:3,size:"S",weapon_type:"S",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d4",damage_l:"1d4",knockdown:"d6"},
  {name:"Javelin",weight:2,size:"M",weapon_type:"P",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:"1/rnd",range_short:4,range_medium:8,range_long:12,damage_sm:"1d6",damage_l:"1d6",knockdown:"d6"},
  {name:"Lance, Light",weight:5,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:6,melee_reach:2,missile_rof:"1/rnd",range_short:2,range_medium:3,range_long:4,damage_sm:"1d6",damage_l:"1d8",knockdown:"d8"},
  {name:"Lance, Medium",weight:10,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:2,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"2d6",knockdown:"d10"},
  {name:"Lance, Heavy",weight:15,size:"L",weapon_type:"P",speed_category:"Slow",speed_factor:10,melee_reach:2,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8+1",damage_l:"3d6",knockdown:"d12"},
  {name:"Mace, Footman's",weight:10,size:"M",weapon_type:"B",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"1d6",knockdown:"d10"},
  {name:"Mace, Horseman's",weight:6,size:"M",weapon_type:"B",speed_category:"Average",speed_factor:6,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:3,range_long:4,damage_sm:"1d6",damage_l:"1d4",knockdown:"d8"},
  {name:"Maul",weight:10,size:"L",weapon_type:"B",speed_category:"Slow",speed_factor:8,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"1d10",knockdown:"d12",is_two_handed:true},
  {name:"Morningstar",weight:12,size:"M",weapon_type:"B/P",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"1d6+1",knockdown:"d10"},
  {name:"Nunchaku",weight:3,size:"M",weapon_type:"B",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d6",knockdown:"d8"},
  {name:"Pick, Footman's",weight:6,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"2d4",knockdown:"d8"},
  {name:"Pick, Horseman's",weight:4,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4+1",damage_l:"1d4",knockdown:"d6"},
  {name:"Pike",weight:12,size:"L",weapon_type:"P",speed_category:"Slow",speed_factor:13,melee_reach:3,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d12",knockdown:"d8",is_two_handed:true},
  {name:"Quarterstaff",weight:4,size:"L",weapon_type:"B",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d6",knockdown:"d10",is_two_handed:true},
  {name:"Scythe",weight:8,size:"L",weapon_type:"P/S",speed_category:"Slow",speed_factor:8,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"1d8",knockdown:"d8",is_two_handed:true},
  {name:"Sickle",weight:3,size:"S",weapon_type:"S",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d4+1",damage_l:"1d4",knockdown:"d4"},
  {name:"Sling",weight:1,size:"S",weapon_type:"B",speed_category:"Average",speed_factor:6,melee_reach:null,missile_rof:"1/rnd",range_short:10,range_medium:20,range_long:40,damage_sm:"1d4+1",damage_l:"1d6+1",knockdown:"d4"},
  {name:"Spear",weight:5,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:6,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d6",damage_l:"1d8",knockdown:"d6"},
  {name:"Sword, Bastard (1H)",weight:10,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:6,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d12",knockdown:"d8"},
  {name:"Sword, Bastard (2H)",weight:10,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:8,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"2d8",knockdown:"d10",is_two_handed:true},
  {name:"Sword, Broad",weight:4,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"1d6+1",knockdown:"d8"},
  {name:"Sword, Cutlass",weight:4,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"1d8+1",knockdown:"d8"},
  {name:"Sword, Estoc",weight:5,size:"M",weapon_type:"P",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d8",knockdown:"d6"},
  {name:"Sword, Falchion",weight:8,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"2d4",knockdown:"d8"},
  {name:"Sword, Gladius",weight:3,size:"S",weapon_type:"P",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d8",knockdown:"d6"},
  {name:"Sword, Katana (1H)",weight:6,size:"M",weapon_type:"S/P",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d10",damage_l:"1d12",knockdown:"d6"},
  {name:"Sword, Katana (2H)",weight:6,size:"M",weapon_type:"S/P",speed_category:"Fast",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d6",damage_l:"2d6",knockdown:"d8",is_two_handed:true},
  {name:"Sword, Khopesh",weight:7,size:"M",weapon_type:"S",speed_category:"Slow",speed_factor:9,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d4",damage_l:"1d6",knockdown:"d8"},
  {name:"Sword, Long",weight:4,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d12",knockdown:"d8"},
  {name:"Sword, Rapier",weight:4,size:"M",weapon_type:"P",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d8",knockdown:"d6"},
  {name:"Sword, Sabre",weight:5,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"1d8+1",knockdown:"d8"},
  {name:"Sword, Scimitar",weight:4,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d8",knockdown:"d8"},
  {name:"Sword, Scimitar, Great",weight:16,size:"L",weapon_type:"S",speed_category:"Slow",speed_factor:9,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"2d6",damage_l:"4d4",knockdown:"d10",is_two_handed:true},
  {name:"Sword, Short",weight:3,size:"S",weapon_type:"P",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6",damage_l:"1d8",knockdown:"d6"},
  {name:"Sword, Spatha",weight:4,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d12",knockdown:"d8"},
  {name:"Sword, Tulwar",weight:8,size:"M",weapon_type:"S",speed_category:"Average",speed_factor:5,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d6+1",damage_l:"2d4",knockdown:"d8"},
  {name:"Sword, Two-handed",weight:15,size:"L",weapon_type:"S",speed_category:"Slow",speed_factor:10,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d10",damage_l:"3d6",knockdown:"d12",is_two_handed:true},
  {name:"Sword, Wakizashi",weight:3,size:"M",weapon_type:"S/P",speed_category:"Fast",speed_factor:3,melee_reach:1,missile_rof:null,range_short:null,range_medium:null,range_long:null,damage_sm:"1d8",damage_l:"1d8",knockdown:"d6"},
  {name:"Trident",weight:5,size:"L",weapon_type:"P",speed_category:"Average",speed_factor:7,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:3,range_long:4,damage_sm:"1d6+1",damage_l:"2d4",knockdown:"d6"},
  {name:"Warhammer",weight:6,size:"M",weapon_type:"B",speed_category:"Fast",speed_factor:4,melee_reach:1,missile_rof:"1/rnd",range_short:2,range_medium:4,range_long:6,damage_sm:"1d4+1",damage_l:"1d4",knockdown:"d8"},
];

async function main() {
  const client = await pool.connect();
  try {
    if (dryRun) {
      console.log('[DRY-RUN] Would insert', WEAPONS.length, 'weapons');
      WEAPONS.forEach(w => console.log(' -', w.name));
      return;
    }

    let inserted = 0, skipped = 0;
    for (const w of WEAPONS) {
      const result = await client.query(
        `INSERT INTO weapons_catalog
           (name, weight, size, weapon_type, speed_category, speed_factor,
            melee_reach, missile_rof, range_short, range_medium, range_long,
            damage_sm, damage_l, knockdown, is_two_handed, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (name) DO NOTHING`,
        [w.name, w.weight ?? null, w.size ?? null, w.weapon_type ?? null,
         w.speed_category ?? null, w.speed_factor ?? null,
         w.melee_reach ?? null, w.missile_rof ?? null,
         w.range_short ?? null, w.range_medium ?? null, w.range_long ?? null,
         w.damage_sm ?? null, w.damage_l ?? null, w.knockdown ?? null,
         w.is_two_handed ?? false, w.notes ?? null],
      );
      if (result.rowCount > 0) inserted++; else skipped++;
    }
    console.log(`[import-weapons] Done: ${inserted} inserted, ${skipped} already existed`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => { console.error('[import-weapons] Error:', e.message); process.exit(1); });
