/**
 * promote-em-items.mjs
 *
 * Promotes parsed EM magical items from the staging table
 * (magical_items_em_import) into the live magical_items table.
 *
 * Safety steps (in order):
 *   1. Create a timestamped backup of the current magical_items table.
 *   2. Add new typed columns to magical_items if they don't exist yet.
 *   3. Upsert all staging rows into magical_items.
 *
 * Defaults to --dry-run (prints what would happen, writes nothing).
 * Pass --promote to actually write.
 *
 * Usage:
 *   node scripts/promote-em-items.mjs             # dry-run, preview first 20
 *   node scripts/promote-em-items.mjs --promote   # backup + promote for real
 */

import pg                from 'pg';
import { fileURLToPath } from 'url';
import path              from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool }  = pg;

const doPromote = process.argv.includes('--promote');

console.log('─'.repeat(64));
console.log('  promote-em-items.mjs');
console.log(`  Mode : ${doPromote ? '⚠  PROMOTE (writes to magical_items)' : 'dry-run (no writes)'}`);
console.log('─'.repeat(64));

// ── DB pool ────────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD || '',
});

// ── Helpers ────────────────────────────────────────────────────────────────────
function today() {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();

  try {
    // ── 1. Count staging rows ─────────────────────────────────────────────────
    const { rows: [{ cnt: stagingCount }] } = await client.query(
      `SELECT COUNT(*) AS cnt FROM magical_items_em_import`
    );
    console.log(`\n  Staging rows : ${stagingCount}`);

    // ── 2. Count existing live rows ───────────────────────────────────────────
    let liveCount = 0;
    try {
      const { rows: [{ cnt }] } = await client.query(
        `SELECT COUNT(*) AS cnt FROM magical_items`
      );
      liveCount = parseInt(cnt, 10);
    } catch {
      liveCount = 0;
    }
    console.log(`  Live rows    : ${liveCount}`);

    // ── 3. Preview first 5 staging rows ──────────────────────────────────────
    const { rows: preview } = await client.query(`
      SELECT table_code, roll_min, roll_max,
             COALESCE(category, '') AS category,
             name, item_type, equip_slot
      FROM   magical_items_em_import
      ORDER  BY table_code, roll_min
      LIMIT  5
    `);
    console.log('\n  Preview (first 5 staging rows):');
    for (const r of preview) {
      console.log(`    [${r.table_code}] ${String(r.roll_min).padStart(4)}-${String(r.roll_max).padEnd(4)}  ${r.name.slice(0, 40).padEnd(40)}  ${r.item_type || '?'}`);
    }

    if (!doPromote) {
      console.log('\n  Dry-run — no changes made.');
      console.log('  Run with --promote to back up + promote.\n');
      return;
    }

    // ═════════════════════════════════════════════════════════════════════════
    //  PROMOTE MODE
    // ═════════════════════════════════════════════════════════════════════════

    // ── Step 1: Backup (outside transaction — CREATE TABLE AS is DDL) ─────────
    const backupTable = `magical_items_backup_${today()}`;
    console.log(`\n  Step 1 — Creating backup: ${backupTable} …`);
    await client.query(`DROP TABLE IF EXISTS ${backupTable}`);
    await client.query(`CREATE TABLE ${backupTable} AS SELECT * FROM magical_items`);
    const { rows: [{ cnt: backupCount }] } = await client.query(
      `SELECT COUNT(*) AS cnt FROM ${backupTable}`
    );
    console.log(`  ✓ Backed up ${backupCount} rows`);

    // ── Step 2: Add new typed columns (DDL — outside transaction) ────────────
    // ALTER TABLE requires table ownership.  If adnduser is not the owner,
    // run this manually first as the postgres superuser:
    //   sudo -u postgres psql adnddb -c "ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS item_type VARCHAR(50); ..."
    // Failures here are logged as warnings and do NOT abort the upsert.
    console.log('\n  Step 2 — Ensuring new columns exist on magical_items …');
    const newCols = [
      ['item_type',       'VARCHAR(50)'],
      ['equip_slot',      'VARCHAR(50)'],
      ['weapon_family',   'VARCHAR(50)'],
      ['hands_required',  'INTEGER'],
      ['ammo_type',       'VARCHAR(50)'],
      ['inventory_group', 'VARCHAR(50)'],
    ];
    let missingCols = [];
    for (const [col, type] of newCols) {
      try {
        await client.query(
          `ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS ${col} ${type}`
        );
        console.log(`    + ${col}`);
      } catch (e) {
        console.warn(`    ! Could not add ${col}: ${e.message}`);
        missingCols.push(col);
      }
    }

    // ── Guard: abort if typed columns are missing ─────────────────────────────
    if (missingCols.length > 0) {
      console.error(`\n  ✗ Cannot promote: ${missingCols.length} column(s) missing from magical_items.`);
      console.error('  Add them as the postgres superuser, then re-run:\n');
      const alterStmts = missingCols.map(c => {
        const type = newCols.find(([n]) => n === c)?.[1] ?? 'TEXT';
        return `    ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS ${c} ${type};`;
      }).join('\n');
      console.error(`  sudo -u postgres psql adnddb <<'SQL'\n${alterStmts}\n  SQL\n`);
      process.exit(1);
    }

    // ── Step 3: Upsert staging → magical_items (in a transaction) ────────────
    // Conflict target: UNIQUE (name, category) on magical_items.
    // staging.category may be NULL; live column is NOT NULL — use COALESCE.
    console.log('\n  Step 3 — Upserting staging rows into magical_items …');
    await client.query('BEGIN');

    const upsertSql = `
      INSERT INTO magical_items (
        name,
        category,
        source_page_title,
        source_url,
        description,
        table_letter,
        table_roll_min,
        table_roll_max,
        roll_min,
        roll_max,
        raw_text,
        import_warnings,
        item_type,
        equip_slot,
        weapon_family,
        hands_required,
        ammo_type,
        inventory_group
      )
      SELECT
        s.name,
        COALESCE(s.category, ''),
        s.description_title,
        s.source_url,
        s.description,
        s.table_code,
        s.roll_min,
        s.roll_max,
        s.roll_min,
        s.roll_max,
        s.raw_name,
        CASE WHEN s.import_warnings IS NOT NULL AND s.import_warnings <> ''
             THEN ARRAY[s.import_warnings]
             ELSE NULL
        END,
        s.item_type,
        s.equip_slot,
        s.weapon_family,
        s.hands_required,
        s.ammo_type,
        s.inventory_group
      FROM magical_items_em_import s
      ON CONFLICT (name, category) DO UPDATE SET
        source_page_title = EXCLUDED.source_page_title,
        source_url        = EXCLUDED.source_url,
        description       = EXCLUDED.description,
        table_letter      = EXCLUDED.table_letter,
        table_roll_min    = EXCLUDED.table_roll_min,
        table_roll_max    = EXCLUDED.table_roll_max,
        roll_min          = EXCLUDED.roll_min,
        roll_max          = EXCLUDED.roll_max,
        raw_text          = EXCLUDED.raw_text,
        import_warnings   = EXCLUDED.import_warnings,
        item_type         = EXCLUDED.item_type,
        equip_slot        = EXCLUDED.equip_slot,
        weapon_family     = EXCLUDED.weapon_family,
        hands_required    = EXCLUDED.hands_required,
        ammo_type         = EXCLUDED.ammo_type,
        inventory_group   = EXCLUDED.inventory_group
    `;

    await client.query(upsertSql);

    // ── Final count ───────────────────────────────────────────────────────────
    const { rows: [{ cnt: newLiveCount }] } = await client.query(
      `SELECT COUNT(*) AS cnt FROM magical_items`
    );

    await client.query('COMMIT');

    console.log(`\n  ✓ Done.`);
    console.log(`  magical_items before : ${liveCount}`);
    console.log(`  magical_items after  : ${newLiveCount}`);
    console.log(`  Net change           : +${newLiveCount - liveCount}`);
    console.log(`  Backup table         : ${backupTable}\n`);

  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(`\n  ✗ Fatal: ${err.message}`);
    console.error('  Transaction rolled back — magical_items unchanged.\n');
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
