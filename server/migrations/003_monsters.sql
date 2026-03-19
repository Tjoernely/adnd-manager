-- ============================================================
--  Migration 003 — Monsters library
--  Run: sudo -u postgres psql adnddb -f server/migrations/003_monsters.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS monsters (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(200) NOT NULL,
  source            VARCHAR(100) DEFAULT 'MM',

  -- Combat stats
  hit_dice          VARCHAR(50),
  hit_points        INTEGER,
  armor_class       INTEGER,
  thac0             INTEGER,
  movement          VARCHAR(100),

  -- Size & type
  size              VARCHAR(20),
  type              VARCHAR(50),
  alignment         VARCHAR(50),

  -- Attacks
  attacks           TEXT,
  damage            TEXT,
  special_attacks   TEXT,
  special_defenses  TEXT,

  -- Saves
  save_as           VARCHAR(50),
  morale            INTEGER,
  xp_value          INTEGER,

  -- Description
  description       TEXT,
  habitat           VARCHAR(200),
  frequency         VARCHAR(50),

  -- Custom armor system
  armor_profile_id  VARCHAR(50) DEFAULT 'none',
  generated_hp      INTEGER,

  -- Meta
  tags              TEXT[],
  campaign_id       INTEGER REFERENCES campaigns(id),
  created_at        TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_monsters_name     ON monsters(LOWER(name));
CREATE INDEX IF NOT EXISTS idx_monsters_type     ON monsters(type);
CREATE INDEX IF NOT EXISTS idx_monsters_size     ON monsters(size);
CREATE INDEX IF NOT EXISTS idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_monsters_hd       ON monsters(hit_dice);
