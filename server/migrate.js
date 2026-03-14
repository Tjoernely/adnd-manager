/**
 * Run schema.sql against the PostgreSQL database.
 * Usage: node migrate.js
 * Safe to run multiple times (all CREATE statements use IF NOT EXISTS).
 */
require('dotenv').config({ path: `${__dirname}/.env` });

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  console.log('[migrate] Running schema.sql …');
  try {
    await db.query(sql);
    console.log('[migrate] Done.');
  } catch (err) {
    console.error('[migrate] Error:', err.message);
    process.exit(1);
  } finally {
    await db.pool.end();
  }
}

migrate();
