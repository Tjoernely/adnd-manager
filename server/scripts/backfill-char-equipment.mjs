/**
 * backfill-char-equipment.mjs
 *
 * One-off: re-enrich existing character_equipment rows that were assigned
 * before POST /api/party-equipment/:id/assign started calling parseMagicItem.
 *
 * Targets ONLY rows where:
 *   - magical_item_id IS NOT NULL
 *   - at least one enrichable column is NULL/zero
 *     (slot, weapon_type, damage_s_m, magic_bonus)
 *
 * Rules:
 *   - Dry-run by default (prints intended changes, commits nothing).
 *     Pass --apply to actually run UPDATE statements.
 *   - Never overwrites a non-null/non-zero existing value.
 *   - Runs in a single transaction so --apply is atomic.
 *
 * Usage:
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \
 *     DB_USER=adnduser DB_PASSWORD=... \
 *     node server/scripts/backfill-char-equipment.mjs          # dry-run
 *   ... node server/scripts/backfill-char-equipment.mjs --apply # commit
 */

import pg from 'pg';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { enrichMagicItem } = require('../lib/magicItemParser/enrichForAssign');

const { Pool } = pg;

const APPLY = process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD || '',
});

const client = await pool.connect();

// Columns we can backfill. For each, define a predicate saying "is currently
// empty" (so we only fill, never overwrite).
const BACKFILL_COLS = [
  { col: 'slot',          empty: v => v == null },
  { col: 'weapon_type',   empty: v => v == null },
  { col: 'damage_s_m',    empty: v => v == null },
  { col: 'damage_l',      empty: v => v == null },
  { col: 'range_str',     empty: v => v == null },
  { col: 'armor_ac',      empty: v => v == null },
  { col: 'magic_bonus',   empty: v => v == null || v === 0 },
  { col: 'is_cursed',     empty: v => v === false || v == null },
  { col: 'is_two_handed', empty: v => v === false || v == null },
  { col: 'speed_factor',  empty: v => v == null },
  // notes only filled if empty/null — DM edits are preserved
  { col: 'notes',         empty: v => v == null || v === '' },
];

try {
  await client.query('BEGIN');

  // Find candidates
  const { rows: candidates } = await client.query(`
    SELECT *
    FROM character_equipment
    WHERE magical_item_id IS NOT NULL
      AND (
        slot IS NULL
        OR weapon_type IS NULL
        OR damage_s_m IS NULL
        OR magic_bonus IS NULL
        OR magic_bonus = 0
      )
    ORDER BY id
  `);

  console.log(`\nBackfill candidates: ${candidates.length} row(s)`);
  console.log(`Mode: ${APPLY ? 'APPLY (will commit)' : 'DRY-RUN (no writes)'}\n`);

  let changed = 0;
  let unchanged = 0;
  let failed = 0;
  const typeTally = new Map();

  for (const row of candidates) {
    // Fetch magical_items row
    const { rows: miRows } = await client.query(
      'SELECT * FROM magical_items WHERE id=$1',
      [row.magical_item_id],
    );
    if (!miRows.length) {
      failed++;
      if (VERBOSE) console.log(`  ✗ id=${row.id} ${row.name} — magical_items row missing`);
      continue;
    }

    let enriched;
    try {
      enriched = await enrichMagicItem(miRows[0], client);
    } catch (e) {
      failed++;
      console.log(`  ✗ id=${row.id} ${row.name} — enrich failed: ${e.message}`);
      continue;
    }

    // Build SET clause: only fill currently-empty cells
    const sets = [];
    const vals = [];
    const diffs = [];
    let p = 1;
    for (const { col, empty } of BACKFILL_COLS) {
      const current = row[col];
      const next    = enriched[col];
      if (next == null) continue;             // parser had nothing to offer
      if (!empty(current)) continue;          // already populated, leave alone
      if (current === next) continue;         // identical, skip
      sets.push(`${col}=$${p++}`);
      vals.push(next);
      diffs.push(`${col}: ${JSON.stringify(current)} → ${JSON.stringify(next)}`);
    }

    if (!sets.length) {
      unchanged++;
      if (VERBOSE) console.log(`  · id=${row.id} ${row.name} — nothing to fill`);
      continue;
    }

    changed++;
    typeTally.set(row.item_type, (typeTally.get(row.item_type) || 0) + 1);

    console.log(`  ✎ id=${row.id} ${row.name} (item_type=${row.item_type})`);
    for (const d of diffs) console.log(`      ${d}`);

    if (APPLY) {
      sets.push(`updated_at=NOW()`);
      vals.push(row.id);
      await client.query(
        `UPDATE character_equipment SET ${sets.join(', ')} WHERE id=$${p}`,
        vals,
      );
    }
  }

  console.log(`\n──────────────────────────────────────────────`);
  console.log(`Candidates: ${candidates.length}`);
  console.log(`  Would change: ${changed}`);
  console.log(`  No-op:        ${unchanged}`);
  console.log(`  Failed:       ${failed}`);
  if (typeTally.size) {
    console.log(`By item_type:`);
    for (const [t, n] of typeTally) console.log(`  ${t}: ${n}`);
  }

  if (APPLY) {
    await client.query('COMMIT');
    console.log(`\n✓ COMMITTED.`);
  } else {
    await client.query('ROLLBACK');
    console.log(`\nDry-run complete. Re-run with --apply to commit.`);
  }
} catch (e) {
  await client.query('ROLLBACK').catch(() => {});
  console.error('Backfill error:', e.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
