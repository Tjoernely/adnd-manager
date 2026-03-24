/**
 * monsterHp.js
 * AD&D 2E monster HP generation formulae.
 *
 * Formula:
 *   generatedHp = baseHp × sizeModifier × typeModifier × roleModifier × randomModifier
 *   baseHp      = hitDiceValue × 10
 *   randomModifier = 0.9 + ((d20roll - 1) / 19) * 0.2   → range [0.9, 1.1]
 */

// ── Modifier tables ───────────────────────────────────────────────────────────

export const SIZE_MODIFIERS = {
  tiny:       0.7,
  small:      0.9,
  medium:     1.0,
  large:      2.0,
  huge:       2.7,
  gargantuan: 3.6,
  colossal:   5.5,
};

export const TYPE_MODIFIERS = {
  humanoid:  1.0,
  beast:     1.2,
  monstrous: 1.4,
  undead:    1.6,
  construct: 2.0,
  elemental: 1.8,
  dragon:    2.2,
};

export const ROLE_MODIFIERS = {
  normal: 1.0,
  elite:  1.5,
  boss:   2.5,
};

// ── Hit dice parsing ──────────────────────────────────────────────────────────

/**
 * Parse an AD&D hit dice string to a numeric value.
 *   "6+6"  → 6 + 6/8 = 6.75  (bonus adds fractional HD)
 *   "1-1"  → 1 - 1/8 = 0.875
 *   "13"   → 13
 *   "3d8"  → 3
 *   "1/2"  → 0.5
 */
export function parseHitDice(hdStr) {
  if (!hdStr) return 1;
  const s = String(hdStr).trim().toLowerCase();

  // Strip parenthetical annotations before any space or '('
  // e.g. "14 (base)" → "14",  "22 (177 hp)" → "22"
  const clean = s.split(/[\s(]/)[0];

  // "NdX" → take only the N part (ignore die size)
  const dMatch = clean.match(/^(\d+(?:\.\d+)?)d/);
  if (dMatch) return parseFloat(dMatch[1]);

  // "N/D" → fraction (e.g. "1/2")
  const fracMatch = clean.match(/^(\d+)\/(\d+)$/);
  if (fracMatch) return parseInt(fracMatch[1]) / parseInt(fracMatch[2]);

  // "N+B" or "N-B" bonus  →  base ± bonus/8
  const bonusMatch = clean.match(/^(\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
  if (bonusMatch) {
    const base  = parseFloat(bonusMatch[1]);
    const bonus = parseFloat(bonusMatch[3]);
    return bonusMatch[2] === '+' ? base + bonus / 8 : base - bonus / 8;
  }

  // Plain number: "14", "13"
  return parseFloat(clean) || 1;
}

// ── Base HP ───────────────────────────────────────────────────────────────────

/** baseHp = hitDiceValue × 10, minimum 1 */
export function computeBaseHp(hitDice) {
  return Math.max(1, Math.round(parseHitDice(hitDice) * 10));
}

// ── Modifier accessors ────────────────────────────────────────────────────────

export function getSizeModifier(size) {
  if (!size) return 1.0;
  const s = String(size).trim().toLowerCase();

  // Full word match first (handles "medium", "large", "M (20' Wingspan)", etc.)
  const wordMap = {
    tiny: 0.7, small: 0.9, medium: 1.0,
    large: 2.0, huge: 2.7, gargantuan: 3.6, colossal: 5.5,
  };
  for (const [key, val] of Object.entries(wordMap)) {
    if (s.startsWith(key)) return val;
  }

  // Single letter: T, S, M, L, H, G, C  (handles "M (20' Wingspan)", "L (9'+ tall)")
  const letterMap = { t: 0.7, s: 0.9, m: 1.0, l: 2.0, h: 2.7, g: 3.6, c: 5.5 };
  return letterMap[s[0]] ?? 1.0;
}

export function getTypeModifier(kind) {
  return TYPE_MODIFIERS[(kind ?? 'monstrous').toLowerCase()] ?? 1.4;
}

export function getRoleModifier(role) {
  return ROLE_MODIFIERS[(role ?? 'normal').toLowerCase()] ?? 1.0;
}

// ── Kind derivation ───────────────────────────────────────────────────────────

/** Map a monster's raw type string to a recognised kind key. */
export function deriveKind(type) {
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

// ── Random modifier ───────────────────────────────────────────────────────────

/** Returns integer 1–20. */
export function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Convert a d20 roll to a multiplier in [0.9, 1.1].
 *   roll = 1  → 0.9  (−10%)
 *   roll = 20 → 1.1  (+10%)
 */
export function computeRandomModifier(roll) {
  return 0.9 + ((roll - 1) / 19) * 0.2;
}

/** Round HP to integer, minimum 1. */
export function roundHp(value) {
  return Math.max(1, Math.round(value));
}

// ── Primary compute function ──────────────────────────────────────────────────

/**
 * Compute all HP fields for a monster from scratch (rolls a fresh d20).
 *
 * @param {object} monster — { hit_dice, size, type, kind?, role? }
 * @returns {{
 *   baseHp:          number,
 *   sizeModifier:    number,
 *   typeModifier:    number,
 *   roleModifier:    number,
 *   generatedHpBase: number,   ← before random
 *   randomRoll:      number,   ← 1–20
 *   randomModifier:  number,   ← 0.9–1.1
 *   generatedHpFinal:number,   ← rounded final
 * }}
 */
export function computeGeneratedHp(monster) {
  const baseHp       = computeBaseHp(monster.hit_dice);
  const sizeModifier = getSizeModifier(monster.size);
  const typeModifier = getTypeModifier(monster.kind ?? deriveKind(monster.type));
  const roleModifier = getRoleModifier(monster.role ?? 'normal');

  const generatedHpBase  = baseHp * sizeModifier * typeModifier * roleModifier;
  const randomRoll       = rollD20();
  const randomModifier   = computeRandomModifier(randomRoll);
  const generatedHpFinal = roundHp(generatedHpBase * randomModifier);

  return {
    baseHp,
    sizeModifier,
    typeModifier,
    roleModifier,
    generatedHpBase:   Math.round(generatedHpBase),
    randomRoll,
    randomModifier,
    generatedHpFinal,
  };
}

/**
 * Format a hit_dice string as a vanilla HP range: "min–max HP"
 * Uses d8 (1–8 per die). Minimum result is 1.
 *   "3+3"  → 6–27 HP
 *   "1-1"  → 1–7 HP
 *   "13"   → 13–104 HP
 */
export function formatVanillaHp(hit_dice) {
  if (!hit_dice) return '—';
  const s = String(hit_dice).trim();
  const match = s.match(/^(\d+(?:\.\d+)?)([+-])(\d+(?:\.\d+)?)$/);
  let hdBase, bonus;
  if (match) {
    hdBase = parseFloat(match[1]);
    bonus  = parseFloat(match[3]) * (match[2] === '+' ? 1 : -1);
  } else {
    hdBase = parseFloat(s) || 1;
    bonus  = 0;
  }
  const dice = Math.ceil(hdBase);
  const min  = Math.max(1, dice * 1 + bonus);
  const max  = dice * 8 + bonus;
  return `${min}–${max} HP`;
}

/**
 * Re-roll only the random component, keeping the existing base HP fixed.
 *
 * @param {number} generatedHpBase — stored base (before random)
 * @returns {{ randomRoll, randomModifier, generatedHpFinal }}
 */
export function rerollHp(generatedHpBase) {
  const randomRoll       = rollD20();
  const randomModifier   = computeRandomModifier(randomRoll);
  const generatedHpFinal = roundHp(generatedHpBase * randomModifier);
  return { randomRoll, randomModifier, generatedHpFinal };
}
