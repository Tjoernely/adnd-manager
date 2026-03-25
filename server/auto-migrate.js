/**
 * Incremental auto-migration: runs on every server start.
 * Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is idempotent.
 */
const db = require('./db');

async function autoMigrate() {
  console.log('[auto-migrate] checking incremental schema…');
  try {
    // Core tables — idempotent, safe to run on every start
    await db.query(`
      CREATE TABLE IF NOT EXISTS npcs (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        data        JSONB        NOT NULL DEFAULT '{}',
        is_hidden   BOOLEAN      NOT NULL DEFAULT true,
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS maps (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name        VARCHAR(255) NOT NULL,
        type        VARCHAR(50)  NOT NULL DEFAULT 'dungeon',
        image_url   TEXT,
        parent_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL,
        data        JSONB        NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS quests (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        data        JSONB        NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS encounters (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        data        JSONB   NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS party_knowledge (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        title       VARCHAR(255) NOT NULL,
        content     TEXT,
        category    VARCHAR(100),
        visible_to  JSONB        NOT NULL DEFAULT '["all"]',
        created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS loot (
        id          SERIAL PRIMARY KEY,
        campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        data        JSONB   NOT NULL DEFAULT '{}',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      ALTER TABLE characters
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'party',
        ADD COLUMN IF NOT EXISTS dm_notes   TEXT;
    `);

    await db.query(`
      ALTER TABLE quests
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'dm_only';
    `);

    await db.query(`
      ALTER TABLE encounters
        ADD COLUMN IF NOT EXISTS visibility VARCHAR(20) DEFAULT 'dm_only';
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS party_inventory (
        id                       SERIAL PRIMARY KEY,
        campaign_id              INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        name                     VARCHAR(200) NOT NULL,
        description              TEXT,
        quantity                 INTEGER DEFAULT 1,
        value_gp                 INTEGER,
        item_type                VARCHAR(50) DEFAULT 'mundane',
        magical_item_id          INTEGER,
        visibility               VARCHAR(20) DEFAULT 'party',
        awarded_to_character_id  INTEGER,
        source                   VARCHAR(100),
        notes                    TEXT,
        created_at               TIMESTAMP DEFAULT NOW(),
        updated_at               TIMESTAMP DEFAULT NOW()
      );
    `);

    // Monster HP system columns — each in its own try/catch so one existing
    // column doesn't block the others from being added.
    for (const stmt of [
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS generated_hp_base INTEGER`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS random_roll       INTEGER`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS random_modifier   FLOAT`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS role              VARCHAR(20) DEFAULT 'normal'`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS treasure          VARCHAR(10)`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS armor_profile_id  VARCHAR(50)`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS generated_hp      INTEGER`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS tags              TEXT`,
      `ALTER TABLE monsters ADD COLUMN IF NOT EXISTS variants          JSONB DEFAULT NULL`,
    ]) {
      try { await db.query(stmt); }
      catch (e) { console.warn('[auto-migrate] skipped:', stmt.slice(0, 60), '—', e.message); }
    }

    // Widen monster columns that were too narrow for full wiki text values.
    // VARCHAR(20) for size and VARCHAR(50) for hit_dice / magic_resistance /
    // save_as caused "value too long" errors during wiki re-import.
    for (const stmt of [
      `ALTER TABLE monsters ALTER COLUMN size             TYPE VARCHAR(100)`,
      `ALTER TABLE monsters ALTER COLUMN hit_dice         TYPE TEXT`,
      `ALTER TABLE monsters ALTER COLUMN magic_resistance TYPE VARCHAR(200)`,
      `ALTER TABLE monsters ALTER COLUMN save_as          TYPE VARCHAR(100)`,
      `ALTER TABLE monsters ALTER COLUMN treasure         TYPE VARCHAR(100)`,
    ]) {
      try { await db.query(stmt); }
      catch (e) { console.warn('[auto-migrate] widen col skipped:', stmt.slice(0, 60), '—', e.message); }
    }

    // Saved encounters (fight-tracked, with per-creature HP)
    await db.query(`
      CREATE TABLE IF NOT EXISTS saved_encounters (
        id           SERIAL PRIMARY KEY,
        campaign_id  INTEGER REFERENCES campaigns(id) ON DELETE CASCADE,
        title        VARCHAR(200) NOT NULL,
        terrain      VARCHAR(100),
        difficulty   VARCHAR(20),
        party_level  INTEGER,
        party_size   INTEGER,
        status       VARCHAR(20) DEFAULT 'active',
        total_xp     INTEGER DEFAULT 0,
        loot_official JSONB,
        loot_ai      TEXT,
        created_at   TIMESTAMP DEFAULT NOW(),
        updated_at   TIMESTAMP DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS encounter_creatures (
        id            SERIAL PRIMARY KEY,
        encounter_id  INTEGER REFERENCES saved_encounters(id) ON DELETE CASCADE,
        monster_id    INTEGER,
        monster_name  VARCHAR(200),
        max_hp        INTEGER DEFAULT 1,
        current_hp    INTEGER DEFAULT 1,
        initiative    INTEGER DEFAULT 0,
        status        VARCHAR(20) DEFAULT 'alive',
        loot          JSONB,
        notes         TEXT
      );
    `);

    try {
      const u = process.env.DB_USER || 'adnduser';
      await db.query(`GRANT ALL ON saved_encounters TO ${u};`);
      await db.query(`GRANT ALL ON encounter_creatures TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE saved_encounters_id_seq TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE encounter_creatures_id_seq TO ${u};`);
    } catch (_) { /* ignore */ }

    // Grant access — best-effort, may fail on managed DBs
    try {
      const u = process.env.DB_USER || 'adnduser';
      await db.query(`GRANT ALL ON party_inventory TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE party_inventory_id_seq TO ${u};`);
    } catch (_) { /* ignore */ }

    // New combat columns — idempotent, safe to run repeatedly
    try {
      await db.query(`ALTER TABLE saved_encounters ADD COLUMN IF NOT EXISTS current_round INTEGER DEFAULT 1;`);
      await db.query(`ALTER TABLE encounter_creatures ADD COLUMN IF NOT EXISTS ac INTEGER;`);
      await db.query(`ALTER TABLE encounter_creatures ADD COLUMN IF NOT EXISTS thac0 INTEGER;`);
      await db.query(`ALTER TABLE encounter_creatures ADD COLUMN IF NOT EXISTS attacks VARCHAR(20);`);
      await db.query(`ALTER TABLE encounter_creatures ADD COLUMN IF NOT EXISTS damage VARCHAR(50);`);
      await db.query(`ALTER TABLE encounter_creatures ADD COLUMN IF NOT EXISTS xp_value INTEGER DEFAULT 0;`);
    } catch (e) { console.warn('[auto-migrate] combat columns skipped:', e.message); }

    // Loot data + source tracking columns
    try {
      await db.query(`ALTER TABLE saved_encounters ADD COLUMN IF NOT EXISTS loot_data JSONB DEFAULT NULL;`);
      await db.query(`ALTER TABLE party_equipment ADD COLUMN IF NOT EXISTS source VARCHAR(50);`);
      await db.query(`ALTER TABLE party_equipment ADD COLUMN IF NOT EXISTS source_encounter_id INTEGER;`);
    } catch (e) { console.warn('[auto-migrate] loot-data columns skipped:', e.message); }

    // Roll range columns on magical_items for d1000 table lookups
    try {
      await db.query(`ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_min INTEGER;`);
      await db.query(`ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_max INTEGER;`);
    } catch (e) { console.warn('[auto-migrate] roll_min/roll_max cols skipped:', e.message); }

    // Fix concatenated AC/THAC0 values (e.g. 610 → 6, 1520 → 15)
    // These arise when parseIntSafe strips whitespace from "6 10" → 610
    try {
      await db.query(`
        UPDATE monsters SET armor_class =
          CASE
            WHEN LEFT(armor_class::text, 1)::integer BETWEEN -10 AND 30
              THEN LEFT(armor_class::text, 1)::integer
            WHEN LENGTH(armor_class::text) >= 2
              AND LEFT(armor_class::text, 2) ~ '^-?[0-9]+$'
              AND LEFT(armor_class::text, 2)::integer BETWEEN -10 AND 30
              THEN LEFT(armor_class::text, 2)::integer
            ELSE armor_class
          END
        WHERE armor_class > 30 OR armor_class < -10;
      `);
      await db.query(`
        UPDATE monsters SET thac0 =
          CASE
            WHEN LEFT(thac0::text, 2) ~ '^[0-9]+$'
              AND LEFT(thac0::text, 2)::integer BETWEEN -5 AND 20
              THEN LEFT(thac0::text, 2)::integer
            WHEN LEFT(thac0::text, 1) ~ '^[0-9]$'
              AND LEFT(thac0::text, 1)::integer BETWEEN -5 AND 20
              THEN LEFT(thac0::text, 1)::integer
            ELSE thac0
          END
        WHERE thac0 > 20 OR thac0 < -5;
      `);
    } catch (e) { console.warn('[auto-migrate] AC/THAC0 fix skipped:', e.message); }

    // ── Equipment & Spells tables ──────────────────────────────────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS party_equipment (
        id               SERIAL PRIMARY KEY,
        campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name             VARCHAR(200) NOT NULL,
        description      TEXT,
        item_type        VARCHAR(50)  DEFAULT 'mundane',
        identify_state   VARCHAR(20)  DEFAULT 'unknown',
        weight_lbs       NUMERIC(6,2),
        value_gp         NUMERIC(10,2),
        magical_item_id  INTEGER,
        notes            TEXT,
        is_removed       BOOLEAN      NOT NULL DEFAULT FALSE,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS character_equipment (
        id               SERIAL PRIMARY KEY,
        character_id     INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        campaign_id      INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name             VARCHAR(200) NOT NULL,
        description      TEXT,
        item_type        VARCHAR(50)  DEFAULT 'mundane',
        identify_state   VARCHAR(20)  DEFAULT 'identified',
        slot             VARCHAR(30),
        is_equipped      BOOLEAN      NOT NULL DEFAULT FALSE,
        weapon_type      VARCHAR(20),
        damage_s_m       VARCHAR(30),
        damage_l         VARCHAR(30),
        range_str        VARCHAR(30),
        armor_ac         INTEGER,
        magic_bonus      INTEGER      DEFAULT 0,
        is_cursed        BOOLEAN      NOT NULL DEFAULT FALSE,
        weight_lbs       NUMERIC(6,2),
        value_gp         NUMERIC(10,2),
        magical_item_id  INTEGER,
        notes            TEXT,
        source_pool_id   INTEGER REFERENCES party_equipment(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS character_spells (
        id              SERIAL PRIMARY KEY,
        character_id    INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
        campaign_id     INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
        name            VARCHAR(200) NOT NULL,
        spell_level     INTEGER      DEFAULT 1,
        spell_type      VARCHAR(20)  DEFAULT 'wizard',
        description     TEXT,
        status          VARCHAR(20)  DEFAULT 'memorized',
        uses_per_day    INTEGER,
        uses_remaining  INTEGER,
        is_special      BOOLEAN      NOT NULL DEFAULT FALSE,
        notes           TEXT,
        spell_db_id     INTEGER,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
    `);

    // ── Catalog tables (reference data, not campaign-scoped) ──────────────────
    await db.query(`
      CREATE TABLE IF NOT EXISTS weapons_catalog (
        id             SERIAL PRIMARY KEY,
        name           VARCHAR(200) NOT NULL UNIQUE,
        weight         FLOAT,
        size           VARCHAR(10),
        weapon_type    VARCHAR(50),
        speed_category VARCHAR(20),
        speed_factor   INTEGER,
        melee_reach    INTEGER,
        missile_rof    VARCHAR(20),
        range_short    INTEGER,
        range_medium   INTEGER,
        range_long     INTEGER,
        damage_sm      VARCHAR(20),
        damage_l       VARCHAR(20),
        knockdown      VARCHAR(10),
        is_two_handed  BOOLEAN DEFAULT FALSE,
        notes          TEXT
      );
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS armor_catalog (
        id                SERIAL PRIMARY KEY,
        name              VARCHAR(200) NOT NULL UNIQUE,
        item_type         VARCHAR(20)  NOT NULL,
        armor_class_type  VARCHAR(50),
        weight_modifier   INTEGER DEFAULT 0,
        ac_bonus          INTEGER DEFAULT 0,
        dr_slashing       INTEGER DEFAULT 0,
        dr_piercing       INTEGER DEFAULT 0,
        dr_bludgeoning    INTEGER DEFAULT 0,
        notes             TEXT
      );
    `);

    // ── Seed catalog data (idempotent via ON CONFLICT DO NOTHING) ─────────────
    try {
      // Weapons
      const WEAPONS = [
        ['Adze',4,'S','S/P','Fast',4,1,null,null,null,null,'1d4+1','1d4','d6',false],
        ['Ankus',4,'M','P/B','Average',6,1,null,null,null,null,'1d4','1d4','d8',false],
        ['Axe, Battle',7,'M','S','Average',7,1,null,null,null,null,'1d8','1d8','d10',false],
        ['Axe, Hand/Throwing',5,'M','S','Fast',4,1,'1/rnd',2,4,6,'1d6','1d4','d8',false],
        ['Axe, Two-handed',10,'L','S','Slow',9,1,null,null,null,null,'1d10','2d8','d12',true],
        ['Bo Stick',4,'L','B','Fast',3,1,null,null,null,null,'1d6','1d4','d8',false],
        ['Bolas',2,'M','B','Slow',8,null,'1/rnd',6,12,18,'1d3','1d2','d6',false],
        ['Bow, Composite Long',3,'L','P','Average',7,null,'2/rnd',12,24,42,'1d6','1d6','d6',true],
        ['Bow, Composite Short',2,'M','P','Average',6,null,'2/rnd',10,20,36,'1d6','1d6','d6',true],
        ['Bow, Long',3,'L','P','Average',7,null,'2/rnd',14,28,42,'1d6','1d6','d6',true],
        ['Bow, Short',2,'M','P','Average',7,null,'2/rnd',10,20,30,'1d6','1d6','d6',true],
        ['Cestus',2,'S','B','Fast',2,1,null,null,null,null,'1d4','1d3','d6',false],
        ['Chain',3,'L','B','Average',5,2,null,null,null,null,'1d4+1','1d4','d6',true],
        ['Club',3,'M','B','Fast',4,1,'1/rnd',2,4,6,'1d6','1d3','d8',false],
        ['Club, Great',15,'L','B','Slow',9,1,null,null,null,null,'2d4','1d6+1','d12',true],
        ['Crossbow, Hand',3,'S','P','Average',5,null,'1/rnd',4,8,12,'1d3','1d2','d4',false],
        ['Crossbow, Heavy',14,'M','P','Slow',10,null,'1/2 rnd',16,32,48,'1d8+1','1d10+1','d6',true],
        ['Crossbow, Light',7,'M','P','Average',7,null,'1/rnd',12,24,36,'1d6+1','1d8+1','d6',true],
        ['Dagger',1,'S','P','Fast',2,1,'2/rnd',2,4,6,'1d4','1d3','d6',false],
        ['Dagger, Main-gauche',2,'S','P/S','Fast',2,1,null,null,null,null,'1d4','1d3','d6',false],
        ['Dart',0.5,'S','P','Fast',2,null,'3/rnd',2,4,8,'1d3','1d2','d4',false],
        ["Flail, Footman's",15,'L','B','Average',7,1,null,null,null,null,'1d6+1','2d4','d12',true],
        ["Flail, Horseman's",5,'M','B','Average',6,1,null,null,null,null,'1d4+1','1d4+1','d10',false],
        ['Fork',6,'L','P','Average',7,1,null,null,null,null,'1d6','1d6+1','d6',false],
        ['Halberd',15,'L','P/S','Slow',9,2,null,null,null,null,'1d10','2d6','d12',true],
        ['Hammer',3,'S','B','Fast',4,1,'1/rnd',2,4,6,'1d4','1d3','d6',false],
        ['Harpoon',6,'L','P','Average',7,2,'1/rnd',2,4,6,'2d4','2d6','d8',true],
        ['Hatchet',3,'S','S','Fast',3,1,'1/rnd',2,4,6,'1d4','1d4','d6',false],
        ['Javelin',2,'M','P','Fast',4,1,'1/rnd',4,8,12,'1d6','1d6','d6',false],
        ['Lance, Light',5,'L','P','Average',6,2,'1/rnd',2,3,4,'1d6','1d8','d8',false],
        ['Lance, Medium',10,'L','P','Average',7,2,null,null,null,null,'1d6+1','2d6','d10',false],
        ['Lance, Heavy',15,'L','P','Slow',10,2,null,null,null,null,'1d8+1','3d6','d12',false],
        ["Mace, Footman's",10,'M','B','Average',7,1,null,null,null,null,'1d6+1','1d6','d10',false],
        ["Mace, Horseman's",6,'M','B','Average',6,1,'1/rnd',2,3,4,'1d6','1d4','d8',false],
        ['Maul',10,'L','B','Slow',8,1,null,null,null,null,'2d4','1d10','d12',true],
        ['Morningstar',12,'M','B/P','Average',7,1,null,null,null,null,'2d4','1d6+1','d10',false],
        ['Nunchaku',3,'M','B','Fast',3,1,null,null,null,null,'1d6','1d6','d8',false],
        ["Pick, Footman's",6,'M','P','Average',7,1,null,null,null,null,'1d6+1','2d4','d8',false],
        ["Pick, Horseman's",4,'M','P','Average',5,1,null,null,null,null,'1d4+1','1d4','d6',false],
        ['Pike',12,'L','P','Slow',13,3,null,null,null,null,'1d6','1d12','d8',true],
        ['Quarterstaff',4,'L','B','Fast',4,1,null,null,null,null,'1d6','1d6','d10',true],
        ['Scythe',8,'L','P/S','Slow',8,1,null,null,null,null,'1d6+1','1d8','d8',true],
        ['Sickle',3,'S','S','Fast',4,1,null,null,null,null,'1d4+1','1d4','d4',false],
        ['Sling',1,'S','B','Average',6,null,'1/rnd',10,20,40,'1d4+1','1d6+1','d4',false],
        ['Spear',5,'M','P','Average',6,1,'1/rnd',2,4,6,'1d6','1d8','d6',false],
        ['Sword, Bastard (1H)',10,'M','S','Average',6,1,null,null,null,null,'1d8','1d12','d8',false],
        ['Sword, Bastard (2H)',10,'M','S','Average',8,1,null,null,null,null,'2d4','2d8','d10',true],
        ['Sword, Broad',4,'M','S','Average',5,1,null,null,null,null,'2d4','1d6+1','d8',false],
        ['Sword, Cutlass',4,'M','S','Average',5,1,null,null,null,null,'1d6+1','1d8+1','d8',false],
        ['Sword, Estoc',5,'M','P','Average',5,1,null,null,null,null,'1d6','1d8','d6',false],
        ['Sword, Falchion',8,'M','S','Average',5,1,null,null,null,null,'1d6+1','2d4','d8',false],
        ['Sword, Gladius',3,'S','P','Fast',3,1,null,null,null,null,'1d6','1d8','d6',false],
        ['Sword, Katana (1H)',6,'M','S/P','Fast',4,1,null,null,null,null,'1d10','1d12','d6',false],
        ['Sword, Katana (2H)',6,'M','S/P','Fast',5,1,null,null,null,null,'2d6','2d6','d8',true],
        ['Sword, Khopesh',7,'M','S','Slow',9,1,null,null,null,null,'2d4','1d6','d8',false],
        ['Sword, Long',4,'M','S','Average',5,1,null,null,null,null,'1d8','1d12','d8',false],
        ['Sword, Rapier',4,'M','P','Fast',4,1,null,null,null,null,'1d6','1d8','d6',false],
        ['Sword, Sabre',5,'M','S','Average',5,1,null,null,null,null,'1d6+1','1d8+1','d8',false],
        ['Sword, Scimitar',4,'M','S','Average',5,1,null,null,null,null,'1d8','1d8','d8',false],
        ['Sword, Scimitar, Great',16,'L','S','Slow',9,1,null,null,null,null,'2d6','4d4','d10',true],
        ['Sword, Short',3,'S','P','Fast',3,1,null,null,null,null,'1d6','1d8','d6',false],
        ['Sword, Spatha',4,'M','S','Average',5,1,null,null,null,null,'1d8','1d12','d8',false],
        ['Sword, Tulwar',8,'M','S','Average',5,1,null,null,null,null,'1d6+1','2d4','d8',false],
        ['Sword, Two-handed',15,'L','S','Slow',10,1,null,null,null,null,'1d10','3d6','d12',true],
        ['Sword, Wakizashi',3,'M','S/P','Fast',3,1,null,null,null,null,'1d8','1d8','d6',false],
        ['Trident',5,'L','P','Average',7,1,'1/rnd',2,3,4,'1d6+1','2d4','d6',false],
        ['Warhammer',6,'M','B','Fast',4,1,'1/rnd',2,4,6,'1d4+1','1d4','d8',false],
      ];
      for (const [name,weight,size,wt,sc,sf,reach,rof,rs,rm,rl,dsm,dl,kd,twoH] of WEAPONS) {
        await db.query(
          `INSERT INTO weapons_catalog
             (name,weight,size,weapon_type,speed_category,speed_factor,melee_reach,
              missile_rof,range_short,range_medium,range_long,damage_sm,damage_l,knockdown,is_two_handed)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT (name) DO NOTHING`,
          [name,weight,size,wt,sc,sf,reach,rof,rs,rm,rl,dsm,dl,kd,twoH]
        );
      }
      // Armor & Shields
      const ARMOR = [
        ['No Armor/Clothes','armor','Ultra Light',-1,0,0,0,0],
        ['Padded','armor','Light',0,-3,3,3,4],
        ['Leather','armor','Light',0,-3,4,3,3],
        ['Studded Leather','armor','Light',1,-4,5,4,4],
        ['Ring Mail','armor','Medium',2,-4,6,5,5],
        ['Hide Armor','armor','Medium',1,-5,6,4,5],
        ['Scale Mail','armor','Medium',2,-5,6,5,5],
        ['Chain Mail','armor','Medium',2,-6,6,5,5],
        ['Brigandine','armor','Medium',2,-6,6,5,5],
        ['Splint Mail','armor','Heavy',3,-7,7,6,6],
        ['Banded Mail','armor','Heavy',4,-7,7,5,8],
        ['Plate Mail','armor','Heavy',4,-8,8,8,5],
        ['Field Plate','armor','Very Heavy',5,-12,8,8,5],
        ['Full Plate','armor','Very Heavy',6,-14,8,8,5],
        ['Buckler','shield','Small',0,-1,12,16,8],
        ['Shield, Medium','shield','Medium',0,-2,12,16,10],
        ['Tower Shield','shield','Large',0,-3,14,16,12],
      ];
      for (const [name,itype,act,wm,acb,drs,drp,drb] of ARMOR) {
        await db.query(
          `INSERT INTO armor_catalog
             (name,item_type,armor_class_type,weight_modifier,ac_bonus,dr_slashing,dr_piercing,dr_bludgeoning)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (name) DO NOTHING`,
          [name,itype,act,wm,acb,drs,drp,drb]
        );
      }
      console.log('[auto-migrate] catalog seed: done');
    } catch (e) { console.warn('[auto-migrate] catalog seed skipped:', e.message); }

    // ── Add ammo columns to weapons_catalog ──────────────────────────────────
    try {
      await db.query(`ALTER TABLE weapons_catalog ADD COLUMN IF NOT EXISTS ammo_type         VARCHAR(50) DEFAULT NULL;`);
      await db.query(`ALTER TABLE weapons_catalog ADD COLUMN IF NOT EXISTS compatible_ranged VARCHAR(50) DEFAULT NULL;`);
    } catch (e) { console.warn('[auto-migrate] weapons_catalog ammo cols skipped:', e.message); }

    // ── Seed ammo catalog entries ─────────────────────────────────────────────
    try {
      const AMMO = [
        // name, ammo_type, compatible_ranged, damage_sm, damage_l, weight, notes
        ['Flight Arrow',     'arrow',  'bow',             '1d6',   '1d6',   0.1, 'Standard arrow, all bows'],
        ['Sheaf Arrow',      'arrow',  'bow',             '1d8',   '1d8',   0.1, '+1 dmg vs armored, all bows'],
        ['Pile Arrow',       'arrow',  'bow',             '1d6',   '1d6',   0.1, 'Armor-piercing, composite & long bow'],
        ['Stone Arrow',      'arrow',  'bow',             '1d4',   '1d4',   0.1, 'Primitive, short & composite short bow'],
        ['Hand Quarrel',     'bolt',   'crossbow_hand',   '1d3',   '1d2',   0.1, 'Hand crossbow only'],
        ['Light Quarrel',    'bolt',   'crossbow_light',  '1d6+1', '1d8+1', 0.1, 'Light crossbow only'],
        ['Heavy Quarrel',    'bolt',   'crossbow_heavy',  '1d8+1', '1d10+1',0.1, 'Heavy crossbow only'],
        ['Pellet (crossbow)','bolt',   'crossbow_light',  '1d4',   '1d4',   0.1, 'Pellet bow only'],
        ['Sling Bullet',     'bullet', 'sling',           '1d4+1', '1d6+1', 0.1, 'Standard sling ammunition'],
        ['Sling Stone',      'stone',  'sling',           '1d4',   '1d4',   0.1, 'Field-expedient, -1 to hit'],
        ['Blowgun Needle',   'needle', 'blowgun',         '1',     '1',     0.0, 'Can be poisoned'],
        ['Blowgun Dart',     'dart',   'blowgun',         '1d3',   '1d2',   0.0, 'Barbed dart'],
      ];
      for (const [name, ammoType, compatRanged, dsm, dl, weight, notes] of AMMO) {
        await db.query(
          `INSERT INTO weapons_catalog (name, ammo_type, compatible_ranged, damage_sm, damage_l, weight, notes)
           VALUES($1,$2,$3,$4,$5,$6,$7)
           ON CONFLICT (name) DO NOTHING`,
          [name, ammoType, compatRanged, dsm, dl, weight, notes]
        );
      }
      console.log('[auto-migrate] ammo seed: done');
    } catch (e) { console.warn('[auto-migrate] ammo seed skipped:', e.message); }

    // ── Add missing columns to character_equipment ────────────────────────────
    try {
      await db.query(`ALTER TABLE character_equipment ADD COLUMN IF NOT EXISTS quantity     INTEGER DEFAULT 1;`);
      await db.query(`ALTER TABLE character_equipment ADD COLUMN IF NOT EXISTS is_two_handed BOOLEAN DEFAULT FALSE;`);
      await db.query(`ALTER TABLE character_equipment ADD COLUMN IF NOT EXISTS speed_factor INTEGER;`);
    } catch (e) { console.warn('[auto-migrate] character_equipment extra cols skipped:', e.message); }

    try {
      const u = process.env.DB_USER || 'adnduser';
      await db.query(`GRANT ALL ON party_equipment    TO ${u};`);
      await db.query(`GRANT ALL ON character_equipment TO ${u};`);
      await db.query(`GRANT ALL ON character_spells    TO ${u};`);
      await db.query(`GRANT ALL ON weapons_catalog     TO ${u};`);
      await db.query(`GRANT ALL ON armor_catalog        TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE party_equipment_id_seq     TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE character_equipment_id_seq TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE character_spells_id_seq    TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE weapons_catalog_id_seq     TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE armor_catalog_id_seq       TO ${u};`);
    } catch (_) { /* ignore on managed DBs */ }

    console.log('[auto-migrate] done');
  } catch (e) {
    console.error('[auto-migrate] error:', e.message);
    // Non-fatal: continue server start even if migration fails
  }
}

module.exports = autoMigrate;
