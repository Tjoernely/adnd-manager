/**
 * normalizeBaseType.js
 *
 * Converts natural-language weapon names (as found in magical_items
 * descriptions) to the canonical format used by weapons_catalog
 * ("Type, Qualifier" with comma-reversed notation).
 *
 * Examples:
 *   "footman's mace"     → "Mace, Footman's"
 *   "long sword"         → "Sword, Long"
 *   "bastard sword"      → "Sword, Bastard"
 *   "short bow"          → "Bow, Short"
 *   "hand axe"           → "Axe, Hand/Throwing"
 *   "two-handed sword"   → "Sword, Two-handed"
 *
 * Pure function — no side effects.
 */

// Base weapon heads that appear on the right side of "<qualifier> <head>" phrases.
// Ordered longest-first so "long sword" matches before "sword".
const WEAPON_HEADS = [
  'sword', 'mace', 'flail', 'axe', 'bow', 'crossbow', 'hammer',
  'lance', 'spear', 'club', 'dagger', 'dart', 'javelin',
  'staff', 'polearm', 'halberd', 'pick', 'scimitar', 'rapier',
  'whip', 'sling', 'net',
];

// Catalog uses specific suffix strings — map our parsed qualifier → catalog form
const CATALOG_ALIASES = {
  // Hand Axe is listed as "Axe, Hand/Throwing" in weapons_catalog
  'axe/hand':          'Axe, Hand/Throwing',
  'axe/throwing':      'Axe, Hand/Throwing',
  "axe/footman's":     'Axe, Battle',   // no separate footman's axe row
};

/**
 * Normalize a weapon phrase (lowercase, trimmed) to the canonical catalog name.
 * Returns null if no weapon head recognized.
 *
 * @param {string} phrase — e.g. "footman's mace", "long sword"
 * @returns {string|null} — e.g. "Mace, Footman's", "Sword, Long"
 */
function normalizeBaseType(phrase) {
  if (!phrase || typeof phrase !== 'string') return null;

  const clean = phrase
    .toLowerCase()
    .replace(/[''']/g, "'")       // unify apostrophes
    .replace(/\s+/g, ' ')
    .trim();

  // Find the weapon head (rightmost matching token)
  let head = null;
  let qualifier = null;
  for (const h of WEAPON_HEADS) {
    // Match "<anything> <head>" or just "<head>"
    const re = new RegExp(`(?:^|\\s)(${h})\\b`, 'i');
    const m = clean.match(re);
    if (m) {
      head = h;
      // Everything before the head token is the qualifier
      const idx = clean.lastIndexOf(h);
      qualifier = clean.slice(0, idx).trim();
      break;
    }
  }
  if (!head) return null;

  // Title-case the head
  const headTitle = head.charAt(0).toUpperCase() + head.slice(1);

  // No qualifier → just the head (e.g. "sword" → "Sword")
  if (!qualifier) return headTitle;

  // Title-case qualifier tokens (keep apostrophes, handle hyphen)
  const qualTitle = qualifier
    .split(/\s+/)
    .map(tok => {
      if (tok.includes('-')) {
        // "two-handed" → "Two-handed"
        return tok.charAt(0).toUpperCase() + tok.slice(1);
      }
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join(' ');

  const key = `${head}/${qualifier}`;
  if (CATALOG_ALIASES[key]) return CATALOG_ALIASES[key];

  return `${headTitle}, ${qualTitle}`;
}

module.exports = { normalizeBaseType, WEAPON_HEADS };
