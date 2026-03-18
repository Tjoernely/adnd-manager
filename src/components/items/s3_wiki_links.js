/**
 * S3 special weapon helpers — wiki page title construction and URL generation.
 *
 * The Fandom wiki uses the format:
 *   "{Full item name} (Magic {Category singular})"
 * e.g. "Acid Arrow (Magic Arrow)", "Arrow of Aggravation (Magic Arrow)"
 *
 * Use buildS3WikiTitle(catKey, shortName) to get the wiki page title.
 * Strip the "(Magic …)" suffix to get the DB name used in magical_items.
 */

// ── Category → wiki suffix (singular) ────────────────────────────────────────
const WIKI_SINGULAR = {
  'Arrow':                    'Arrow',
  'Axe':                      'Axe',
  'Ballista':                 'Ballista',
  'Battering Ram':            'Battering Ram',
  'Blowgun':                  'Blowgun',
  'Bow':                      'Bow',
  'Catapult':                 'Catapult',
  'Club':                     'Club',
  'Dagger':                   'Dagger',
  'Dart':                     'Dart',
  'Explosive Device':         'Explosive Device',
  'Flail Weapon':             'Flail',
  'Hammer':                   'Hammer',
  'Harpoon':                  'Harpoon',
  'Helmseeker':               'Helmseeker',
  'Javelin':                  'Javelin',
  'Jettison':                 'Jettison',
  'Lance':                    'Lance',
  'Mace':                     'Mace',
  'Mattock':                  'Mattock',
  'Net':                      'Net',
  'Paddleboard':              'Paddleboard',
  'Pellet':                   'Pellet',
  'Polearm':                  'Polearm',
  'Quiver':                   'Quiver',
  'Shot':                     'Shot',
  'Sickle':                   'Sickle',
  'Sling':                    'Sling',
  'Spear':                    'Spear',
  'Spelljamming Ram':         'Spelljamming Ram',
  'Sword':                    'Sword',
  'Throwing Star (Shuriken)': 'Shuriken',
  'Whip':                     'Whip',
};

// ── Build full display name ───────────────────────────────────────────────────
// "of X" / "the X" → "{Cat} of X", else "{name} {Cat}"
function _buildFullName(catKey, shortName) {
  const norm = String(shortName).replace(/[\u2018\u2019\u02BC]/g, "'");
  const lc   = norm.toLowerCase();
  return (lc.startsWith('of ') || lc.startsWith('the '))
    ? `${catKey} ${norm}`
    : `${norm} ${catKey}`;
}

/**
 * Build the Fandom wiki page title for an S3 item.
 *   buildS3WikiTitle('Arrow', 'Acid')            → "Acid Arrow (Magic Arrow)"
 *   buildS3WikiTitle('Arrow', 'of Aggravation')  → "Arrow of Aggravation (Magic Arrow)"
 *   buildS3WikiTitle('Flail Weapon', 'Footman's') → "Footman's Flail Weapon (Magic Flail)"
 *
 * Strip the "(Magic …)" suffix to get the DB name: "Acid Arrow", "Arrow of Aggravation"
 */
export function buildS3WikiTitle(catKey, shortName) {
  if (!catKey || !shortName) return null;
  const norm     = String(shortName).replace(/[\u2018\u2019\u02BC]/g, "'").replace(/\*+$/, '').trim();
  const fullName = _buildFullName(catKey, norm);
  const singular = WIKI_SINGULAR[catKey] ?? catKey;
  return `${fullName} (Magic ${singular})`;
}

/**
 * Returns the full Fandom wiki URL for an S3 item given its category and short name.
 */
export function getS3WikiUrl(catKey, shortName) {
  const title = buildS3WikiTitle(catKey, shortName);
  if (!title) return null;
  return 'https://adnd2e.fandom.com/wiki/' + title.replace(/\s+/g, '_');
}

// ── Legacy export (kept for any remaining call sites) ─────────────────────────
export const S3_WIKI_LINKS = {};
