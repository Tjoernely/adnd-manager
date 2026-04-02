/**
 * src/rules-engine/influenceEngine.ts
 *
 * Pure functions for the POI influence system.
 * Each POI type "radiates" tags into its parent location's LocationTags.
 *
 * No React, no side effects.
 */

import type { LocationTags, POIInfluence, InfluenceRadius } from './mapTypes';

// ── InfluenceRule shape (matches mapTags.json → poi_influence_rules values) ───

export interface InfluenceRule {
  provides_tags: Partial<Record<keyof LocationTags, string[]>>;
  radius:        string; // "local" | "region" | "world"
}

export type InfluenceRules = Record<string, InfluenceRule>;

// ── getInfluenceForPOI ────────────────────────────────────────────────────────
// Match poi.type (case-insensitive) against influenceRules.
// Returns a POIInfluence or null if no rule matches.

export function getInfluenceForPOI(
  poi:            { type: string; name?: string },
  influenceRules: InfluenceRules,
): POIInfluence | null {
  const key = (poi.type ?? '').toLowerCase().trim();
  const rule = influenceRules[key];
  if (!rule) return null;

  // Build a clean Partial<LocationTags> — only known categories, no empties
  const provides_tags: Partial<LocationTags> = {};
  for (const [cat, tags] of Object.entries(rule.provides_tags)) {
    if (Array.isArray(tags) && tags.length > 0) {
      (provides_tags as Record<string, string[]>)[cat] = tags;
    }
  }

  const influence_radius = (rule.radius as InfluenceRadius) ?? 'local';

  return { provides_tags, influence_radius };
}

// ── applyPOIInfluences ────────────────────────────────────────────────────────
// For each POI in the list, derive its influence and merge provides_tags into
// locationTags. Deduplicates — never adds a tag already present.
// Returns a NEW LocationTags object (does not mutate the input).

export function applyPOIInfluences(
  locationTags:   LocationTags,
  pois:           Array<{ type: string; influence?: POIInfluence }>,
  influenceRules: InfluenceRules,
): LocationTags {
  // Clone tags so we never mutate the input
  const result: LocationTags = {
    terrain:     [...locationTags.terrain],
    origin:      [...locationTags.origin],
    depth:       [...locationTags.depth],
    environment: [...locationTags.environment],
    structure:   [...locationTags.structure],
    hazards:     [...locationTags.hazards],
    special:     [...locationTags.special],
  };

  for (const poi of pois) {
    const influence = poi.influence ?? getInfluenceForPOI(poi, influenceRules);
    if (!influence) continue;

    for (const [cat, tags] of Object.entries(influence.provides_tags)) {
      if (!Array.isArray(tags)) continue;
      const arr = (result as Record<string, string[]>)[cat];
      if (!arr) continue;
      for (const tag of tags) {
        if (!arr.includes(tag)) arr.push(tag);
      }
    }
  }

  return result;
}
