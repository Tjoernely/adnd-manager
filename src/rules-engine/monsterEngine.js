/**
 * monsterEngine.js
 * AD&D 2E monster rules: armor profiles, HP generation, grace damage.
 */
import armorProfiles from '../rulesets/monsters/armorProfiles.json';

// ── Lookup helpers ────────────────────────────────────────────────────────

/** @returns {object|null} */
export function getArmorProfile(id) {
  return armorProfiles.find(p => p.id === (id ?? 'none')) ?? armorProfiles.find(p => p.id === 'none');
}

export function getAllArmorProfiles() {
  return armorProfiles;
}

// ── HP generation ─────────────────────────────────────────────────────────

const SIZE_BASE = {
  tiny:        20,
  small:       40,
  medium:      80,
  large:      180,
  huge:       400,
  gargantuan: 900,
};

const KIND_MOD = {
  humanoid:   1.0,
  beast:      1.2,
  monstrous:  1.4,
  undead:     1.6,
  construct:  2.0,
  dragon:     2.2,
};

/**
 * Parse hit dice string like "2+2", "10", "3d8" → numeric value.
 */
function parseHitDice(hdStr) {
  if (!hdStr) return 1;
  const s = String(hdStr).trim().toLowerCase();
  // "3d8" → 3; "2+2" → 2; "10" → 10; "1/2" → 0.5
  const dMatch = s.match(/^(\d+(?:\.\d+)?)d/);
  if (dMatch) return parseFloat(dMatch[1]);
  const plusMatch = s.match(/^(\d+(?:\.\d+)?)/);
  if (plusMatch) return parseFloat(plusMatch[1]);
  return 1;
}

/**
 * Derive a monster "kind" from its type string for HP generation.
 */
function deriveKind(type) {
  if (!type) return 'monstrous';
  const t = type.toLowerCase();
  if (t.includes('dragon'))    return 'dragon';
  if (t.includes('construct') || t.includes('golem')) return 'construct';
  if (t.includes('undead'))    return 'undead';
  if (t.includes('humanoid'))  return 'humanoid';
  if (t.includes('animal') || t.includes('beast')) return 'beast';
  return 'monstrous';
}

/**
 * Compute generated (estimated) HP for a monster.
 * @param {object} monster — { size, type, hit_dice }
 * @returns {number}
 */
export function computeGeneratedHp(monster) {
  const sizeKey = (monster.size ?? 'medium').toLowerCase();
  const base    = SIZE_BASE[sizeKey] ?? SIZE_BASE.medium;
  const kind    = deriveKind(monster.type);
  const kindM   = KIND_MOD[kind] ?? 1.0;
  const hd      = parseHitDice(monster.hit_dice);
  return Math.round(base * kindM * (1 + hd * 0.12));
}

// ── Grace damage ──────────────────────────────────────────────────────────

/**
 * Apply armor profile to raw damage, returning effective damage.
 * @param {number}  rawDamage
 * @param {string}  armorProfileId
 * @param {string}  damageType  — 'slashing'|'piercing'|'bludgeoning'|'fire'|etc.
 * @returns {{ effective: number, reduced: number, graceFloor: number }}
 */
export function applyGraceDamage(rawDamage, armorProfileId, damageType = 'slashing') {
  const profile    = getArmorProfile(armorProfileId);
  const flatReduce = profile.reductionByType[damageType] ?? 0;
  const graceFloor = Math.ceil(rawDamage * profile.gracePct);
  const afterFlat  = Math.max(0, rawDamage - flatReduce);
  // Effective = max of grace floor or flat-reduced value
  const effective  = Math.max(graceFloor, afterFlat);
  return {
    effective,
    reduced:    rawDamage - effective,
    graceFloor,
  };
}

/**
 * Human-readable description of how a hit works against a monster.
 */
export function describeHitLogic(monster, damageType = 'slashing') {
  const profile = getArmorProfile(monster.armor_profile_id);
  const flat    = profile.reductionByType[damageType] ?? 0;
  const parts   = [];

  if (flat > 0) parts.push(`${flat} flat reduction vs ${damageType}`);
  if (flat < 0) parts.push(`+${Math.abs(flat)} bonus damage vs ${damageType}`);

  parts.push(`≥${Math.round(profile.gracePct * 100)}% of raw damage always gets through`);

  return `${profile.name}: ${parts.join(', ')}.`;
}

/**
 * Auto-assign armor profile id based on monster type string.
 * Used during import.
 */
export function autoAssignArmorProfile(monster) {
  const type = (monster.type ?? '').toLowerCase();
  const name = (monster.name ?? '').toLowerCase();
  const ac   = monster.armor_class ?? 10;

  if (type.includes('dragon'))                      return 'dragon_scales';
  if (type.includes('construct') || type.includes('golem')) return 'stone_body';
  if (type.includes('undead')) {
    // skeletal undead have no flesh
    if (name.includes('skeleton') || name.includes('zombie')) return 'none';
    return 'dense_flesh'; // wight, vampire, etc.
  }
  if (type.includes('giant') || type.includes('ogre') ||
      name.includes('giant') || name.includes('ogre') ||
      name.includes('troll') || name.includes('ettin')) return 'thick_hide';

  // Beetles, crabs, scorpions, spiders, ants → carapace
  if (name.includes('beetle') || name.includes('crab') ||
      name.includes('scorpion') || name.includes('ant') ||
      name.includes('spider'))                        return 'carapace';

  // Large beasts
  if ((type.includes('animal') || type.includes('beast')) &&
      ['large','huge','gargantuan'].includes((monster.size ?? '').toLowerCase())) {
    return 'thick_hide';
  }

  // Armored humanoids
  if (type.includes('humanoid')) {
    if (ac <= 3) return 'plate';
    if (ac <= 5) return 'chain';
    return 'none';
  }

  return 'dense_flesh';
}
