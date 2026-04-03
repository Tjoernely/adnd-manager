/**
 * src/utils/canvas/sketchToPng.ts
 *
 * Renders a SketchSpec to a 768×768 segmentation-style PNG (base64).
 * Runs in the browser via OffscreenCanvas — no Node.js canvas required.
 * Output is flat-color, no anti-aliasing — optimised for ControlNet seg input.
 */

import type { SketchSpec, BiomeType, OverlayType, ModifierType } from '../../rules-engine/mapTypes';

// ── Colour tables (flat HEX, no gradients) ─────────────────────────────────

// ADE20K segmentation palette — jagilley/controlnet-seg is trained on these
// specific RGB values. Using arbitrary colours causes the model to ignore zones.
const BIOME_COLOR: Record<BiomeType | 'null', string> = {
  plains:    '#1d911d',  // grass    class  9
  forest:    '#b26b42',  // tree     class  4
  swamp:     '#53683f',  // grass+tree mix
  desert:    '#ffe599',  // sand     class 46
  tundra:    '#cce5ff',  // snow     class 17
  volcanic:  '#400000',  // earth    class 13
  ocean:     '#0066cc',  // water    class 21
  coastal:   '#00a8a8',  // sea      class 26
  mountains: '#808080',  // mountain class 16
  hills:     '#1d911d',  // treat as grass (closest ADE20K match)
  null:      '#cccccc',
};

const OVERLAY_COLOR: Record<OverlayType, string> = {
  river:  '#2196f3',
  road:   '#8d6e63',
  wall:   '#607d8b',
  coast:  '#4db6ac',
  border: '#f44336',
};

const OVERLAY_WIDTH: Record<OverlayType, number> = {
  river:  6,
  road:   4,
  wall:   5,
  coast:  6,
  border: 3,
};

// canyon / chasm are not in OverlayType but may appear via user data
const EXTRA_OVERLAY_COLOR: Record<string, string>  = { canyon: '#5d4037', chasm: '#000000' };
const EXTRA_OVERLAY_WIDTH: Record<string, number>  = { canyon: 8,         chasm: 10       };

const MODIFIER_COLOR: Record<ModifierType | string, string> = {
  cursed:       'rgba(33,33,33,0.30)',
  sacred:       'rgba(255,235,59,0.20)',
  magical:      'rgba(63,81,181,0.25)',
  blighted:     'rgba(244,67,54,0.25)',
  fertile:      'rgba(76,175,80,0.18)',
  ancient_ruins:'rgba(121,85,72,0.25)',
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

    // Relief overlay
    if (cell.relief) {
      switch (cell.relief) {
        case 'mountainous':
          drawReliefHatch(ctx, px, py, '#555555', 0.30, 'diagonal');
          break;
        case 'cliffs':
          drawReliefHatch(ctx, px, py, '#444444', 0.30, 'vertical');
          break;
        case 'hilly':
          drawReliefHatch(ctx, px, py, '#666666', 0.15, 'light');
          break;
        // flat / rolling / valley / plateau: no overlay
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

    const color = OVERLAY_COLOR[ov.type as OverlayType]
               ?? EXTRA_OVERLAY_COLOR[ov.type]
               ?? '#ffffff';
    const width = OVERLAY_WIDTH[ov.type as OverlayType]
               ?? EXTRA_OVERLAY_WIDTH[ov.type]
               ?? 4;

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

  console.log(`[sketchToPng] Rendered ${OUTPUT_PX}×${OUTPUT_PX} PNG — dataURL length: ${dataUrl.length} chars`);

  return dataUrl;
}
