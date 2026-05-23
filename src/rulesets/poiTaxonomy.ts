/**
 * POI taxonomy — types + helpers around src/rulesets/poiTaxonomy.json.
 *
 * Used by the Map Generator's Step 1.5 selection (Haiku picks 6-12
 * sub-categories that fit the location) and Step 2 generation (Sonnet
 * draws specific concepts from the picked sub-categories).
 */

import raw from './poiTaxonomy.json';

export type CategoryKey = 'structure' | 'natural' | 'people' | 'enigma';

export interface POISubcategory {
  label:                 string;
  description:           string;
  concepts:              string[];
  /** Sprint 2 — whitelist. Only present subs whose value includes the map's
   *  context are kept by getCompatibleSubcategories. When omitted entirely,
   *  the sub is treated as universal (kept for any context). */
  compatibleContexts?:   string[];
  /** Sprint 2 — blacklist. Always blocks the sub for the listed contexts,
   *  even if compatibleContexts would otherwise allow it. */
  incompatibleContexts?: string[];
}

export interface POICategory {
  label:         string;
  description:   string;
  subcategories: Record<string, POISubcategory>;
}

// `raw` includes `$schema` / `$version` metadata at the top level; filter
// those out so the exported taxonomy is just the 4 real categories.
function buildTaxonomy(): Record<CategoryKey, POICategory> {
  const out: Partial<Record<CategoryKey, POICategory>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (key.startsWith('$')) continue;
    out[key as CategoryKey] = value as POICategory;
  }
  return out as Record<CategoryKey, POICategory>;
}

export const POI_TAXONOMY: Record<CategoryKey, POICategory> = buildTaxonomy();

/**
 * Flat list of every sub-category, encoded as "category:subcategory"
 * (e.g. "structure:temple", "natural:waterway"). Stable insertion order.
 */
export function getAllSubcategoryKeys(): string[] {
  const out: string[] = [];
  for (const [cat, catObj] of Object.entries(POI_TAXONOMY)) {
    for (const sub of Object.keys(catObj.subcategories)) {
      out.push(`${cat}:${sub}`);
    }
  }
  return out;
}

/** Look up a sub-category by its "category:subcategory" key. */
export function getSubcategory(key: string): POISubcategory | null {
  const [cat, sub] = key.split(':');
  if (!cat || !sub) return null;
  return POI_TAXONOMY[cat as CategoryKey]?.subcategories?.[sub] ?? null;
}

/**
 * Concepts for a sub-category, optionally capped. Order is the JSON order
 * (deterministic — useful for default rendering; for variation across
 * generations use `getRandomConceptSample`).
 */
export function getConceptsForSubcategory(key: string, limit?: number): string[] {
  const sub = getSubcategory(key);
  if (!sub) return [];
  return typeof limit === 'number' ? sub.concepts.slice(0, limit) : sub.concepts.slice();
}

/**
 * Randomly sample `conceptsPerSub` concepts from each of the given
 * sub-categories. Used by Step 2 to seed Sonnet's prompt with varied
 * archetypes — same sub-category picks different concepts on different
 * generations, so the model has alternatives instead of always seeing
 * the first N entries.
 */
export function getRandomConceptSample(
  subcategoryKeys: string[],
  conceptsPerSub: number,
): string[] {
  const out: string[] = [];
  for (const key of subcategoryKeys) {
    const sub = getSubcategory(key);
    if (!sub || sub.concepts.length === 0) continue;
    if (sub.concepts.length <= conceptsPerSub) {
      out.push(...sub.concepts);
      continue;
    }
    // Fisher-Yates partial shuffle to take N distinct concepts.
    const pool = sub.concepts.slice();
    for (let i = 0; i < conceptsPerSub; i++) {
      const j = i + Math.floor(Math.random() * (pool.length - i));
      [pool[i], pool[j]] = [pool[j], pool[i]];
      out.push(pool[i]);
    }
  }
  return out;
}

/**
 * Convenience: pretty-print a sub-category block for inclusion in an LLM
 * prompt. The Haiku selection step uses this; Step 2 (Sonnet) uses the
 * enriched form with sampled concepts (see MapGenerator).
 */
export function formatSubcategoryForPrompt(key: string): string {
  const sub = getSubcategory(key);
  if (!sub) return `- ${key}: (unknown sub-category)`;
  return `- ${key}: ${sub.description}`;
}

/**
 * Sprint 2 — sub-categories whose compatibility metadata permits the given
 * map context. Whitelist semantics when `compatibleContexts` is populated;
 * `incompatibleContexts` is an explicit block that always wins. Subs with
 * neither field are universal (kept for any context).
 */
export function getCompatibleSubcategories(mapContext: string): string[] {
  return getAllSubcategoryKeys().filter(key => {
    const sub = getSubcategory(key);
    if (!sub) return false;
    if (sub.incompatibleContexts?.includes(mapContext)) return false;
    if (sub.compatibleContexts && sub.compatibleContexts.length > 0
        && !sub.compatibleContexts.includes(mapContext)) {
      return false;
    }
    return true;
  });
}
