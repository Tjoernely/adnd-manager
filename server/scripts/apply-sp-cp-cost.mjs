#!/usr/bin/env node
/**
 * apply-sp-cp-cost.mjs
 * Opdaterer sp_cp_cost på nonweapon_proficiencies ud fra reviewede værdier.
 * Kør fra: /var/www/adnd-manager/server/
 *   node scripts/apply-sp-cp-cost.mjs [--dry-run]
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

const DRY_RUN = process.argv.includes('--dry-run');

// Reviewede sp_cp_cost værdier (fra nwp_sp_cp_cost_suggestions.tsv)
// format: [canonical_id, sp_cp_cost]
const DATA = [
  ['glassworking',                  2],
  ['grab-and-drop',                 2],
  ['ground-combat',                 4],
  ['swoop',                         2],
  ['wing-buffet',                   2],
  ['future-history',                1],
  ['languages-future',              1],
  ['prophecy',                      2],
  ['time-sense',                    2],
  ['animal-husbandry',              2],
  ['animal-rending',                2],
  ['boating',                       2],
  ['boatwright',                    2],
  ['chaos-shaping',                 2],
  ['cheesemaking',                  1],
  ['chitinworking',                 2],
  ['city-familiarity',              2],
  ['clothesmaking-crude',           2],
  ['contact',                       2],
  ['curtain-cognizance',            4],
  ['danger-sense',                  5],
  ['dark-lore',                     2],
  ['direction-sense-planar',        2],
  ['distance-sense',                3],
  ['dragon-lore',                   2],
  ['drinking',                      2],
  ['dwarf-runes',                   2],
  ['eating',                        2],
  ['ethereal-sight',                2],
  ['excavation',                    2],
  ['feign-magic',                   2],
  ['flintworking',                  2],
  ['folklore',                      2],
  ['fungi-recognition',             2],
  ['haggling',                      4],
  ['hands-off-mount-control',       2],
  ['heraldry-space',                1],
  ['herding',                       2],
  ['hiding',                        4],
  ['languages-modern',              2],
  ['local-dwarf-history',           1],
  ['mental-armor',                  2],
  ['metalworking',                  2],
  ['nutriment',                     2],
  ['pilot-airship',                 2],
  ['planar-sense',                  2],
  ['planar-survival',               5],
  ['portal-feel',                   3],
  ['prospecting',                   2],
  ['psychic-defense',               4],
  ['realmspace-lore',               1],
  ['relic-dating',                  3],
  ['riding-sea-based',              3],
  ['seamstresstailor',              3],
  ['shipwright',                    2],
  ['signaling',                     2],
  ['slow-respiration',              2],
  ['smelting',                      2],
  ['sound-analysis',                2],
  ['spacemanship',                  2],
  ['statecraft',                    2],
  ['survival-underground',          2],
  ['tribal-lore',                   1],
  ['underground-navigation',        2],
  ['underwater-communication',      3],
  ['underwater-riding',             3],
  ['wind-sailing',                  2],
  ['winemaking',                    1],
  ['concocting-proficiency',        2],
  ['hierarchy-contact',             4],
  ['meditation',                    2],
  ['movement-meditation',           2],
  ['presence',                      4],
  ['thespian',                      2],
  ['alms',                          2],
  ['anatomy',                       2],
  ['ayuveda',                       2],
  ['bartering',                     2],
  ['bookbinding',                   1],
  ['bureaucracy',                   4],
  ['burial-customs',                1],
  ['cartography',                   2],
  ['chakra',                        2],
  ['diagnostics',                   2],
  ['diplomacy',                     2],
  ['energy',                        2],
  ['genie-lore',                    2],
  ['geonosy',                       2],
  ['homeopathy',                    2],
  ['inquisitor',                    4],
  ['investigation',                 3],
  ['languages-ancient',             4],
  ['law',                           2],
  ['mudra-sign-language',           2],
  ['naturopathy',                   2],
  ['navigation-phlogiston',         1],
  ['navigation-wildspace',          1],
  ['necrology',                     2],
  ['netherworld-knowledge',         2],
  ['oriental',                      2],
  ['papermaking',                   1],
  ['persuasion',                    2],
  ['pharmacy',                      2],
  ['planetology',                   3],
  ['planology',                     2],
  ['sacred-legends',                2],
  ['sage-knowledge',                5],
  ['screed-lore',                   1],
  ['scribe',                        2],
  ['soothsaying',                   4],
  ['spell-recovery',                4],
  ['spelljamming',                  3],
  ['spirit-lore',                   3],
  ['undead-lore',                   2],
  ['underwater-spellcasting',       3],
  ['venom-handling',                2],
  ['veterinary-healing',            2],
  ['western',                       2],
  ['zero-gravity-combat',           2],
  ['body-language',                 3],
  ['crystal-focus',                 2],
  ['explosive-energy',              2],
  ['harness-subconscious',          4],
  ['hypnosis',                      2],
  ['meditative-focus',              2],
  ['power-manipulation',            4],
  ['psionic-lore',                  2],
  ['rejuvenation',                  2],
  ['seance',                        4],
  ['water-divining',                2],
  ['assimilation',                  2],
  ['awareness',                     5],
  ['close-quarter-fighting',        4],
  ['detect-signing',                2],
  ['enamor',                        2],
  ['escape',                        4],
  ['fast-talking',                  2],
  ['feigndetect-sleep',             2],
  ['fey-lore',                      2],
  ['giant-kite-flying',             2],
  ['grooming',                      4],
  ['hold-breath',                   2],
  ['information-gathering',         3],
  ['intrigue',                      4],
  ['locksmithing',                  2],
  ['night-vision',                  2],
  ['pest-control',                  2],
  ['quick-study',                   3],
  ['riding-camel-specialization',   3],
  ['riding-horse-specialization',   3],
  ['sleight-of-hand',               2],
  ['sword-swallowing',              2],
  ['toxicology',                    4],
  ['trail-signs',                   2],
  ['underclass',                    2],
  ['underwater-combat',             4],
  ['voice-mimicry',                 3],
  ['water-walking',                 2],
  ['armorer-crude',                 2],
  ['artillerist',                   2],
  ['bowyerfletcher-crude',          2],
  ['chariot-jump',                  5],
  ['display-weapon-prowess',        2],
  ['elephant-care',                 4],
  ['ethereal-tracking',             4],
  ['gunnery',                       2],
  ['gunsmithing',                   4],
  ['horde-summoning',               4],
  ['leadership',                    3],
  ['light-sleeping',                2],
  ['natural-fighting',              4],
  ['naval-combat',                  2],
  ['spelunking',                    2],
  ['style-analysis',                2],
  ['trail-marking',                 3],
  ['vehicle-handling',              2],
  ['warrior-s-scream',              4],
  ['weapon-improvisation',          2],
  ['weaponsmithing-crude',          2],
  ['wild-fighting',                 4],
  ['yoke-pole',                     4],
  ['school-theory',                 4],
  ['arcanology',                    2],
  ['artifice',                      4],
  ['body-manipulation',             3],
  ['circuit-tattoo',                2],
  ['clockwork-creation',            4],
  ['concentration',                 4],
  ['delude-sensors',                2],
  ['detect-fumes',                  2],
  ['digital-persuasion',            2],
  ['dowsing',                       2],
  ['drake-lore',                    3],
  ['glassblowing',                  2],
  ['high-magic',                    2],
  ['hypnotism',                     2],
  ['illusion-pierce',               5],
  ['lower-plane-knowledge',         3],
  ['machine-language',              2],
  ['magecraft',                     2],
  ['mental-resistance',             2],
  ['metaphysical-theory',           4],
  ['numeracy',                      2],
  ['numerology',                    4],
  ['prestidigitation',              2],
  ['salvage',                       3],
  ['sorcerous-dueling',             3],
  ['tactics-of-magic',              2],
  ['tattooing',                     2],
  ['thaumaturgy',                   2],
  ['undead-knowledge',              2],
  ['vapor-weave',                   5],
];

async function main() {
  console.log(`=== apply-sp-cp-cost.mjs (${DATA.length} entries)${DRY_RUN ? ' — DRY RUN' : ''} ===`);

  let updated = 0, notFound = 0, skipped = 0;

  for (const [cid, cost] of DATA) {
    if (DRY_RUN) {
      console.log(`  DRY: UPDATE ${cid} → sp_cp_cost = ${cost}`);
      updated++;
      continue;
    }

    const res = await db.query(`
      UPDATE nonweapon_proficiencies
      SET sp_cp_cost = $2, updated_at = NOW()
      WHERE canonical_id = $1
        AND sp_cp_cost IS NULL
      RETURNING name
    `, [cid, cost]);

    if (res.rows.length) {
      updated++;
    } else {
      // Tjek om rækken findes men allerede har en værdi
      const check = await db.query(
        'SELECT sp_cp_cost FROM nonweapon_proficiencies WHERE canonical_id = $1', [cid]
      );
      if (check.rows.length) {
        skipped++;  // Allerede sat — rør ikke
      } else {
        console.warn(`  NOT FOUND: ${cid}`);
        notFound++;
      }
    }
  }

  console.log(`\nResultat:`);
  console.log(`  Opdateret : ${updated}`);
  console.log(`  Allerede sat (ikke rørt): ${skipped}`);
  console.log(`  Ikke fundet i DB : ${notFound}`);

  if (!DRY_RUN) {
    const { rows } = await db.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE sp_cp_cost IS NULL)::int AS missing
      FROM nonweapon_proficiencies
    `);
    console.log(`\nDB status: ${rows[0].total} NWPs total, ${rows[0].missing} mangler stadig sp_cp_cost`);
  }

  await db.pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
