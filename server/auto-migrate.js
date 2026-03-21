/**
 * Incremental auto-migration: runs on every server start.
 * Uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS so it is idempotent.
 */
const db = require('./db');

async function autoMigrate() {
  console.log('[auto-migrate] checking incremental schema…');
  try {
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

    // Monster HP system columns
    await db.query(`
      ALTER TABLE monsters
        ADD COLUMN IF NOT EXISTS generated_hp_base INTEGER,
        ADD COLUMN IF NOT EXISTS random_roll       INTEGER,
        ADD COLUMN IF NOT EXISTS random_modifier   FLOAT,
        ADD COLUMN IF NOT EXISTS role              VARCHAR(20) DEFAULT 'normal',
        ADD COLUMN IF NOT EXISTS treasure          VARCHAR(10);
    `);

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

    console.log('[auto-migrate] done');
  } catch (e) {
    console.error('[auto-migrate] error:', e.message);
    // Non-fatal: continue server start even if migration fails
  }
}

module.exports = autoMigrate;
