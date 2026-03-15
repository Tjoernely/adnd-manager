-- ============================================================
--  AD&D Campaign Manager — PostgreSQL Schema
-- ============================================================

-- ── Users ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      VARCHAR(100) NOT NULL,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(20)  NOT NULL DEFAULT 'player'
                  CHECK (role IN ('dm', 'player', 'admin')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Campaigns ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  dm_user_id  INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  description TEXT,
  settings    JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Campaign Members (players in a campaign) ────────────────
CREATE TABLE IF NOT EXISTS campaign_members (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  user_id     INTEGER NOT NULL REFERENCES users(id)     ON DELETE CASCADE,
  role        VARCHAR(20) NOT NULL DEFAULT 'player' CHECK (role IN ('dm', 'player')),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (campaign_id, user_id)
);

-- ── Campaign Invites ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  token       VARCHAR(64)  UNIQUE NOT NULL,
  email       VARCHAR(255),
  created_by  INTEGER      NOT NULL REFERENCES users(id),
  expires_at  TIMESTAMPTZ  NOT NULL,
  used_at     TIMESTAMPTZ,
  used_by     INTEGER      REFERENCES users(id),
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Characters ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS characters (
  id              SERIAL PRIMARY KEY,
  campaign_id     INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  player_user_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name            VARCHAR(255),           -- denorm from character_data.charName
  character_data  JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── NPCs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS npcs (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER     NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  data        JSONB        NOT NULL DEFAULT '{}',
  is_hidden   BOOLEAN      NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Quests ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quests (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  data        JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Encounters ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS encounters (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  data        JSONB   NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Loot ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loot (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  data        JSONB   NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Spells ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS spells (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(255) NOT NULL,
  spell_group      VARCHAR(20)  NOT NULL DEFAULT 'wizard'
                     CHECK (spell_group IN ('wizard', 'priest')),
  level            INTEGER,
  school           VARCHAR(100),
  sphere           VARCHAR(100),
  source           VARCHAR(255),
  description      TEXT,
  casting_time     VARCHAR(100),
  duration         VARCHAR(100),
  range            VARCHAR(100),
  area_of_effect   VARCHAR(100),
  saving_throw     VARCHAR(100),
  components       VARCHAR(100),
  reversible       BOOLEAN     NOT NULL DEFAULT false,
  tags             JSONB       NOT NULL DEFAULT '[]',
  raw_import_data  JSONB       NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, spell_group, COALESCE(source, ''))
);

-- ── Maps ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maps (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  name        VARCHAR(255) NOT NULL,
  type        VARCHAR(50)  NOT NULL DEFAULT 'dungeon',
  image_url   TEXT,
  data        JSONB        NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Party Knowledge ─────────────────────────────────────────
-- visible_to: JSON array of user IDs as strings, OR ["all"]
CREATE TABLE IF NOT EXISTS party_knowledge (
  id          SERIAL PRIMARY KEY,
  campaign_id INTEGER      NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  title       VARCHAR(255) NOT NULL,
  content     TEXT         NOT NULL DEFAULT '',
  visible_to  JSONB        NOT NULL DEFAULT '["all"]',
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ── Magical Items (global library) ──────────────────────────
CREATE TABLE IF NOT EXISTS magical_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,
  subcategory     TEXT,
  source_page_title TEXT,
  source_url      TEXT,
  description     TEXT,
  powers          TEXT,
  charges         TEXT,
  cursed          BOOLEAN NOT NULL DEFAULT false,
  alignment       TEXT,
  classes         TEXT[],
  value_gp        INTEGER,
  rarity          TEXT CHECK (rarity IN ('common','uncommon','rare','very rare','legendary') OR rarity IS NULL),
  weight          TEXT,
  intelligence    INTEGER,
  ego             INTEGER,
  special_purpose TEXT,
  table_letter    TEXT,
  table_roll_min  INTEGER,
  table_roll_max  INTEGER,
  import_warnings TEXT[],
  raw_text        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, category)
);

CREATE TABLE IF NOT EXISTS random_item_tables (
  id           SERIAL PRIMARY KEY,
  table_letter TEXT    NOT NULL,
  table_name   TEXT    NOT NULL,
  dice         TEXT    NOT NULL,
  roll_min     INTEGER NOT NULL,
  roll_max     INTEGER NOT NULL,
  item_name    TEXT    NOT NULL,
  item_id      INTEGER REFERENCES magical_items(id) ON DELETE SET NULL,
  notes        TEXT
);

-- ── Indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_campaigns_dm         ON campaigns(dm_user_id);
CREATE INDEX IF NOT EXISTS idx_members_campaign     ON campaign_members(campaign_id);
CREATE INDEX IF NOT EXISTS idx_members_user         ON campaign_members(user_id);
CREATE INDEX IF NOT EXISTS idx_invites_token        ON invites(token);
CREATE INDEX IF NOT EXISTS idx_chars_campaign       ON characters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_chars_player         ON characters(player_user_id);
CREATE INDEX IF NOT EXISTS idx_npcs_campaign        ON npcs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_quests_campaign      ON quests(campaign_id);
CREATE INDEX IF NOT EXISTS idx_encounters_campaign  ON encounters(campaign_id);
CREATE INDEX IF NOT EXISTS idx_loot_campaign        ON loot(campaign_id);
CREATE INDEX IF NOT EXISTS idx_spells_group         ON spells(spell_group);
CREATE INDEX IF NOT EXISTS idx_spells_level         ON spells(level);
CREATE INDEX IF NOT EXISTS idx_spells_name          ON spells USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_spells_desc          ON spells USING gin(to_tsvector('english', COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS idx_maps_campaign        ON maps(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pk_campaign          ON party_knowledge(campaign_id);
CREATE INDEX IF NOT EXISTS idx_mi_name              ON magical_items USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_mi_category          ON magical_items(category);
CREATE INDEX IF NOT EXISTS idx_mi_table             ON magical_items(table_letter);
CREATE INDEX IF NOT EXISTS idx_mi_rarity            ON magical_items(rarity);
CREATE INDEX IF NOT EXISTS idx_mi_cursed            ON magical_items(cursed) WHERE cursed = true;
CREATE INDEX IF NOT EXISTS idx_rit_letter           ON random_item_tables(table_letter);

-- ── Auto-update updated_at trigger ─────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'campaigns','characters','npcs','quests','encounters',
    'loot','spells','maps','party_knowledge'
  ] LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %I;
       CREATE TRIGGER trg_%s_updated_at
         BEFORE UPDATE ON %I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();',
      t, t, t, t
    );
  END LOOP;
END $$;
