/**
 * enrichForAssign.js
 *
 * DB-aware wrapper around the pure parseMagicItem() function.
 * Used by POST /api/party-equipment/:id/assign (and the backfill script)
 * to load the referenced magical_items row + the right weapons_catalog
 * entry, then produce a fully-enriched object ready for INSERT into
 * character_equipment.
 *
 * Two-phase approach:
 *   1. parseMagicItem(mi, null) with NO catalog → gives us candidate base_type
 *   2. SELECT weapons_catalog WHERE name = normalizeBaseType(base_type or category)
 *   3. parseMagicItem(mi, Map) with catalog → final enriched shape
 *
 * This avoids pre-loading ~50 catalog rows per call while staying within
 * a single DB round-trip for the catalog lookup.
 */

const { parseMagicItem }      = require('./parseItem');
const { normalizeBaseType }   = require('./normalizeBaseType');

/**
 * @param {object} mi — magical_items row (full)
 * @param {{query: Function}} client — pg client or pool
 * @returns {Promise<object>} enriched item shaped for character_equipment
 */
async function enrichMagicItem(mi, client) {
  if (!mi) throw new Error('enrichMagicItem: magical_items row is required');

  // Phase 1 — parse w/o catalog to discover base_type
  const phase1 = parseMagicItem(mi, null);

  // Phase 2 — catalog lookup (weapons only)
  let catalogMap = null;
  if (mi.item_type === 'weapon') {
    const candidates = new Set();
    if (phase1.base_type)  candidates.add(normalizeBaseType(phase1.base_type));
    if (mi.category)       candidates.add(normalizeBaseType(mi.category));
    const names = [...candidates].filter(Boolean);
    if (names.length) {
      const { rows } = await client.query(
        'SELECT * FROM weapons_catalog WHERE name = ANY($1::text[])',
        [names],
      );
      if (rows.length) {
        catalogMap = new Map(rows.map(r => [r.name, r]));
      }
    }
  }

  // Phase 3 — re-parse with catalog for final enrichment
  return catalogMap ? parseMagicItem(mi, catalogMap) : phase1;
}

/**
 * Fetch + enrich by magical_item_id. Returns null if no row.
 */
async function enrichByMagicalItemId(magicalItemId, client) {
  if (!magicalItemId) return null;
  const { rows } = await client.query(
    'SELECT * FROM magical_items WHERE id = $1',
    [magicalItemId],
  );
  if (!rows.length) return null;
  return enrichMagicItem(rows[0], client);
}

module.exports = { enrichMagicItem, enrichByMagicalItemId };
