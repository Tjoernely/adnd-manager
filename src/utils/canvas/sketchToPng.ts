/**
 * src/utils/canvas/sketchToPng.ts
 *
 * Renders a SketchSpec to a 768×768 segmentation-style PNG (base64).
 * Runs in the browser via OffscreenCanvas — no Node.js canvas required.
 * Output is flat-color, no anti-aliasing — optimised for ControlNet seg input.
 */

import type { SketchSpec, BiomeType, OverlayType, ModifierType } from '../../rules-engine/mapTypes';

// ── Colour tables (flat HEX, no gradients) ─────────────────────────────────

// Flat colours for segmentation control image (no gradients, no anti-aliasing)
const BIOME_COLOR: Record<BiomeType | 'null', string> = {
  plains:   '#9dc183',
  forest:   '#228b22',
  swamp:    '#4a5d23',
  desert:   '#edc9af',
  tundra:   '#e0f7fa',
  volcanic: '#332222',
  ocean:    '#1a237e',
  coastal:  '#4db6ac',
  lake:     '#1976d2',
  null:     '#cccccc',
};

const OVERLAY_COLOR: Record<OverlayType, string> = {
  river:  '#0000ff',
  road:   '#8d6e63',
  wall:   '#607d8b',
  border: '#333333',
  canyon: '#5d4037',
  chasm:  '#000000',
};

const OVERLAY_WIDTH: Record<OverlayType, number> = {
  river:  8,
  road:   5,
  wall:   5,
  border: 4,
  canyon: 10,
  chasm:  12,
};

const MODIFIER_COLOR: Record<ModifierType | string, string> = {
  cursed:       'rgba(33,33,33,0.30)',
  sacred:       'rgba(255,235,59,0.20)',
  magical:      'rgba(63,81,181,0.25)',
  blighted:     'rgba(244,67,54,0.25)',
  fertile:      'rgba(76,175,80,0.18)',
  ancient_ruins:'rgba(121,85,72,0.25)',
  enchanted:    'rgba(64,224,192,0.25)',
  corrupted:    'rgba(192,64,64,0.30)',
  divine:       'rgba(255,215,0,0.22)',
};

// ── Size constants ──────────────────────────────────────────────────────────

const OUTPUT_PX = 768;
const GRID      = 32;
const CELL_PX   = OUTPUT_PX / GRID; // 24px per cell

// ── Relief hatch helpers ────────────────────────────────────────────────────

function drawReliefHatch(
  ctx: CanvasRenderingContext2D,
  px: number, py: number,
  color: string, opacity: number,
  style: 'diagonal' | 'vertical' | 'light',
) {
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.strokeStyle = color;
  ctx.lineWidth   = 1;

  const step = style === 'light' ? 6 : 4;
  const x0   = px, y0 = py, x1 = px + CELL_PX, y1 = py + CELL_PX;

  ctx.beginPath();
  if (style === 'diagonal') {
    // NW→SE diagonal hatching
    for (let d = -CELL_PX; d < CELL_PX; d += step) {
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(x0 + d + CELL_PX, y0 + CELL_PX);
    }
  } else if (style === 'vertical') {
    for (let x = x0; x <= x1; x += step) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
  } else {
    // light: sparse diagonal
    for (let d = -CELL_PX; d < CELL_PX; d += step * 2) {
      ctx.moveTo(x0 + d, y0);
      ctx.lineTo(x0 + d + CELL_PX, y0 + CELL_PX);
    }
  }
  ctx.stroke();
  ctx.restore();
}

// ── Main export ─────────────────────────────────────────────────────────────

export function renderSketchToControlImage(spec: SketchSpec): string {
  // Use a regular HTMLCanvasElement — works in all browsers, no worker required
  const canvas = document.createElement('canvas');
  canvas.width  = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext('2d')!;

  // Disable ALL smoothing — ControlNet needs crisp segmentation edges
  ctx.imageSmoothingEnabled = false;

  // 1. Background — neutral grey for unpainted cells
  ctx.fillStyle = BIOME_COLOR.null;
  ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);

  // 2. Biome cells
  for (const cell of spec.cells) {
    const px = cell.x * CELL_PX;
    const py = cell.y * CELL_PX;

    ctx.fillStyle = BIOME_COLOR[cell.biome] ?? BIOME_COLOR.null;
    ctx.fillRect(px, py, CELL_PX, CELL_PX);

    // Relief overlay (legacy values handled via string cast for backwards compat)
    if (cell.relief) {
      switch (cell.relief as string) {
        case 'mountainous':
          drawReliefHatch(ctx, px, py, '#555555', 0.30, 'diagonal');
          break;
        case 'cliffs':
          drawReliefHatch(ctx, px, py, '#444444', 0.30, 'vertical');
          break;
        case 'hills':
          drawReliefHatch(ctx, px, py, '#666666', 0.15, 'light');
          break;
      }
    }
  }

  // 3. Modifiers (semi-transparent fills, drawn AFTER cells, BEFORE overlays)
  for (const mod of spec.modifiers) {
    const color = MODIFIER_COLOR[mod.type];
    if (!color) continue;
    const cx  = (mod.x + 0.5) * CELL_PX;
    const cy  = (mod.y + 0.5) * CELL_PX;
    const r   = mod.r * CELL_PX;

    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 4. Overlay lines (on top of everything — must be thick and visible)
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';

  for (const ov of spec.overlays) {
    if (!ov.points || ov.points.length < 2) continue;

    const color = OVERLAY_COLOR[ov.type as OverlayType] ?? '#333333';
    const width = OVERLAY_WIDTH[ov.type as OverlayType] ?? 5;

    ctx.strokeStyle = color;
    ctx.lineWidth   = width;
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(
      (ov.points[0].x / GRID) * OUTPUT_PX,
      (ov.points[0].y / GRID) * OUTPUT_PX,
    );
    for (let i = 1; i < ov.points.length; i++) {
      ctx.lineTo(
        (ov.points[i].x / GRID) * OUTPUT_PX,
        (ov.points[i].y / GRID) * OUTPUT_PX,
      );
    }
    ctx.stroke();
  }

  // 5. Export to base64 PNG via toDataURL (synchronous, universally supported)
  const dataUrl = canvas.toDataURL('image/png');

  console.log(`[sketchToPng] Rendered ${OUTPUT_PX}×${OUTPUT_PX} seg PNG — dataURL length: ${dataUrl.length} chars`);

  return dataUrl;
}

// ── AI render — blurred biome zones, no overlays, no symbols ─────────────────
// Sent to Gemini/GPT. Biome colours only + subtle relief darkening + Gaussian
// blur to soften cell edges. No overlays, no symbols — nothing for the model
// to copy geometrically. Connectors described only in prompt text.

const AI_PX   = 1024;
const AI_CELL = AI_PX / GRID; // 32px

const AI_BIOME_COLOR: Record<string, string> = {
  plains:   '#a8b870',
  forest:   '#2d6a2d',
  ocean:    '#1a4a7a',
  coastal:  '#5b9ea0',
  lake:     '#2a6090',
  desert:   '#d4b483',
  swamp:    '#4a6741',
  tundra:   '#b8d4d4',
  volcanic: '#4a1c1c',
  null:     '#1a1a1a',
};

export function renderSketchForAI(spec: SketchSpec): string {
  // Step 1: draw sharp biome + relief to a temp canvas
  const sharp = document.createElement('canvas');
  sharp.width  = AI_PX;
  sharp.height = AI_PX;
  const sCtx = sharp.getContext('2d')!;
  sCtx.imageSmoothingEnabled = false;

  // Background
  sCtx.fillStyle = AI_BIOME_COLOR.null;
  sCtx.fillRect(0, 0, AI_PX, AI_PX);

  // Biome fills — no overlays, no symbols
  for (const cell of spec.cells) {
    const px = cell.x * AI_CELL, py = cell.y * AI_CELL;
    sCtx.fillStyle = AI_BIOME_COLOR[cell.biome] ?? AI_BIOME_COLOR.null;
    sCtx.fillRect(px, py, AI_CELL, AI_CELL);
  }

  // Relief — subtle dark overlay only
  for (const cell of spec.cells) {
    const r = cell.relief as string;
    if (!r || r === 'flat') continue;
    const opacity = (r === 'mountains' || r === 'mountainous') ? 0.25 : 0.12;
    sCtx.fillStyle = `rgba(0,0,0,${opacity})`;
    sCtx.fillRect(cell.x * AI_CELL, cell.y * AI_CELL, AI_CELL, AI_CELL);
  }

  // Step 2: copy to output canvas with blur applied
  // blur(12px) softens hard cell edges so model uses its own organic interpretation
  const out = document.createElement('canvas');
  out.width  = AI_PX;
  out.height = AI_PX;
  const oCtx = out.getContext('2d')!;
  oCtx.filter = 'blur(12px)';
  oCtx.drawImage(sharp, 0, 0);

  console.log('[sketchToPng] renderSketchForAI: blurred biome zones, no overlays');
  return out.toDataURL('image/png');
}

// ── Preview renderer (for humans) ────────────────────────────────────────────
// 1024×1024, biome fills with textures, styled overlays, grid, border.
// Display only — never sent to AI.

const PREVIEW_PX   = 1024;
const PREVIEW_CELL = PREVIEW_PX / GRID; // 32px per cell

// Biome fill colors for preview (match editor palette)
const PREVIEW_BIOME_COLOR: Record<string, string> = {
  plains:   '#c8d88a',
  forest:   '#3a7a3a',
  swamp:    '#5a7a4a',
  desert:   '#d4b060',
  tundra:   '#b0c8d8',
  volcanic: '#a03020',
  ocean:    '#1a5080',
  coastal:  '#4a90a0',
  lake:     '#1976d2',
  null:     '#2a2a2a',
};

const PREVIEW_OVERLAY: Record<string, { color: string; width: number; dash?: number[] }> = {
  river:  { color: '#2196f3', width: 5 },
  road:   { color: '#c0a060', width: 4, dash: [12, 6] },
  canyon: { color: '#5d4037', width: 7 },
  chasm:  { color: '#111111', width: 9 },
  wall:   { color: '#808080', width: 4 },
  border: { color: '#c05050', width: 4, dash: [8, 4] },
};

function drawPreviewTexture(ctx: CanvasRenderingContext2D, biome: string, px: number, py: number) {
  const c = PREVIEW_CELL;
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, c, c);
  ctx.clip();

  switch (biome) {
    case 'forest': {
      // Small triangle tree symbols, 3 per cell
      ctx.strokeStyle = 'rgba(0,40,0,0.35)';
      ctx.lineWidth = 1;
      const treePts = [[0.25, 0.75], [0.6, 0.5], [0.45, 0.85]];
      for (const [tx, ty] of treePts) {
        const cx = px + tx * c, cy = py + ty * c, h = c * 0.22;
        ctx.beginPath();
        ctx.moveTo(cx, cy - h);
        ctx.lineTo(cx - h * 0.7, cy + h * 0.4);
        ctx.lineTo(cx + h * 0.7, cy + h * 0.4);
        ctx.closePath();
        ctx.stroke();
      }
      break;
    }
    case 'ocean':
    case 'lake':
    case 'coastal': {
      // Horizontal sine-wave lines
      ctx.strokeStyle = 'rgba(180,220,255,0.30)';
      ctx.lineWidth = 1;
      for (let row = 0.25; row <= 0.85; row += 0.25) {
        ctx.beginPath();
        for (let dx = 0; dx <= c; dx += 2) {
          const wx = px + dx;
          const wy = py + row * c + Math.sin((dx / c) * Math.PI * 3) * (c * 0.05);
          dx === 0 ? ctx.moveTo(wx, wy) : ctx.lineTo(wx, wy);
        }
        ctx.stroke();
      }
      break;
    }
    case 'swamp': {
      // Cross-hatch marks
      ctx.strokeStyle = 'rgba(0,0,0,0.20)';
      ctx.lineWidth = 1;
      const marks = [[0.3, 0.3], [0.65, 0.5], [0.4, 0.75]];
      for (const [mx, my] of marks) {
        const qx = px + mx * c, qy = py + my * c, d = c * 0.08;
        ctx.beginPath();
        ctx.moveTo(qx - d, qy - d); ctx.lineTo(qx + d, qy + d);
        ctx.moveTo(qx + d, qy - d); ctx.lineTo(qx - d, qy + d);
        ctx.stroke();
      }
      break;
    }
    case 'plains': {
      // Very faint diagonal lines
      ctx.strokeStyle = 'rgba(160,150,60,0.12)';
      ctx.lineWidth = 1;
      for (let d = -c; d < c; d += 8) {
        ctx.beginPath();
        ctx.moveTo(px + d, py); ctx.lineTo(px + d + c, py + c);
        ctx.stroke();
      }
      break;
    }
    case 'volcanic': {
      // Radial crack lines from center
      ctx.strokeStyle = 'rgba(255,80,0,0.20)';
      ctx.lineWidth = 1;
      const vx = px + c * 0.5, vy = py + c * 0.5;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 3) {
        ctx.beginPath();
        ctx.moveTo(vx, vy);
        ctx.lineTo(vx + Math.cos(a) * c * 0.45, vy + Math.sin(a) * c * 0.45);
        ctx.stroke();
      }
      break;
    }
    case 'tundra': {
      // Sparse dots
      ctx.fillStyle = 'rgba(200,230,255,0.25)';
      for (const [dx, dy] of [[0.3,0.3],[0.6,0.55],[0.4,0.7],[0.7,0.25]]) {
        ctx.beginPath();
        ctx.arc(px + dx * c, py + dy * c, c * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'desert': {
      // Gentle curve dunes
      ctx.strokeStyle = 'rgba(160,100,20,0.15)';
      ctx.lineWidth = 1;
      for (let row = 0.3; row <= 0.8; row += 0.3) {
        ctx.beginPath();
        ctx.moveTo(px, py + row * c);
        ctx.bezierCurveTo(
          px + c * 0.3, py + (row - 0.06) * c,
          px + c * 0.7, py + (row + 0.06) * c,
          px + c, py + row * c,
        );
        ctx.stroke();
      }
      break;
    }
  }
  ctx.restore();
}

export function renderSketchToPreview(spec: SketchSpec): string {
  const canvas = document.createElement('canvas');
  canvas.width  = PREVIEW_PX;
  canvas.height = PREVIEW_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;

  // 1. Dark background for unpainted area
  ctx.fillStyle = PREVIEW_BIOME_COLOR.null;
  ctx.fillRect(0, 0, PREVIEW_PX, PREVIEW_PX);

  // 2. Biome cells with textures
  for (const cell of spec.cells) {
    const px = cell.x * PREVIEW_CELL;
    const py = cell.y * PREVIEW_CELL;
    ctx.fillStyle = PREVIEW_BIOME_COLOR[cell.biome] ?? PREVIEW_BIOME_COLOR.null;
    ctx.fillRect(px, py, PREVIEW_CELL, PREVIEW_CELL);
    drawPreviewTexture(ctx, cell.biome, px, py);

    // Relief indicator: small dot overlay
    if (cell.relief && cell.relief !== 'flat') {
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(px + PREVIEW_CELL * 0.5, py + PREVIEW_CELL * 0.5, PREVIEW_CELL * 0.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // 3. Light grid overlay
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GRID; i++) {
    const pos = i * PREVIEW_CELL;
    ctx.beginPath(); ctx.moveTo(pos, 0);    ctx.lineTo(pos, PREVIEW_PX); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, pos);    ctx.lineTo(PREVIEW_PX, pos); ctx.stroke();
  }
  ctx.restore();

  // 4. Modifier circles
  for (const mod of spec.modifiers) {
    const color = MODIFIER_COLOR[mod.type];
    if (!color) continue;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc((mod.x + 0.5) * PREVIEW_CELL, (mod.y + 0.5) * PREVIEW_CELL, mod.r * PREVIEW_CELL, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // 5. Overlay lines with distinct per-type styles
  ctx.lineCap  = 'round';
  ctx.lineJoin = 'round';
  for (const ov of spec.overlays) {
    if (!ov.points || ov.points.length < 2) continue;
    const s = PREVIEW_OVERLAY[ov.type as OverlayType] ?? { color: '#888', width: 4 };
    const pts = ov.points.map(p => ({ x: p.x * PREVIEW_CELL + PREVIEW_CELL / 2, y: p.y * PREVIEW_CELL + PREVIEW_CELL / 2 }));

    // chasm: thick outer stroke for double-line effect
    if (ov.type === 'chasm') {
      ctx.strokeStyle = '#444';
      ctx.lineWidth   = s.width * 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }

    ctx.strokeStyle = s.color;
    ctx.lineWidth   = s.width;
    ctx.setLineDash(s.dash ?? []);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // 6. Border
  ctx.strokeStyle = 'rgba(0,0,0,0.8)';
  ctx.lineWidth   = 3;
  ctx.strokeRect(1.5, 1.5, PREVIEW_PX - 3, PREVIEW_PX - 3);

  const dataUrl = canvas.toDataURL('image/png');
  console.log(`[sketchToPng] Rendered ${PREVIEW_PX}×${PREVIEW_PX} preview PNG — dataURL length: ${dataUrl.length} chars`);
  return dataUrl;
}

// ── Scribble renderer ────────────────────────────────────────────────────────
// For jagilley/controlnet-scribble: white background, black zone outlines.
// Colour-agnostic — only shape/boundary matters, layout respected directly.

const OVERLAY_SCRIBBLE_WIDTH: Record<string, number> = {
  river:  12,
  road:   10,
  wall:   10,
  border:  8,
  canyon: 14,
  chasm:  14,
};

export function renderSketchToScribble(spec: SketchSpec): string {
  const canvas = document.createElement('canvas');
  canvas.width  = OUTPUT_PX;
  canvas.height = OUTPUT_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true; // allow sub-pixel for organic look

  // White background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, OUTPUT_PX, OUTPUT_PX);

  // Build biome lookup
  const cellMap = new Map<string, string>();
  for (const cell of spec.cells) cellMap.set(`${cell.x},${cell.y}`, cell.biome);

  // ── Zone boundaries ────────────────────────────────────────────────────────
  // Draw only edges between different biomes or at the painted region border.
  // Collect unique edges first to avoid double-drawing shared edges.
  type Edge = { x0: number; y0: number; x1: number; y1: number };
  const edges: Edge[] = [];
  const edgeSeen = new Set<string>();

  for (const cell of spec.cells) {
    const px = cell.x * CELL_PX;
    const py = cell.y * CELL_PX;

    const neighbours: [dx: number, dy: number, x0: number, y0: number, x1: number, y1: number][] = [
      [ 1,  0,  px + CELL_PX, py,           px + CELL_PX, py + CELL_PX ], // right
      [-1,  0,  px,           py,           px,           py + CELL_PX ], // left
      [ 0,  1,  px,           py + CELL_PX, px + CELL_PX, py + CELL_PX ], // bottom
      [ 0, -1,  px,           py,           px + CELL_PX, py           ], // top
    ];

    for (const [dx, dy, x0, y0, x1, y1] of neighbours) {
      const nb = cellMap.get(`${cell.x + dx},${cell.y + dy}`);
      if (nb !== cell.biome) {
        // Normalise edge key so (A→B) and (B→A) share the same key
        const key = `${Math.min(x0,x1)},${Math.min(y0,y1)},${Math.max(x0,x1)},${Math.max(y0,y1)}`;
        if (!edgeSeen.has(key)) {
          edgeSeen.add(key);
          edges.push({ x0, y0, x1, y1 });
        }
      }
    }
  }

  // Draw edges with thick, round, slightly organic strokes
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 8;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  for (const { x0, y0, x1, y1 } of edges) {
    // Add a small organic offset at the midpoint (±3px) to soften staircase aliasing
    const mx  = (x0 + x1) / 2 + (Math.random() - 0.5) * 3;
    const my  = (y0 + y1) / 2 + (Math.random() - 0.5) * 3;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx, my, x1, y1);
    ctx.stroke();
  }

  // ── Overlay lines ──────────────────────────────────────────────────────────
  ctx.strokeStyle = '#000000';
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';

  for (const ov of spec.overlays) {
    if (!ov.points || ov.points.length < 2) continue;
    ctx.lineWidth = OVERLAY_SCRIBBLE_WIDTH[ov.type] ?? 10;

    const pts = ov.points.map(p => ({
      x: (p.x / GRID) * OUTPUT_PX,
      y: (p.y / GRID) * OUTPUT_PX,
    }));

    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      // Smooth through intermediate points with quadratic curves
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  }

  // ── Modifier circles ───────────────────────────────────────────────────────
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = 6;
  ctx.setLineDash([10, 5]);
  for (const mod of spec.modifiers) {
    const cx = (mod.x + 0.5) * CELL_PX;
    const cy = (mod.y + 0.5) * CELL_PX;
    const r  = mod.r * CELL_PX;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  const dataUrl = canvas.toDataURL('image/png');
  console.log(`[sketchToPng] Rendered ${OUTPUT_PX}×${OUTPUT_PX} scribble PNG — dataURL length: ${dataUrl.length} chars`);
  return dataUrl;
}
