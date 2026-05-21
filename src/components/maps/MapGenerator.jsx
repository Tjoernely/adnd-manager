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
} from '../../rulesets/poiTaxonomy.ts';
import './MapGenerator.css';

// Map style presets — derived from the shared JSON registry. The `$` keys are
// metadata; filter them out so the picker only shows real presets.
const MAP_STYLE_ENTRIES = Object.entries(mapStylePresets).filter(([k]) => !k.startsWith('$'));
// mapTags.json is now { tags: [...], poi_influence_rules: {...} }
const tagRules        = mapTagsJson.tags;
const influenceRules  = mapTagsJson.poi_influence_rules ?? {};

// ── Option lists ──────────────────────────────────────────────────────────────
const MAP_TYPES = [
  'Random','Region','City/Town','Village','Dungeon',
  'Cave System','Ruins','Castle/Keep','Tavern/Inn','Temple',
];
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
  'Region':'region','City/Town':'city','Village':'town',
  'Dungeon':'dungeon','Cave System':'dungeon','Ruins':'dungeon',
  'Castle/Keep':'interior','Tavern/Inn':'interior','Temple':'interior',
};

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
${descBlock}Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Era: ${r.era} | Inhabitants: ${r.inhabitants} | Size: ${r.size}
${parentNote({ poi: parentCtx, parentMap: parentMapCtx, purpose: r.purpose })}
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
async function selectPOISubcategories(r, meta, parentCtx) {
  try {
    const allKeys = getAllSubcategoryKeys();
    const subList = allKeys.map(k => formatSubcategoryForPrompt(k)).join('\n');
    const parentLine = parentCtx
      ? `\n- Parent location: "${parentCtx.name}" — ${parentCtx.short_description ?? ''}`
      : '';
    const purposeLine = r.purpose && r.purpose !== 'standard'
      ? `\n- Sub-map purpose: ${r.purpose}`
      : '';
    const desc = (r.user_description ?? '').trim();
    const userPrompt = `You are a tabletop RPG cartographer's assistant. Pick 6-12 POI sub-categories from the AVAILABLE list that genuinely fit this map.

MAP CONTEXT:
- Type: ${r.mapType}
- Title: "${meta?.title ?? '(none)'}"
- Atmosphere: ${r.atmosphere}
- Era: ${r.era}
- Terrain: ${r.terrain.join(', ')}
- Inhabitants: ${r.inhabitants}
- User description: ${desc || '(none provided)'}${parentLine}${purposeLine}

AVAILABLE SUB-CATEGORIES (key — description):
${subList}

REQUIREMENTS:
1. Pick 6-12 sub-category keys (verbatim from the list above) that genuinely fit.
2. Favour sub-categories that match specific features in the description.
3. Try to include at least one sub-category from each top-level (structure/natural/people/enigma) — unless the location strictly excludes one (e.g. a sealed cave has no people).
4. For thematic locations (coastal, mountain, ruined), it's fine to weight several sub-categories from one top-level.
5. For Decoy-purpose sub-maps, lean toward MUNDANE keys (structure:workshop, structure:civic, structure:dwelling, structure:infrastructure, people:small_settlement) — avoid enigma:relic_site, enigma:cursed_site, enigma:anomaly.

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
function buildPoisPrompt(r, numPois, meta, parentCtx, parentMapCtx, selectedSubcategories) {
  // Cap at 6 to avoid token overflow
  const cappedPois = Math.min(numPois, 6);
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
  return `For the tabletop fantasy ${r.mapType} map "${meta.title}":
${descBlock}Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Inhabitants: ${r.inhabitants}
${parentNote({ poi: parentCtx, parentMap: parentMapCtx, purpose: r.purpose })}
${typeHint}${purposeBlock}${archetypeBlock}
Use evocative original names, factions and lore for all POIs — no published-setting references. Keep each field to 1-2 sentences maximum.

Generate exactly ${cappedPois} points of interest spread across the map.

Respond with ONLY this JSON object:
{
  "pois": [
    {
      "id": "poi_1",
      "name": "evocative original location name",
      "type": "city|village|ruins|cave|dungeon|encounter|treasure|trap|npc|landmark|mystery",
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
      "quest_hooks": ["original fantasy hook"]
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
async function callDalleOnce(prompt, apiKey) {
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
      size:  '1024x1024',
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

async function generateAndSaveImage(map, prompt) {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('No OpenAI API key — skipping image generation.');

  console.log('[Map] Calling gpt-image-1 for map image...');

  let data;
  try {
    data = await callDalleOnce(prompt, apiKey);
  } catch (firstErr) {
    // Retry once on server_error after 3 s
    if (firstErr.code === 'server_error' || firstErr.message?.includes('server_error')) {
      console.warn('[Map] gpt-image-1 server_error — retrying in 3 s...');
      await new Promise(r => setTimeout(r, 3000));
      data = await callDalleOnce(prompt, apiKey);
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

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }

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

      // ── Step 1.5/3: Pick POI archetypes (Haiku) ───────────────────────────
      // Cheap + fast (~$0.001, 1-2 s). Failure falls back silently — Sonnet
      // still gets the existing SCOPE-based defaults via spec.poi_candidates.
      console.log('[MapGenerator] Step 1.5/3 — selecting POI sub-categories via Haiku...');
      const selection = await selectPOISubcategories(resolved, meta, parentPoiCtx);
      const selectedSubcategories = selection?.selected ?? null;
      if (selection) {
        console.log('[MapGenerator] Step 1.5/3 done — selected:', selectedSubcategories,
          '| rationale:', selection.rationale);
      } else {
        console.log('[MapGenerator] Step 1.5/3 — fell back to scope defaults.');
      }
      setStep1_5Done(true);

      // ── Step 2/3: POIs + encounter table (Claude) ─────────────────────────
      console.log('[MapGenerator] Step 2/3 — requesting POIs from Claude...');
      const poiData = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildPoisPrompt(resolved, numPois, meta, parentPoiCtx, parentMapCtx, selectedSubcategories),
        maxTokens:    4000,
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
        console.log('[MapGenerator] Step 3/3 — calling DALL-E...');
        try {
          const updated = await generateAndSaveImage(map, dallePrompt);
          if (updated) map = updated;
          console.log('[MapGenerator] Step 3/3 done — image_url:', map?.image_url);
          setStep3Done(true);
        } catch (imgErr) {
          console.warn('[MapGenerator] Step 3/3 — DALL-E failed (non-fatal):', imgErr.message);
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

              <div className="mgn-options-grid">
                {/* Map Type */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Map Type</div>
                  <select className="mgn-select" value={params.mapType} onChange={e => setP('mapType', e.target.value)}>
                    {MAP_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                {/* Map Style (5B-a: drives the visual treatment of the rendered image) */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Map Style</div>
                  <select
                    className="mgn-select"
                    value={params.mapStyle}
                    onChange={e => setP('mapStyle', e.target.value)}
                    title={mapStylePresets[params.mapStyle]?.description ?? ''}
                  >
                    {MAP_STYLE_ENTRIES.map(([slug, p]) => (
                      <option key={slug} value={slug} title={p.description}>{p.label}</option>
                    ))}
                  </select>
                  <div style={{ fontSize: '0.72rem', color: '#9a875a', marginTop: 4, lineHeight: 1.35 }}>
                    {mapStylePresets[params.mapStyle]?.description ?? ''}
                  </div>
                </div>

                {/* Map Purpose — 5B-b: sub-maps only. Biases content scope,
                    loot tier and plot relevance. Decoy = "looks real but isn't". */}
                {parentPoiCtx && (
                  <div className="mgn-field">
                    <div className="mgn-field-label">Map Purpose</div>
                    <select
                      className="mgn-select"
                      value={params.purpose}
                      onChange={e => setP('purpose', e.target.value)}
                      title={PURPOSE_BY_VALUE[params.purpose]?.description ?? ''}
                    >
                      {MAP_PURPOSES.map(p => (
                        <option key={p.value} value={p.value} title={p.description}>{p.label}</option>
                      ))}
                    </select>
                    <div style={{ fontSize: '0.72rem', color: '#9a875a', marginTop: 4, lineHeight: 1.35 }}>
                      {PURPOSE_BY_VALUE[params.purpose]?.description ?? ''}
                    </div>
                  </div>
                )}

                {/* Size */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Size</div>
                  <select className="mgn-select" value={params.size} onChange={e => setP('size', e.target.value)}>
                    {MAP_SIZES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                {/* Atmosphere */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Atmosphere</div>
                  <select className="mgn-select" value={params.atmosphere} onChange={e => setP('atmosphere', e.target.value)}>
                    {ATMOSPHERES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                {/* Era */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Era</div>
                  <select className="mgn-select" value={params.era} onChange={e => setP('era', e.target.value)}>
                    {ERAS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                {/* Inhabitants */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Inhabitants</div>
                  <select className="mgn-select" value={params.inhabitants} onChange={e => setP('inhabitants', e.target.value)}>
                    {INHABITANTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

                {/* POI Count */}
                <div className="mgn-field">
                  <div className="mgn-field-label">POI Count</div>
                  <select className="mgn-select" value={params.poiCount} onChange={e => setP('poiCount', e.target.value)}>
                    {POI_COUNTS.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              {/* Terrain multi-select — hidden for building/interior scopes */}
              {showTerrain && (
                <div className="mgn-field">
                  <div className="mgn-field-label">Terrain (pick up to 3 — leave empty for Random)</div>
                  <div className="mgn-terrain-grid">
                    {terrainOptions.map(t => (
                      <button
                        key={t}
                        className={`mgn-terrain-chip${params.terrain.includes(t) ? ' mgn-terrain-chip--on' : ''}`}
                        onClick={() => toggleTerrain(t)}
                        disabled={!params.terrain.includes(t) && params.terrain.length >= 3}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Environment chips — shown instead of terrain for building/interior */}
              {showEnvChips && (
                <div className="mgn-field">
                  <div className="mgn-field-label">Environment (pick up to 3 — shapes the atmosphere)</div>
                  <div className="mgn-terrain-grid">
                    {ENVIRONMENT_CHIPS.map(e => (
                      <button
                        key={e}
                        className={`mgn-terrain-chip${params.terrain.includes(e) ? ' mgn-terrain-chip--on' : ''}`}
                        onClick={() => toggleTerrain(e)}
                        disabled={!params.terrain.includes(e) && params.terrain.length >= 3}
                      >
                        {e}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Optional user description — triggers AI visual enrichment */}
              <div className="mgn-field">
                <div className="mgn-field-label">
                  Visual Description <span className="mgn-field-optional">(optional — enhances map image)</span>
                </div>
                <textarea
                  className="mgn-textarea"
                  rows={2}
                  placeholder="e.g. a ruined keep overlooking a frozen lake, haunted by the ghost of its former lord…"
                  value={params.user_description}
                  onChange={e => setP('user_description', e.target.value)}
                  maxLength={300}
                />
              </div>

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
