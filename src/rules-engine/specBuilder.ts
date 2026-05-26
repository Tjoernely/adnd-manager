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

// ── Sprint 6 bug-fix — Racial architectural override for image prompt ───────
//
// When spec.inhabitants names a civilised race, gpt-image-1 must know to
// render race-appropriate architecture (elven treetop platforms instead of
// generic medieval timber-frame, dwarven stone halls, halfling burrows etc.).
// This helper produces a single compact line that we inject BEFORE the
// per-building list so style framing wins over generic defaults.
//
// Imports the JSON profile module directly — keeps specBuilder free of
// framework imports so it stays node-callable for tests.
//
// Returns '' for Random / null / non-civilised inhabitants where lair/decay
// aesthetics are handled by atmosphere + tag-derived parts instead.
import racialProfilesRaw from '../rulesets/racialProfiles.json';
const RACIAL_PROFILES: Record<string, { architectural_style: string }> =
  ((racialProfilesRaw as unknown as { races?: Record<string, { architectural_style: string }> })?.races) ?? {};

function racialKeyFor(value: string | undefined | null): string | null {
  if (!value) return null;
  const s = value.trim();
  if (!s || s === 'Random') return null;
  // Mirror the LABEL_TO_KEY logic in racialProfiles.ts. Keep the small set of
  // common variants inline so this file doesn't pull a TS sibling.
  const map: Record<string, string> = {
    'humans': 'humans', 'human': 'humans',
    'elves': 'elves', 'elf': 'elves',
    'dwarves': 'dwarves', 'dwarf': 'dwarves',
    'halflings': 'halflings', 'halfling': 'halflings',
    'gnomes': 'gnomes', 'gnome': 'gnomes',
    'half-orcs': 'half_orcs', 'half_orcs': 'half_orcs', 'half-orc': 'half_orcs',
    'half-elves': 'half_elves', 'half_elves': 'half_elves', 'half-elf': 'half_elves',
    'mixed races': 'mixed_races', 'mixed_races': 'mixed_races', 'humanoid mix': 'mixed_races',
    'humanoids': 'humanoids', 'humanoid': 'humanoids',
    'undead': 'undead',
    'demons': 'demons', 'demon': 'demons',
    'fey': 'fey',
    'beasts': 'beasts', 'beast': 'beasts',
    'monsters': 'monsters', 'monster': 'monsters',
    'abandoned': 'abandoned', 'none': 'abandoned',
  };
  return map[s.toLowerCase()] ?? s.toLowerCase().replace(/[-\s]+/g, '_');
}

export function buildRacialArchitectureHint(inhabitants: string | null | undefined): string {
  const key = racialKeyFor(inhabitants);
  if (!key) return '';
  const profile = RACIAL_PROFILES[key];
  if (!profile?.architectural_style) return '';
  return `Architectural style for inhabitants (${key.replace(/_/g, ' ')}): ${profile.architectural_style}`;
}

// ── Sprint 6 — Building-specific architectural hints (settlement maps) ──────
//
// When the POI list contains settlement-feature POIs (subType set by Sprint 3
// auto-selection), we feed gpt-image-1 a list of concrete architectural cues
// so it draws recognisable inns / smithies / temples / etc. instead of
// generic look-alike buildings. Counts collapse duplicates so "3 inn/taverns"
// becomes one line, keeping the prompt compact.
//
// Skipped subTypes:
//   - thieves_guild (dm_only — must NOT be visible on the player map)
//   - sewers        (underground — not a surface building)
// Other subTypes with no architectural hint fall back to a generic phrase.

const ARCHITECTURAL_HINTS: Record<string, string> = {
  inn_tavern:    'inn/tavern (with hanging sign, lanterns, prominent door)',
  tavern:        'tavern (smaller than inn, with hanging sign)',
  alehouse:      'public alehouse (humble, working-class)',
  market_square: 'open market square with stalls and tents',
  general_store: 'general store (with goods displayed outside)',
  trading_post:  'trading post (often near road/gate, caravan-friendly)',
  warehouse:     'warehouse (large, plain, near docks or gate)',
  smith:         'smithy/forge (with chimney, anvil visible, smoke)',
  weapon_smith:  'weapon smithy (chimney, displayed weapons)',
  armor_smith:   'armor smithy (chimney, displayed armor)',
  carpenter:     "carpenter's workshop (with lumber yard)",
  stables:       'stables (long building with stalls, hay)',
  shrine:        'small roadside shrine',
  temple:        'temple (with steeple, spire, or dome)',
  healer:        "healer's cottage (with herb garden)",
  apothecary:    'apothecary (with hanging plants, signs)',
  town_hall:     'town hall (large official building, columns)',
  guard_post:    'guard post (small fortified building)',
  barracks:      'barracks (long military building, training yard)',
  prison:        'prison or stocks (small barred building)',
  manor:         'noble manor (large estate with grounds)',
  castle:        'castle or keep (significant fortification, towers)',
  scribe:        "scribe's shop (small with quill sign)",
  library:       'library (large with columns, prominent windows)',
  alchemist:     "alchemist's lab (smoke, unusual chimney)",
  magic_shop:    'magic shop (mystical symbols, glowing windows)',
  wizards_tower: "wizard's tower (tall, isolated, arcane)",
  docks:         'docks/harbor (wharves, piers, fishing boats)',
  mill:          'mill (with water wheel or windmill blades)',
};
// Hidden / non-surface buildings — explicitly omitted from the image prompt.
const HIDDEN_SUBTYPES = new Set(['thieves_guild', 'sewers']);

function getArchitecturalHint(subType: string): string {
  if (HIDDEN_SUBTYPES.has(subType)) return '';
  return ARCHITECTURAL_HINTS[subType] ?? `${subType.replace(/_/g, ' ')} building`;
}

/**
 * Sprint 6 — build a compact "the settlement contains these specific
 * buildings" block for gpt-image-1. Counts collapse duplicates so 3 inns
 * become "3 inn/taverns" on a single line. Returns an empty string when
 * no POI has a subType (i.e. non-settlement maps, or settlement maps with
 * no Sprint-3 composition applied).
 */
export function buildBuildingListForImage(pois: MapPOIInput[]): string {
  if (!Array.isArray(pois) || pois.length === 0) return '';
  const grouped: Record<string, number> = {};
  for (const p of pois) {
    const st = (p as { subType?: string } | undefined)?.subType;
    if (!st) continue;
    if (HIDDEN_SUBTYPES.has(st)) continue;
    grouped[st] = (grouped[st] ?? 0) + 1;
  }
  const entries = Object.entries(grouped);
  if (entries.length === 0) return '';
  const lines = entries.map(([subType, count]) => {
    const hint = getArchitecturalHint(subType);
    if (!hint) return null;
    return `- ${count} ${hint}`;
  }).filter(Boolean);
  if (lines.length === 0) return '';
  return [
    '\nThe settlement contains these specific buildings (draw each as a recognisable structure of its type, distributed naturally across the layout):',
    ...lines,
    'Use architectural details that make each building\'s purpose recognisable at a glance.',
  ].join('\n');
}

// ── Sprint 5 — Connector hints for floor image generation ────────────────────
// Multi-level building floors include stairs/ladder/trapdoor connectors. The
// image AI is asked to render them as visual elements at the indicated
// coordinates (best-effort — data-marker overlay compensates for drift).
//
// Connector shape: { type, label?, hidden?, endpoints: [{floor,x_percent,y_percent}] }
export interface FloorConnectorHint {
  type:      'stairs' | 'ladder' | 'trapdoor' | string;
  label?:    string | null;
  hidden?:   boolean;
  endpoints: Array<{ floor: number; x_percent: number; y_percent: number }>;
}

export function buildConnectorHintsForFloor(
  connectors: FloorConnectorHint[],
  currentFloor: number,
  currentFloorLabel?: string | null,
): string {
  if (!Array.isArray(connectors) || connectors.length === 0) return '';
  const lines: string[] = [];
  for (const c of connectors) {
    const here = c.endpoints.find(e => e.floor === currentFloor);
    if (!here) continue;
    if (c.hidden) continue; // DM-only connectors are not visually drawn
    const others = c.endpoints.filter(e => e.floor !== currentFloor);
    const dirWords = others.map(o => {
      const verb = o.floor > currentFloor ? 'ascending to' : 'descending to';
      return `${verb} floor ${o.floor}`;
    }).join(', ');
    const typeWord = c.type === 'ladder'   ? 'ladder'
                    : c.type === 'trapdoor' ? 'trapdoor'
                    : 'stairway';
    const desc = c.label ? `"${c.label}"` : typeWord;
    lines.push(`- A ${typeWord} ${desc} ${dirWords}, located at approximately ${Math.round(here.x_percent)}% from left, ${Math.round(here.y_percent)}% from top.`);
  }
  if (lines.length === 0) return '';
  const floorTitle = currentFloorLabel ? `${currentFloorLabel} (floor ${currentFloor})` : `Floor ${currentFloor}`;
  return [
    `\nCONNECTORS on this floor (${floorTitle}) — render as hand-drawn visual elements at the indicated positions, leaving floor space around each:`,
    ...lines,
    'The architectural style should match the building type and atmosphere above.',
  ].join('\n');
}

// ── buildImagePrompt ──────────────────────────────────────────────────────────
// Deterministic: same MapSpec → same prompt. Used as the DALL-E 3 input.
// dalle_prompt_additions from Claude are truncated to 80 chars to prevent
// policy-triggering content from inflating or altering the core prompt.
//
// Sprint 5: third arg `floorContext` injects connector visual hints for
// multi-level building floors. Caller passes connectors on the current floor.

export function buildImagePrompt(
  spec: MapSpec,
  pois: MapPOIInput[] = [],
  floorContext?: {
    currentFloor: number;
    currentFloorLabel?: string | null;
    connectors: FloorConnectorHint[];
  },
): string {
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

  // Sprint 6 bug-fix — racial architectural hint. Emitted whenever a civilised
  // race is selected (elves, dwarves, halflings, etc.) so gpt-image-1 doesn't
  // default to generic medieval timber-frame for every map. Placed BEFORE the
  // building list so the style framing wins over per-building defaults.
  const racialHint = buildRacialArchitectureHint(spec.inhabitants);
  if (racialHint) parts.push(racialHint);

  if (spec.settlement) {
    const archetypeVisual = ARCHETYPE_VISUALS[spec.settlement.archetype];
    if (archetypeVisual) parts.push(`Features: ${archetypeVisual}.`);
    if (spec.settlement.districts.length > 0) {
      parts.push(`Districts visible: ${spec.settlement.districts.slice(0, 3).join(', ')}.`);
    }
    // Sprint 6 — concrete building list (only when POIs carry subType, i.e.
    // settlement maps with Sprint 3 composition data). Hidden / underground
    // subtypes are filtered out inside the helper.
    const buildingHints = buildBuildingListForImage(pois);
    if (buildingHints) parts.push(buildingHints);
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

  // Sprint 5 — connector hints (best-effort visual drawing). Inserted before
  // the closers so the no-text/bird's-eye rule wins if budget is tight.
  if (floorContext) {
    const hints = buildConnectorHintsForFloor(
      floorContext.connectors,
      floorContext.currentFloor,
      floorContext.currentFloorLabel,
    );
    if (hints) parts.push(hints);
  }

  // Closers — kept generic. The preset's promptAddition above is the dominant
  // style instruction; these reinforce framing and the no-text rule.
  parts.push('No text or labels. Bird\'s eye view.');
  parts.push('Highly detailed illustration.');

  // Budget bumped from 900 → 1400 to accommodate connector-hint lines on
  // multi-floor maps without truncating the preset/POI/style instructions.
  return parts.filter(Boolean).join(' ').substring(0, 1400);
}
