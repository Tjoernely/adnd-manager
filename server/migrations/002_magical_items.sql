-- ============================================================
--  Migration 002 — Magical Items tables
--  Run: sudo -u postgres psql adnddb -f server/migrations/002_magical_items.sql
-- ============================================================

-- ── Magical Items library (global, not per-campaign) ────────
CREATE TABLE IF NOT EXISTS magical_items (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,   -- liquid|scroll|ring|rod|staff|wand|book|gem|
                                   -- clothing|boots_gloves|girdle_helm|bag_bottle|
                                   -- dust_stone|household|instrument|weird|humorous|
                                   -- armor|weapon|artifact
  subcategory     TEXT,
  source_page_title TEXT,
  source_url      TEXT,
  description     TEXT,
  powers          TEXT,
  charges         TEXT,            -- e.g. "1d20 charges"
  cursed          BOOLEAN          NOT NULL DEFAULT false,
  alignment       TEXT,            -- alignment restrictions
  classes         TEXT[],          -- class restrictions (NULL = any)
  value_gp        INTEGER,
  rarity          TEXT             CHECK (rarity IN ('common','uncommon','rare','very rare','legendary') OR rarity IS NULL),
  weight          TEXT,
  intelligence    INTEGER,         -- intelligent weapons
  ego             INTEGER,         -- intelligent weapons
  special_purpose TEXT,            -- artifacts
  table_letter    TEXT,            -- A–T (which random determination table)
  table_roll_min  INTEGER,
  table_roll_max  INTEGER,
  import_warnings TEXT[],
  raw_text        TEXT,
  created_at      TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
  UNIQUE (name, category)
);

-- ── Random Determination Tables (AD&D EM / DMG tables A-T) ──
CREATE TABLE IF NOT EXISTS random_item_tables (
  id           SERIAL PRIMARY KEY,
  table_letter TEXT    NOT NULL,         -- 'A' through 'T'
  table_name   TEXT    NOT NULL,         -- e.g. "Magical Liquids"
  dice         TEXT    NOT NULL,         -- e.g. "d20", "d100"
  roll_min     INTEGER NOT NULL,
  roll_max     INTEGER NOT NULL,
  item_name    TEXT    NOT NULL,
  item_id      INTEGER REFERENCES magical_items(id) ON DELETE SET NULL,
  notes        TEXT
);

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mi_name     ON magical_items USING gin(to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_mi_category ON magical_items(category);
CREATE INDEX IF NOT EXISTS idx_mi_table    ON magical_items(table_letter);
CREATE INDEX IF NOT EXISTS idx_mi_rarity   ON magical_items(rarity);
CREATE INDEX IF NOT EXISTS idx_mi_cursed   ON magical_items(cursed) WHERE cursed = true;
CREATE INDEX IF NOT EXISTS idx_rit_letter  ON random_item_tables(table_letter);
CREATE INDEX IF NOT EXISTS idx_rit_item_id ON random_item_tables(item_id);
