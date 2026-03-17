/**
 * S3 special weapon → Fandom wiki page title mapping.
 *
 * Keys:   Full display name, e.g. "Arrow of Attraction"
 *         (constructed as "{Category} {item_name}" from s3_data.js)
 * Values: Wiki page title (underscored, without the site prefix),
 *         e.g. "Arrow_of_Attraction_(EM)"
 *
 * Add manual overrides here when auto-generation produces the wrong title
 * (e.g. items whose wiki page uses a different word order).
 * Auto-generation: spaces→underscores + "_(EM)" suffix.
 */
const _OVERRIDES = {
  // Example override (uncomment and extend as needed):
  // "Arrow Acid": "Acid_Arrow_(EM)",
};

function _autoTitle(displayName) {
  return String(displayName)
    .replace(/[\u2018\u2019\u02BC]/g, "'") // curly/modifier apostrophes → straight
    .replace(/\s+/g, '_')
    + '_(EM)';
}

/**
 * Proxy-backed map: always returns a title string (from overrides or auto-gen).
 * This means S3_WIKI_LINKS[anyString] is always truthy, so fetchWikiDescription
 * always attempts the API call and lets the wiki itself report missing pages.
 */
export const S3_WIKI_LINKS = new Proxy(_OVERRIDES, {
  get(target, key) {
    if (typeof key !== 'string') return undefined;
    return key in target ? target[key] : _autoTitle(key);
  },
  has(target, key) {
    return typeof key === 'string';
  },
});

/**
 * Returns the full Fandom wiki URL for a given S3 display name.
 * Uses the override table when available, otherwise auto-generates.
 */
export function getS3WikiUrl(displayName) {
  if (!displayName) return null;
  const page = S3_WIKI_LINKS[displayName];
  return `https://adnd2e.fandom.com/wiki/${page}`;
}
