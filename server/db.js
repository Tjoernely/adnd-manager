/**
 * PostgreSQL connection pool.
 * Replaces the old better-sqlite3 synchronous DB.
 */

// Load server/.env first so DB_PASSWORD is always available,
// regardless of import order or PM2 env injection timing.
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const { Pool } = require('pg');

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
  max:      20,
  idleTimeoutMillis:       30_000,
  connectionTimeoutMillis:  5_000,
});

pool.on('error', (err) => {
  console.error('[db] Unexpected pool error:', err.message);
});

const db = {
  /** Run any SQL, return full QueryResult */
  query: (text, params) => pool.query(text, params),

  /** Return the first row or null */
  async one(text, params) {
    const { rows } = await pool.query(text, params);
    return rows[0] ?? null;
  },

  /** Return all rows */
  async all(text, params) {
    const { rows } = await pool.query(text, params);
    return rows;
  },

  pool,
};

module.exports = db;
