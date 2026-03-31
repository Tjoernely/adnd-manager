#!/usr/bin/env node
/**
 * review-sp-cp-cost.mjs
 * Printer alle NWPs der mangler sp_cp_cost, grupperet efter prof_group.
 * Kør fra: /var/www/adnd-manager/server/
 *   node scripts/review-sp-cp-cost.mjs
 *   node scripts/review-sp-cp-cost.mjs --tsv   # tab-separeret til copy-paste i regneark
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

const TSV = process.argv.includes('--tsv');

async function main() {
  const { rows } = await db.query(`
    SELECT
      canonical_id,
      name,
      prof_group,
      slots_required,
      check_ability,
      check_modifier,
      source_book,
      is_sp_native,
      conversion_note
    FROM nonweapon_proficiencies
    WHERE sp_cp_cost IS NULL
    ORDER BY prof_group, name
  `);

  if (!rows.length) {
    console.log('✓ Alle NWPs har sp_cp_cost — ingen mangler.');
    await db.pool.end();
    return;
  }

  if (TSV) {
    // Tab-separeret output — nem at paste ind i Excel/Sheets
    console.log(['canonical_id','name','prof_group','slots','check_ability','check_modifier','source_book','sp_cp_cost (udfyld)'].join('\t'));
    for (const r of rows) {
      console.log([
        r.canonical_id,
        r.name,
        r.prof_group,
        r.slots_required,
        r.check_ability  ?? '',
        r.check_modifier ?? 0,
        r.source_book    ?? '',
        '',
      ].join('\t'));
    }
  } else {
    // Læsbar grupperet output
    let currentGroup = null;
    for (const r of rows) {
      if (r.prof_group !== currentGroup) {
        currentGroup = r.prof_group;
        console.log(`\n── ${currentGroup.toUpperCase()} ──`);
        console.log(
          'canonical_id'.padEnd(36) +
          'name'.padEnd(34) +
          'slots'.padEnd(7) +
          'check'.padEnd(20) +
          'source'
        );
        console.log('─'.repeat(110));
      }
      const check = r.check_ability
        ? `${r.check_ability} ${r.check_modifier >= 0 ? '+' : ''}${r.check_modifier}`
        : '—';
      console.log(
        r.canonical_id.padEnd(36) +
        r.name.padEnd(34) +
        String(r.slots_required).padEnd(7) +
        check.padEnd(20) +
        (r.source_book ?? '—')
      );
    }
    console.log(`\nTotal: ${rows.length} NWPs mangler sp_cp_cost`);
  }

  await db.pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
