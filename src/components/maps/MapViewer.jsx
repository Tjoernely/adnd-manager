/**
 * MapViewer — SVG diagram for AI-generated maps.
 * Renders areas as colour-coded rectangles with BFS tree layout,
 * connection lines, POI icons, and a clickable detail panel.
 *
 * Props:
 *   map          object  — map record with data.areas, data.pois, etc.
 *   isDM         bool
 *   onUpdateMap  fn(updated) — patches the map record (save via api)
 *   campaignId   string
 */
import { useState, useMemo, useCallback } from 'react';
import { api }            from '../../api/client.js';
import { callClaude, hasAnthropicKey } from '../../api/aiClient.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';

// ── Constants ─────────────────────────────────────────────────────────────────

const CELL_W  = 160;
const CELL_H  = 72;
const GAP_X   = 32;
const GAP_Y   = 60;
const PAD     = 40;

const AREA_COLORS = {
  entrance:  { fill: 'rgba(40,160,60,.28)',  stroke: '#40c050', label: '#80e090' },
  room:      { fill: 'rgba(50,100,160,.25)', stroke: '#4880c0', label: '#88aadd' },
  boss:      { fill: 'rgba(180,30,30,.28)',  stroke: '#c03030', label: '#e08080' },
  treasure:  { fill: 'rgba(180,140,20,.28)', stroke: '#c8a84b', label: '#e0c060' },
  trap:      { fill: 'rgba(190,100,20,.25)', stroke: '#c07030', label: '#d49060' },
  puzzle:    { fill: 'rgba(120,40,180,.25)', stroke: '#9040d0', label: '#b080e0' },
  corridor:  { fill: 'rgba(50,70,80,.25)',   stroke: '#4a6070', label: '#708090' },
  secret:    { fill: 'rgba(100,30,60,.25)',  stroke: '#802050', label: '#c060a0' },
  outdoor:   { fill: 'rgba(40,100,40,.25)',  stroke: '#408040', label: '#80b880' },
  other:     { fill: 'rgba(70,60,50,.25)',   stroke: '#605040', label: '#a09070' },
};

const POI_ICONS = {
  monster:  '💀', npc: '🧑', trap: '⚠', treasure: '💎',
  puzzle: '🔮', lore: '📜', hazard: '🔥',
};

// ── BFS layout ────────────────────────────────────────────────────────────────

function computeLayout(areas) {
  if (!areas || areas.length === 0) return { positions: {}, svgW: 400, svgH: 300 };

  // Build adjacency map
  const adj = {};
  areas.forEach(a => { adj[a.id] = Array.isArray(a.connections) ? a.connections : []; });

  // BFS from entrance
  const entrance = areas.find(a => a.type === 'entrance') ?? areas[0];
  const levelOf  = { [entrance.id]: 0 };
  const byLevel  = {};
  const visited  = new Set([entrance.id]);
  const queue    = [entrance.id];

  while (queue.length) {
    const id   = queue.shift();
    const lvl  = levelOf[id];
    (byLevel[lvl] ??= []).push(id);
    (adj[id] ?? []).forEach(nid => {
      const exists = areas.some(a => a.id === nid);
      if (exists && !visited.has(nid)) {
        visited.add(nid);
        levelOf[nid] = lvl + 1;
        queue.push(nid);
      }
    });
  }

  // Orphaned areas → extra row
  const orphans = areas.filter(a => !visited.has(a.id));
  if (orphans.length) {
    const nextLvl = Math.max(...Object.keys(byLevel).map(Number)) + 1;
    byLevel[nextLvl] = orphans.map(a => a.id);
  }

  // Assign x/y positions (centered per row)
  const maxPerRow = Math.max(...Object.values(byLevel).map(r => r.length));
  const canvasW   = maxPerRow * CELL_W + (maxPerRow - 1) * GAP_X;
  const positions = {};

  Object.entries(byLevel).forEach(([lvl, ids]) => {
    const rowW   = ids.length * CELL_W + (ids.length - 1) * GAP_X;
    const startX = (canvasW - rowW) / 2;
    ids.forEach((id, i) => {
      positions[id] = {
        x: startX + i * (CELL_W + GAP_X),
        y: Number(lvl) * (CELL_H + GAP_Y),
      };
    });
  });

  const maxLvl = Math.max(...Object.keys(byLevel).map(Number));
  const svgW   = canvasW + PAD * 2;
  const svgH   = (maxLvl + 1) * (CELL_H + GAP_Y) - GAP_Y + PAD * 2;

  return { positions, svgW, svgH, canvasW };
}

// Build connection edges (deduplicated)
function buildEdges(areas, positions) {
  const seen  = new Set();
  const edges = [];
  areas.forEach(a => {
    (a.connections ?? []).forEach(bid => {
      const key = [a.id, bid].sort().join('|');
      if (!seen.has(key) && positions[a.id] && positions[bid]) {
        seen.add(key);
        edges.push({ from: a.id, to: bid });
      }
    });
  });
  return edges;
}

// ── POI generation via Claude ─────────────────────────────────────────────────

const POI_SYSTEM = `You are an AD&D 2E dungeon master creating a detailed point of interest.
Return ONLY valid JSON:
{
  "name": "string",
  "type": "monster|npc|trap|treasure|puzzle|lore|hazard",
  "description": "string — 2-3 sentences with AD&D 2E mechanical detail",
  "dm_notes": "string — 1-2 sentences of tactical or story advice"
}`;

async function generatePOI(area, poiType, difficulty) {
  const prompt = `Area: ${area.name} (${area.type}) — ${area.description}
POI Type: ${poiType}
Difficulty: ${difficulty}
Generate a memorable, dangerous point of interest appropriate for AD&D 2nd Edition.`;
  return callClaude({ systemPrompt: POI_SYSTEM, userPrompt: prompt, maxTokens: 512 });
}

// ── MapViewer ─────────────────────────────────────────────────────────────────

export function MapViewer({ map, isDM, onUpdateMap, campaignId }) {
  const data           = map.data ?? {};
  const allAreas       = Array.isArray(data.areas) ? data.areas : [];
  const allPois        = Array.isArray(data.pois)  ? data.pois  : [];

  const [playerView,   setPlayerView]   = useState(false);
  const [selectedArea, setSelectedArea] = useState(null);
  const [genPoiType,   setGenPoiType]   = useState('monster');
  const [genDifficulty,setGenDifficulty]= useState('Medium');
  const [genLoading,   setGenLoading]   = useState(false);
  const [genError,     setGenError]     = useState('');
  const [showPoiForm,  setShowPoiForm]  = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [expandSection,setExpandSection]= useState('');

  // Apply player-view filter
  const areas = playerView
    ? allAreas.filter(a => !a.is_hidden)
    : allAreas;
  const pois = playerView
    ? allPois.filter(p => !p.is_hidden)
    : allPois;

  // Layout
  const { positions, svgW, svgH } = useMemo(() => computeLayout(areas), [areas]);
  const edges = useMemo(() => buildEdges(areas, positions), [areas, positions]);

  // POIs grouped by area
  const poisByArea = useMemo(() => {
    const m = {};
    pois.forEach(p => { (m[p.area_id] ??= []).push(p); });
    return m;
  }, [pois]);

  const selectedAreaData = allAreas.find(a => a.id === selectedArea) ?? null;
  const selectedPois     = allPois.filter(p => p.area_id === selectedArea);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleAreaClick = (areaId) => {
    setSelectedArea(prev => prev === areaId ? null : areaId);
    setShowPoiForm(false);
    setGenError('');
  };

  const handleGeneratePOI = useCallback(async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }
    if (!selectedAreaData) return;
    setGenLoading(true);
    setGenError('');
    try {
      const poiData = await generatePOI(selectedAreaData, genPoiType, genDifficulty);
      const newPoi = {
        id:          `p_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        area_id:     selectedArea,
        name:        poiData.name    || 'Unknown POI',
        type:        poiData.type    || genPoiType,
        description: poiData.description || '',
        dm_notes:    poiData.dm_notes    || '',
        is_hidden:   true,
      };
      const updatedPois = [...allPois, newPoi];
      const updated = await api.updateMap(map.id, {
        name:      map.name,
        type:      map.type,
        image_url: map.image_url,
        data:      { ...data, pois: updatedPois },
      });
      onUpdateMap(updated);
      setShowPoiForm(false);
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenLoading(false);
    }
  }, [selectedAreaData, selectedArea, genPoiType, genDifficulty, allPois, data, map, onUpdateMap]);

  const handleDeletePoi = useCallback(async (poiId) => {
    const updatedPois = allPois.filter(p => p.id !== poiId);
    const updated = await api.updateMap(map.id, {
      name: map.name, type: map.type, image_url: map.image_url,
      data: { ...data, pois: updatedPois },
    });
    onUpdateMap(updated);
  }, [allPois, data, map, onUpdateMap]);

  const handleTogglePoiVisibility = useCallback(async (poiId) => {
    const updatedPois = allPois.map(p =>
      p.id === poiId ? { ...p, is_hidden: !p.is_hidden } : p
    );
    const updated = await api.updateMap(map.id, {
      name: map.name, type: map.type, image_url: map.image_url,
      data: { ...data, pois: updatedPois },
    });
    onUpdateMap(updated);
  }, [allPois, data, map, onUpdateMap]);

  // ── Legend colours ─────────────────────────────────────────────────────────

  const usedTypes = [...new Set(areas.map(a => a.type).filter(Boolean))];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="mvr-root">

      {/* ── Viewer toolbar ── */}
      <div className="mvr-toolbar">
        <div className="mvr-legend">
          {usedTypes.map(t => {
            const c = AREA_COLORS[t] ?? AREA_COLORS.other;
            return (
              <span key={t} className="mvr-legend-item">
                <span className="mvr-legend-dot" style={{ background: c.stroke }} />
                <span style={{ color: c.label }}>{t.charAt(0).toUpperCase() + t.slice(1)}</span>
              </span>
            );
          })}
        </div>
        {isDM && (
          <button
            className={`mvr-view-btn${playerView ? ' mvr-view-btn--player' : ''}`}
            onClick={() => setPlayerView(v => !v)}
            title="Toggle player view"
          >
            {playerView ? '🔒 DM View' : '👁 Player View'}
          </button>
        )}
      </div>

      {/* ── Main layout: SVG + detail panel ── */}
      <div className="mvr-layout">

        {/* SVG diagram */}
        <div className="mvr-svg-wrap">
          <svg
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="mvr-svg"
            style={{ minWidth: Math.min(svgW, 800), minHeight: Math.min(svgH, 600) }}
          >
            {/* Connection lines */}
            <g className="mvr-edges">
              {edges.map(({ from, to }) => {
                const fp = positions[from];
                const tp = positions[to];
                if (!fp || !tp) return null;
                const x1 = PAD + fp.x + CELL_W / 2;
                const y1 = PAD + fp.y + CELL_H;
                const x2 = PAD + tp.x + CELL_W / 2;
                const y2 = PAD + tp.y;
                const midY = (y1 + y2) / 2;
                return (
                  <path
                    key={`${from}-${to}`}
                    d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                    fill="none"
                    stroke="rgba(200,168,75,.25)"
                    strokeWidth="1.5"
                  />
                );
              })}
              {/* Same-row connections — horizontal lines */}
              {edges.map(({ from, to }) => {
                const fp = positions[from];
                const tp = positions[to];
                if (!fp || !tp) return null;
                if (Math.abs(fp.y - tp.y) > 5) return null; // skip vertical ones (handled above)
                const x1 = PAD + fp.x + CELL_W;
                const y1 = PAD + fp.y + CELL_H / 2;
                const x2 = PAD + tp.x;
                const y2 = PAD + tp.y + CELL_H / 2;
                return (
                  <line
                    key={`h-${from}-${to}`}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke="rgba(200,168,75,.25)"
                    strokeWidth="1.5"
                  />
                );
              })}
            </g>

            {/* Area rectangles */}
            <g className="mvr-areas">
              {areas.map(area => {
                const pos   = positions[area.id];
                if (!pos) return null;
                const c     = AREA_COLORS[area.type] ?? AREA_COLORS.other;
                const px    = PAD + pos.x;
                const py    = PAD + pos.y;
                const isSelected = area.id === selectedArea;
                const areaPois   = poisByArea[area.id] ?? [];

                return (
                  <g key={area.id} onClick={() => handleAreaClick(area.id)} style={{ cursor: 'pointer' }}>
                    {/* Shadow */}
                    <rect
                      x={px + 3} y={py + 4}
                      width={CELL_W} height={CELL_H}
                      rx={6} fill="rgba(0,0,0,.5)"
                    />
                    {/* Main rect */}
                    <rect
                      x={px} y={py}
                      width={CELL_W} height={CELL_H}
                      rx={6}
                      fill={c.fill}
                      stroke={isSelected ? '#c8a84b' : c.stroke}
                      strokeWidth={isSelected ? 2 : 1}
                    />
                    {/* Area name */}
                    <text
                      x={px + CELL_W / 2}
                      y={py + CELL_H / 2 - (areaPois.length ? 8 : 0)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={isSelected ? '#c8a84b' : c.label}
                      fontSize={area.name.length > 16 ? 9 : 11}
                      fontFamily="'Palatino Linotype', serif"
                      fontWeight={isSelected ? 'bold' : 'normal'}
                    >
                      {area.name}
                    </text>
                    {/* Type label */}
                    <text
                      x={px + CELL_W / 2}
                      y={py + CELL_H / 2 + (areaPois.length ? 8 : 12)}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fill={c.stroke}
                      fontSize={8}
                      fontFamily="'Palatino Linotype', serif"
                      opacity={0.7}
                      letterSpacing={1}
                    >
                      {area.type.toUpperCase()}
                    </text>
                    {/* POI icons row */}
                    {areaPois.length > 0 && (
                      <text
                        x={px + CELL_W / 2}
                        y={py + CELL_H - 8}
                        textAnchor="middle"
                        fontSize={10}
                      >
                        {areaPois.slice(0, 5).map(p => POI_ICONS[p.type] ?? '📍').join(' ')}
                      </text>
                    )}
                    {/* Hidden badge */}
                    {area.is_hidden && isDM && (
                      <text x={px + CELL_W - 6} y={py + 12} textAnchor="end" fontSize={8} fill="#806080">🔒</text>
                    )}
                    {/* Selection glow */}
                    {isSelected && (
                      <rect
                        x={px - 2} y={py - 2}
                        width={CELL_W + 4} height={CELL_H + 4}
                        rx={8} fill="none"
                        stroke="rgba(200,168,75,.4)"
                        strokeWidth={1}
                      />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        {/* ── Detail panel ── */}
        {selectedAreaData && (
          <aside className="mvr-detail">
            <div className="mvr-detail-header">
              <div className="mvr-detail-name">{selectedAreaData.name}</div>
              <span
                className="mvr-detail-type"
                style={{ color: (AREA_COLORS[selectedAreaData.type] ?? AREA_COLORS.other).label }}
              >
                {selectedAreaData.type}
              </span>
              <button className="mvr-detail-close" onClick={() => setSelectedArea(null)}>✕</button>
            </div>

            <div className="mvr-detail-body">
              <p className="mvr-detail-desc">{selectedAreaData.description}</p>

              {/* POIs */}
              {selectedPois.length > 0 && (
                <div className="mvr-poi-list">
                  <div className="mvr-subsection-title">Points of Interest</div>
                  {selectedPois.map(poi => (
                    <div key={poi.id} className={`mvr-poi-item${poi.is_hidden && !playerView ? ' mvr-poi-item--dm' : ''}`}>
                      <div className="mvr-poi-header">
                        <span className="mvr-poi-icon">{POI_ICONS[poi.type] ?? '📍'}</span>
                        <span className="mvr-poi-name">{poi.name}</span>
                        <span className="mvr-poi-type">{poi.type}</span>
                        {isDM && (
                          <div className="mvr-poi-actions">
                            <button
                              className="mvr-poi-btn"
                              onClick={() => handleTogglePoiVisibility(poi.id)}
                              title="Toggle visibility"
                            >
                              {poi.is_hidden ? '🔒' : '👁'}
                            </button>
                            <button
                              className="mvr-poi-btn mvr-poi-btn--del"
                              onClick={() => handleDeletePoi(poi.id)}
                              title="Delete POI"
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </div>
                      <p className="mvr-poi-desc">{poi.description}</p>
                      {isDM && poi.dm_notes && (
                        <p className="mvr-poi-notes">📋 {poi.dm_notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Generate POI */}
              {isDM && !showPoiForm && (
                <button
                  className="mvr-gen-poi-btn"
                  onClick={() => setShowPoiForm(true)}
                >
                  ✦ Generate POI
                </button>
              )}
              {isDM && showPoiForm && (
                <div className="mvr-gen-poi-form">
                  <div className="mvr-subsection-title">Generate POI for {selectedAreaData.name}</div>
                  <div className="mvr-gen-poi-row">
                    <div className="mvr-gen-poi-field">
                      <label className="mvr-gen-poi-label">Type</label>
                      <select
                        className="mvr-gen-poi-select"
                        value={genPoiType}
                        onChange={e => setGenPoiType(e.target.value)}
                        disabled={genLoading}
                      >
                        {Object.keys(POI_ICONS).map(t => (
                          <option key={t} value={t}>{POI_ICONS[t]} {t.charAt(0).toUpperCase()+t.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="mvr-gen-poi-field">
                      <label className="mvr-gen-poi-label">Difficulty</label>
                      <select
                        className="mvr-gen-poi-select"
                        value={genDifficulty}
                        onChange={e => setGenDifficulty(e.target.value)}
                        disabled={genLoading}
                      >
                        {['Easy','Medium','Hard','Deadly'].map(d => (
                          <option key={d}>{d}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {genError && <div className="mvr-gen-error">{genError}</div>}
                  <div className="mvr-gen-poi-btns">
                    <button className="mvr-gen-poi-go" onClick={handleGeneratePOI} disabled={genLoading}>
                      {genLoading ? '⏳ Generating…' : '✦ Generate'}
                    </button>
                    <button className="mvr-gen-poi-cancel" onClick={() => { setShowPoiForm(false); setGenError(''); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Map lore */}
              {(data.history || data.atmosphere_notes || data.suggested_music) && (
                <div className="mvr-lore-section">
                  <button
                    className="mvr-lore-toggle"
                    onClick={() => setExpandSection(s => s === 'lore' ? '' : 'lore')}
                  >
                    📖 Map Lore {expandSection === 'lore' ? '▲' : '▼'}
                  </button>
                  {expandSection === 'lore' && (
                    <div className="mvr-lore-body">
                      {data.history && (
                        <>
                          <div className="mvr-subsection-title">History</div>
                          <p className="mvr-lore-text">{data.history}</p>
                        </>
                      )}
                      {data.atmosphere_notes && (
                        <>
                          <div className="mvr-subsection-title">Atmosphere</div>
                          <p className="mvr-lore-text">{data.atmosphere_notes}</p>
                        </>
                      )}
                      {data.suggested_music && (
                        <>
                          <div className="mvr-subsection-title">Suggested Music</div>
                          <p className="mvr-lore-text">{data.suggested_music}</p>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Lore hooks (DM) */}
              {isDM && (data.lore_hooks?.length ?? 0) > 0 && (
                <div className="mvr-lore-section">
                  <button
                    className="mvr-lore-toggle"
                    onClick={() => setExpandSection(s => s === 'hooks' ? '' : 'hooks')}
                  >
                    📜 Lore Hooks {expandSection === 'hooks' ? '▲' : '▼'}
                  </button>
                  {expandSection === 'hooks' && (
                    <div className="mvr-lore-body">
                      {data.lore_hooks.map((h, i) => (
                        <p key={i} className="mvr-hook-item">• {h}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Secrets (DM only) */}
              {isDM && (data.secrets?.length ?? 0) > 0 && (
                <div className="mvr-lore-section mvr-lore-section--secrets">
                  <button
                    className="mvr-lore-toggle"
                    onClick={() => setExpandSection(s => s === 'secrets' ? '' : 'secrets')}
                  >
                    🔒 Secrets {expandSection === 'secrets' ? '▲' : '▼'}
                  </button>
                  {expandSection === 'secrets' && (
                    <div className="mvr-lore-body">
                      {data.secrets.map((s, i) => (
                        <p key={i} className="mvr-secret-item">• {s}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Random encounters (DM) */}
              {isDM && (data.random_encounters?.length ?? 0) > 0 && (
                <div className="mvr-lore-section">
                  <button
                    className="mvr-lore-toggle"
                    onClick={() => setExpandSection(s => s === 'enc' ? '' : 'enc')}
                  >
                    ⚔ Random Encounters {expandSection === 'enc' ? '▲' : '▼'}
                  </button>
                  {expandSection === 'enc' && (
                    <div className="mvr-lore-body">
                      {data.random_encounters.map((e, i) => (
                        <p key={i} className="mvr-hook-item">• {e}</p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </aside>
        )}

        {/* No area selected placeholder */}
        {!selectedAreaData && (
          <div className="mvr-no-selection">
            <div className="mvr-no-sel-icon">🗺</div>
            <div>Click an area to view details</div>
            {isDM && <div className="mvr-no-sel-hint">DMs can generate POIs for any area</div>}
          </div>
        )}
      </div>

      {showSettings && <ApiKeySettings onClose={() => setShowSettings(false)} />}
    </div>
  );
}

export default MapViewer;
