/**
 * monsterEngine.js
 * AD&D 2E monster rules: armor profiles, HP generation, grace damage.
 *
 * HP generation is delegated to monsterHp.js (ChatGPT formula).
 * computeGeneratedHp() is re-exported here for backward compatibility.
 */
import armorProfiles from '../rulesets/monsters/armorProfiles.json';
import { computeGeneratedHp as _computeGeneratedHp } from './monsterHp.js';

// ── Lookup helpers ────────────────────────────────────────────────────────

/** @returns {object|null} */
export function getArmorProfile(id) {
  return armorProfiles.find(p => p.id === (id ?? 'none')) ?? armorProfiles.find(p => p.id === 'none');
}

export function getAllArmorProfiles() {
  return armorProfiles;
}

// ── HP generation ─────────────────────────────────────────────────────────
//
// Delegated to monsterHp.js (ChatGPT formula).
// Returns a plain number for backward compatibility with callers
// that do not need the full breakdown object.

/**
 * Compute generated HP for a monster.
 * @param {object} monster — { size, type, hit_dice, role? }
 * @returns {number}
 */
export function computeGeneratedHp(monster) {
  return _computeGeneratedHp(monster).generatedHpFinal;
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
  const effective  = Math.max(0, rawDamage - flatReduce);
  return {
    effective,
    reduced: rawDamage - effective,
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
  if (parts.length === 0) parts.push('no reduction');

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
