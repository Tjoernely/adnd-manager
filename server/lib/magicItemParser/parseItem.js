/**
 * parseItem.js
 *
 * parseMagicItem(magicalItemsRow, weaponsCatalogByName) → enriched item
 *
 * Pure function. Takes a magical_items DB row and (optionally) a map of
 * weapons_catalog rows keyed by their canonical name. Returns an object
 * shaped to fit the character_equipment table columns plus a few
 * DM-facing extras.
 *
 * Design rules:
 *   - Never flip is_cursed from description parsing (use DB flag only).
 *   - Never overwrite curated fields with null — prefer original.
 *   - Always return something usable; fall back to category + defaults
 *     when description parsing fails.
 */

const { normalizeBaseType } = require('./normalizeBaseType');
const {
  extractBasePlusBonus,
  extractSplitBonus,
  extractConditionalBonuses,
  extractSpecialProperties,
} = require('./descriptionRegex');

/**
 * @param {object} mi   — magical_items row (must include name + description; may
 *                         include item_type, equip_slot, category, cursed, etc.)
 * @param {Map|object} weaponsCatalog — keyed by normalized name ("Mace, Footman's")
 * @returns {object} enriched item — columns ready for character_equipment
 */
function parseMagicItem(mi, weaponsCatalog = null) {
  if (!mi) throw new Error('parseMagicItem: row is required');

  const desc          = (mi.description ?? '').trim();
  const isWeapon      = mi.item_type === 'weapon';
  const isArmor       = mi.item_type === 'armor' || mi.item_type === 'shield';
  const catalogLookup = name => {
    if (!weaponsCatalog) return null;
    if (weaponsCatalog instanceof Map) return weaponsCatalog.get(name) ?? null;
    return weaponsCatalog[name] ?? null;
  };

  // ── 1. Magic bonus (to-hit / damage combined per user decision) ────────────
  // Only trusted for weapons/armor/shields — non-weapon prose often contains
  // save bonuses like "+2 on saving throws" that aren't a weapon's magic_bonus.
  const basePlusBonus = extractBasePlusBonus(desc);
  const splitBonus    = extractSplitBonus(desc);

  let magicBonus  = 0;
  if (isWeapon || isArmor) {
    if (splitBonus) {
      // Use max — stored single-field per Q2 in the proposal
      magicBonus = Math.max(splitBonus.hitBonus, splitBonus.dmgBonus);
    } else if (basePlusBonus) {
      magicBonus = basePlusBonus.magicBonus;
    }
  }

  // ── 2. Base weapon type — only for weapons ─────────────────────────────────
  let baseType       = null;
  let catalogName    = null;
  let catalogEntry   = null;

  if (isWeapon) {
    // Try parsed base first (e.g. "footman's mace")
    if (basePlusBonus?.baseType) {
      baseType    = basePlusBonus.baseType;
      catalogName = normalizeBaseType(baseType);
      catalogEntry = catalogName ? catalogLookup(catalogName) : null;
    }
    // Fall back to category as the base type (e.g. category="Sword" → "Sword")
    if (!catalogEntry && mi.category) {
      const fromCat = normalizeBaseType(mi.category);
      if (fromCat) {
        catalogName  = fromCat;
        catalogEntry = catalogLookup(catalogName);
        if (!baseType) baseType = mi.category.toLowerCase();
      }
    }
  }

  // ── 3. Damage / speed / two-handed from catalog (weapons only) ─────────────
  const damage_s_m     = catalogEntry?.damage_sm    ?? null;
  const damage_l       = catalogEntry?.damage_l     ?? null;
  const speed_factor   = catalogEntry?.speed_factor ?? null;
  const is_two_handed  = catalogEntry?.is_two_handed ?? (mi.hands_required === 2);
  const weapon_type    = catalogEntry?.weapon_type  ?? null;   // S/P/B
  const range_str      = catalogEntry
    ? buildRangeStr(catalogEntry)
    : null;

  // ── 4. Slot + armor_ac ─────────────────────────────────────────────────────
  const slot     = mi.equip_slot ?? null;
  const armor_ac = isArmor ? (mi.armor_ac ?? null) : null;

  // ── 5. Cursed (DB flag only, per decision #3) ──────────────────────────────
  const is_cursed = !!mi.cursed;

  // ── 6. Special properties + conditional bonuses (DM-facing text) ───────────
  const specials     = extractSpecialProperties(desc);
  const conditionals = extractConditionalBonuses(desc)
    .filter(c => !basePlusBonus || c.bonus !== basePlusBonus.magicBonus); // skip the primary match

  const specialLines = [];
  for (const c of conditionals) {
    specialLines.push(`+${c.bonus} vs. ${c.vs}`);
  }
  for (const s of specials) {
    // De-duplicate against already captured conditional bonuses
    if (!specialLines.some(l => s.includes(l))) specialLines.push(s);
  }
  const specialProperties = specialLines.length
    ? specialLines.join('\n\n')
    : null;

  // ── 7. Notes — combine parser findings so combatCalc fallback works ────────
  // combatCalc.js reads "Bonus: +N" from notes as a secondary source.
  const notesParts = [];
  if (baseType)    notesParts.push(`Type: ${baseType}`);
  if (magicBonus)  notesParts.push(`Bonus: +${magicBonus}`);
  if (mi.xp_value) notesParts.push(`XP: ${mi.xp_value}`);
  const notes = notesParts.join(' | ');

  return {
    // Core identity
    name:            mi.name,
    description:     desc || null,
    magical_item_id: mi.id ?? null,
    item_type:       mi.item_type ?? null,
    identify_state:  'unknown',   // DM identifies separately

    // Slot + equipment
    slot,
    weapon_type,
    is_two_handed,
    speed_factor,

    // Combat
    damage_s_m,
    damage_l,
    range_str,
    armor_ac,
    magic_bonus:     magicBonus,
    is_cursed,

    // Meta
    value_gp:        mi.value_gp ?? null,
    weight_lbs:      parseWeight(mi.weight),

    // DM-facing
    notes,
    special_properties: specialProperties,  // not a DB column — see enrichForCharacterEquipment
    base_type:          baseType,            // ditto
    catalog_matched:    !!catalogEntry,      // ditto, audit only
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function buildRangeStr(catalogEntry) {
  const { range_short, range_medium, range_long } = catalogEntry;
  if (!range_short && !range_medium && !range_long) return null;
  return [range_short, range_medium, range_long].filter(v => v != null).join('/');
}

function parseWeight(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  const m = String(raw).match(/([\d.]+)/);
  return m ? parseFloat(m[1]) : null;
}

module.exports = { parseMagicItem };
