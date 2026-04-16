/**
 * MapManager — Visual fantasy map system with hierarchical drill-down.
 *
 * Props:
 *   campaignId  string
 *   isDM        bool
 *   isOpen      bool
 *   onClose     fn()
 */
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { api }            from '../../api/client.js';
import { callClaude, hasAnthropicKey } from '../../api/aiClient.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';
import { MapGenerator }   from './MapGenerator.jsx';
import { TerrainSketchEditor } from './TerrainSketchEditor.jsx';
import { getChildGenerationParams, defaultConnectionForPOI } from '../../rules-engine/connectionEngine.ts';
import { getPOITerrainAt, sketchToGeneratedParams, sketchToImagePromptAdditions } from '../../rules-engine/sketchToMapSpec.ts';
import { BIOME_CONFIG }      from './TerrainSketchEditor.jsx';
import './MapManager.css';

// ── POI type catalogue ────────────────────────────────────────────────────────
const POI_TYPES = {
  city:         { icon: '🏰', color: '#c8a84b', pulse: false, label: 'City/Town'      },
  village:      { icon: '🏘', color: '#d4b060', pulse: false, label: 'Village'        },
  ruins:        { icon: '🏚', color: '#806030', pulse: false, label: 'Ruins'          },
  cave:         { icon: '🕳', color: '#405060', pulse: false, label: 'Cave'           },
  dungeon:      { icon: '💀', color: '#901818', pulse: true,  label: 'Dungeon'        },
  wilderness:   { icon: '🌲', color: '#3a6030', pulse: false, label: 'Wilderness'     },
  encounter:    { icon: '⚔',  color: '#c03030', pulse: true,  label: 'Encounter'      },
  trap:         { icon: '🪤', color: '#d07020', pulse: false, label: 'Trap'           },
  treasure:     { icon: '💰', color: '#e0c000', pulse: true,  label: 'Treasure'       },
  npc:          { icon: '🧙', color: '#9040c0', pulse: false, label: 'NPC/Person'     },
  quest:        { icon: '📜', color: '#4060c0', pulse: false, label: 'Quest Hook'     },
  mystery:      { icon: '🔮', color: '#b0b0c0', pulse: false, label: 'Mystery/Magical'},
  temple:       { icon: '⛪', color: '#8060c0', pulse: false, label: 'Temple/Shrine'  },
  bandit_camp:  { icon: '🏴', color: '#802020', pulse: true,  label: 'Bandit Camp'    },
  monster_lair: { icon: '🐉', color: '#8b0000', pulse: true,  label: 'Monster Lair'   },
  landmark:     { icon: '🌿', color: '#406040', pulse: false, label: 'Landmark'       },
};

// Display order in the type picker
const DISPLAY_POI_TYPES = [
  'city','village','ruins','cave','dungeon',
  'wilderness','encounter','trap','treasure','npc',
  'quest','mystery','temple','bandit_camp','monster_lair',
];

// Map AI-returned suggested_submap_type (and old drill_down_type) → MapGenerator presetType
const SUBMAP_TYPE_MAP = {
  Dungeon:'Dungeon',   dungeon:'Dungeon',
  Cave:'Cave System',  cave:'Cave System',
  City:'City/Town',    city:'City/Town',
  Village:'Village',   village:'Village',
  Ruins:'Ruins',       ruins:'Ruins',
  Temple:'Temple',     temple:'Temple',
  Wilderness:'Region', wilderness:'Region',
  Region:'Region',     region:'Region',
  interior:'Interior',
};

// Fallback: derive map preset type directly from poi.type
const POI_TYPE_TO_MAP_TYPE = {
  city:          'City/Town',
  village:       'Village',
  ruins:         'Ruins',
  cave:          'Cave System',
  dungeon:       'Dungeon',
  temple:        'Temple',
  wilderness:    'Region',
  bandit_camp:   'Region',
  monster_lair:  'Dungeon',
};

const MAP_TYPE_LABELS = {
  dungeon:'💀 Dungeon', world:'🌍 World', region:'🌍 Region',
  city:'🏰 City', town:'🏘 Village', interior:'🏛 Interior',
  encounter:'⚔ Encounter', cave:'🕳 Cave', ruins:'🏚 Ruins',
  wilderness:'🌲 Wilderness', temple:'⛪ Temple', other:'📍 Other',
};

function mapTypeIcon(type) {
  const icons = {
    region:'🌍', world:'🌍', city:'🏰', town:'🏘', village:'🏘',
    dungeon:'💀', cave:'🕳', ruins:'🏚', wilderness:'🌲',
    temple:'⛪', interior:'🏛', encounter:'⚔', other:'📍',
  };
  return icons[type] ?? '🗺';
}

const LOCATION_TYPES  = new Set(['city','village','ruins','cave','dungeon','wilderness','temple','bandit_camp','monster_lair']);
const ENCOUNTER_TYPES = new Set(['encounter']);
const TRAP_TYPES      = new Set(['trap']);
const TREASURE_TYPES  = new Set(['treasure']);
const MYSTERY_TYPES   = new Set(['mystery']);
const NPC_TYPES       = new Set(['npc']);

function poiTypeGroup(type) {
  if (LOCATION_TYPES.has(type))  return 'location';
  if (ENCOUNTER_TYPES.has(type)) return 'encounter';
  if (TRAP_TYPES.has(type))      return 'trap';
  if (TREASURE_TYPES.has(type))  return 'treasure';
  if (MYSTERY_TYPES.has(type))   return 'mystery';
  if (NPC_TYPES.has(type))       return 'npc';
  return 'simple';
}

function poiInfo(type) { return POI_TYPES[type] ?? { icon:'📍', color:'#888', pulse:false, label: type }; }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getAncestors(maps, mapId) {
  const ancestors = [];
  let cur = maps.find(m => m.id === mapId);
  while (cur?.parent_map_id) {
    const par = maps.find(m => m.id === cur.parent_map_id);
    if (!par) break;
    ancestors.unshift(par);
    cur = par;
  }
  return ancestors;
}

function buildTree(maps) {
  const roots    = maps.filter(m => !m.parent_map_id);
  const children = (id) => maps.filter(m => m.parent_map_id === id);
  return { roots, children };
}

// ── AI POI system prompt ──────────────────────────────────────────────────────
const FR_POI_SYSTEM = `You are an expert AD&D 2nd Edition Dungeon Master running a campaign in the Forgotten Realms (Faerûn). Generate vivid, lore-accurate POI content. Keep all descriptions concise — maximum 2 sentences per field. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

function mapCtx(map) {
  return `Parent map: "${map.name}" (type: ${map.type})
Description: ${map.data?.description ?? 'Unknown region'}
Atmosphere: ${map.data?.atmosphere_notes ?? ''}`;
}

function buildLocationPoiPrompt(type, map, dmNote) {
  // Use type-appropriate submap suggestion
  const submapTypeHint = {
    city: 'City', village: 'Village', ruins: 'Ruins', cave: 'Cave',
    dungeon: 'Dungeon', temple: 'Temple',
    wilderness: 'Wilderness', bandit_camp: 'Wilderness', monster_lair: 'Dungeon',
  }[type] ?? 'Dungeon';

  return `Generate a Forgotten Realms AD&D 2E ${type} POI for this map.
${mapCtx(map)}
Additional context: ${dmNote || 'none'}

Respond with ONLY this JSON (keep descriptions to 1-2 sentences each):
{
  "name": "Evocative FR-appropriate location name",
  "type": "${type}",
  "short_description": "One sentence players might learn (rumors, visible features)",
  "dm_description": "1-2 sentence DM description",
  "history": "One sentence FR-appropriate backstory",
  "current_situation": "What is happening here RIGHT NOW",
  "notable_features": ["Feature 1", "Feature 2"],
  "inhabitants": "Who or what lives/lurks here",
  "secrets": ["Secret 1", "Secret 2"],
  "quest_hooks": ["Hook 1", "Hook 2"],
  "loot_hint": "What treasure might be found here",
  "is_dm_only": false,
  "can_generate_submap": true,
  "suggested_submap_type": "${submapTypeHint}"
}`;
}

function buildEncounterPoiPrompt(map, dmNote) {
  return `Generate a Forgotten Realms AD&D 2E encounter for this map.
${mapCtx(map)}
Additional context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "Encounter name (e.g. Ambush at the Crossroads)",
  "type": "encounter",
  "short_description": "What players see as they approach",
  "encounter_type": "ambush",
  "setting": "Atmospheric description of WHERE this encounter happens",
  "dm_description": "Full scene description for the DM",
  "enemies": [
    {
      "name": "Creature or NPC name",
      "type": "humanoid",
      "count": "1d6+2",
      "stat_block": "HD: 1, AC: 7, THAC0: 19, HP: 1d8, ATT: 1, DAM: 1d6",
      "tactics": "How they fight or behave in combat",
      "morale": "When do they flee (e.g. below 50% HP)"
    }
  ],
  "terrain_features": ["Feature affecting combat 1", "Feature 2"],
  "surprise_chance": "2 in 6",
  "treasure": "Loot on enemies if defeated",
  "aftermath": "What happens after the encounter resolves",
  "secrets": ["What enemies know", "Hidden motive or connection"],
  "quest_hooks": ["Hook that could follow this encounter"],
  "is_dm_only": true,
  "can_generate_submap": false
}`;
}

function buildTrapPoiPrompt(map, dmNote) {
  return `Generate a Forgotten Realms AD&D 2E trap or hazard for this map.
${mapCtx(map)}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "Trap name",
  "type": "trap",
  "short_description": "What a careful observer might vaguely notice",
  "dm_description": "Full trap description for the DM",
  "trigger": "How it is triggered",
  "effect": "What happens when triggered",
  "damage": "e.g. 2d6 piercing damage, save vs. paralysis at -2 etc.",
  "detection": "Thief find-traps % chance and description of visible tells",
  "disarm": "How to disable — Thief open-locks % and physical method",
  "reset": "Does it reset? How long does it take?",
  "history": "Who built this and why",
  "secrets": ["Hidden detail about the trap's creator or purpose"],
  "quest_hooks": [],
  "is_dm_only": true,
  "can_generate_submap": false
}`;
}

function buildTreasurePoiPrompt(map, dmNote) {
  return `Generate a Forgotten Realms AD&D 2E treasure cache for this map.
${mapCtx(map)}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "Treasure name (e.g. The Merchant's Hidden Cache)",
  "type": "treasure",
  "short_description": "What players see when they discover it",
  "dm_description": "Full description including how it is hidden or protected",
  "coins": {"pp": 0, "gp": 120, "sp": 350, "cp": 80},
  "gems": ["Polished sapphire worth 100gp", "Star ruby worth 500gp"],
  "magic_items": ["Potion of Healing", "Scroll of Fireball (3rd level)"],
  "mundane_items": ["Fine silk rope 50ft", "Masterwork thieves tools"],
  "guardian": "Description of any guardian (trap, monster, curse) or null",
  "history": "Who left this here and why",
  "secrets": ["Hidden compartment with additional treasure", "Cursed item warning"],
  "quest_hooks": [],
  "is_dm_only": true,
  "can_generate_submap": false
}`;
}

function buildMysteryPoiPrompt(map, dmNote) {
  return `Generate a Forgotten Realms magical mystery or anomaly for this map.
${mapCtx(map)}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "Mystery name",
  "type": "mystery",
  "short_description": "What players observe — eerie or magical",
  "dm_description": "Full description of the phenomenon",
  "origin": "What caused this (Weave anomaly, ancient spell, planar rift, deity)",
  "effects": ["Effect on players or environment 1", "Effect 2"],
  "investigation_clues": ["Discoverable clue 1", "Clue 2", "Clue 3"],
  "resolution": "How this can be resolved or what happens if ignored",
  "connection": "Connection to larger FR plot, faction, or lore",
  "secrets": ["The true nature of the mystery"],
  "quest_hooks": ["Investigation or resolution hook"],
  "is_dm_only": false,
  "can_generate_submap": false
}`;
}

function buildNpcPoiPrompt(map, dmNote) {
  return `Generate a Forgotten Realms AD&D 2E NPC encounter for this map.
${mapCtx(map)}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "NPC name (FR-appropriate for their race)",
  "type": "npc",
  "short_description": "What players see — appearance and initial impression",
  "dm_description": "Full DM description of the NPC and the scene",
  "npc_race": "Race",
  "npc_class": "Class or profession",
  "npc_alignment": "Alignment (e.g. Lawful Neutral)",
  "npc_motivation": "What does this NPC want?",
  "scene_description": "Where and how they are encountered in detail",
  "personality": "3 personality traits, comma-separated",
  "history": "Brief FR-appropriate backstory",
  "current_situation": "What they are doing right now",
  "secrets": ["What this NPC is hiding"],
  "quest_hooks": ["How they can involve the party"],
  "is_dm_only": false,
  "can_generate_submap": false
}`;
}

function buildSimplePoiPrompt(type, map, dmNote) {
  return `Generate a Forgotten Realms AD&D 2E point of interest for this map.
${mapCtx(map)}
POI Type: ${type}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "FR-appropriate evocative name",
  "type": "${type}",
  "short_description": "One sentence players might learn",
  "dm_description": "Full DM description (2-3 sentences)",
  "history": "Brief FR-appropriate backstory",
  "secrets": ["Hidden detail or plot hook"],
  "quest_hooks": ["One FR-flavoured hook"],
  "is_dm_only": false,
  "can_generate_submap": false
}`;
}

function buildPoiPromptByType(type, map, dmNote) {
  const group = poiTypeGroup(type);
  switch (group) {
    case 'location':  return buildLocationPoiPrompt(type, map, dmNote);
    case 'encounter': return buildEncounterPoiPrompt(map, dmNote);
    case 'trap':      return buildTrapPoiPrompt(map, dmNote);
    case 'treasure':  return buildTreasurePoiPrompt(map, dmNote);
    case 'mystery':   return buildMysteryPoiPrompt(map, dmNote);
    case 'npc':       return buildNpcPoiPrompt(map, dmNote);
    default:          return buildSimplePoiPrompt(type, map, dmNote);
  }
}

// ── Section regen prompts ─────────────────────────────────────────────────────
function buildRegenEnemiesPrompt(poi, map) {
  return `For the encounter "${poi.name}" in the Forgotten Realms map "${map.name}":
${poi.setting || poi.dm_description || ''}
Generate a fresh set of FR-appropriate enemies with full AD&D 2E stat blocks.
Respond with ONLY this JSON:
{"enemies": [{"name":"...","type":"humanoid","count":"...","stat_block":"HD: X, AC: Y, THAC0: Z, HP: Xd8, ATT: X, DAM: Xd6","tactics":"...","morale":"..."}]}`;
}

function buildRegenTreasurePrompt(poi, map) {
  return `For the POI "${poi.name}" (${poi.type}) in the Forgotten Realms map "${map.name}", generate fresh AD&D 2E loot appropriate for this location.
Respond with ONLY this JSON:
{"treasure": "brief loot description", "coins": {"pp":0,"gp":0,"sp":0,"cp":0}, "gems": [], "magic_items": [], "mundane_items": []}`;
}

function buildRegenSecretsPrompt(poi, map) {
  return `For the Forgotten Realms POI "${poi.name}" (${poi.type}) in "${map.name}":
${poi.dm_description || poi.short_description || ''}
Generate 2-3 fresh secrets or hidden plot hooks.
Respond with ONLY this JSON:
{"secrets": ["Secret 1", "Secret 2"]}`;
}

function buildRegenQuestHooksPrompt(poi, map) {
  return `For the Forgotten Realms POI "${poi.name}" (${poi.type}) in "${map.name}":
${poi.short_description || poi.dm_description || ''}
Generate 2 fresh Forgotten Realms quest hooks.
Respond with ONLY this JSON:
{"quest_hooks": ["Hook 1", "Hook 2"]}`;
}

// ── MapManager (root) ─────────────────────────────────────────────────────────
export function MapManager({ campaignId, isDM, isOpen, onClose }) {
  const [maps,          setMaps]          = useState([]);
  const [activeMapId,   setActiveMapId]   = useState(null);
  const [selectedPoiId, setSelectedPoiId] = useState(null);
  const [playerView,    setPlayerView]    = useState(false);
  const [addPoiMode,    setAddPoiMode]    = useState(false);
  const [pendingPoiPos, setPendingPoiPos] = useState(null); // { x, y }
  const [showGenerator, setShowGenerator] = useState(false);
  const [showSketch,    setShowSketch]    = useState(false);
  const [sketchEditMap, setSketchEditMap] = useState(null); // map being edited (null = new)
  const [genContext,    setGenContext]    = useState(null);
  const [showApiKeys,   setShowApiKeys]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [savingPoi,     setSavingPoi]     = useState(false);
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [randEnc,       setRandEnc]       = useState(null);
  const fileRef          = useRef(null);
  const toastTimer       = useRef(null);
  const sketchEditorRef  = useRef(null);

  const [toast, setToast] = useState(null);

  const showToast = useCallback((msg, mapId = null) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, mapId });
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);

  const activeMap  = maps.find(m => m.id === activeMapId) ?? null;
  const pois       = (activeMap?.data?.pois ?? []).filter(p =>
    playerView ? !p.is_dm_only : true
  );
  const selectedPoi = pois.find(p => p.id === selectedPoiId) ?? null;
  const ancestors   = useMemo(() => getAncestors(maps, activeMapId), [maps, activeMapId]);
  const { roots, children } = useMemo(() => buildTree(maps), [maps]);

  // ── Load maps on mount (and whenever campaignId changes) ────────────────────
  useEffect(() => {
    if (!campaignId) return;
    setLoading(true);
    setError('');
    api.getMaps(campaignId)
      .then(ms => {
        const safe = Array.isArray(ms) ? ms : [];
        setMaps(safe);
        if (safe.length && !activeMapId) {
          const rootMaps = safe.filter(m => !m.parent_map_id);
          setActiveMapId((rootMaps[0] ?? safe[0]).id);
        }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [campaignId]); // load on mount regardless of overlay open state

  // ── Patch helper ─────────────────────────────────────────────────────────────
  const patchMap = useCallback((updated) => {
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m));
  }, []);

  // ── Save POIs ────────────────────────────────────────────────────────────────
  const savePois = useCallback(async (newPois) => {
    if (!activeMap) return;
    setSavingPoi(true);
    try {
      const updated = await api.updateMap(activeMap.id, {
        name: activeMap.name, type: activeMap.type, image_url: activeMap.image_url,
        data: { ...activeMap.data, pois: newPois },
      });
      patchMap(updated);
    } catch (e) { console.error('[MapManager] savePois', e.message); }
    finally { setSavingPoi(false); }
  }, [activeMap, patchMap]);

  // ── POI drag reposition ──────────────────────────────────────────────────────
  const handlePoiDragEnd = useCallback((poiId, newX, newY) => {
    if (!activeMap) return;
    const newPois = (activeMap.data?.pois ?? []).map(p =>
      p.id === poiId ? { ...p, x_percent: newX, y_percent: newY } : p
    );
    savePois(newPois);
  }, [activeMap, savePois]);

  // ── Map click — open type-selection modal ────────────────────────────────────
  const handleMapClickForPoi = useCallback((xPct, yPct) => {
    if (!isDM || !addPoiMode || !activeMap) return;
    setPendingPoiPos({ x: xPct, y: yPct });
    setAddPoiMode(false);
  }, [isDM, addPoiMode, activeMap]);

  // ── POI created via the type modal ───────────────────────────────────────────
  const handlePoiModalCreated = useCallback((poiData) => {
    if (!activeMap || !pendingPoiPos) return;
    const newPoi = {
      id:           `poi_${Date.now()}`,
      x_percent:    pendingPoiPos.x,
      y_percent:    pendingPoiPos.y,
      child_map_id: null,
      can_drill_down: false,
      drill_down_type: null,
      ...poiData,
    };
    const newPois = [...(activeMap.data?.pois ?? []), newPoi];
    savePois(newPois);
    setSelectedPoiId(newPoi.id);
    setPendingPoiPos(null);
  }, [activeMap, pendingPoiPos, savePois]);

  // ── Delete POI ───────────────────────────────────────────────────────────────
  const handleDeletePoi = useCallback((poiId) => {
    if (!activeMap) return;
    const newPois = (activeMap.data?.pois ?? []).filter(p => p.id !== poiId);
    savePois(newPois);
    if (selectedPoiId === poiId) setSelectedPoiId(null);
  }, [activeMap, savePois, selectedPoiId]);

  // ── Update single POI ────────────────────────────────────────────────────────
  const handleUpdatePoi = useCallback((poiId, updates) => {
    if (!activeMap) return;
    const newPois = (activeMap.data?.pois ?? []).map(p =>
      p.id === poiId ? { ...p, ...updates } : p
    );
    savePois(newPois);
  }, [activeMap, savePois]);

  // ── Visibility toggle ────────────────────────────────────────────────────────
  const toggleMapVisibility = useCallback(async () => {
    if (!activeMap || !isDM) return;
    const updated = await api.updateMap(activeMap.id, {
      name: activeMap.name, type: activeMap.type, image_url: activeMap.image_url,
      data: { ...activeMap.data, visible_to_players: !activeMap.data?.visible_to_players },
    });
    patchMap(updated);
  }, [activeMap, isDM, patchMap]);

  // ── Upload image ─────────────────────────────────────────────────────────────
  const handleUploadImage = useCallback(async (file) => {
    if (!activeMap || !file) return;
    setUploadingImg(true);
    try {
      const updated = await api.uploadMapImage(activeMap.id, file);
      if (updated) patchMap(updated);
    } catch (e) { console.error('[MapManager] upload', e.message); }
    finally { setUploadingImg(false); }
  }, [activeMap, patchMap]);

  // ── Delete map ───────────────────────────────────────────────────────────────
  const handleDeleteMap = useCallback(async () => {
    if (!activeMap || !isDM) return;
    if (!window.confirm(`Delete "${activeMap.name}"? This cannot be undone.`)) return;
    await api.deleteMap(activeMap.id);
    const remaining = maps.filter(m => m.id !== activeMap.id);
    setMaps(remaining);
    const next = remaining.find(m => !m.parent_map_id);
    setActiveMapId(next?.id ?? null);
    setSelectedPoiId(null);
  }, [activeMap, isDM, maps]);

  // ── Random encounter ─────────────────────────────────────────────────────────
  const handleRandomEncounter = useCallback(() => {
    const table = activeMap?.data?.random_encounter_table;
    if (table?.length) {
      setRandEnc(table[Math.floor(Math.random() * table.length)]);
    } else {
      setRandEnc({ roll: '—', encounter: 'No encounter table defined for this map.' });
    }
  }, [activeMap]);

  // ── Drill-down sub-map (auto or manual) ──────────────────────────────────────
  const handleDrillDown = useCallback((poi) => {
    const submapPreset = SUBMAP_TYPE_MAP[poi.suggested_submap_type]
      ?? SUBMAP_TYPE_MAP[poi.drill_down_type]
      ?? POI_TYPE_TO_MAP_TYPE[poi.type]
      ?? null;

    const parentMap = maps.find(m => m.id === activeMapId);

    // Always derive a connection — use existing one or infer from POI type
    const connection = poi.connections?.[0] ?? defaultConnectionForPOI(poi);

    // Build parent location context — prefer world-engine data, fall back to generated_params
    const parentScope = parentMap?.data?.scope ?? 'region';
    const emptyTagSet = { terrain:[], origin:[], depth:[], environment:[], structure:[], hazards:[], special:[] };
    let parentTags    = { ...emptyTagSet, ...(parentMap?.data?.tags ?? {}) };
    let parentCtx     = { ...(parentMap?.data?.context ?? { terrain: 'unknown' }) };

    // Fall back: synthesise terrain from generated_params when engine context absent
    if (parentCtx.terrain === 'unknown' && parentMap?.data?.generated_params?.terrain?.length) {
      parentCtx = { ...parentCtx, terrain: parentMap.data.generated_params.terrain[0].toLowerCase() };
    }

    // Merge POI's influence provides_tags into parent tags (POI radiates into child context)
    if (poi.influence?.provides_tags) {
      for (const [cat, tags] of Object.entries(poi.influence.provides_tags)) {
        if (!Array.isArray(tags)) continue;
        const arr = parentTags[cat] ? [...parentTags[cat]] : [];
        for (const t of tags) { if (!arr.includes(t)) arr.push(t); }
        parentTags = { ...parentTags, [cat]: arr };
      }
    }

    // Merge POI's own tags into parent tags (local tags affect child atmosphere)
    if (poi.tags) {
      for (const [cat, tags] of Object.entries(poi.tags)) {
        if (!Array.isArray(tags)) continue;
        const arr = parentTags[cat] ? [...parentTags[cat]] : [];
        for (const t of tags) { if (!arr.includes(t)) arr.push(t); }
        parentTags = { ...parentTags, [cat]: arr };
      }
    }

    let presetParams = getChildGenerationParams(
      { scope: parentScope, tags: parentTags, context: parentCtx },
      connection,
    );

    // Override terrain from sketch if parent map has sketch data
    const parentSketch = parentMap?.data?.sketch;
    if (parentSketch && poi.x_percent != null && poi.y_percent != null) {
      const sketchTerrain = getPOITerrainAt(parentSketch, poi.x_percent, poi.y_percent);
      const biomeLabel = BIOME_CONFIG[sketchTerrain.biome]?.label ?? sketchTerrain.biome;
      presetParams = { ...presetParams, terrain: [biomeLabel] };
    }

    // Inherit era from parent generated_params when not Random
    const parentEra = parentMap?.data?.generated_params?.era;
    if (!presetParams.era && parentEra && parentEra !== 'Random') {
      presetParams = { ...presetParams, era: parentEra };
    }

    // presetType (from POI type) overrides connection-derived mapType
    if (submapPreset) presetParams = { ...presetParams, mapType: submapPreset };

    setGenContext({
      parentMapId:  activeMapId,
      parentPoiId:  poi.id,
      parentPoiCtx: poi,
      presetType:   submapPreset,
      presetParams,
    });
    setShowGenerator(true);
  }, [activeMapId, maps]);

  // ── After map created ────────────────────────────────────────────────────────
  const handleMapCreated = useCallback((newMap) => {
    // Persist sketch into the new map's data if this came from sketch flow
    const sketchSpec = genContext?.sketchSpec;
    const savedMap = sketchSpec
      ? { ...newMap, data: { ...(newMap.data ?? {}), sketch: sketchSpec } }
      : newMap;

    // Add to list WITHOUT switching view — parent map stays active
    setMaps(prev => [...prev, savedMap]);
    setShowGenerator(false);

    if (sketchSpec) {
      // Save sketch to server in background
      api.updateMap(savedMap.id, {
        name: savedMap.name, type: savedMap.type, image_url: savedMap.image_url,
        data: savedMap.data,
      }).then(updated => patchMap(updated)).catch(() => {});
    }

    if (genContext?.parentMapId && genContext?.parentPoiId) {
      // Update parent POI: set child_map_id + connections[0].to_location_id
      const parentMap = maps.find(m => m.id === genContext.parentMapId);
      if (parentMap) {
        const newPois = (parentMap.data?.pois ?? []).map(p => {
          if (p.id !== genContext.parentPoiId) return p;
          const updatedConnections = (p.connections ?? []).map((c, i) =>
            i === 0 ? { ...c, to_location_id: newMap.id } : c,
          );
          return { ...p, child_map_id: newMap.id, connections: updatedConnections };
        });
        api.updateMap(parentMap.id, {
          name: parentMap.name, type: parentMap.type, image_url: parentMap.image_url,
          data: { ...parentMap.data, pois: newPois },
        }).then(updated => patchMap(updated)).catch(() => {});
      }
      // Show toast instead of auto-navigating — DM can click to open
      const icon = mapTypeIcon(newMap.type);
      showToast(`✅ ${icon} "${newMap.name}" generated — click to open`, newMap.id);
    } else {
      // Top-level map creation (no parent) → navigate to it immediately
      setActiveMapId(newMap.id);
      setSelectedPoiId(null);
    }
    setGenContext(null);
  }, [genContext, maps, patchMap, showToast]);

  // ── Navigate to map ──────────────────────────────────────────────────────────
  const navigateToMap = useCallback((mapId) => {
    setActiveMapId(mapId);
    setSelectedPoiId(null);
  }, []);

  // ── Sketch Map: save spec then open generator pre-populated ─────────────────
  // imageUrl is provided when image was already generated by the sketch route
  const handleSketchGenerate = useCallback(async (sketchSpec, imageUrl = null) => {
    console.log('[MapManager] handleSketchGenerate called — imageUrl:', imageUrl);
    setShowSketch(false);

    // If editing an existing map, save sketch (+ new image if re-rendered) and done
    if (sketchEditMap) {
      try {
        // Step 1: guarantee sketch cells via jsonb_set (bypasses enrichMapData spreads)
        console.log('[MapManager] saving sketch cells via /sketch — cells:', sketchSpec?.cells?.length);
        const token = localStorage.getItem('dnd_token');
        const sketchResp = await fetch(`/api/maps/${sketchEditMap.id}/sketch`, {
          method:  'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ sketchSpec }),
        });
        const sketchResult = await sketchResp.json().catch(() => ({}));
        console.log('[MapManager] /sketch result:', sketchResult);

        // Step 2: update image_url + full data (normal PUT path)
        const updated = await api.updateMap(sketchEditMap.id, {
          name:      sketchEditMap.name,
          type:      sketchEditMap.type,
          image_url: imageUrl ?? sketchEditMap.image_url,
          data:      { ...sketchEditMap.data, sketch: sketchSpec },
        });
        patchMap(updated);
        // Navigate to the map
        setActiveMapId(updated.id);
        setSelectedPoiId(null);
      } catch (e) { console.error('[MapManager] sketch save', e.message); }
      setSketchEditMap(null);
      return;
    }

    // New map: derive preset params, then open MapGenerator
    // MapGenerator will use presetImageUrl to skip DALL-E step if image already generated
    const presetParams = sketchToGeneratedParams(sketchSpec);
    const sketchHint   = sketchToImagePromptAdditions(sketchSpec);
    if (sketchHint) {
      presetParams.user_description = presetParams.user_description
        ? `${presetParams.user_description}. ${sketchHint}`
        : sketchHint;
    }
    console.log('[MapManager] opening MapGenerator — presetImageUrl:', imageUrl);
    setGenContext({ sketchSpec, presetParams, presetImageUrl: imageUrl });
    setShowGenerator(true);
    setSketchEditMap(null);
  }, [sketchEditMap, patchMap]);

  // ── Draw a Map: pre-create stub map, then open sketch editor ────────────────
  const handleOpenDrawEditor = useCallback(async () => {
    try {
      const newMap = await api.createMap({
        campaign_id: campaignId,
        name:        'New Sketch Map',
        type:        'region',
        data:        {},
      });
      setMaps(prev => [...prev, newMap]);
      setSketchEditMap(newMap);
      setShowSketch(true);
    } catch (e) {
      console.error('[MapManager] create sketch map failed', e.message);
    }
  }, [campaignId]);

  if (!isOpen) return null;

  return (
    <div className="mm-backdrop">
      <div className="mm-shell">

        {/* ── Left sidebar ── */}
        <aside className="mm-sidebar">
          <div className="mm-sidebar-header">
            <div className="mm-sidebar-title">🗺 Maps</div>
            <div className="mm-sidebar-actions">
              {isDM && (
                <>
                  <button className="mm-icon-btn mm-icon-btn--ai" title="Generate with AI"
                    onClick={() => { setGenContext(null); setShowGenerator(true); }}>✦</button>
                  <button className="mm-icon-btn" title="Upload image map"
                    onClick={() => fileRef.current?.click()}>📁</button>
                </>
              )}
              <button className="mm-icon-btn mm-icon-btn--close" onClick={onClose}>✕</button>
            </div>
          </div>

          {loading && <div className="mm-hint">Loading…</div>}
          {error   && <div className="mm-hint mm-hint--err">{error}</div>}

          <div className="mm-map-tree">
            {roots.length === 0 && !loading && (
              <div className="mm-hint">
                {isDM ? 'No maps yet — click ✦ to generate' : 'No maps shared yet.'}
              </div>
            )}
            {roots.map(m => (
              <MapTreeNode
                key={m.id} map={m} allMaps={maps} activeMapId={activeMapId}
                children_fn={children} onSelect={navigateToMap} depth={0}
              />
            ))}
          </div>

          {isDM && (
            <div className="mm-sidebar-new-btns">
              <button className="mm-sidebar-new-btn"
                onClick={() => { setGenContext(null); setShowGenerator(true); }}>
                ✦ Generate from Prompt
              </button>
              <button className="mm-sidebar-new-btn mm-sidebar-new-btn--draw"
                onClick={handleOpenDrawEditor}>
                ✏ Draw a Map
              </button>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" style={{ display:'none' }}
            onChange={e => { const f = e.target.files[0]; if (f) handleUploadImage(f); e.target.value=''; }}
          />
        </aside>

        {/* ── Main content ── */}
        <main className="mm-content">
          {activeMap ? (
            <>
              {/* Breadcrumb + Toolbar */}
              <div className="mm-toolbar">
                <div className="mm-toolbar-row">
                  <div className="mm-breadcrumb">
                    {ancestors.map(a => (
                      <span key={a.id} className="mm-breadcrumb-item">
                        <button className="mm-breadcrumb-btn" onClick={() => navigateToMap(a.id)}>
                          <span className="mm-bc-icon">{mapTypeIcon(a.type)}</span>{a.name}
                        </button>
                        <span className="mm-breadcrumb-sep">›</span>
                      </span>
                    ))}
                    <span className="mm-breadcrumb-cur">
                      <span className="mm-bc-icon">{mapTypeIcon(activeMap.type)}</span>{activeMap.name}
                    </span>
                  </div>

                  <div className="mm-toolbar-actions">
                    {isDM && (
                      <button
                        className={`mm-btn${addPoiMode ? ' mm-btn--active' : ''}`}
                        onClick={() => setAddPoiMode(v => !v)}
                        title="Click on map to add a POI"
                      >
                        {addPoiMode ? '✕ Cancel' : '+ Add POI'}
                      </button>
                    )}
                    <button className="mm-btn" onClick={handleRandomEncounter}>🎲 Encounter</button>
                    {isDM && (
                      <>
                        <button className="mm-btn mm-btn--ai"
                          onClick={() => { setGenContext(null); setShowGenerator(true); }}>
                          ✦ Generate from Prompt
                        </button>
                        {activeMap?.data?.sketch ? (
                          <button className="mm-btn"
                            onClick={() => { setSketchEditMap(activeMap); setShowSketch(true); }}
                            title="Edit terrain sketch for this map">
                            ✏ Sketch
                          </button>
                        ) : (
                          <button className="mm-btn"
                            onClick={handleOpenDrawEditor}
                            title="Create map from terrain sketch">
                            ◈ Sketch Map
                          </button>
                        )}
                        <button
                          className={`mm-btn${activeMap.data?.visible_to_players ? ' mm-btn--shared' : ''}`}
                          onClick={toggleMapVisibility}
                        >
                          {activeMap.data?.visible_to_players ? '👁 Shared' : '🔒 DM Only'}
                        </button>
                        <button className="mm-btn" onClick={() => fileRef.current?.click()}
                          disabled={uploadingImg}>
                          {uploadingImg ? '⏳' : '🖼 Image'}
                        </button>
                        <button className="mm-btn mm-btn--danger" onClick={handleDeleteMap}>🗑</button>
                      </>
                    )}
                    <button
                      className={`mm-btn${playerView ? ' mm-btn--player' : ''}`}
                      onClick={() => setPlayerView(v => !v)}
                    >
                      {playerView ? '🔒 DM View' : '👁 Player View'}
                    </button>
                    {savingPoi && <span className="mm-saving">Saving…</span>}
                  </div>
                </div>

                {activeMap.data?.subtitle && (
                  <div className="mm-map-subtitle">{activeMap.data.subtitle}</div>
                )}
              </div>

              {randEnc && (
                <div className="mm-rand-enc" onClick={() => setRandEnc(null)}>
                  <span className="mm-rand-enc-roll">⚔ {randEnc.roll}</span>
                  <span className="mm-rand-enc-text">{randEnc.encounter}</span>
                  <span className="mm-rand-enc-close">✕</span>
                </div>
              )}

              {activeMap.data?.spec && isDM && !playerView && (
                <LocationMetaBar spec={activeMap.data.spec} />
              )}

              <div className="mm-viewer-area">
                <MapCanvas
                  map={activeMap}
                  pois={pois}
                  selectedPoiId={selectedPoiId}
                  isDM={isDM}
                  playerView={playerView}
                  addPoiMode={addPoiMode}
                  onPoiSelect={setSelectedPoiId}
                  onPoiDragEnd={handlePoiDragEnd}
                  onMapClick={handleMapClickForPoi}
                />

                {selectedPoi && (
                  <POIPanel
                    poi={selectedPoi}
                    map={activeMap}
                    maps={maps}
                    isDM={isDM}
                    playerView={playerView}
                    onClose={() => setSelectedPoiId(null)}
                    onUpdate={(updates) => handleUpdatePoi(selectedPoi.id, updates)}
                    onDelete={() => handleDeletePoi(selectedPoi.id)}
                    onDrillDown={() => handleDrillDown(selectedPoi)}
                    onNavigate={navigateToMap}
                    onShowApiKeys={() => setShowApiKeys(true)}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="mm-empty">
              <CompassRoseSVG />
              <div className="mm-empty-text">
                {isDM
                  ? 'Begin your adventure — generate a map from a prompt, or draw one yourself.'
                  : 'No maps have been shared with you yet.'}
              </div>
              {isDM && (
                <div className="mm-empty-btns">
                  <button className="mm-empty-btn"
                    onClick={() => { setGenContext(null); setShowGenerator(true); }}>
                    ✦ Generate from Prompt
                  </button>
                  <button className="mm-empty-btn mm-empty-btn--draw"
                    onClick={handleOpenDrawEditor}>
                    ✏ Draw a Map
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* POI Type modal — shown after placing a point on the map */}
      {pendingPoiPos && isDM && activeMap && (
        <POITypeModal
          map={activeMap}
          onCreated={handlePoiModalCreated}
          onClose={() => setPendingPoiPos(null)}
          onShowApiKeys={() => setShowApiKeys(true)}
        />
      )}

      {showGenerator && (
        <MapGenerator
          campaignId={campaignId}
          onClose={() => { setShowGenerator(false); setGenContext(null); }}
          onCreated={handleMapCreated}
          parentMapId={genContext?.parentMapId ?? null}
          parentPoiId={genContext?.parentPoiId ?? null}
          parentPoiCtx={genContext?.parentPoiCtx ?? null}
          presetType={genContext?.presetType ?? null}
          presetParams={genContext?.presetParams ?? null}
          presetImageUrl={genContext?.presetImageUrl ?? null}
          fromSketch={!!genContext?.sketchSpec}
          sketchSpec={genContext?.sketchSpec ?? null}
        />
      )}

      {showSketch && (
        <div className="mm-backdrop mm-backdrop--sketch"
          onClick={() => sketchEditorRef.current?.requestClose()}>
          <div className="mm-sketch-shell" onClick={e => e.stopPropagation()}>
            <TerrainSketchEditor
              ref={sketchEditorRef}
              initialSpec={sketchEditMap?.data?.sketch ?? null}
              onGenerate={handleSketchGenerate}
              onCancel={() => { setShowSketch(false); setSketchEditMap(null); }}
            />
          </div>
        </div>
      )}

      {showApiKeys && <ApiKeySettings onClose={() => setShowApiKeys(false)} />}

      {toast && (
        <Toast
          toast={toast}
          onClose={() => setToast(null)}
          onNavigate={(id) => { navigateToMap(id); setToast(null); }}
        />
      )}
    </div>
  );
}

// ── Compass rose SVG for empty state ──────────────────────────────────────────
function CompassRoseSVG() {
  return (
    <svg className="mm-compass-svg" width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="46" stroke="#c8a84b" strokeWidth="0.5" opacity="0.3" strokeDasharray="3 3"/>
      <circle cx="50" cy="50" r="34" stroke="#c8a84b" strokeWidth="0.5" opacity="0.2"/>
      {/* N arrow (gold) */}
      <path d="M50 6 L53.5 46 L50 42 L46.5 46 Z" fill="#c8a84b" opacity="0.85"/>
      {/* S arrow */}
      <path d="M50 94 L53.5 54 L50 58 L46.5 54 Z" fill="#6a5020" opacity="0.8"/>
      {/* E arrow */}
      <path d="M94 50 L54 53.5 L58 50 L54 46.5 Z" fill="#6a5020" opacity="0.8"/>
      {/* W arrow */}
      <path d="M6 50 L46 53.5 L42 50 L46 46.5 Z" fill="#6a5020" opacity="0.8"/>
      {/* Diagonal ticks */}
      <line x1="74" y1="26" x2="68" y2="32" stroke="#c8a84b" strokeWidth="1" opacity="0.3"/>
      <line x1="26" y1="26" x2="32" y2="32" stroke="#c8a84b" strokeWidth="1" opacity="0.3"/>
      <line x1="74" y1="74" x2="68" y2="68" stroke="#c8a84b" strokeWidth="1" opacity="0.3"/>
      <line x1="26" y1="74" x2="32" y2="68" stroke="#c8a84b" strokeWidth="1" opacity="0.3"/>
      {/* Centre */}
      <circle cx="50" cy="50" r="4" fill="#c8a84b" opacity="0.75"/>
      <circle cx="50" cy="50" r="2" fill="#1a1108"/>
      {/* Cardinal letters */}
      <text x="47" y="5" fill="#c8a84b" fontSize="7" fontFamily="serif" opacity="0.9">N</text>
      <text x="47" y="99" fill="#6a5020" fontSize="7" fontFamily="serif" opacity="0.7">S</text>
      <text x="95" y="53" fill="#6a5020" fontSize="7" fontFamily="serif" opacity="0.7">E</text>
      <text x="1"  y="53" fill="#6a5020" fontSize="7" fontFamily="serif" opacity="0.7">W</text>
    </svg>
  );
}

// ── Toast notification ─────────────────────────────────────────────────────────
function Toast({ toast, onClose, onNavigate }) {
  if (!toast) return null;
  return (
    <div className="mm-toast" onClick={() => { if (toast.mapId) onNavigate(toast.mapId); else onClose(); }}>
      <span className="mm-toast-msg">{toast.msg}</span>
      <button className="mm-toast-close" onClick={e => { e.stopPropagation(); onClose(); }}>✕</button>
    </div>
  );
}

// ── MapTreeNode ───────────────────────────────────────────────────────────────
function MapTreeNode({ map, allMaps, activeMapId, children_fn, onSelect, depth }) {
  const kids    = children_fn(map.id);
  const isActive = map.id === activeMapId;
  const hasKids  = kids.length > 0;
  const [collapsed, setCollapsed] = useState(false);
  const icon = mapTypeIcon(map.type);

  return (
    <div className="mm-tree-node">
      <div
        className={`mm-tree-item${isActive ? ' mm-tree-item--active' : ''}${depth > 0 ? ' mm-tree-item--child' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Collapse toggle — invisible spacer when no children */}
        <button
          className="mm-tree-collapse-btn"
          style={{ visibility: hasKids ? 'visible' : 'hidden' }}
          onClick={e => { e.stopPropagation(); setCollapsed(v => !v); }}
          tabIndex={-1}
        >
          {collapsed ? '▶' : '▼'}
        </button>

        <button className="mm-tree-name-btn" onClick={() => onSelect(map.id)}>
          <span className="mm-tree-icon">{icon}</span>
          <span className="mm-tree-label">{map.name}</span>
        </button>

        {map.data?.visible_to_players && <span className="mm-tree-badge">👁</span>}
        {(map.image_url || map.data?.imageUrl) && <span className="mm-tree-badge">🖼</span>}
      </div>

      {hasKids && !collapsed && (
        <div className="mm-tree-children">
          {kids.map(child => (
            <MapTreeNode key={child.id} map={child} allMaps={allMaps} activeMapId={activeMapId}
              children_fn={children_fn} onSelect={onSelect} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── MapCanvas ─────────────────────────────────────────────────────────────────
function MapCanvas({ map, pois, selectedPoiId, isDM, playerView, addPoiMode, onPoiSelect, onPoiDragEnd, onMapClick }) {
  const containerRef = useRef(null);

  const handleContainerClick = (e) => {
    if (!addPoiMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    onMapClick(Math.max(2, Math.min(98, x)), Math.max(2, Math.min(98, y)));
  };

  const mapImageSrc = map.image_url || map.data?.imageUrl || null;

  if (!mapImageSrc) {
    return (
      <div className="mm-canvas-empty">
        <div className="mm-canvas-empty-icon">🗺</div>
        <div>{isDM ? 'No image — upload one or generate with DALL·E 3' : 'Map image not available.'}</div>
        {isDM && <div className="mm-canvas-empty-hint">Use 🖼 Image in the toolbar to upload</div>}
      </div>
    );
  }

  return (
    <div className="mm-canvas-scroll">
      <div
        ref={containerRef}
        className={`mm-map-container${addPoiMode ? ' mm-map-container--place' : ''}`}
        onClick={handleContainerClick}
      >
        <img src={mapImageSrc} alt={map.name} className="mm-map-image" draggable={false} />
        <div className="mm-map-border" aria-hidden="true" />
        <div className="mm-poi-layer">
          {pois.map(poi => (
            <POIMarker
              key={poi.id}
              poi={poi}
              isSelected={poi.id === selectedPoiId}
              isDM={isDM}
              playerView={playerView}
              containerRef={containerRef}
              onSelect={onPoiSelect}
              onDragEnd={onPoiDragEnd}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── POIMarker ─────────────────────────────────────────────────────────────────
function POIMarker({ poi, isSelected, isDM, playerView, containerRef, onSelect, onDragEnd }) {
  const [isDragging, setIsDragging] = useState(false);
  const [livePos,    setLivePos]    = useState(null);
  const dragMoved    = useRef(false);
  const dragStartPos = useRef(null);
  const isDraggingRef = useRef(false); // synchronous flag — state is stale in event handlers

  const info = poiInfo(poi.type);

  const handlePointerDown = (e) => {
    if (!isDM || playerView) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMoved.current = false;
    isDraggingRef.current = true;
    dragStartPos.current = { mx: e.clientX, my: e.clientY, ox: poi.x_percent, oy: poi.y_percent };
    setIsDragging(true);
    setLivePos({ x: poi.x_percent, y: poi.y_percent });
  };

  const handlePointerMove = (e) => {
    if (!isDraggingRef.current || !containerRef.current) return;
    const dx = e.clientX - dragStartPos.current.mx;
    const dy = e.clientY - dragStartPos.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(2, Math.min(98, dragStartPos.current.ox + (dx / rect.width)  * 100));
    const ny = Math.max(2, Math.min(98, dragStartPos.current.oy + (dy / rect.height) * 100));
    setLivePos({ x: nx, y: ny });
  };

  const handlePointerUp = () => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;
    setIsDragging(false);
    if (dragMoved.current && livePos) {
      onDragEnd(poi.id, livePos.x, livePos.y);
    }
    setLivePos(null);
    dragMoved.current = false;
    dragStartPos.current = null;
  };

  // onClick is the universal selection path for both DM and player.
  // dragMoved.current guards against selecting after a drag gesture.
  const handleClick = (e) => {
    e.stopPropagation();
    if (!dragMoved.current) {
      onSelect(poi.id);
    }
  };

  const pos = (isDragging && livePos) ? livePos : { x: poi.x_percent, y: poi.y_percent };

  return (
    <div
      className={`mm-poi-marker${isSelected ? ' mm-poi-marker--selected' : ''}${info.pulse ? ' mm-poi-marker--pulse' : ''}${poi.is_dm_only && !playerView ? ' mm-poi-marker--dm' : ''}${isDragging ? ' mm-poi-marker--dragging' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--poi-color': info.color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onClick={handleClick}
      role="button"
      title={poi.name}
      data-name={poi.name}
    >
      <span className="mm-poi-icon">{info.icon}</span>
      {isSelected && <span className="mm-poi-label">{poi.name}</span>}
      {poi.is_dm_only && !playerView && <span className="mm-poi-dm-badge">🔒</span>}
      {poi.child_map_id && <span className="mm-poi-child-badge">⛓</span>}
    </div>
  );
}

// ── POITypeModal ──────────────────────────────────────────────────────────────
function POITypeModal({ map, onCreated, onClose, onShowApiKeys }) {
  const [selectedType, setSelectedType] = useState('ruins');
  const [nameOverride, setNameOverride] = useState('');
  const [dmNote,       setDmNote]       = useState('');
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState('');

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { onShowApiKeys(); return; }
    setGenerating(true);
    setGenError('');
    try {
      const result = await callClaude({
        systemPrompt: FR_POI_SYSTEM,
        userPrompt:   buildPoiPromptByType(selectedType, map, dmNote),
        maxTokens:    1500,
      });
      const submapPreset = result.suggested_submap_type
        ? (SUBMAP_TYPE_MAP[result.suggested_submap_type] ?? null)
        : null;
      onCreated({
        ...result,
        type:              selectedType,
        name:              nameOverride.trim() || result.name || poiInfo(selectedType).label,
        can_drill_down:    !!(result.can_generate_submap || LOCATION_TYPES.has(selectedType)),
        drill_down_type:   submapPreset,
        quest_hooks:       result.quest_hooks ?? [],
        secrets:           result.secrets     ?? [],
      });
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleManual = () => {
    const info = poiInfo(selectedType);
    onCreated({
      name:              nameOverride.trim() || `New ${info.label}`,
      type:              selectedType,
      short_description: '',
      dm_description:    dmNote,
      is_dm_only:        true,
      can_drill_down:    LOCATION_TYPES.has(selectedType),
      can_generate_submap: LOCATION_TYPES.has(selectedType),
      drill_down_type:   null,
      quest_hooks:       [],
      secrets:           [],
    });
  };

  return (
    <div className="mm-type-backdrop" onClick={onClose}>
      <div className="mm-type-modal" onClick={e => e.stopPropagation()}>
        <div className="mm-type-header">
          <span className="mm-type-title">📍 Add Point of Interest</span>
          <button className="mm-icon-btn mm-icon-btn--close" onClick={onClose}>✕</button>
        </div>

        <div className="mm-type-body">
          <div className="mm-type-section-label">POI Type</div>
          <div className="mm-type-grid">
            {DISPLAY_POI_TYPES.map(typeKey => {
              const info = poiInfo(typeKey);
              return (
                <button
                  key={typeKey}
                  className={`mm-type-btn${selectedType === typeKey ? ' mm-type-btn--active' : ''}`}
                  style={{ '--type-color': info.color }}
                  onClick={() => setSelectedType(typeKey)}
                >
                  <span className="mm-type-btn-icon">{info.icon}</span>
                  <span className="mm-type-btn-label">{info.label}</span>
                </button>
              );
            })}
          </div>

          <div className="mm-type-fields">
            <div className="mm-type-field">
              <label className="mm-type-field-label">Name (optional — leave blank to auto-generate)</label>
              <input className="mm-type-field-input" value={nameOverride}
                onChange={e => setNameOverride(e.target.value)}
                placeholder="Auto-generated if blank…" />
            </div>
            <div className="mm-type-field">
              <label className="mm-type-field-label">Context for AI (optional)</label>
              <input className="mm-type-field-input" value={dmNote}
                onChange={e => setDmNote(e.target.value)}
                placeholder="e.g. near the river crossing, abandoned 50 years ago…" />
            </div>
          </div>

          {genError && <div className="mm-type-error">{genError}</div>}
        </div>

        <div className="mm-type-footer">
          <button className="mm-type-generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? '⏳ Generating…' : '✦ Generate with AI'}
          </button>
          <button className="mm-type-manual-btn" onClick={handleManual} disabled={generating}>
            ✎ Add Manually
          </button>
          <button className="mm-type-cancel-btn" onClick={onClose} disabled={generating}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── POIPanel sub-components ───────────────────────────────────────────────────
function SectionHead({ icon, label, onRegen, regenLabel, regenning }) {
  return (
    <div className="mm-sec-head">
      {icon && <span className="mm-sec-head-icon">{icon}</span>}
      <span className="mm-sec-head-label">{label}</span>
      {onRegen && (
        <button className="mm-regen-btn" onClick={onRegen} disabled={regenning}
          title={regenLabel ?? 'Regenerate'}>
          {regenning ? '⏳' : '🔄'}
        </button>
      )}
    </div>
  );
}

function BulletList({ items }) {
  const arr = Array.isArray(items) ? items : (items ? [String(items)] : []);
  if (!arr.length) return null;
  return (
    <ul className="mm-bullet-list">
      {arr.map((item, i) => (
        <li key={i} className="mm-bullet-item">
          {typeof item === 'string' ? item : JSON.stringify(item)}
        </li>
      ))}
    </ul>
  );
}

function EnemyEntry({ enemy }) {
  return (
    <div className="mm-enemy-card">
      <div className="mm-enemy-header">
        <span className="mm-enemy-name">{enemy.name}</span>
        <span className="mm-enemy-count">{enemy.count}</span>
      </div>
      {enemy.stat_block && <div className="mm-stat-block">{enemy.stat_block}</div>}
      {enemy.tactics    && <div className="mm-enemy-detail">⚔ {enemy.tactics}</div>}
      {enemy.morale     && <div className="mm-enemy-detail">🏃 {enemy.morale}</div>}
    </div>
  );
}

function CoinsRow({ coins }) {
  if (!coins) return null;
  const defs = [
    { k:'pp', label:'PP', color:'#c0d0ff' },
    { k:'gp', label:'GP', color:'#e0c000' },
    { k:'sp', label:'SP', color:'#c0c0c0' },
    { k:'cp', label:'CP', color:'#c07040' },
  ].filter(c => (coins[c.k] ?? 0) > 0);
  if (!defs.length) return null;
  return (
    <div className="mm-coins-row">
      {defs.map(c => (
        <span key={c.k} className="mm-coin-chip" style={{ color: c.color }}>
          {coins[c.k].toLocaleString()} {c.label}
        </span>
      ))}
    </div>
  );
}

// ── StateBadge / ScopeBadge / TagsDisplay / InfluenceDisplay / LocationMetaBar ─
const STATE_BADGE_COLORS = {
  pristine: '#4ade80', occupied: '#f87171',
  abandoned: '#94a3b8', cleared: '#60a5fa',
};
function StateBadge({ state }) {
  if (!state) return null;
  return (
    <span className="mm-state-badge" style={{ background: STATE_BADGE_COLORS[state] ?? '#d97706' }}>
      {state}
    </span>
  );
}
function ScopeBadge({ scope }) {
  if (!scope) return null;
  return <span className="mm-scope-badge">{scope.replace(/_/g, ' ')}</span>;
}
const TAG_CAT_ICONS = {
  terrain:'🏔', origin:'🏛', depth:'⬇',
  environment:'🌿', structure:'🧱', hazards:'⚠', special:'✨',
};
function TagsDisplay({ tags }) {
  if (!tags || typeof tags !== 'object') return null;
  const entries = Object.entries(tags).filter(([, a]) => Array.isArray(a) && a.length > 0);
  if (!entries.length) return null;
  return (
    <div className="mm-tags-display">
      {entries.map(([cat, arr]) => (
        <div key={cat} className="mm-tag-row">
          <span className="mm-tag-cat">{TAG_CAT_ICONS[cat] ?? '•'} {cat}</span>
          <div className="mm-tag-chips">
            {arr.map(tag => <span key={tag} className="mm-tag-chip">{tag.replace(/_/g, ' ')}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
function InfluenceDisplay({ influence }) {
  if (!influence?.provides_tags) return null;
  const entries = Object.entries(influence.provides_tags).filter(([, a]) => Array.isArray(a) && a.length > 0);
  if (!entries.length) return null;
  return (
    <div className="mm-influence-display">
      <span className="mm-influence-radius">radius: {influence.influence_radius ?? 'local'}</span>
      {entries.map(([cat, arr]) => (
        <div key={cat} className="mm-tag-row">
          <span className="mm-tag-cat">{cat}</span>
          <div className="mm-tag-chips">
            {arr.map(tag => <span key={tag} className="mm-tag-chip mm-tag-chip--influence">{tag.replace(/_/g, ' ')}</span>)}
          </div>
        </div>
      ))}
    </div>
  );
}
function LocationMetaBar({ spec }) {
  if (!spec) return null;
  const terrain = [
    ...(spec.context?.terrain ? [spec.context.terrain] : []),
    ...(spec.context?.biome   ? [spec.context.biome]   : []),
    ...(spec.terrain ?? []).slice(0, 2),
  ].filter(Boolean);
  const hasTags = spec.tags && Object.values(spec.tags).some(a => Array.isArray(a) && a.length > 0);
  return (
    <div className="mm-location-meta">
      <div className="mm-location-meta-row">
        {spec.scope && <ScopeBadge scope={spec.scope} />}
        {spec.state && <StateBadge state={spec.state} />}
        {terrain.length > 0 && <span className="mm-location-terrain">{terrain.join(' · ')}</span>}
      </div>
      {hasTags && <TagsDisplay tags={spec.tags} />}
    </div>
  );
}

// ── POIPanel ──────────────────────────────────────────────────────────────────
const POI_PANEL_SYSTEM = `You are an expert AD&D 2nd Edition DM in the Forgotten Realms. Keep responses concise — 1-2 sentences per item. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

function POIPanel({ poi, map, maps, isDM, playerView, onClose, onUpdate, onDelete, onDrillDown, onNavigate, onShowApiKeys }) {
  const [activeTab,  setActiveTab]  = useState(isDM && !playerView ? 'dm' : 'player');
  const [editing,    setEditing]    = useState(false);
  const [draft,      setDraft]      = useState(poi);
  const [regenning,  setRegenning]  = useState({});
  const [genError,   setGenError]   = useState('');
  const [delConfirm, setDelConfirm] = useState(false);

  useEffect(() => {
    setDraft(poi);
    setEditing(false);
    setGenError('');
    setDelConfirm(false);
  }, [poi.id]);

  const info      = poiInfo(poi.type);
  const typeGroup = poiTypeGroup(poi.type);
  const connMapId = poi.connections?.[0]?.to_location_id;
  const childMap  = poi.child_map_id
    ? maps.find(m => m.id === poi.child_map_id)
    : connMapId ? maps.find(m => m.id === connMapId) : null;
  const hasSubmap = (poi.can_generate_submap || poi.can_drill_down) && !childMap;

  const updateD    = (k, v) => setDraft(d => ({ ...d, [k]: v }));
  const handleSave = () => { onUpdate(draft); setEditing(false); };

  // ── Regen helper ────────────────────────────────────────────────────────────
  const regen = async (key, userPrompt, merge) => {
    if (!hasAnthropicKey()) { onShowApiKeys(); return; }
    setRegenning(r => ({ ...r, [key]: true }));
    setGenError('');
    try {
      const result = await callClaude({ systemPrompt: POI_PANEL_SYSTEM, userPrompt, maxTokens: 800 });
      onUpdate(merge(result));
    } catch (e) { setGenError(e.message); }
    finally { setRegenning(r => ({ ...r, [key]: false })); }
  };

  const regenEnemies  = () => regen('enemies',  buildRegenEnemiesPrompt(poi, map),
    r => ({ ...poi, enemies: r.enemies ?? poi.enemies }));
  const regenTreasure = () => regen('treasure', buildRegenTreasurePrompt(poi, map),
    r => ({ ...poi, treasure: r.treasure ?? poi.treasure, coins: r.coins ?? poi.coins,
            gems: r.gems ?? poi.gems, magic_items: r.magic_items ?? poi.magic_items,
            mundane_items: r.mundane_items ?? poi.mundane_items }));
  const regenSecrets  = () => regen('secrets',  buildRegenSecretsPrompt(poi, map),
    r => ({ ...poi, secrets: r.secrets ?? poi.secrets }));
  const regenHooks    = () => regen('hooks',    buildRegenQuestHooksPrompt(poi, map),
    r => ({ ...poi, quest_hooks: r.quest_hooks ?? poi.quest_hooks }));

  // Normalise secrets/quest_hooks to array for display
  const secretsArr  = Array.isArray(poi.secrets)     ? poi.secrets     : poi.secrets     ? [String(poi.secrets)]     : [];
  const hooksArr    = Array.isArray(poi.quest_hooks)  ? poi.quest_hooks : poi.quest_hooks ? [String(poi.quest_hooks)] : [];

  return (
    <aside className="mm-poi-panel">
      {/* Header */}
      <div className="mm-poi-panel-header">
        <span className="mm-poi-panel-icon" style={{ color: info.color }}>{info.icon}</span>
        <div className="mm-poi-panel-title">
          {editing ? (
            <input className="mm-poi-edit-input" value={draft.name}
              onChange={e => updateD('name', e.target.value)} />
          ) : (
            <span className="mm-poi-panel-name">{poi.name}</span>
          )}
          <span className="mm-poi-panel-type" style={{ color: info.color }}>{info.label}</span>
        </div>
        <button className="mm-icon-btn" onClick={onClose}>✕</button>
      </div>

      {/* Tabs */}
      {isDM && !playerView && (
        <div className="mm-poi-tabs">
          <button className={`mm-poi-tab${activeTab==='player'?' mm-poi-tab--active':''}`}
            onClick={() => setActiveTab('player')}>👁 Players</button>
          <button className={`mm-poi-tab${activeTab==='dm'?' mm-poi-tab--active':''}`}
            onClick={() => setActiveTab('dm')}>🔒 DM</button>
        </div>
      )}

      {/* Body */}
      <div className="mm-poi-panel-body">

        {/* ── PLAYER TAB ─────────────────────────────────────────────────────── */}
        {activeTab === 'player' && (
          <div>
            <div className="mm-poi-section">
              {editing ? (
                <textarea className="mm-poi-edit-textarea" rows={3} value={draft.short_description ?? ''}
                  onChange={e => updateD('short_description', e.target.value)}
                  placeholder="What players can learn…" />
              ) : poi.short_description ? (
                <p className="mm-poi-text">{poi.short_description}</p>
              ) : (
                <em className="mm-poi-empty">No public description.</em>
              )}
            </div>
            {poi.notable_features?.length > 0 && (
              <div className="mm-poi-section">
                <SectionHead icon="👁" label="Notable Features" />
                <BulletList items={poi.notable_features} />
              </div>
            )}
            {poi.effects?.length > 0 && (
              <div className="mm-poi-section">
                <SectionHead icon="✨" label="Observable Effects" />
                <BulletList items={poi.effects} />
              </div>
            )}
            {hooksArr.length > 0 && !poi.is_dm_only && (
              <div className="mm-poi-section">
                <SectionHead icon="📜" label="Rumours" />
                {hooksArr.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)}
              </div>
            )}
          </div>
        )}

        {/* ── DM TAB ─────────────────────────────────────────────────────────── */}
        {activeTab === 'dm' && isDM && (
          <div>

            {/* ── LOCATION type group ──────────────────────────────────────── */}
            {typeGroup === 'location' && (
              <>
                {/* Sub-map button */}
                {childMap ? (
                  <button className="mm-poi-action-btn mm-poi-action-btn--drill"
                    onClick={() => onNavigate(childMap.id)}>
                    🗺 Open: {childMap.name}
                  </button>
                ) : hasSubmap ? (
                  <button className="mm-poi-action-btn mm-poi-action-btn--drill"
                    onClick={() => onDrillDown()}>
                    🗺 Generate {poi.suggested_submap_type ?? poi.drill_down_type ?? 'Sub'}-Map
                  </button>
                ) : null}

                {(poi.current_situation || editing) && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📍" label="Current Situation" />
                    {editing
                      ? <textarea className="mm-poi-edit-textarea" rows={2} value={draft.current_situation ?? ''}
                          onChange={e => updateD('current_situation', e.target.value)} />
                      : <p className="mm-poi-text">{poi.current_situation}</p>}
                  </div>
                )}

                <div className="mm-poi-section">
                  <SectionHead icon="📖" label="DM Description" />
                  {editing
                    ? <textarea className="mm-poi-edit-textarea" rows={3} value={draft.dm_description ?? ''}
                        onChange={e => updateD('dm_description', e.target.value)} />
                    : <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">—</em>}</p>}
                </div>

                {(poi.history || editing) && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📜" label="History" />
                    {editing
                      ? <textarea className="mm-poi-edit-textarea" rows={2} value={draft.history ?? ''}
                          onChange={e => updateD('history', e.target.value)} />
                      : <p className="mm-poi-text">{poi.history}</p>}
                  </div>
                )}

                {poi.inhabitants && (
                  <div className="mm-poi-section">
                    <SectionHead icon="👥" label="Inhabitants" />
                    <p className="mm-poi-text">{poi.inhabitants}</p>
                  </div>
                )}

                {poi.loot_hint && (
                  <div className="mm-poi-section mm-poi-section--treasure">
                    <SectionHead icon="💰" label="Loot Hint" />
                    <p className="mm-poi-text">{poi.loot_hint}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate secrets"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>

                <div className="mm-poi-section">
                  <SectionHead icon="🎯" label="Quest Hooks"
                    onRegen={regenHooks} regenLabel="Regenerate hooks"
                    regenning={regenning.hooks} />
                  {hooksArr.length
                    ? hooksArr.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── ENCOUNTER type group ──────────────────────────────────────── */}
            {typeGroup === 'encounter' && (
              <>
                {poi.encounter_type && (
                  <span className="mm-enc-type-badge">{poi.encounter_type}</span>
                )}

                <div className="mm-poi-section">
                  <SectionHead icon="🌍" label="Setting" />
                  <p className="mm-poi-text">{poi.setting || poi.dm_description || <em className="mm-poi-empty">—</em>}</p>
                </div>

                <div className="mm-poi-section">
                  <SectionHead icon="👾" label="Enemies"
                    onRegen={regenEnemies} regenLabel="Regenerate enemies"
                    regenning={regenning.enemies} />
                  {poi.enemies?.length > 0
                    ? poi.enemies.map((e, i) => <EnemyEntry key={i} enemy={e} />)
                    : <em className="mm-poi-empty">No stat blocks — click 🔄 to generate</em>}
                </div>

                {poi.terrain_features?.length > 0 && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🗺" label="Terrain Features" />
                    <BulletList items={poi.terrain_features} />
                  </div>
                )}

                <div className="mm-poi-section">
                  <SectionHead icon="🎲" label="Surprise Chance" />
                  <p className="mm-poi-text">{poi.surprise_chance || '1 in 6'}</p>
                </div>

                <div className="mm-poi-section mm-poi-section--treasure">
                  <SectionHead icon="💰" label="Treasure"
                    onRegen={regenTreasure} regenLabel="Regenerate loot"
                    regenning={regenning.treasure} />
                  {poi.treasure
                    ? <p className="mm-poi-text">{poi.treasure}</p>
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>

                {poi.aftermath && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📖" label="Aftermath" />
                    <p className="mm-poi-text">{poi.aftermath}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate secrets"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── TRAP type group ───────────────────────────────────────────── */}
            {typeGroup === 'trap' && (
              <>
                <div className="mm-poi-section">
                  <SectionHead icon="📖" label="Description" />
                  <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">—</em>}</p>
                </div>

                {poi.trigger && (
                  <div className="mm-poi-section">
                    <SectionHead icon="⚠️" label="Trigger" />
                    <p className="mm-poi-text">{poi.trigger}</p>
                  </div>
                )}

                {(poi.effect || poi.damage) && (
                  <div className="mm-poi-section">
                    <SectionHead icon="💥" label="Effect" />
                    {poi.effect  && <p className="mm-poi-text">{poi.effect}</p>}
                    {poi.damage  && <div className="mm-stat-block">Damage: {poi.damage}</div>}
                  </div>
                )}

                {poi.detection && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔍" label="Detection" />
                    <p className="mm-poi-text">{poi.detection}</p>
                  </div>
                )}

                {poi.disarm && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔧" label="Disarm" />
                    <p className="mm-poi-text">{poi.disarm}</p>
                  </div>
                )}

                {poi.reset && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔁" label="Reset" />
                    <p className="mm-poi-text">{poi.reset}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="History & Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate"
                    regenning={regenning.secrets} />
                  {poi.history && <p className="mm-poi-text">{poi.history}</p>}
                  {secretsArr.length > 0 && <BulletList items={secretsArr} />}
                </div>
              </>
            )}

            {/* ── TREASURE type group ───────────────────────────────────────── */}
            {typeGroup === 'treasure' && (
              <>
                <div className="mm-poi-section">
                  <SectionHead icon="📖" label="Description" />
                  <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">—</em>}</p>
                </div>

                <div className="mm-poi-section mm-poi-section--treasure">
                  <SectionHead icon="💰" label="Loot"
                    onRegen={regenTreasure} regenLabel="Regenerate loot"
                    regenning={regenning.treasure} />
                  <CoinsRow coins={poi.coins} />
                  {poi.gems?.length > 0 && (
                    <>
                      <div className="mm-loot-cat">💎 Gems</div>
                      <BulletList items={poi.gems} />
                    </>
                  )}
                  {poi.magic_items?.length > 0 && (
                    <>
                      <div className="mm-loot-cat">✨ Magic Items</div>
                      <BulletList items={poi.magic_items} />
                    </>
                  )}
                  {poi.mundane_items?.length > 0 && (
                    <>
                      <div className="mm-loot-cat">📦 Mundane</div>
                      <BulletList items={poi.mundane_items} />
                    </>
                  )}
                  {!poi.coins && !poi.gems?.length && !poi.magic_items?.length && (
                    <em className="mm-poi-empty">No loot — click 🔄 to generate</em>
                  )}
                </div>

                {poi.guardian && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🛡" label="Guardian" />
                    <p className="mm-poi-text">{poi.guardian}</p>
                  </div>
                )}

                {poi.history && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📜" label="History" />
                    <p className="mm-poi-text">{poi.history}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── MYSTERY type group ────────────────────────────────────────── */}
            {typeGroup === 'mystery' && (
              <>
                <div className="mm-poi-section">
                  <SectionHead icon="🔮" label="Phenomenon" />
                  <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">—</em>}</p>
                </div>

                {poi.origin && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🌀" label="Origin" />
                    <p className="mm-poi-text">{poi.origin}</p>
                  </div>
                )}

                {poi.effects?.length > 0 && (
                  <div className="mm-poi-section">
                    <SectionHead icon="✨" label="Effects" />
                    <BulletList items={poi.effects} />
                  </div>
                )}

                {poi.investigation_clues?.length > 0 && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔍" label="Investigation Clues" />
                    <BulletList items={poi.investigation_clues} />
                  </div>
                )}

                {poi.resolution && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔓" label="Resolution" />
                    <p className="mm-poi-text">{poi.resolution}</p>
                  </div>
                )}

                {poi.connection && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🔗" label="Lore Connection" />
                    <p className="mm-poi-text">{poi.connection}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>

                <div className="mm-poi-section">
                  <SectionHead icon="🎯" label="Quest Hooks"
                    onRegen={regenHooks} regenLabel="Regenerate"
                    regenning={regenning.hooks} />
                  {hooksArr.length
                    ? hooksArr.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── NPC type group ────────────────────────────────────────────── */}
            {typeGroup === 'npc' && (
              <>
                {(poi.npc_race || poi.npc_class || poi.npc_alignment) && (
                  <div className="mm-npc-badges">
                    {poi.npc_race      && <span className="mm-npc-badge">{poi.npc_race}</span>}
                    {poi.npc_class     && <span className="mm-npc-badge">{poi.npc_class}</span>}
                    {poi.npc_alignment && <span className="mm-npc-badge">{poi.npc_alignment}</span>}
                  </div>
                )}

                {poi.scene_description && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🎭" label="Scene" />
                    <p className="mm-poi-text">{poi.scene_description}</p>
                  </div>
                )}

                <div className="mm-poi-section">
                  <SectionHead icon="📖" label="Description" />
                  <p className="mm-poi-text">{poi.dm_description || poi.short_description || <em className="mm-poi-empty">—</em>}</p>
                </div>

                {poi.npc_motivation && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🎯" label="Motivation" />
                    <p className="mm-poi-text">{poi.npc_motivation}</p>
                  </div>
                )}

                {poi.personality && (
                  <div className="mm-poi-section">
                    <SectionHead icon="🧠" label="Personality" />
                    <p className="mm-poi-text">{poi.personality}</p>
                  </div>
                )}

                {poi.history && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📜" label="History" />
                    <p className="mm-poi-text">{poi.history}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>

                <div className="mm-poi-section">
                  <SectionHead icon="🎯" label="Quest Hooks"
                    onRegen={regenHooks} regenLabel="Regenerate"
                    regenning={regenning.hooks} />
                  {hooksArr.length
                    ? hooksArr.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── SIMPLE type group (quest, landmark) ──────────────────────── */}
            {typeGroup === 'simple' && (
              <>
                <div className="mm-poi-section">
                  <SectionHead icon="📖" label="Description" />
                  {editing
                    ? <textarea className="mm-poi-edit-textarea" rows={3} value={draft.dm_description ?? ''}
                        onChange={e => updateD('dm_description', e.target.value)} />
                    : <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">—</em>}</p>}
                </div>

                {poi.history && (
                  <div className="mm-poi-section">
                    <SectionHead icon="📜" label="History" />
                    <p className="mm-poi-text">{poi.history}</p>
                  </div>
                )}

                <div className="mm-poi-section mm-poi-section--secrets">
                  <SectionHead icon="🔒" label="Secrets"
                    onRegen={regenSecrets} regenLabel="Regenerate"
                    regenning={regenning.secrets} />
                  {secretsArr.length
                    ? <BulletList items={secretsArr} />
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>

                <div className="mm-poi-section">
                  <SectionHead icon="🎯" label="Quest Hooks"
                    onRegen={regenHooks} regenLabel="Regenerate"
                    regenning={regenning.hooks} />
                  {hooksArr.length
                    ? hooksArr.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)
                    : <em className="mm-poi-empty">None — click 🔄 to generate</em>}
                </div>
              </>
            )}

            {/* ── Engine Data (any type) ───────────────────────────────────── */}
            {(poi.scope || poi.state || poi.tags || poi.connections?.length || poi.influence || poi.origin) && (
              <div className="mm-poi-section mm-poi-section--engine">
                <SectionHead icon="⚙" label="Engine Data" />
                <div className="mm-engine-badges">
                  {poi.scope && <ScopeBadge scope={poi.scope} />}
                  {poi.state && <StateBadge state={poi.state} />}
                </div>
                {poi.origin && typeof poi.origin === 'string' && (
                  <p className="mm-poi-text" style={{ marginTop: 4 }}>{poi.origin}</p>
                )}
                {poi.tags && <TagsDisplay tags={poi.tags} />}
                {poi.connections?.length > 0 && (
                  <div className="mm-engine-subsection">
                    <div className="mm-tag-cat" style={{ marginBottom: 3 }}>🔗 connections</div>
                    {poi.connections.map((conn, i) => {
                      const tgt = conn.to_location_id ? maps.find(m => m.id === conn.to_location_id) : null;
                      return (
                        <div key={i} className="mm-connection-row">
                          {conn.type     && <span className="mm-conn-type">{conn.type}</span>}
                          {conn.to_scope && <span className="mm-conn-scope">→ {conn.to_scope.replace(/_/g, ' ')}</span>}
                          {conn.state    && <StateBadge state={conn.state} />}
                          {tgt ? (
                            <span className="mm-conn-exists">✓ {tgt.name}</span>
                          ) : conn.to_location_id ? (
                            <span className="mm-conn-missing">? #{conn.to_location_id}</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}
                {poi.influence && (
                  <div className="mm-engine-subsection">
                    <div className="mm-tag-cat" style={{ marginBottom: 3 }}>💫 influence</div>
                    <InfluenceDisplay influence={poi.influence} />
                  </div>
                )}
              </div>
            )}

            {/* ── Edit: type + visibility (any type) ───────────────────────── */}
            {editing && (
              <div className="mm-poi-section">
                <SectionHead icon="⚙" label="Type & Visibility" />
                <div style={{ display:'flex', gap:6, marginTop:6 }}>
                  <select className="mm-poi-edit-select" value={draft.type}
                    onChange={e => updateD('type', e.target.value)}>
                    {Object.entries(POI_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                  <button
                    className="mm-poi-edit-btn"
                    style={{ flex:'none', padding:'4px 8px', minWidth:90 }}
                    onClick={() => updateD('is_dm_only', !draft.is_dm_only)}
                  >
                    {draft.is_dm_only ? '🔒 DM Only' : '👁 Public'}
                  </button>
                </div>
              </div>
            )}

            {genError && <div className="mm-ai-error">{genError}</div>}

          </div>
        )}

        {/* ── Action buttons (always visible at bottom) ───────────────────── */}
        <div className="mm-poi-actions">
          {isDM && !playerView && (
            <div className="mm-poi-dm-btns">
              {editing ? (
                <>
                  <button className="mm-poi-save-btn" onClick={handleSave}>✓ Save</button>
                  <button className="mm-poi-cancel-btn"
                    onClick={() => { setDraft(poi); setEditing(false); }}>Cancel</button>
                </>
              ) : (
                <button className="mm-poi-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
              )}
              {delConfirm ? (
                <>
                  <button className="mm-poi-del-btn" onClick={onDelete}>Delete</button>
                  <button className="mm-poi-cancel-btn"
                    onClick={() => setDelConfirm(false)}>Cancel</button>
                </>
              ) : (
                <button className="mm-poi-del-btn" onClick={() => setDelConfirm(true)}>🗑</button>
              )}
            </div>
          )}
        </div>

      </div>
    </aside>
  );
}

export default MapManager;
