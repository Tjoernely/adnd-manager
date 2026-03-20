-- Full monsters table with all fields
-- Run: sudo -u postgres psql adnddb -f 003_monsters_full.sql

-- Drop and recreate for clean slate
DROP TABLE IF EXISTS monsters CASCADE;

CREATE TABLE monsters (
  id                SERIAL PRIMARY KEY,
  name              VARCHAR(200) NOT NULL,
  source            VARCHAR(200),
  wiki_url          TEXT,
  source_url        TEXT,
  
  -- Combat stats
  hit_dice          VARCHAR(50),
  hit_points        INTEGER,
  armor_class       INTEGER,
  thac0             INTEGER,
  movement          VARCHAR(100),
  no_appearing      VARCHAR(100),
  
  -- Type & classification  
  size              VARCHAR(20),
  type              VARCHAR(100),
  alignment         VARCHAR(100),
  intelligence      VARCHAR(100),
  
  -- Attacks
  attacks           VARCHAR(200),
  damage            TEXT,
  special_attacks   TEXT,
  special_defenses  TEXT,
  magic_resistance  VARCHAR(50),
  
  -- Saves & morale
  save_as           VARCHAR(50),
  morale            INTEGER,
  xp_value          INTEGER,
  
  -- Ecology
  description       TEXT,
  habitat           VARCHAR(300),
  frequency         VARCHAR(100),
  organization      VARCHAR(200),
  activity_cycle    VARCHAR(100),
  diet              VARCHAR(200),
  treasure          VARCHAR(100),
  
  -- Custom system
  armor_profile_id  VARCHAR(50) DEFAULT 'none',
  generated_hp      INTEGER,
  
  -- Meta
  tags              TEXT[],
  campaign_id       INTEGER REFERENCES campaigns(id),
  created_at        TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT monsters_name_unique UNIQUE (name)
);

CREATE INDEX idx_monsters_name     ON monsters(LOWER(name));
CREATE INDEX idx_monsters_type     ON monsters(LOWER(type));
CREATE INDEX idx_monsters_size     ON monsters(size);
CREATE INDEX idx_monsters_campaign ON monsters(campaign_id);
CREATE INDEX idx_monsters_freq     ON monsters(frequency);

SELECT 'Monsters table created' as status;
