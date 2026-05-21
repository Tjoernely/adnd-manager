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
import { applyPOIInfluences, type InfluenceRules } from './influenceEngine';
import mapStylePresets from '../rulesets/mapStylePresets.json';

// ── Map style preset lookup ────────────────────────────────────────────────────
// The promptAddition from the selected style preset replaces the previously
// hardcoded "hand-drawn ink style on aged parchment" line — the DM now picks
// from 5 style options in the AI Map Generator. All preset prompts are
// IP-clean (no artist names, no published-setting references).

type StylePreset = { label: string; description: string; promptAddition: string };
const STYLE_PRESETS: Record<string, StylePreset> = Object.fromEntries(
  Object.entries(mapStylePresets as Record<string, unknown>)
    .filter(([k]) => !k.startsWith('$'))
    .map(([k, v]) => [k, v as StylePreset]),
);

function resolveStylePreset(slug: string | undefined): StylePreset {
  // Backward compat: legacy spec.constraints.style was 'parchment_map'.
  const normalized = !slug || slug === 'parchment_map' ? 'parchment' : slug;
  return STYLE_PRESETS[normalized] ?? STYLE_PRESETS.parchment;
}

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
      // Slug from src/rulesets/mapStylePresets.json. 'parchment' is the
      // backward-compatible default for specs created before the picker.
      style:            params.mapStyle ?? 'parchment',
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

// ── POI-aware prompting (Bug #6) ──────────────────────────────────────────────
// Step 2 (Claude POIs) can introduce new setting elements — harbours, sea
// caves, etc. — that aren't in the original spec. These helpers feed that POI
// content into the enrichment and image prompts so the generated image and
// its visual keywords stay consistent with the POI narrative.

export interface MapPOIInput {
  name?:              string;
  type?:              string;
  short_description?: string;
}

function summarizePois(pois: MapPOIInput[]): string {
  return pois
    .filter((p): p is MapPOIInput => !!p && typeof p.name === 'string' && p.name.trim() !== '')
    .map(p => {
      const type = p.type ? ` [${p.type}]` : '';
      const desc = p.short_description ? ` — ${p.short_description}` : '';
      return `- ${p.name}${type}${desc}`;
    })
    .join('\n');
}

// ── buildEnrichmentPrompt ─────────────────────────────────────────────────────
// Returns the AI call options for visual enrichment.
// Called only when spec.user_description is set.
// The caller (MapGenerator) executes the actual callClaude() and passes the
// result to applyEnrichment(). `pois` (Step 2 output) keeps the visual
// keywords consistent with the POI-implied world.

export function buildEnrichmentPrompt(spec: MapSpec, pois: MapPOIInput[] = []): {
  systemPrompt: string;
  userPrompt:   string;
  maxTokens:    number;
} {
  const settlementLine = spec.settlement
    ? `Settlement: ${spec.settlement.archetype.replace(/_/g, ' ')} with districts: ${spec.settlement.districts.join(', ')}.`
    : '';

  const poiSummary = summarizePois(pois);
  const poiBlock = poiSummary
    ? `\nPoints of interest already placed on this map — the visual elements you choose MUST be consistent with the world these imply (water, coastline, terrain, structures, etc.):\n${poiSummary}\n`
    : '';

  return {
    systemPrompt: `You are a visual art director for fantasy cartography. Given map parameters and a user description, return JSON with specific visual elements for a fantasy map image. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences.`,
    userPrompt: `Map type: ${spec.mapType}
Terrain: ${spec.terrain.join(', ')}
Atmosphere: ${spec.atmosphere}
Inhabitants: ${spec.inhabitants}
Title: "${spec.title}"
${settlementLine}
User description: ${spec.user_description ?? ''}
${poiBlock}
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

// ── applyInfluencesToSpec ─────────────────────────────────────────────────────
// Updates spec.tags by merging POI influences from the generated poi list.
// Call this after step 2 (pois known) and before buildImagePrompt so that
// image_prompt_contract reflects POI-derived tags (divine, undead, etc.).

export function applyInfluencesToSpec(
  spec:           MapSpec,
  pois:           Array<{ type: string }>,
  influenceRules: InfluenceRules,
): MapSpec {
  const updatedTags = applyPOIInfluences(spec.tags, pois, influenceRules);
  return { ...spec, tags: updatedTags };
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

export function buildImagePrompt(spec: MapSpec, pois: MapPOIInput[] = []): string {
  const baseDesc = TYPE_IMAGE_DESCRIPTIONS[spec.mapType] ?? 'top-down fantasy map';

  // A substantial user description is authoritative — it must outweigh the
  // dropdown terrain/atmosphere/era hints, which otherwise fight it (e.g. a
  // "cozy roadside inn" turning into a "frozen tundra ruin").
  const desc = (spec.user_description ?? '').trim();
  const descAuthoritative = desc.length >= 30;

  // Style preset drives the visual treatment (was hardcoded parchment/FR lines).
  const stylePreset = resolveStylePreset(spec.constraints?.style);

  const parts: string[] = [
    `A ${baseDesc}.`,
    stylePreset.promptAddition,
  ];

  if (descAuthoritative) {
    parts.push(
      `This map depicts: ${desc.slice(0, 400)}. ` +
      `Render this faithfully — it is the authoritative description and overrides any conflicting style hint.`,
    );
  }

  // Dropdown structural fields — fallback hints only, suppressed when the
  // user description is authoritative.
  if (!descAuthoritative && spec.terrain.length > 0) {
    parts.push(`Terrain: ${spec.terrain.slice(0, 2).join(', ')}.`);
  }

  if (!descAuthoritative && spec.atmosphere && spec.atmosphere !== 'Random') {
    parts.push(`${spec.atmosphere} atmosphere.`);
  }

  if (!descAuthoritative && spec.era && spec.era !== 'Random' && spec.era.toLowerCase() !== 'medieval') {
    parts.push(`${spec.era} era.`);
  }

  // POI-derived locations (Bug #6) — make the image reserve space for the
  // places Step 2 actually generated, so it matches the POI narrative.
  const poiNames = pois
    .map(p => p?.name)
    .filter((n): n is string => typeof n === 'string' && n.trim() !== '');
  if (poiNames.length) {
    parts.push(`The map must show distinct areas for these locations: ${poiNames.slice(0, 8).join(', ')}.`);
  }

  if (spec.settlement) {
    const archetypeVisual = ARCHETYPE_VISUALS[spec.settlement.archetype];
    if (archetypeVisual) parts.push(`Features: ${archetypeVisual}.`);
    if (spec.settlement.districts.length > 0) {
      parts.push(`Districts visible: ${spec.settlement.districts.slice(0, 3).join(', ')}.`);
    }
  }

  // ── POI influence-derived atmosphere ─────────────────────────────────────
  if (spec.tags.special?.includes('divine_presence')) {
    parts.push('Sacred divine atmosphere, holy light filtering through.');
  }
  if (spec.tags.special?.includes('undead_presence')) {
    parts.push('Ominous undead presence, bones and death motifs throughout.');
  }
  if (spec.tags.hazards?.includes('monster_infestation')) {
    parts.push('Dangerous foreboding landscape, signs of creature activity.');
  }
  if (spec.tags.environment?.includes('unstable_magic')) {
    parts.push('Crackling arcane energy, magical distortions visible.');
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

  // Closers — kept generic. The preset's promptAddition above is the dominant
  // style instruction; these reinforce framing and the no-text rule.
  parts.push('No text or labels. Bird\'s eye view.');
  parts.push('Highly detailed illustration.');

  return parts.filter(Boolean).join(' ').substring(0, 900);
}
