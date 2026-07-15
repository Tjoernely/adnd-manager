/**
 * src/utils/canvas/proceduralMapRenderer.ts
 *
 * Deterministic, client-side procedural map renderer — no AI in the pipeline.
 * Input:  SketchSpec (cells + overlays)
 * Output: 1024×1024 PNG dataURL (canvas.toDataURL)
 *
 * Determinism: mulberry32 PRNG seeded with the map id — same sketch + same id
 * always renders the exact same map.
 *
 * Milestones:
 *   M1: biome interiors (continuous patterns) + marching-squares water/land
 *       contour + layered painted coast (glow / land / sand / foam).
 *   M1.5: border clamp, coastal-as-water, seamless swamp tile.
 *   M3 (pulled before M2): biome-to-biome blending + narrow lake shores.
 *   M2 (this pass): rivers, roads, canyons, chasms from spec.overlays.
 *   M4: relief stamps (pending).
 */

import type { SketchSpec } from '../../rules-engine/mapTypes';

// ── Constants ────────────────────────────────────────────────────────────────

const OUT  = 1024;
const GRID = 32;
const CELL = OUT / GRID; // 32px per cell

const ISO = 0.5;

// M1.5 BUG 2: coastal counts as WATER — the coastline (with sand band) lands
// on the land↔coastal border, and coastal↔ocean gets NO beach (soft blend).
const WATER_BIOMES = new Set(['ocean', 'lake', 'coastal']);

// Biome → repeating pattern tile (served from /tiles/, same source as the editor)
// swamp_flat_v2: seamless-fixed version (roll+blend + high-pass lightness
// flatten) shipped in the repo under public/tiles/ — the original swamp_flat
// on the server tiles into a visible patchwork (M1.5 BUG 3).
const BIOME_PATTERN_TILE: Record<string, string> = {
  plains:   'plains_flat',
  forest:   'forest_flat',
  swamp:    'swamp_flat_v2',
  desert:   'desert_flat',
  tundra:   'tundra_flat',
  volcanic: 'volcanic_flat',
};

// Fallbacks when a tile fails to load
const BIOME_FALLBACK: Record<string, string> = {
  plains: '#c8d878', forest: '#2a6e2a', swamp: '#3a5a2a',
  desert: '#d4b060', tundra: '#b8cede', volcanic: '#3c1818',
  coastal: '#e2c78d',
};

const OCEAN_FALLBACK = '#1a3e7e';
const LAKE_FALLBACK  = '#1a5ea2';

// Coastal (shallow) water: lighter teal overlay on the ocean texture,
// soft-blended (blurred mask) since coastal↔ocean is water↔water.
const COASTAL_TINT       = '#4a9aa8';
const COASTAL_TINT_ALPHA = 0.55;
const COASTAL_BLUR_PX    = 12;

// Reef details on coastal cells with variant='reef' (M2.5 bugfix: the reef
// tile used to collapse into plain shallow water).
const REEF_DARK  = '#2a6a6a';
const REEF_FOAM  = '#d8f0f0';

// Coast palette
const SAND        = '#e2c78d';
const SAND_INNER  = '#eed69e';
const FOAM        = '#f8fafa';
const GLOW        = '#3aa8a8';

// Per-water-type coast band styles (M3 rest: lakes get narrower bands).
// glow: [alpha, strokeWidth] passes. Widths in px at 1024.
const COAST_STYLE = {
  ocean: { glow: [[0.5, 46], [0.4, 30]], glowBlur: 18, sandHalf: 8, foamWidth: 3, foamOffset: 11 },
  lake:  { glow: [[0.5, 16], [0.4, 10]], glowBlur: 8,  sandHalf: 4, foamWidth: 2, foamOffset: 7  },
} as const;

// Overlay (river/road/canyon/chasm) palette — M2
const RIVER_UNDER  = '#1a5a8a';
const RIVER_CORE   = '#4a9aca';
const RIVER_LIGHT  = '#7ec8e8';
const ROAD_UNDER   = '#6a5238';
const ROAD_CORE    = '#8a6a4a';
const CANYON_DARK  = '#3a2a1a';
const CHASM_DARK   = '#0a0a0a';

// M2.5 road subtypes + water crossings.
// Legacy 'road' renders as 'road_dirt' (no data migration).
const PATH_COLOR    = '#9a8a6a';
const COBBLE_UNDER  = '#55544c';
const COBBLE_CORE   = '#8f8f8a';
const BRIDGE_WOOD   = '#7a5a3a';
const BRIDGE_PLANK  = '#4a3520';
const BRIDGE_RAIL   = '#3a2a18';
const BRIDGE_STONE  = '#9a9a94';
const BRIDGE_STONE_MID = '#b0b0aa';
const FORD_STONE    = '#8a8578';
const FORD_EDGE     = '#55503f';

const ROAD_KINDS = new Set(['road', 'road_path', 'road_dirt', 'road_cobble']);

// ── Seeded PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Derive a 32-bit seed from a map id (number or string). */
export function seedFromMapId(id: number | string | null | undefined): number {
  if (typeof id === 'number' && Number.isFinite(id)) return Math.imul(id, 2654435761) >>> 0;
  const s = String(id ?? 'sketch');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ── Geometry helpers ─────────────────────────────────────────────────────────

type Pt = { x: number; y: number };

function polyArcLengths(pts: Pt[]): { s: number[]; total: number } {
  const n = pts.length;
  const s = new Array<number>(n);
  let total = 0;
  for (let i = 0; i < n; i++) {
    s[i] = total;
    const q = pts[(i + 1) % n];
    total += Math.hypot(q.x - pts[i].x, q.y - pts[i].y);
  }
  return { s, total };
}

/** Outward unit normal at each point of a closed polyline (right of travel dir). */
function polyNormals(pts: Pt[]): Pt[] {
  const n = pts.length;
  const out = new Array<Pt>(n);
  for (let i = 0; i < n; i++) {
    const p = pts[(i - 1 + n) % n];
    const q = pts[(i + 1) % n];
    const tx = q.x - p.x, ty = q.y - p.y;
    const len = Math.hypot(tx, ty) || 1;
    out[i] = { x: ty / len, y: -tx / len };
  }
  return out;
}

function offsetClosed(pts: Pt[], normals: Pt[], d: number): Pt[] {
  return pts.map((p, i) => ({ x: p.x + normals[i].x * d, y: p.y + normals[i].y * d }));
}

function chaikinClosed(pts: Pt[], iterations: number): Pt[] {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length > 6000) break; // safety cap
    const out: Pt[] = [];
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    p = out;
  }
  return p;
}

/**
 * Layered-sine jitter along the normal. Frequencies are integer cycle counts
 * so the displacement is continuous across the closed-loop seam.
 */
function jitterClosed(pts: Pt[], normals: Pt[], rng: () => number): Pt[] {
  const { s, total } = polyArcLengths(pts);
  if (total < 60) return pts;
  const f1 = Math.max(1, Math.round(total / 260));
  const f2 = Math.max(2, Math.round(total / 100));
  const f3 = Math.max(3, Math.round(total / 42));
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;
  const TAU = Math.PI * 2;
  return pts.map((p, i) => {
    const u = s[i] / total;
    const d = 2.1 * Math.sin(TAU * f1 * u + p1)
            + 1.2 * Math.sin(TAU * f2 * u + p2)
            + 0.7 * Math.sin(TAU * f3 * u + p3);
    return { x: p.x + normals[i].x * d, y: p.y + normals[i].y * d };
  });
}

function addPolyToPath(path: Path2D, pts: Pt[]): void {
  if (pts.length < 3) return;
  path.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
  path.closePath();
}

// ── Open-polyline helpers (overlays: rivers / roads / canyons / chasms) ─────

function chaikinOpen(pts: Pt[], iterations: number): Pt[] {
  let p = pts;
  for (let k = 0; k < iterations; k++) {
    if (p.length < 3 || p.length > 6000) break;
    const out: Pt[] = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    out.push(p[p.length - 1]);
    p = out;
  }
  return p;
}

/** Unit normals along an open polyline (one-sided at the endpoints). */
function openNormals(pts: Pt[]): Pt[] {
  const n = pts.length;
  const out = new Array<Pt>(n);
  for (let i = 0; i < n; i++) {
    const p = pts[Math.max(0, i - 1)];
    const q = pts[Math.min(n - 1, i + 1)];
    const tx = q.x - p.x, ty = q.y - p.y;
    const len = Math.hypot(tx, ty) || 1;
    out[i] = { x: ty / len, y: -tx / len };
  }
  return out;
}

/**
 * Light layered-sine jitter for open overlay paths (~2-3px), tapered to zero
 * at the endpoints so mouths/junctions stay where the user drew them.
 */
function jitterOpen(pts: Pt[], normals: Pt[], rng: () => number): Pt[] {
  const n = pts.length;
  const s = new Array<number>(n);
  let L = 0;
  for (let i = 0; i < n; i++) {
    s[i] = L;
    if (i < n - 1) L += Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
  }
  if (L < 24) return pts;
  const f1 = L / 180, f2 = L / 70, f3 = L / 30;
  const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2, p3 = rng() * Math.PI * 2;
  const TAU = Math.PI * 2;
  return pts.map((p, i) => {
    const u = s[i] / L;
    const taper = Math.min(1, s[i] / 20, (L - s[i]) / 20);
    const d = (1.4 * Math.sin(TAU * f1 * u + p1)
             + 0.8 * Math.sin(TAU * f2 * u + p2)
             + 0.5 * Math.sin(TAU * f3 * u + p3)) * taper;
    return { x: p.x + normals[i].x * d, y: p.y + normals[i].y * d };
  });
}

function strokeOpenPoly(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  width: number,
  color: string,
  alpha = 1,
  dash: number[] | null = null,
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  if (dash) ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.restore();
}

/** Resample an open polyline to (roughly) evenly spaced points, `step` px apart. */
function resamplePath(pts: Pt[], step: number): Pt[] {
  if (pts.length < 2) return pts.slice();
  const out: Pt[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    let a = pts[i - 1];
    const b = pts[i];
    let seg = Math.hypot(b.x - a.x, b.y - a.y);
    while (carry + seg >= step) {
      const t = (step - carry) / seg;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      seg -= step - carry;
      carry = 0;
      a = p;
    }
    carry += seg;
  }
  const last = pts[pts.length - 1];
  const tail = out[out.length - 1];
  if (Math.hypot(last.x - tail.x, last.y - tail.y) > 0.5) out.push(last);
  return out;
}

/** Extend an open polyline by `ext` px past both endpoints (bridge abutments). */
function extendRun(pts: Pt[], ext: number): Pt[] {
  if (pts.length < 2 || ext <= 0) return pts;
  const [a0, a1] = [pts[0], pts[1]];
  let dx = a0.x - a1.x, dy = a0.y - a1.y, l = Math.hypot(dx, dy) || 1;
  const head = { x: a0.x + (dx / l) * ext, y: a0.y + (dy / l) * ext };
  const [b1, b0] = [pts[pts.length - 2], pts[pts.length - 1]];
  dx = b0.x - b1.x; dy = b0.y - b1.y; l = Math.hypot(dx, dy) || 1;
  const tail = { x: b0.x + (dx / l) * ext, y: b0.y + (dy / l) * ext };
  return [head, ...pts, tail];
}

/** Canyon/chasm: two parallel edge lines ±offset with a dark fill between. */
function drawGorge(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  offset: number,
  color: string,
  fillAlpha: number,
): void {
  if (pts.length < 2) return;
  const ns = openNormals(pts);
  const a = pts.map((p, i) => ({ x: p.x + ns[i].x * offset, y: p.y + ns[i].y * offset }));
  const b = pts.map((p, i) => ({ x: p.x - ns[i].x * offset, y: p.y - ns[i].y * offset }));
  ctx.save();
  ctx.globalAlpha = fillAlpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(a[0].x, a[0].y);
  for (let i = 1; i < a.length; i++) ctx.lineTo(a[i].x, a[i].y);
  for (let i = b.length - 1; i >= 0; i--) ctx.lineTo(b[i].x, b[i].y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  strokeOpenPoly(ctx, a, 3, color);
  strokeOpenPoly(ctx, b, 3, color);
}

// ── M2.5 water crossings ─────────────────────────────────────────────────────

function offsetOpen(pts: Pt[], normals: Pt[], d: number): Pt[] {
  return pts.map((p, i) => ({ x: p.x + normals[i].x * d, y: p.y + normals[i].y * d }));
}

/** road_dirt crossing: wooden bridge — deck, cross planks, railings. */
function drawWoodBridge(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  strokeOpenPoly(ctx, pts, 8, BRIDGE_WOOD);                    // deck
  const planks = resamplePath(pts, 5);                         // cross planks ~5px
  const pns = openNormals(planks);
  ctx.save();
  ctx.strokeStyle = BRIDGE_PLANK;
  ctx.lineWidth   = 1.5;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  for (let i = 0; i < planks.length; i++) {
    const p = planks[i], n = pns[i];
    ctx.moveTo(p.x - n.x * 4, p.y - n.y * 4);
    ctx.lineTo(p.x + n.x * 4, p.y + n.y * 4);
  }
  ctx.stroke();
  ctx.restore();
  const ns = openNormals(pts);                                 // railings ±4px
  strokeOpenPoly(ctx, offsetOpen(pts, ns, +4), 1.2, BRIDGE_RAIL);
  strokeOpenPoly(ctx, offsetOpen(pts, ns, -4), 1.2, BRIDGE_RAIL);
}

/** road_cobble crossing: stone bridge — outlined grey deck + light midline. */
function drawStoneBridge(ctx: CanvasRenderingContext2D, pts: Pt[]): void {
  if (pts.length < 2) return;
  strokeOpenPoly(ctx, pts, 14, COBBLE_UNDER);       // 2px dark outline around…
  strokeOpenPoly(ctx, pts, 10, BRIDGE_STONE);       // …the 10px grey deck
  strokeOpenPoly(ctx, pts, 2, BRIDGE_STONE_MID);    // lighter midline
}

/** road_path crossing: ford — stepping stones, no path line over the water. */
function drawFord(ctx: CanvasRenderingContext2D, pts: Pt[], rng: () => number): void {
  if (pts.length < 1) return;
  const stones = resamplePath(pts, 7);
  const ns = openNormals(stones);
  ctx.save();
  ctx.lineWidth = 0.8;
  for (let i = 0; i < stones.length; i++) {
    const n = ns[i];
    const t = { x: -n.y, y: n.x }; // tangent
    const p = {
      x: stones[i].x + n.x * (rng() - 0.5) * 3 + t.x * (rng() - 0.5) * 2,
      y: stones[i].y + n.y * (rng() - 0.5) * 3 + t.y * (rng() - 0.5) * 2,
    };
    const rx = 2.0 * (0.85 + rng() * 0.35);  // ~3×4px ellipses
    const ry = 1.5 * (0.85 + rng() * 0.35);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, rx, ry, Math.atan2(t.y, t.x), 0, Math.PI * 2);
    ctx.fillStyle = FORD_STONE;
    ctx.fill();
    ctx.strokeStyle = FORD_EDGE;
    ctx.stroke();
  }
  ctx.restore();
}

/** Land-portion road rendering per road kind ('road' legacy = dirt). */
function drawRoadLand(ctx: CanvasRenderingContext2D, pts: Pt[], kind: string): void {
  if (pts.length < 2) return;
  if (kind === 'road_path') {
    strokeOpenPoly(ctx, pts, 2, PATH_COLOR, 1, [6, 5]);
  } else if (kind === 'road_cobble') {
    strokeOpenPoly(ctx, pts, 6, COBBLE_UNDER);
    strokeOpenPoly(ctx, pts, 4, COBBLE_CORE);        // solid — paved road
  } else { // road_dirt (+ legacy 'road')
    strokeOpenPoly(ctx, pts, 5, ROAD_UNDER, 0.5);
    strokeOpenPoly(ctx, pts, 3, ROAD_CORE, 1, [10, 6]);
  }
}

// ── Land field + marching squares ────────────────────────────────────────────

/**
 * Corner field over the 32×32 cell grid, padded with one ring of water so
 * every contour closes. Corner (i,j) for i,j ∈ [-1, 33]; value = mean land
 * of the 4 adjacent cells (out-of-grid cells count as water).
 */
function buildCornerField(land: Uint8Array): (i: number, j: number) => number {
  const vals = new Float32Array(33 * 33);
  for (let j = 0; j <= 32; j++) {
    for (let i = 0; i <= 32; i++) {
      let sum = 0;
      for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
        const cx = i + dx, cy = j + dy;
        if (cx >= 0 && cx < GRID && cy >= 0 && cy < GRID) sum += land[cy * GRID + cx];
      }
      vals[j * 33 + i] = sum / 4;
    }
  }
  // Lone-island boost: a land cell whose 4 corners are all below ISO would
  // vanish entirely — lift its corners so it survives as a small diamond isle.
  for (let cy = 0; cy < GRID; cy++) {
    for (let cx = 0; cx < GRID; cx++) {
      if (!land[cy * GRID + cx]) continue;
      const corners = [[cx, cy], [cx + 1, cy], [cx, cy + 1], [cx + 1, cy + 1]];
      if (corners.every(([i, j]) => vals[j * 33 + i] < ISO)) {
        for (const [i, j] of corners) vals[j * 33 + i] = Math.max(vals[j * 33 + i], 0.55);
      }
    }
  }
  return (i, j) => (i < 0 || i > 32 || j < 0 || j > 32) ? 0 : vals[j * 33 + i];
}

/** Marching squares at iso 0.5 → closed contours in corner coordinates. */
function marchingSquares(f: (i: number, j: number) => number): Pt[][] {
  type Seg = { a: Pt; b: Pt };
  const segs: Seg[] = [];

  const lerp = (xa: number, ya: number, va: number, xb: number, yb: number, vb: number): Pt => {
    const t = (ISO - va) / (vb - va);
    return { x: xa + t * (xb - xa), y: ya + t * (yb - ya) };
  };

  for (let j = -1; j <= 32; j++) {
    for (let i = -1; i <= 32; i++) {
      const v0 = f(i, j),         v1 = f(i + 1, j);
      const v3 = f(i, j + 1),     v2 = f(i + 1, j + 1);
      const b0 = v0 >= ISO ? 1 : 0, b1 = v1 >= ISO ? 1 : 0;
      const b2 = v2 >= ISO ? 1 : 0, b3 = v3 >= ISO ? 1 : 0;
      const idx = b0 | (b1 << 1) | (b2 << 2) | (b3 << 3);
      if (idx === 0 || idx === 15) continue;

      const top    = () => lerp(i, j, v0, i + 1, j, v1);
      const right  = () => lerp(i + 1, j, v1, i + 1, j + 1, v2);
      const bottom = () => lerp(i, j + 1, v3, i + 1, j + 1, v2);
      const left   = () => lerp(i, j, v0, i, j + 1, v3);

      switch (idx) {
        case 1:  segs.push({ a: left(),   b: top()    }); break;
        case 2:  segs.push({ a: top(),    b: right()  }); break;
        case 3:  segs.push({ a: left(),   b: right()  }); break;
        case 4:  segs.push({ a: right(),  b: bottom() }); break;
        case 5:  segs.push({ a: left(),   b: top()    });
                 segs.push({ a: right(),  b: bottom() }); break;
        case 6:  segs.push({ a: top(),    b: bottom() }); break;
        case 7:  segs.push({ a: left(),   b: bottom() }); break;
        case 8:  segs.push({ a: bottom(), b: left()   }); break;
        case 9:  segs.push({ a: top(),    b: bottom() }); break;
        case 10: segs.push({ a: top(),    b: right()  });
                 segs.push({ a: bottom(), b: left()   }); break;
        case 11: segs.push({ a: right(),  b: bottom() }); break;
        case 12: segs.push({ a: right(),  b: left()   }); break;
        case 13: segs.push({ a: top(),    b: right()  }); break;
        case 14: segs.push({ a: left(),   b: top()    }); break;
      }
    }
  }

  // Stitch segments into closed loops. Endpoint coordinates are computed from
  // the same corner values in adjacent squares, so keys match exactly.
  const key = (p: Pt) => `${Math.round(p.x * 4096)},${Math.round(p.y * 4096)}`;
  const byStart = new Map<string, number[]>();
  segs.forEach((sg, i) => {
    for (const k of [key(sg.a), key(sg.b)]) {
      const arr = byStart.get(k);
      if (arr) arr.push(i); else byStart.set(k, [i]);
    }
  });

  const used = new Array<boolean>(segs.length).fill(false);
  const contours: Pt[][] = [];

  for (let start = 0; start < segs.length; start++) {
    if (used[start]) continue;
    used[start] = true;
    const loop: Pt[] = [segs[start].a, segs[start].b];
    let headKey = key(segs[start].b);
    const startKey = key(segs[start].a);

    let guard = segs.length + 4;
    while (headKey !== startKey && guard-- > 0) {
      const candidates = byStart.get(headKey) ?? [];
      let nextIdx = -1;
      for (const ci of candidates) if (!used[ci]) { nextIdx = ci; break; }
      if (nextIdx === -1) break; // open chain (shouldn't happen with padded field)
      used[nextIdx] = true;
      const sg = segs[nextIdx];
      const next = key(sg.a) === headKey ? sg.b : sg.a;
      loop.push(next);
      headKey = key(next);
    }
    loop.pop(); // last point == first point
    if (loop.length >= 3) contours.push(loop);
  }
  return contours;
}

// ── Tile loading ─────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const img = new window.Image();
    img.onload  = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src     = src;
  });
}

// ── Main export ──────────────────────────────────────────────────────────────

export async function renderProceduralMap(
  spec: SketchSpec,
  mapId: number | string | null | undefined,
): Promise<string> {
  const rng = mulberry32(seedFromMapId(mapId));

  const canvas  = document.createElement('canvas');
  canvas.width  = OUT;
  canvas.height = OUT;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;

  // Cell lookup + land classification (missing/unpainted cells count as water)
  const cells = spec.cells ?? [];
  const land = new Uint8Array(GRID * GRID);
  const biomeAt = new Array<string | null>(GRID * GRID).fill(null);
  for (const c of cells) {
    if (c.x < 0 || c.x >= GRID || c.y < 0 || c.y >= GRID) continue;
    biomeAt[c.y * GRID + c.x] = c.biome;
    if (!WATER_BIOMES.has(c.biome)) land[c.y * GRID + c.x] = 1;
  }

  // Load the pattern tiles we actually need
  const landBiomes = new Set<string>();
  let hasLake = false, hasCoastal = false;
  for (let k = 0; k < GRID * GRID; k++) {
    const b = biomeAt[k];
    if (!b) continue;
    if (b === 'lake') hasLake = true;
    else if (b === 'coastal') hasCoastal = true;
    else if (!WATER_BIOMES.has(b)) landBiomes.add(b);
  }
  const tileKeys = new Set<string>(['ocean_deep']);
  if (hasLake) tileKeys.add('inland_lake');
  for (const b of landBiomes) if (BIOME_PATTERN_TILE[b]) tileKeys.add(BIOME_PATTERN_TILE[b]);

  const tiles: Record<string, HTMLImageElement | null> = {};
  await Promise.all([...tileKeys].map(async k => { tiles[k] = await loadImage(`/tiles/${k}.png`); }));

  const offscreen = (): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const c = document.createElement('canvas');
    c.width = OUT; c.height = OUT;
    return [c, c.getContext('2d')!];
  };

  const patternOf = (
    target: CanvasRenderingContext2D,
    tileKey: string,
    fallback: string,
  ): CanvasPattern | string => {
    const img = tiles[tileKey];
    if (img && img.naturalWidth > 0) {
      const p = target.createPattern(img, 'repeat');
      if (p) return p; // anchored at canvas origin → texture continues across cells
    }
    return fallback;
  };

  // Rect-union path per biome (one fill pass per biome — continuous pattern)
  const biomeRectPath = (biome: string): Path2D => {
    const path = new Path2D();
    for (let cy = 0; cy < GRID; cy++)
      for (let cx = 0; cx < GRID; cx++)
        if (biomeAt[cy * GRID + cx] === biome) path.rect(cx * CELL, cy * CELL, CELL, CELL);
    return path;
  };

  // ── STEP 1a: water background (whole canvas) ──────────────────────────────
  ctx.fillStyle = patternOf(ctx, 'ocean_deep', OCEAN_FALLBACK);
  ctx.fillRect(0, 0, OUT, OUT);
  // Subtle depth vignette to break up visible tiling
  const vg = ctx.createRadialGradient(OUT / 2, OUT / 2, OUT * 0.25, OUT / 2, OUT / 2, OUT * 0.72);
  vg.addColorStop(0, 'rgba(30,70,120,0)');
  vg.addColorStop(1, 'rgba(8,20,44,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, OUT, OUT);

  // Lake cells: pre-fill with lake pattern (visible through land-contour holes)
  if (hasLake) {
    ctx.fillStyle = patternOf(ctx, 'inland_lake', LAKE_FALLBACK);
    ctx.fill(biomeRectPath('lake'));
  }

  // ── Coastal (shallow) water: lighter teal, soft-blended toward ocean ──────
  // coastal↔ocean is water↔water — no beach, just a 12px blurred transition.
  // The land side of the blur gets painted over by the land fill + sand band.
  if (hasCoastal) {
    const [hard, hctx] = offscreen();
    hctx.fillStyle = '#fff';
    hctx.fill(biomeRectPath('coastal'));
    const [soft, sctx] = offscreen();
    sctx.filter = `blur(${COASTAL_BLUR_PX}px)`;
    sctx.drawImage(hard, 0, 0);
    sctx.filter = 'none';
    const [tint, tctx] = offscreen();
    tctx.fillStyle = COASTAL_TINT;
    tctx.fillRect(0, 0, OUT, OUT);
    tctx.globalCompositeOperation = 'destination-in';
    tctx.drawImage(soft, 0, 0);
    ctx.save();
    ctx.globalAlpha = COASTAL_TINT_ALPHA;
    ctx.drawImage(tint, 0, 0);
    ctx.restore();
  }

  // ── Reef details: coastal cells with variant='reef' (legacy: tileKey
  // 'reef') get scattered dark submerged-rock dots + a few foam specks,
  // clipped to the reef area through a 6px-blurred mask (organic edge).
  const reefCells = cells.filter(c =>
    ((c as { variant?: string }).variant === 'reef' ||
     (c as { tileKey?: string }).tileKey === 'reef') &&
    c.x >= 0 && c.x < GRID && c.y >= 0 && c.y < GRID);
  if (reefCells.length > 0) {
    const reefRng = mulberry32((seedFromMapId(mapId) ^ 0x5eef) >>> 0);
    const [dots, dctx] = offscreen();
    for (const c of reefCells) {
      const px = c.x * CELL, py = c.y * CELL;
      const nDark = 8 + Math.floor(reefRng() * 5);      // 8-12 dark spots
      for (let i = 0; i < nDark; i++) {
        const r = 1 + reefRng() * 1;                    // 2-4px diameter
        dctx.beginPath();
        dctx.arc(px + reefRng() * CELL, py + reefRng() * CELL, r, 0, Math.PI * 2);
        dctx.fillStyle = REEF_DARK;
        dctx.globalAlpha = 0.65 + reefRng() * 0.25;
        dctx.fill();
      }
      const nFoam = 2 + Math.floor(reefRng() * 3);      // a few foam specks
      for (let i = 0; i < nFoam; i++) {
        dctx.beginPath();
        dctx.arc(px + reefRng() * CELL, py + reefRng() * CELL, 0.5 + reefRng() * 0.5, 0, Math.PI * 2);
        dctx.fillStyle = REEF_FOAM;
        dctx.globalAlpha = 0.8;
        dctx.fill();
      }
    }
    dctx.globalAlpha = 1;
    const [reefHard, rhctx] = offscreen();
    rhctx.fillStyle = '#fff';
    const reefPath = new Path2D();
    for (const c of reefCells) reefPath.rect(c.x * CELL, c.y * CELL, CELL, CELL);
    rhctx.fill(reefPath);
    const [reefSoft, rsctx] = offscreen();
    rsctx.filter = 'blur(6px)';
    rsctx.drawImage(reefHard, 0, 0);
    rsctx.filter = 'none';
    dctx.globalCompositeOperation = 'destination-in';
    dctx.drawImage(reefSoft, 0, 0);
    dctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dots, 0, 0);
  }

  const anyLand = land.some(v => v === 1);
  if (!anyLand) return canvas.toDataURL('image/png');

  // ── STEP 2: water/land boundary — marching squares + smoothing + jitter ──
  const field = buildCornerField(land);
  const rawContours = marchingSquares(field);

  type Contour = {
    pts: Pt[]; normals: Pt[]; landSign: number; length: number;
    style: (typeof COAST_STYLE)['ocean' | 'lake'];
  };
  const contours: Contour[] = [];

  // Which biome cell sits at a pixel position (null = unpainted / off-grid)
  const biomePxAt = (x: number, y: number): string | null => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    if (cx < 0 || cx >= GRID || cy < 0 || cy >= GRID) return null;
    return biomeAt[cy * GRID + cx];
  };

  // Bilinear sample of the corner field at pixel coords (for landward detection)
  const fieldAtPx = (x: number, y: number): number => {
    const gx = x / CELL, gy = y / CELL;
    const i0 = Math.floor(gx), j0 = Math.floor(gy);
    const tx = gx - i0, ty = gy - j0;
    return field(i0, j0) * (1 - tx) * (1 - ty) + field(i0 + 1, j0) * tx * (1 - ty)
         + field(i0, j0 + 1) * (1 - tx) * ty  + field(i0 + 1, j0 + 1) * tx * ty;
  };

  // M1.5 BUG 1: land running off the map edge must NOT get a coast band.
  // The padded field closes every contour with segments along the canvas
  // border; clamp-equivalent fix: push those artificial border points far
  // off-canvas (48px) so glow/sand/foam along them render outside the image
  // while the contour stays CLOSED (the land clip still covers to the edge).
  // Coast therefore only appears at real land/water borders inside the map.
  const EDGE_EPS = 1e-4;
  const pushBorderOut = (raw: Pt[]): Pt[] => {
    const pushed = raw.map(p => ({
      x: p.x <= EDGE_EPS ? -1.5 : p.x >= GRID - EDGE_EPS ? GRID + 1.5 : p.x,
      y: p.y <= EDGE_EPS ? -1.5 : p.y >= GRID - EDGE_EPS ? GRID + 1.5 : p.y,
    }));
    // drop consecutive duplicates the push may have created
    return pushed.filter((p, i, a) => {
      const q = a[(i - 1 + a.length) % a.length];
      return Math.abs(p.x - q.x) > 1e-6 || Math.abs(p.y - q.y) > 1e-6;
    });
  };

  for (const rawContour of rawContours) {
    const raw = pushBorderOut(rawContour);
    if (raw.length < 3) continue;
    // corner coords → px
    let pts = raw.map(p => ({ x: p.x * CELL, y: p.y * CELL }));
    pts = chaikinClosed(pts, 4);
    let normals = polyNormals(pts);
    pts = jitterClosed(pts, normals, rng);
    normals = polyNormals(pts);

    const { total } = polyArcLengths(pts);
    if (total < 30) continue;

    // Which side of the contour is land? Sample the field on both sides.
    let landward = 0;
    const samples = Math.min(7, pts.length);
    for (let k = 0; k < samples; k++) {
      const i = Math.floor((k / samples) * pts.length);
      const p = pts[i], n = normals[i];
      landward += fieldAtPx(p.x + n.x * 5, p.y + n.y * 5)
                - fieldAtPx(p.x - n.x * 5, p.y - n.y * 5);
    }
    const landSign = landward >= 0 ? 1 : -1;

    // Lake or ocean shore? Sample the biome on the WATER side of the contour —
    // lake-enclosing contours get the narrow band style (M3 rest).
    let lakeVotes = 0, seaVotes = 0;
    for (let k = 0; k < samples; k++) {
      const i = Math.floor((k / samples) * pts.length);
      const p = pts[i], n = normals[i];
      const b = biomePxAt(p.x - n.x * landSign * 6, p.y - n.y * landSign * 6);
      if (b === 'lake') lakeVotes++;
      else if (b === 'ocean' || b === 'coastal' || b === null) seaVotes++;
    }
    const style = lakeVotes > seaVotes ? COAST_STYLE.lake : COAST_STYLE.ocean;

    contours.push({ pts, normals, landSign, length: total, style });
  }

  // Combined land path (evenodd: outer shells fill, lake holes cut out)
  const landPath = new Path2D();
  for (const c of contours) addPolyToPath(landPath, c.pts);

  // M2.5: soft land mask (white=land, 5px gaussian edge) — clips the rivers
  // (they fade out ~10px into ANY water: ocean, coastal, lakes) and drives
  // land/water classification of road samples for bridges & fords.
  const [maskHard, maskHardCtx] = offscreen();
  maskHardCtx.fillStyle = '#fff';
  maskHardCtx.fill(landPath, 'evenodd');
  const [maskSoft, maskSoftCtx] = offscreen();
  maskSoftCtx.filter = 'blur(5px)';
  maskSoftCtx.drawImage(maskHard, 0, 0);
  maskSoftCtx.filter = 'none';

  // ── STEP 3a: teal coast glow (under the land fill) ────────────────────────
  // Per contour: lakes glow narrower than the ocean (COAST_STYLE).
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  for (const c of contours) {
    const path = new Path2D();
    addPolyToPath(path, c.pts);
    for (const [alpha, width] of c.style.glow) {
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = GLOW;
      ctx.lineWidth   = width;
      ctx.shadowColor = GLOW;
      ctx.shadowBlur  = c.style.glowBlur;
      ctx.stroke(path);
    }
  }
  ctx.restore();

  // ── STEP 1b/3b + M3: land fill — biome interiors with soft blended borders,
  // clipped to the smooth contour.
  // M3 blending: per land biome, build a mask of its cells dilated ~10px and
  // gaussian-blurred 7px, then draw its pattern through that mask. Composited
  // source-over in a fixed order, adjacent biomes crossfade over ~15px instead
  // of cell-staircase edges. Relief is NOT part of the mask — biome only.
  ctx.save();
  ctx.clip(landPath, 'evenodd');
  // Sand underlay: covers any sliver where the jittered contour bulges past
  // the blocky cell rects (the blurred biome masks also fade out at the coast).
  ctx.fillStyle = SAND;
  ctx.fillRect(0, 0, OUT, OUT);
  if (landBiomes.size > 0) {
    const [layer, lctx] = offscreen();
    for (const biome of [...landBiomes].sort()) {
      const rects = biomeRectPath(biome);
      const [hard, hctx] = offscreen();
      hctx.fillStyle = '#fff';
      hctx.fill(rects);
      hctx.strokeStyle = '#fff';
      hctx.lineWidth = 20;            // ±10px → ~10px outward dilation
      hctx.stroke(rects);
      const [soft, sctx] = offscreen();
      sctx.filter = 'blur(7px)';
      sctx.drawImage(hard, 0, 0);
      sctx.filter = 'none';
      const [pat, pctx] = offscreen();
      pctx.fillStyle = patternOf(pctx, BIOME_PATTERN_TILE[biome], BIOME_FALLBACK[biome] ?? '#888');
      pctx.fillRect(0, 0, OUT, OUT);
      pctx.globalCompositeOperation = 'destination-in';
      pctx.drawImage(soft, 0, 0);
      lctx.drawImage(pat, 0, 0);
    }
    ctx.drawImage(layer, 0, 0);
  }
  ctx.restore();

  // ── M2: rivers, canyons, chasms — AFTER biome fill/blending, BEFORE the
  // sand band, so a river mouth runs naturally UNDER the beach into the sea.
  const overlays = (spec.overlays ?? []).filter(o => o.points && o.points.length >= 2);
  const baseSeed = seedFromMapId(mapId);
  const prepared = overlays.map((o, idx) => {
    const orng = mulberry32((baseSeed + idx) >>> 0); // seed per overlay
    let pts = o.points.map(p => ({ x: (p.x + 0.5) * CELL, y: (p.y + 0.5) * CELL }));
    pts = chaikinOpen(pts, 3);
    pts = jitterOpen(pts, openNormals(pts), orng);
    return { type: o.type as string, pts, idx };
  });

  // Rivers render on an offscreen layer masked by the soft land mask
  // (destination-in) — they fade out over ~10px wherever they meet water
  // instead of drawing on top of ocean/coastal/lakes.
  const rivers = prepared.filter(o => o.type === 'river');
  if (rivers.length > 0) {
    const [riverLayer, rlctx] = offscreen();
    for (const o of rivers) {
      strokeOpenPoly(rlctx, o.pts, 9, RIVER_UNDER, 0.9);
      strokeOpenPoly(rlctx, o.pts, 5, RIVER_CORE);
      strokeOpenPoly(rlctx, o.pts, 2, RIVER_LIGHT, 0.6);
    }
    rlctx.globalCompositeOperation = 'destination-in';
    rlctx.drawImage(maskSoft, 0, 0);
    rlctx.globalCompositeOperation = 'source-over';
    ctx.drawImage(riverLayer, 0, 0);
  }

  for (const o of prepared) {
    if (o.type === 'canyon')     drawGorge(ctx, o.pts, 3, CANYON_DARK, 0.4);
    else if (o.type === 'chasm') drawGorge(ctx, o.pts, 5, CHASM_DARK, 0.75);
  }

  // ── STEP 3c: sand band — filled ring polygon (offset curves ±sandHalf) ────
  // NOT a wide polyline: offset-ring fill avoids visible joint breaks.
  // Lakes get the narrow band (±4px), the ocean the wide one (±8px).
  for (const c of contours) {
    const half = c.style.sandHalf;
    const landN = c.normals.map(n => ({ x: n.x * c.landSign, y: n.y * c.landSign }));
    const outer = offsetClosed(c.pts, landN, +half); // landward edge
    const inner = offsetClosed(c.pts, landN, -half); // seaward edge

    const ring = new Path2D();
    addPolyToPath(ring, outer);
    addPolyToPath(ring, inner);
    ctx.fillStyle = SAND;
    ctx.fill(ring, 'evenodd');

    // Lighter inner (landward) edge of the band
    const hi = new Path2D();
    addPolyToPath(hi, outer);
    addPolyToPath(hi, offsetClosed(c.pts, landN, half * 0.25));
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = SAND_INNER;
    ctx.fill(hi, 'evenodd');
    ctx.restore();
  }

  // ── STEP 3d: foam — broken strokes along the seaward side ─────────────────
  ctx.save();
  // Clip to the water side: full-canvas rect + land contours with evenodd
  const waterClip = new Path2D();
  waterClip.rect(0, 0, OUT, OUT);
  for (const c of contours) addPolyToPath(waterClip, c.pts);
  ctx.clip(waterClip, 'evenodd');

  ctx.strokeStyle = FOAM;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowColor = FOAM;
  ctx.shadowBlur  = 3;
  ctx.globalAlpha = 0.8;

  for (const c of contours) {
    ctx.lineWidth = c.style.foamWidth;
    const seaN = c.normals.map(n => ({ x: -n.x * c.landSign, y: -n.y * c.landSign }));
    const foamPts = offsetClosed(c.pts, seaN, c.style.foamOffset);
    const n = foamPts.length;
    let i = 0;
    while (i < n - 2) {
      const segLen = 6 + Math.floor(rng() * 9);   // 6–14 points per piece
      const draw   = rng() < 0.75;                // ~75% of pieces drawn
      if (draw) {
        const end = Math.min(i + segLen, n - 1);
        ctx.beginPath();
        ctx.moveTo(foamPts[i].x, foamPts[i].y);
        for (let k = i + 1; k <= end; k++) ctx.lineTo(foamPts[k].x, foamPts[k].y);
        ctx.stroke();
      }
      i += segLen + 2 + Math.floor(rng() * 4);    // gap between pieces
    }
  }
  ctx.restore();

  // ── M2/M2.5: roads — drawn LAST, on top of all terrain (incl. the sand
  // band and rivers). The path is sampled every ~4px against the land mask
  // WITH the river ribbons punched out (a road over a river is a water
  // crossing too); contiguous water runs become crossings rendered per kind:
  // road_path → ford (stepping stones), road_dirt → wooden bridge,
  // road_cobble → stone bridge. Land runs get the normal road style.
  const anyRoads = prepared.some(o => ROAD_KINDS.has(o.type));
  let landMaskAt: (x: number, y: number) => boolean = () => true;
  if (anyRoads) {
    const [, roadMaskCtx] = offscreen();
    roadMaskCtx.drawImage(maskSoft, 0, 0);
    roadMaskCtx.globalCompositeOperation = 'destination-out';
    for (const o of rivers) strokeOpenPoly(roadMaskCtx, o.pts, 10, '#fff');
    roadMaskCtx.globalCompositeOperation = 'source-over';
    const maskData = roadMaskCtx.getImageData(0, 0, OUT, OUT).data;
    landMaskAt = (x, y) => {
      const xi = Math.min(OUT - 1, Math.max(0, Math.round(x)));
      const yi = Math.min(OUT - 1, Math.max(0, Math.round(y)));
      return maskData[(yi * OUT + xi) * 4 + 3] > 127;
    };
  }

  for (const o of prepared) {
    if (!ROAD_KINDS.has(o.type)) continue;
    const kind = o.type === 'road' ? 'road_dirt' : o.type; // legacy compat

    const samples = resamplePath(o.pts, 4);
    const isLand  = samples.map(p => landMaskAt(p.x, p.y));

    // Contiguous runs of equal land/water classification
    type RoadRun = { water: boolean; i0: number; i1: number };
    const runs: RoadRun[] = [];
    for (let i = 0; i < samples.length; i++) {
      const water = !isLand[i];
      const last = runs[runs.length - 1];
      if (last && last.water === water) last.i1 = i;
      else runs.push({ water, i0: i, i1: i });
    }

    for (const run of runs) {
      if (run.water) continue;
      drawRoadLand(ctx, samples.slice(run.i0, run.i1 + 1), kind);
    }

    const crng = mulberry32((baseSeed + o.idx * 7919 + 101) >>> 0);
    for (const run of runs) {
      if (!run.water) continue;
      const sub = samples.slice(run.i0, run.i1 + 1);
      if (kind === 'road_path') {
        drawFord(ctx, sub, crng);                       // no abutment, no line
      } else if (kind === 'road_cobble') {
        drawStoneBridge(ctx, extendRun(sub, 5));        // 5px abutment
      } else {
        drawWoodBridge(ctx, extendRun(sub, 4));         // 4px abutment
      }
    }
  }

  return canvas.toDataURL('image/png');
}
