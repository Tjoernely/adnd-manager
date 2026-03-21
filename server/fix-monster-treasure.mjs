/**
 * fix-monster-treasure.mjs
 *
 * Fetches the AD&D 2E wiki page for each monster that has a wiki_url
 * but no treasure type, parses the "| treasure = X" field from the
 * {{Creature}} template, and updates the DB.
 *
 * Usage (run from server/ directory):
 *   node fix-monster-treasure.mjs
 *   node fix-monster-treasure.mjs --dry-run
 *   node fix-monster-treasure.mjs --limit 50
 *   node fix-monster-treasure.mjs --dry-run --limit 10
 *
 * Env vars (mirrors db.js):
 *   DB_HOST  DB_PORT  DB_NAME  DB_USER  DB_PASSWORD
 */

import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);

// Load .env
try {
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(__dirname, '.env') });
} catch (_) {}

// ── CLI flags ─────────────────────────────────────────────────────────────────
const args     = process.argv.slice(2);
const DRY_RUN  = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT    = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : Infinity;
const DELAY_MS = 200;

// ── DB ────────────────────────────────────────────────────────────────────────
const pool = new pg.Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
});

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Wiki fetch ─────────────────────────────────────────────────────────────────
function titleFromUrl(url) {
  if (!url) return null;
  const m = url.match(/\/wiki\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

async function fetchWikiContent(pageTitle) {
  // &redirects=1 tells the Fandom API to follow redirects automatically
  const url = `https://adnd2e.fandom.com/api.php?action=query&titles=${encodeURIComponent(pageTitle)}&prop=revisions&rvprop=content&format=json&origin=*&redirects=1`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'ADnD-Manager-TreasureFix/1.0' },
      signal:  AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data  = await res.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    if (page.missing !== undefined) return null;
    return page?.revisions?.[0]?.['*'] ?? null;
  } catch {
    return null;
  }
}

// ── Parse treasure from wikitext ──────────────────────────────────────────────
function parseTreasure(raw) {
  if (!raw) return null;

  // Match "| treasure = X" inside the template block
  const m = raw.match(/\|\s*treasure\s*=\s*([^\n|{}]+)/i);
  if (!m) return null;

  let val = m[1]
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\{\{[^}]*\}\}/g, '')
    .trim();

  if (!val || val.toLowerCase() === 'nil' || val.toLowerCase() === 'none') return 'nil';

  // Keep only the first token (e.g. "Q×10, A" → "Q")
  const firstToken = val.split(/[\s,;(]/)[0].toUpperCase();

  // Valid AD&D 2E treasure table letters
  if (/^[A-O]$/.test(firstToken)) return firstToken;

  // If value is something like "Nil" after cleanup store as 'nil'
  return val.slice(0, 10) || null;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Monster Treasure Fixer                              ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`  Mode   : ${DRY_RUN ? 'DRY RUN (no DB writes)' : 'LIVE'}`);
  console.log(`  Limit  : ${LIMIT === Infinity ? 'all' : LIMIT}`);
  console.log(`  Delay  : ${DELAY_MS} ms between requests`);
  console.log('');

  const { rows } = await pool.query(
    `SELECT id, name, wiki_url FROM monsters
     WHERE (treasure IS NULL OR treasure = '' OR treasure = 'Nil')
       AND wiki_url IS NOT NULL
     ORDER BY name
     LIMIT $1`,
    [LIMIT === Infinity ? 99999 : LIMIT],
  );

  console.log(`  Found ${rows.length} monsters to process.\n`);

  let updated = 0, notFound = 0, noTreasure = 0, errors = 0;

  for (let i = 0; i < rows.length; i++) {
    const { id, name, wiki_url } = rows[i];
    const pct = Math.round(((i + 1) / rows.length) * 100);
    process.stdout.write(`\r  [${String(pct).padStart(3)}%] ${String(i + 1).padStart(4)}/${rows.length}  ${name.substring(0, 35).padEnd(35)}`);

    try {
      const pageTitle = titleFromUrl(wiki_url);
      if (!pageTitle) { noTreasure++; continue; }

      const raw      = await fetchWikiContent(pageTitle);
      if (!raw) { notFound++; await sleep(DELAY_MS); continue; }

      const treasure = parseTreasure(raw);
      if (!treasure) { noTreasure++; await sleep(DELAY_MS); continue; }

      if (!DRY_RUN) {
        await pool.query('UPDATE monsters SET treasure=$1 WHERE id=$2', [treasure, id]);
      }
      updated++;
      process.stdout.write(`  → ${treasure}`);
    } catch (e) {
      errors++;
      process.stdout.write(`  ✗ ${e.message?.slice(0, 40)}`);
    }

    await sleep(DELAY_MS);
  }

  console.log('\n');
  console.log('  ── Results ──────────────────────────────────');
  console.log(`  Updated      : ${updated}`);
  console.log(`  Not on wiki  : ${notFound}`);
  console.log(`  No treasure  : ${noTreasure}`);
  console.log(`  Errors       : ${errors}`);
  if (DRY_RUN) console.log('\n  (Dry run — no changes written to DB)');

  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
