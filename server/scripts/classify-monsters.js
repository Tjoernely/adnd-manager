#!/usr/bin/env node
/**
 * classify-monsters.js
 *
 * Iterates over all monsters in the database, calls Claude API to classify
 * each into a flat tag system, and writes the resulting tags array back to
 * the monster's `tags` column.
 *
 * Run via:    npm run classify-monsters
 * Flags:
 *   --dry-run         Process but don't write to DB. Logs what would change.
 *   --limit N         Only process the first N untagged monsters.
 *   --force           Re-classify monsters that already have tags.
 *   --batch-size N    Monsters per Claude API call (default: 20).
 *   --concurrency N   Parallel API calls (default: 3). Be polite — don't max this.
 *   --verbose         Log each monster's tags to stdout.
 *
 * Cost estimate: ~$0.001 per monster with Haiku 4.5.
 * For all 3781 monsters: ~$3-4 total.
 *
 * Resume-friendly: by default skips monsters that already have tags. Run
 * with --force to re-classify everything.
 *
 * Requirements:
 *   - ANTHROPIC_API_KEY in process.env (the same key the server uses for
 *     other AI features — already in your .env)
 *   - Database client matching whatever the rest of the backend uses
 *     (the script tries `pg` and falls back to a generic adapter pattern)
 */

const fs = require('fs');
const path = require('path');

// --- Configuration ---
const VOCAB_PATH = path.join(__dirname, '..', 'data', 'tag-vocabulary.json');
const LOG_PATH = path.join(__dirname, '..', 'classify-monsters.log');
// Sonnet 4.5 picked over Haiku 4.5 — ~3× cost ($5 vs $1.50 for full 3781 set)
// in exchange for substantially better semantic AD&D classification, fewer
// low-confidence verdicts, and better name-vs-description reasoning.
const ANTHROPIC_MODEL = 'claude-sonnet-4-5-20250929';
const DEFAULT_BATCH_SIZE = 20;
// Sonnet 4.5 on the default org tier caps at 30 000 input tokens/min and
// 50 req/min. Each batch of 20 monsters with the 3000-char description slice
// runs ~7 700 input tokens. To stay under the token cap we use concurrency=1
// and ~16s between batches → ~3.7 batches/min × 7 700 ≈ 28 500 tokens/min.
// The earlier value (concurrency=3, 200ms) tripped 429s on 93% of batches.
const DEFAULT_CONCURRENCY = 1;
const RATE_LIMIT_DELAY_MS = 16000;

// --- Parse CLI args ---
const args = process.argv.slice(2);
const opts = {
  dryRun: args.includes('--dry-run'),
  force: args.includes('--force'),
  verbose: args.includes('--verbose'),
  limit: parseIntArg('--limit', null),
  batchSize: parseIntArg('--batch-size', DEFAULT_BATCH_SIZE),
  concurrency: parseIntArg('--concurrency', DEFAULT_CONCURRENCY),
  model: parseStringArg('--model', ANTHROPIC_MODEL),
};

function parseIntArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return defaultValue;
  const v = parseInt(args[idx + 1], 10);
  return isNaN(v) ? defaultValue : v;
}

function parseStringArg(name, defaultValue) {
  const idx = args.indexOf(name);
  if (idx === -1 || idx === args.length - 1) return defaultValue;
  return args[idx + 1];
}

// --- Logger ---
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
}
function logError(msg, err) {
  const line = `[${new Date().toISOString()}] ERROR: ${msg} :: ${err?.message || err}`;
  console.error(line);
  fs.appendFileSync(LOG_PATH, line + '\n');
  if (err?.stack) fs.appendFileSync(LOG_PATH, err.stack + '\n');
}

// --- Load vocabulary ---
const vocab = JSON.parse(fs.readFileSync(VOCAB_PATH, 'utf8'));
const ALL_TAGS = new Set([
  ...vocab.primary.map(t => t.slug),
  ...vocab.subtype.map(t => t.slug),
  ...vocab.modifier.map(t => t.slug),
]);

// --- DB client (auto-detect pg) ---
let db;
async function initDb() {
  // Use the project's existing pool (server/db.js). It auto-loads server/.env
  // (so DB_* + ANTHROPIC_API_KEY are populated) and exposes query(sql, params)
  // matching the contract this script uses downstream.
  try {
    const projectDb = require('../db');
    await projectDb.query('SELECT 1');
    db = projectDb;
    log('Connected to PostgreSQL via server/db.js pool.');
    return;
  } catch (e) {
    logError('server/db.js connection failed', e);
    throw new Error(
      'Could not connect via server/db.js — check DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD in server/.env.'
    );
  }
}

// --- Heuristic auto-tags from structured fields ---
// These are deterministic — added BEFORE asking Claude, so the LLM doesn't waste
// tokens on what we can read directly.
function autoTagsFromFields(monster) {
  const tags = new Set();

  const mr = (monster.magic_resistance || '').toLowerCase().trim();
  if (mr && mr !== 'nil' && mr !== '0' && mr !== '0%' && /\d/.test(mr)) {
    tags.add('magic-resistant');
  }

  const align = (monster.alignment || '').toLowerCase();
  if (/\bevil\b/.test(align)) tags.add('evil');
  if (/\bgood\b/.test(align)) tags.add('good');
  if (/\blawful\b/.test(align)) tags.add('lawful');
  if (/\bchaotic\b/.test(align)) tags.add('chaotic');

  const intl = (monster.intelligence || '').toLowerCase();
  if (intl) {
    // Match patterns like "Average (8-10)", "High (13-14)", "Genius (17-18)"
    const numMatch = intl.match(/\((\d+)/);
    const num = numMatch ? parseInt(numMatch[1], 10) : null;
    if (num !== null) {
      if (num >= 8) tags.add('intelligent');
      else if (num <= 1) tags.add('mindless');
    } else {
      // Word-only intelligence labels
      if (/non[\s-]?|animal|semi-/i.test(intl)) tags.add('mindless');
      if (/very|high|exceptional|genius|supra|godlike/i.test(intl)) tags.add('intelligent');
    }
  }

  const sa = (monster.special_attacks || '').toLowerCase();
  const sd = (monster.special_defenses || '').toLowerCase();
  if (/regenerat/.test(sa) || /regenerat/.test(sd)) tags.add('regenerating');
  if (/incorporeal|ethereal/.test(sd)) tags.add('incorporeal');

  return [...tags];
}

// --- Build the Claude prompt ---
function buildPrompt(monsters) {
  const primaryList = vocab.primary.map(t => t.slug).join(', ');
  const subtypeList = vocab.subtype.map(t => t.slug).join(', ');
  const modifierList = vocab.modifier.map(t => t.slug).join(', ');

  // Trim each monster down to what's useful
  const slim = monsters.map(m => ({
    id: m.id,
    name: m.name,
    special_attacks: m.special_attacks,
    special_defenses: m.special_defenses,
    intelligence: m.intelligence,
    alignment: m.alignment,
    hit_dice: m.hit_dice,
    // 3000-char slice (bumped from 1500) — Sonnet 4.5's larger budget lets
    // us include richer monsters' full ability lists (Beholder eye-stalks,
    // Lich spell tables, etc.) without crowding the prompt.
    description: m.description ? m.description.slice(0, 3000) : null,
  }));

  return `You are classifying AD&D 2nd Edition monsters into a flat tag system.

CONTROLLED VOCABULARY (use ONLY these tags — anything not in these lists will be discarded):
- Primary type: ${primaryList}
- Subtype: ${subtypeList}
- Modifier: ${modifierList}

RULES:
- Tags are FLAT. A zombie golem gets ["undead","zombie","construct","golem"].
- Pick at least one PRIMARY tag.
- Add SUBTYPE tags only when the specific kind is identifiable.
- Use "spellcaster" only if the creature casts actual spells (not just supernatural abilities).
- Use "shapechanger" for creatures that change form (lycanthropes, dopplegangers, vampires).
- Skip alignment/intelligence modifiers — they are added automatically. Don't include: evil, good, lawful, chaotic, intelligent, mindless, magic-resistant, regenerating, incorporeal.
- If genuinely unsure, prefer FEWER tags over wrong tags.
- Read the description carefully — names can mislead (e.g. "Zombie Plant" is a plant, not undead).

Return ONLY a JSON array, no markdown:
[{"id":123,"tags":["..."],"confidence":"high"|"medium"|"low","note":"reason if not high"}]

MONSTERS:
${JSON.stringify(slim, null, 2)}`;
}

// --- Call Claude ---
async function classifyBatch(monsters) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');

  const prompt = buildPrompt(monsters);

  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!r.ok) {
    const errText = await r.text();
    throw new Error(`Claude API ${r.status}: ${errText.slice(0, 300)}`);
  }

  const result = await r.json();
  const text = result.content?.[0]?.text || '';
  const cleaned = text.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();

  // Sonnet 4.5 occasionally prefixes the JSON with a reasoning preamble
  // ("Looking at each monster carefully:\n\n1. ..."). Extract the first
  // JSON array from anywhere in the response instead of requiring it at
  // the very start. Falls back to plain parse on simple responses.
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch (eFirst) {
    const arrayStart = cleaned.indexOf('[');
    const arrayEnd   = cleaned.lastIndexOf(']');
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      try {
        parsed = JSON.parse(cleaned.slice(arrayStart, arrayEnd + 1));
      } catch (eSecond) {
        throw new Error(`Failed to parse Claude response (preamble-strip also failed): ${eSecond.message}\nRaw: ${text.slice(0, 500)}`);
      }
    } else {
      throw new Error(`No JSON array found in Claude response.\nRaw: ${text.slice(0, 500)}`);
    }
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Expected JSON array, got: ${typeof parsed}`);
  }

  return {
    classifications: parsed,
    usage: result.usage,
  };
}

// --- Validate + merge tags ---
function validateAndMergeTags(llmTags, autoTags) {
  const merged = new Set(autoTags);
  const dropped = [];

  for (const tag of (llmTags || [])) {
    if (typeof tag !== 'string') continue;
    const slug = tag.toLowerCase().trim();
    if (ALL_TAGS.has(slug)) {
      merged.add(slug);
    } else {
      dropped.push(slug);
    }
  }

  return { tags: [...merged].sort(), dropped };
}

// --- Concurrent batch processor ---
async function runBatchesConcurrently(batches) {
  const results = [];
  const failures = [];
  let totalIn = 0;
  let totalOut = 0;
  let processed = 0;

  for (let i = 0; i < batches.length; i += opts.concurrency) {
    const slice = batches.slice(i, i + opts.concurrency);
    const settled = await Promise.allSettled(slice.map(classifyBatch));

    for (let j = 0; j < settled.length; j++) {
      const batch = slice[j];
      const res = settled[j];
      if (res.status === 'fulfilled') {
        const { classifications, usage } = res.value;
        totalIn += usage?.input_tokens || 0;
        totalOut += usage?.output_tokens || 0;

        for (const cls of classifications) {
          const monster = batch.find(m => m.id === cls.id);
          if (!monster) continue;
          const auto = autoTagsFromFields(monster);
          const { tags, dropped } = validateAndMergeTags(cls.tags, auto);

          results.push({
            id: monster.id,
            name: monster.name,
            tags,
            confidence: cls.confidence,
            note: cls.note,
            dropped,
          });
          processed++;
        }
      } else {
        for (const m of batch) {
          failures.push({ id: m.id, name: m.name, error: res.reason?.message || String(res.reason) });
        }
        logError(`Batch failed: ${batch.map(m => m.id).join(',')}`, res.reason);
      }
    }

    const pct = Math.round((processed / batches.flat().length) * 100);
    log(`Progress: ${processed}/${batches.flat().length} (${pct}%) — in:${totalIn} out:${totalOut} tokens`);

    if (i + opts.concurrency < batches.length) {
      await new Promise(r => setTimeout(r, RATE_LIMIT_DELAY_MS));
    }
  }

  return { results, failures, totalIn, totalOut };
}

// --- Main ---
async function main() {
  fs.writeFileSync(LOG_PATH, '');
  log('Starting monster classification.');
  log(`Options: ${JSON.stringify(opts)}`);

  await initDb();

  // Find monsters to classify
  const where = opts.force ? '' : 'WHERE tags IS NULL OR jsonb_array_length(tags) = 0';
  const limitClause = opts.limit ? `LIMIT ${opts.limit}` : '';
  const sql = `
    SELECT id, name, special_attacks, special_defenses, intelligence,
           alignment, hit_dice, description
      FROM monsters
      ${where}
      ORDER BY id
      ${limitClause}
  `;

  let monsters;
  try {
    const result = await db.query(sql);
    monsters = result.rows;
  } catch (e) {
    // jsonb_array_length might not work if tags is TEXT not JSONB.
    // Fall back to a simpler check.
    log('jsonb_array_length not available — falling back to NULL check only.');
    const result = await db.query(`
      SELECT id, name, special_attacks, special_defenses, intelligence,
             alignment, hit_dice, description
        FROM monsters
        ${opts.force ? '' : 'WHERE tags IS NULL'}
        ORDER BY id
        ${limitClause}
    `);
    monsters = result.rows;
  }

  log(`Found ${monsters.length} monster(s) to classify.`);
  if (monsters.length === 0) {
    log('Nothing to do. Exiting.');
    await (db.end ? db.end() : db.pool?.end?.());
    return;
  }

  // Cost estimate
  const estCost = (monsters.length * 0.001).toFixed(2);
  log(`Estimated cost: ~$${estCost} (Haiku 4.5 pricing).`);

  if (!opts.dryRun) {
    const proceed = await prompt(`Proceed with ${monsters.length} monsters? (y/N) `);
    if (proceed.toLowerCase() !== 'y') {
      log('Cancelled by user.');
      await (db.end ? db.end() : db.pool?.end?.());
      return;
    }
  }

  // Build batches
  const batches = [];
  for (let i = 0; i < monsters.length; i += opts.batchSize) {
    batches.push(monsters.slice(i, i + opts.batchSize));
  }
  log(`Split into ${batches.length} batch(es) of up to ${opts.batchSize}.`);

  // Run
  const { results, failures, totalIn, totalOut } = await runBatchesConcurrently(batches);

  // Cost actual
  const actualCost = (totalIn * 1 / 1_000_000 + totalOut * 5 / 1_000_000).toFixed(4);
  log(`Tokens: ${totalIn} in / ${totalOut} out — actual cost ~$${actualCost}`);

  // Write back
  if (opts.dryRun) {
    log('DRY RUN — not writing to DB. Sample of first 10 results:');
    for (const r of results.slice(0, 10)) {
      log(`  #${r.id} ${r.name}: [${r.tags.join(', ')}] (${r.confidence})${r.dropped.length ? ` dropped:[${r.dropped.join(',')}]` : ''}`);
    }
  } else {
    log(`Writing ${results.length} tag updates to DB...`);
    let written = 0;
    for (const r of results) {
      try {
        await db.query('UPDATE monsters SET tags = $1::jsonb WHERE id = $2', [
          JSON.stringify(r.tags),
          r.id,
        ]);
        written++;
        if (opts.verbose) {
          log(`  #${r.id} ${r.name}: [${r.tags.join(', ')}] (${r.confidence})${r.dropped.length ? ` dropped:[${r.dropped.join(',')}]` : ''}`);
        }
      } catch (e) {
        // If jsonb cast fails, try plain JSON text
        try {
          await db.query('UPDATE monsters SET tags = $1 WHERE id = $2', [
            JSON.stringify(r.tags),
            r.id,
          ]);
          written++;
        } catch (e2) {
          logError(`Failed to write tags for monster ${r.id}`, e2);
        }
      }
    }
    log(`Wrote ${written} updates.`);
  }

  // Summary
  log('--- SUMMARY ---');
  log(`Processed:   ${results.length}`);
  log(`Failed:      ${failures.length}`);
  log(`High conf:   ${results.filter(r => r.confidence === 'high').length}`);
  log(`Medium conf: ${results.filter(r => r.confidence === 'medium').length}`);
  log(`Low conf:    ${results.filter(r => r.confidence === 'low').length}`);
  if (failures.length) {
    log(`Failures (first 10): ${JSON.stringify(failures.slice(0, 10))}`);
  }

  // Histogram of all tags
  const tagCounts = new Map();
  for (const r of results) {
    for (const t of r.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const sorted = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]);
  log('Top 20 tags by frequency:');
  for (const [tag, count] of sorted.slice(0, 20)) {
    log(`  ${tag.padEnd(20)} ${count}`);
  }

  await (db.end ? db.end() : db.pool?.end?.());
  log('Done.');
}

// --- Tiny y/N prompt helper ---
function prompt(question) {
  return new Promise(resolve => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.once('data', d => {
      process.stdin.pause();
      resolve(d.toString().trim());
    });
  });
}

main().catch(err => {
  logError('Fatal error in main', err);
  process.exit(1);
});
