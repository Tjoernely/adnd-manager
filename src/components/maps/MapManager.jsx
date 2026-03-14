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
import './MapManager.css';

// ── POI type catalogue ────────────────────────────────────────────────────────
const POI_TYPES = {
  city:      { icon: '🏰', color: '#c8a84b', pulse: false, label: 'City/Town' },
  village:   { icon: '🏘', color: '#d4b060', pulse: false, label: 'Village'   },
  encounter: { icon: '⚔',  color: '#c03030', pulse: true,  label: 'Encounter' },
  dungeon:   { icon: '💀', color: '#901818', pulse: true,  label: 'Dungeon'   },
  ruins:     { icon: '🏚', color: '#806030', pulse: false, label: 'Ruins'     },
  cave:      { icon: '🕳', color: '#405060', pulse: false, label: 'Cave'      },
  treasure:  { icon: '💰', color: '#e0c000', pulse: true,  label: 'Treasure'  },
  trap:      { icon: '⚠',  color: '#d07020', pulse: false, label: 'Trap'      },
  npc:       { icon: '🧙', color: '#9040c0', pulse: false, label: 'NPC'       },
  landmark:  { icon: '🌿', color: '#406040', pulse: false, label: 'Landmark'  },
  mystery:   { icon: '❓', color: '#c0c0c0', pulse: false, label: 'Mystery'   },
  quest:     { icon: '📜', color: '#4060c0', pulse: false, label: 'Quest Hook'},
};

const MAP_TYPE_LABELS = {
  dungeon:'🏚 Dungeon', world:'🌍 World', region:'🗾 Region',
  city:'🏙 City', town:'🏘 Town', interior:'🏛 Interior',
  encounter:'⚔ Encounter', other:'📍 Other',
};

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

// ── MapManager (root) ─────────────────────────────────────────────────────────
export function MapManager({ campaignId, isDM, isOpen, onClose }) {
  const [maps,          setMaps]          = useState([]);
  const [activeMapId,   setActiveMapId]   = useState(null);
  const [selectedPoiId, setSelectedPoiId] = useState(null);
  const [playerView,    setPlayerView]    = useState(false);
  const [addPoiMode,    setAddPoiMode]    = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [genContext,    setGenContext]    = useState(null); // { parentMapId, parentPoiId, parentPoiCtx, presetType }
  const [showApiKeys,   setShowApiKeys]   = useState(false);
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [savingPoi,     setSavingPoi]     = useState(false);
  const [uploadingImg,  setUploadingImg]  = useState(false);
  const [randEnc,       setRandEnc]       = useState(null);
  const fileRef = useRef(null);

  const activeMap  = maps.find(m => m.id === activeMapId) ?? null;
  const pois       = (activeMap?.data?.pois ?? []).filter(p =>
    playerView ? !p.is_dm_only : true
  );
  const selectedPoi = pois.find(p => p.id === selectedPoiId) ?? null;
  const ancestors   = useMemo(() => getAncestors(maps, activeMapId), [maps, activeMapId]);
  const { roots, children } = useMemo(() => buildTree(maps), [maps]);

  // ── Load ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !campaignId) return;
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
  }, [isOpen, campaignId]);

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

  // ── Add POI by clicking map ──────────────────────────────────────────────────
  const handleMapClickForPoi = useCallback((xPct, yPct) => {
    if (!isDM || !addPoiMode || !activeMap) return;
    const newPoi = {
      id:                `poi_${Date.now()}`,
      name:              'New Location',
      type:              'mystery',
      x_percent:         xPct,
      y_percent:         yPct,
      is_dm_only:        true,
      short_description: '',
      dm_description:    '',
      history:           '',
      current_situation: '',
      encounters:        '',
      treasure:          null,
      secrets:           '',
      can_drill_down:    false,
      drill_down_type:   null,
      quest_hooks:       [],
      child_map_id:      null,
    };
    const newPois = [...(activeMap.data?.pois ?? []), newPoi];
    savePois(newPois);
    setSelectedPoiId(newPoi.id);
    setAddPoiMode(false);
  }, [isDM, addPoiMode, activeMap, savePois]);

  // ── Delete POI ───────────────────────────────────────────────────────────────
  const handleDeletePoi = useCallback((poiId) => {
    if (!activeMap) return;
    const newPois = (activeMap.data?.pois ?? []).filter(p => p.id !== poiId);
    savePois(newPois);
    if (selectedPoiId === poiId) setSelectedPoiId(null);
  }, [activeMap, savePois, selectedPoiId]);

  // ── Update single POI field(s) ───────────────────────────────────────────────
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

  // ── Drill-down sub-map ───────────────────────────────────────────────────────
  const handleDrillDown = useCallback((poi) => {
    setGenContext({
      parentMapId:  activeMapId,
      parentPoiId:  poi.id,
      parentPoiCtx: poi,
      presetType:   poi.drill_down_type ?? null,
    });
    setShowGenerator(true);
  }, [activeMapId]);

  // ── After map created ────────────────────────────────────────────────────────
  const handleMapCreated = useCallback((newMap) => {
    setMaps(prev => [...prev, newMap]);
    setActiveMapId(newMap.id);
    setSelectedPoiId(null);
    setShowGenerator(false);
    // If this was a drill-down, update the parent POI with child_map_id
    if (genContext?.parentMapId && genContext?.parentPoiId) {
      const parentMap = maps.find(m => m.id === genContext.parentMapId);
      if (parentMap) {
        const newPois = (parentMap.data?.pois ?? []).map(p =>
          p.id === genContext.parentPoiId ? { ...p, child_map_id: newMap.id } : p
        );
        api.updateMap(parentMap.id, {
          name: parentMap.name, type: parentMap.type, image_url: parentMap.image_url,
          data: { ...parentMap.data, pois: newPois },
        }).then(updated => patchMap(updated)).catch(() => {});
      }
    }
    setGenContext(null);
  }, [genContext, maps, patchMap]);

  // ── Navigate to map (e.g. from POI child_map_id link) ───────────────────────
  const navigateToMap = useCallback((mapId) => {
    setActiveMapId(mapId);
    setSelectedPoiId(null);
  }, []);

  if (!isOpen) return null;

  return (
    <div className="mm-backdrop" onClick={onClose}>
      <div className="mm-shell" onClick={e => e.stopPropagation()}>

        {/* ── Left sidebar ── */}
        <aside className="mm-sidebar">
          <div className="mm-sidebar-header">
            <span className="mm-sidebar-title">🗺 Maps</span>
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
                key={m.id}
                map={m}
                allMaps={maps}
                activeMapId={activeMapId}
                children_fn={children}
                onSelect={navigateToMap}
                depth={0}
              />
            ))}
          </div>

          {/* Hidden file input for image upload */}
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
                {/* Breadcrumb */}
                <div className="mm-breadcrumb">
                  {ancestors.map((a, i) => (
                    <span key={a.id} className="mm-breadcrumb-item">
                      <button className="mm-breadcrumb-btn" onClick={() => navigateToMap(a.id)}>
                        {a.name}
                      </button>
                      <span className="mm-breadcrumb-sep">›</span>
                    </span>
                  ))}
                  <span className="mm-breadcrumb-current">{activeMap.name}</span>
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
                  <button className="mm-btn" onClick={handleRandomEncounter} title="Roll random encounter">
                    🎲 Encounter
                  </button>
                  {isDM && (
                    <>
                      <button className="mm-btn mm-btn--ai"
                        onClick={() => { setGenContext(null); setShowGenerator(true); }}
                        title="Generate a new map">
                        ✦ New Map
                      </button>
                      <button
                        className={`mm-btn${activeMap.data?.visible_to_players ? ' mm-btn--shared' : ''}`}
                        onClick={toggleMapVisibility}
                        title="Toggle player visibility"
                      >
                        {activeMap.data?.visible_to_players ? '👁 Shared' : '🔒 DM Only'}
                      </button>
                      <button className="mm-btn" onClick={() => fileRef.current?.click()} disabled={uploadingImg}
                        title="Upload or replace map image">
                        {uploadingImg ? '⏳' : '🖼 Image'}
                      </button>
                      <button className="mm-btn mm-btn--danger" onClick={handleDeleteMap} title="Delete map">🗑</button>
                    </>
                  )}
                  <button
                    className={`mm-btn${playerView ? ' mm-btn--player' : ''}`}
                    onClick={() => setPlayerView(v => !v)}
                    title="Toggle player / DM view"
                  >
                    {playerView ? '🔒 DM View' : '👁 Player View'}
                  </button>
                  {savingPoi && <span className="mm-saving">Saving…</span>}
                </div>
              </div>

              {/* Map subtitle */}
              {activeMap.data?.subtitle && (
                <div className="mm-map-subtitle">{activeMap.data.subtitle}</div>
              )}

              {/* Random encounter banner */}
              {randEnc && (
                <div className="mm-rand-enc" onClick={() => setRandEnc(null)}>
                  <span className="mm-rand-enc-roll">⚔ {randEnc.roll}</span>
                  <span className="mm-rand-enc-text">{randEnc.encounter}</span>
                  <span className="mm-rand-enc-close">✕</span>
                </div>
              )}

              {/* Map canvas + POI panel */}
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

                {/* POI detail panel */}
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
              {isDM
                ? 'Click ✦ in the sidebar to generate your first map.'
                : 'No maps have been shared with you yet.'}
            </div>
          )}
        </main>
      </div>

      {showGenerator && (
        <MapGenerator
          campaignId={campaignId}
          onClose={() => { setShowGenerator(false); setGenContext(null); }}
          onCreated={handleMapCreated}
          parentMapId={genContext?.parentMapId ?? null}
          parentPoiId={genContext?.parentPoiId ?? null}
          parentPoiCtx={genContext?.parentPoiCtx ?? null}
          presetType={genContext?.presetType ?? null}
        />
      )}
      {showApiKeys && <ApiKeySettings onClose={() => setShowApiKeys(false)} />}
    </div>
  );
}

// ── MapTreeNode ───────────────────────────────────────────────────────────────
function MapTreeNode({ map, allMaps, activeMapId, children_fn, onSelect, depth }) {
  const kids = children_fn(map.id);
  const isActive = map.id === activeMapId;
  return (
    <div className="mm-tree-node">
      <button
        className={`mm-tree-item${isActive ? ' mm-tree-item--active' : ''}`}
        style={{ paddingLeft: `${12 + depth * 14}px` }}
        onClick={() => onSelect(map.id)}
      >
        <span className="mm-tree-type">{MAP_TYPE_LABELS[map.type] ?? map.type}</span>
        <span className="mm-tree-name">{map.name}</span>
        {map.data?.visible_to_players && <span className="mm-tree-badge">👁</span>}
        {map.image_url && <span className="mm-tree-badge mm-tree-badge--img">🖼</span>}
      </button>
      {kids.map(child => (
        <MapTreeNode key={child.id} map={child} allMaps={allMaps} activeMapId={activeMapId}
          children_fn={children_fn} onSelect={onSelect} depth={depth + 1} />
      ))}
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

  if (!map.image_url) {
    return (
      <div className="mm-canvas-empty">
        <div className="mm-canvas-empty-icon">🗺</div>
        <div>{isDM ? 'No image — upload one or generate with DALL·E 3' : 'Map image not available.'}</div>
        {isDM && <div className="mm-canvas-empty-hint">Use 🖼 Image in the toolbar to upload</div>}
      </div>
    );
  }

  return (
    <div className={`mm-canvas-scroll`}>
      <div
        ref={containerRef}
        className={`mm-map-container${addPoiMode ? ' mm-map-container--place' : ''}`}
        onClick={handleContainerClick}
      >
        <img src={map.image_url} alt={map.name} className="mm-map-image" draggable={false} />

        {/* Fantasy border overlay */}
        <div className="mm-map-border" aria-hidden="true" />

        {/* POI layer */}
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

  const info = poiInfo(poi.type);

  const handlePointerDown = (e) => {
    if (!isDM || playerView) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragMoved.current = false;
    dragStartPos.current = { mx: e.clientX, my: e.clientY, ox: poi.x_percent, oy: poi.y_percent };
    setIsDragging(true);
    setLivePos({ x: poi.x_percent, y: poi.y_percent });
  };

  const handlePointerMove = (e) => {
    if (!isDragging || !containerRef.current) return;
    const dx = e.clientX - dragStartPos.current.mx;
    const dy = e.clientY - dragStartPos.current.my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragMoved.current = true;
    const rect = containerRef.current.getBoundingClientRect();
    const nx = Math.max(2, Math.min(98, dragStartPos.current.ox + (dx / rect.width)  * 100));
    const ny = Math.max(2, Math.min(98, dragStartPos.current.oy + (dy / rect.height) * 100));
    setLivePos({ x: nx, y: ny });
  };

  const handlePointerUp = (e) => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragMoved.current && livePos) {
      onDragEnd(poi.id, livePos.x, livePos.y);
    } else {
      onSelect(poi.id);
    }
    setLivePos(null);
    dragMoved.current = false;
    dragStartPos.current = null;
  };

  const pos = (isDragging && livePos) ? livePos : { x: poi.x_percent, y: poi.y_percent };

  return (
    <div
      className={`mm-poi-marker${isSelected ? ' mm-poi-marker--selected' : ''}${info.pulse ? ' mm-poi-marker--pulse' : ''}${poi.is_dm_only && !playerView ? ' mm-poi-marker--dm' : ''}${isDragging ? ' mm-poi-marker--dragging' : ''}`}
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, '--poi-color': info.color }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      role="button"
      title={poi.name}
    >
      <span className="mm-poi-icon">{info.icon}</span>
      {isSelected && <span className="mm-poi-label">{poi.name}</span>}
      {poi.is_dm_only && !playerView && <span className="mm-poi-dm-badge">🔒</span>}
      {poi.child_map_id && <span className="mm-poi-child-badge">⛓</span>}
    </div>
  );
}

// ── POIPanel ──────────────────────────────────────────────────────────────────
const POI_GENERATE_SYSTEM = `You are an AD&D 2E dungeon master. Given a map POI, generate comprehensive content.
Return ONLY valid JSON:
{
  "short_description": "string",
  "dm_description": "string — 2-3 sentences",
  "history": "string — 2-3 sentences",
  "current_situation": "string — 1-2 sentences",
  "encounters": "string — specific monster/challenge details",
  "treasure": "string or null",
  "secrets": "string — hidden info/hooks",
  "quest_hooks": ["string", "string"]
}`;

function POIPanel({ poi, map, maps, isDM, playerView, onClose, onUpdate, onDelete, onDrillDown, onNavigate, onShowApiKeys }) {
  const [activeTab,    setActiveTab]    = useState(isDM && !playerView ? 'dm' : 'player');
  const [editing,      setEditing]      = useState(false);
  const [draft,        setDraft]        = useState(poi);
  const [generating,   setGenerating]   = useState(false);
  const [genError,     setGenError]     = useState('');
  const [delConfirm,   setDelConfirm]   = useState(false);

  // Sync draft when poi changes (e.g. after drag save)
  useEffect(() => { setDraft(poi); }, [poi.id]);

  const info = poiInfo(poi.type);
  const childMap = poi.child_map_id ? maps.find(m => m.id === poi.child_map_id) : null;

  const updateD  = (k, v)    => setDraft(d => ({ ...d, [k]: v }));
  const handleSave = () => { onUpdate(draft); setEditing(false); };

  const handleGenerateDetails = async () => {
    if (!hasAnthropicKey()) { onShowApiKeys(); return; }
    setGenerating(true);
    setGenError('');
    try {
      const result = await callClaude({
        systemPrompt: POI_GENERATE_SYSTEM,
        userPrompt:   `Map: "${map.name}" (${map.data?.description ?? ''})
POI: "${poi.name}" (type: ${poi.type})
Context: ${poi.short_description || poi.dm_description || 'Unknown location'}
Generate detailed AD&D 2E content for this POI.`,
        maxTokens: 1024,
      });
      const merged = { ...draft, ...result };
      setDraft(merged);
      onUpdate(merged);
    } catch (e) { setGenError(e.message); }
    finally { setGenerating(false); }
  };

  return (
    <aside className="mm-poi-panel">
      {/* Header */}
      <div className="mm-poi-panel-header">
        <span className="mm-poi-panel-icon" style={{ color: info.color }}>{info.icon}</span>
        <div className="mm-poi-panel-title">
          {editing ? (
            <input className="mm-poi-name-input" value={draft.name}
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
          <button className={`mm-poi-tab${activeTab==='player'?' mm-poi-tab--active':''}`} onClick={() => setActiveTab('player')}>
            👁 Players
          </button>
          <button className={`mm-poi-tab${activeTab==='dm'?' mm-poi-tab--active':''}`} onClick={() => setActiveTab('dm')}>
            🔒 DM
          </button>
        </div>
      )}

      {/* Body */}
      <div className="mm-poi-panel-body">

        {/* PLAYER TAB */}
        {activeTab === 'player' && (
          <div className="mm-poi-section">
            {editing ? (
              <textarea className="mm-poi-textarea" rows={3} value={draft.short_description}
                onChange={e => updateD('short_description', e.target.value)}
                placeholder="What the players can learn about this place…" />
            ) : (
              <p className="mm-poi-text">{poi.short_description || <em className="mm-poi-empty">No public description.</em>}</p>
            )}
            {(poi.quest_hooks ?? []).length > 0 && (
              <div className="mm-poi-hooks">
                <div className="mm-poi-subsection">Quest Hooks</div>
                {poi.quest_hooks.map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)}
              </div>
            )}
          </div>
        )}

        {/* DM TAB */}
        {activeTab === 'dm' && isDM && (
          <div>
            <div className="mm-poi-section">
              <div className="mm-poi-subsection">Overview</div>
              {editing ? (
                <textarea className="mm-poi-textarea" rows={3} value={draft.dm_description}
                  onChange={e => updateD('dm_description', e.target.value)} placeholder="Full DM details…" />
              ) : (
                <p className="mm-poi-text">{poi.dm_description || <em className="mm-poi-empty">No DM description.</em>}</p>
              )}
            </div>
            {(poi.history || editing) && (
              <div className="mm-poi-section">
                <div className="mm-poi-subsection">History</div>
                {editing ? (
                  <textarea className="mm-poi-textarea" rows={2} value={draft.history}
                    onChange={e => updateD('history', e.target.value)} placeholder="History…" />
                ) : <p className="mm-poi-text">{poi.history}</p>}
              </div>
            )}
            {(poi.current_situation || editing) && (
              <div className="mm-poi-section">
                <div className="mm-poi-subsection">Current Situation</div>
                {editing ? (
                  <textarea className="mm-poi-textarea" rows={2} value={draft.current_situation}
                    onChange={e => updateD('current_situation', e.target.value)} placeholder="What is happening here now…" />
                ) : <p className="mm-poi-text">{poi.current_situation}</p>}
              </div>
            )}
            {(poi.encounters || editing) && (
              <div className="mm-poi-section">
                <div className="mm-poi-subsection">Encounters</div>
                {editing ? (
                  <textarea className="mm-poi-textarea" rows={2} value={draft.encounters}
                    onChange={e => updateD('encounters', e.target.value)} placeholder="Monsters & challenges…" />
                ) : <p className="mm-poi-text">{poi.encounters}</p>}
              </div>
            )}
            {(poi.treasure || editing) && (
              <div className="mm-poi-section mm-poi-section--treasure">
                <div className="mm-poi-subsection">💰 Treasure</div>
                {editing ? (
                  <textarea className="mm-poi-textarea" rows={2} value={draft.treasure ?? ''}
                    onChange={e => updateD('treasure', e.target.value)} placeholder="Loot…" />
                ) : <p className="mm-poi-text">{poi.treasure}</p>}
              </div>
            )}
            {(poi.secrets || editing) && (
              <div className="mm-poi-section mm-poi-section--secrets">
                <div className="mm-poi-subsection">🔒 Secrets</div>
                {editing ? (
                  <textarea className="mm-poi-textarea" rows={2} value={draft.secrets ?? ''}
                    onChange={e => updateD('secrets', e.target.value)} placeholder="Hidden info & plot hooks…" />
                ) : <p className="mm-poi-text mm-poi-text--secret">{poi.secrets}</p>}
              </div>
            )}
            {(poi.quest_hooks?.length > 0 || editing) && (
              <div className="mm-poi-section">
                <div className="mm-poi-subsection">Quest Hooks</div>
                {(poi.quest_hooks ?? []).map((h, i) => <p key={i} className="mm-poi-hook">• {h}</p>)}
              </div>
            )}

            {/* Edit mode type selector */}
            {editing && (
              <div className="mm-poi-section">
                <div className="mm-poi-subsection">Type & Visibility</div>
                <div className="mm-poi-edit-row">
                  <select className="mm-poi-select" value={draft.type} onChange={e => updateD('type', e.target.value)}>
                    {Object.entries(POI_TYPES).map(([k, v]) => (
                      <option key={k} value={k}>{v.icon} {v.label}</option>
                    ))}
                  </select>
                  <button
                    className={`mm-poi-toggle${draft.is_dm_only ? ' mm-poi-toggle--dm' : ''}`}
                    onClick={() => updateD('is_dm_only', !draft.is_dm_only)}
                  >
                    {draft.is_dm_only ? '🔒 DM Only' : '👁 Public'}
                  </button>
                </div>
                <div className="mm-poi-edit-row" style={{ marginTop:6 }}>
                  <label style={{ fontSize:10, color:'#7a6020', display:'flex', alignItems:'center', gap:6 }}>
                    <input type="checkbox" checked={draft.can_drill_down}
                      onChange={e => updateD('can_drill_down', e.target.checked)} />
                    Can drill down
                  </label>
                  {draft.can_drill_down && (
                    <select className="mm-poi-select" value={draft.drill_down_type ?? 'null'}
                      onChange={e => updateD('drill_down_type', e.target.value === 'null' ? null : e.target.value)}>
                      <option value="null">Type…</option>
                      {['dungeon','cave','city','ruins'].map(t => <option key={t}>{t}</option>)}
                    </select>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        <div className="mm-poi-actions">
          {/* Drill-down / navigate to child */}
          {childMap ? (
            <button className="mm-poi-action-btn mm-poi-action-btn--drill"
              onClick={() => onNavigate(childMap.id)}>
              🗺 Open: {childMap.name}
            </button>
          ) : poi.can_drill_down && isDM && !playerView ? (
            <button className="mm-poi-action-btn mm-poi-action-btn--drill"
              onClick={onDrillDown}>
              📍 Generate {poi.drill_down_type ?? 'Sub'}-Map
            </button>
          ) : null}

          {/* AI generate details */}
          {isDM && !playerView && !poi.dm_description && (
            <button className="mm-poi-action-btn mm-poi-action-btn--ai"
              onClick={handleGenerateDetails} disabled={generating}>
              {generating ? '⏳ Generating…' : '✦ Generate Details with AI'}
            </button>
          )}
          {genError && <div className="mm-poi-error">{genError}</div>}

          {isDM && !playerView && (
            <div className="mm-poi-dm-btns">
              {editing ? (
                <>
                  <button className="mm-poi-save-btn" onClick={handleSave}>✓ Save</button>
                  <button className="mm-poi-cancel-btn" onClick={() => { setDraft(poi); setEditing(false); }}>Cancel</button>
                </>
              ) : (
                <button className="mm-poi-edit-btn" onClick={() => setEditing(true)}>✎ Edit</button>
              )}
              {delConfirm ? (
                <>
                  <button className="mm-poi-del-yes" onClick={onDelete}>Delete</button>
                  <button className="mm-poi-cancel-btn" onClick={() => setDelConfirm(false)}>Cancel</button>
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
