/**
 * src/rules-engine/generationMapper.ts
 *
 * Translates MapGenerator's `generated_params` (terrain[], atmosphere,
 * inhabitants, mapType, era, size) into the world-engine types:
 * MapScope, LocationContext, LocationTags.
 *
 * Pure functions — no React, no side effects.
 */

import type { MapScope, LocationContext, LocationTags } from './mapTypes';
import { emptyTags, applyTagRules, inheritTags } from './tagEngine';
import { validateLocation } from './scopeValidator';
import type { TagRule, ScopeRule, ValidationResult } from './mapTypes';

// ── GeneratedParams shape (matches MapGenerator resolveParams output) ─────────

export interface GeneratedParams {
  mapType:     string;
  size:        string;
  terrain:     string[];
  atmosphere:  string;
  era:         string;
  inhabitants: string;
  poiCount?:   string;
}

// ── mapTypeToScope ─────────────────────────────────────────────────────────────

export function mapTypeToScope(mapType: string): MapScope {
  const norm = mapType.toLowerCase().trim();
  if (norm === 'world')                        return 'world';
  if (norm === 'region')                       return 'region';
  if (norm === 'city/town' || norm === 'city') return 'settlement';
  if (norm === 'village' || norm === 'town')   return 'settlement';
  if (norm === 'dungeon')                      return 'dungeon_level';
  if (norm === 'cave system')                  return 'dungeon_level';
  if (norm === 'ruins')                        return 'local';
  if (norm === 'castle/keep')                  return 'building';
  if (norm === 'tavern/inn')                   return 'interior';
  if (norm === 'temple')                       return 'building';
  if (norm === 'interior' || norm === 'building') return 'interior';
  return 'region'; // fallback
}

// ── generatedParamsToContext ───────────────────────────────────────────────────

const TERRAIN_TO_BIOME: Record<string, string> = {
  mountains:        'alpine',
  hills:            'highland',
  forest:           'temperate_forest',
  'dense forest':   'temperate_forest',
  jungle:           'tropical',
  plains:           'grassland',
  desert:           'arid',
  swamp:            'wetland',
  tundra:           'arctic',
  coastal:          'coastal',
  underground:      'subterranean',
};

const WATER_TERRAINS = new Set(['coastal', 'swamp', 'ocean', 'river', 'jungle']);

export function generatedParamsToContext(params: GeneratedParams): LocationContext {
  const primaryTerrain = params.terrain[0] ?? 'unknown';
  const terrainLower   = primaryTerrain.toLowerCase();
  const biome          = TERRAIN_TO_BIOME[terrainLower] ?? undefined;

  const water_access = params.terrain.some(t =>
    WATER_TERRAINS.has(t.toLowerCase()),
  );

  return {
    terrain:      terrainLower,
    ...(biome          !== undefined ? { biome }        : {}),
    ...(water_access                 ? { water_access } : {}),
  };
}

// ── generatedParamsToTags ─────────────────────────────────────────────────────

// Terrain string → tag name (only tags that exist in mapTags.json)
const TERRAIN_TAG_MAP: Record<string, string> = {
  mountains:        'mountainous',
  hills:            'mountainous',
  forest:           'forested',
  'dense forest':   'forested',
  jungle:           'forested',
  plains:           'plains',
  desert:           'desert',
  swamp:            'swamp',
  tundra:           'tundra',
  coastal:          'coastal',
  underground:      'subterranean',
};

// Atmosphere → environment tag
const ATMOSPHERE_ENV_MAP: Record<string, string> = {
  cursed:    'necrotic',
  sacred:    'consecrated',
  enchanted: 'unstable_magic',
  ancient:   'alien_ecology',    // "alien" in the sense of ancient/otherworldly
  abandoned: 'necrotic',
};

// Atmosphere → structure tag
const ATMOSPHERE_STRUCT_MAP: Record<string, string> = {
  abandoned: 'ruined',
  ancient:   'ruined',
};

// Inhabitants → special tag (all must exist in mapTags.json)
const INHABITANTS_SPECIAL_MAP: Record<string, string> = {
  undead:      'undead_presence',  // adds necrotic via applyTagRules
  demons:      'planar_rift',      // adds unstable_magic via applyTagRules
  fey:         'ley_line',         // adds unstable_magic via applyTagRules
  cult:        'artifact_site',    // adds legendary_site via applyTagRules
  'dragon lair': 'dragon_lair',    // adds legendary_site via applyTagRules
};

// Inhabitants → origin tag
const INHABITANTS_ORIGIN_MAP: Record<string, string> = {
  humanoids:   'constructed',
  undead:      'undead_built',
  demons:      'arcane_nexus',
  fey:         'elven',
  'dragon lair': 'ancient',
  cult:        'constructed',
};

// Era → origin tag
const ERA_ORIGIN_MAP: Record<string, string> = {
  ancient:          'ancient',
  'forgotten ruins': 'ancient',
};

export function generatedParamsToTags(params: GeneratedParams): LocationTags {
  const tags = emptyTags();

  // ── terrain ───────────────────────────────────────────────────────────────
  for (const t of params.terrain) {
    const tag = TERRAIN_TAG_MAP[t.toLowerCase()];
    if (tag && !tags.terrain.includes(tag)) tags.terrain.push(tag);
  }
  // Underground/dungeon types always get subterranean
  const scope = mapTypeToScope(params.mapType);
  if (scope === 'dungeon_level' || scope === 'interior') {
    if (!tags.terrain.includes('subterranean')) tags.terrain.push('subterranean');
  }

  // ── origin ────────────────────────────────────────────────────────────────
  const eraTag        = ERA_ORIGIN_MAP[params.era.toLowerCase()];
  const inhabitantTag = INHABITANTS_ORIGIN_MAP[params.inhabitants.toLowerCase()];
  if (eraTag        && !tags.origin.includes(eraTag))        tags.origin.push(eraTag);
  if (inhabitantTag && !tags.origin.includes(inhabitantTag)) tags.origin.push(inhabitantTag);
  // Settlement/building types are always constructed
  if (['settlement', 'building', 'interior'].includes(scope)) {
    if (!tags.origin.includes('constructed')) tags.origin.push('constructed');
  }

  // ── environment ───────────────────────────────────────────────────────────
  const envTag = ATMOSPHERE_ENV_MAP[params.atmosphere.toLowerCase()];
  if (envTag && !tags.environment.includes(envTag)) tags.environment.push(envTag);
  // Subterranean / underground always gets dark
  if (tags.terrain.includes('subterranean') || scope === 'dungeon_level') {
    if (!tags.environment.includes('dark')) tags.environment.push('dark');
  }

  // ── structure ─────────────────────────────────────────────────────────────
  const structTag = ATMOSPHERE_STRUCT_MAP[params.atmosphere.toLowerCase()];
  if (structTag && !tags.structure.includes(structTag)) tags.structure.push(structTag);
  // Fortified for castle/keep
  if (params.mapType.toLowerCase() === 'castle/keep') {
    if (!tags.structure.includes('fortified')) tags.structure.push('fortified');
    if (!tags.origin.includes('constructed'))  tags.origin.push('constructed');
  }

  // ── depth ─────────────────────────────────────────────────────────────────
  if (scope === 'dungeon_level') {
    tags.depth.push('shallow_underground');
  }

  // ── hazards ───────────────────────────────────────────────────────────────
  // Left empty at generation — filled manually or via POIs

  // ── special ───────────────────────────────────────────────────────────────
  const specialTag = INHABITANTS_SPECIAL_MAP[params.inhabitants.toLowerCase()];
  if (specialTag && !tags.special.includes(specialTag)) tags.special.push(specialTag);

  return tags;
}

// ── buildMapWorldData ─────────────────────────────────────────────────────────
// One-shot helper used in the generation flow.

export interface WorldDataResult {
  scope:             MapScope;
  context:           LocationContext;
  tags:              LocationTags;
  state:             'pristine';
  validation_errors: string[] | undefined;
}

export function buildMapWorldData(
  params:      GeneratedParams,
  tagRules:    TagRule[],
  scopeRules:  ScopeRule[],
  parentTags?: LocationTags,
): WorldDataResult {
  const scope   = mapTypeToScope(params.mapType);
  const context = generatedParamsToContext(params);
  const ownTags = generatedParamsToTags(params);

  // Apply tag propagation rules
  const resolvedOwnTags = applyTagRules(ownTags, tagRules);

  // Inherit parent tags if present
  const tags: LocationTags = parentTags
    ? inheritTags(parentTags, resolvedOwnTags)
    : resolvedOwnTags;

  // Validate — log warning but never throw
  let validation_errors: string[] | undefined;
  try {
    const result: ValidationResult = validateLocation(
      { scope, context, tags, state: 'pristine' },
      scopeRules,
      tagRules,
    );
    if (!result.valid) {
      validation_errors = result.errors;
      console.warn('[generationMapper] Tag validation warnings:', result.errors);
    }
  } catch (e) {
    console.warn('[generationMapper] Validation threw:', e);
  }

  return { scope, context, tags, state: 'pristine', validation_errors };
}
