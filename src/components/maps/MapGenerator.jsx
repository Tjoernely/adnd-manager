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
import { useState } from 'react';
import { api }             from '../../api/client.js';
import { callClaude, hasAnthropicKey, getOpenAIKey, hasOpenAIKey } from '../../api/aiClient.js';
import { ApiKeySettings }  from '../ui/ApiKeySettings.jsx';

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
  const resolvedType = p.mapType === 'Random' ? pickRandom(MAP_TYPES.slice(1)) : p.mapType;
  return {
    mapType:     resolvedType,
    size:        p.size        === 'Random' ? pickRandom(MAP_SIZES.slice(1))     : p.size,
    terrain:     p.terrain.length > 0 ? p.terrain : [pickRandom(TERRAIN_OPTIONS)],
    atmosphere:  p.atmosphere  === 'Random' ? pickRandom(ATMOSPHERES.slice(1))   : p.atmosphere,
    era:         p.era         === 'Random' ? pickRandom(ERAS.slice(1))          : p.era,
    inhabitants: p.inhabitants === 'Random' ? pickRandom(INHABITANTS.slice(1))   : p.inhabitants,
    poiCount:    p.poiCount,
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

// ── DALL-E prompt builders ────────────────────────────────────────────────────
function buildDallePrompt(r) {
  const typeDescriptions = {
    'Region':     'top-down regional fantasy cartography map',
    'City/Town':  'top-down fantasy city map with streets and buildings',
    'Village':    'top-down fantasy village map with cottages and farms',
    'Dungeon':    'top-down dungeon floor plan, rooms and corridors',
    'Cave System':'top-down natural cave system map',
    'Ruins':      'top-down ancient ruins map, collapsed walls and rubble',
    'Castle/Keep':'top-down castle and keep floor plan',
    'Tavern/Inn': 'top-down tavern interior floor plan',
    'Temple':     'top-down temple interior map',
  };
  const terrainStr = Array.isArray(r.terrain) ? r.terrain.slice(0, 2).join(', ') : (r.terrain ?? '');
  return [
    `A ${typeDescriptions[r.mapType] || 'fantasy map'},`,
    `hand-drawn ink style on aged parchment.`,
    `Forgotten Realms / Faerûn setting.`,
    terrainStr   ? `Terrain: ${terrainStr}.`          : '',
    r.atmosphere ? `${r.atmosphere} atmosphere.`       : '',
    `Classic D&D adventure module cartography style.`,
    `No text or labels. Bird's eye view.`,
    `Highly detailed illustration.`,
  ].filter(Boolean).join(' ').substring(0, 800);
}

// ── Claude system/user prompts (split into two smaller calls) ─────────────────
const CLAUDE_SYSTEM = `You are an expert AD&D 2nd Edition Dungeon Master running a campaign in the Forgotten Realms (Faerûn). Generate vivid, lore-accurate locations that fit the Forgotten Realms setting — referencing real FR locations, factions, deities and history where appropriate. Respond with valid JSON only, no markdown.`;

const FR_CONTEXT = `Setting: Forgotten Realms / Faerûn.
Use appropriate FR place names, factions (Zhentarim, Harpers, Lords' Alliance, Emerald Enclave, Order of the Gauntlet), deities (Mystra, Tempus, Bane, Selûne, Tymora etc.), and lore.
Reference real FR regions when appropriate based on terrain:
- Mountains → Spine of the World, Thunder Peaks, or Graypeaks
- Forest → Cormanthor, Neverwinter Wood, or High Forest
- Coastal → Sword Coast, Sea of Fallen Stars
- Desert → Anauroch, Calimshan
- Swamp → Lizard Marsh, Vast Swamp
- Underground → Underdark, Undermountain`;

function parentNote(ctx) {
  return ctx
    ? `Context: this map is located within/below "${ctx.name}" — ${ctx.short_description || ctx.dm_description || '(no description)'}`
    : '';
}

/** CALL 1 — map metadata only. Fast, ~800-1200 tokens output. */
function buildMetadataPrompt(r, parentCtx) {
  return `Generate metadata for an AD&D 2E ${r.mapType} map.
Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Era: ${r.era} | Inhabitants: ${r.inhabitants} | Size: ${r.size}
${parentNote(parentCtx)}
${FR_CONTEXT}

Respond with ONLY this JSON object:
{
  "title": "Evocative Forgotten Realms location name (3-5 words)",
  "subtitle": "Atmospheric tagline (5-8 words)",
  "description": "2 sentence atmospheric overview referencing FR lore",
  "history": "2 sentences of FR-appropriate backstory",
  "atmosphere_notes": "One sentence: sounds, smells, lighting",
  "dalle_prompt_additions": "Key visual details for image, max 100 chars"
}`;
}

/** CALL 2 — POIs + encounter table. Uses title from call 1 for context. */
function buildPoisPrompt(r, numPois, meta, parentCtx) {
  const typeHint = ['Region', 'City/Town', 'Village'].includes(r.mapType)
    ? 'For this region map include a variety of: settlements, ruins, caves, encounter areas, landmarks.'
    : 'For this interior/dungeon map include: rooms, traps, treasures, encounters, boss area.';
  return `For the Forgotten Realms AD&D 2E ${r.mapType} map "${meta.title}":
Terrain: ${r.terrain.join(', ')} | Atmosphere: ${r.atmosphere} | Inhabitants: ${r.inhabitants}
${parentNote(parentCtx)}
${typeHint}
Use FR-appropriate names, factions and lore for all POIs.

Generate exactly ${numPois} points of interest spread across the map.

Respond with ONLY this JSON object:
{
  "pois": [
    {
      "id": "poi_1",
      "name": "FR-appropriate location name",
      "type": "city|village|ruins|cave|dungeon|encounter|treasure|trap|npc|landmark|mystery",
      "x_percent": 20,
      "y_percent": 35,
      "is_dm_only": false,
      "short_description": "One sentence players might learn",
      "dm_description": "1-2 sentence DM detail with FR lore",
      "history": "One sentence FR-appropriate backstory",
      "current_situation": "One sentence current state",
      "encounters": "Possible encounter (or null)",
      "treasure": "Loot if any (or null)",
      "secrets": "Hidden info or FR plot hook (or null)",
      "can_drill_down": true,
      "drill_down_type": "dungeon|cave|city|ruins|null",
      "quest_hooks": ["FR-themed hook"]
    }
  ],
  "random_encounter_table": [
    {"roll": "1-2", "encounter": "FR-appropriate encounter"},
    {"roll": "3-4", "encounter": "FR-appropriate encounter"},
    {"roll": "5-6", "encounter": "FR-appropriate encounter"}
  ],
  "secrets": ["One FR-flavoured map-level secret"],
  "plot_hooks": ["One Forgotten Realms campaign hook"]
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
      model:           'dall-e-3',
      prompt,
      n:               1,
      size:            '1024x1024',
      quality:         'standard',
      style:           'vivid',
      response_format: 'url',
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

async function generateAndSaveImage(map, prompt) {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('No OpenAI API key — skipping image generation.');

  console.log('[Map] Calling DALL-E 3 for map image...');

  let data;
  try {
    data = await callDalleOnce(prompt, apiKey);
  } catch (firstErr) {
    // Retry once on server_error after 3 s
    if (firstErr.code === 'server_error' || firstErr.message?.includes('server_error')) {
      console.warn('[Map] DALL-E server_error — retrying in 3 s...');
      await new Promise(r => setTimeout(r, 3000));
      data = await callDalleOnce(prompt, apiKey);
    } else {
      throw firstErr;
    }
  }

  const imageUrl = data?.data?.[0]?.url;
  if (!imageUrl) throw new Error('DALL-E returned no image URL.');

  console.log('[Map] DALL-E URL received:', imageUrl);

  // Persist URL to backend (image_url column + data.imageUrl for redundancy)
  const updated = await api.updateMap(map.id, {
    name:      map.name,
    type:      map.type,
    image_url: imageUrl,
    data:      { ...map.data, imageUrl },
  });

  console.log('[Map] Map record updated with image URL — id:', updated?.id);
  return updated;
}

// ── MapGenerator Component ────────────────────────────────────────────────────
export function MapGenerator({
  campaignId,
  onClose,
  onCreated,
  parentMapId  = null,
  parentPoiId  = null,
  parentPoiCtx = null,
  presetType   = null,
}) {
  const [params, setParams] = useState({
    mapType:     presetType ?? 'Random',
    size:        'Random',
    terrain:     [],
    atmosphere:  'Random',
    era:         'Random',
    inhabitants: 'Random',
    poiCount:    'Random (3-8)',
  });
  const [step,        setStep]        = useState('form'); // 'form'|'generating'|'error'
  const [step1Done,   setStep1Done]   = useState(false); // metadata call
  const [step2Done,   setStep2Done]   = useState(false); // POI call
  const [step3Done,   setStep3Done]   = useState(false); // DALL-E image
  const [step3Skip,   setStep3Skip]   = useState(false); // no OpenAI key / failed
  const [error,       setError]       = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const setP = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const toggleTerrain = (t) => setParams(p => ({
    ...p,
    terrain: p.terrain.includes(t) ? p.terrain.filter(x => x !== t) : [...p.terrain, t],
  }));

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }

    console.log('[MapGenerator] ── Starting generation ──');
    console.log('[MapGenerator] Params:', params);
    setStep('generating');
    setStep1Done(false);
    setStep2Done(false);
    setStep3Done(false);
    setStep3Skip(false);
    setError('');

    try {
      const resolved = resolveParams(params);
      const numPois  = resolvePoiCount(params.poiCount);
      console.log('[MapGenerator] Resolved:', resolved, '| POI count:', numPois);

      // ── Step 1/3: Map metadata (Claude) ───────────────────────────────────
      console.log('[MapGenerator] Step 1/3 — requesting map metadata from Claude...');
      const meta = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildMetadataPrompt(resolved, parentPoiCtx),
        maxTokens:    1200,
      });
      console.log('[MapGenerator] Step 1/3 done — title:', meta?.title);

      if (!meta?.title) throw new Error('AI returned invalid map metadata (missing title). Please try again.');
      setStep1Done(true);

      // ── Step 2/3: POIs + encounter table (Claude) ─────────────────────────
      console.log('[MapGenerator] Step 2/3 — requesting POIs from Claude...');
      const poiData = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildPoisPrompt(resolved, numPois, meta, parentPoiCtx),
        maxTokens:    2000,
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

      // ── Create map record (server) ─────────────────────────────────────────
      console.log('[MapGenerator] Creating map record on server...');
      let map = await api.createMap({
        campaign_id:   campaignId,
        name:          meta.title,
        type:          toBackendType(resolved.mapType),
        parent_map_id: parentMapId,
        parent_poi_id: parentPoiId,
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
        },
      });
      console.log('[MapGenerator] Map record created — id:', map?.id);

      // ── Step 3/3: DALL-E image (only after both Claude calls succeed) ──────
      if (hasOpenAIKey()) {
        console.log('[MapGenerator] Step 3/3 — calling DALL-E...');
        try {
          const dallePrompt = buildDallePrompt(resolved);
          const updated = await generateAndSaveImage(map, dallePrompt);
          if (updated) map = updated;
          console.log('[MapGenerator] Step 3/3 done — image_url:', map?.image_url);
          setStep3Done(true);
        } catch (imgErr) {
          console.warn('[MapGenerator] Step 3/3 — DALL-E failed (non-fatal):', imgErr.message);
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
                {isDrillDown ? '🔽 Generate Sub-Map' : '✦ AI Map Generator'}
              </div>
              {isDrillDown && parentPoiCtx && (
                <div className="mgn-subtitle">
                  From: {parentPoiCtx.name} ({parentPoiCtx.type})
                </div>
              )}
            </div>
            <button className="mgn-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* Form */}
          {step === 'form' && (
            <div className="mgn-body">
              <div className="mgn-options-grid">
                {/* Map Type */}
                <div className="mgn-field">
                  <div className="mgn-field-label">Map Type</div>
                  <select className="mgn-select" value={params.mapType} onChange={e => setP('mapType', e.target.value)}>
                    {MAP_TYPES.map(o => <option key={o}>{o}</option>)}
                  </select>
                </div>

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

              {/* Terrain multi-select */}
              <div className="mgn-field">
                <div className="mgn-field-label">Terrain (pick up to 3 — leave empty for Random)</div>
                <div className="mgn-terrain-grid">
                  {TERRAIN_OPTIONS.map(t => (
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

              {!hasOpenAIKey() && (
                <div className="mgn-warn">
                  ⚠ No OpenAI key — map will be created without a visual image.
                  You can upload an image later.
                  <button className="mgn-warn-link" onClick={() => setShowSettings(true)}>Add key →</button>
                </div>
              )}

              <button className="mgn-generate-btn" onClick={handleGenerate}>
                {isDrillDown ? '✦ Generate Sub-Map' : '✦ Generate Map'}
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
                  label="Step 2/3: Generating points of interest…"
                  subLabel="Claude is placing POIs, encounters & lore"
                  done={step2Done}
                />
              )}
              {step2Done && (
                <ProgressRow
                  label={
                    step3Skip ? 'Step 3/3: Image skipped (no OpenAI key)' :
                    step3Done ? 'Step 3/3: Map painted!' :
                    'Step 3/3: Painting the map image…'
                  }
                  subLabel={
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
