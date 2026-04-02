/**
 * src/rules-engine/settlementEngine.ts
 *
 * Derives settlement archetype, features, and districts from GeneratedParams.
 * Consumed by generationMapper.ts (frontend) and mirrored in maps.js (server).
 *
 * Pure functions — no React, no side effects.
 */

import type {
  SettlementArchetype,
  SettlementData,
  SettlementDistrict,
  SettlementFeature,
} from './mapTypes';
import type { GeneratedParams } from './generationMapper';

// ── ArchetypeRules — mirrors settlementArchetypes.json shape ──────────────────

export interface ArchetypeEntry {
  default_tags: {
    origin:      string[];
    structure:   string[];
    environment: string[];
  };
  typical_districts:   SettlementDistrict[];
  required_features:   string[];
  forbidden_features:  string[];
  typical_inhabitants: string[];
}

export interface FeatureEntry {
  name:               string;
  category:           SettlementFeature['category'];
  requires:           string[];
  forbidden:          string[];
  provides_tags:      string[];
  preferred_district: SettlementDistrict;
}

export interface ArchetypeRules {
  archetypes: Record<SettlementArchetype, ArchetypeEntry>;
  features:   Record<string, FeatureEntry>;
}

// ── deriveArchetype ────────────────────────────────────────────────────────────
// Priority: specific inhabitants first, then atmosphere, then terrain, then size.

export function deriveArchetype(params: GeneratedParams): SettlementArchetype {
  const inh     = params.inhabitants.toLowerCase();
  const atmo    = params.atmosphere.toLowerCase();
  const size    = params.size.toLowerCase();
  const terrain = params.terrain.map(t => t.toLowerCase());

  if (inh === 'cult')         return 'religious_center';
  if (inh === 'undead')       return 'ruins';
  if (inh === 'demons')       return 'ruins';
  if (inh === 'dragon lair')  return 'ruins';
  if (atmo === 'sacred')      return 'religious_center';
  if (atmo === 'abandoned')   return 'ruins';
  if (terrain.includes('coastal'))   return 'port_town';
  if (terrain.includes('mountains')) return 'mining_town';
  if (inh === 'humanoids' && atmo === 'dangerous') return 'military_outpost';
  if (size === 'small')       return 'farming_village';
  return 'trade_town';
}

// ── getArchetypeFeatures ───────────────────────────────────────────────────────
// Returns required features + up to 3 qualifying optional features.
// Selection is deterministic (insertion order of features dict).

export function getArchetypeFeatures(
  archetype:      SettlementArchetype,
  archetypeRules: ArchetypeRules,
): SettlementFeature[] {
  const rule     = archetypeRules.archetypes[archetype];
  const allFeats = archetypeRules.features;

  // Required features that actually exist in the dict
  const selected: string[] = rule.required_features.filter(id => id in allFeats);

  // Optional pool: not forbidden by archetype, not already required
  const optional = Object.keys(allFeats).filter(
    id => !selected.includes(id) && !rule.forbidden_features.includes(id),
  );

  // Add up to 3 qualifying optional features (deterministic first-match)
  let added = 0;
  for (const id of optional) {
    if (added >= 3) break;
    const feat = allFeats[id];
    if (!feat) continue;

    // All of this feature's requires must already be selected
    if (!feat.requires.every(r => selected.includes(r))) continue;

    // No forbidden conflict with already-selected features
    const conflictsFeat   = feat.forbidden.some(f => selected.includes(f));
    const conflictsOthers = selected.some(s => allFeats[s]?.forbidden.includes(id));
    if (conflictsFeat || conflictsOthers) continue;

    selected.push(id);
    added++;
  }

  return selected.map(id => ({ id, ...allFeats[id] } as SettlementFeature));
}

// ── getDistricts ───────────────────────────────────────────────────────────────
// typical_districts from archetype + preferred_district from each feature.
// Deduped, max 6.

export function getDistricts(
  archetype:      SettlementArchetype,
  features:       SettlementFeature[],
  archetypeRules: ArchetypeRules,
): SettlementDistrict[] {
  const rule   = archetypeRules.archetypes[archetype];
  const seen   = new Set<SettlementDistrict>();
  const result: SettlementDistrict[] = [];

  const push = (d: SettlementDistrict) => {
    if (!seen.has(d)) { seen.add(d); result.push(d); }
  };

  for (const d of rule.typical_districts) push(d);
  for (const f of features)               push(f.preferred_district);

  return result.slice(0, 6);
}

// ── buildSettlementData ────────────────────────────────────────────────────────

export function buildSettlementData(
  params:         GeneratedParams,
  archetypeRules: ArchetypeRules,
): SettlementData {
  const archetype = deriveArchetype(params);
  const features  = getArchetypeFeatures(archetype, archetypeRules);
  const districts = getDistricts(archetype, features, archetypeRules);
  return { archetype, features, districts };
}
