/**
 * MapGenerator — AI-powered map creation.
 * Generates map content via Claude (Anthropic) and a visual map image via DALL-E 3.
 *
 * Props:
 *   campaignId      string
 *   onClose         fn()
 *   onCreated       fn(map)
 *   parentMapId?    number    — id of parent map (drill-down)
 *   parentPoiId?    string    — id of POI in parent that spawned this map
 *   parentPoiCtx?   object    — the full parent POI data for context
 *   presetType?     string    — pre-set map type for drill-down
 */
import { useState, useEffect } from 'react';
import { api }             from '../../api/client.js';
import { callClaude, hasAnthropicKey, getOpenAIKey, hasOpenAIKey } from '../../api/aiClient.js';
import { ApiKeySettings }  from '../ui/ApiKeySettings.jsx';
import { buildMapWorldData, mapTypeToScope } from '../../rules-engine/generationMapper.ts';
import { buildMapSpec, withImageContract, buildEnrichmentPrompt, applyEnrichment, applyInfluencesToSpec, buildImagePrompt } from '../../rules-engine/specBuilder.ts';
import mapTagsJson     from '../../rulesets/mapTags.json';
import scopeRules      from '../../rulesets/mapScopes.json';
import archetypeRules  from '../../rulesets/settlementArchetypes.json';
import mapStylePresets from '../../rulesets/mapStylePresets.json';
import { MAP_PURPOSES, PURPOSE_BY_VALUE } from '../../constants/mapPurposes.js';
import {
  getAllSubcategoryKeys,
  getSubcategory,
  getRandomConceptSample,
  formatSubcategoryForPrompt,
  getCompatibleSubcategories,
} from '../../rulesets/poiTaxonomy.ts';
import {
  getMapTypeKeys,
  getMapTypeConfig,
  getFieldDefinition,
  getFieldsForMapType,
  getMapContext,
  normalizeMapType,
  mapTypeToLegacyLabel,
  // Sprint 6
  getCompatibleRoleOptions,
  resolveImageSize,
  getPoiCountTier,
} from '../../rulesets/mapTypeSchema.ts';
import { autoSelectFeatures, normalizePopulation, normalizeFeaturePresence } from '../../rulesets/settlementFeatures.ts';
import { SettlementCompositionPanel } from './SettlementCompositionPanel.jsx';
import './MapGenerator.css';

// Map style presets — derived from the shared JSON registry. The `$` keys are
// metadata; filter them out so the picker only shows real presets.
const MAP_STYLE_ENTRIES = Object.entries(mapStylePresets).filter(([k]) => !k.startsWith('$'));
// mapTags.json is now { tags: [...], poi_influence_rules: {...} }
const tagRules        = mapTagsJson.tags;
const influenceRules  = mapTagsJson.poi_influence_rules ?? {};

// ── Option lists ──────────────────────────────────────────────────────────────
// Sprint 1 — dropdown options derived from the schema. Legacy values (Region,
// Castle/Keep, Tavern/Inn) still parse via normalizeMapType so old maps load,
// but new maps come from the canonical list.
const MAP_TYPES = ['Random', ...getMapTypeKeys().map(k => mapTypeToLegacyLabel(k))];
const MAP_SIZES = ['Random','Small','Medium','Large'];
const TERRAIN_OPTIONS = [
  'Plains','Forest','Dense Forest','Jungle','Mountains',
  'Hills','Desert','Swamp','Tundra','Coastal','Underground',
];

// Terrain options filtered by scope ─────────────────────────────────────────
// 'null' = hide terrain section entirely; use ENVIRONMENT_CHIPS instead
const TERRAIN_BY_SCOPE = {
  world:         ['Plains','Forest','Dense Forest','Jungle','Mountains','Hills','Desert','Swamp','Tundra','Coastal'],
  region:        ['Plains','Forest','Dense Forest','Jungle','Mountains','Hills','Desert','Swamp','Tundra','Coastal'],
  local:         ['Plains','Forest','Hills','Mountains','Coastal','Desert','Swamp'],
  settlement:    ['Plains','Forest','Hills','Coastal','Desert','Swamp'],
  district:      null,  // hide terrain, show environment
  building:      null,  // hide terrain, show environment
  interior:      null,  // hide terrain, show environment
  dungeon_level: ['Underground','Mountains','Swamp','Coastal'], // flooded, volcanic, rocky
};

// Environment chips shown instead of terrain for interior/building scopes
const ENVIRONMENT_CHIPS = [
  'Dark','Damp','Flooded','Ancient','Carved Stone',
  'Natural Cave','Haunted','Magical','Toxic','Frozen',
];
const ATMOSPHERES = [
  'Random','Dangerous','Mysterious','Peaceful','Ancient',
  'Cursed','Enchanted','Abandoned','Occupied','Sacred',
];
const ERAS = ['Random','Ancient','Medieval','Dark Ages','Forgotten Ruins'];
const INHABITANTS = [
  'Random','None','Monsters','Humanoids','Undead',
  'Demons','Fey','Dragon Lair','Cult',
];
const POI_COUNTS = ['Random (3-8)','Few (2-4)','Many (6-10)','Dense (10-15)'];

const BACKEND_TYPE_MAP = {
  // Legacy values (still in DB / dropdowns)
  'Region':            'region',
  'City/Town':         'city',
  'Village':           'town',
  'Dungeon':           'dungeon',
  'Cave System':       'dungeon',
  'Ruins':             'dungeon',
  'Castle/Keep':       'interior',
  'Tavern/Inn':        'interior',
  'Temple':            'interior',
  // Sprint 1 — new schema labels
  'Wilderness':        'region',
  'Castle/Fortress':   'interior',
  'Building Interior': 'interior',
};

// Sprint 1 — schema field-key (snake_case) → params object key (mostly camelCase
// for legacy keys, snake_case for newly-added ones). Used by DynamicField + the
// prompt-injection helper so the schema can drive both UI and prompts.
const SCHEMA_TO_PARAM = {
  map_style:          'mapStyle',
  poi_count:          'poiCount',
  visual_description: 'user_description',
  // others (size, atmosphere, era, inhabitants, terrain, purpose, population,
  // settlement_role, wealth_tier, room_count, danger_level, depth, biome,
  // area_size, civilization_level, floor_count, condition) — schema key
  // matches the params key directly.
};
function paramKeyFor(fieldKey) {
  return SCHEMA_TO_PARAM[fieldKey] ?? fieldKey;
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function resolveParams(p) {
  const resolvedType  = p.mapType === 'Random' ? pickRandom(MAP_TYPES.slice(1)) : p.mapType;
  const scope         = mapTypeToScope(resolvedType);
  const terrainPool   = TERRAIN_BY_SCOPE[scope] ?? TERRAIN_OPTIONS;
  return {
    mapType:          resolvedType,
    size:             p.size        === 'Random' ? pickRandom(MAP_SIZES.slice(1))     : p.size,
    terrain:          p.terrain.length > 0 ? p.terrain : (terrainPool ? [pickRandom(terrainPool)] : []),
    atmosphere:       p.atmosphere  === 'Random' ? pickRandom(ATMOSPHERES.slice(1))   : p.atmosphere,
    era:              p.era         === 'Random' ? pickRandom(ERAS.slice(1))          : p.era,
    inhabitants:      p.inhabitants === 'Random' ? pickRandom(INHABITANTS.slice(1))   : p.inhabitants,
    poiCount:         p.poiCount,
    mapStyle:         p.mapStyle ?? 'parchment',
    purpose:          PURPOSE_BY_VALUE[p.purpose] ? p.purpose : 'standard',
    // Sprint 1 — new schema fields are passed through verbatim. The prompt
    // builder only injects hints for non-'Random' values, so a stale value
    // from a previous map-type doesn't leak into the prompt.
    population:         p.population         ?? 'Random',
    settlement_role:    p.settlement_role    ?? 'Random',
    wealth_tier:        p.wealth_tier        ?? 'Random',
    room_count:         p.room_count         ?? 'Random',
    danger_level:       p.danger_level       ?? 'Random',
    depth:              p.depth              ?? 'Random',
    biome:              p.biome              ?? 'Random',
    area_size:          p.area_size          ?? 'Random',
    civilization_level: p.civilization_level ?? 'Random',
    floor_count:        p.floor_count        ?? '1',
    condition:          p.condition          ?? 'Random',
    feature_presences:  p.feature_presences  ?? {},
    ...(p.user_description?.trim() ? { user_description: p.user_description.trim() } : {}),
  };
}

function resolvePoiCount(poiCountStr) {
  const map = {
    'Random (3-8)':  Math.floor(Math.random() * 6) + 3,
    'Few (2-4)':     Math.floor(Math.random() * 3) + 2,
    'Many (6-10)':   Math.floor(Math.random() * 5) + 6,
    'Dense (10-15)': Math.floor(Math.random() * 6) + 10,
  };
  return map[poiCountStr] ?? 5;
}

function toBackendType(mapTypeStr) {
  return BACKEND_TYPE_MAP[mapTypeStr] ?? 'dungeon';
}

// buildDallePrompt replaced by specBuilder.buildImagePrompt — see Trin D.

// ── Claude system/user prompts (split into two smaller calls) ─────────────────
// IP-clean prompts: no artist names, no published-RPG-setting names. These
// strings reach Claude and OpenAI; we keep them free of trademarked content so
// the app can ship to a wider audience without compliance risk.
const CLAUDE_SYSTEM = `You are an expert tabletop fantasy worldbuilder. Generate vivid, lore-rich locations suitable for a classic tabletop RPG. Invent original, evocative names, factions, and deities — do not use names from any published commercial RPG setting. Keep responses concise — maximum 2 sentences per description field. For POI arrays, generate maximum 6 POIs. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

// Sprint 1 — generic per-field prompt hints. When a schema-driven field has a
// non-'Random' value the AI gets a one-liner with the value + a soft hint on
// what to bias. Works across all map-types so dungeon/cave/etc. also benefit.
const FIELD_PROMPT_HINTS = [
  ['settlement_role',    'Settlement role',    'Reflect this in character and economy.'],
  ['population',         'Population tier',    'Scale buildings, services and POIs accordingly.'],
  ['wealth_tier',        'Wealth level',       'Reflect in architecture and offerings.'],
  ['room_count',         'Room count',         'Scale the number and variety of areas accordingly.'],
  ['danger_level',       'Danger level',       'Bias monsters, traps and risk accordingly.'],
  ['depth',              'Depth underground',  'Bias darkness, isolation and unfamiliar fauna.'],
  ['biome',              'Biome',              'Reflect in flora, fauna and weather.'],
  ['area_size',          'Area size',          'Scale the number of POIs and travel distance accordingly.'],
  ['civilization_level', 'Civilization level', 'Bias settlements and infrastructure density.'],
  ['floor_count',        'Floor count',        'Distribute POIs across the indicated number of levels.'],
  ['condition',          'Condition',          'Reflect in the physical state of structures.'],
];
function buildFieldHintBlock(r) {
  const lines = [];
  for (const [key, label, hint] of FIELD_PROMPT_HINTS) {
    const v = r[key];
    if (v && v !== 'Random' && v !== 'random' && v !== '') {
      lines.push(`${label}: ${v}. ${hint}`);
    }
  }
  return lines.length ? '\n' + lines.join('\n') + '\n' : '';
}

const FR_CONTEXT = `Setting: original tabletop fantasy.
Invent original, atmospheric place names, factions, and deities. Do not use names from any published commercial RPG setting (no real-world brand, module, or campaign-setting names).
Suggested naming vibe by terrain:
- Mountains → ridge/peak names ("Iron Spire", "Greybacks", "Frostmaw Range")
- Forest → ancient-woodland names ("Old Wood", "Thornveil", "Mistweave")
- Coastal → sea-tinged names ("Saltwind Reach", "Drowned Shores")
- Desert → harsh-land names ("Sunbleach", "The Ashen Waste")
- Swamp → mire/marsh names ("Reedhollow", "The Sodden Mire")
- Underground → deep-dark names ("Deepvein", "The Hollow Below")`;

/**
 * 5B-b: extended parent context for sub-map generation.
 *
 * Builds a multi-line block feeding the parent POI's rich narrative
 * (history, current_situation) and the parent map's title/subtitle into
 * Step 1 + Step 2 prompts so the sub-map stays coherent with what came
 * before. Purpose-aware: Major maps additionally see quest hooks + secrets;
 * Decoy maps are explicitly told to ignore them.
 *
 * @param {{ poi?: object, parentMap?: object, purpose?: string }} ctx
 */
function parentNote(ctx) {
  const poi = ctx?.poi;
  if (!poi) return '';

  const head = poi.short_description
    ? `Context: this sub-map is located within or near "${poi.name}" — ${poi.short_description}`
    : `Context: this sub-map is located within or near "${poi.name}".`;
  const parts = [head];

  const firstSentence = (s) =>
    typeof s === 'string' ? s.match(/^[^.!?]+[.!?]/)?.[0]?.trim() : null;

  const dmFirst = firstSentence(poi.dm_description);
  if (dmFirst) parts.push(`Physical setting: ${dmFirst}`);

  const histFirst = firstSentence(poi.history);
  if (histFirst) parts.push(`Historical context: ${histFirst}`);

  const sitFirst = firstSentence(poi.current_situation);
  if (sitFirst) parts.push(`Current activity: ${sitFirst}`);

  const parentMap = ctx?.parentMap;
  if (parentMap?.title) {
    parts.push(
      parentMap.subtitle
        ? `This is a sub-location of "${parentMap.title}" — ${parentMap.subtitle}`
        : `This is a sub-location of "${parentMap.title}".`,
    );
  }

  // Purpose-aware exception: Major weaves hooks/secrets in; Decoy is told
  // explicitly to ignore them (see purposeGuidance for the full content).
  const purpose = ctx?.purpose;
  if (purpose === 'major') {
    if (poi.quest_hooks) {
      const hooks = Array.isArray(poi.quest_hooks) ? poi.quest_hooks.join('; ') : String(poi.quest_hooks);
      if (hooks.trim()) parts.push(`Quest hooks to weave in: ${hooks}`);
    }
    if (poi.secrets && String(poi.secrets).trim()) {
      parts.push(`Hidden knowledge available: ${poi.secrets}`);
    }
  } else if (purpose === 'decoy') {
    parts.push(
      'NOTE: Even if the parent POI has secrets or quest hooks, DO NOT reference them in this sub-map. This is a decoy — it must not advance the plot.',
    );
  }

  return parts.join('\n');
}

/**
 * 5B-b: bias the generation prompts toward a specific content scope.
 *
 * - decoy:    mundane side-location, trivial loot, no plot
 * - minor:    light flavour, modest loot
 * - major:    rich quest location, key NPCs, plot-critical content
 * - standard: no extra constraint (Claude's default behaviour)
 */
function purposeGuidance(purpose) {
  switch (purpose) {
    case 'decoy':
      return `
[PURPOSE: DECOY LOCATION]
This sub-map represents a plausible side-location the party may have stumbled into by mistake. CRITICAL: it must look REAL but contain NO plot content.
- Generate 1-3 MUNDANE POIs (everyday objects, abandoned items, environmental features).
- Loot tier: TRIVIAL only — copper coins, broken pottery, faded letters, dusty tools, mouldy food, rusted nails.
- NO quest hooks. NO major NPCs. NO plot-relevant secrets.
- Atmosphere: ordinary, lived-in, slightly forgotten. NOT epic, NOT cursed, NOT magical.
- Examples of good decoy content:
  - "An abandoned root cellar" with dusty barrels of pickled cabbage, a forgotten broom, a mouse nest
  - "A neglected gardener's shed" with rusted tools, a half-finished seedling tray, a sleeping cat
  - "An old well shaft" with stagnant water, a rusted bucket, lichen on the stones
- Title should sound like a mundane place name, NOT an epic dungeon name.
  - GOOD: "Old Tannery", "The Bramble Path", "Cooper's Storeroom"
  - BAD: "The Bloodied Sanctum", "Shrine of the Drowned Lord"
- REINTERPRETATION RULE: Even if the user_description above mentions cursed, magical, undead or otherwise dramatic content (e.g. "skeletal fishermen reanimated by a curse"), REINTERPRET those elements as PAST and ABANDONED. Keep visual elements (boats, bones, ruined shrines) but strip out active plot ("OLD ABANDONED FISHING BOATS with bone-debris on the deck suggesting a long-past tragedy" — no active undead, no active curse, no active magic). The location must read as POST-PLOT: whatever happened here is OVER.`;
    case 'minor':
      return `
[PURPOSE: MINOR LOCATION]
This is a side-location with modest interest. Some flavour, but not plot-critical.
- Generate 1-3 POIs with mild flavour.
- Loot tier: MINOR — a few silver pieces, a weathered map, a moderate-quality common item.
- Optional: 1 minor NPC with background flavour (not quest-relevant).
- Quest hooks are background lore only — no active plots requiring party action.`;
    case 'major':
      return `
[PURPOSE: MAJOR QUEST LOCATION]
This sub-map is plot-critical.
- Generate 5-8 rich, varied POIs.
- Include 1-2 named NPCs with motivations and dialogue hooks.
- Include 1-2 active quest hooks the party can pursue.
- Loot tier: MODERATE to MAJOR — magical items, significant treasure caches, plot-relevant artifacts.
- Secrets advance the main plot.`;
    case 'standard':
    default:
      return ''; // No extra constraint — keep Claude's default behaviour.
  }
}

/** CALL 1 — map metadata only. Fast, ~800-1200 tokens output. */
function buildMetadataPrompt(r, parentCtx, parentMapCtx) {
  const desc = (r.user_description ?? '').trim();
  // A substantial description is authoritative — the dropdown values are only
  // fallback hints and must be overridden by anything explicit in it.
  const descBlock = desc.length >= 30
    ? `\nUSER DESCRIPTION (authoritative — this defines the location. The dropdown values below are fallback hints ONLY and must be overridden by anything explicit here):\n"${desc}"\n`
    : desc
      ? `\nUser description hint: "${desc}"\n`
      : '';
  // 5B-b: purpose biases scope/loot/plot. Title override prevents Decoy
  // sub-maps from getting epic-sounding names that telegraph plot relevance.
  const purposeBlock = purposeGuidance(r.purpose);
  const titleOverride = r.purpose === 'decoy'
    ? `\n\nIMPORTANT TITLE OVERRIDE: The title MUST sound like an ordinary, mundane place name. Use simple compound names like "Old Tannery", "Stonefoot Cellar", "Miller's Drying Shed". DO NOT use evocative titles with words like "Sanctum", "Shrine", "Whisper", "Doom", "Forsaken", or similar dramatic vocabulary. Players should NOT be able to tell this is plot-irrelevant.`
    : '';
  return `Generate metadata for a tabletop fantasy ${r.mapType} map.
${descBlock}Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Era: ${r.era} | Inhabitants: ${r.inhabitants} | Size: ${r.size}${buildFieldHintBlock(r)}${parentNote({ poi: parentCtx, parentMap: parentMapCtx, purpose: r.purpose })}
${FR_CONTEXT}${purposeBlock}${titleOverride}

Respond with ONLY this JSON object:
{
  "title": "Evocative original fantasy location name (3-5 words)",
  "subtitle": "Atmospheric tagline (5-8 words)",
  "description": "2 sentence atmospheric overview with rich original lore",
  "history": "2 sentences of original fantasy backstory",
  "atmosphere_notes": "One sentence: sounds, smells, lighting",
  "dalle_prompt_additions": "Key visual details for image, max 100 chars"
}`;
}

/**
 * Phase 6 — Step 1.5: Haiku picks 6-12 POI sub-categories that fit the map.
 *
 * Cheap (~$0.001), fast (~1-2 s), low-stakes (failure falls back silently).
 * The result feeds Step 2 — Sonnet then sees a curated set of archetypes
 * with sampled concepts, dramatically reducing the "every map gets a
 * Sanctum and an Ossuary" monotony.
 *
 * @returns {Promise<{selected: string[], rationale: string} | null>}
 *          null on any failure → caller falls back to SCOPE defaults.
 */
async function selectPOISubcategories(r, meta, parentCtx, settlementSelection) {
  try {
    const allKeys = getAllSubcategoryKeys();

    // Sprint 2 — filter the pool to context-compatible sub-categories so a
    // world map never gets a tomb POI, a settlement never gets a cave-feature,
    // etc. Description override still lets Haiku reach into the excluded set
    // when the user explicitly calls for it.
    const mapContext      = getMapContext(normalizeMapType(r.mapType));
    const compatibleKeys  = getCompatibleSubcategories(mapContext);
    const usableKeys      = compatibleKeys.length > 0 ? compatibleKeys : allKeys;
    const excludedKeys    = allKeys.filter(k => !usableKeys.includes(k));
    console.log(
      `[MapGenerator] Step 1.5/3 — context: ${mapContext}, compatible pool size: ${usableKeys.length}/${allKeys.length}`,
    );

    const subList     = usableKeys.map(k => formatSubcategoryForPrompt(k)).join('\n');
    const excludedList = excludedKeys.length > 0
      ? excludedKeys.map(k => `- ${k}`).join('\n')
      : '(none)';
    const parentLine = parentCtx
      ? `\n- Parent location: "${parentCtx.name}" — ${parentCtx.short_description ?? ''}`
      : '';
    const purposeLine = r.purpose && r.purpose !== 'standard'
      ? `\n- Sub-map purpose: ${r.purpose}`
      : '';
    const desc = (r.user_description ?? '').trim();
    const userPrompt = `You are a tabletop RPG cartographer's assistant. Pick 6-12 POI sub-categories from the AVAILABLE list that genuinely fit this map.

MAP CONTEXT (compatibility filter applied — context: ${mapContext}):
- Type: ${r.mapType}
- Title: "${meta?.title ?? '(none)'}"
- Atmosphere: ${r.atmosphere}
- Era: ${r.era}
- Terrain: ${r.terrain.join(', ')}
- Inhabitants: ${r.inhabitants}
- User description: ${desc || '(none provided)'}${parentLine}${purposeLine}

AVAILABLE SUB-CATEGORIES (filtered for context "${mapContext}"):
${subList}

DESCRIPTION OVERRIDE:
If the user description explicitly calls for something normally incompatible with this map's context (e.g. "ancient portal in the village square" on a settlement map), you MAY include the relevant sub-category from the EXCLUDED list below even though it isn't in the filtered set. The description takes precedence over default context filtering. Otherwise, do NOT reach into the excluded list.

Sub-categories EXCLUDED for context "${mapContext}" (only use if user description specifically calls for them):
${excludedList}

REQUIREMENTS:
1. Pick 6-12 sub-category keys (verbatim — from the AVAILABLE list above, or from EXCLUDED if user description warrants it).
2. Favour sub-categories that match specific features in the description.
3. Try to include at least one sub-category from each top-level (structure/natural/people/enigma) present in the filtered set — unless the location strictly excludes one.
4. For thematic locations (coastal, mountain, ruined), it's fine to weight several sub-categories from one top-level.
5. For Decoy-purpose sub-maps, lean toward MUNDANE keys (structure:workshop, structure:civic, structure:dwelling, structure:infrastructure, people:small_settlement) — avoid enigma:relic_site, enigma:cursed_site, enigma:anomaly.
${settlementSelection ? `
SETTLEMENT COMPOSITION (Sprint 3 — your selected sub-categories MUST cover the structural archetypes these required / auto-rolled features map to, since Step 2 will be told to emit a POI for each):
REQUIRED features: ${settlementSelection.required_features.map(f => f.subType).join(', ') || '(none)'}
AUTO-ROLLED features: ${settlementSelection.auto_picked_features.map(f => f.subType).join(', ') || '(none)'}
EXCLUDED features (must NOT appear): ${settlementSelection.excluded_features.length ? settlementSelection.excluded_features.join(', ') : '(none)'}
Hint mapping: inn_tavern/tavern/alehouse/market_square/general_store/trading_post/warehouse/magic_shop/scribe/library/apothecary → structure:commercial. smith/weapon_smith/armor_smith/carpenter/stables → structure:workshop. town_hall/guard_post/prison/barracks → structure:civic. castle/manor → structure:fortification. temple/shrine → structure:temple OR structure:shrine. wizards_tower → structure:fortification OR enigma:ley_node. sewers/docks/mill → structure:infrastructure. thieves_guild → people:organized_group.
` : ''}
Respond with ONLY this JSON, no markdown fences:
{
  "selected": ["category:subcategory", "category:subcategory", ...],
  "rationale": "1-2 sentence explanation"
}`;
    const result = await callClaude({
      systemPrompt: 'You are a tabletop RPG cartographer\'s assistant. Respond with raw JSON only — no markdown fences.',
      userPrompt,
      maxTokens: 500,
      model:     'claude-haiku-4-5',
    });
    // Validate against the full key set so Haiku is allowed to reach into the
    // excluded list when the description override applies.
    const validKeys = new Set(allKeys);
    const selected = Array.isArray(result?.selected)
      ? result.selected.filter(k => typeof k === 'string' && validKeys.has(k))
      : [];
    if (selected.length < 3) {
      console.warn('[MapGenerator] Step 1.5 — Haiku returned too few valid keys:', selected);
      return null;
    }
    return {
      selected,
      rationale: typeof result?.rationale === 'string' ? result.rationale : '',
    };
  } catch (e) {
    console.warn('[MapGenerator] Step 1.5 — Haiku selection failed (falling back):', e.message);
    return null;
  }
}

/** CALL 2 — POIs + encounter table. Uses title from call 1 for context. */
function buildPoisPrompt(r, numPois, meta, parentCtx, parentMapCtx, selectedSubcategories, settlementSelection) {
  // Sprint 6 — POI count tier resolves the recommended + hard_cap for this
  // (map-type, population). cappedPois targets the upper end of the
  // recommended range but never crosses hard_cap and always covers explicit
  // forced POIs from numeric composition presences (Sprint 6 multi-count).
  const popSlugForTier = normalizePopulation(r.population);
  const tier           = getPoiCountTier(r.mapType, popSlugForTier);
  // Total POIs required by numeric presences (3× inn + 2× smith = 5).
  const forcedPoiTotal = settlementSelection?.required_poi_total ?? 0;
  // Distinct auto-rolled feature types — one POI each.
  const autoFeatureTypes = settlementSelection?.auto_picked_features.length ?? 0;
  // Sonnet's quota must be >= forcedPoiTotal + autoFeatureTypes; clamp to
  // hard_cap to avoid truncation. numPois (the legacy dropdown) is honored
  // as a floor when no settlement composition is in play.
  const floor = settlementSelection
    ? forcedPoiTotal + autoFeatureTypes
    : Math.min(numPois, tier.recommended[1]);
  const cappedPois = Math.min(tier.hard_cap, Math.max(floor, tier.recommended[1]));

  // Sprint 3 bug-fix / Sprint 6 rework: trim auto-picked features when the
  // forced-required total already saturates the cap. Required survive in full
  // (DM's explicit picks); auto-rolled are sorted by population-specific
  // rarity descending and trimmed to fit the remaining slots.
  let promptSelection = settlementSelection;
  if (settlementSelection) {
    const requiredSlots = forcedPoiTotal;                     // 3× + 2× + 1× = 6
    const remaining     = Math.max(0, cappedPois - requiredSlots);
    if (autoFeatureTypes > remaining) {
      const popSlug = popSlugForTier;
      const sortedAuto = [...settlementSelection.auto_picked_features].sort((a, b) =>
        (b.rarityBySize?.[popSlug] ?? 0) - (a.rarityBySize?.[popSlug] ?? 0),
      );
      promptSelection = {
        ...settlementSelection,
        auto_picked_features: sortedAuto.slice(0, remaining),
      };
    }
  }
  const typeHint = ['Region', 'City/Town', 'Village'].includes(r.mapType)
    ? 'For this region map include a variety of: settlements, ruins, caves, encounter areas, landmarks.'
    : 'For this interior/dungeon map include: rooms, traps, treasures, encounters, boss area.';
  // Bug #6: the POIs must stay inside the setting the user described. Same
  // authoritative treatment Phase 3 gave the metadata call (call 1) — without
  // it, Step 2 drifts (a "coastal fishing village" became a swamp/undead map).
  const desc = (r.user_description ?? '').trim();
  const descBlock = desc.length >= 30
    ? `\nUSER DESCRIPTION (authoritative — every POI MUST fit the location, setting, biome and terrain described here. Be creative and add rich lore WITHIN it, but do NOT relocate the map to a different biome or setting):\n"${desc}"\n`
    : desc
      ? `\nUser description hint: "${desc}"\n`
      : '';
  // 5B-b: purpose biases how many / how rich the POIs should be.
  const purposeBlock = purposeGuidance(r.purpose);
  // Phase 6: archetype block from Haiku's Step 1.5 selection — each POI
  // should fit ONE archetype, with the specific concept varied for the
  // location's described features. Counters the "every map is a Sanctum"
  // bias by surfacing concrete alternatives Sonnet would otherwise default
  // away from. Falls through silently when Step 1.5 failed.
  let archetypeBlock = '';
  if (Array.isArray(selectedSubcategories) && selectedSubcategories.length > 0) {
    const lines = selectedSubcategories
      .map(key => {
        const sub = getSubcategory(key);
        if (!sub) return null;
        const sample = getRandomConceptSample([key], 6);
        return `[${key}] ${sub.label} — ${sub.description}\n    Example concepts: ${sample.join(', ')}`;
      })
      .filter(Boolean);
    if (lines.length > 0) {
      archetypeBlock = `

AVAILABLE ARCHETYPES (each POI should fit ONE archetype; vary the specific concept to suit the described features. Example concepts are inspiration — feel free to invent variations within the archetype):
${lines.join('\n')}

IMPORTANT — vary your POI names and tone. Do NOT reuse the words "Sunken", "Weeping", "Ossuary", "Sanctum", "Hollow", "Spire", "Forsaken", "Drowned" unless the description explicitly demands them. Mix tonal registers: not every POI needs to sound gothic or melancholic. A working tannery and a haunted shrine can live on the same map.`;
    }
  }
  // Sprint 3 — settlement composition: concrete structural directives Sonnet
  // must honour. Each required/auto feature becomes a POI with the matching
  // subType; excluded features must NOT appear. Uses the trimmed
  // promptSelection so the must-include count matches cappedPois exactly.
  //
  // Sprint 4 — also surface npc_suggestions per feature so Sonnet emits a
  // suggested_npcs array on each settlement-feature POI. These are sketches
  // (role + name + brief), not full statblocks; the POI panel's "Add to NPCs"
  // button later asks Haiku to expand each sketch into a full NPC record.
  let settlementBlock = '';
  if (promptSelection) {
    // Sprint 6 — required features carry requested_count (1..5). Emit
    // "3× subType" so Sonnet knows to create three distinct POIs of that
    // type, each with a unique name + identity.
    const fmtRequired = (arr) => arr.length
      ? arr.map(f => {
          const sug = f.npc_suggestions;
          const npcHint = sug?.enabled
            ? ` | suggest up to ${sug.count ?? 1} NPC(s) per instance — roles: ${(sug.roles ?? []).join(', ') || 'staff'}`
            : ' | NO suggested_npcs (building only, no canonical resident)';
          const count = f.requested_count ?? 1;
          const xLabel = count > 1 ? `${count}× ` : '';
          return `- ${xLabel}subType="${f.subType}" — ${f.label} — ${f.description}${npcHint}`;
        }).join('\n')
      : '  (none)';
    const fmtAuto = (arr) => arr.length
      ? arr.map(f => {
          const sug = f.npc_suggestions;
          const npcHint = sug?.enabled
            ? ` | suggest up to ${sug.count ?? 1} NPC(s) — roles: ${(sug.roles ?? []).join(', ') || 'staff'}`
            : ' | NO suggested_npcs (building only, no canonical resident)';
          return `- subType="${f.subType}" — ${f.label} — ${f.description}${npcHint}`;
        }).join('\n')
      : '  (none)';
    const exc = promptSelection.excluded_features.length
      ? promptSelection.excluded_features.join(', ')
      : '(none)';
    settlementBlock = `

SETTLEMENT COMPOSITION (these are concrete structural requirements — each MUST become a POI with the listed subType set EXACTLY):
REQUIRED (must appear with the EXACT count shown; the names + narratives are yours, the building type is fixed):
${fmtRequired(promptSelection.required_features)}
AUTO-ROLLED (one of each must appear, same subType convention):
${fmtAuto(promptSelection.auto_picked_features)}
EXCLUDED (MUST NOT appear even if the archetype suggests them): ${exc}

DUPLICATES — when a required entry shows "3× inn_tavern" you must create three separate POIs with subType="inn_tavern", each with a unique name, distinct personality, and slightly different niche (e.g. a coaching inn near the gate, a quiet riverside tavern, and a rowdy soldiers' hangout). Do NOT collapse multiple required entries into a single POI.

For every POI that maps to one of the above features set "subType" to the EXACT slug shown. For POIs that don't match any feature, leave "subType" as null.

SUGGESTED NPCs (Sprint 4): for each settlement-feature POI whose entry above lists "suggest up to N NPC(s)", emit a "suggested_npcs" array of up to N entries — one per listed role you choose to include (you may emit fewer than N, never more). Each entry: { "role": "<role label exactly as listed>", "name": "<short evocative original name>", "brief": "<1-sentence personality + hook>", "is_hidden": <true if this NPC belongs to a DM-only POI like thieves_guild, else false> }. For POIs marked "NO suggested_npcs" or for non-settlement-feature POIs, omit the field or leave it as []. Do NOT invent NPCs for buildings (warehouse, sewers) that explicitly say NO suggested_npcs.`;
  }
  return `For the tabletop fantasy ${r.mapType} map "${meta.title}":
${descBlock}Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Inhabitants: ${r.inhabitants}${buildFieldHintBlock(r)}${parentNote({ poi: parentCtx, parentMap: parentMapCtx, purpose: r.purpose })}
${typeHint}${purposeBlock}${archetypeBlock}${settlementBlock}
Use evocative original names, factions and lore for all POIs — no published-setting references. Keep each field to 1-2 sentences maximum.

Generate exactly ${cappedPois} points of interest spread across the map.

Respond with ONLY this JSON object:
{
  "pois": [
    {
      "id": "poi_1",
      "name": "evocative original location name",
      "type": "city|village|ruins|cave|dungeon|encounter|treasure|trap|npc|landmark|mystery",
      "subType": "Sprint 3 — snake_case slug when this POI matches a listed settlement feature (e.g. inn_tavern, smith, market_square, magic_shop, town_hall); null otherwise",
      "x_percent": 20,
      "y_percent": 35,
      "is_dm_only": false,
      "short_description": "One sentence players might learn",
      "dm_description": "1-2 sentence DM detail with original lore",
      "history": "One sentence original fantasy backstory",
      "current_situation": "One sentence current state",
      "encounters": "Possible encounter (or null)",
      "treasure": "Loot if any (or null)",
      "secrets": "Hidden info or original plot hook (or null)",
      "can_drill_down": true,
      "drill_down_type": "dungeon|cave|city|ruins|null",
      "quest_hooks": ["original fantasy hook"],
      "suggested_npcs": [
        { "role": "innkeeper", "name": "evocative original name", "brief": "1-sentence personality + hook", "is_hidden": false }
      ]
    }
  ],
  "random_encounter_table": [
    {"roll": "1-2", "encounter": "evocative original encounter"},
    {"roll": "3-4", "encounter": "evocative original encounter"},
    {"roll": "5-6", "encounter": "evocative original encounter"}
  ],
  "secrets": ["One original map-level secret"],
  "plot_hooks": ["One original tabletop fantasy campaign hook"]
}

Rules:
- x_percent and y_percent: integers between 5 and 95, spread them out — do NOT cluster
- can_drill_down: true for caves, dungeons, ruins, cities, villages
- is_dm_only: true for traps, secrets, hidden locations`;
}

// ── DALL-E generation ─────────────────────────────────────────────────────────
// Sprint 6: `size` is now per-call — resolved upstream from mapTypeSchema's
// resolveImageSize(mapType, popSlug). gpt-image-1 supports 1024x1024,
// 1024x1536, 1536x1024, and 'auto' as of 2026-04. We never request 'auto'
// because we want deterministic widescreen for settlement + wilderness maps.
const VALID_IMAGE_SIZES = new Set(['1024x1024', '1024x1536', '1536x1024']);
async function callDalleOnce(prompt, apiKey, size = '1024x1024') {
  const safeSize = VALID_IMAGE_SIZES.has(size) ? size : '1024x1024';
  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      // gpt-image-1 — dall-e-3 was removed from OpenAI's API on 2026-05-12.
      // gpt-image-1 takes no `style` / `response_format` and uses high/medium/low
      // (not standard/hd) for `quality`, so we send only the universal fields.
      // It always returns base64 (b64_json), never a URL.
      model: 'gpt-image-1',
      prompt,
      n:     1,
      size:  safeSize,
    }),
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.error?.message ?? `OpenAI ${resp.status}`;
    const code = data?.error?.code ?? data?.error?.type ?? '';
    throw Object.assign(new Error(msg), { code });
  }
  return data;
}

// Convert a base64 string to a Blob — gpt-image-1 returns b64_json, not a URL.
function b64ToBlob(b64, type = 'image/png') {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

async function generateAndSaveImage(map, prompt, size = '1024x1024') {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('No OpenAI API key — skipping image generation.');

  console.log('[Map] Calling gpt-image-1 for map image (size=%s)...', size);

  let data;
  try {
    data = await callDalleOnce(prompt, apiKey, size);
  } catch (firstErr) {
    // Retry once on server_error after 3 s
    if (firstErr.code === 'server_error' || firstErr.message?.includes('server_error')) {
      console.warn('[Map] gpt-image-1 server_error — retrying in 3 s...');
      await new Promise(r => setTimeout(r, 3000));
      data = await callDalleOnce(prompt, apiKey, size);
    } else {
      throw firstErr;
    }
  }

  const b64 = data?.data?.[0]?.b64_json;
  if (!b64) throw new Error('gpt-image-1 returned no image data.');

  console.log('[Map] Image received — persisting to server...');

  // gpt-image-1 returns a base64 PNG (no URL). Upload it through the existing
  // multipart image endpoint, which writes it to /uploads/maps/ and returns
  // the updated map record with a permanent image_url. (No Content-Type
  // header — the browser sets the multipart boundary itself.)
  const token = localStorage.getItem('dnd_token');
  const form  = new FormData();
  form.append('image', b64ToBlob(b64, 'image/png'), `map-${map.id}.png`);
  const persistResp = await fetch(`/api/maps/${map.id}/image`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}` },
    body:    form,
  });
  if (!persistResp.ok) {
    const err = await persistResp.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to persist image (${persistResp.status})`);
  }
  const updated = await persistResp.json();

  console.log('[Map] Image persisted permanently — id:', updated?.id);
  return updated;
}

// ── 5A: pre-fill Visual Description in the Generate-Sub-Map modal from the
// spawning POI's narrative. Template-based (no Claude micro-call): joins the
// POI's short_description with the first sentence of its dm_description. The
// DM can edit before generating. Returns null when there's nothing usable.
function buildVisualDescriptionFromPOI(poi) {
  if (!poi) return null;
  const parts = [];
  if (poi.short_description) parts.push(String(poi.short_description).trim());
  if (poi.dm_description) {
    const firstSentence = String(poi.dm_description).match(/^[^.!?]+[.!?]/)?.[0];
    if (firstSentence) parts.push(firstSentence.trim());
  }
  const joined = parts.join(' ').trim();
  return joined || null;
}

/**
 * Sprint 1 — DynamicField: renders one schema-driven field into the
 * MapGenerator form. Reads the merged FieldDefinition (global + per-map-type
 * override), resolves the params key via paramKeyFor, and dispatches by
 * `type` (select / multi_chip / textarea). Special-cases map_style and
 * purpose because they use external registries (mapStylePresets, MAP_PURPOSES)
 * rather than `options_global`.
 */
function DynamicField({ fieldKey, mapType, params, setP }) {
  const def = getFieldDefinition(mapType, fieldKey);
  if (!def) return null;
  const pKey  = paramKeyFor(fieldKey);
  const value = params[pKey];

  // Sprint 6 — Settlement Role × Population gating. Filter the role
  // dropdown down to roles that match the currently selected population,
  // and auto-reset to "Random" if the previously chosen role is now
  // incompatible. Quiet (no warning) per spec.
  if (fieldKey === 'settlement_role') {
    const popSlug = normalizePopulation(params.population);
    const opts    = getCompatibleRoleOptions(popSlug);
    const valid   = new Set(opts.map(o => o.value));
    if (value && value !== 'Random' && !valid.has(value)) {
      // Defer to next tick so we don't setState during render.
      queueMicrotask(() => setP(pKey, 'Random'));
    }
    return (
      <div className="mgn-field">
        <div className="mgn-field-label">{def.label}</div>
        <select className="mgn-select" value={valid.has(value) ? value : 'Random'}
                onChange={e => setP(pKey, e.target.value)}>
          {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    );
  }

  if (def.type === 'select') {
    if (def.source === 'mapStylePresets') {
      return (
        <div className="mgn-field">
          <div className="mgn-field-label">{def.label}</div>
          <select className="mgn-select" value={value ?? 'parchment'}
                  onChange={e => setP(pKey, e.target.value)}
                  title={mapStylePresets[value]?.description ?? ''}>
            {MAP_STYLE_ENTRIES.map(([slug, p]) => (
              <option key={slug} value={slug} title={p.description}>{p.label}</option>
            ))}
          </select>
          <div style={{ fontSize: '0.72rem', color: '#9a875a', marginTop: 4, lineHeight: 1.35 }}>
            {mapStylePresets[value]?.description ?? ''}
          </div>
        </div>
      );
    }
    if (fieldKey === 'purpose') {
      return (
        <div className="mgn-field">
          <div className="mgn-field-label">{def.label}</div>
          <select className="mgn-select" value={value ?? 'standard'}
                  onChange={e => setP(pKey, e.target.value)}
                  title={PURPOSE_BY_VALUE[value]?.description ?? ''}>
            {MAP_PURPOSES.map(p => (
              <option key={p.value} value={p.value} title={p.description}>{p.label}</option>
            ))}
          </select>
          <div style={{ fontSize: '0.72rem', color: '#9a875a', marginTop: 4, lineHeight: 1.35 }}>
            {PURPOSE_BY_VALUE[value]?.description ?? ''}
          </div>
        </div>
      );
    }
    const opts = def.options_global ?? def.options ?? [];
    const fallback = opts[0]
      ? (typeof opts[0] === 'string' ? opts[0] : opts[0].value)
      : '';
    return (
      <div className="mgn-field">
        <div className="mgn-field-label">{def.label}</div>
        <select className="mgn-select" value={value ?? fallback}
                onChange={e => setP(pKey, e.target.value)}>
          {opts.map(o => (
            typeof o === 'string'
              ? <option key={o} value={o}>{o}</option>
              : <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>
    );
  }

  if (def.type === 'multi_chip') {
    const opts     = def.options_global ?? [];
    const max      = def.max ?? 99;
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="mgn-field" style={{ gridColumn: '1 / -1' }}>
        <div className="mgn-field-label">
          {def.label}{' '}
          <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>
            (pick up to {max}{selected.length > 0 ? ` — ${selected.length} selected` : ''})
          </span>
        </div>
        <div className="mgn-terrain-grid">
          {opts.map(o => {
            const isSel   = selected.includes(o);
            const canPick = isSel || selected.length < max;
            return (
              <button
                key={o}
                type="button"
                className={`mgn-terrain-chip${isSel ? ' mgn-terrain-chip--on' : ''}`}
                disabled={!canPick}
                onClick={() => {
                  if (isSel) setP(pKey, selected.filter(x => x !== o));
                  else if (selected.length < max) setP(pKey, [...selected, o]);
                }}
              >
                {o}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (def.type === 'textarea') {
    return (
      <div className="mgn-field" style={{ gridColumn: '1 / -1' }}>
        <div className="mgn-field-label">
          {def.label}{' '}
          <span className="mgn-field-optional">(optional — enhances map image)</span>
        </div>
        <textarea
          className="mgn-textarea"
          rows={2}
          placeholder={def.placeholder ?? ''}
          value={value ?? ''}
          onChange={e => setP(pKey, e.target.value)}
          maxLength={300}
        />
      </div>
    );
  }

  return null;
}

// ── MapGenerator Component ────────────────────────────────────────────────────
export function MapGenerator({
  campaignId,
  onClose,
  onCreated,
  parentMapId  = null,
  parentPoiId  = null,
  parentPoiCtx = null,
  parentMapCtx = null,   // { title, subtitle } from MapManager.handleDrillDown
  presetType   = null,
  presetParams   = null,   // Partial<GeneratedParams> from connectionEngine or sketchToGeneratedParams
  presetImageUrl = null,   // pre-generated image URL from generate-from-sketch route
  fromSketch     = false,  // true when opened from TerrainSketchEditor
  sketchSpec     = null,   // full SketchSpec (cells + overlays) — persisted to data.sketch on create
}) {
  // presetType takes priority for mapType; presetParams fills terrain/atmosphere/etc.
  const [params, setParams] = useState({
    mapType:          presetType ?? presetParams?.mapType ?? 'Random',
    size:             presetParams?.size             ?? 'Random',
    terrain:          presetParams?.terrain          ?? [],
    atmosphere:       presetParams?.atmosphere       ?? 'Random',
    era:              presetParams?.era              ?? 'Random',
    inhabitants:      presetParams?.inhabitants      ?? 'Random',
    poiCount:         presetParams?.poiCount         ?? 'Random (3-8)',
    // mapStyle: sub-maps inherit from parent via presetParams.mapStyle
    // (set in MapManager.handleDrillDown); top-level maps default to parchment.
    mapStyle:         presetParams?.mapStyle         ?? 'parchment',
    // 5B-b: sub-map purpose. Default 'standard' even for sub-maps — parent's
    // purpose is intentionally NOT inherited (a Major parent often spawns
    // Decoy children, and vice versa). DM picks per-sub-map.
    purpose:          'standard',
    // Sprint 1 — new schema fields. Defaulted to 'Random' / first option so
    // they don't get injected into prompts until the DM picks something.
    population:         presetParams?.population         ?? 'Random',
    settlement_role:    presetParams?.settlement_role    ?? 'Random',
    wealth_tier:        presetParams?.wealth_tier        ?? 'Random',
    room_count:         presetParams?.room_count         ?? 'Random',
    danger_level:       presetParams?.danger_level       ?? 'Random',
    depth:              presetParams?.depth              ?? 'Random',
    biome:              presetParams?.biome              ?? 'Random',
    area_size:          presetParams?.area_size          ?? 'Random',
    civilization_level: presetParams?.civilization_level ?? 'Random',
    floor_count:        presetParams?.floor_count        ?? '1',
    condition:          presetParams?.condition          ?? 'Random',
    // Sprint 3 — per-feature presence overrides for city/village maps.
    // Shape: { feature_subType: 'required' | 'excluded' } — entries with
    // 'auto' default are simply absent from the object.
    feature_presences:  presetParams?.feature_presences  ?? {},
    user_description: presetParams?.user_description ?? buildVisualDescriptionFromPOI(parentPoiCtx) ?? '',
  });
  const [step,        setStep]        = useState('form'); // 'form'|'generating'|'error'
  const [step1Done,   setStep1Done]   = useState(false); // metadata call
  const [step1_5Done, setStep1_5Done] = useState(false); // Phase 6: Haiku archetype-selection call
  const [step2Done,   setStep2Done]   = useState(false); // POI call
  const [step3Done,   setStep3Done]   = useState(false); // DALL-E image
  const [step3Skip,   setStep3Skip]   = useState(false); // no OpenAI key / failed
  const [step3Error,  setStep3Error]  = useState('');    // DALL-E error message
  const [error,       setError]       = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const setP = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const toggleTerrain = (t) => setParams(p => ({
    ...p,
    terrain: p.terrain.includes(t) ? p.terrain.filter(x => x !== t) : [...p.terrain, t],
  }));

  // Derive scope + terrain options from current mapType ──────────────────────
  const activeScope    = params.mapType === 'Random' ? 'region' : mapTypeToScope(params.mapType);
  const terrainOptions = TERRAIN_BY_SCOPE[activeScope] ?? TERRAIN_OPTIONS;
  const showTerrain    = terrainOptions !== null;
  const showEnvChips   = !showTerrain; // building/interior/district

  // Strip terrain selections that are no longer valid when mapType changes
  useEffect(() => {
    if (params.terrain.length === 0) return;
    if (!showTerrain) { setP('terrain', []); return; }
    const valid = params.terrain.filter(t => terrainOptions.includes(t));
    if (valid.length !== params.terrain.length) setP('terrain', valid);
  }, [params.mapType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sprint 6 — pre-flight POI count check. Surfaces a warning modal when the
  // DM's manual composition + auto selection would land above the recommended
  // range, and a hard-block (no "Generate anyway") when they'd exceed the
  // hard cap. Skipped silently for non-settlement maps with no composition.
  const [poiWarning, setPoiWarning] = useState(null);
  // Shape: { kind: 'soft'|'hard', expected: number, tier: { recommended, hard_cap }, mapTypeLabel, popLabel }

  const computeExpectedPoiCount = () => {
    const popSlug = normalizePopulation(params.population);
    const tier    = getPoiCountTier(params.mapType, popSlug);
    // Forced count from numeric presences
    const presences = params.feature_presences ?? {};
    let forced = 0;
    for (const v of Object.values(presences)) {
      const n = normalizeFeaturePresence(v);
      if (typeof n === 'number' && n > 0) forced += n;
    }
    // Estimated auto-rolled count: ~50% of available features at the
    // mid-range rarity. Use the larger of the legacy dropdown POI count
    // and the recommended midpoint as the baseline.
    const ctxSlug = getMapContext(normalizeMapType(params.mapType));
    const isSettlement = ctxSlug === 'settlement';
    let estAuto = 0;
    if (isSettlement) {
      // Rough heuristic — Sprint 3 auto-selection lands close to the recommended
      // upper bound for the size, so use that minus the forced count as the
      // estimate of additional auto POIs.
      estAuto = Math.max(0, tier.recommended[1] - forced);
    }
    const expected = isSettlement
      ? forced + estAuto
      : resolvePoiCount(params.poiCount);
    return { expected, tier, isSettlement };
  };

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }

    // Sprint 6 — count check. Only blocks on hard-cap; soft warning shows a
    // "Generate anyway" button that bypasses by calling _doGenerate directly.
    const { expected, tier } = computeExpectedPoiCount();
    if (expected > tier.hard_cap) {
      setPoiWarning({
        kind:        'hard',
        expected, tier,
        mapTypeLabel: params.mapType,
        popLabel:     params.population,
      });
      return;
    }
    if (expected > tier.recommended[1]) {
      setPoiWarning({
        kind:        'soft',
        expected, tier,
        mapTypeLabel: params.mapType,
        popLabel:     params.population,
      });
      return;
    }
    await _doGenerate();
  };

  const _doGenerate = async () => {
    setPoiWarning(null);
    console.log('[MapGenerator] ── Starting generation ──');
    console.log('[MapGenerator] Params:', params);
    setStep('generating');
    setStep1Done(false);
    setStep1_5Done(false);
    setStep2Done(false);
    setStep3Done(false);
    setStep3Skip(false);
    setStep3Error('');
    setError('');

    try {
      const resolved = resolveParams(params);
      const numPois  = resolvePoiCount(params.poiCount);
      console.log('[MapGenerator] Resolved:', resolved, '| POI count:', numPois);

      // ── Step 1/3: Map metadata (Claude) ───────────────────────────────────
      console.log('[MapGenerator] Step 1/3 — requesting map metadata from Claude...');
      const meta = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildMetadataPrompt(resolved, parentPoiCtx, parentMapCtx),
        maxTokens:    1200,
      });
      console.log('[MapGenerator] Step 1/3 done — title:', meta?.title);

      if (!meta?.title) throw new Error('AI returned invalid map metadata (missing title). Please try again.');
      setStep1Done(true);

      // ── Sprint 3 — settlement composition (city / village only) ──────────
      // Computed once, threaded into both the Haiku selection (Step 1.5) and
      // the Sonnet POI generation (Step 2) so both pieces see the same set
      // of required / auto-rolled / excluded buildings.
      const mapContextSlug = getMapContext(normalizeMapType(resolved.mapType));
      let settlementSelection = null;
      if (mapContextSlug === 'settlement') {
        settlementSelection = autoSelectFeatures({
          population:      resolved.population,
          settlement_role: resolved.settlement_role,
          presences:       resolved.feature_presences ?? {},
        });
        console.log(
          `[MapGenerator] Step 1.5/3 — settlement composition: ${settlementSelection.required_features.length} required, ${settlementSelection.auto_picked_features.length} auto, ${settlementSelection.excluded_features.length} excluded. Rationale: ${settlementSelection.rationale}`,
        );
      }

      // ── Step 1.5/3: Pick POI archetypes (Haiku) ───────────────────────────
      // Cheap + fast (~$0.001, 1-2 s). Failure falls back silently — Sonnet
      // still gets the existing SCOPE-based defaults via spec.poi_candidates.
      console.log('[MapGenerator] Step 1.5/3 — selecting POI sub-categories via Haiku...');
      const selection = await selectPOISubcategories(resolved, meta, parentPoiCtx, settlementSelection);
      const selectedSubcategories = selection?.selected ?? null;
      if (selection) {
        console.log('[MapGenerator] Step 1.5/3 done — selected:', selectedSubcategories,
          '| rationale:', selection.rationale);
      } else {
        console.log('[MapGenerator] Step 1.5/3 — fell back to scope defaults.');
      }
      setStep1_5Done(true);

      // ── Step 2/3: POIs + encounter table (Claude) ─────────────────────────
      // Sprint 3 bug-fix: raised from 4000 to 16000 because settlement maps
      // with many features (metropolis can roll 8-12 buildings + their POIs)
      // were truncating the JSON mid-response. Sonnet 4.6's registered
      // maxOutput is 64000.
      // Sprint 6: scale maxTokens with the resolved POI tier. Each POI roughly
      // costs ~700 output tokens (POI body + suggested_npcs + lore); we budget
      // 1000 per POI to leave headroom for the wrapping JSON and prompt
      // overhead. Floor 16000 / ceiling 56000 (well inside Sonnet 4.6's 64k).
      const popSlugForTokens = normalizePopulation(resolved.population);
      const tierForTokens    = getPoiCountTier(resolved.mapType, popSlugForTokens);
      const tokenBudget      = Math.max(16000, Math.min(56000, tierForTokens.hard_cap * 1000 + 6000));
      console.log('[MapGenerator] Step 2/3 — requesting POIs from Claude (budget=%d tokens, hard_cap=%d)...',
        tokenBudget, tierForTokens.hard_cap);
      const poiData = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildPoisPrompt(resolved, numPois, meta, parentPoiCtx, parentMapCtx, selectedSubcategories, settlementSelection),
        maxTokens:    tokenBudget,
      });
      console.log('[MapGenerator] Step 2/3 done — POI count:', poiData?.pois?.length);

      // Normalise POI positions
      const pois = (poiData.pois ?? []).map((p, i) => ({
        ...p,
        id:           p.id || `poi_${i + 1}`,
        x_percent:    Math.max(5, Math.min(95, Number(p.x_percent) || (10 + i * 8))),
        y_percent:    Math.max(5, Math.min(95, Number(p.y_percent) || (10 + i * 7))),
        child_map_id: null,
      }));

      // Sprint 3 — auto-mark POIs as DM-only when their subType matches a
      // dm_only_default settlement feature (e.g. thieves' guild). The
      // narrative POI itself still exists; it just isn't surfaced in the
      // player view.
      //
      // Sprint 4 — also force suggested_npcs[*].is_hidden = true on the same
      // POIs so the "Add to NPCs" button creates hidden NPCs even if Sonnet
      // forgets to flag them. Belt-and-suspenders against prompt drift.
      if (settlementSelection) {
        const dmOnlySubtypes = new Set(
          [...settlementSelection.required_features, ...settlementSelection.auto_picked_features]
            .filter(f => f.dm_only_default)
            .map(f => f.subType),
        );
        if (dmOnlySubtypes.size > 0) {
          pois.forEach(p => {
            if (p.subType && dmOnlySubtypes.has(p.subType)) {
              p.is_dm_only = true;
              if (Array.isArray(p.suggested_npcs)) {
                p.suggested_npcs = p.suggested_npcs.map(s => ({ ...s, is_hidden: true }));
              }
            }
          });
        }
      }

      // Sprint 4 — normalise suggested_npcs into a tidy shape regardless of
      // what Sonnet emits. Drop entries that have no role/name; coerce
      // is_hidden to boolean (defaulting from the POI's is_dm_only flag).
      pois.forEach(p => {
        if (!Array.isArray(p.suggested_npcs)) { p.suggested_npcs = []; return; }
        p.suggested_npcs = p.suggested_npcs
          .filter(s => s && (s.role || s.name))
          .map(s => ({
            role:        String(s.role  ?? '').trim() || 'resident',
            name:        String(s.name  ?? '').trim() || 'Unnamed',
            brief:       String(s.brief ?? '').trim(),
            is_hidden:   s.is_hidden === true || !!p.is_dm_only,
            added_npc_id: null,
          }));
      });

      setStep2Done(true);

      // ── Build world-engine data (scope, tags, context) ────────────────────
      const parentTags = parentPoiCtx?.tags ?? null;
      const worldData  = buildMapWorldData(resolved, tagRules, scopeRules, parentTags ?? undefined, archetypeRules);
      console.log('[MapGenerator] World data:', worldData);

      // ── Build MapSpec (D-pipeline: params + worldData + meta) ─────────────
      let spec = buildMapSpec(resolved, worldData, meta);

      // ── Apply POI influences to spec.tags (Trin E) ────────────────────────
      // Merge POI influence tags BEFORE building image prompt so that
      // divine/undead/etc. presence is reflected in image_prompt_contract.
      spec = applyInfluencesToSpec(spec, pois, influenceRules);
      console.log('[MapGenerator] spec.tags after POI influences — special:', spec.tags.special, '| hazards:', spec.tags.hazards);

      // Optional AI enrichment when user_description is set (Trin D)
      if (resolved.user_description) {
        console.log('[MapGenerator] Enriching spec with AI (user_description present)...');
        try {
          const enrichOpts = buildEnrichmentPrompt(spec, pois);
          const enrichment = await callClaude(enrichOpts);
          spec = applyEnrichment(spec, enrichment);
          console.log('[MapGenerator] Spec enriched — visual_keywords:', spec.visual_keywords);
        } catch (enrichErr) {
          console.warn('[MapGenerator] Spec enrichment failed (non-fatal):', enrichErr.message);
        }
      }

      // Build DALL-E prompt now — before map creation — so image_prompt_contract
      // is always stored in data.spec regardless of whether DALL-E succeeds.
      const dallePrompt = buildImagePrompt(spec, pois);
      spec = withImageContract(spec, dallePrompt);
      console.log('[MapGenerator] DALL-E prompt (%d chars): %s', dallePrompt.length, dallePrompt);

      // DEBUG — remove after verification
      console.log('[MapGenerator] spec before POST — keys:', Object.keys(spec).join(', '));
      console.log('[MapGenerator] spec before POST — state:', spec.state,
        '| poi_candidates:', JSON.stringify(spec.poi_candidates),
        '| constraints:', JSON.stringify(spec.constraints),
        '| image_prompt_contract length:', spec.image_prompt_contract?.length);
      console.log('[MapGenerator] spec.state raw value:', JSON.stringify(spec.state));
      console.log('[MapGenerator] Full spec JSON:', JSON.stringify(spec));

      // ── Create map record (server) ─────────────────────────────────────────
      console.log('[MapGenerator] Creating map record on server...');
      let map = await api.createMap({
        campaign_id:   campaignId,
        name:          meta.title,
        type:          toBackendType(resolved.mapType),
        parent_map_id: parentMapId,
        parent_poi_id: parentPoiId,
        purpose:       resolved.purpose ?? 'standard',
        // Sprint 1 — map context. Computed via the schema's getMapContext; the
        // server stores it in a new `context` column. Sprint 2 will read it as
        // the daughter-map foundation. Falls back to 'wilderness' when the
        // map-type doesn't resolve (e.g. legacy 'Region').
        context:       getMapContext(normalizeMapType(resolved.mapType)),
        data: {
          pois,
          subtitle:               meta.subtitle                   || '',
          description:            meta.description                || '',
          history:                meta.history                    || '',
          atmosphere_notes:       meta.atmosphere_notes           || '',
          random_encounter_table: poiData.random_encounter_table  || [],
          secrets:                poiData.secrets                 || [],
          plot_hooks:             poiData.plot_hooks              || [],
          generated_params:       resolved,
          visible_to_players:     false,
          pins:                   [],
          // World engine fields
          scope:             worldData.scope,
          context:           worldData.context,
          tags:              worldData.tags,
          state:             worldData.state,
          ...(worldData.settlement        ? { settlement:         worldData.settlement }        : {}),
          ...(worldData.validation_errors ? { validation_errors: worldData.validation_errors } : {}),
          // MapSpec (Trin D) — includes image_prompt_contract
          spec,
          // Phase 6: Haiku-selected POI archetypes (null on fallback)
          ...(selectedSubcategories ? {
            selected_subcategories: selectedSubcategories,
            selection_rationale:    selection?.rationale ?? '',
          } : {}),
          // Sprint 3 — settlement composition (city / village only)
          ...(settlementSelection ? {
            settlement_selection: {
              required:    settlementSelection.required_features.map(f => f.subType),
              auto_picked: settlementSelection.auto_picked_features.map(f => f.subType),
              excluded:    settlementSelection.excluded_features,
              rationale:   settlementSelection.rationale,
            },
          } : {}),
          // Terrain sketch — persisted at creation so cells are never lost
          ...(sketchSpec ? { sketch: sketchSpec } : {}),
        },
      });
      console.log('[MapGenerator] Map record created — id:', map?.id);

      // ── Persist sketch cells explicitly (belt-and-suspenders) ─────────────
      // Even though sketchSpec is included in data above, we also PATCH via
      // jsonb_set so cells are guaranteed in the DB even if enrichMapData
      // somehow strips the sketch key.
      if (sketchSpec && map?.id) {
        console.log('[MapGenerator] Patching sketch via PUT /sketch — cells:', sketchSpec.cells?.length);
        try {
          const token = localStorage.getItem('dnd_token');
          const patchResp = await fetch(`/api/maps/${map.id}/sketch`, {
            method:  'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body:    JSON.stringify({ sketchSpec }),
          });
          const patchData = await patchResp.json().catch(() => ({}));
          console.log('[MapGenerator] Sketch patch result:', patchData);
        } catch (patchErr) {
          console.warn('[MapGenerator] Sketch patch failed (non-fatal):', patchErr.message);
        }
      }

      // ── Step 3/3: Image — use pre-generated sketch image OR DALL-E ──────────
      if (presetImageUrl) {
        // Image already generated by generate-from-sketch route — attach to map
        console.log('[MapGenerator] Step 3/3 — using pre-generated sketch image:', presetImageUrl.substring(0, 60));
        try {
          const updated = await api.updateMap(map.id, {
            name: map.name, type: map.type, image_url: presetImageUrl, data: map.data,
          });
          if (updated) map = updated;
          setStep3Done(true);
        } catch (imgErr) {
          console.warn('[MapGenerator] Step 3/3 — failed to attach sketch image:', imgErr.message);
          setStep3Skip(true);
        }
      } else if (hasOpenAIKey()) {
        // Sprint 6 — per-type image size. Settlements at small_city+ go widescreen
        // (1536×1024); wilderness defaults widescreen too. Everything else stays
        // square (1024×1024). resolveImageSize handles fallback gracefully.
        const imageSize = resolveImageSize(resolved.mapType, normalizePopulation(resolved.population));
        console.log('[MapGenerator] Step 3/3 — calling gpt-image-1 at size=%s...', imageSize);
        try {
          const updated = await generateAndSaveImage(map, dallePrompt, imageSize);
          if (updated) map = updated;
          console.log('[MapGenerator] Step 3/3 done — image_url:', map?.image_url);
          setStep3Done(true);
        } catch (imgErr) {
          console.warn('[MapGenerator] Step 3/3 — gpt-image-1 failed (non-fatal):', imgErr.message);
          setStep3Error(imgErr.message);
          setStep3Skip(true);
        }
      } else {
        console.log('[MapGenerator] Step 3/3 — skipped (no OpenAI key).');
        setStep3Skip(true);
      }

      console.log('[MapGenerator] ── Generation complete! ──');
      onCreated(map);
    } catch (e) {
      console.error('[MapGenerator] ── Generation FAILED:', e.message, e);
      setError(e.message);
      setStep('error');
    }
  };

  const isDrillDown = !!(parentMapId && parentPoiId);

  return (
    <>
      <div className="mgn-backdrop" onClick={onClose}>
        <div className="mgn-modal" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="mgn-header">
            <div>
              <div className="mgn-title">
                {fromSketch ? '◈ Generate Map from Sketch' : isDrillDown ? '🔽 Generate Sub-Map' : '✦ AI Map Generator'}
              </div>
              {isDrillDown && parentPoiCtx && (
                <div className="mgn-subtitle">
                  From: {parentPoiCtx.name} ({parentPoiCtx.type})
                </div>
              )}
              {fromSketch && (
                <div className="mgn-subtitle">Terrain sketch pre-populated — review and generate</div>
              )}
            </div>
            <button className="mgn-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Form */}
          {step === 'form' && (
            <div className="mgn-body">

              {/* Context note — shown for drill-down or sketch-derived params */}
              {(isDrillDown || fromSketch) && presetParams && (() => {
                const hints = [];
                if (presetParams.terrain?.length)  hints.push(`Terrain: ${presetParams.terrain.join(', ')}`);
                if (presetParams.atmosphere && presetParams.atmosphere !== 'Random') hints.push(`Atmosphere: ${presetParams.atmosphere}`);
                if (presetParams.inhabitants && presetParams.inhabitants !== 'Random') hints.push(`Inhabitants: ${presetParams.inhabitants}`);
                if (presetParams.era && presetParams.era !== 'Random') hints.push(`Era: ${presetParams.era}`);
                if (!hints.length) return null;
                return (
                  <div className="mgn-context-note">
                    <span className="mgn-context-icon">{fromSketch ? '◈' : '🗺'}</span>
                    <span>{fromSketch ? 'Derived from sketch' : 'Suggested from parent context'} — {hints.join(' · ')}</span>
                  </div>
                );
              })()}

              {/* Sprint 1 — schema-driven form. Map Type is always rendered first
                  outside the dynamic loop; the rest of the fields come from the
                  map-type's `fields[]` array (with `purpose` auto-injected for
                  sub-maps via getFieldsForMapType). DynamicField handles select /
                  multi_chip / textarea. The multi_chip + textarea types span the
                  full grid width via inline gridColumn. */}
              <div className="mgn-options-grid">
                <div className="mgn-field">
                  <div className="mgn-field-label">Map Type</div>
                  <select className="mgn-select" value={params.mapType} onChange={e => setP('mapType', e.target.value)}>
                    {MAP_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
                {(() => {
                  const schemaKey     = normalizeMapType(params.mapType);
                  const visibleFields = schemaKey
                    ? getFieldsForMapType(schemaKey, !!parentPoiCtx)
                    : [];
                  return visibleFields.map(f => (
                    <DynamicField
                      key={f}
                      fieldKey={f}
                      mapType={params.mapType}
                      params={params}
                      setP={setP}
                    />
                  ));
                })()}
              </div>

              {/* Sprint 3 — Settlement Composition (Advanced) panel.
                  Only shown for city / village. Lets the DM override the auto
                  composition (require / exclude specific buildings). */}
              {(() => {
                const slug = normalizeMapType(params.mapType);
                if (slug !== 'city' && slug !== 'village') return null;
                return (
                  <SettlementCompositionPanel
                    population={params.population}
                    settlement_role={params.settlement_role}
                    presences={params.feature_presences}
                    onChange={presences => setParams(p => ({ ...p, feature_presences: presences }))}
                  />
                );
              })()}

              {/* Sketch image preview — shown when image was pre-generated */}
              {presetImageUrl && (
                <div className="mgn-sketch-preview">
                  <div className="mgn-sketch-preview-label">✅ Map image generated from sketch — review settings and confirm</div>
                  <img src={presetImageUrl} className="mgn-sketch-thumb" alt="Generated map preview" />
                </div>
              )}

              {!presetImageUrl && !hasOpenAIKey() && (
                <div className="mgn-warn">
                  ⚠ No OpenAI key — map will be created without a visual image.
                  You can upload an image later.
                  <button className="mgn-warn-link" onClick={() => setShowSettings(true)}>Add key →</button>
                </div>
              )}

              <button className="mgn-generate-btn" onClick={handleGenerate}>
                {presetImageUrl ? '✦ Confirm & Create Map' : isDrillDown ? '✦ Generate Sub-Map' : '✦ Generate Map'}
              </button>
            </div>
          )}

          {/* Generating progress */}
          {step === 'generating' && (
            <div className="mgn-body mgn-progress-body">
              <ProgressRow
                label="Step 1/3: Generating map content…"
                subLabel="Claude is writing title, description & atmosphere"
                done={step1Done}
              />
              {step1Done && (
                <ProgressRow
                  label="Step 1.5/3: Selecting location archetypes…"
                  subLabel="Haiku is choosing POI sub-categories that fit"
                  done={step1_5Done}
                />
              )}
              {step1_5Done && (
                <ProgressRow
                  label="Step 2/3: Generating points of interest…"
                  subLabel="Claude is placing POIs, encounters & lore"
                  done={step2Done}
                />
              )}
              {step2Done && (
                <ProgressRow
                  label={
                    step3Skip && step3Error ? 'Step 3/3: Image failed' :
                    step3Skip ? 'Step 3/3: Image skipped (no OpenAI key)' :
                    step3Done ? 'Step 3/3: Map painted!' :
                    'Step 3/3: Painting the map image…'
                  }
                  subLabel={
                    step3Skip && step3Error ? `DALL·E error: ${step3Error}` :
                    step3Skip ? 'You can upload an image manually from the map toolbar' :
                    step3Done ? 'Map image generated — save your campaign to preserve it' :
                    'DALL·E 3 is illustrating your map (up to 60s)'
                  }
                  done={step3Done || step3Skip}
                  skipped={step3Skip}
                />
              )}
              {!step1Done && (
                <div className="mgn-sub-note">Check the browser console (F12 → Console) if stuck beyond 30 s.</div>
              )}
            </div>
          )}

          {/* Error state */}
          {step === 'error' && (
            <div className="mgn-body">
              <div className="mgn-error">{error}</div>
              <button className="mgn-generate-btn" style={{marginTop:8}} onClick={() => setStep('form')}>← Back</button>
            </div>
          )}
        </div>
      </div>

      {showSettings && <ApiKeySettings onClose={() => setShowSettings(false)} />}

      {/* Sprint 6 — POI count warning. Soft: shows "Generate anyway". Hard:
          shows only "Reduce numbers" — DM must lower the count before retry. */}
      {poiWarning && (
        <div className="mgn-backdrop" onClick={() => setPoiWarning(null)} style={{ zIndex: 9999 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              maxWidth:     460,
              margin:       '15vh auto',
              padding:      20,
              background:   '#1f1810',
              border:       `1px solid ${poiWarning.kind === 'hard' ? '#c03030' : '#c8a84b'}`,
              borderRadius: 8,
              color:        '#d4c090',
              fontFamily:   'inherit',
              boxShadow:    '0 8px 32px rgba(0, 0, 0, 0.55)',
            }}
          >
            <div style={{ fontSize: '1.05rem', color: poiWarning.kind === 'hard' ? '#f08080' : '#f5d97a',
                          marginBottom: 10, letterSpacing: '0.04em' }}>
              ⚠ {poiWarning.kind === 'hard' ? 'Too many POIs' : 'High POI count'}
            </div>
            <div style={{ fontSize: '0.86rem', lineHeight: 1.5, marginBottom: 14 }}>
              You've configured roughly <strong>{poiWarning.expected}</strong> POIs on
              a <em>{poiWarning.mapTypeLabel}</em>{poiWarning.popLabel && poiWarning.popLabel !== 'Random' ? <> (<em>{poiWarning.popLabel}</em>)</> : null}.
              <div style={{ marginTop: 6 }}>
                {poiWarning.kind === 'hard' ? (
                  <>
                    Hard maximum for this size: <strong>{poiWarning.tier.hard_cap}</strong>.
                    Generation will likely fail or be truncated — please reduce the count.
                  </>
                ) : (
                  <>
                    Recommended range for this size: <strong>{poiWarning.tier.recommended[0]}–{poiWarning.tier.recommended[1]}</strong>.
                    The map may become visually cluttered, and generation may take longer.
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setPoiWarning(null)}
                style={{
                  padding: '6px 14px', fontSize: '0.84rem', fontFamily: 'inherit',
                  background: 'rgba(0, 0, 0, 0.4)', color: '#c8a84b',
                  border: '1px solid rgba(200, 168, 75, 0.4)', borderRadius: 4, cursor: 'pointer',
                }}
              >
                ← Reduce numbers
              </button>
              {poiWarning.kind === 'soft' && (
                <button
                  type="button"
                  onClick={() => { setPoiWarning(null); _doGenerate(); }}
                  style={{
                    padding: '6px 14px', fontSize: '0.84rem', fontFamily: 'inherit',
                    background: 'rgba(245, 217, 122, 0.18)', color: '#f5d97a',
                    border: '1px solid rgba(245, 217, 122, 0.55)', borderRadius: 4, cursor: 'pointer',
                  }}
                >
                  ✦ Generate anyway
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ProgressRow({ label, subLabel, done, skipped }) {
  return (
    <div className={`mgn-prog-row${done ? ' mgn-prog-row--done' : ''}${skipped ? ' mgn-prog-row--skipped' : ''}`}>
      <div className="mgn-prog-icon">
        {done || skipped ? '✓' : <span className="mgn-prog-spinner">⟳</span>}
      </div>
      <div className="mgn-prog-text">
        <div className="mgn-prog-label">{label}</div>
        <div className="mgn-prog-sub">{subLabel}</div>
      </div>
    </div>
  );
}

export default MapGenerator;
