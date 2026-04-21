#!/usr/bin/env node
/**
 * update-nwp-descriptions.mjs
 * Fills missing descriptions in nonweapon_proficiencies from wiki scrape JSON.
 *
 * Run from /var/www/adnd-manager/server/:
 *   node scripts/update-nwp-descriptions.mjs
 *
 * Requires: server/data/wiki-nwp-scrape.json
 * Only updates rows where description IS NULL or empty — never overwrites existing content.
 */
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

async function main() {
  console.log('=== update-nwp-descriptions.mjs ===\n');

  // ── 1. Load wiki scrape ──────────────────────────────────────────────────────
  const dataPath = path.join(__dirname, '../data/wiki-nwp-scrape.json');
  if (!fs.existsSync(dataPath)) {
    console.error('ERROR: wiki-nwp-scrape.json not found at', dataPath);
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  const entries = raw.entries ?? raw;   // handle both {entries:[...]} and bare array

  // Deduplicate by name — first occurrence wins (same name can appear in multiple groups)
  const wikiByName = {};
  for (const e of entries) {
    const key = e.name.toLowerCase().trim();
    if (!wikiByName[key]) wikiByName[key] = e;
  }
  console.log(`Wiki entries loaded: ${entries.length} total, ${Object.keys(wikiByName).length} unique names\n`);

  // ── 2. Fetch DB rows missing descriptions ────────────────────────────────────
  const { rows: missing } = await db.query(`
    SELECT canonical_id, name
    FROM nonweapon_proficiencies
    WHERE description IS NULL OR description = ''
    ORDER BY name
  `);
  console.log(`DB rows missing descriptions: ${missing.length}\n`);

  // ── 3. Match and update ──────────────────────────────────────────────────────
  let updated = 0, skipped = 0, noMatch = 0;

  for (const row of missing) {
    const key     = row.name.toLowerCase().trim();
    const wikiEntry = wikiByName[key];

    if (!wikiEntry || !wikiEntry.desc || wikiEntry.desc.trim().length < 10) {
      noMatch++;
      if (!wikiEntry) {
        console.log(`  [NO MATCH] ${row.name} (${row.canonical_id})`);
      }
      continue;
    }

    // Clean the description: strip leading source book labels if they duplicate the name
    const desc = wikiEntry.desc.trim();

    try {
      const res = await db.query(
        `UPDATE nonweapon_proficiencies
         SET description = $1, updated_at = NOW()
         WHERE canonical_id = $2
           AND (description IS NULL OR description = '')
         RETURNING canonical_id`,
        [desc, row.canonical_id]
      );
      if (res.rows.length) {
        updated++;
        process.stdout.write(`  ✓ ${row.name}\n`);
      } else {
        skipped++;
      }
    } catch (e) {
      console.error(`  ERR ${row.name}: ${e.message}`);
    }
  }

  // ── 4. Summary ───────────────────────────────────────────────────────────────
  console.log('\n════════════════════════════════════════');
  console.log(`  Updated : ${updated}`);
  console.log(`  Skipped : ${skipped}  (description already present)`);
  console.log(`  No match: ${noMatch}  (no wiki entry for this name)`);
  console.log('════════════════════════════════════════\n');

  // Final count
  const { rows: [{ n }] } = await db.query(
    `SELECT COUNT(*)::int AS n FROM nonweapon_proficiencies WHERE description IS NOT NULL AND description != ''`
  );
  console.log(`DB NWPs with descriptions now: ${n} / (SELECT COUNT(*) FROM nonweapon_proficiencies)`);
}

main()
  .catch(e => { console.error('Fatal:', e.message); process.exit(1); })
  .finally(() => db.pool?.end().catch(() => {}));
