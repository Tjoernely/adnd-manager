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

const RELIEF_CONFIG = {
  flat:      { label: 'Flat',         color: '#c8b89a' },
  hills:     { label: '∩ Hills',      color: '#8B7355' },
  mountains: { label: '△ Mountains', color: '#888888' },
};
const RELIEF_OPTIONS = Object.keys(RELIEF_CONFIG);
const OVERLAY_CONNECTORS = ['river', 'road'];
const OVERLAY_DIVIDERS   = ['canyon', 'chasm'];

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

  // Brush state — biome and relief are independent toggles (null = inactive)
  const [activeBiome, setActiveBiome] = useState('plains');   // null | biomeKey
  const [activeRelief, setActiveRelief] = useState(null);     // null | reliefKey
  const [tool, setTool]               = useState(null);       // null | 'overlay' | 'erase'
  const [overlay, setOverlay]         = useState('river');
  const [brushSize, setBrushSize]     = useState(1);

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
    const x = Math.floor((e.clientX - rect.left) / CELL_PX);
    const y = Math.floor((e.clientY - rect.top)  / CELL_PX);
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

    // Paint mode: biome and relief are independent
    if (activeBiome !== null || activeRelief !== null) {
      setCells(prev => {
        const next = { ...prev };
        getCellsInBrush(cx, cy, brushSize).forEach(([x, y]) => {
          const key = cellKey(x, y);
          if (activeBiome !== null) {
            // Biome paint creates/updates cell; relief unchanged
            next[key] = { ...(prev[key] ?? {}), x, y, biome: activeBiome };
          }
          if (activeRelief !== null) {
            // Relief only modifies existing cells (or cells just created by biome above)
            if (next[key]) {
              if (activeRelief === 'flat') {
                // Remove relief key entirely so it never serialises as null/"null"
                const { relief: _r, ...rest } = next[key];
                next[key] = rest;
              } else {
                next[key] = { ...next[key], relief: activeRelief };
              }
            }
          }
        });
        return next;
      });
    }
  }, [tool, activeBiome, activeRelief, overlay, brushSize]);

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
          <ToolSection label="Biome" active={activeBiome !== null}>
            {Object.entries(BIOME_CONFIG).map(([key, cfg]) => (
              <PaletteChip key={key} label={cfg.label}
                tile={`/tiles/${getTileKey(key, undefined)}.png`}
                active={activeBiome === key}
                onClick={() => {
                  setActiveBiome(prev => prev === key ? null : key);
                  setTool(null);
                }} />
            ))}
          </ToolSection>

          <ToolSection label="Relief" active={activeRelief !== null}>
            {RELIEF_OPTIONS.map(r => (
              <PaletteChip key={r} label={RELIEF_CONFIG[r].label}
                tile={`/tiles/${getTileKey('plains', r === 'flat' ? undefined : r)}.png`}
                active={activeRelief === r}
                onClick={() => {
                  setActiveRelief(prev => prev === r ? null : r);
                  setTool(null);
                }} />
            ))}
          </ToolSection>

          <ToolSection label="Connectors" active={tool==='overlay' && OVERLAY_CONNECTORS.includes(overlay)}>
            {OVERLAY_CONNECTORS.map(o => (
              <PaletteChip key={o} color={OVERLAY_COLORS[o]} label={o}
                active={tool==='overlay' && overlay===o}
                onClick={() => { setTool('overlay'); setOverlay(o); }} />
            ))}
          </ToolSection>

          <ToolSection label="Dividers" active={tool==='overlay' && OVERLAY_DIVIDERS.includes(overlay)}>
            {OVERLAY_DIVIDERS.map(o => (
              <PaletteChip key={o} color={OVERLAY_COLORS[o]} label={o}
                active={tool==='overlay' && overlay===o}
                onClick={() => { setTool('overlay'); setOverlay(o); }} />
            ))}
          </ToolSection>

          <button className="tse-erase-btn" onClick={() => setTool('erase')}>
            {tool==='erase' ? '✕ Erasing' : '✕ Erase'}
          </button>
        </div>

        {/* ── Canvas ── */}
        <div className="tse-canvas-wrap">
          <svg ref={svgRef} width={totalPx} height={totalPx}
            className="tse-canvas"
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
              const key = getTileKey(c.biome, c.relief);
              return (
                <image key={cellKey(c.x,c.y)}
                  href={`/tiles/${key}.png`}
                  x={c.x*CELL_PX} y={c.y*CELL_PX}
                  width={CELL_PX} height={CELL_PX}
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
          <div className="tse-canvas-info">
            {cellArr.length} cells painted · {overlays.length} overlays
            {overlays.length > 0 && <button className="tse-clear-link" onClick={clearOverlays}>clear overlays</button>}
          </div>
        </div>

        {/* ── Settings sidebar ── */}
        <div className="tse-settings">
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

          {errors.length > 0 && (
            <div className="tse-errors">
              {errors.map((e,i) => <div key={i}>⚠ {e}</div>)}
            </div>
          )}

          {generating && genStatus && (
            <div className="tse-gen-status">⏳ {genStatus}</div>
          )}

          <div className="tse-actions">
            <button className="tse-btn tse-btn--primary" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Generating…' : 'Generate Map from Sketch'}
            </button>
            <button className="tse-btn" onClick={handleCancel} disabled={generating}>Cancel</button>
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

function ToolSection({ label, active, children }) {
  return (
    <div className={`tse-section ${active ? 'tse-section--active' : ''}`}>
      <div className="tse-section-label">{label}</div>
      <div className="tse-chips">{children}</div>
    </div>
  );
}

function PaletteChip({ color, label, active, dimmed, onClick, tile }) {
  return (
    <button className={`tse-chip ${active ? 'tse-chip--active' : ''} ${dimmed ? 'tse-chip--dimmed' : ''}`}
      onClick={onClick} title={label}>
      {tile
        ? <span className="tse-chip-tile" style={{ backgroundImage: `url(${tile})` }} />
        : <span className="tse-chip-swatch" style={{ background: color }} />
      }
      <span className="tse-chip-label">{label}</span>
    </button>
  );
}
