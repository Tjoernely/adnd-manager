/**
 * src/rules-engine/specBuilder.ts
 *
 * Builds a MapSpec from generated_params + world-engine data + Claude metadata.
 * Provides deterministic buildImagePrompt() for DALL-E and helpers for
 * optional AI enrichment (when user_description is present).
 *
 * Pure functions — no React, no side effects.
 */

import type { MapSpec, MapScope } from './mapTypes';
import type { GeneratedParams, WorldDataResult } from './generationMapper';

// ── POI candidates per scope ──────────────────────────────────────────────────
// Which POI types are valid/expected for each scope.
// Used in AI enrichment prompts and as a hint for MapManager.

const SCOPE_POI_CANDIDATES: Partial<Record<MapScope, string[]>> = {
  world:        ['region', 'city', 'village', 'ruins', 'cave', 'dungeon', 'landmark'],
  region:       ['city', 'village', 'ruins', 'cave', 'dungeon', 'encounter', 'landmark', 'mystery'],
  local:        ['ruins', 'cave', 'dungeon', 'encounter', 'landmark', 'treasure', 'mystery'],
  settlement:   ['building', 'temple', 'npc', 'landmark', 'encounter', 'market'],
  district:     ['building', 'npc', 'encounter', 'landmark', 'market'],
  building:     ['room', 'npc', 'trap', 'treasure', 'encounter', 'mystery'],
  interior:     ['npc', 'trap', 'treasure', 'encounter', 'mystery', 'secret'],
  dungeon_level:['room', 'trap', 'treasure', 'encounter', 'boss', 'secret', 'mystery'],
};

// ── buildMapSpec ──────────────────────────────────────────────────────────────
// Assembles a MapSpec from three sources: resolved params, world-engine output,
// and Claude metadata from the first AI call.

export function buildMapSpec(
  params:    GeneratedParams,
  worldData: WorldDataResult,
  meta:      { title: string; dalle_prompt_additions?: string },
): MapSpec {
  // DEBUG — remove after verification
  console.log('[specBuilder] buildMapSpec input — worldData.state:', worldData.state,
    '| worldData.scope:', worldData.scope,
    '| SCOPE_POI_CANDIDATES lookup:', JSON.stringify(SCOPE_POI_CANDIDATES[worldData.scope]));

  const spec: MapSpec = {
    mapType:        params.mapType,
    scope:          worldData.scope,
    size:           params.size,
    terrain:        params.terrain,
    atmosphere:     params.atmosphere,
    era:            params.era,
    inhabitants:    params.inhabitants,
    state:          worldData.state,
    tags:           worldData.tags,
    context:        worldData.context,
    ...(worldData.settlement ? { settlement: worldData.settlement } : {}),
    poi_candidates: SCOPE_POI_CANDIDATES[worldData.scope] ?? ['landmark', 'encounter', 'mystery'],
    constraints: {
      max_poi_count:    6,
      prompt_max_chars: 900,
      style:            'parchment_map',
      view:             'top_down',
    },
    title:          meta.title,
    ...(meta.dalle_prompt_additions ? { dalle_prompt_additions: meta.dalle_prompt_additions } : {}),
    ...(params.user_description     ? { user_description:       params.user_description     } : {}),
  };

  // DEBUG — remove after verification
  console.log('[specBuilder] buildMapSpec result — state:', spec.state,
    '| poi_candidates:', JSON.stringify(spec.poi_candidates),
    '| constraints:', JSON.stringify(spec.constraints),
    '| scope:', spec.scope);
  console.log('[specBuilder] buildMapSpec full spec keys:', Object.keys(spec).join(', '));

  return spec;
}

// ── withImageContract ─────────────────────────────────────────────────────────
// Stamps the final DALL-E prompt string into the spec.
// Call this after buildImagePrompt() and before creating the map record,
// so data.spec.image_prompt_contract is always stored in the DB.

export function withImageContract(spec: MapSpec, prompt: string): MapSpec {
  return { ...spec, image_prompt_contract: prompt };
}

// ── buildEnrichmentPrompt ─────────────────────────────────────────────────────
// Returns the AI call options for visual enrichment.
// Called only when spec.user_description is set.
// The caller (MapGenerator) executes the actual callClaude() and passes the
// result to applyEnrichment().

export function buildEnrichmentPrompt(spec: MapSpec): {
  systemPrompt: string;
  userPrompt:   string;
  maxTokens:    number;
} {
  const settlementLine = spec.settlement
    ? `Settlement: ${spec.settlement.archetype.replace(/_/g, ' ')} with districts: ${spec.settlement.districts.join(', ')}.`
    : '';

  return {
    systemPrompt: `You are a visual art director for fantasy cartography. Given map parameters and a user description, return JSON with specific visual elements for a DALL-E map image. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences.`,
    userPrompt: `Map type: ${spec.mapType}
Terrain: ${spec.terrain.join(', ')}
Atmosphere: ${spec.atmosphere}
Inhabitants: ${spec.inhabitants}
Title: "${spec.title}"
${settlementLine}
User description: ${spec.user_description ?? ''}

Return ONLY this JSON:
{
  "visual_keywords": ["3-5 specific visual elements visible in the map image, e.g. crumbling watchtower, frozen waterfall, glowing runes"],
  "landmark_details": ["1-2 specific landmark descriptions to feature prominently in the image"]
}`,
    maxTokens: 250,
  };
}

// ── applyEnrichment ───────────────────────────────────────────────────────────
// Merges AI enrichment result into the spec. Safe: ignores malformed AI output.

export function applyEnrichment(spec: MapSpec, enrichment: unknown): MapSpec {
  const e = enrichment as Partial<{ visual_keywords: string[]; landmark_details: string[] }>;
  return {
    ...spec,
    ...(Array.isArray(e?.visual_keywords)  && e.visual_keywords.length  ? { visual_keywords:  e.visual_keywords  } : {}),
    ...(Array.isArray(e?.landmark_details) && e.landmark_details.length ? { landmark_details: e.landmark_details } : {}),
  };
}

// ── Type image descriptions ───────────────────────────────────────────────────

const TYPE_IMAGE_DESCRIPTIONS: Record<string, string> = {
  'Region':      'top-down regional fantasy cartography map with mountains, forests and rivers',
  'City/Town':   'top-down fantasy city map with streets, districts and buildings',
  'Village':     'top-down fantasy village map with cottages, farms and a central square',
  'Dungeon':     'top-down dungeon floor plan with rooms, corridors and passages',
  'Cave System': 'top-down natural cave system map with caverns and underground pools',
  'Ruins':       'top-down ancient ruins map with collapsed walls, rubble and overgrowth',
  'Castle/Keep': 'top-down castle and keep floor plan with towers and a great hall',
  'Tavern/Inn':  'top-down tavern interior floor plan with common room and private quarters',
  'Temple':      'top-down temple interior map with nave, altar and side chambers',
};

// ── Settlement archetype visual vocabulary ────────────────────────────────────

const ARCHETYPE_VISUALS: Partial<Record<string, string>> = {
  mining_town:      'mine shaft entrance, ore processing buildings, workers quarters',
  trade_town:       'busy market square, merchant warehouses, caravan staging area',
  religious_center: 'grand cathedral, cloisters, religious statuary and gardens',
  military_outpost: 'fortified walls, barracks, training yard, watchtowers',
  farming_village:  'patchwork fields, grain silos, farmhouses, windmill',
  port_town:        'harbor with docked ships, fish market, warehouses along the waterfront',
  ruins:            'collapsed buildings, overgrown streets, crumbling walls',
};

// ── buildImagePrompt ──────────────────────────────────────────────────────────
// Deterministic: same MapSpec → same prompt. Used as the DALL-E 3 input.
// dalle_prompt_additions from Claude are truncated to 80 chars to prevent
// policy-triggering content from inflating or altering the core prompt.

export function buildImagePrompt(spec: MapSpec): string {
  const baseDesc = TYPE_IMAGE_DESCRIPTIONS[spec.mapType] ?? 'top-down fantasy map';

  const parts: string[] = [
    `A ${baseDesc},`,
    'hand-drawn ink style on aged parchment.',
    'Forgotten Realms / Faerûn setting.',
  ];

  if (spec.terrain.length > 0) {
    parts.push(`Terrain: ${spec.terrain.slice(0, 2).join(', ')}.`);
  }

  if (spec.atmosphere && spec.atmosphere !== 'Random') {
    parts.push(`${spec.atmosphere} atmosphere.`);
  }

  if (spec.era && spec.era !== 'Random' && spec.era.toLowerCase() !== 'medieval') {
    parts.push(`${spec.era} era.`);
  }

  if (spec.settlement) {
    const archetypeVisual = ARCHETYPE_VISUALS[spec.settlement.archetype];
    if (archetypeVisual) parts.push(`Features: ${archetypeVisual}.`);
    if (spec.settlement.districts.length > 0) {
      parts.push(`Districts visible: ${spec.settlement.districts.slice(0, 3).join(', ')}.`);
    }
  }

  if (spec.visual_keywords?.length) {
    parts.push(`Visual elements: ${spec.visual_keywords.join(', ')}.`);
  }

  if (spec.landmark_details?.length) {
    parts.push(spec.landmark_details.slice(0, 2).join(' '));
  }

  // dalle_prompt_additions: truncate to 80 chars to avoid unvetted Claude output
  // pushing the prompt over limits or triggering content policy.
  if (spec.dalle_prompt_additions) {
    const safe = spec.dalle_prompt_additions.trim().substring(0, 80);
    if (safe) parts.push(safe);
  }

  parts.push('Classic fantasy adventure module cartography style.');
  parts.push('No text or labels. Bird\'s eye view.');
  parts.push('Highly detailed illustration.');

  return parts.filter(Boolean).join(' ').substring(0, 900);
}
