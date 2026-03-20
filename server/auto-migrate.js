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

    // Grant access — best-effort, may fail on managed DBs
    try {
      const u = process.env.DB_USER || 'adnduser';
      await db.query(`GRANT ALL ON party_inventory TO ${u};`);
      await db.query(`GRANT USAGE, SELECT ON SEQUENCE party_inventory_id_seq TO ${u};`);
    } catch (_) { /* ignore */ }

    console.log('[auto-migrate] done');
  } catch (e) {
    console.error('[auto-migrate] error:', e.message);
    // Non-fatal: continue server start even if migration fails
  }
}

module.exports = autoMigrate;
