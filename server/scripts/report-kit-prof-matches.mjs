#!/usr/bin/env node
/**
 * server/scripts/report-kit-prof-matches.mjs
 *
 * Scans all kit nwpRequired / nwpRecommended entries, runs the profResolver
 * on each, and writes a TSV (or JSON) report to stdout.
 *
 * Usage (run from project root or server/):
 *   node server/scripts/report-kit-prof-matches.mjs            → full TSV to stdout
 *   node server/scripts/report-kit-prof-matches.mjs --review   → only rows requiring review
 *   node server/scripts/report-kit-prof-matches.mjs --json     → JSON array to stdout
 *   node server/scripts/report-kit-prof-matches.mjs > report.tsv
 *
 * Stats summary always goes to stderr so it doesn't pollute redirected output.
 */
import { createRequire } from 'module';
import { fileURLToPath }  from 'url';
import path               from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require   = createRequire(import.meta.url);
const db        = require('../db');

// ── Frontend source files (ES modules — imported directly) ───────────────────
import { SP_KITS, CLASS_KITS } from '../../src/data/kits.js';
import { buildProfIndex, resolveKitProfEntry } from '../../src/rules-engine/profResolver.js';

// ── CLI flags ─────────────────────────────────────────────────────────────────
const AS_JSON      = process.argv.includes('--json');
const REVIEW_ONLY  = process.argv.includes('--review');

// ── DB normalisation ──────────────────────────────────────────────────────────
/**
 * Map a DB row to the minimal shape expected by buildProfIndex.
 * aliases comes back as a plain string[] from the json_agg.
 */
function normalizeRow(row) {
  return {
    id:      row.canonical_id,
    name:    row.name,
    aliases: Array.isArray(row.aliases) ? row.aliases.filter(Boolean) : [],
  };
}

// ── Kit entry extractor ───────────────────────────────────────────────────────
/**
 * Walk SP_KITS (array) and CLASS_KITS (object of arrays) and yield
 * flat entries: { kitId, kitName, field, raw }
 */
function extractKitEntries() {
  const entries = [];

  function processKit(kit) {
    if (!kit || !kit.id) return;
    for (const raw of (kit.nwpRequired   ?? [])) {
      if (typeof raw === 'string') entries.push({ kitId: kit.id, kitName: kit.name ?? kit.id, field: 'nwpRequired',   raw });
    }
    for (const raw of (kit.nwpRecommended ?? [])) {
      if (typeof raw === 'string') entries.push({ kitId: kit.id, kitName: kit.name ?? kit.id, field: 'nwpRecommended', raw });
    }
  }

  // SP_KITS — flat array
  if (Array.isArray(SP_KITS)) {
    for (const kit of SP_KITS) processKit(kit);
  }

  // CLASS_KITS — object keyed by class name, each value is an array of kit objects
  if (CLASS_KITS && typeof CLASS_KITS === 'object') {
    for (const kitsForClass of Object.values(CLASS_KITS)) {
      const arr = Array.isArray(kitsForClass) ? kitsForClass : [kitsForClass];
      for (const kit of arr) processKit(kit);
    }
  }

  return entries;
}

// ── TSV helpers ───────────────────────────────────────────────────────────────
const TSV_COLS = [
  'kit_id', 'kit_name', 'field', 'raw', 'cleaned',
  'resolved_canonical_id', 'resolved_display_name',
  'match_method', 'confidence', 'requires_review',
  'candidates', 'note',
];

function tsvRow(kitId, kitName, field, raw, r) {
  return [
    kitId,
    kitName,
    field,
    raw,
    r.cleaned                ?? '',
    r.resolved_canonical_id  ?? '',
    r.resolved_display_name  ?? '',
    r.match_method,
    r.confidence,
    r.requires_review ? 'YES' : 'no',
    r.candidates.map(c => c.canonical_id).join('|'),
    r.note                   ?? '',
  ].map(v => String(v).replace(/\t/g, ' ').replace(/\n/g, ' ')).join('\t');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch all proficiencies + aliases from DB
  const { rows } = await db.query(`
    SELECT p.canonical_id, p.name,
           COALESCE(
             json_agg(DISTINCT a.alias) FILTER (WHERE a.alias IS NOT NULL),
             '[]'
           ) AS aliases
    FROM nonweapon_proficiencies p
    LEFT JOIN proficiency_aliases a ON a.prof_id = p.id
    GROUP BY p.id, p.canonical_id, p.name
    ORDER BY p.name
  `);

  const profs = rows.map(normalizeRow);
  const index = buildProfIndex(profs);

  // 2. Extract all kit NWP entries
  const entries = extractKitEntries();

  // 3. Resolve each entry
  const resolved = entries.map(({ kitId, kitName, field, raw }) => ({
    kitId, kitName, field, raw,
    result: resolveKitProfEntry(raw, index),
  }));

  const toOutput = REVIEW_ONLY
    ? resolved.filter(({ result }) => result.requires_review)
    : resolved;

  // 4. Output
  if (AS_JSON) {
    const out = toOutput.map(({ kitId, kitName, field, raw, result }) => ({
      kit_id:                kitId,
      kit_name:              kitName,
      field,
      raw,
      cleaned:               result.cleaned,
      resolved_canonical_id: result.resolved_canonical_id,
      resolved_display_name: result.resolved_display_name,
      match_method:          result.match_method,
      confidence:            result.confidence,
      requires_review:       result.requires_review,
      candidates:            result.candidates,
      note:                  result.note,
    }));
    process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  } else {
    process.stdout.write(TSV_COLS.join('\t') + '\n');
    for (const { kitId, kitName, field, raw, result } of toOutput) {
      process.stdout.write(tsvRow(kitId, kitName, field, raw, result) + '\n');
    }
  }

  // 5. Summary stats → stderr (never pollutes redirected output)
  const total      = resolved.length;
  const confident  = resolved.filter(({ result: r }) => r.resolved_canonical_id && !r.requires_review).length;
  const needReview = resolved.filter(({ result: r }) => r.requires_review).length;
  const unresolved = resolved.filter(({ result: r }) => r.match_method === 'unresolved').length;
  const byMethod   = {};
  for (const { result: r } of resolved) byMethod[r.match_method] = (byMethod[r.match_method] ?? 0) + 1;

  process.stderr.write('\n=== Kit Prof Match Report ===\n');
  process.stderr.write(`DB proficiencies loaded : ${profs.length}\n`);
  process.stderr.write(`Kit NWP entries scanned : ${total}\n`);
  process.stderr.write(`Confident match         : ${confident}\n`);
  process.stderr.write(`Needs review            : ${needReview}\n`);
  process.stderr.write(`Unresolved              : ${unresolved}\n`);
  process.stderr.write('\nBy match method:\n');
  for (const [method, count] of Object.entries(byMethod).sort()) {
    process.stderr.write(`  ${method.padEnd(20)} ${count}\n`);
  }
  if (REVIEW_ONLY) {
    process.stderr.write(`\n(--review flag: only ${toOutput.length} rows written to output)\n`);
  }

  await db.pool.end();
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
