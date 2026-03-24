/**
 * recalculate-monster-hp.mjs
 *
 * Recalculates generated_hp, generated_hp_base, random_roll and
 * random_modifier for every monster in the DB using the ChatGPT formula.
 *
 * Usage (from server/ directory):
 *   node recalculate-monster-hp.mjs
 *   DB_HOST=… DB_NAME=… DB_USER=… DB_PASSWORD=… node recalculate-monster-hp.mjs
 */

import pg from 'pg';

const { Pool } = pg;

// ── DB connection (mirrors server/db.js) ─────────────────────────────────────

const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME     || 'adnd_manager',
  user:     process.env.DB_USER     || 'adnd',
  password: process.env.DB_PASSWORD,
});

// ── Inline HP formula (mirrors src/rules-engine/monsterHp.js) ───────────────

const SIZE_MODIFIERS = {
  tiny:       0.7,
  small:      0.9,
  medium:     1.0,
  large:      2.0,
  huge:       2.7,
  gargantuan: 3.6,
  colossal:   5.5,
};

const TYPE_MODIFIERS = {
  humanoid:  1.0,
  beast:     1.2,
  monstrous: 1.4,
  undead:    1.6,
  construct: 2.0,
  elemental: 1.8,
  dragon:    2.2,
};

const ROLE_MODIFIERS = { normal: 1.0, elite: 1.5, boss: 2.5 };

function parseHitDice(hdStr) {
  if (!hdStr) return 1;
  const s = String(hdStr).trim().toLowerCase();

  // Strip parenthetical annotations before any space or '('
  // e.g. "14 (base)" → "14",  "22 (177 hp)" → "22"
  const clean = s.split(/[\s(]/)[0];

  const dMatch = clean.match(/^(\d+(?:\.\d+)?)d/);
  if (dMatch) return parseFloat(dMatch[1]);
  const fracMatch = clean.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);
  const bonusMatch = clean.match(/^(\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
  if (bonusMatch) {
    const base  = parseFloat(bonusMatch[1]);
    const bonus = parseFloat(bonusMatch[3]);
    return bonusMatch[2] === '+' ? base + bonus / 8 : base - bonus / 8;
  }
  return parseFloat(clean) || 1;
}

function computeBaseHp(hitDice) {
  return Math.max(1, Math.round(parseHitDice(hitDice) * 10));
}

function getSizeModifier(size) {
  return SIZE_MODIFIERS[(size ?? 'medium').toLowerCase()] ?? 1.0;
}

function deriveKind(type) {
  if (!type) return 'monstrous';
  const t = type.toLowerCase();
  if (t.includes('dragon'))                             return 'dragon';
  if (t.includes('construct') || t.includes('golem'))  return 'construct';
  if (t.includes('undead'))                             return 'undead';
  if (t.includes('elemental'))                          return 'elemental';
  if (t.includes('humanoid'))                           return 'humanoid';
  if (t.includes('animal') || t.includes('beast'))     return 'beast';
  return 'monstrous';
}

function getTypeModifier(kind) {
  return TYPE_MODIFIERS[(kind ?? 'monstrous').toLowerCase()] ?? 1.4;
}

function getRoleModifier(role) {
  return ROLE_MODIFIERS[(role ?? 'normal').toLowerCase()] ?? 1.0;
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function computeRandomModifier(roll) {
  return 0.9 + ((roll - 1) / 19) * 0.2;
}

function roundHp(v) {
  return Math.max(1, Math.round(v));
}

function computeGeneratedHp(monster) {
  const baseHp       = computeBaseHp(monster.hit_dice);
  const sizeModifier = getSizeModifier(monster.size);
  const typeModifier = getTypeModifier(deriveKind(monster.type));
  const roleModifier = getRoleModifier(monster.role ?? 'normal');
  const generatedHpBase  = baseHp * sizeModifier * typeModifier * roleModifier;
  const randomRoll       = rollD20();
  const randomModifier   = computeRandomModifier(randomRoll);
  const generatedHpFinal = roundHp(generatedHpBase * randomModifier);
  return {
    generatedHpBase:   Math.round(generatedHpBase),
    randomRoll,
    randomModifier,
    generatedHpFinal,
  };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('[recalc-hp] Connecting to DB…');

  // Fetch all monsters
  const { rows: monsters } = await pool.query(
    'SELECT id, name, hit_dice, size, type, role FROM monsters ORDER BY id'
  );
  console.log(`[recalc-hp] Found ${monsters.length} monsters. Recalculating…\n`);

  let updated = 0;
  let errors  = 0;

  for (const m of monsters) {
    try {
      const hp = computeGeneratedHp(m);

      await pool.query(
        `UPDATE monsters
         SET generated_hp      = $1,
             generated_hp_base = $2,
             random_roll       = $3,
             random_modifier   = $4
         WHERE id = $5`,
        [hp.generatedHpFinal, hp.generatedHpBase, hp.randomRoll, hp.randomModifier, m.id],
      );

      // Log first 10 for verification
      if (updated < 10) {
        console.log(
          `  [${String(m.id).padStart(5)}] ${(m.name ?? '?').padEnd(36)} ` +
          `HD=${String(m.hit_dice ?? '?').padEnd(6)} ` +
          `size=${String(m.size ?? '?').padEnd(10)} ` +
          `→ base=${hp.generatedHpBase}, roll=${hp.randomRoll}/20, final=${hp.generatedHpFinal}`
        );
      }
      updated++;
    } catch (e) {
      console.error(`  ERROR on id=${m.id} (${m.name}):`, e.message);
      errors++;
    }
  }

  console.log(`\n[recalc-hp] Done. Updated: ${updated}  Errors: ${errors}`);
  await pool.end();
}

main().catch(e => {
  console.error('[recalc-hp] Fatal:', e.message);
  process.exit(1);
});
