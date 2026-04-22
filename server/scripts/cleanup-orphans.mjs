/**
 * cleanup-orphans.mjs
 *
 * One-off, explicit, auditable cleanup of the 5 orphan rows identified
 * by the 2026-04-23 data-integrity audit. Approved-list only — the script
 * does NOT "find orphans and delete them" generically; it targets rows
 * by id so you can't accidentally widen the blast radius by changing
 * a WHERE clause.
 *
 * Modes
 *   (default)          dry-run: print what WOULD happen, no DB writes
 *   --apply --i-have-backups   run for real, inside ONE transaction
 *                              (both flags required together)
 *   --skip-pgdump      only valid with --apply; bypass the pg_dump gate
 *                      (not recommended; exists for re-running after a
 *                      dump already succeeded)
 *
 * Safety protocol (for --apply mode)
 *   1. Refuse unless BOTH --apply AND --i-have-backups are passed
 *   2. Run `pg_dump -Fc` into /var/backups/adnd/pre-cleanup-<ts>.dump
 *      and verify the file is non-empty. Abort on failure.
 *   3. Re-fetch each approved row by id, verify identity (name + join
 *      state) matches the audit sample. Abort if any row looks different.
 *   4. Execute all DELETEs inside a single transaction. ROLLBACK on error.
 *   5. Print a final summary.
 *
 * Usage (on production server, from /var/www/adnd-manager):
 *   DB_HOST=localhost DB_PORT=5432 DB_NAME=adnddb \
 *     DB_USER=adnduser DB_PASSWORD=... \
 *     node server/scripts/cleanup-orphans.mjs                    # dry-run
 *   ... node server/scripts/cleanup-orphans.mjs --apply --i-have-backups
 */

import pg from 'pg';
import { spawn } from 'node:child_process';
import { statSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

const { Pool } = pg;

const APPLY         = process.argv.includes('--apply');
const HAVE_BACKUPS  = process.argv.includes('--i-have-backups');
const SKIP_PGDUMP   = process.argv.includes('--skip-pgdump');

// ── Approved target rows ─────────────────────────────────────────────────────
// Each row has: table, id, an "expect" dict of fields we must see before
// deleting (guards against silent schema drift or id reuse).
const TARGETS = [
  {
    table:  'character_equipment',
    id:     10,
    expect: { name: '-1', magical_item_id: 6915 },
    reason: 'junk row (name "-1") with broken magical_item_id ref',
  },
  {
    table:  'party_equipment',
    id:     2,
    expect: { name: '-1', magical_item_id: 6915 },
    reason: 'junk row (name "-1") with broken magical_item_id ref',
  },
  {
    table:  'party_equipment',
    id:     3,
    expect: { name: 'Aba of Displacement', magical_item_id: 8869 },
    reason: 'broken magical_item_id ref (item was removed from library)',
  },
  {
    table:  'characters',
    id:     1,
    expect: { name: 'Legolas', campaign_id: null },
    reason: 'pre-campaigns-era test character',
  },
  {
    table:  'characters',
    id:     2,
    expect: { name: 'Test 1', campaign_id: null },
    reason: 'pre-campaigns-era test character',
  },
];

// Delete order matters: rows that reference other approved rows must go first.
// character_equipment.source_pool_id → party_equipment(id) is SET NULL, so
// party_equipment can actually be deleted first without a FK block — but
// we delete character_equipment first anyway so the summary reads top-down.
// characters FKs cascade to character_equipment/character_spells — we're
// deleting the char_equipment orphan separately, which is fine either way
// (it's on a DIFFERENT character than the two orphan characters).

// ── Helpers ──────────────────────────────────────────────────────────────────
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnddb',
  user:     process.env.DB_USER     || 'adnduser',
  password: process.env.DB_PASSWORD || '',
});

function die(msg, code = 1) {
  console.error(`\n✗ ${msg}`);
  process.exit(code);
}

function log(msg) { console.log(msg); }

// ── Gate: require both flags for apply mode ──────────────────────────────────
if (APPLY && !HAVE_BACKUPS) {
  die('Refusing to run --apply without --i-have-backups flag.');
}

// ── pg_dump gate (apply mode only, unless --skip-pgdump) ─────────────────────
async function runPgDump() {
  const BACKUP_DIR = '/var/backups/adnd';
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const path = `${BACKUP_DIR}/pre-cleanup-${ts}.dump`;

  try { mkdirSync(BACKUP_DIR, { recursive: true }); }
  catch (e) { die(`Cannot access ${BACKUP_DIR}: ${e.message}`); }

  log(`\n→ Running pg_dump → ${path}`);

  return new Promise((resolve, reject) => {
    const args = [
      '-Fc',
      '-h', process.env.DB_HOST || 'localhost',
      '-p', process.env.DB_PORT || '5432',
      '-U', process.env.DB_USER || 'adnduser',
      '-d', process.env.DB_NAME || 'adnddb',
      '-f', path,
    ];
    const proc = spawn('pg_dump', args, {
      env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' },
    });

    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(`pg_dump exit ${code}: ${stderr}`));
      try {
        const size = statSync(path).size;
        if (size < 1024) {
          return reject(new Error(`pg_dump output suspiciously small (${size} bytes)`));
        }
        log(`  ✓ backup OK (${Math.round(size / 1024)} KB)`);
        resolve(path);
      } catch (e) {
        reject(e);
      }
    });
  });
}

// ── Verify each target row still matches what we audited ─────────────────────
async function verifyTargets(client) {
  log(`\n→ Verifying ${TARGETS.length} target row(s) still match audit state…`);
  for (const t of TARGETS) {
    const { rows } = await client.query(
      `SELECT * FROM ${t.table} WHERE id=$1`,
      [t.id],
    );
    if (!rows.length) {
      log(`  · ${t.table}#${t.id} — already absent (skipping)`);
      t._missing = true;
      continue;
    }
    const row = rows[0];
    for (const [k, v] of Object.entries(t.expect)) {
      if (row[k] !== v && !(row[k] == null && v == null)) {
        die(`${t.table}#${t.id}: expected ${k}=${JSON.stringify(v)}, `
          + `found ${JSON.stringify(row[k])}. Aborting.`);
      }
    }
    log(`  ✓ ${t.table}#${t.id} "${row.name}" — matches audit`);
  }
}

// ── Perform the deletes ──────────────────────────────────────────────────────
async function performDeletes(client) {
  log(`\n→ ${APPLY ? 'DELETING' : 'Would delete'}:`);
  const results = [];
  for (const t of TARGETS) {
    if (t._missing) { results.push({ ...t, deleted: 0 }); continue; }
    if (APPLY) {
      const res = await client.query(
        `DELETE FROM ${t.table} WHERE id=$1`,
        [t.id],
      );
      results.push({ ...t, deleted: res.rowCount });
      log(`  ✎ ${t.table}#${t.id} — DELETED (${t.reason})`);
    } else {
      results.push({ ...t, deleted: 1 });
      log(`  ✎ ${t.table}#${t.id} — would delete (${t.reason})`);
    }
  }
  return results;
}

// ── Main ─────────────────────────────────────────────────────────────────────
const client = await pool.connect();
try {
  log(`\n═══════════════════════════════════════════════════════════`);
  log(`  Orphan cleanup (${APPLY ? 'APPLY' : 'DRY-RUN'})`);
  log(`═══════════════════════════════════════════════════════════`);

  if (APPLY && !SKIP_PGDUMP) {
    await runPgDump();
  } else if (APPLY && SKIP_PGDUMP) {
    log(`\n⚠ --skip-pgdump passed; not running pg_dump. You already have one, right?`);
  }

  await client.query('BEGIN');
  await verifyTargets(client);
  const results = await performDeletes(client);

  if (APPLY) {
    await client.query('COMMIT');
    log(`\n✓ COMMITTED.`);
  } else {
    await client.query('ROLLBACK');
    log(`\nDry-run complete. Re-run with --apply --i-have-backups to commit.`);
  }

  // Summary
  log(`\n──────────────────────────────────────────────`);
  const byTable = new Map();
  for (const r of results) {
    const n = byTable.get(r.table) || 0;
    byTable.set(r.table, n + (r.deleted > 0 ? 1 : 0));
  }
  const totalHit = results.filter(r => r.deleted > 0).length;
  log(`${APPLY ? 'Deleted' : 'Would delete'}: ${totalHit}/${TARGETS.length} row(s)`);
  for (const [tbl, n] of byTable) log(`  ${tbl}: ${n}`);
  const skipped = results.filter(r => r._missing).length;
  if (skipped) log(`Already absent: ${skipped}`);
} catch (e) {
  try { await client.query('ROLLBACK'); } catch {}
  die(`Cleanup failed: ${e.message}`);
} finally {
  client.release();
  await pool.end();
}
