/**
 * TerrainSketchEditor — 32×32 grid terrain painter.
 *
 * Props:
 *   initialSpec   SketchSpec | null   — existing sketch to edit (or null for new)
 *   onGenerate    fn(spec, imageUrl)   — called after successful image generation
 *   onCancel      fn()
 */
import { useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { validateSketchSpec }           from '../../rules-engine/sketchValidator.ts';
import { renderSketchForAI, getTileKey } from '../../utils/canvas/sketchToPng.ts';
import { api }                          from '../../api/client.js';
import './TerrainSketchEditor.css';

// ── Palette ───────────────────────────────────────────────────────────────────

// Kept for spec/validation compatibility
export const BIOME_CONFIG = {
  plains:   { label: 'Plains',   color: '#c8d88a' },
  forest:   { label: 'Forest',   color: '#3a7a3a' },
  swamp:    { label: 'Swamp',    color: '#5a7a4a' },
  desert:   { label: 'Desert',   color: '#d4b060' },
  tundra:   { label: 'Tundra',   color: '#b0c8d8' },
  volcanic: { label: 'Volcanic', color: '#a03020' },
  ocean:    { label: 'Ocean',    color: '#1a5080' },
  coastal:  { label: 'Coastal',  color: '#4a90a0' },
  lake:     { label: 'Lake',     color: '#1976d2' },
};

// Grouped tile palette — drives the brush UI
const TILE_PALETTE = [
  { id: 'plains',   emoji: '🌿', category: 'Plains',   tiles: [
    { key: 'plains_flat',      label: 'Flat',       biome: 'plains',   relief: undefined },
    { key: 'plains_hills',     label: 'Hills',      biome: 'plains',   relief: 'hills' },
    { key: 'plains_mountains', label: 'Mountains',  biome: 'plains',   relief: 'mountains' },
  ]},
  { id: 'forest',   emoji: '🌲', category: 'Forest',   tiles: [
    { key: 'forest_flat',      label: 'Flat',        biome: 'forest',  relief: undefined },
    { key: 'forest_hills',     label: 'Hills',       biome: 'forest',  relief: 'hills' },
    { key: 'forest_mountains', label: 'Mountains',   biome: 'forest',  relief: 'mountains' },
    { key: 'forest_edge',      label: 'Edge',        biome: 'forest',  relief: undefined },
    { key: 'jungle_flat',      label: 'Jungle Flat', biome: 'swamp',   relief: undefined },
    { key: 'jungle_hills',     label: 'Jungle Hills',biome: 'swamp',   relief: 'hills' },
  ]},
  { id: 'swamp',    emoji: '🌿', category: 'Swamp',    tiles: [
    { key: 'swamp_flat',  label: 'Flat',  biome: 'swamp', relief: undefined },
    { key: 'swamp_trees', label: 'Trees', biome: 'swamp', relief: undefined },
  ]},
  { id: 'desert',   emoji: '🏜', category: 'Desert',   tiles: [
    { key: 'desert_flat',  label: 'Flat',  biome: 'desert', relief: undefined },
    { key: 'desert_hills', label: 'Hills', biome: 'desert', relief: 'hills' },
  ]},
  { id: 'tundra',   emoji: '❄',  category: 'Tundra',   tiles: [
    { key: 'tundra_flat',      label: 'Flat',      biome: 'tundra', relief: undefined },
    { key: 'tundra_mountains', label: 'Mountains', biome: 'tundra', relief: 'mountains' },
  ]},
  { id: 'volcanic', emoji: '🌋', category: 'Volcanic', tiles: [
    { key: 'volcanic_flat',           label: 'Flat',         biome: 'volcanic', relief: undefined },
    { key: 'volcanic_mountain_large', label: 'Large Volcano',biome: 'volcanic', relief: 'mountains' },
    { key: 'volcanic_mountain_small', label: 'Small Volcano',biome: 'volcanic', relief: 'mountains' },
  ]},
  { id: 'ocean',    emoji: '🌊', category: 'Ocean',    tiles: [
    { key: 'ocean_deep',    label: 'Deep',    biome: 'ocean',   relief: undefined },
    { key: 'ocean_shallow', label: 'Shallow', biome: 'coastal', relief: undefined },
    { key: 'reef',          label: 'Reef',    biome: 'coastal', relief: undefined },
  ]},
  { id: 'coastal',  emoji: '🏖', category: 'Coastal',  tiles: [
    { key: 'coast_flat', label: 'Coast', biome: 'coastal', relief: undefined },
  ]},
  { id: 'lake',     emoji: '💧', category: 'Lake',     tiles: [
    { key: 'inland_lake', label: 'Lake', biome: 'lake', relief: undefined },
  ]},
];

// Overlay brushes (not tile images — drawn as lines/paths)
const CONNECTOR_BRUSHES = [
  { type: 'river', label: '🌊 River', color: '#2196f3' },
  { type: 'road',  label: '🛤 Road',  color: '#8d6e63' },
];

const OVERLAY_DIVIDERS = ['canyon', 'chasm'];

// Random rotation — only for linear/directional tiles where any angle looks natural
const ROTATE_TILE_KEYS = new Set([
  'river_stream', 'river_main',
  'road_path', 'dirt_road', 'cobblestone_road',
]);

// Tile keys that count as "ocean/water" for coast orientation purposes
const OCEAN_TILE_KEYS = new Set(['ocean_shallow', 'ocean_deep', 'reef', 'inland_lake']);

function seededRandom(seed) {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}
function cellRotDeg(cx, cy) {
  return [0, 90, 180, 270][Math.floor(seededRandom(cx * 31 + cy) * 4)];
}

/**
 * Orient coast_flat so its water edge faces the nearest ocean neighbor.
 * Assumes coast_flat.png has water at the BOTTOM in default (0°) orientation.
 *   0°   → water faces south (+y)
 *   90°  → water faces west  (-x)   (bottom rotated CW → left)
 *   180° → water faces north (-y)
 *   270° → water faces east  (+x)
 * Falls back to seeded random when no ocean neighbor is found.
 */
function coastRotDeg(cx, cy, cellsMap) {
  const dirs = [
    [0,  1, 180],   // south
    [-1, 0, 270],   // west
    [0, -1,   0],   // north
    [1,  0,  90],   // east
  ];
  for (const [dx, dy, rot] of dirs) {
    const nb = cellsMap[`${cx + dx},${cy + dy}`];
    if (!nb) continue;
    const nKey = nb.tileKey ?? '';
    if (OCEAN_TILE_KEYS.has(nKey) || nb.biome === 'ocean' || nb.biome === 'lake') return rot;
  }
  return cellRotDeg(cx, cy); // fallback
}

const OVERLAY_STYLE = {
  river:  { color: '#2196f3', width: 3 },
  road:   { color: '#8d6e63', width: 2, dash: '6,3' },
  canyon: { color: '#5d4037', width: 4 },
  chasm:  { color: '#111111', width: 5 },
  wall:   { color: '#808080', width: 2 },
  border: { color: '#c05050', width: 2, dash: '4,2' },
};
// Keep OVERLAY_COLORS for live-path preview (uses active overlay type)
const OVERLAY_COLORS = Object.fromEntries(
  Object.entries(OVERLAY_STYLE).map(([k, v]) => [k, v.color]),
);

function ReliefMarker({ c }) {
  const x = c.x * CELL_PX, y = c.y * CELL_PX;
  const cx = x + CELL_PX / 2;
  const C = CELL_PX;
  switch (c.relief) {
    case 'hills':
      return <path d={`M ${x+2},${y+C-3} Q ${cx},${y+3} ${x+C-2},${y+C-3}`}
        fill="none" stroke="#5a3e1e" strokeWidth={1.4} opacity={0.65} />;
    case 'mountains':
    case 'mountainous':
      return <polygon points={`${cx},${y+3} ${x+2},${y+C-2} ${x+C-2},${y+C-2}`}
        fill="none" stroke="#444" strokeWidth={1.2} opacity={0.7} />;
    default:
      return null;
  }
}

const GRID = 32;
const CELL_PX = 14; // display pixel size per cell

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEmptySpec(scope = 'region') {
  return { grid_size: 32, scope, cells: [], overlays: [], modifiers: [],
           ai_freedom: 'balanced', lore_mode: false };
}

function cellKey(x, y) { return `${x},${y}`; }

function getCellsInBrush(cx, cy, size) {
  const cells = [];
  const r = Math.floor(size / 2);
  for (let dx = -r; dx <= r; dx++)
    for (let dy = -r; dy <= r; dy++) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < GRID && ny >= 0 && ny < GRID) cells.push([nx, ny]);
    }
  return cells;
}

// ── Main component ────────────────────────────────────────────────────────────

export const TerrainSketchEditor = forwardRef(function TerrainSketchEditor({ initialSpec, onGenerate, onCancel }, ref) {
  const [cells, setCells]           = useState(() => {
    const map = {};
    (initialSpec?.cells ?? []).forEach(c => {
      const cell = { ...c };
      // Backwards compat: biome='hills' → biome='plains' + relief='hills'
      if (cell.biome === 'hills')     { cell.biome = 'plains'; cell.relief = 'hills'; }
      // Backwards compat: biome='mountains' → biome='plains' + relief='mountains'
      if (cell.biome === 'mountains') { cell.biome = 'plains'; cell.relief = 'mountains'; }
      // Backwards compat: relief='hilly' → relief='hills'
      if (cell.relief === 'hilly') cell.relief = 'hills';
      // Backwards compat: relief='mountainous' → relief='mountains'
      if (cell.relief === 'mountainous') cell.relief = 'mountains';
      map[cellKey(cell.x, cell.y)] = cell;
    });
    return map;
  });
  const [overlays, setOverlays]     = useState(
    // Backwards compat: drop legacy 'coast' overlays (now implicit in biome boundary)
    (initialSpec?.overlays ?? []).filter(o => o.type !== 'coast'),
  );
  const [modifiers, setModifiers]   = useState(initialSpec?.modifiers ?? []);

  // Brush state — single active tile (encodes biome + relief + display key)
  const [activeTile, setActiveTile]   = useState(TILE_PALETTE[0].tiles[0]); // plains_flat
  const [tool, setTool]               = useState(null);       // null | 'overlay' | 'erase'
  const [overlay, setOverlay]         = useState('river');
  const [brushSize, setBrushSize]     = useState(1);

  // Collapsible palette categories — all open by default
  const [openCats, setOpenCats] = useState(
    () => new Set([...TILE_PALETTE.map(c => c.id), 'connectors', 'dividers'])
  );
  function toggleCat(id) {
    setOpenCats(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Zoom state for canvas
  const [zoom, setZoom]               = useState(1);

  // Settings
  const [scope, setScope]           = useState(initialSpec?.scope ?? 'region');
  const [climate, setClimate]       = useState(initialSpec?.climate ?? '');
  const [scale, setScale]           = useState(initialSpec?.scale ?? '50mi');
  const [aiFreedom, setAiFreedom]   = useState(initialSpec?.ai_freedom ?? 'balanced');
  const [loreMode, setLoreMode]     = useState(initialSpec?.lore_mode ?? false);
  const [userPrompt, setUserPrompt] = useState(initialSpec?.user_prompt ?? '');
  const [renderer, setRenderer]     = useState('gemini');
  const [mapStyle, setMapStyle]     = useState('schley');
  const [errors, setErrors]         = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus]   = useState('');
  const [fillDialog, setFillDialog] = useState(null); // null | { emptyCount, mode, biome }

  // Live overlay path — state so it renders in real-time during drawing
  const [liveOverlayPath, setLiveOverlayPath] = useState([]);
  const painting = useRef(false);

  const svgRef = useRef(null);

  // ── Canvas interaction ─────────────────────────────────────────────────────

  function svgCoords(e) {
    const rect = svgRef.current.getBoundingClientRect();
    // getBoundingClientRect returns scaled dimensions, so divide by effective cell size
    const x = Math.floor((e.clientX - rect.left) / (CELL_PX * zoom));
    const y = Math.floor((e.clientY - rect.top)  / (CELL_PX * zoom));
    return [Math.max(0, Math.min(31, x)), Math.max(0, Math.min(31, y))];
  }

  const paintAt = useCallback((e) => {
    if (!painting.current) return;
    const [cx, cy] = svgCoords(e);

    if (tool === 'erase') {
      setCells(prev => {
        const next = { ...prev };
        getCellsInBrush(cx, cy, brushSize).forEach(([x,y]) => delete next[cellKey(x,y)]);
        return next;
      });
      return;
    }

    if (tool === 'overlay') {
      const coord = { x: cx, y: cy };
      setLiveOverlayPath(prev => {
        if (prev.length && prev[prev.length-1].x === cx && prev[prev.length-1].y === cy)
          return prev;
        return [...prev, coord];
      });
      return;
    }

    // Paint mode — stamp activeTile biome+relief+tileKey onto cells
    if (tool === null && activeTile) {
      setCells(prev => {
        const next = { ...prev };
        getCellsInBrush(cx, cy, brushSize).forEach(([x, y]) => {
          const k = cellKey(x, y);
          const cell = { x, y, biome: activeTile.biome, tileKey: activeTile.key };
          if (activeTile.relief) cell.relief = activeTile.relief;
          next[k] = cell;
        });
        return next;
      });
    }
  }, [tool, activeTile, overlay, brushSize, zoom]);

  function handlePointerDown(e) {
    e.preventDefault();
    painting.current = true;
    setLiveOverlayPath([]);
    paintAt(e);
  }

  function handlePointerMove(e) { paintAt(e); }

  function handlePointerUp() {
    painting.current = false;
    if (tool === 'overlay' && liveOverlayPath.length >= 2) {
      setOverlays(prev => [...prev, { type: overlay, points: liveOverlayPath }]);
      setLiveOverlayPath([]);
    } else if (tool === 'overlay') {
      setLiveOverlayPath([]);
    }
  }



  // ── Fill helpers (for empty cell handling) ───────────────────────────────

  function nearestNeighborFill(sourceCells) {
    const filled = { ...sourceCells };
    for (let y = 0; y < GRID; y++) {
      for (let x = 0; x < GRID; x++) {
        const key = cellKey(x, y);
        if (filled[key]) continue;
        let bestBiome = 'plains';
        outer: for (let r = 1; r <= 5; r++) {
          for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
              if (Math.abs(dx) + Math.abs(dy) !== r) continue;
              const nx = x + dx, ny = y + dy;
              if (nx < 0 || nx >= GRID || ny < 0 || ny >= GRID) continue;
              const nk = cellKey(nx, ny);
              if (sourceCells[nk]?.biome) { bestBiome = sourceCells[nk].biome; break outer; }
            }
          }
        }
        filled[key] = { x, y, biome: bestBiome };
      }
    }
    return filled;
  }

  function fillWithBiome(sourceCells, biome) {
    const filled = { ...sourceCells };
    for (let y = 0; y < GRID; y++)
      for (let x = 0; x < GRID; x++) {
        const key = cellKey(x, y);
        if (!filled[key]) filled[key] = { x, y, biome };
      }
    return filled;
  }

  // ── Build spec + generate ──────────────────────────────────────────────────

  function buildSpec(overrideCells) {
    return {
      grid_size: 32,
      scope,
      cells: Object.values(overrideCells ?? cells),
      overlays: overlays.filter(o => o.points?.length >= 2),
      modifiers,
      climate: climate || undefined,
      scale,
      ai_freedom: aiFreedom,
      lore_mode: loreMode,
      user_prompt: userPrompt || undefined,
    };
  }

  async function handleGenerate() {
    const emptyCount = GRID * GRID - Object.keys(cells).length;
    if (emptyCount > 0) {
      setFillDialog({ emptyCount, mode: 'nearest', biome: 'plains' });
      return;
    }
    await runGeneration(cells);
  }

  async function confirmFill() {
    const { mode, biome } = fillDialog;
    setFillDialog(null);
    const workingCells = mode === 'nearest' ? nearestNeighborFill(cells)
                       : mode === 'biome'   ? fillWithBiome(cells, biome)
                       : cells;
    // Update cells state so canvas reflects the fill before/during generation
    if (mode !== 'leave') setCells(workingCells);
    await runGeneration(workingCells);
  }

  async function runGeneration(workingCells) {
    const spec = buildSpec(workingCells);

    // Show loading immediately so user sees feedback even before validation
    setGenerating(true);
    setGenStatus('Validating sketch…');
    setErrors([]);

    // Defer to next tick so React flushes the loading state before heavy work
    await new Promise(r => setTimeout(r, 0));

    const result = validateSketchSpec(spec);
    if (!result.valid) {
      setErrors(result.errors);
      setGenerating(false);
      setGenStatus('');
      return;
    }

    try {
      setGenStatus('Capturing sketch…');
      const controlImage = await renderSketchForAI(spec);

      // 2. POST to server → returns jobId immediately (non-blocking)
      const rendererLabel = renderer === 'gpt-image-1' ? 'GPT-Image-1'
                          : renderer === 'gemini'     ? 'Gemini Image'
                          : 'AI renderer';
      setGenStatus(`Queuing ${rendererLabel} job…`);

      const token = localStorage.getItem('dnd_token') ?? '';
      const startResp = await fetch('/api/maps/generate-from-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sketchSpec: spec, renderer, controlImage, stylePreset: mapStyle, userPrompt, aiFredom: spec.ai_freedom || 'balanced' }),
      });
      if (!startResp.ok) {
        const err = await startResp.json().catch(() => ({ error: startResp.statusText }));
        throw new Error(err.error ?? 'Failed to start generation');
      }
      const { jobId } = await startResp.json();

      // 3. Poll GET /api/maps/sketch-job/:jobId every 3s until done (max 180s)
      setGenStatus(`Generating with ${rendererLabel}…`);
      let elapsed = 0;
      const MAX_WAIT = 180;
      while (elapsed < MAX_WAIT) {
        await new Promise(r => setTimeout(r, 3000));
        elapsed += 3;

        let job;
        try {
          const pollResp = await fetch(`/api/maps/sketch-job/${jobId}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!pollResp.ok) {
            // Transient error — keep polling, don't abort
            console.warn(`[sketch] Poll ${elapsed}s: HTTP ${pollResp.status} — retrying`);
            continue;
          }
          job = await pollResp.json();
        } catch (networkErr) {
          console.warn(`[sketch] Poll ${elapsed}s: network error — retrying`, networkErr.message);
          continue;
        }

        console.log(`[poll ${elapsed}s] status=${job.status} imageUrl=${job.imageUrl ?? 'none'}`);

        if (job.status === 'succeeded') {
          console.log('[poll] SUCCEEDED — imageUrl:', job.imageUrl);
          console.log('[poll] calling onGenerate with imageUrl:', job.imageUrl);
          setGenStatus(`Done (${job.renderer_used})`);
          onGenerate(spec, job.imageUrl);
          console.log('[poll] onGenerate called — returning');
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.error ?? 'Generation failed');
        }

        // pending / starting / processing — show elapsed time with hint after 90s
        const hint = elapsed >= 90 ? ' — this may take a while' : '';
        setGenStatus(`Generating with ${rendererLabel}… (${elapsed}s${hint})`);
      }
      throw new Error(`Generation timed out after ${MAX_WAIT}s — check back later or retry`);

    } catch (err) {
      setErrors([err.message]);
    } finally {
      setGenerating(false);
      setGenStatus('');
    }
  }

  function clearModifiers() { setModifiers([]); }
  function clearOverlays()  { setOverlays([]);  }

  function handleCancel() {
    const hasContent = Object.keys(cells).length > 0 || overlays.length > 0;
    if (hasContent && !window.confirm('Discard terrain sketch? All changes will be lost.')) return;
    onCancel();
  }

  useImperativeHandle(ref, () => ({ requestClose: handleCancel }));

  // ── Render ─────────────────────────────────────────────────────────────────

  const cellArr = Object.values(cells);
  const totalPx = GRID * CELL_PX;

  return (
    <div className="tse-root">
      <div className="tse-toolbar">
        <span className="tse-title">Terrain Sketch Editor</span>
        <div className="tse-brush-sizes">
          {[1,3,5].map(s => (
            <button key={s} className={`tse-sz ${brushSize===s?'tse-sz--active':''}`}
              onClick={() => setBrushSize(s)}>{s}×{s}</button>
          ))}
        </div>
      </div>

      <div className="tse-body">
        {/* ── Left palette ── */}
        <div className="tse-palette">
          {/* Biome tile categories */}
          {TILE_PALETTE.map(({ id, emoji, category, tiles }) => {
            const catActive = tool === null && tiles.some(t => t.key === activeTile?.key);
            return (
              <CategorySection key={id} id={id} emoji={emoji} label={category}
                open={openCats.has(id)} active={catActive} onToggle={() => toggleCat(id)}>
                <div className="tse-tile-grid">
                  {tiles.map(t => (
                    <TileChip key={t.key} tileKey={t.key} label={t.label}
                      active={tool === null && activeTile?.key === t.key}
                      onClick={() => { setActiveTile(t); setTool(null); }} />
                  ))}
                </div>
              </CategorySection>
            );
          })}

          {/* Connectors (river, road) */}
          <CategorySection id="connectors" emoji="〰" label="Connectors"
            open={openCats.has('connectors')}
            active={tool === 'overlay' && CONNECTOR_BRUSHES.some(c => c.type === overlay)}
            onToggle={() => toggleCat('connectors')}>
            <div className="tse-chip-row">
              {CONNECTOR_BRUSHES.map(c => (
                <OverlayChip key={c.type} label={c.label} color={c.color}
                  active={tool === 'overlay' && overlay === c.type}
                  onClick={() => { setTool('overlay'); setOverlay(c.type); }} />
              ))}
            </div>
          </CategorySection>

          {/* Dividers (canyon, chasm) */}
          <CategorySection id="dividers" emoji="⛰" label="Dividers"
            open={openCats.has('dividers')}
            active={tool === 'overlay' && OVERLAY_DIVIDERS.includes(overlay)}
            onToggle={() => toggleCat('dividers')}>
            <div className="tse-chip-row">
              {OVERLAY_DIVIDERS.map(o => (
                <OverlayChip key={o} label={o} color={OVERLAY_STYLE[o]?.color}
                  active={tool === 'overlay' && overlay === o}
                  onClick={() => { setTool('overlay'); setOverlay(o); }} />
              ))}
            </div>
          </CategorySection>

          <button
            className={`tse-erase-btn${tool === 'erase' ? ' tse-erase-btn--active' : ''}`}
            onClick={() => setTool(t => t === 'erase' ? null : 'erase')}>
            ✕ {tool === 'erase' ? 'Erasing…' : 'Erase'}
          </button>
        </div>

        {/* ── Canvas ── */}
        <div className="tse-canvas-wrap">
          <div className="tse-zoom-bar">
            <button className="tse-zoom-btn" title="Zoom in" onClick={() => setZoom(z => Math.min(6, Math.round(z * 1.25 * 100) / 100))}>+</button>
            <span className="tse-zoom-label">{Math.round(zoom * 100)}%</span>
            <button className="tse-zoom-btn" title="Zoom out" onClick={() => setZoom(z => Math.max(1, Math.round(z / 1.25 * 100) / 100))}>−</button>
            <button className="tse-zoom-btn tse-zoom-reset" title="Reset zoom" onClick={() => setZoom(1)}>1:1</button>
            <span className="tse-zoom-hint">Ctrl+scroll to zoom</span>
          </div>
          <div className="tse-canvas-scroll"
            onWheel={e => {
              if (!e.ctrlKey && !e.metaKey) return; // plain wheel → native scroll (both axes)
              e.preventDefault();
              setZoom(z => {
                const next = e.deltaY < 0 ? z * 1.2 : z / 1.2;
                return Math.max(1, Math.min(6, Math.round(next * 100) / 100));
              });
            }}>
          <div style={{ width: totalPx * zoom, height: totalPx * zoom, position: 'relative', flexShrink: 0 }}>
          <svg ref={svgRef} width={totalPx} height={totalPx}
            className="tse-canvas"
            style={{ transform: `scale(${zoom})`, transformOrigin: 'top left', position: 'absolute' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}>

            {/* Grid background */}
            <rect width={totalPx} height={totalPx} fill="#1a1a1a" />
            <defs>
              <pattern id="tse-grid" width={CELL_PX} height={CELL_PX} patternUnits="userSpaceOnUse">
                <path d={`M ${CELL_PX} 0 L 0 0 0 ${CELL_PX}`} fill="none" stroke="#333" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width={totalPx} height={totalPx} fill="url(#tse-grid)" />

            {/* Painted biome cells — tile images */}
            {cellArr.map(c => {
              const key = c.tileKey ?? getTileKey(c.biome, c.relief);
              const rot = key === 'coast_flat'      ? coastRotDeg(c.x, c.y, cells)
                        : ROTATE_TILE_KEYS.has(key) ? cellRotDeg(c.x, c.y)
                        : 0;
              const scx = c.x * CELL_PX + CELL_PX / 2;
              const scy = c.y * CELL_PX + CELL_PX / 2;
              return (
                <image key={cellKey(c.x,c.y)}
                  href={`/tiles/${key}.png`}
                  x={c.x*CELL_PX} y={c.y*CELL_PX}
                  width={CELL_PX} height={CELL_PX}
                  transform={rot ? `rotate(${rot} ${scx} ${scy})` : undefined}
                  style={{ imageRendering: 'pixelated' }} />
              );
            })}

            {/* Committed overlays — per-type style */}
            {overlays.map((ov, i) => {
              if (!ov.points?.length || ov.points.length < 2) return null;
              const pts = ov.points.map(p => `${p.x*CELL_PX+CELL_PX/2},${p.y*CELL_PX+CELL_PX/2}`).join(' ');
              const s = OVERLAY_STYLE[ov.type] ?? { color: '#888', width: 2 };
              return (
                <g key={i}>
                  {/* chasm: outer thick line for double-line effect */}
                  {ov.type === 'chasm' && (
                    <polyline points={pts} stroke="#555" strokeWidth={9} fill="none" opacity={0.6} strokeLinecap="round" strokeLinejoin="round" />
                  )}
                  <polyline points={pts}
                    stroke={s.color} strokeWidth={s.width} fill="none" opacity={0.95}
                    strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={s.dash ?? undefined} />
                </g>
              );
            })}

            {/* Live overlay path — drawn in real-time during stroke */}
            {tool === 'overlay' && liveOverlayPath.length > 1 && (
              <polyline
                points={liveOverlayPath.map(p => `${p.x*CELL_PX+CELL_PX/2},${p.y*CELL_PX+CELL_PX/2}`).join(' ')}
                stroke={OVERLAY_COLORS[overlay]} strokeWidth={2.5} fill="none"
                opacity={0.7} strokeDasharray="4,2" />
            )}

          </svg>
          </div>{/* zoom sizer */}
          </div>{/* tse-canvas-scroll */}
          <div className="tse-canvas-info">
            {cellArr.length} cells painted · {overlays.length} overlays
            {overlays.length > 0 && <button className="tse-clear-link" onClick={clearOverlays}>clear overlays</button>}
          </div>
        </div>

        {/* ── Settings sidebar ── */}
        <div className="tse-settings">
          {/* Actions pinned at TOP — always visible */}
          <div className="tse-actions">
            <button className="tse-btn tse-btn--primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : '🗺 Generate Map'}
            </button>
            <button className="tse-btn" onClick={handleCancel} disabled={generating}>Cancel</button>
            {generating && genStatus && (
              <div className="tse-gen-status">⏳ {genStatus}</div>
            )}
            {errors.length > 0 && (
              <div className="tse-errors">
                {errors.map((e,i) => <div key={i}>⚠ {e}</div>)}
              </div>
            )}
          </div>

          <div className="tse-settings-scroll">
            <label className="tse-label">Scope
              <select value={scope} onChange={e => setScope(e.target.value)}>
                <option value="world">World</option>
                <option value="region">Region</option>
                <option value="local">Local</option>
              </select>
            </label>

            <label className="tse-label">Scale
              <select value={scale} onChange={e => setScale(e.target.value)}>
                <option value="10mi">10 mi</option>
                <option value="50mi">50 mi</option>
                <option value="200mi">200 mi</option>
                <option value="500mi">500 mi</option>
              </select>
            </label>

            <label className="tse-label">Climate
              <select value={climate} onChange={e => setClimate(e.target.value)}>
                <option value="">— any —</option>
                <option value="temperate">Temperate</option>
                <option value="tropical">Tropical</option>
                <option value="arctic">Arctic</option>
                <option value="arid">Arid</option>
              </select>
            </label>

            <label className="tse-label">AI Freedom
              <select value={aiFreedom} onChange={e => setAiFreedom(e.target.value)}>
                <option value="strict">Strict</option>
                <option value="balanced">Balanced</option>
                <option value="creative">Creative</option>
              </select>
            </label>

            <label className="tse-label tse-toggle">
              <input type="checkbox" checked={loreMode} onChange={e => setLoreMode(e.target.checked)} />
              Lore mode
            </label>

            <label className="tse-label tse-prompt-label">Extra prompt
              <textarea className="tse-prompt" rows={3} maxLength={500}
                placeholder="Describe unique features…"
                value={userPrompt} onChange={e => setUserPrompt(e.target.value)} />
            </label>

            <label className="tse-label">Map Style
              <select value={mapStyle} onChange={e => setMapStyle(e.target.value)} disabled={generating}>
                <option value="schley">🏔 Modern Classical Fantasy</option>
                <option value="handwritten">✏️ Crude Handwritten</option>
                <option value="parchment">📜 Parchment Atlas</option>
                <option value="ink">🖋 Hand-drawn Ink</option>
                <option value="classic">🗺 Classic D&amp;D Module</option>
              </select>
            </label>

            <label className="tse-label">Renderer
              <select value={renderer} onChange={e => setRenderer(e.target.value)} disabled={generating}>
                <option value="auto">🤖 Auto</option>
                <option value="gpt-image-1">🖼 GPT-Image-1 (OpenAI)</option>
                <option value="gemini">🟦 Gemini Image (Google)</option>
              </select>
            </label>

          </div>
        </div>
      </div>

      {/* ── Fill dialog ── */}
      {fillDialog && (
        <div className="tse-fill-overlay">
          <div className="tse-fill-dialog">
            <h3>Unfilled Cells</h3>
            <p>Your map has <strong>{fillDialog.emptyCount}</strong> unfilled cell{fillDialog.emptyCount !== 1 ? 's' : ''} (shown as black). How should they be handled?</p>
            <div className="tse-fill-options">
              <label className={`tse-fill-opt ${fillDialog.mode === 'nearest' ? 'tse-fill-opt--active' : ''}`}>
                <input type="radio" name="fillMode" value="nearest"
                  checked={fillDialog.mode === 'nearest'}
                  onChange={() => setFillDialog(d => ({ ...d, mode: 'nearest' }))} />
                Fill with nearest neighbor biome <span className="tse-fill-rec">(recommended)</span>
              </label>
              <label className={`tse-fill-opt ${fillDialog.mode === 'biome' ? 'tse-fill-opt--active' : ''}`}>
                <input type="radio" name="fillMode" value="biome"
                  checked={fillDialog.mode === 'biome'}
                  onChange={() => setFillDialog(d => ({ ...d, mode: 'biome' }))} />
                Fill all with:&nbsp;
                <select value={fillDialog.biome}
                  onChange={e => setFillDialog(d => ({ ...d, biome: e.target.value, mode: 'biome' }))}>
                  {Object.entries(BIOME_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </label>
              <label className={`tse-fill-opt ${fillDialog.mode === 'leave' ? 'tse-fill-opt--active' : ''}`}>
                <input type="radio" name="fillMode" value="leave"
                  checked={fillDialog.mode === 'leave'}
                  onChange={() => setFillDialog(d => ({ ...d, mode: 'leave' }))} />
                Leave empty <span className="tse-fill-warn">(may affect quality)</span>
              </label>
            </div>
            <div className="tse-fill-btns">
              <button className="tse-btn" onClick={() => setFillDialog(null)}>Cancel</button>
              <button className="tse-btn tse-btn--primary" onClick={confirmFill}>Continue →</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ── Sub-components ────────────────────────────────────────────────────────────

function CategorySection({ id, emoji, label, open, active, onToggle, children }) {
  return (
    <div className={`tse-cat${active ? ' tse-cat--active' : ''}`}>
      <button className="tse-cat-header" onClick={onToggle} title={`${open ? 'Collapse' : 'Expand'} ${label}`}>
        <span className="tse-cat-emoji">{emoji}</span>
        <span className="tse-cat-name">{label}</span>
        <span className="tse-cat-chevron">{open ? '▾' : '▸'}</span>
      </button>
      {open && <div className="tse-cat-body">{children}</div>}
    </div>
  );
}

function TileChip({ tileKey, label, active, onClick }) {
  return (
    <button className={`tse-tile-chip${active ? ' tse-tile-chip--active' : ''}`}
      onClick={onClick} title={label}>
      <img src={`/tiles/${tileKey}.png`} alt={label} className="tse-tile-img" />
      <span className="tse-tile-label">{label}</span>
    </button>
  );
}

function OverlayChip({ label, color, active, onClick }) {
  return (
    <button className={`tse-overlay-chip${active ? ' tse-overlay-chip--active' : ''}`}
      onClick={onClick} title={label}>
      <span className="tse-overlay-swatch" style={{ background: color }} />
      <span className="tse-overlay-label">{label}</span>
    </button>
  );
}
