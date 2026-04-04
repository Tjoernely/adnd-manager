/**
 * TerrainSketchEditor — 32×32 grid terrain painter.
 *
 * Props:
 *   initialSpec   SketchSpec | null   — existing sketch to edit (or null for new)
 *   onGenerate    fn(spec, imageUrl)   — called after successful image generation
 *   onCancel      fn()
 */
import { useState, useRef, useCallback } from 'react';
import { validateSketchSpec }           from '../../rules-engine/sketchValidator.ts';
import { renderSketchToControlImage }   from '../../utils/canvas/sketchToPng.ts';
import { api }                          from '../../api/client.js';
import './TerrainSketchEditor.css';

// ── Palette ───────────────────────────────────────────────────────────────────

export const BIOME_CONFIG = {
  plains:    { label: 'Plains',    color: '#c8d88a' },
  forest:    { label: 'Forest',    color: '#3a7a3a' },
  swamp:     { label: 'Swamp',     color: '#5a7a4a' },
  desert:    { label: 'Desert',    color: '#d4b060' },
  tundra:    { label: 'Tundra',    color: '#b0c8d8' },
  volcanic:  { label: 'Volcanic',  color: '#a03020' },
  ocean:     { label: 'Ocean',     color: '#1a5080' },
  coastal:   { label: 'Coastal',   color: '#4a90a0' },
  mountains: { label: 'Mountains', color: '#8a7868' },
  hills:     { label: 'Hills',     color: '#a89060' },
};

const RELIEF_OPTIONS = ['flat','rolling','hilly','mountainous','cliffs','valley','plateau'];
const OVERLAY_OPTIONS = ['river','road','wall','coast','border'];
const MODIFIER_OPTIONS = ['cursed','sacred','magical','blighted','fertile','ancient_ruins'];

const OVERLAY_COLORS = {
  river: '#3a90d0', road: '#c0a060', wall: '#808080',
  coast: '#4ab0c0', border: '#c05050',
};

const MODIFIER_COLORS = {
  cursed: '#8000c0', sacred: '#e0c000', magical: '#40c0e0',
  blighted: '#805030', fertile: '#40c060', ancient_ruins: '#a07850',
};

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

export function TerrainSketchEditor({ initialSpec, onGenerate, onCancel }) {
  const [cells, setCells]           = useState(() => {
    const map = {};
    (initialSpec?.cells ?? []).forEach(c => { map[cellKey(c.x, c.y)] = c; });
    return map;
  });
  const [overlays, setOverlays]     = useState(initialSpec?.overlays ?? []);
  const [modifiers, setModifiers]   = useState(initialSpec?.modifiers ?? []);

  // Brush state
  const [tool, setTool]             = useState('biome');     // 'biome'|'relief'|'overlay'|'modifier'|'erase'
  const [biome, setBiome]           = useState('plains');
  const [relief, setRelief]         = useState('flat');
  const [overlay, setOverlay]       = useState('river');
  const [modifier, setModifier]     = useState('sacred');
  const [brushSize, setBrushSize]   = useState(1);

  // Settings
  const [scope, setScope]           = useState(initialSpec?.scope ?? 'region');
  const [climate, setClimate]       = useState(initialSpec?.climate ?? '');
  const [scale, setScale]           = useState(initialSpec?.scale ?? '50mi');
  const [aiFreedom, setAiFreedom]   = useState(initialSpec?.ai_freedom ?? 'balanced');
  const [loreMode, setLoreMode]     = useState(initialSpec?.lore_mode ?? false);
  const [userPrompt, setUserPrompt] = useState(initialSpec?.user_prompt ?? '');
  const [renderer, setRenderer]     = useState('auto');  // 'auto' | 'controlnet' | 'dalle'
  const [errors, setErrors]         = useState([]);
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus]   = useState('');

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

    if (tool === 'biome') {
      setCells(prev => {
        const next = { ...prev };
        getCellsInBrush(cx, cy, brushSize).forEach(([x,y]) => {
          const key = cellKey(x, y);
          next[key] = { ...(prev[key] ?? {}), x, y, biome };
        });
        return next;
      });
      return;
    }

    if (tool === 'relief') {
      setCells(prev => {
        const next = { ...prev };
        getCellsInBrush(cx, cy, brushSize).forEach(([x,y]) => {
          const key = cellKey(x, y);
          if (next[key]) next[key] = { ...next[key], relief };
        });
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

    if (tool === 'modifier') {
      const r = Math.max(1, Math.floor(brushSize * 2));
      setModifiers(prev => [...prev, { type: modifier, x: cx, y: cy, r }]);
    }
  }, [tool, biome, relief, overlay, modifier, brushSize]);

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

  // ── Build spec + generate ──────────────────────────────────────────────────

  function buildSpec() {
    return {
      grid_size: 32,
      scope,
      cells: Object.values(cells),
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
    const spec = buildSpec();

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
      // 1. Render sketch → segmentation PNG
      setGenStatus('Rendering terrain sketch…');
      const controlImage = renderSketchToControlImage(spec);

      // 2. POST to server → returns jobId immediately (non-blocking)
      const rendererLabel = renderer === 'controlnet' ? 'ControlNet'
                          : renderer === 'dalle'      ? 'DALL-E'
                          : 'AI renderer';
      setGenStatus(`Queuing ${rendererLabel} job…`);

      const token = localStorage.getItem('dnd_token') ?? '';
      const startResp = await fetch('/api/maps/generate-from-sketch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ sketchSpec: spec, renderer, controlImage }),
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

        if (job.status === 'succeeded') {
          setGenStatus(`Done (${job.renderer_used})`);
          onGenerate(spec, job.imageUrl);
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
          <ToolSection label="Biome" active={tool==='biome'} onActivate={() => setTool('biome')}>
            {Object.entries(BIOME_CONFIG).map(([key, cfg]) => (
              <PaletteChip key={key} color={cfg.color} label={cfg.label}
                active={tool==='biome' && biome===key}
                onClick={() => { setTool('biome'); setBiome(key); }} />
            ))}
          </ToolSection>

          <ToolSection label="Relief" active={tool==='relief'} onActivate={() => setTool('relief')}>
            {RELIEF_OPTIONS.map(r => (
              <PaletteChip key={r} color="#a09080" label={r} dimmed
                active={tool==='relief' && relief===r}
                onClick={() => { setTool('relief'); setRelief(r); }} />
            ))}
          </ToolSection>

          <ToolSection label="Overlay" active={tool==='overlay'} onActivate={() => setTool('overlay')}>
            {OVERLAY_OPTIONS.map(o => (
              <PaletteChip key={o} color={OVERLAY_COLORS[o]} label={o}
                active={tool==='overlay' && overlay===o}
                onClick={() => { setTool('overlay'); setOverlay(o); }} />
            ))}
          </ToolSection>

          <ToolSection label="Modifier" active={tool==='modifier'} onActivate={() => setTool('modifier')}>
            {MODIFIER_OPTIONS.map(m => (
              <PaletteChip key={m} color={MODIFIER_COLORS[m]} label={m.replace('_',' ')}
                active={tool==='modifier' && modifier===m}
                onClick={() => { setTool('modifier'); setModifier(m); }} />
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

            {/* Painted biome cells */}
            {cellArr.map(c => (
              <rect key={cellKey(c.x,c.y)}
                x={c.x*CELL_PX} y={c.y*CELL_PX}
                width={CELL_PX} height={CELL_PX}
                fill={BIOME_CONFIG[c.biome]?.color ?? '#888'}
                opacity={0.85} />
            ))}

            {/* Relief hatching dots */}
            {cellArr.filter(c => c.relief && c.relief !== 'flat').map(c => (
              <circle key={'r'+cellKey(c.x,c.y)}
                cx={c.x*CELL_PX + CELL_PX/2} cy={c.y*CELL_PX + CELL_PX/2}
                r={1.5} fill="rgba(0,0,0,0.5)" />
            ))}

            {/* Committed overlays */}
            {overlays.map((ov, i) => ov.points?.length > 1 && (
              <polyline key={i}
                points={ov.points.map(p => `${p.x*CELL_PX+CELL_PX/2},${p.y*CELL_PX+CELL_PX/2}`).join(' ')}
                stroke={OVERLAY_COLORS[ov.type]} strokeWidth={2} fill="none" opacity={0.9} />
            ))}

            {/* Live overlay path — drawn in real-time during stroke */}
            {tool === 'overlay' && liveOverlayPath.length > 1 && (
              <polyline
                points={liveOverlayPath.map(p => `${p.x*CELL_PX+CELL_PX/2},${p.y*CELL_PX+CELL_PX/2}`).join(' ')}
                stroke={OVERLAY_COLORS[overlay]} strokeWidth={2.5} fill="none"
                opacity={0.7} strokeDasharray="4,2" />
            )}

            {/* Modifiers */}
            {modifiers.map((m, i) => (
              <circle key={i}
                cx={m.x*CELL_PX+CELL_PX/2} cy={m.y*CELL_PX+CELL_PX/2}
                r={m.r*CELL_PX*0.6}
                fill={MODIFIER_COLORS[m.type]} opacity={0.25}
                stroke={MODIFIER_COLORS[m.type]} strokeWidth={1} />
            ))}
          </svg>
          <div className="tse-canvas-info">
            {cellArr.length} cells painted · {overlays.length} overlays · {modifiers.length} modifiers
            {overlays.length > 0 && <button className="tse-clear-link" onClick={clearOverlays}>clear overlays</button>}
            {modifiers.length > 0 && <button className="tse-clear-link" onClick={clearModifiers}>clear modifiers</button>}
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

          <label className="tse-label">Renderer
            <select value={renderer} onChange={e => setRenderer(e.target.value)} disabled={generating}>
              <option value="auto">🎨 Auto (ControlNet → DALL-E)</option>
              <option value="controlnet">🗺 ControlNet (Replicate)</option>
              <option value="dalle">🖼 DALL-E (OpenAI)</option>
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
            <button className="tse-btn" onClick={onCancel} disabled={generating}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ToolSection({ label, active, onActivate, children }) {
  return (
    <div className={`tse-section ${active ? 'tse-section--active' : ''}`}>
      <div className="tse-section-label" onClick={onActivate}>{label}</div>
      <div className="tse-chips">{children}</div>
    </div>
  );
}

function PaletteChip({ color, label, active, dimmed, onClick }) {
  return (
    <button className={`tse-chip ${active ? 'tse-chip--active' : ''} ${dimmed ? 'tse-chip--dimmed' : ''}`}
      onClick={onClick} title={label}>
      <span className="tse-chip-swatch" style={{ background: color }} />
      <span className="tse-chip-label">{label}</span>
    </button>
  );
}
