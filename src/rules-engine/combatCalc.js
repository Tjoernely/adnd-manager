/**
 * combatCalc.js
 * Combat statistics calculation engine for AD&D 2E S&P characters.
 *
 * Takes characterData (serialized snapshot — output of serializeCharacter())
 * and equippedItems (character_equipment rows with is_equipped=true).
 *
 * Exports:
 *   calcAC(characterData, equippedItems)         → { finalAC, breakdown }
 *   calcDR(equippedItems)                        → { slashing, piercing, bludgeoning }
 *   calcWeaponThac0(weapon, characterData)       → { finalThac0, breakdown }
 *   calcWeaponDamage(weapon, characterData)      → { damageSM, damageL, breakdown }
 *   calcAttacksPerRound(weapon, characterData)   → { attacks, breakdown }
 */

import {
  SUB_PARENT,
  getMuscleStats, getAimStats, getBalanceStats,
} from '../data/abilities.js';
import { RACES, SUB_RACES }            from '../data/races.js';
import { ALL_CLASSES, CLASS_ABILITIES } from '../data/classes.js';
import { CLASS_GROUP_MAP }             from '../data/proficiencies.js';
import { MASTERY_TIERS, WEAPON_GROUPS_49 } from '../data/weapons.js';

// ── Sub-ability score computation ─────────────────────────────────────────────
// Mirrors the effSub pipeline in CharacterPrintView / useCharacter.

function getSubAbility(cd, subId) {
  const parent = SUB_PARENT[subId];
  if (!parent) return 10;

  const baseScores      = cd.baseScores    ?? {};
  const splitMods       = cd.splitMods     ?? {};
  const racialPicked    = cd.racialPicked  ?? {};
  const abilChosenSub   = cd.abilChosenSub ?? {};

  const raceData    = RACES.find(r => r.id === cd.selectedRace) ?? null;
  const subRaceData = raceData
    ? (SUB_RACES[cd.selectedRace] ?? []).find(sr => sr.id === cd.selectedSubRace) ?? null
    : null;

  // Step 1: parent score + racial parent mods
  const raceStatMods = raceData?.baseStatMods ?? {};
  const modParent    = Math.min(25, Math.max(1,
    (baseScores[parent] ?? 10) + (raceStatMods[parent] ?? 0),
  ));

  // Step 2: racial sub-ability deltas from active abilities
  let racialSubDelta = 0;
  if (raceData) {
    const pkgIds   = subRaceData?.id !== 'custom' ? (subRaceData?.abilityIds ?? []) : [];
    const indivIds = Object.keys(racialPicked).filter(id => racialPicked[id]);
    const active   = new Set([...pkgIds, ...indivIds]);
    for (const ab of raceData.abilities) {
      if (!active.has(ab.id) || !ab.statLink) continue;
      const linkedSub = ab.statLink.sub === 'choose'
        ? (abilChosenSub[ab.id] ?? null)
        : ab.statLink.sub;
      if (linkedSub === subId) racialSubDelta += ab.statLink.delta;
    }
  }

  return Math.min(25, Math.max(1, modParent + racialSubDelta + (splitMods[subId] ?? 0)));
}

// ── Exceptional strength detection ───────────────────────────────────────────

function getExStrPct(cd) {
  const muscle = getSubAbility(cd, 'muscle');
  if (muscle !== 18) return 0;
  const classData      = ALL_CLASSES.find(c => c.id === cd.selectedClass) ?? null;
  const classAbils     = CLASS_ABILITIES[cd.selectedClass] ?? [];
  const abilGrantsExStr = classAbils.some(
    a => a.allowsExStr && (cd.classAbilPicked ?? {})[a.id],
  );
  const exStrActive = !!classData?.allowsExStr || abilGrantsExStr;
  return exStrActive ? (cd.exPcts?.muscle ?? 0) : 0;
}

// ── Class group + THAC0 ───────────────────────────────────────────────────────

function getClassGroup(cd) {
  return CLASS_GROUP_MAP[cd.selectedClass] ?? null;
}

// AD&D 2E base THAC0 by class group (matches CharacterPrintView)
function getClassThac0(cd) {
  const group = getClassGroup(cd);
  const lv    = Math.max(1, parseInt(cd.charLevel) || 1);
  if (group === 'warrior') return 21 - lv;
  if (group === 'priest')  return 20 - 2 * Math.floor((lv - 1) / 3);
  if (group === 'rogue')   return 20 - Math.floor((lv - 1) / 2);
  if (group === 'wizard')  return 20 - Math.floor((lv - 1) / 3);
  return 20; // no class selected
}

// ── Weapon name → mastery entry lookup ───────────────────────────────────────
// Builds a flat list of { weapId, name } from WEAPON_GROUPS_49 once.

const WEAP_ID_TO_NAME = (() => {
  const map = {};
  for (const bg of WEAPON_GROUPS_49) {
    for (const tg of bg.tightGroups) {
      for (const w of tg.weapons) { map[w.id] = w.name.toLowerCase(); }
    }
    for (const w of bg.unrelated ?? []) { map[w.id] = w.name.toLowerCase(); }
  }
  return map;
})();

/**
 * Returns the masteryPicked entry for the given equipped weapon, or null.
 * Matches by checking if any masteryPicked key's weapon name is a substring
 * of the item name (case-insensitive), or vice-versa.
 */
function findMasteryEntry(weapon, cd) {
  const masteryPicked = cd.masteryPicked ?? {};
  const itemName      = (weapon.name ?? '').toLowerCase();

  for (const [weapId, entry] of Object.entries(masteryPicked)) {
    if (!entry?.tier) continue;
    const catalogName = WEAP_ID_TO_NAME[weapId];
    if (!catalogName) continue;
    // Consider proficient if names share a meaningful substring
    const base = catalogName.split(',')[0];           // e.g. "long sword"
    if (itemName.includes(base) || base.includes(itemName.split(',')[0])) {
      return entry; // { tier, type }
    }
  }
  return null;
}

// ── Weapon proficiency check ──────────────────────────────────────────────────

function isWeaponProficient(weapon, cd) {
  const weapPicked = cd.weapPicked ?? {};
  const itemName   = (weapon.name ?? '').toLowerCase();

  for (const bg of WEAPON_GROUPS_49) {
    // Broad group
    if (weapPicked[bg.id]) {
      for (const tg of bg.tightGroups) {
        for (const w of tg.weapons) {
          if (itemName.includes(w.name.toLowerCase()) ||
              w.name.toLowerCase().includes(itemName.split(',')[0])) return true;
        }
      }
      for (const w of bg.unrelated ?? []) {
        if (itemName.includes(w.name.toLowerCase()) ||
            w.name.toLowerCase().includes(itemName.split(',')[0])) return true;
      }
    }
    // Tight group
    for (const tg of bg.tightGroups) {
      if (weapPicked[tg.id]) {
        for (const w of tg.weapons) {
          if (itemName.includes(w.name.toLowerCase()) ||
              w.name.toLowerCase().includes(itemName.split(',')[0])) return true;
        }
      }
      // Single weapon
      for (const w of tg.weapons) {
        if (weapPicked[w.id] && (
          itemName.includes(w.name.toLowerCase()) ||
          w.name.toLowerCase().includes(itemName.split(',')[0])
        )) return true;
      }
    }
    // Unrelated singles
    for (const w of bg.unrelated ?? []) {
      if (weapPicked[w.id] && (
        itemName.includes(w.name.toLowerCase()) ||
        w.name.toLowerCase().includes(itemName.split(',')[0])
      )) return true;
    }
  }
  return false;
}

function getNonProfPenalty(cd) {
  const group = getClassGroup(cd);
  if (group === 'warrior') return 2;
  if (group === 'priest')  return 3;
  if (group === 'rogue')   return 3;
  if (group === 'wizard')  return 5;
  return 2;
}

// ── Racial weapon bonus ───────────────────────────────────────────────────────

function getRacialWeaponBonus(weapon, cd) {
  const race       = (cd.selectedRace ?? '').toLowerCase();
  const weaponName = (weapon.name ?? '').toLowerCase();

  // Elves: –1 THAC0 with bows and long/short swords
  if (race.includes('elf')) {
    if (weaponName.includes('bow') ||
        weaponName.includes('long sword') ||
        weaponName.includes('short sword')) return -1;
  }
  // Halflings: –1 THAC0 with slings and thrown (ranged) weapons
  if (race.includes('halfling') || race.includes('half')) {
    if (weaponName.includes('sling') || weapon.item_type === 'ranged') return -1;
  }
  return 0;
}

// ── Weapon of choice bonus ────────────────────────────────────────────────────

function getWocBonus(weapon, cd) {
  const woc        = (cd.wocPicked ?? '').toLowerCase();
  if (!woc) return 0;
  const weaponName = (weapon.name ?? '').toLowerCase();
  // wocPicked is a weaponId like "ws_long_sword"
  const catalogName = WEAP_ID_TO_NAME[woc] ?? woc.replace(/^w[a-z]_/, '').replace(/_/g, ' ');
  const base = catalogName.split(',')[0];
  if (weaponName.includes(base) || base.includes(weaponName.split(',')[0])) return -1;
  return 0;
}

// ── Mastery hit/damage bonuses ────────────────────────────────────────────────

function getMasteryHitBonus(entry) {
  if (!entry?.tier) return 0;
  const tier = MASTERY_TIERS.find(t => t.id === entry.tier);
  if (!tier) return 0;
  return typeof tier.hit === 'number' ? -tier.hit : 0; // negative = better THAC0
}

function getMasteryDmgBonus(entry) {
  if (!entry?.tier) return 0;
  const tier = MASTERY_TIERS.find(t => t.id === entry.tier);
  if (!tier) return 0;
  const dmg = entry.type === 'ranged' ? tier.dmgR : tier.dmgM;
  // dmgR can be a string like "*2 (+2 short range)" — extract leading number
  if (typeof dmg === 'number') return dmg;
  if (typeof dmg === 'string') {
    const m = dmg.match(/\+(\d+)/);
    return m ? parseInt(m[1]) : 0;
  }
  return 0;
}

// ═════════════════════════════════════════════════════════════════════════════
//  PUBLIC EXPORTS
// ═════════════════════════════════════════════════════════════════════════════

// ── AC CALCULATION ────────────────────────────────────────────────────────────

/**
 * Calculate Armor Class for a character.
 * @param {object} characterData  — serialized character state
 * @param {Array}  equippedItems  — character_equipment rows with is_equipped=true
 * @returns {{ finalAC: number, breakdown: object }}
 */
export function calcAC(characterData, equippedItems) {
  const cd   = characterData ?? {};
  const base = 10;

  // Worn armor (slot 'body', item_type 'armor')
  const armor   = equippedItems.find(i => i.slot === 'body' && i.item_type === 'armor');
  const armorAC = armor ? (armor.armor_ac ?? 0) : 0;

  // Shield (slot 'hand_l', item_type 'shield')
  const shield   = equippedItems.find(i => i.slot === 'hand_l' && i.item_type === 'shield');
  const shieldAC = shield ? (shield.armor_ac ?? 0) : 0;

  // Balance (Dex) defensive adjustment — negative = better AC
  const balance  = getSubAbility(cd, 'balance');
  const dexACMod = getBalanceStats(balance).defAdj ?? 0;

  // Magic AC bonus from all identified equipped items
  const magicAC = equippedItems
    .filter(i => i.slot && i.identify_state === 'identified')
    .reduce((sum, i) => sum + (i.magic_bonus ?? 0), 0);

  const finalAC = base + armorAC + shieldAC + dexACMod + magicAC;

  return {
    finalAC,
    breakdown: { base, armorAC, shieldAC, dexACMod, magicAC },
  };
}

// ── DR (DAMAGE REDUCTION) ─────────────────────────────────────────────────────

/**
 * Return damage reduction from equipped armor (if any).
 * Values come from the armor_catalog dr columns copied onto character_equipment
 * when the item was added via catalog.
 * @param {Array} equippedItems
 * @returns {{ slashing: number, piercing: number, bludgeoning: number }}
 */
export function calcDR(equippedItems) {
  const armor = equippedItems.find(i => i.slot === 'body' && i.item_type === 'armor');
  if (!armor) return { slashing: 0, piercing: 0, bludgeoning: 0 };
  return {
    slashing:    armor.dr_slashing    ?? 0,
    piercing:    armor.dr_piercing    ?? 0,
    bludgeoning: armor.dr_bludgeoning ?? 0,
  };
}

// ── THAC0 PER WEAPON ──────────────────────────────────────────────────────────

/**
 * Calculate THAC0 for a specific equipped weapon.
 * @param {object} weapon        — character_equipment row (slot hand_r, hand_l, or ranged)
 * @param {object} characterData — serialized character state
 * @returns {{ finalThac0: number, breakdown: object }}
 */
export function calcWeaponThac0(weapon, characterData) {
  const cd       = characterData ?? {};
  const isRanged = weapon.item_type === 'ranged' ||
                   (weapon.range_str && weapon.range_str !== '—' && weapon.item_type !== 'weapon');

  // 1. Base THAC0 from class + level
  const baseThac0 = getClassThac0(cd);

  // 2. Ability modifier
  const exStrPct    = getExStrPct(cd);
  const muscle      = getSubAbility(cd, 'muscle');
  const aim         = getSubAbility(cd, 'aim');
  const muscleStats = getMuscleStats(muscle, exStrPct);
  const abilityMod  = isRanged
    ? -(getAimStats(aim).missileAdj ?? 0)
    : -(muscleStats.attAdj ?? 0);

  // 3. Non-proficiency penalty (positive = worse THAC0)
  const profBonus = isWeaponProficient(weapon, cd) ? 0 : getNonProfPenalty(cd);

  // 4–5. Mastery bonuses (specialization, mastery tiers)
  const masteryEntry  = findMasteryEntry(weapon, cd);
  const masteryHitMod = getMasteryHitBonus(masteryEntry); // already negative

  // 6. Weapon of choice (–1 to THAC0 = better)
  const wocBonus = getWocBonus(weapon, cd);

  // 7. Magic weapon bonus (only if identified; negative = better)
  const magicBonus = weapon.identify_state === 'identified'
    ? -(weapon.magic_bonus ?? 0)
    : 0;

  // 8. Racial bonus (negative = better)
  const racialBonus = getRacialWeaponBonus(weapon, cd);

  const finalThac0 = baseThac0 + abilityMod + profBonus
                   + masteryHitMod + wocBonus + magicBonus + racialBonus;

  return {
    finalThac0,
    breakdown: {
      baseThac0,
      abilityMod,
      profBonus,
      masteryHitMod,
      wocBonus,
      magicBonus,
      racialBonus,
    },
  };
}

// ── DAMAGE PER WEAPON ─────────────────────────────────────────────────────────

/**
 * Calculate damage string(s) for a specific equipped weapon.
 * @param {object} weapon        — character_equipment row
 * @param {object} characterData — serialized character state
 * @returns {{ damageSM: string, damageL: string, breakdown: object }}
 */
export function calcWeaponDamage(weapon, characterData) {
  const cd       = characterData ?? {};
  const isRanged = weapon.item_type === 'ranged';

  // Base damage from item (damage_s_m / damage_l)
  const baseDamageSM = weapon.damage_s_m ?? weapon.damage_sm ?? '1d6';
  const baseDamageL  = weapon.damage_l ?? '1d6';

  // Strength damage bonus (melee only)
  const exStrPct    = getExStrPct(cd);
  const muscle      = getSubAbility(cd, 'muscle');
  const muscleStats = getMuscleStats(muscle, exStrPct);
  const strDmgBonus = isRanged ? 0 : (muscleStats.dmgAdj ?? 0);

  // Mastery damage bonus
  const masteryEntry  = findMasteryEntry(weapon, cd);
  const masteryDmgMod = getMasteryDmgBonus(masteryEntry);

  // Magic damage bonus (only if identified)
  const magicDmgBonus = weapon.identify_state === 'identified'
    ? (weapon.magic_bonus ?? 0)
    : 0;

  const totalBonus = strDmgBonus + masteryDmgMod + magicDmgBonus;
  const bonusStr   = totalBonus > 0 ? `+${totalBonus}`
                   : totalBonus < 0 ? `${totalBonus}`
                   : '';

  return {
    damageSM: `${baseDamageSM}${bonusStr}`,
    damageL:  `${baseDamageL}${bonusStr}`,
    breakdown: { baseDamageSM, baseDamageL, strDmgBonus, masteryDmgMod, magicDmgBonus, totalBonus },
  };
}

// ── ATTACKS PER ROUND ─────────────────────────────────────────────────────────

/**
 * Calculate attacks per round for a weapon.
 * Returns a display string: "1", "3/2", "2", "5/2", etc.
 *
 * @param {object} weapon        — character_equipment row
 * @param {object} characterData — serialized character state
 * @param {Array}  equippedItems — all equipped items (unused currently, reserved)
 * @returns {{ attacks: string, breakdown: object }}
 */
export function calcAttacksPerRound(weapon, characterData, _equippedItems = []) {
  const cd         = characterData ?? {};
  const group      = getClassGroup(cd);
  const level      = Math.max(1, parseInt(cd.charLevel) || 1);
  const isRanged   = weapon.item_type === 'ranged';
  const weaponName = (weapon.name ?? '').toLowerCase();

  // ── Ranged: derive ROF from stored field or weapon name ──────────────────
  if (isRanged) {
    // missile_rof may not be stored on character_equipment; derive from name
    let rof = 1;
    if (weaponName.includes('heavy crossbow'))  rof = 0.5;
    else if (weaponName.includes('crossbow'))   rof = 1;
    else if (weaponName.includes('bow'))        rof = 2;
    else if (weaponName.includes('sling'))      rof = 1;
    else if (weaponName.includes('dart'))       rof = 3;
    else if (weaponName.includes('blowgun'))    rof = 1;

    const rofStr = rof < 1 ? '1/2' : rof === 3 ? '3' : rof === 2 ? '2' : '1';
    return {
      attacks: rofStr,
      breakdown: { source: 'ranged_rof', rof, weaponName },
    };
  }

  // ── Mastery: Grand Mastery grants +1 extra attack ────────────────────────
  const masteryEntry = findMasteryEntry(weapon, cd);
  const isGrandMastery = masteryEntry?.tier === 'grandmastery';

  // ── Warriors: attacks improve with level; specialization adds more ────────
  if (group === 'warrior') {
    // Is this weapon specialized (tier ≥ 'spec' in masteryPicked)?
    const specTiers = new Set(['spec', 'mastery', 'highmastery', 'grandmastery', 'expertise']);
    const isSpecialized = masteryEntry && specTiers.has(masteryEntry.tier) && masteryEntry.tier !== 'expertise';

    let base;
    if (isSpecialized) {
      base = level >= 13 ? '5/2' : level >= 7 ? '2' : '3/2';
    } else {
      base = level >= 13 ? '2' : level >= 7 ? '3/2' : '1';
    }

    // Grand Mastery: +1 attack on top of base
    if (isGrandMastery) {
      const extras = { '1': '2', '3/2': '5/2', '2': '3', '5/2': '3' };
      base = extras[base] ?? base;
    }

    return {
      attacks: base,
      breakdown: {
        source: 'warrior', level, isSpecialized,
        isGrandMastery, masteryTier: masteryEntry?.tier ?? null,
      },
    };
  }

  // ── All other classes: 1 attack/round ────────────────────────────────────
  const attacks = isGrandMastery ? '2' : '1';
  return {
    attacks,
    breakdown: {
      source: 'non_warrior', group, isGrandMastery,
      masteryTier: masteryEntry?.tier ?? null,
    },
  };
}
