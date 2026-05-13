-- Migration: monsters.tags  text[] → jsonb
--
-- This DB started with `tags TEXT[]` (added earlier, all rows NULL).
-- The v5 classifier and monster-tags route both expect jsonb so we can
-- use jsonb operators: tags @> '["undead"]'::jsonb,
-- jsonb_array_elements_text(tags), etc.
--
-- Original shipped form `USING tags::jsonb` assumed text — it fails on text[].
-- to_jsonb(tags) converts a text array cleanly to a jsonb array.
--
-- Idempotent: skips the type change if the column is already jsonb.
-- Safe: wrapped in a transaction.

BEGIN;

DO $$
BEGIN
  IF (SELECT data_type FROM information_schema.columns
        WHERE table_name = 'monsters' AND column_name = 'tags') <> 'jsonb' THEN
    EXECUTE $sql$
      ALTER TABLE monsters
        ALTER COLUMN tags TYPE jsonb
        USING CASE
          WHEN tags IS NULL THEN NULL
          WHEN cardinality(tags) = 0 THEN NULL
          ELSE to_jsonb(tags)
        END
    $sql$;
    RAISE NOTICE 'monsters.tags converted to jsonb';
  ELSE
    RAISE NOTICE 'monsters.tags already jsonb — skipping conversion';
  END IF;
END $$;

-- GIN index speeds up containment queries (tags @> '["undead"]').
CREATE INDEX IF NOT EXISTS idx_monsters_tags_gin ON monsters USING GIN (tags);

COMMIT;

-- Verify with:
--   SELECT data_type FROM information_schema.columns
--    WHERE table_name = 'monsters' AND column_name = 'tags';
--   -- expect: jsonb
