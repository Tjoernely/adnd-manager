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
// Sprint 4 — look up the settlement feature for a POI's subType so the
// SUGGESTED NPCs section can show the feature label as a friendly heading.
import { getFeatureBySubType } from '../../rulesets/settlementFeatures.ts';
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

// Sprint 5 — map-type whitelist for the multi-floor feature. Floors only make
// sense for buildings + dungeons. Settlements / wilderness / world / region
// stay single-floor (a "floor" doesn't model a kingdom). Backend map.type
// (lower-case slug) is the source of truth — see VALID_TYPES in routes/maps.js.
const FLOOR_SUPPORTED_TYPES = new Set([
  'dungeon',   // multi-level dungeons (classic)
  'interior',  // tavern/inn upper floors, tower stages, etc.
  'cave',      // caves can stack
  'other',     // catch-all — DM picks whether to use floors
]);
// Default floor labels by number — used when DM leaves the input blank.
function defaultFloorLabel(n) {
  if (n === 0)      return 'Ground Floor';
  if (n === -1)     return 'Cellar';
  if (n < -1)       return `Sub-level ${Math.abs(n)}`;
  if (n === 1)      return 'First Floor';
  if (n === 2)      return 'Second Floor';
  if (n === 3)      return 'Third Floor';
  return `Floor ${n}`;
}
// v1 connector taxonomy. Adding new types is a server + client change.
const CONNECTOR_TYPES = [
  { id: 'stairs',   icon: '🪜', label: 'Stairs'   },
  { id: 'ladder',   icon: '▤',  label: 'Ladder'   },
  { id: 'trapdoor', icon: '⊟',  label: 'Trapdoor' },
];
function connectorTypeInfo(id) {
  return CONNECTOR_TYPES.find(t => t.id === id) ?? CONNECTOR_TYPES[0];
}
// Direction icon for a connector marker — looks at where the OTHER endpoints
// sit relative to the current floor. Up only → ⬆, down only → ⬇, mixed → ⬍.
function directionIcon(currentFloor, otherEndpoints) {
  let up = false, down = false;
  for (const e of otherEndpoints) {
    if (e.floor > currentFloor) up = true;
    if (e.floor < currentFloor) down = true;
  }
  if (up && down) return '⬍';
  if (up)         return '⬆';
  if (down)       return '⬇';
  return '◇'; // same-floor / degenerate (shouldn't happen v1)
}
// Max floors per building. UI blocks the 6th Add Floor with a toast.
const MAX_FLOORS_PER_GROUP = 5;
// Client-side connector id; format conn_<uuid> (8-char shorthand for log readability).
function newConnectorId() {
  return 'conn_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 8) : Date.now().toString(36));
}
function newMapGroupId() {
  return 'mg_' + (crypto.randomUUID ? crypto.randomUUID().slice(0, 12) : Date.now().toString(36));
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
const FR_POI_SYSTEM = `You are an expert classic tabletop Dungeon Master running a campaign in the a classic tabletop fantasy setting. Generate vivid, lore-accurate POI content. Keep all descriptions concise — maximum 2 sentences per field. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

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

  return `Generate a tabletop fantasy ${type} POI for this map.
${mapCtx(map)}
Additional context: ${dmNote || 'none'}

Respond with ONLY this JSON (keep descriptions to 1-2 sentences each):
{
  "name": "Evocative evocative original location name",
  "type": "${type}",
  "short_description": "One sentence players might learn (rumors, visible features)",
  "dm_description": "1-2 sentence DM description",
  "history": "One sentence evocative original backstory",
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
  return `Generate a tabletop fantasy encounter for this map.
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
  return `Generate a tabletop fantasy trap or hazard for this map.
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
  return `Generate a tabletop fantasy treasure cache for this map.
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
  return `Generate a tabletop fantasy magical mystery or anomaly for this map.
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
  "connection": "Connection to larger original plot, faction, or lore",
  "secrets": ["The true nature of the mystery"],
  "quest_hooks": ["Investigation or resolution hook"],
  "is_dm_only": false,
  "can_generate_submap": false
}`;
}

function buildNpcPoiPrompt(map, dmNote) {
  return `Generate a tabletop fantasy NPC encounter for this map.
${mapCtx(map)}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "NPC name (evocative original for their race)",
  "type": "npc",
  "short_description": "What players see — appearance and initial impression",
  "dm_description": "Full DM description of the NPC and the scene",
  "npc_race": "Race",
  "npc_class": "Class or profession",
  "npc_alignment": "Alignment (e.g. Lawful Neutral)",
  "npc_motivation": "What does this NPC want?",
  "scene_description": "Where and how they are encountered in detail",
  "personality": "3 personality traits, comma-separated",
  "history": "Brief evocative original backstory",
  "current_situation": "What they are doing right now",
  "secrets": ["What this NPC is hiding"],
  "quest_hooks": ["How they can involve the party"],
  "is_dm_only": false,
  "can_generate_submap": false
}`;
}

function buildSimplePoiPrompt(type, map, dmNote) {
  return `Generate a tabletop fantasy point of interest for this map.
${mapCtx(map)}
POI Type: ${type}
Context: ${dmNote || 'none'}

Respond with ONLY this JSON:
{
  "name": "evocative original evocative name",
  "type": "${type}",
  "short_description": "One sentence players might learn",
  "dm_description": "Full DM description (2-3 sentences)",
  "history": "Brief evocative original backstory",
  "secrets": ["Hidden detail or plot hook"],
  "quest_hooks": ["One original hook"],
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
  return `For the encounter "${poi.name}" in the tabletop fantasy map "${map.name}":
${poi.setting || poi.dm_description || ''}
Generate a fresh set of evocative original enemies with full classic tabletop stat blocks.
Respond with ONLY this JSON:
{"enemies": [{"name":"...","type":"humanoid","count":"...","stat_block":"HD: X, AC: Y, THAC0: Z, HP: Xd8, ATT: X, DAM: Xd6","tactics":"...","morale":"..."}]}`;
}

function buildRegenTreasurePrompt(poi, map) {
  return `For the POI "${poi.name}" (${poi.type}) in the tabletop fantasy map "${map.name}", generate fresh classic tabletop loot appropriate for this location.
Respond with ONLY this JSON:
{"treasure": "brief loot description", "coins": {"pp":0,"gp":0,"sp":0,"cp":0}, "gems": [], "magic_items": [], "mundane_items": []}`;
}

function buildRegenSecretsPrompt(poi, map) {
  return `For the tabletop fantasy POI "${poi.name}" (${poi.type}) in "${map.name}":
${poi.dm_description || poi.short_description || ''}
Generate 2-3 fresh secrets or hidden plot hooks.
Respond with ONLY this JSON:
{"secrets": ["Secret 1", "Secret 2"]}`;
}

function buildRegenQuestHooksPrompt(poi, map) {
  return `For the tabletop fantasy POI "${poi.name}" (${poi.type}) in "${map.name}":
${poi.short_description || poi.dm_description || ''}
Generate 2 fresh tabletop fantasy quest hooks.
Respond with ONLY this JSON:
{"quest_hooks": ["Hook 1", "Hook 2"]}`;
}

// ── MapManager (root) ─────────────────────────────────────────────────────────
// Sprint 4 — `initialFocusMapId` / `initialFocusPoiId` let callers (e.g. the
// NPC detail panel's "↗ Open map" link) open the overlay focused on a
// specific map + POI. Both are nullable; when set we honour them once per
// open transition then forget them.
export function MapManager({ campaignId, isDM, isOpen, onClose, initialFocusMapId, initialFocusPoiId }) {
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

  // ── Sprint 5 — Multi-level state ────────────────────────────────────────────
  // We piggyback on the existing `maps` list rather than refetching: a map
  // group is just maps[] filtered by map_group_id. Connectors however live
  // in their own table and need their own fetch keyed by group id.
  const mapGroup = useMemo(() => {
    if (!activeMap) return null;
    const gid = activeMap.map_group_id;
    if (!gid) {
      // Solo map — pretend it's a 1-floor group so downstream UI can iterate
      // floors uniformly. Switcher stays hidden when floors.length < 2.
      return {
        groupId: null,
        floors:  [{ map: activeMap, floorNumber: activeMap.floor_number ?? 0,
                    floorLabel: activeMap.floor_label || defaultFloorLabel(activeMap.floor_number ?? 0) }],
      };
    }
    const floors = maps
      .filter(m => m.map_group_id === gid)
      .sort((a, b) => (a.floor_number ?? 0) - (b.floor_number ?? 0))
      .map(m => ({
        map:         m,
        floorNumber: m.floor_number ?? 0,
        floorLabel:  m.floor_label || defaultFloorLabel(m.floor_number ?? 0),
      }));
    return { groupId: gid, floors };
  }, [activeMap, maps]);

  const [connectors, setConnectors] = useState([]);
  const [connectorsLoading, setConnectorsLoading] = useState(false);
  useEffect(() => {
    const gid = mapGroup?.groupId;
    if (!gid) { setConnectors([]); return; }
    let alive = true;
    setConnectorsLoading(true);
    api.listConnectors(gid)
      .then(r => { if (alive) setConnectors(Array.isArray(r) ? r : []); })
      .catch(e => { if (alive) { console.warn('[MapManager] listConnectors:', e.message); setConnectors([]); } })
      .finally(() => { if (alive) setConnectorsLoading(false); });
    return () => { alive = false; };
  }, [mapGroup?.groupId]);

  // Connectors that touch the current floor (used for marker rendering).
  const currentFloorNumber = activeMap?.floor_number ?? 0;
  const currentFloorConnectors = useMemo(() => {
    return connectors.filter(c =>
      Array.isArray(c.endpoints) && c.endpoints.some(e => e.floor === currentFloorNumber)
    );
  }, [connectors, currentFloorNumber]);

  // Switch active map to a different floor by floor_number within the group.
  const switchToFloor = useCallback((targetFloorNumber) => {
    if (!mapGroup) return;
    const target = mapGroup.floors.find(f => f.floorNumber === targetFloorNumber);
    if (!target) { showToast(`No map for floor ${targetFloorNumber}`); return; }
    setActiveMapId(target.map.id);
    setSelectedPoiId(null);
    try { sessionStorage.setItem(`map_floor_${mapGroup.groupId}`, String(targetFloorNumber)); } catch {}
  }, [mapGroup, showToast]);

  // Restore last-active floor on group entry (Sprint 5.5 verifikation #10).
  useEffect(() => {
    if (!mapGroup?.groupId || mapGroup.floors.length < 2) return;
    try {
      const raw = sessionStorage.getItem(`map_floor_${mapGroup.groupId}`);
      const n   = raw == null ? null : Number(raw);
      if (n != null && Number.isFinite(n) && n !== currentFloorNumber) {
        const target = mapGroup.floors.find(f => f.floorNumber === n);
        if (target) setActiveMapId(target.map.id);
      }
    } catch {}
    // Only fire on group transitions, not every floor change inside the group.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapGroup?.groupId]);

  // Sprint 5 — modal state for Add Floor / Add Connector / Edit Connector.
  const [showAddFloor,      setShowAddFloor]      = useState(false);
  const [showAddConnector,  setShowAddConnector]  = useState(false);
  const [editingConnector,  setEditingConnector]  = useState(null); // connector object
  // Two-phase Add Connector / Add Floor click-to-place state.
  const [pendingConnectorPlacement, setPendingConnectorPlacement] = useState(null);
  // Shape: { phase: 'first'|'second', type, label, locked, hidden,
  //          firstEndpoint: {floor,x,y}|null, targetFloor: N|null,
  //          callback: (conn) => void }

  const floorsSupported = activeMap ? FLOOR_SUPPORTED_TYPES.has(activeMap.type) : false;

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

  // Sprint 4 — honour deep-link focus from NPC detail "Open map" button.
  // Fires when the overlay opens (or initialFocusMapId changes) AFTER maps
  // have loaded. Selects the requested map + POI in one shot.
  useEffect(() => {
    if (!isOpen || !initialFocusMapId || maps.length === 0) return;
    const target = maps.find(m => m.id === initialFocusMapId);
    if (!target) return;
    setActiveMapId(initialFocusMapId);
    setSelectedPoiId(initialFocusPoiId ?? null);
  }, [isOpen, initialFocusMapId, initialFocusPoiId, maps]);

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

  // ── Map click router (POI placement OR Sprint 5 connector placement) ───────
  const handleMapClick = useCallback((xPct, yPct) => {
    if (!isDM || !activeMap) return;
    // Connector placement takes precedence — both flows are mutually exclusive
    // because their "begin" buttons turn each other off.
    if (pendingConnectorPlacement) {
      const p = pendingConnectorPlacement;
      // Single-click mode (used by Add Floor) — fire handler and exit.
      if (p.singleClick && typeof p.singleClickHandler === 'function') {
        const fn = p.singleClickHandler;
        setPendingConnectorPlacement(null);
        fn(xPct, yPct);
        return;
      }
      if (p.phase === 'first') {
        // Record first endpoint; switch to target floor for second click.
        const firstEndpoint = { floor: currentFloorNumber, x_percent: xPct, y_percent: yPct };
        const target = mapGroup?.floors.find(f => f.floorNumber === p.targetFloor);
        if (!target) { showToast('Target floor not found.'); setPendingConnectorPlacement(null); return; }
        setPendingConnectorPlacement({ ...p, phase: 'second', firstEndpoint });
        setActiveMapId(target.map.id);
        showToast(`First endpoint placed. Click on ${target.map.floor_label || defaultFloorLabel(p.targetFloor)} to set the second.`);
        return;
      }
      if (p.phase === 'second') {
        const secondEndpoint = { floor: currentFloorNumber, x_percent: xPct, y_percent: yPct };
        if (typeof p.callback === 'function') {
          p.callback({ first: p.firstEndpoint, second: secondEndpoint });
        }
        setPendingConnectorPlacement(null);
        return;
      }
    }
    if (addPoiMode) {
      setPendingPoiPos({ x: xPct, y: yPct });
      setAddPoiMode(false);
    }
  }, [isDM, addPoiMode, activeMap, pendingConnectorPlacement, currentFloorNumber, mapGroup, showToast]);

  // Backward-compat alias kept for MapCanvas prop name; routed through handleMapClick.
  const handleMapClickForPoi = handleMapClick;

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

  // ── Phase 6d: Regenerate a single POI via Haiku ──────────────────────────────
  // Keeps the POI's type + position + id (so map markers don't move) but rolls
  // a fresh name + narrative. Cheap (~$0.001), fast (~1-2 s). Failure shows a
  // toast and leaves the POI untouched.
  const [regeneratingPoiId, setRegeneratingPoiId] = useState(null);
  const handleRegeneratePoi = useCallback(async (poi) => {
    if (!activeMap || !poi) return;
    setRegeneratingPoiId(poi.id);
    try {
      const mapTitle    = activeMap.name ?? '(unknown)';
      const mapSubtitle = activeMap.data?.subtitle ?? '';
      const userDesc    = activeMap.data?.generated_params?.user_description ?? '';
      const userPrompt = `Re-generate a single POI on a tabletop fantasy map. Keep the SAME POI TYPE; change the name and narrative to give the DM a different take. No published-setting references.

MAP CONTEXT:
- Title: "${mapTitle}"${mapSubtitle ? ` — ${mapSubtitle}` : ''}
- Original user description: ${userDesc || '(none)'}

CURRENT POI (to be replaced):
- Type: ${poi.type}
- Name: ${poi.name}
- Short description: ${poi.short_description ?? ''}

Respond with ONLY this JSON (no markdown fences):
{
  "name":              "evocative original name (different from current)",
  "short_description": "1 sentence players might learn",
  "dm_description":    "1-2 sentence DM detail with original lore",
  "history":           "1 sentence original fantasy backstory",
  "current_situation": "1 sentence current state",
  "encounters":        "Possible encounter, or null",
  "treasure":          "Loot if any, or null",
  "secrets":           "Hidden info, or null",
  "quest_hooks":       ["one original hook"]
}`;
      const fresh = await callClaude({
        systemPrompt: 'You are a tabletop fantasy worldbuilder. Respond with raw JSON only — no markdown fences.',
        userPrompt,
        maxTokens: 800,
        model:     'claude-haiku-4-5',
      });
      if (!fresh?.name) throw new Error('Haiku returned no name');
      const updated = {
        ...poi,
        name:              fresh.name,
        short_description: fresh.short_description ?? poi.short_description,
        dm_description:    fresh.dm_description    ?? poi.dm_description,
        history:           fresh.history           ?? poi.history,
        current_situation: fresh.current_situation ?? poi.current_situation,
        encounters:        fresh.encounters        ?? poi.encounters,
        treasure:          fresh.treasure          ?? poi.treasure,
        secrets:           fresh.secrets           ?? poi.secrets,
        quest_hooks:       Array.isArray(fresh.quest_hooks) ? fresh.quest_hooks : poi.quest_hooks,
      };
      const newPois = (activeMap.data?.pois ?? []).map(p => p.id === poi.id ? updated : p);
      await savePois(newPois);
      showToast(`POI re-rolled: ${fresh.name}`);
    } catch (e) {
      console.error('[MapManager] regeneratePoi failed:', e.message);
      showToast(`POI regen failed: ${e.message}`);
    } finally {
      setRegeneratingPoiId(null);
    }
  }, [activeMap, savePois, showToast]);

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

  // ── Sprint 5 — Connector CRUD ───────────────────────────────────────────────
  const createConnector = useCallback(async (payload) => {
    try {
      const conn = await api.createConnector(payload);
      setConnectors(prev => [...prev, conn]);
      return conn;
    } catch (e) {
      console.error('[MapManager] createConnector:', e.message);
      showToast(`Connector save failed: ${e.message}`);
      return null;
    }
  }, [showToast]);

  const updateConnector = useCallback(async (id, patch) => {
    try {
      const updated = await api.updateConnector(id, patch);
      setConnectors(prev => prev.map(c => c.id === id ? updated : c));
      return updated;
    } catch (e) {
      console.error('[MapManager] updateConnector:', e.message);
      showToast(`Connector update failed: ${e.message}`);
      return null;
    }
  }, [showToast]);

  const deleteConnector = useCallback(async (id) => {
    try {
      await api.deleteConnector(id);
      setConnectors(prev => prev.filter(c => c.id !== id));
    } catch (e) {
      console.error('[MapManager] deleteConnector:', e.message);
      showToast(`Connector delete failed: ${e.message}`);
    }
  }, [showToast]);

  // ── Sprint 5 — Add Floor ───────────────────────────────────────────────────
  // Wires solo→group conversion AND new-floor creation in one place.
  //
  // payload: {
  //   floor_number, floor_label,
  //   useExistingImage: boolean,  // true → blank canvas, false → AI generate later
  //   connector?: { type, label, locked, hidden, currentEndpoint: {x%,y%}, newEndpoint: {x%,y%} }
  // }
  const handleAddFloor = useCallback(async (payload) => {
    if (!activeMap || !isDM) return null;
    if (!mapGroup) return null;
    if (mapGroup.floors.length >= MAX_FLOORS_PER_GROUP) {
      showToast(`Max ${MAX_FLOORS_PER_GROUP} floors per building.`);
      return null;
    }
    if (mapGroup.floors.some(f => f.floorNumber === payload.floor_number)) {
      showToast(`Floor ${payload.floor_number} already exists.`);
      return null;
    }

    // 1. Solo→group conversion: if the active map has no group, mint one and
    //    flip it to floor 0 first so the new floor has somewhere to attach.
    let groupId = mapGroup.groupId;
    let rootMap = activeMap;
    if (!groupId) {
      groupId = newMapGroupId();
      try {
        const flipped = await api.updateMap(activeMap.id, {
          name: activeMap.name, type: activeMap.type, image_url: activeMap.image_url,
          data: activeMap.data,
          map_group_id: groupId,
          floor_number: 0,
          floor_label:  activeMap.floor_label || 'Ground Floor',
        });
        patchMap(flipped);
        rootMap = flipped;
      } catch (e) {
        showToast(`Could not convert to multi-floor: ${e.message}`);
        return null;
      }
    }

    // 2. Create the new floor's map record. Inherits type + context from root.
    const newName = payload.floor_label
      ? `${rootMap.name} — ${payload.floor_label}`
      : `${rootMap.name} — Floor ${payload.floor_number}`;
    let newFloor;
    try {
      newFloor = await api.createMap({
        campaign_id:   campaignId,
        name:          newName,
        type:          rootMap.type,
        parent_map_id: rootMap.parent_map_id ?? null,
        parent_poi_id: rootMap.parent_poi_id ?? null,
        purpose:       rootMap.purpose ?? 'standard',
        context:       rootMap.context ?? null,
        map_group_id:  groupId,
        floor_number:  payload.floor_number,
        floor_label:   payload.floor_label || defaultFloorLabel(payload.floor_number),
        data: {
          visible_to_players: false,
          pins:               [],
          pois:               [],
          // Carry parent's spec where useful so AI regen has context.
          ...(rootMap.data?.spec ? { spec: rootMap.data.spec } : {}),
        },
      });
      setMaps(prev => [...prev, newFloor]);
    } catch (e) {
      showToast(`New floor failed: ${e.message}`);
      return null;
    }

    // 3. Optional connector between current floor and new floor.
    if (payload.connector) {
      const c = payload.connector;
      await createConnector({
        id:            newConnectorId(),
        map_group_id:  groupId,
        campaign_id:   campaignId,
        type:          c.type,
        label:         c.label || `${connectorTypeInfo(c.type).label} to ${defaultFloorLabel(payload.floor_number)}`,
        locked:        !!c.locked,
        hidden:        !!c.hidden,
        endpoints: [
          { floor: rootMap.floor_number ?? 0, x_percent: c.currentEndpoint.x, y_percent: c.currentEndpoint.y },
          { floor: payload.floor_number,      x_percent: c.newEndpoint.x,     y_percent: c.newEndpoint.y     },
        ],
      });
    }

    // 4. Switch view to the new floor.
    setActiveMapId(newFloor.id);
    setSelectedPoiId(null);
    showToast(`Added ${newFloor.floor_label}`, newFloor.id);
    return newFloor;
  }, [activeMap, isDM, mapGroup, campaignId, patchMap, createConnector, showToast]);

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
    // ── 5A: depth guard ──────────────────────────────────────────────────────
    // A sub-map's depth equals its ancestor count; cap chains at MAX_DEPTH so
    // sub-sub-sub-maps don't grow indefinitely. Top-level = 0 ancestors.
    const MAX_DEPTH = 3;
    const currentDepth = getAncestors(maps, activeMapId).length;
    if (currentDepth >= MAX_DEPTH) {
      showToast(
        `Maximum sub-map depth reached (${MAX_DEPTH} levels). ` +
        `Generate a separate top-level map instead.`,
      );
      return;
    }

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

    // 5B-a: inherit map style from the parent — sub-maps default to the same
    // visual treatment unless the DM picks a different style.
    // Bug C: legacy maps stored 'parchment_map' (pre-5B-a default) which is
    // NOT a slug in mapStylePresets.json — the <select> falls back to the
    // first option visually but the value stays 'parchment_map' and gets
    // round-tripped into the new sub-map's spec. Normalize the legacy alias
    // to its real slug so both the UI and the saved spec are consistent.
    const rawParentStyle = parentMap?.data?.spec?.constraints?.style;
    const parentStyle = rawParentStyle === 'parchment_map' ? 'parchment' : rawParentStyle;
    if (parentStyle) {
      presetParams = { ...presetParams, mapStyle: parentStyle };
    }

    // presetType (from POI type) overrides connection-derived mapType
    if (submapPreset) presetParams = { ...presetParams, mapType: submapPreset };

    setGenContext({
      parentMapId:  activeMapId,
      parentPoiId:  poi.id,
      parentPoiCtx: poi,
      // 5B-b: parent-map context (title/subtitle) is plumbed into the prompts
      // so the sub-map's metadata and POIs stay coherent with the larger
      // location the party is exploring within.
      parentMapCtx: parentMap
        ? { title: parentMap.name, subtitle: parentMap.data?.subtitle ?? '' }
        : null,
      presetType:   submapPreset,
      presetParams,
    });
    setShowGenerator(true);
  }, [activeMapId, maps, showToast]);

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
            <button className="mm-back-btn" onClick={onClose} aria-label="Back to dashboard">
              ← Dashboard
            </button>
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

              {/* Sprint 5 — Floor switcher (only when group has 2+ floors OR
                  map-type supports floors so the DM sees the [+ Add Floor] button) */}
              {(mapGroup && mapGroup.floors.length > 1) || (isDM && floorsSupported) ? (
                <FloorSwitcher
                  mapGroup={mapGroup}
                  currentFloorNumber={currentFloorNumber}
                  canAddFloor={isDM && floorsSupported}
                  canAddConnector={isDM && mapGroup && mapGroup.floors.length > 1}
                  onSwitch={switchToFloor}
                  onAddFloor={() => setShowAddFloor(true)}
                  onAddConnector={() => setShowAddConnector(true)}
                  pendingPlacement={pendingConnectorPlacement}
                  onCancelPlacement={() => { setPendingConnectorPlacement(null); showToast('Connector placement cancelled.'); }}
                />
              ) : null}

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
                  addPoiMode={addPoiMode || !!pendingConnectorPlacement}
                  onPoiSelect={setSelectedPoiId}
                  onPoiDragEnd={handlePoiDragEnd}
                  onMapClick={handleMapClickForPoi}
                  connectors={currentFloorConnectors}
                  currentFloorNumber={currentFloorNumber}
                  onConnectorClick={(conn) => {
                    if (isDM && !playerView) { setEditingConnector(conn); return; }
                    // Player or DM in player-view: navigate to first other floor
                    const other = conn.endpoints.find(e => e.floor !== currentFloorNumber);
                    if (other) switchToFloor(other.floor);
                  }}
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
                    onRegenerate={() => handleRegeneratePoi(selectedPoi)}
                    regenerating={regeneratingPoiId === selectedPoi.id}
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

      {/* Sprint 5 — Add Floor modal */}
      {showAddFloor && isDM && activeMap && (
        <AddFloorModal
          mapGroup={mapGroup}
          currentFloorNumber={currentFloorNumber}
          existingFloorNumbers={(mapGroup?.floors ?? []).map(f => f.floorNumber)}
          onClose={() => setShowAddFloor(false)}
          onConfirm={async (payload) => {
            if (!payload.connector) {
              await handleAddFloor(payload);
              setShowAddFloor(false);
              return;
            }
            // With connector: single click on current floor places both endpoints
            // (the new floor inherits the same coord by default; DM can move
            // the marker later via Edit Connector). Avoids a confusing
            // second-click on a brand-new blank map image.
            setShowAddFloor(false);
            showToast('Click on the map to place the staircase.');
            setPendingConnectorPlacement({
              singleClick: true,
              singleClickHandler: async (xPct, yPct) => {
                await handleAddFloor({
                  ...payload,
                  connector: {
                    type:            payload.connector.type,
                    label:           payload.connector.label,
                    locked:          payload.connector.locked,
                    hidden:          payload.connector.hidden,
                    currentEndpoint: { x: xPct, y: yPct },
                    newEndpoint:     { x: xPct, y: yPct },
                  },
                });
              },
            });
          }}
        />
      )}

      {/* Sprint 5 — Add Connector modal (between two existing floors) */}
      {showAddConnector && isDM && mapGroup && mapGroup.floors.length > 1 && (
        <AddConnectorModal
          floors={mapGroup.floors}
          currentFloorNumber={currentFloorNumber}
          onClose={() => setShowAddConnector(false)}
          onConfirm={(payload) => {
            setShowAddConnector(false);
            showToast(`Click on the current floor to place the ${payload.type}'s first endpoint.`);
            setPendingConnectorPlacement({
              phase: 'first',
              type:  payload.type,
              label: payload.label,
              locked: payload.locked,
              hidden: payload.hidden,
              targetFloor: payload.targetFloor,
              callback: async (eps) => {
                await createConnector({
                  id:           newConnectorId(),
                  map_group_id: mapGroup.groupId,
                  campaign_id:  campaignId,
                  type:         payload.type,
                  label:        payload.label || `${connectorTypeInfo(payload.type).label} (${defaultFloorLabel(eps.first.floor)} ↔ ${defaultFloorLabel(eps.second.floor)})`,
                  locked:       payload.locked,
                  hidden:       payload.hidden,
                  endpoints:    [eps.first, eps.second],
                });
                showToast('Connector added.');
              },
            });
          }}
        />
      )}

      {/* Sprint 5 — Edit Connector popup */}
      {editingConnector && isDM && (
        <EditConnectorModal
          connector={editingConnector}
          floors={mapGroup?.floors ?? []}
          onClose={() => setEditingConnector(null)}
          onSave={async (patch) => {
            await updateConnector(editingConnector.id, patch);
            setEditingConnector(null);
          }}
          onDelete={async () => {
            await deleteConnector(editingConnector.id);
            setEditingConnector(null);
          }}
          onNavigateTo={(floor) => { switchToFloor(floor); setEditingConnector(null); }}
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
          parentMapCtx={genContext?.parentMapCtx ?? null}
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
              mapId={sketchEditMap?.id ?? null}
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
        data-purpose={map.purpose ?? 'standard'}
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
// Sprint 6 — zoom constants. 1× is fit-to-container, 5× is the practical cap
// for a 1536px image (10x would be pure pixels). 1.2× per wheel step gives ~9
// steps from 1× to 5× — feels natural.
const MIN_ZOOM      = 1;
const MAX_ZOOM      = 5;
const WHEEL_STEP    = 1.2;
const DEFAULT_VIEW  = { zoom: 1, panX: 0, panY: 0 };

function loadViewState(mapId) {
  if (mapId == null) return { ...DEFAULT_VIEW };
  try {
    const raw = sessionStorage.getItem(`map_view_${mapId}`);
    if (!raw) return { ...DEFAULT_VIEW };
    const parsed = JSON.parse(raw);
    return {
      zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +parsed.zoom || 1)),
      panX: +parsed.panX || 0,
      panY: +parsed.panY || 0,
    };
  } catch { return { ...DEFAULT_VIEW }; }
}
function saveViewState(mapId, view) {
  if (mapId == null) return;
  try { sessionStorage.setItem(`map_view_${mapId}`, JSON.stringify(view)); } catch {}
}

function MapCanvas({ map, pois, selectedPoiId, isDM, playerView, addPoiMode, onPoiSelect, onPoiDragEnd, onMapClick,
                     // Sprint 5
                     connectors = [], currentFloorNumber = 0, onConnectorClick }) {
  const containerRef = useRef(null);
  const scrollRef    = useRef(null);

  // ── Sprint 6 — zoom + pan ──────────────────────────────────────────────────
  // CSS transform on the inner container scales POI markers automatically
  // (they're absolute-positioned by %). getBoundingClientRect returns the
  // post-transform size so existing POI drag math keeps working without
  // changes. View state is persisted per-map_id in sessionStorage so
  // floor-switches and tab navigations don't lose the DM's zoom level.
  const [view, setView] = useState(() => loadViewState(map?.id));
  useEffect(() => { setView(loadViewState(map?.id)); }, [map?.id]);
  useEffect(() => { saveViewState(map?.id, view); }, [map?.id, view]);

  const zoomBy = useCallback((factor, originClient) => {
    setView(prev => {
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev.zoom * factor));
      if (newZoom === prev.zoom) return prev;
      // Keep the point under the cursor stationary while zooming
      // (cursor-anchored zoom). If no cursor info, anchor to centre.
      let panX = prev.panX, panY = prev.panY;
      const el = containerRef.current?.parentElement; // .mm-zoom-wrap
      if (originClient && el) {
        const rect = el.getBoundingClientRect();
        const cx   = originClient.x - rect.left - rect.width  / 2;
        const cy   = originClient.y - rect.top  - rect.height / 2;
        const scale = newZoom / prev.zoom;
        panX = (prev.panX - cx) * scale + cx;
        panY = (prev.panY - cy) * scale + cy;
      }
      return { zoom: newZoom, panX, panY };
    });
  }, []);

  const resetView = useCallback(() => setView({ ...DEFAULT_VIEW }), []);

  // Wheel zoom — only when hovering inside the map. Prevents default scroll
  // so we don't fight the page below. Cmd/Ctrl modifier NOT required —
  // single-wheel is the most common map-editor UX.
  const handleWheel = useCallback((e) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? WHEEL_STEP : 1 / WHEEL_STEP;
    zoomBy(factor, { x: e.clientX, y: e.clientY });
  }, [zoomBy]);

  // Pan with mousedown+drag when zoomed in (zoom > 1) AND not in placement
  // mode (else clicks would still try to place a POI). Skips when the
  // mousedown target is a POI/connector marker — those use pointerCapture
  // already so their move events don't bubble here.
  const panStart = useRef(null);
  const handleContainerPointerDown = (e) => {
    if (addPoiMode) return;                            // placement click takes precedence
    if (view.zoom <= 1.001) return;                    // nothing to pan at 1×
    if (e.target.closest?.('.mm-poi-marker')) return;  // POI drag wins
    if (e.target.closest?.('.mm-connector-layer'))     // connector click wins
      return;
    panStart.current = { mx: e.clientX, my: e.clientY, panX: view.panX, panY: view.panY, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const handleContainerPointerMove = (e) => {
    if (!panStart.current) return;
    const dx = e.clientX - panStart.current.mx;
    const dy = e.clientY - panStart.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) panStart.current.moved = true;
    setView(prev => ({ ...prev, panX: panStart.current.panX + dx, panY: panStart.current.panY + dy }));
  };
  const handleContainerPointerUp = () => {
    panStart.current = null;
  };

  // The click handler stays for POI placement only — pan is handled above
  // via pointer events, so a click that's actually a drag won't fire onClick.
  const handleContainerClick = (e) => {
    if (panStart.current?.moved) return;
    if (!addPoiMode) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    onMapClick(Math.max(2, Math.min(98, x)), Math.max(2, Math.min(98, y)));
  };

  // Native wheel listener (React onWheel is passive in some browsers and
  // can't preventDefault on a non-capturing scroll container).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const fn = (e) => handleWheel(e);
    el.addEventListener('wheel', fn, { passive: false });
    return () => el.removeEventListener('wheel', fn);
  }, [handleWheel]);

  const mapImageSrc = map.image_url || map.data?.imageUrl || null;

  if (!mapImageSrc) {
    return (
      <div className="mm-canvas-noimage">
        <div className="mm-canvas-empty">
          <div className="mm-canvas-empty-icon">🗺</div>
          <div>{isDM ? 'No image — upload one or generate with DALL·E 3' : 'Map image not available.'}</div>
          {isDM && <div className="mm-canvas-empty-hint">Use 🖼 Image in the toolbar to upload</div>}
        </div>
        {pois.length > 0 && (
          <div className="mm-poi-list">
            <div className="mm-poi-list-title">Points of Interest · {pois.length}</div>
            {pois.map(poi => {
              const info = poiInfo(poi.type);
              return (
                <button
                  key={poi.id}
                  type="button"
                  className={`mm-poi-list-item${poi.id === selectedPoiId ? ' mm-poi-list-item--selected' : ''}`}
                  onClick={() => onPoiSelect(poi.id)}
                >
                  <span className="mm-poi-list-icon" style={{ color: info.color }}>{info.icon}</span>
                  <span className="mm-poi-list-name">{poi.name}</span>
                  <span className="mm-poi-list-type" style={{ color: info.color }}>{info.label}</span>
                  {poi.is_dm_only && !playerView && <span className="mm-poi-list-badge">🔒</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Pan cursor hint when zoomed in
  const canPan = view.zoom > 1.001 && !addPoiMode;
  const cursorStyle = addPoiMode ? 'crosshair' : (canPan ? 'grab' : 'default');

  return (
    <div className="mm-canvas-scroll" ref={scrollRef} style={{ position: 'relative', overflow: 'hidden' }}>
      <div
        className="mm-zoom-wrap"
        style={{
          width:           '100%',
          height:          '100%',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          overflow:        'hidden',
        }}
      >
        <div
          ref={containerRef}
          className={`mm-map-container${addPoiMode ? ' mm-map-container--place' : ''}`}
          onClick={handleContainerClick}
          onPointerDown={handleContainerPointerDown}
          onPointerMove={handleContainerPointerMove}
          onPointerUp={handleContainerPointerUp}
          onPointerCancel={handleContainerPointerUp}
          style={{
            transform:       `translate(${view.panX}px, ${view.panY}px) scale(${view.zoom})`,
            transformOrigin: 'center center',
            transition:      panStart.current ? 'none' : 'transform 0.08s linear',
            cursor:          cursorStyle,
            willChange:      'transform',
          }}
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
        {/* Sprint 5 — connector markers (stairs/ladder/trapdoor) */}
        {Array.isArray(connectors) && connectors.length > 0 && (
          <div className="mm-connector-layer">
            {connectors.map(conn => {
              const here = conn.endpoints.find(e => e.floor === currentFloorNumber);
              if (!here) return null;
              if (conn.hidden && playerView) return null;
              const others = conn.endpoints.filter(e => e.floor !== currentFloorNumber);
              return (
                <ConnectorMarker
                  key={conn.id}
                  connector={conn}
                  endpoint={here}
                  otherEndpoints={others}
                  currentFloor={currentFloorNumber}
                  isDM={isDM}
                  playerView={playerView}
                  onClick={() => onConnectorClick?.(conn)}
                />
              );
            })}
          </div>
        )}
        </div>
      </div>
      {/* Sprint 6 — zoom controls (bottom-right overlay) */}
      <ZoomControls
        zoom={view.zoom}
        onZoomIn={() => zoomBy(WHEEL_STEP, null)}
        onZoomOut={() => zoomBy(1 / WHEEL_STEP, null)}
        onReset={resetView}
      />
    </div>
  );
}

function ZoomControls({ zoom, onZoomIn, onZoomOut, onReset }) {
  const btnStyle = {
    width:        32,
    height:       32,
    padding:      0,
    fontFamily:   'inherit',
    fontSize:     '0.95rem',
    background:   'rgba(0, 0, 0, 0.62)',
    color:        '#c8a84b',
    border:       '1px solid rgba(200, 168, 75, 0.45)',
    borderRadius: 4,
    cursor:       'pointer',
    display:      'flex',
    alignItems:   'center',
    justifyContent:'center',
  };
  return (
    <div
      style={{
        position:    'absolute',
        right:       12,
        bottom:      12,
        display:     'flex',
        flexDirection: 'column',
        gap:         4,
        zIndex:      10,
        pointerEvents: 'auto',
      }}
    >
      <button type="button" style={btnStyle}
        title="Zoom in"
        disabled={zoom >= MAX_ZOOM - 0.001}
        onClick={onZoomIn}>＋</button>
      <button type="button" style={{ ...btnStyle, fontSize: '0.74rem' }}
        title={`Reset to 1× (current ${zoom.toFixed(1)}×)`}
        onClick={onReset}>{zoom.toFixed(1)}×</button>
      <button type="button" style={btnStyle}
        title="Zoom out"
        disabled={zoom <= MIN_ZOOM + 0.001}
        onClick={onZoomOut}>－</button>
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

// ─────────────────────────────────────────────────────────────────────────────
// Sprint 5 — Multi-level: FloorSwitcher + ConnectorMarker + modals
// ─────────────────────────────────────────────────────────────────────────────

function FloorSwitcher({ mapGroup, currentFloorNumber, canAddFloor, canAddConnector,
                         onSwitch, onAddFloor, onAddConnector,
                         pendingPlacement, onCancelPlacement }) {
  if (!mapGroup) return null;
  const showFloors = mapGroup.floors.length > 1;
  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        flexWrap:       'wrap',
        padding:        '6px 12px',
        background:     'rgba(0, 0, 0, 0.32)',
        border:         '1px solid rgba(200, 168, 75, 0.18)',
        borderRadius:   6,
        margin:         '6px 0 0',
      }}
    >
      {showFloors && (
        <>
          <span style={{ fontSize: '0.72rem', color: '#9a875a', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Floors
          </span>
          {mapGroup.floors.map(f => {
            const active = f.floorNumber === currentFloorNumber;
            return (
              <button
                key={f.map.id}
                type="button"
                onClick={() => !active && onSwitch(f.floorNumber)}
                title={`${f.floorLabel} (${f.floorNumber >= 0 ? '+' : ''}${f.floorNumber})`}
                style={{
                  padding:      '4px 10px',
                  fontSize:     '0.78rem',
                  fontFamily:   'inherit',
                  background:   active ? 'rgba(200, 168, 75, 0.2)' : 'rgba(0, 0, 0, 0.35)',
                  color:        active ? '#f5d97a' : '#c8a84b',
                  border:       `1px solid ${active ? 'rgba(245, 217, 122, 0.55)' : 'rgba(200, 168, 75, 0.3)'}`,
                  borderRadius: 4,
                  cursor:       active ? 'default' : 'pointer',
                  fontWeight:   active ? 600 : 400,
                }}
              >
                {active ? '● ' : ''}{f.floorLabel}
                <span style={{ marginLeft: 6, opacity: 0.65, fontSize: '0.68rem' }}>
                  ({f.floorNumber >= 0 ? '+' : ''}{f.floorNumber})
                </span>
              </button>
            );
          })}
        </>
      )}
      <span style={{ flex: 1 }} />
      {pendingPlacement && (
        <button
          type="button"
          onClick={onCancelPlacement}
          style={{
            padding: '4px 10px', fontSize: '0.74rem', fontFamily: 'inherit',
            background: 'rgba(192, 48, 48, 0.22)', color: '#f08080',
            border: '1px solid rgba(192, 48, 48, 0.5)', borderRadius: 4, cursor: 'pointer',
          }}
        >
          ✕ Cancel placement
        </button>
      )}
      {canAddConnector && (
        <button
          type="button"
          onClick={onAddConnector}
          disabled={!!pendingPlacement}
          style={{
            padding: '4px 10px', fontSize: '0.76rem', fontFamily: 'inherit',
            background: 'rgba(0, 0, 0, 0.4)', color: '#c8a84b',
            border: '1px solid rgba(200, 168, 75, 0.4)', borderRadius: 4,
            cursor: pendingPlacement ? 'not-allowed' : 'pointer',
          }}
          title="Add a connector between two existing floors"
        >
          🪜 Add Connector
        </button>
      )}
      {canAddFloor && (
        <button
          type="button"
          onClick={onAddFloor}
          disabled={!!pendingPlacement}
          style={{
            padding: '4px 10px', fontSize: '0.76rem', fontFamily: 'inherit',
            background: 'rgba(0, 0, 0, 0.4)', color: '#f5d97a',
            border: '1px solid rgba(245, 217, 122, 0.5)', borderRadius: 4,
            cursor: pendingPlacement ? 'not-allowed' : 'pointer',
          }}
          title={mapGroup.floors.length >= MAX_FLOORS_PER_GROUP
            ? `Max ${MAX_FLOORS_PER_GROUP} floors per building`
            : 'Add a new floor to this building'}
        >
          + Add Floor
        </button>
      )}
    </div>
  );
}

function ConnectorMarker({ connector, endpoint, otherEndpoints, currentFloor, isDM, playerView, onClick }) {
  const ti  = connectorTypeInfo(connector.type);
  const dir = directionIcon(currentFloor, otherEndpoints);
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick?.(); }}
      title={`${connector.label || ti.label} → ${otherEndpoints.map(o => `floor ${o.floor}`).join(', ')}`}
      style={{
        position:      'absolute',
        left:          `${endpoint.x_percent}%`,
        top:           `${endpoint.y_percent}%`,
        transform:     'translate(-50%, -50%)',
        width:         28,
        height:        28,
        borderRadius:  '50%',
        background:    connector.hidden
                         ? 'rgba(40, 0, 60, 0.85)'
                         : 'rgba(40, 30, 10, 0.9)',
        border:        `2px solid ${connector.hidden ? '#9040c0' : '#f5d97a'}`,
        color:         '#f5d97a',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        fontSize:      '0.82rem',
        cursor:        'pointer',
        boxShadow:     '0 0 6px rgba(0, 0, 0, 0.55)',
        zIndex:        4,
      }}
    >
      <span aria-hidden>{dir}</span>
      {connector.locked && (
        <span style={{ position: 'absolute', right: -6, bottom: -6, fontSize: '0.7rem',
                       background: '#000', borderRadius: '50%', padding: '0 2px' }}>🔒</span>
      )}
      {connector.hidden && isDM && !playerView && (
        <span style={{ position: 'absolute', left: -6, top: -6, fontSize: '0.6rem',
                       background: '#000', borderRadius: '50%', padding: '0 2px', color: '#c08fff' }}>👁</span>
      )}
    </div>
  );
}

// ── Add Floor modal ──────────────────────────────────────────────────────────
function AddFloorModal({ mapGroup, currentFloorNumber, existingFloorNumbers, onClose, onConfirm }) {
  // Step 1 — position picker. Most DMs add Above or Below; Custom is escape hatch.
  const usedSet  = new Set(existingFloorNumbers);
  const tryAbove = currentFloorNumber + 1;
  const tryBelow = currentFloorNumber - 1;
  const defaultPos = !usedSet.has(tryAbove) ? tryAbove
                   : !usedSet.has(tryBelow) ? tryBelow
                   : currentFloorNumber + 2;

  const [floorNumber,   setFloorNumber]   = useState(defaultPos);
  const [floorLabel,    setFloorLabel]    = useState('');
  const [addConnector,  setAddConnector]  = useState(true);
  const [connType,      setConnType]      = useState('stairs');
  const [connLabel,     setConnLabel]     = useState('');
  const [connLocked,    setConnLocked]    = useState(false);
  const [connHidden,    setConnHidden]    = useState(false);
  const [err,           setErr]           = useState('');

  const duplicate = usedSet.has(floorNumber);
  const atLimit   = (mapGroup?.floors?.length ?? 0) >= MAX_FLOORS_PER_GROUP;

  const submit = () => {
    if (duplicate) { setErr(`Floor ${floorNumber} already exists.`); return; }
    if (atLimit)   { setErr(`Max ${MAX_FLOORS_PER_GROUP} floors per building.`); return; }
    onConfirm({
      floor_number: floorNumber,
      floor_label:  floorLabel.trim(),
      connector:    addConnector ? {
        type:   connType,
        label:  connLabel.trim(),
        locked: connLocked,
        hidden: connHidden,
      } : null,
    });
  };

  return (
    <div className="mm-type-backdrop" onClick={onClose}>
      <div className="mm-type-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <div className="mm-type-header">
          <span className="mm-type-title">➕ Add Floor</span>
          <button className="mm-icon-btn mm-icon-btn--close" onClick={onClose}>✕</button>
        </div>
        <div className="mm-type-body">
          <div className="mm-type-section-label">Position</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {[tryAbove, tryBelow, defaultPos + 1, defaultPos - 1]
              .filter((n, i, arr) => arr.indexOf(n) === i)
              .map(n => (
                <button key={n} type="button"
                  disabled={usedSet.has(n)}
                  onClick={() => setFloorNumber(n)}
                  style={{
                    padding: '4px 10px', fontSize: '0.78rem',
                    background: floorNumber === n ? 'rgba(200, 168, 75, 0.25)' : 'rgba(0, 0, 0, 0.35)',
                    color: usedSet.has(n) ? '#5a4a30' : '#c8a84b',
                    border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4,
                    cursor: usedSet.has(n) ? 'not-allowed' : 'pointer',
                  }}>
                  Floor {n} {usedSet.has(n) && '(exists)'}
                </button>
              ))}
            <input type="number" value={floorNumber}
              onChange={e => setFloorNumber(parseInt(e.target.value || '0', 10))}
              style={{
                width: 80, padding: '4px 8px', fontSize: '0.78rem',
                background: 'rgba(0, 0, 0, 0.4)', color: '#d4c090',
                border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4,
              }} />
          </div>

          <div className="mm-type-field" style={{ marginBottom: 12 }}>
            <label className="mm-type-field-label">Floor label (optional)</label>
            <input className="mm-type-field-input" value={floorLabel}
              onChange={e => setFloorLabel(e.target.value)}
              placeholder={defaultFloorLabel(floorNumber)} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#d4c090', fontSize: '0.84rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={addConnector} onChange={e => setAddConnector(e.target.checked)} />
            Add a connector linking the two floors
          </label>

          {addConnector && (
            <div style={{ marginTop: 10, padding: '8px 10px', background: 'rgba(0, 0, 0, 0.22)',
                          border: '1px solid rgba(200, 168, 75, 0.18)', borderRadius: 4 }}>
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {CONNECTOR_TYPES.map(t => (
                  <button key={t.id} type="button" onClick={() => setConnType(t.id)}
                    style={{
                      padding: '4px 10px', fontSize: '0.78rem',
                      background: connType === t.id ? 'rgba(200, 168, 75, 0.25)' : 'rgba(0, 0, 0, 0.35)',
                      color: '#c8a84b', border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4,
                      cursor: 'pointer',
                    }}>
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
              <input type="text" value={connLabel} onChange={e => setConnLabel(e.target.value)}
                placeholder={`${connectorTypeInfo(connType).label} to ${defaultFloorLabel(floorNumber)}`}
                style={{ width: '100%', padding: '4px 8px', fontSize: '0.78rem',
                         background: 'rgba(0, 0, 0, 0.4)', color: '#d4c090',
                         border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4, marginBottom: 8 }} />
              <div style={{ display: 'flex', gap: 14 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={connLocked} onChange={e => setConnLocked(e.target.checked)} /> 🔒 Locked
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.78rem' }}>
                  <input type="checkbox" checked={connHidden} onChange={e => setConnHidden(e.target.checked)} /> 👁 Hidden (DM-only)
                </label>
              </div>
            </div>
          )}

          {err && <div className="mm-type-error" style={{ marginTop: 8 }}>{err}</div>}
        </div>
        <div className="mm-type-footer">
          <button className="mm-type-generate-btn" onClick={submit} disabled={duplicate || atLimit}>
            ✓ Add Floor{addConnector ? ' + Place Connector' : ''}
          </button>
          <button className="mm-type-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Add Connector modal (between two existing floors) ────────────────────────
function AddConnectorModal({ floors, currentFloorNumber, onClose, onConfirm }) {
  const targets = floors.filter(f => f.floorNumber !== currentFloorNumber);
  const [type,        setType]        = useState('stairs');
  const [label,       setLabel]       = useState('');
  const [targetFloor, setTargetFloor] = useState(targets[0]?.floorNumber ?? 0);
  const [locked,      setLocked]      = useState(false);
  const [hidden,      setHidden]      = useState(false);

  return (
    <div className="mm-type-backdrop" onClick={onClose}>
      <div className="mm-type-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mm-type-header">
          <span className="mm-type-title">🪜 Add Connector</span>
          <button className="mm-icon-btn mm-icon-btn--close" onClick={onClose}>✕</button>
        </div>
        <div className="mm-type-body">
          <div className="mm-type-section-label">Type</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {CONNECTOR_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                style={{
                  padding: '4px 10px', fontSize: '0.78rem',
                  background: type === t.id ? 'rgba(200, 168, 75, 0.25)' : 'rgba(0, 0, 0, 0.35)',
                  color: '#c8a84b', border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4,
                  cursor: 'pointer',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="mm-type-field" style={{ marginBottom: 12 }}>
            <label className="mm-type-field-label">Target floor</label>
            <select value={targetFloor} onChange={e => setTargetFloor(parseInt(e.target.value, 10))}
              style={{ width: '100%', padding: '4px 8px', fontSize: '0.84rem',
                       background: 'rgba(0, 0, 0, 0.4)', color: '#d4c090',
                       border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4 }}>
              {targets.map(t => (
                <option key={t.map.id} value={t.floorNumber}>
                  {t.floorLabel} (floor {t.floorNumber})
                </option>
              ))}
            </select>
          </div>

          <div className="mm-type-field" style={{ marginBottom: 12 }}>
            <label className="mm-type-field-label">Label (optional)</label>
            <input className="mm-type-field-input" value={label} onChange={e => setLabel(e.target.value)}
              placeholder={`${connectorTypeInfo(type).label} to ${defaultFloorLabel(targetFloor)}`} />
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.84rem' }}>
              <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} /> 🔒 Locked
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.84rem' }}>
              <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> 👁 Hidden (DM-only)
            </label>
          </div>
        </div>
        <div className="mm-type-footer">
          <button className="mm-type-generate-btn"
            disabled={targets.length === 0}
            onClick={() => onConfirm({ type, label, targetFloor, locked, hidden })}>
            ✓ Place Endpoints
          </button>
          <button className="mm-type-cancel-btn" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Edit Connector popup ─────────────────────────────────────────────────────
function EditConnectorModal({ connector, floors, onClose, onSave, onDelete, onNavigateTo }) {
  const [type,     setType]     = useState(connector.type);
  const [label,    setLabel]    = useState(connector.label ?? '');
  const [locked,   setLocked]   = useState(!!connector.locked);
  const [hidden,   setHidden]   = useState(!!connector.hidden);
  const [endpoints,setEndpoints]= useState(connector.endpoints);
  const [delConf,  setDelConf]  = useState(false);

  const labelForFloor = (n) => floors.find(f => f.floorNumber === n)?.floorLabel ?? defaultFloorLabel(n);

  return (
    <div className="mm-type-backdrop" onClick={onClose}>
      <div className="mm-type-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="mm-type-header">
          <span className="mm-type-title">✎ Edit Connector</span>
          <button className="mm-icon-btn mm-icon-btn--close" onClick={onClose}>✕</button>
        </div>
        <div className="mm-type-body">
          <div className="mm-type-section-label">Type</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            {CONNECTOR_TYPES.map(t => (
              <button key={t.id} type="button" onClick={() => setType(t.id)}
                style={{
                  padding: '4px 10px', fontSize: '0.78rem',
                  background: type === t.id ? 'rgba(200, 168, 75, 0.25)' : 'rgba(0, 0, 0, 0.35)',
                  color: '#c8a84b', border: '1px solid rgba(200, 168, 75, 0.3)', borderRadius: 4,
                  cursor: 'pointer',
                }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="mm-type-field" style={{ marginBottom: 12 }}>
            <label className="mm-type-field-label">Label</label>
            <input className="mm-type-field-input" value={label} onChange={e => setLabel(e.target.value)} />
          </div>

          <div className="mm-type-section-label">Endpoints</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {endpoints.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: '#a89878' }}>
                <span style={{ flex: 1 }}>
                  {labelForFloor(e.floor)} — {e.x_percent.toFixed(0)}%, {e.y_percent.toFixed(0)}%
                </span>
                <button type="button" onClick={() => onNavigateTo(e.floor)}
                  style={{ padding: '2px 6px', fontSize: '0.7rem',
                           background: 'rgba(200, 168, 75, 0.18)', color: '#c8a84b',
                           border: '1px solid rgba(200, 168, 75, 0.35)', borderRadius: 3, cursor: 'pointer' }}>
                  ↗ Go
                </button>
              </div>
            ))}
            <div style={{ fontSize: '0.7rem', color: '#5a4a30', marginTop: 4 }}>
              To move an endpoint: click ↗ Go to that floor, delete this connector, and add a new one with the desired position.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.84rem' }}>
              <input type="checkbox" checked={locked} onChange={e => setLocked(e.target.checked)} /> 🔒 Locked
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#a89878', fontSize: '0.84rem' }}>
              <input type="checkbox" checked={hidden} onChange={e => setHidden(e.target.checked)} /> 👁 Hidden (DM-only)
            </label>
          </div>
        </div>
        <div className="mm-type-footer">
          {delConf ? (
            <>
              <button className="mm-type-generate-btn" style={{ background: 'rgba(192, 48, 48, 0.4)', borderColor: '#c03030' }}
                onClick={onDelete}>
                ⚠ Confirm Delete
              </button>
              <button className="mm-type-cancel-btn" onClick={() => setDelConf(false)}>Keep</button>
            </>
          ) : (
            <>
              <button className="mm-type-generate-btn"
                onClick={() => onSave({ type, label, locked, hidden, endpoints })}>
                ✓ Save
              </button>
              <button className="mm-type-cancel-btn" onClick={() => setDelConf(true)}>🗑 Delete</button>
              <button className="mm-type-cancel-btn" onClick={onClose}>Cancel</button>
            </>
          )}
        </div>
      </div>
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

// Sprint 4 — one row in the POI panel's "Suggested NPCs" section.
// Shows role + name + brief; on "Add to NPCs" the parent runs the Haiku
// expansion + POST flow and persists added_npc_id back on the POI so the
// button switches to a permanent "✓ Added" indicator.
function SuggestedNpcRow({ suggestion, busy, onAdd }) {
  const added = !!suggestion.added_npc_id;
  return (
    <div
      style={{
        display:       'flex',
        alignItems:    'flex-start',
        gap:           10,
        padding:       '6px 8px',
        marginTop:     4,
        background:    'rgba(0, 0, 0, 0.22)',
        border:        '1px solid rgba(200, 168, 75, 0.18)',
        borderRadius:  4,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.84rem', color: '#d4c090' }}>
          <strong>{suggestion.name}</strong>
          {suggestion.role && (
            <span style={{ marginLeft: 8, color: '#9a875a', fontSize: '0.74rem' }}>
              {suggestion.role}
            </span>
          )}
          {suggestion.is_hidden && (
            <span title="Will be created as a hidden (DM-only) NPC"
              style={{ marginLeft: 6, fontSize: '0.7rem', color: '#f5d97a' }}>
              🔒
            </span>
          )}
        </div>
        {suggestion.brief && (
          <div style={{ fontSize: '0.76rem', color: '#a89878', marginTop: 2, lineHeight: 1.4 }}>
            {suggestion.brief}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onAdd}
        disabled={busy || added}
        title={added ? 'Already added to NPCs' : 'Expand with Haiku and add to NPCs'}
        style={{
          flex:         'none',
          padding:      '5px 10px',
          fontSize:     '0.74rem',
          fontFamily:   'inherit',
          background:   added ? 'rgba(74, 222, 128, 0.16)' : 'rgba(0, 0, 0, 0.4)',
          color:        added ? '#4ade80' : busy ? '#9a875a' : '#c8a84b',
          border:       `1px solid ${added ? 'rgba(74, 222, 128, 0.45)' : 'rgba(200, 168, 75, 0.4)'}`,
          borderRadius: 3,
          cursor:       added || busy ? 'default' : 'pointer',
          whiteSpace:   'nowrap',
        }}
      >
        {added ? '✓ Added' : busy ? '⏳ Adding…' : '+ Add to NPCs'}
      </button>
    </div>
  );
}

// Sprint 4 — Haiku prompt that expands a suggested-NPC sketch into a full
// NPC record. Keeps the response shape aligned with NPCManager's data model
// (race / class / alignment / personality[] / motivation / background /
// secrets[] / quest_hooks[]). Original tabletop fantasy lore only — no
// published-setting references.
function buildExpandSuggestedNpcPrompt(suggestion, poi, map) {
  const mapName = map?.name ? `the map "${map.name}"` : 'this map';
  const poiName = poi?.name ? `the POI "${poi.name}"` : 'this location';
  const sub     = poi?.subType ? ` (${poi.subType})` : '';
  const brief   = (suggestion.brief ?? '').trim();
  return `Expand this suggested NPC sketch into a full tabletop NPC record for ${poiName}${sub} on ${mapName}.

Sketch:
- Name: ${suggestion.name}
- Role: ${suggestion.role}
- Brief: ${brief || '(none provided — invent something appropriate)'}

POI context (use this for tone/setting alignment, do NOT contradict it):
- Type: ${poi?.type ?? 'location'}
- Description: ${(poi?.short_description ?? poi?.dm_description ?? '').slice(0, 280)}

Respond with ONLY this JSON object (raw JSON, no markdown fences):
{
  "name":        "${suggestion.name}",
  "race":        "human|elf|dwarf|halfling|gnome|half-elf|half-orc|other",
  "class":       "AD&D class or role (e.g. fighter, priest, commoner, merchant)",
  "alignment":   "LG|NG|CG|LN|N|CN|LE|NE|CE",
  "appearance":  "1-2 sentence physical description",
  "personality": ["trait 1", "trait 2", "trait 3"],
  "motivation":  "1 sentence — what they want",
  "background":  "1-2 sentence original backstory tying to ${poiName}",
  "secrets":     ["one DM-only secret"],
  "quest_hooks": ["one original hook the party could pull on"]
}

Rules:
- Keep responses concise — 1-2 sentences per text field.
- Use original tabletop fantasy lore; no Forgotten Realms / Greyhawk / Eberron names.
- personality and secrets/quest_hooks MUST be arrays of strings.`;
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
const POI_PANEL_SYSTEM = `You are an expert classic tabletop DM in the tabletop fantasy. Keep responses concise — 1-2 sentences per item. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

function POIPanel({ poi, map, maps, isDM, playerView, onClose, onUpdate, onDelete, onDrillDown, onRegenerate, regenerating, onNavigate, onShowApiKeys }) {
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

  // ── Sprint 4 — Suggested NPCs: expand sketch → full NPC via Haiku, then
  // POST /api/npcs and persist the resulting npc.id back onto the POI so the
  // UI can switch the row to "✓ Added" and link straight to the NPC record.
  const [addingSugIdx, setAddingSugIdx] = useState(null);
  const addSuggestedNpc = useCallback(async (idx) => {
    const sug = poi.suggested_npcs?.[idx];
    if (!sug || sug.added_npc_id) return;
    if (!hasAnthropicKey()) { onShowApiKeys(); return; }
    setAddingSugIdx(idx);
    setGenError('');
    try {
      const userPrompt = buildExpandSuggestedNpcPrompt(sug, poi, map);
      // Haiku — cheap + fast. Returns a full NPC sketch we can persist.
      const full = await callClaude({
        systemPrompt: POI_PANEL_SYSTEM,
        userPrompt,
        model:        'claude-haiku-4-5',
        maxTokens:    1200,
      });
      const finalName = (full?.name ?? sug.name ?? 'Unnamed').toString().trim();
      const npcData = {
        race:        full?.race        ?? '',
        class_:      full?.class       ?? '',
        alignment:   full?.alignment   ?? '',
        role:        sug.role,
        appearance:  full?.appearance  ?? '',
        personality: Array.isArray(full?.personality) ? full.personality
                    : full?.personality ? [String(full.personality)] : [],
        motivation:  full?.motivation  ?? '',
        background:  full?.background  ?? '',
        secrets:     Array.isArray(full?.secrets) ? full.secrets
                    : full?.secrets ? [String(full.secrets)] : [],
        quest_hooks: Array.isArray(full?.quest_hooks) ? full.quest_hooks
                    : full?.quest_hooks ? [String(full.quest_hooks)] : [],
        notes:       sug.brief ?? '',
      };
      const created = await api.createNpc({
        campaign_id:   map.campaign_id,
        name:          finalName,
        data:          npcData,
        is_hidden:     sug.is_hidden === true || !!poi.is_dm_only,
        source_poi_id: poi.id,
        source_map_id: map.id,
      });
      // Persist added_npc_id back on the POI so we don't re-create on re-click
      const nextSuggestions = poi.suggested_npcs.map((s, i) =>
        i === idx ? { ...s, added_npc_id: created.id } : s
      );
      onUpdate({ ...poi, suggested_npcs: nextSuggestions });
    } catch (e) {
      setGenError(`Could not add NPC: ${e.message}`);
    } finally {
      setAddingSugIdx(null);
    }
  }, [poi, map, onUpdate, onShowApiKeys]);

  // Normalise secrets/quest_hooks to array for display
  const secretsArr  = Array.isArray(poi.secrets)     ? poi.secrets     : poi.secrets     ? [String(poi.secrets)]     : [];
  const hooksArr    = Array.isArray(poi.quest_hooks)  ? poi.quest_hooks : poi.quest_hooks ? [String(poi.quest_hooks)] : [];
  const suggestionsArr = Array.isArray(poi.suggested_npcs) ? poi.suggested_npcs : [];
  const featureForSub  = getFeatureBySubType(poi.subType);

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
          {poi.subType && (
            <span
              className="mm-poi-panel-type"
              title="Settlement feature (Sprint 3 subType)"
              style={{
                marginLeft:  6,
                fontSize:    '0.7rem',
                color:       '#c8a84b',
                background:  'rgba(200, 168, 75, 0.12)',
                border:      '1px solid rgba(200, 168, 75, 0.35)',
                borderRadius: 3,
                padding:     '1px 6px',
                letterSpacing: '0.04em',
              }}
            >
              {poi.subType}
            </span>
          )}
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

            {/* ── Sprint 4 — Suggested NPCs (settlement-feature POIs) ──────── */}
            {suggestionsArr.length > 0 && (
              <div className="mm-poi-section mm-poi-section--npcs">
                <SectionHead icon="🧑" label={`Suggested NPCs${featureForSub ? ` — ${featureForSub.label}` : ''}`} />
                {suggestionsArr.map((sug, i) => (
                  <SuggestedNpcRow
                    key={i}
                    suggestion={sug}
                    busy={addingSugIdx === i}
                    onAdd={() => addSuggestedNpc(i)}
                  />
                ))}
              </div>
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
              {/* Phase 6d: Haiku-powered single-POI reroll. Keeps type/id/position,
                  swaps name + narrative. Cheap + fast. */}
              {!editing && onRegenerate && (
                <button
                  className="mm-poi-edit-btn"
                  onClick={onRegenerate}
                  disabled={regenerating}
                  title="Re-roll this POI's name and narrative (Haiku)"
                >
                  {regenerating ? '⏳ Regenerating…' : '⟳ Regenerate'}
                </button>
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
