#!/usr/bin/env node
/**
 * server/scripts/import-missing-nwps.mjs
 *
 * Inserts 4 missing NWPs into nonweapon_proficiencies and updates
 * kit_proficiency_links.prof_id for all rows that reference them.
 *
 * Safe to re-run (INSERT ... ON CONFLICT DO NOTHING).
 *
 * Run from project root:
 *   node server/scripts/import-missing-nwps.mjs
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const db      = require('../db');

const PROFS = [
  {
    canonical_id:    'animal-noise',
    name:            'Animal Noise',
    prof_group:      'rogue',
    slots_required:  1,
    check_ability:   'Wisdom',
    check_modifier:  -1,
    sp_cp_cost:      2,
    sp_rank:         8,
    sp_stat_1:       'intuition',
    sp_stat_2:       null,
    is_sp_native:    false,
    source_book:     "The Complete Thief's Handbook",
    conversion_note: 'Converted from CTH/CBH; sub-ability Intuition (WIS)',
    description:     'Imitate animal sounds for covert signaling, distraction, lure, or deception. On a successful check the sound is indistinguishable from the real animal except by magical means; on a failed check very familiar listeners detect the fake automatically.',
  },
  {
    canonical_id:    'intimidation',
    name:            'Intimidation',
    prof_group:      'rogue',
    slots_required:  1,
    check_ability:   'Charisma',
    check_modifier:  0,
    sp_cp_cost:      3,
    sp_rank:         7,
    sp_stat_1:       'leadership',
    sp_stat_2:       null,
    is_sp_native:    false,
    source_book:     "The Complete Thief's Handbook",
    conversion_note: 'Converted from CTH/CBD/CBH; sub-ability Leadership (CHA). Original sources allow STR or CHA — S&P canonical uses CHA/Leadership.',
    description:     'Coerce NPCs through fear. On success targets are likely to comply, but usually harbor resentment and may seek revenge later.',
  },
  {
    canonical_id:    'crowd-working',
    name:            'Crowd Working',
    prof_group:      'rogue',
    slots_required:  1,
    check_ability:   'Charisma',
    check_modifier:  2,
    sp_cp_cost:      3,
    sp_rank:         7,
    sp_stat_1:       'leadership',
    sp_stat_2:       null,
    is_sp_native:    false,
    source_book:     "The Complete Bard's Handbook",
    conversion_note: 'Converted from CBdH/CBH; sub-ability Leadership (CHA)',
    description:     'Improve crowd reactions and performances. A successful check improves the reaction by two levels instead of one. If soliciting money, success doubles donations or improves performance conditions by one category.',
  },
  {
    canonical_id:    'calligraphy',
    name:            'Calligraphy',
    prof_group:      'wizard',
    slots_required:  1,
    check_ability:   'Dexterity',
    check_modifier:  0,
    sp_cp_cost:      2,
    sp_rank:         8,
    sp_stat_1:       'aim',
    sp_stat_2:       null,
    is_sp_native:    false,
    source_book:     'Oriental Adventures / Wu Jen kit',
    conversion_note: 'Derived from Wu Jen kit references and Oriental Adventures lineage; sub-ability Aim (DEX)',
    description:     'Produce elegant, precise written text for formal documents, scrollwork, inscriptions, or artistic manuscripts.',
  },
];

// Raw name variants found in kit_proficiency_links → canonical_id
const RAW_NAME_MAP = {
  'Animal Noise':   'animal-noise',
  'Intimidation':   'intimidation',
  'Crowd Working':  'crowd-working',
  'Calligraphy':    'calligraphy',
};

async function main() {
  // 1. Insert profs
  for (const p of PROFS) {
    const { rowCount } = await db.query(`
      INSERT INTO nonweapon_proficiencies
        (canonical_id, name, prof_group, slots_required,
         check_ability, check_modifier,
         sp_cp_cost, sp_rank, sp_stat_1, sp_stat_2,
         is_sp_native, source_book, conversion_note, description)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (canonical_id) DO NOTHING
    `, [
      p.canonical_id, p.name, p.prof_group, p.slots_required,
      p.check_ability, p.check_modifier,
      p.sp_cp_cost, p.sp_rank, p.sp_stat_1, p.sp_stat_2,
      p.is_sp_native, p.source_book, p.conversion_note, p.description,
    ]);
    console.log(`${p.name}: ${rowCount ? 'inserted' : 'already exists (skipped)'}`);
  }

  // 2. Update kit_proficiency_links.prof_id
  for (const [rawName, canonicalId] of Object.entries(RAW_NAME_MAP)) {
    const prof = await db.one(
      'SELECT id FROM nonweapon_proficiencies WHERE canonical_id = $1',
      [canonicalId]
    );
    if (!prof) { console.log(`  ⚠ Prof not found after insert: ${canonicalId}`); continue; }

    const { rowCount } = await db.query(`
      UPDATE kit_proficiency_links
      SET prof_id = $1
      WHERE prof_name_raw = $2 AND prof_id IS NULL
    `, [prof.id, rawName]);
    console.log(`  kit_proficiency_links "${rawName}" → ${canonicalId}: ${rowCount} row(s) updated`);
  }

  console.log('\nDone.');
  await db.pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
