/**
 * MapGenerator — AI-powered map creation modal.
 *
 * Props:
 *   campaignId  string
 *   onClose     fn()
 *   onCreated   fn(map) — called with the new map record after save
 */
import { useState } from 'react';
import { api }            from '../../api/client.js';
import { callClaude, hasAnthropicKey } from '../../api/aiClient.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';
import './MapGenerator.css';

// ── Option lists ──────────────────────────────────────────────────────────────

const MAP_TYPES = [
  'Random','Dungeon','Ancient Ruins','Wilderness','Cave System',
  'Stronghold','City District','Underwater Temple','Planar Rift',
];
const MAP_SIZES = [
  'Random','Small (5–8 areas)','Medium (8–12 areas)','Large (12–16 areas)',
];
const TERRAINS = [
  'Random','Stone & Mortar','Forest','Underground','Aquatic','Urban','Desert','Underdark',
];
const ATMOSPHERES = [
  'Random','Foreboding','Mysterious','Ancient','Corrupted','Majestic','Abandoned','Sacred',
];
const ERAS = [
  'Random','Ancient Empire','Medieval','Declining Empire','Post-Apocalyptic','Mythic Age',
];
const INHABITANTS = [
  'Random','Undead','Humanoid Bandits','Monsters','Aberrations',
  'Evil Cultists','Neutral Creatures','Empty & Haunted',
];

const BACKEND_TYPES = ['dungeon','world','region','city','town','interior','encounter','other'];

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function resolveParams(p) {
  return {
    mapType:     p.mapType     === 'Random' ? pick(MAP_TYPES.slice(1))     : p.mapType,
    size:        p.size        === 'Random' ? pick(MAP_SIZES.slice(1))     : p.size,
    terrain:     p.terrain     === 'Random' ? pick(TERRAINS.slice(1))      : p.terrain,
    atmosphere:  p.atmosphere  === 'Random' ? pick(ATMOSPHERES.slice(1))   : p.atmosphere,
    era:         p.era         === 'Random' ? pick(ERAS.slice(1))          : p.era,
    inhabitants: p.inhabitants === 'Random' ? pick(INHABITANTS.slice(1))   : p.inhabitants,
  };
}

function toBackendType(mapTypeStr) {
  const s = mapTypeStr.toLowerCase();
  if (s.includes('dungeon'))    return 'dungeon';
  if (s.includes('ruined') || s.includes('ruins')) return 'dungeon';
  if (s.includes('cave'))       return 'dungeon';
  if (s.includes('stronghold')) return 'interior';
  if (s.includes('city'))       return 'city';
  if (s.includes('urban'))      return 'city';
  if (s.includes('wilderness') || s.includes('forest') || s.includes('desert')) return 'region';
  if (s.includes('underwater') || s.includes('planar')) return 'other';
  return 'dungeon';
}

// ── Claude prompts ────────────────────────────────────────────────────────────

const MAP_SYSTEM_PROMPT = `You are an expert AD&D 2nd Edition dungeon designer creating vivid maps for the Forgotten Realms.
Return ONLY valid JSON with no markdown fences, no commentary, no trailing commas.
The JSON must exactly match this schema:
{
  "title": "string — evocative map name",
  "description": "string — 1-2 sentence overview",
  "history": "string — 2-3 sentences of lore and history",
  "layout_description": "string — 1-2 sentences about the physical layout",
  "areas": [
    {
      "id": "a1",
      "name": "string",
      "type": "entrance|room|boss|treasure|trap|puzzle|corridor|secret|outdoor|other",
      "description": "string — 1-2 sentences",
      "connections": ["a2"],
      "is_hidden": false
    }
  ],
  "pois": [
    {
      "id": "p1",
      "area_id": "a1",
      "name": "string",
      "type": "monster|npc|trap|treasure|puzzle|lore|hazard",
      "description": "string — 2-3 sentences with AD&D detail",
      "is_hidden": true
    }
  ],
  "random_encounters": ["string — brief encounter description"],
  "lore_hooks": ["string — plot hook"],
  "secrets": ["string — DM-only secret"],
  "atmosphere_notes": "string — 1 sentence mood/sensory description",
  "suggested_music": "string — musical mood suggestion"
}
Rules:
- First area MUST have type "entrance"
- Include 6–12 areas; connections form a connected graph (each area reachable from entrance)
- Include 4–8 POIs spread across areas
- IDs: a1, a2, … for areas; p1, p2, … for POIs — all unique
- connections list area IDs (bidirectional edges, list each direction only once)
- Secret rooms: is_hidden=true; boss rooms: type="boss"; treasure rooms: type="treasure"
- Include 2–4 random_encounters, 2–3 lore_hooks, 1–2 secrets`;

function buildMapPrompt(r) {
  return `Generate a complete AD&D 2E map with these parameters:
- Type: ${r.mapType}
- Size: ${r.size}
- Terrain: ${r.terrain}
- Atmosphere: ${r.atmosphere}
- Era: ${r.era}
- Primary Inhabitants: ${r.inhabitants}

Make it feel authentic to the Forgotten Realms — atmospheric, dangerous, and full of adventure hooks.`;
}

// ── MapGenerator component ────────────────────────────────────────────────────

export function MapGenerator({ campaignId, onClose, onCreated }) {
  const [params, setParams] = useState({
    mapType:'Random', size:'Random', terrain:'Random',
    atmosphere:'Random', era:'Random', inhabitants:'Random',
  });
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');
  const [result,       setResult]       = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const set = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const resolved = resolveParams(params);
      const data = await callClaude({
        systemPrompt: MAP_SYSTEM_PROMPT,
        userPrompt:   buildMapPrompt(resolved),
        maxTokens:    4096,
      });
      if (!data.areas || !Array.isArray(data.areas) || data.areas.length === 0) {
        throw new Error('AI returned an invalid map structure (no areas). Please try again.');
      }
      setResult({ ...data, _resolved: resolved });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    setError('');
    try {
      const backendType = toBackendType(result._resolved.mapType);
      const map = await api.createMap({
        campaign_id: campaignId,
        name:        result.title || 'Generated Map',
        type:        backendType,
        data: {
          areas:              result.areas              || [],
          pois:               result.pois               || [],
          random_encounters:  result.random_encounters  || [],
          lore_hooks:         result.lore_hooks          || [],
          secrets:            result.secrets             || [],
          atmosphere_notes:   result.atmosphere_notes   || '',
          suggested_music:    result.suggested_music    || '',
          description:        result.description        || '',
          history:            result.history            || '',
          layout_description: result.layout_description || '',
          visible_to_players: false,
          generated_params:   result._resolved,
        },
      });
      onCreated(map);
    } catch (e) {
      setError(e.message);
      setSaving(false);
    }
  };

  const areaCount = result?.areas?.length ?? 0;
  const poiCount  = result?.pois?.length  ?? 0;

  return (
    <>
      <div className="mgn-backdrop" onClick={onClose}>
        <div className="mgn-modal" onClick={e => e.stopPropagation()}>

          {/* Header */}
          <div className="mgn-header">
            <span className="mgn-title">✦ AI Map Generator</span>
            <button className="mgn-close-btn" onClick={onClose}>✕</button>
          </div>

          <div className="mgn-body">
            {/* Options grid */}
            <div className="mgn-options-grid">
              {[
                { label:'Map Type',    key:'mapType',     opts: MAP_TYPES    },
                { label:'Size',        key:'size',        opts: MAP_SIZES    },
                { label:'Terrain',     key:'terrain',     opts: TERRAINS     },
                { label:'Atmosphere',  key:'atmosphere',  opts: ATMOSPHERES  },
                { label:'Era',         key:'era',         opts: ERAS         },
                { label:'Inhabitants', key:'inhabitants', opts: INHABITANTS  },
              ].map(({ label, key, opts }) => (
                <div key={key} className="mgn-field">
                  <div className="mgn-field-label">{label}</div>
                  <select
                    className="mgn-select"
                    value={params[key]}
                    onChange={e => set(key, e.target.value)}
                    disabled={loading}
                  >
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
            </div>

            {/* Generate button */}
            {!result && (
              <button
                className="mgn-generate-btn"
                onClick={handleGenerate}
                disabled={loading}
              >
                {loading ? '⏳ Generating map…' : '✦ Generate Map'}
              </button>
            )}

            {/* Loading */}
            {loading && (
              <div className="mgn-loading">
                <div className="mgn-loading-spinner">🗺</div>
                <div>Claude is crafting your map…</div>
                <div className="mgn-loading-sub">Forging areas, encounters and secrets</div>
              </div>
            )}

            {/* Error */}
            {error && <div className="mgn-error">{error}</div>}

            {/* Result preview */}
            {result && !loading && (
              <div className="mgn-result">
                <div className="mgn-result-title">{result.title}</div>
                <div className="mgn-result-desc">{result.description}</div>
                <div className="mgn-result-stats">
                  <span className="mgn-stat-pill">🏛 {areaCount} Areas</span>
                  <span className="mgn-stat-pill">📍 {poiCount} POIs</span>
                  <span className="mgn-stat-pill">⚔ {result.random_encounters?.length ?? 0} Encounters</span>
                  <span className="mgn-stat-pill">📜 {result.lore_hooks?.length ?? 0} Hooks</span>
                </div>
                {result.atmosphere_notes && (
                  <div className="mgn-atmosphere">"{result.atmosphere_notes}"</div>
                )}
                <div className="mgn-result-actions">
                  <button
                    className="mgn-save-btn"
                    onClick={handleSave}
                    disabled={saving}
                  >
                    {saving ? '⏳ Saving…' : '💾 Save Map to Campaign'}
                  </button>
                  <button
                    className="mgn-regen-btn"
                    onClick={handleGenerate}
                    disabled={loading}
                  >
                    🔄 Regenerate
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {showSettings && <ApiKeySettings onClose={() => setShowSettings(false)} />}
    </>
  );
}

export default MapGenerator;
