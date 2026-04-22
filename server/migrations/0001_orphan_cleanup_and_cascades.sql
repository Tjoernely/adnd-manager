-- ────────────────────────────────────────────────────────────────────────────
-- 0001_orphan_cleanup_and_cascades.sql
--
-- First migration file (separate from server/auto-migrate.js). Hand-applied
-- via psql AFTER server/scripts/cleanup-orphans.mjs --apply has removed the
-- 5 approved orphan rows. Idempotent — safe to re-run.
--
-- Per the 2026-04-23 data-integrity audit + user decisions:
--
--   • monsters.campaign_id   NO ACTION  → CASCADE
--   • invites.created_by     NOT NULL   → nullable, FK NO ACTION → SET NULL
--   • invites.used_by        FK NO ACTION → SET NULL
--   • party_inventory.awarded_to_character_id  (no FK) → FK SET NULL
--   • Add indexes on FK columns that are missing one
--
-- Not touched (per user approval scope):
--   • characters.campaign_id stays SET NULL (deliberate — see Unassigned
--     Characters UI)
--   • character_equipment/party_equipment/party_inventory .magical_item_id
--     stays unconstrained — magical_items library is a fluid reference set
--   • party_equipment.source_encounter_id stays unconstrained — deferred
--
-- Apply with:
--   sudo -u postgres psql adnddb -f server/migrations/0001_orphan_cleanup_and_cascades.sql
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Precondition check: cleanup must have run first.
-- The migration will ABORT if any approved orphan rows are still present,
-- so this file and cleanup-orphans.mjs can't be run out of order.
DO $$
DECLARE
  orphan_count INT;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM (
    SELECT 1 FROM characters WHERE id IN (1, 2) AND campaign_id IS NULL
    UNION ALL
    SELECT 1 FROM party_equipment WHERE id IN (2, 3)
    UNION ALL
    SELECT 1 FROM character_equipment WHERE id = 10
  ) x;
  IF orphan_count > 0 THEN
    RAISE EXCEPTION 'Approved orphan rows still present (% left). '
      'Run server/scripts/cleanup-orphans.mjs --apply --i-have-backups first.',
      orphan_count;
  END IF;
END $$;

-- ── monsters.campaign_id: NO ACTION → CASCADE ───────────────────────────────
ALTER TABLE monsters
  DROP CONSTRAINT IF EXISTS monsters_campaign_id_fkey;
ALTER TABLE monsters
  ADD CONSTRAINT monsters_campaign_id_fkey
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE;

-- ── invites.created_by: NOT NULL → nullable, NO ACTION → SET NULL ───────────
ALTER TABLE invites
  ALTER COLUMN created_by DROP NOT NULL;
ALTER TABLE invites
  DROP CONSTRAINT IF EXISTS invites_created_by_fkey;
ALTER TABLE invites
  ADD CONSTRAINT invites_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── invites.used_by: NO ACTION → SET NULL ───────────────────────────────────
ALTER TABLE invites
  DROP CONSTRAINT IF EXISTS invites_used_by_fkey;
ALTER TABLE invites
  ADD CONSTRAINT invites_used_by_fkey
  FOREIGN KEY (used_by) REFERENCES users(id) ON DELETE SET NULL;

-- ── party_inventory.awarded_to_character_id: add FK with SET NULL ───────────
-- Column already nullable; no constraint currently exists.
ALTER TABLE party_inventory
  DROP CONSTRAINT IF EXISTS party_inventory_awarded_to_character_id_fkey;
ALTER TABLE party_inventory
  ADD CONSTRAINT party_inventory_awarded_to_character_id_fkey
  FOREIGN KEY (awarded_to_character_id) REFERENCES characters(id) ON DELETE SET NULL;

-- ── Missing indexes on FK-like columns (CREATE INDEX IF NOT EXISTS) ─────────
-- Creating these is cheap on the current dataset and speeds up every
-- "all X belonging to campaign Y" query, which is most of the app.
CREATE INDEX IF NOT EXISTS idx_char_equip_character
  ON character_equipment (character_id);
CREATE INDEX IF NOT EXISTS idx_char_equip_campaign
  ON character_equipment (campaign_id);
CREATE INDEX IF NOT EXISTS idx_char_spells_character
  ON character_spells (character_id);
CREATE INDEX IF NOT EXISTS idx_char_spells_campaign
  ON character_spells (campaign_id);
CREATE INDEX IF NOT EXISTS idx_enc_creat_encounter
  ON encounter_creatures (encounter_id);
CREATE INDEX IF NOT EXISTS idx_party_equip_campaign
  ON party_equipment (campaign_id);
CREATE INDEX IF NOT EXISTS idx_party_inv_campaign
  ON party_inventory (campaign_id);
CREATE INDEX IF NOT EXISTS idx_party_inv_awarded_to
  ON party_inventory (awarded_to_character_id);
CREATE INDEX IF NOT EXISTS idx_saved_enc_campaign
  ON saved_encounters (campaign_id);
CREATE INDEX IF NOT EXISTS idx_invites_campaign
  ON invites (campaign_id);

COMMIT;

-- ── Verification (non-transactional, run after COMMIT) ──────────────────────
-- These queries should be inspected visually; none will fail the migration.
\echo
\echo '== FK delete-rule verification =='
SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE contype = 'f'
  AND conrelid::regclass::text IN (
    'monsters', 'invites', 'party_inventory'
  )
ORDER BY tbl, conname;
\echo
\echo '== New indexes =='
SELECT indexname
FROM pg_indexes
WHERE schemaname='public'
  AND indexname LIKE 'idx_%'
  AND indexname IN (
    'idx_char_equip_character', 'idx_char_equip_campaign',
    'idx_char_spells_character', 'idx_char_spells_campaign',
    'idx_enc_creat_encounter', 'idx_party_equip_campaign',
    'idx_party_inv_campaign', 'idx_party_inv_awarded_to',
    'idx_saved_enc_campaign', 'idx_invites_campaign'
  )
ORDER BY indexname;
