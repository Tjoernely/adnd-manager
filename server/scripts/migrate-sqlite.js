#!/usr/bin/env node
/**
 * migrate-sqlite.js
 * ────────────────────────────────────────────────────────────────────────────
 * One-time migration: reads existing SQLite data and upserts it into
 * the new PostgreSQL database.
 *
 * Migrates:
 *   • users          (id, email, username, password_hash, role, created_at)
 *   • campaigns      (id, name, dm_user_id, description, settings, created_at, updated_at)
 *   • campaign_members
 *   • characters     (id, campaign_id, player_user_id, name, character_data, created_at, updated_at)
 *
 * Skips tables that don't exist in the old SQLite DB (npcs, spells, etc.
 * are new and will be empty in PostgreSQL after migration).
 *
 * Usage:
 *   node scripts/migrate-sqlite.js [path/to/old.db]
 *
 * Default SQLite path: ../data/app.db  (relative to scripts/)
 *
 * Prerequisites:
 *   npm install better-sqlite3   (temp install for migration only)
 *   PostgreSQL running with schema already applied (node migrate.js)
 * ────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config({ path: `${__dirname}/../.env` });

const path   = require('path');
const fs     = require('fs');
const db     = require('../db'); // PostgreSQL pool

// ── SQLite path ───────────────────────────────────────────────────────────────
const SQLITE_PATH = process.argv[2]
  ?? path.join(__dirname, '..', '..', 'data', 'app.db');

if (!fs.existsSync(SQLITE_PATH)) {
  console.error(`SQLite file not found: ${SQLITE_PATH}`);
  console.error('Usage: node scripts/migrate-sqlite.js [path/to/old.db]');
  process.exit(1);
}

let sqlite3;
try {
  sqlite3 = require('better-sqlite3');
} catch {
  console.error('better-sqlite3 not installed. Run: npm install better-sqlite3');
  process.exit(1);
}

const sqlite = sqlite3(SQLITE_PATH, { readonly: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
function tableExists(tableName) {
  const row = sqlite.prepare(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
  ).get(tableName);
  return !!row;
}

function safeJSON(val) {
  if (val == null) return '{}';
  if (typeof val === 'object') return JSON.stringify(val);
  try { JSON.parse(val); return val; } catch { return '{}'; }
}

// ── Migrate users ─────────────────────────────────────────────────────────────
async function migrateUsers() {
  if (!tableExists('users')) { console.log('  ⚠ users table not found in SQLite, skipping.'); return 0; }
  const rows = sqlite.prepare('SELECT * FROM users').all();
  let count = 0;
  for (const r of rows) {
    await db.query(
      `INSERT INTO users (id, email, username, password_hash, role, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (email) DO UPDATE SET
         username      = EXCLUDED.username,
         password_hash = EXCLUDED.password_hash,
         role          = EXCLUDED.role`,
      [
        r.id,
        r.email?.toLowerCase().trim(),
        r.username ?? r.email?.split('@')[0] ?? 'user',
        r.password_hash,
        r.role ?? 'player',
        r.created_at ? new Date(r.created_at) : new Date(),
      ],
    );
    count++;
  }
  // Reset sequence so new inserts don't collide
  await db.query(`SELECT setval('users_id_seq', (SELECT MAX(id) FROM users))`);
  return count;
}

// ── Migrate campaigns ─────────────────────────────────────────────────────────
async function migrateCampaigns() {
  if (!tableExists('campaigns')) { console.log('  ⚠ campaigns table not found in SQLite, skipping.'); return 0; }
  const rows = sqlite.prepare('SELECT * FROM campaigns').all();
  let count = 0;
  for (const r of rows) {
    await db.query(
      `INSERT INTO campaigns (id, name, dm_user_id, description, settings, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         name        = EXCLUDED.name,
         description = EXCLUDED.description,
         settings    = EXCLUDED.settings,
         updated_at  = EXCLUDED.updated_at`,
      [
        r.id, r.name, r.dm_user_id,
        r.description ?? '',
        safeJSON(r.settings),
        r.created_at ? new Date(r.created_at) : new Date(),
        r.updated_at ? new Date(r.updated_at) : new Date(),
      ],
    );
    count++;
  }
  await db.query(`SELECT setval('campaigns_id_seq', (SELECT MAX(id) FROM campaigns))`);
  return count;
}

// ── Migrate campaign_members ──────────────────────────────────────────────────
async function migrateCampaignMembers() {
  if (!tableExists('campaign_members')) { console.log('  ⚠ campaign_members table not found in SQLite, skipping.'); return 0; }
  const rows = sqlite.prepare('SELECT * FROM campaign_members').all();
  let count = 0;
  for (const r of rows) {
    await db.query(
      `INSERT INTO campaign_members (campaign_id, user_id, role, joined_at)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (campaign_id, user_id) DO NOTHING`,
      [r.campaign_id, r.user_id, r.role ?? 'player', r.joined_at ? new Date(r.joined_at) : new Date()],
    );
    count++;
  }
  return count;
}

// ── Migrate characters ────────────────────────────────────────────────────────
async function migrateCharacters() {
  if (!tableExists('characters')) { console.log('  ⚠ characters table not found in SQLite, skipping.'); return 0; }
  const rows = sqlite.prepare('SELECT * FROM characters').all();
  let count = 0;
  for (const r of rows) {
    // Derive name from character_data if denorm column missing
    let charName = r.name ?? null;
    if (!charName) {
      try {
        const data = JSON.parse(r.character_data ?? '{}');
        charName = data.charName ?? data.name ?? null;
      } catch { /* keep null */ }
    }

    await db.query(
      `INSERT INTO characters (id, campaign_id, player_user_id, name, character_data, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         campaign_id    = EXCLUDED.campaign_id,
         name           = EXCLUDED.name,
         character_data = EXCLUDED.character_data,
         updated_at     = EXCLUDED.updated_at`,
      [
        r.id, r.campaign_id ?? null, r.player_user_id ?? r.user_id,
        charName,
        safeJSON(r.character_data),
        r.created_at ? new Date(r.created_at) : new Date(),
        r.updated_at ? new Date(r.updated_at) : new Date(),
      ],
    );
    count++;
  }
  await db.query(`SELECT setval('characters_id_seq', (SELECT MAX(id) FROM characters))`);
  return count;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n🗄 Migrating SQLite → PostgreSQL`);
  console.log(`   Source: ${SQLITE_PATH}\n`);

  const steps = [
    ['users',            migrateUsers],
    ['campaigns',        migrateCampaigns],
    ['campaign_members', migrateCampaignMembers],
    ['characters',       migrateCharacters],
  ];

  for (const [label, fn] of steps) {
    process.stdout.write(`  Migrating ${label} … `);
    const n = await fn();
    console.log(`${n} rows`);
  }

  await db.pool.end();
  sqlite.close();
  console.log('\n✅ Migration complete.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
