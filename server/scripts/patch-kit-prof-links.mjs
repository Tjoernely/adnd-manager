#!/usr/bin/env node
/**
 * server/scripts/patch-kit-prof-links.mjs
 *
 * Resolves unmatched kit_proficiency_links rows (prof_id IS NULL) using
 * profResolver.js, then UPDATEs the table for every confident (non-review) hit.
 *
 * Dry-run by default — pass --apply to actually write to the DB.
 *
 * Usage (run from project root):
 *   node server/scripts/patch-kit-prof-links.mjs           → dry-run, prints plan
 *   node server/scripts/patch-kit-prof-links.mjs --apply   → write updates to DB
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

import { buildProfIndex, resolveKitProfEntry } from '../../src/rules-engine/profResolver.js';

const APPLY = process.argv.includes('--apply');

// ── Load all DB profs (with aliases) ─────────────────────────────────────────
async function loadProfs() {
  const rows = await db.all(`
    SELECT p.canonical_id, p.name,
           COALESCE(json_agg(a.alias) FILTER (WHERE a.alias IS NOT NULL), '[]') AS aliases
    FROM nonweapon_proficiencies p
    LEFT JOIN nwp_aliases a ON a.prof_id = p.id
    GROUP BY p.id
    ORDER BY p.name
  `);
  return rows.map(r => ({
    id:      r.canonical_id,
    name:    r.name,
    aliases: Array.isArray(r.aliases) ? r.aliases : JSON.parse(r.aliases ?? '[]'),
  }));
}

// ── Load all unmatched links ──────────────────────────────────────────────────
async function loadUnmatched() {
  return db.all(`
    SELECT id, prof_name_raw
    FROM kit_proficiency_links
    WHERE prof_id IS NULL
    ORDER BY prof_name_raw
  `);
}

// ── Resolve and apply ─────────────────────────────────────────────────────────
async function main() {
  const profs    = await loadProfs();
  const index    = buildProfIndex(profs);
  const rows     = await loadUnmatched();

  console.error(`Loaded ${profs.length} profs, ${rows.length} unmatched links`);

  // Group by prof_name_raw so we do one UPDATE per distinct raw value
  const byRaw = new Map();
  for (const row of rows) {
    if (!byRaw.has(row.prof_name_raw)) byRaw.set(row.prof_name_raw, []);
    byRaw.get(row.prof_name_raw).push(row.id);
  }

  let confident = 0;
  let skipped   = 0;
  let updated   = 0;

  for (const [rawName, ids] of byRaw.entries()) {
    const result = resolveKitProfEntry(rawName, index);

    if (result.requires_review || !result.resolved_canonical_id) {
      skipped++;
      console.log(`SKIP  [${ids.length}x] "${rawName}" → ${result.match_method}: ${result.note ?? result.resolved_display_name ?? '(unresolved)'}`);
      continue;
    }

    confident++;
    const canonicalId = result.resolved_canonical_id;

    // Look up the numeric PK for this canonical_id
    const profRow = await db.one(
      'SELECT id FROM nonweapon_proficiencies WHERE canonical_id = $1',
      [canonicalId]
    );
    if (!profRow) {
      console.log(`WARN  "${rawName}" resolved to "${canonicalId}" but not found in DB`);
      skipped++;
      continue;
    }

    console.log(`UPDATE [${ids.length}x] "${rawName}" → ${result.resolved_display_name} (${canonicalId}) via ${result.match_method}`);

    if (APPLY) {
      const { rowCount } = await db.query(
        'UPDATE kit_proficiency_links SET prof_id = $1 WHERE id = ANY($2)',
        [profRow.id, ids]
      );
      updated += rowCount;
    }
  }

  console.error(`\nSummary: ${confident} groups confident, ${skipped} skipped`);
  if (APPLY) {
    console.error(`Updated ${updated} row(s) in kit_proficiency_links`);
  } else {
    console.error('Dry-run — pass --apply to write changes');
  }

  await db.pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
