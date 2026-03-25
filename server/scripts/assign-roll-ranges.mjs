/**
 * assign-roll-ranges.mjs
 *
 * Divides 1–1000 evenly among all items in each table letter (A–T),
 * ordered by id (import order). Updates magical_items.roll_min / roll_max.
 *
 * Run on server after deploy:
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \
 *   DB_USER=adnduser DB_PASSWORD=ADTjoernely53 \
 *   node server/scripts/assign-roll-ranges.mjs
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD || '',
});

const TABLES = 'ABCDEFGHIJKLMNOPQRST'.split('');

// Ensure columns exist — requires table ownership (postgres user).
// If adnduser lacks ALTER TABLE rights, run this manually first:
//   sudo -u postgres psql adnddb -c "ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_min INTEGER; ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_max INTEGER;"
try {
  await pool.query(`ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_min INTEGER`);
  await pool.query(`ALTER TABLE magical_items ADD COLUMN IF NOT EXISTS roll_max INTEGER`);
  console.log('Columns roll_min / roll_max ensured.\n');
} catch (e) {
  if (e.code === '42501') {
    console.log('No ALTER TABLE permission — assuming columns already exist, continuing…\n');
  } else {
    throw e;
  }
}

let totalUpdated = 0;

for (const letter of TABLES) {
  const { rows } = await pool.query(
    `SELECT id FROM magical_items WHERE UPPER(table_letter) = $1 ORDER BY id ASC`,
    [letter],
  );

  const n = rows.length;
  if (n === 0) {
    console.log(`  Table ${letter}: no items — skipped`);
    continue;
  }

  for (let i = 0; i < n; i++) {
    const roll_min = Math.round(i * 1000 / n) + 1;
    const roll_max = i === n - 1 ? 1000 : Math.round((i + 1) * 1000 / n);
    await pool.query(
      `UPDATE magical_items SET roll_min = $1, roll_max = $2 WHERE id = $3`,
      [roll_min, roll_max, rows[i].id],
    );
  }

  totalUpdated += n;
  // Show range for first and last item as a sanity check
  const first = Math.round(0 * 1000 / n) + 1;
  const last  = 1000;
  console.log(`  Table ${letter}: ${n} items → ${String(first).padStart(4)} – ${last}`);
}

await pool.end();
console.log(`\nDone — ${totalUpdated} items updated across ${TABLES.length} tables.`);
