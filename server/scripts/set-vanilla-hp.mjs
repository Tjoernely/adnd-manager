/**
 * set-vanilla-hp.mjs
 *
 * For every monster where hit_points IS NULL, computes average HP from the
 * hit_dice string and writes it back to the DB.
 *
 * Formula (AD&D 2E d8 average = 4.5):
 *   "N+B"  → Math.round(N * 4.5 + B)
 *   "N-B"  → Math.round(N * 4.5 - B)
 *   "N"    → Math.round(N * 4.5)
 *   "NdX"  → Math.round(N * 4.5)    (ignore die size, use 4.5)
 *   "N/D"  → Math.round((N/D) * 4.5)
 *   minimum 1
 *
 * Usage (run from project root or server/):
 *   node server/scripts/set-vanilla-hp.mjs
 *   node server/scripts/set-vanilla-hp.mjs --dry-run
 *   node server/scripts/set-vanilla-hp.mjs --name "Goblin"
 *
 * Env vars (mirrors db.js):
 *   DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const require    = createRequire(import.meta.url);

// Load .env from server/
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '..', '.env') });
} catch (_) {}

// ── CLI flags ────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const nameArg = args.find(a => a.startsWith('--name='))?.slice(7)
             ?? (args.includes('--name') ? args[args.indexOf('--name') + 1] : null);

// ── DB connection ─────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'dnd_manager',
  user:     process.env.DB_USER     || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl:      process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

// ── Hit-dice parser ───────────────────────────────────────────────────────────
/**
 * Parse an AD&D hit-dice string to { base, bonus }.
 * base = number of dice (fractional OK), bonus = signed integer modifier.
 */
function parseHitDice(hdStr) {
  if (!hdStr) return { base: 1, bonus: 0 };
  const s = String(hdStr).trim().toLowerCase();

  // "NdX" or "NdX+B" / "NdX-B"
  const dMatch = s.match(/^(\d+(?:\.\d+)?)d\d+([+-]\d+)?$/);
  if (dMatch) {
    return {
      base:  parseFloat(dMatch[1]),
      bonus: dMatch[2] ? parseInt(dMatch[2]) : 0,
    };
  }

  // "N/D" fraction (e.g. "1/2")
  const fracMatch = s.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) {
    return { base: parseInt(fracMatch[1]) / parseInt(fracMatch[2]), bonus: 0 };
  }

  // "N+B" or "N-B"
  const bonusMatch = s.match(/^(\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
  if (bonusMatch) {
    const base  = parseFloat(bonusMatch[1]);
    const bonus = parseFloat(bonusMatch[3]) * (bonusMatch[2] === '+' ? 1 : -1);
    return { base, bonus };
  }

  // Plain "N"
  const plain = parseFloat(s);
  return { base: isNaN(plain) ? 1 : plain, bonus: 0 };
}

function averageHp(hdStr) {
  const { base, bonus } = parseHitDice(hdStr);
  return Math.max(1, Math.round(base * 4.5 + bonus));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    let query = `SELECT id, name, hit_dice FROM monsters WHERE hit_points IS NULL`;
    const params = [];
    if (nameArg) {
      params.push(`%${nameArg}%`);
      query += ` AND name ILIKE $1`;
    }
    query += ` ORDER BY name`;

    const { rows } = await client.query(query, params);
    console.log(`Found ${rows.length} monsters with NULL hit_points.`);
    if (DRY_RUN) console.log('DRY RUN — no changes will be written.\n');

    let updated = 0;
    for (const row of rows) {
      const hp = averageHp(row.hit_dice);
      console.log(`  ${row.name.padEnd(40)} hit_dice="${row.hit_dice ?? '?'}" → hit_points=${hp}`);

      if (!DRY_RUN) {
        await client.query(`UPDATE monsters SET hit_points = $1 WHERE id = $2`, [hp, row.id]);
        updated++;
      }
    }

    console.log(`\n${DRY_RUN ? 'Would update' : 'Updated'} ${DRY_RUN ? rows.length : updated} rows.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
