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
function buildDallePrompt(r, dalleAdditions) {
  const terrain = r.terrain.join(', ');
  const bases = {
    'Region':
      `A top-down fantasy cartography map in the style of classic D&D adventure modules. Hand-drawn ink style on aged parchment. Shows ${terrain} landscape with mountains, forests, rivers. ${r.atmosphere} atmosphere. Includes space for settlements and ruins. No text labels. Bird's eye view. Detailed illustration style.`,
    'City/Town':
      `A top-down fantasy city map in classic D&D cartography style on aged parchment. Shows streets, buildings, walls, gates, a marketplace, taverns, temples. ${r.size} settlement. ${r.atmosphere} atmosphere. Hand-drawn ink illustration. No text labels.`,
    'Village':
      `A top-down fantasy village map in classic D&D cartography style on aged parchment. Shows cottages, a village square, farms, a well, a small inn. ${r.atmosphere} atmosphere. Hand-drawn ink illustration. No text labels.`,
    'Dungeon':
      `A top-down dungeon floor plan in classic D&D graph paper style. Shows rooms, corridors, doors, stairs, secret passages. ${r.atmosphere} atmosphere. Dark stone walls, torchlit rooms. Hand-drawn style. Grid visible. No text labels.`,
    'Cave System':
      `A top-down natural cave system map in classic D&D style. Shows caverns, tunnels, underground lakes, stalactites. ${r.atmosphere} atmosphere. Hand-drawn on aged parchment. No text labels.`,
    'Ruins':
      `A top-down ancient ruins map in classic D&D cartography style. Shows collapsed walls, overgrown courtyards, intact chambers, rubble. ${r.era} era ruins. ${r.atmosphere} atmosphere. Hand-drawn ink style. No text labels.`,
    'Castle/Keep':
      `A top-down castle floor plan in classic D&D style. Shows towers, great hall, dungeons, battlements, courtyards. ${r.atmosphere} atmosphere. Hand-drawn ink illustration. No text labels.`,
    'Tavern/Inn':
      `A top-down tavern interior floor plan in classic D&D style on aged parchment. Shows taproom, bar, kitchen, private rooms, cellar stairs. Warm and cozy. Hand-drawn ink. No text labels.`,
    'Temple':
      `A top-down temple interior map in classic D&D style. Shows nave, altars, side chapels, catacombs, sacred chambers. ${r.atmosphere} atmosphere. ${r.era} era architecture. Hand-drawn ink. No text labels.`,
  };
  let prompt = bases[r.mapType] ?? bases['Region'];
  if (dalleAdditions) prompt += ` ${dalleAdditions}`;
  return prompt.slice(0, 3900); // DALL-E 3 prompt limit
}

// ── Claude system/user prompts ────────────────────────────────────────────────
const CLAUDE_SYSTEM = `You are an expert AD&D 2E Dungeon Master generating detailed, atmospheric map content for Forgotten Realms campaigns.
Return ONLY valid JSON with no markdown, no code fences, no commentary, no trailing commas.`;

function buildClaudePrompt(r, numPois, parentContext) {
  const parentNote = parentContext
    ? `This map is located within/below: "${parentContext.name}" — ${parentContext.short_description || parentContext.dm_description || ''}`
    : 'This is a root-level map.';

  return `Generate a complete AD&D 2E ${r.mapType} map:
Terrain: ${r.terrain.join(', ')}
Atmosphere: ${r.atmosphere}
Era: ${r.era}
Inhabitants: ${r.inhabitants}
Size: ${r.size}
${parentNote}

Generate exactly ${numPois} points of interest spread across the map.
For region maps: include settlements, ruins, caves, encounter areas, landmarks.
For dungeon/cave/castle maps: include rooms, traps, treasures, encounters, boss areas.

Respond in JSON matching this exact schema:
{
  "title": "Evocative location name",
  "subtitle": "Brief tagline",
  "description": "2-3 sentence atmospheric overview",
  "history": "2-3 sentences about this place",
  "atmosphere_notes": "Sensory details: sounds, smells, lighting",
  "dalle_prompt_additions": "Specific visual details for image generation (max 200 chars)",
  "pois": [
    {
      "id": "poi_1",
      "name": "Location name",
      "type": "city|village|ruins|cave|dungeon|encounter|treasure|trap|npc|landmark|mystery",
      "x_percent": 45.2,
      "y_percent": 32.1,
      "is_dm_only": false,
      "short_description": "One sentence players might learn",
      "dm_description": "Full DM details (2-3 sentences)",
      "history": "Background of this specific place",
      "current_situation": "What is happening here right now",
      "encounters": "Possible monster encounters or challenges",
      "treasure": "Loot available if any (or null)",
      "secrets": "Hidden information or plot hooks",
      "can_drill_down": true,
      "drill_down_type": "dungeon|cave|city|ruins|null",
      "quest_hooks": ["Hook 1", "Hook 2"]
    }
  ],
  "random_encounter_table": [
    {"roll": "1-2", "encounter": "Description"},
    {"roll": "3-4", "encounter": "Description"},
    {"roll": "5-6", "encounter": "Description"}
  ],
  "secrets": ["Map-level secret 1"],
  "plot_hooks": ["Campaign hook 1"]
}

Rules:
- x_percent and y_percent must be between 5 and 95 (spread across the map — do NOT cluster them)
- can_drill_down: true for caves, dungeons, ruins, cities, villages
- drill_down_type: set to appropriate type if can_drill_down, otherwise null
- is_dm_only: true for traps, secrets, and hidden locations
- Include 3-6 items in random_encounter_table
- Include 1-3 secrets and 1-3 plot_hooks`;
}

// ── DALL-E generation ─────────────────────────────────────────────────────────
async function generateAndUploadImage(mapId, prompt) {
  const apiKey = getOpenAIKey();
  if (!apiKey) throw new Error('No OpenAI API key — skipping image generation.');

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
      response_format: 'b64_json',
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(err?.error?.message ?? `OpenAI ${resp.status}`);
  }
  const data = await resp.json();
  const b64  = data.data[0].b64_json;

  // Convert base64 → File
  const bytes = atob(b64);
  const arr   = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const file = new File([arr], 'map.png', { type: 'image/png' });

  // Upload to server
  const updated = await api.uploadMapImage(mapId, file);
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
  const [step,         setStep]         = useState('form'); // 'form'|'generating'|'error'
  const [contentDone,  setContentDone]  = useState(false);
  const [imageDone,    setImageDone]    = useState(false);
  const [imageSkipped, setImageSkipped] = useState(false);
  const [error,        setError]        = useState('');
  const [showSettings, setShowSettings] = useState(false);

  const setP = (key, val) => setParams(p => ({ ...p, [key]: val }));

  const toggleTerrain = (t) => setParams(p => ({
    ...p,
    terrain: p.terrain.includes(t) ? p.terrain.filter(x => x !== t) : [...p.terrain, t],
  }));

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }

    console.log('[MapGenerator] Starting generation. params:', params);
    setStep('generating');
    setContentDone(false);
    setImageDone(false);
    setImageSkipped(false);
    setError('');

    try {
      // ── Step 1: Claude content ─────────────────────────────────────────────
      const resolved = resolveParams(params);
      const numPois  = resolvePoiCount(params.poiCount);
      console.log('[MapGenerator] Step 1 — calling Claude. resolved params:', resolved, '| POI count:', numPois);

      const mapContent = await callClaude({
        systemPrompt: CLAUDE_SYSTEM,
        userPrompt:   buildClaudePrompt(resolved, numPois, parentPoiCtx),
        maxTokens:    4096,
      });
      console.log('[MapGenerator] Step 1 — Claude returned. title:', mapContent?.title, '| pois count:', mapContent?.pois?.length);
      setContentDone(true);

      if (!mapContent.title) throw new Error('AI returned invalid map data (missing title). Please try again.');

      // Normalise POI positions
      const pois = (mapContent.pois ?? []).map((p, i) => ({
        ...p,
        id:           p.id    || `poi_${i + 1}`,
        x_percent:    Math.max(5, Math.min(95, Number(p.x_percent) || (10 + i * 8))),
        y_percent:    Math.max(5, Math.min(95, Number(p.y_percent) || (10 + i * 7))),
        child_map_id: null,
      }));

      // ── Step 2: Create map record ──────────────────────────────────────────
      console.log('[MapGenerator] Step 2 — creating map record on server...');
      let map = await api.createMap({
        campaign_id:   campaignId,
        name:          mapContent.title,
        type:          toBackendType(resolved.mapType),
        parent_map_id: parentMapId,
        parent_poi_id: parentPoiId,
        data: {
          pois,
          subtitle:               mapContent.subtitle              || '',
          description:            mapContent.description           || '',
          history:                mapContent.history               || '',
          atmosphere_notes:       mapContent.atmosphere_notes      || '',
          random_encounter_table: mapContent.random_encounter_table || [],
          secrets:                mapContent.secrets               || [],
          plot_hooks:             mapContent.plot_hooks            || [],
          generated_params:       resolved,
          visible_to_players:     false,
          pins:                   [],
        },
      });
      console.log('[MapGenerator] Step 2 — map record created. id:', map?.id);

      // ── Step 3: DALL-E image (only after Claude succeeds) ──────────────────
      if (hasOpenAIKey()) {
        console.log('[MapGenerator] Step 3 — calling DALL-E for image...');
        try {
          const dallePrompt = buildDallePrompt(resolved, mapContent.dalle_prompt_additions);
          const updated = await generateAndUploadImage(map.id, dallePrompt);
          if (updated) map = updated;
          console.log('[MapGenerator] Step 3 — DALL-E image uploaded. image_url:', map?.image_url);
          setImageDone(true);
        } catch (imgErr) {
          console.warn('[MapGenerator] Step 3 — DALL-E failed (non-fatal):', imgErr.message);
          setImageSkipped(true);
        }
      } else {
        console.log('[MapGenerator] Step 3 — skipped (no OpenAI key).');
        setImageSkipped(true);
      }

      console.log('[MapGenerator] Generation complete!');
      onCreated(map);
    } catch (e) {
      console.error('[MapGenerator] Generation failed:', e.message, e);
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
                label="Forging map content…"
                subLabel="Claude is writing your map, POIs & lore (up to 30s)"
                done={contentDone}
              />
              {contentDone && (
                <ProgressRow
                  label={imageSkipped ? 'Image skipped (no OpenAI key)' : imageDone ? 'Map painted!' : 'Painting the map…'}
                  subLabel={imageSkipped ? 'Upload an image later from the map toolbar' : 'DALL·E 3 is illustrating your map (up to 30s)'}
                  done={imageDone || imageSkipped}
                  skipped={imageSkipped}
                />
              )}
              {!contentDone && (
                <div className="mgn-sub-note">Check the browser console (F12) if this takes more than 30 seconds.</div>
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
