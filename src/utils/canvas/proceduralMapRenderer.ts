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
 *   M1 (this file): biome interiors (continuous patterns) + marching-squares
 *      water/land contour + layered painted coast (glow / land / sand / foam).
 *   M2: rivers + roads.  M3: lake shores + biome blending.  M4: relief stamps.
 */

import type { SketchSpec } from '../../rules-engine/mapTypes';

// ── Constants ────────────────────────────────────────────────────────────────

const OUT  = 1024;
const GRID = 32;
const CELL = OUT / GRID; // 32px per cell

const ISO = 0.5;

const WATER_BIOMES = new Set(['ocean', 'lake']);

// Biome → repeating pattern tile (served from /tiles/, same source as the editor)
const BIOME_PATTERN_TILE: Record<string, string> = {
  plains:   'plains_flat',
  forest:   'forest_flat',
  swamp:    'swamp_flat',
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

// Coast palette
const SAND        = '#e2c78d';
const SAND_INNER  = '#eed69e';
const FOAM        = '#f8fafa';
const GLOW        = '#3aa8a8';

// Sand band half-width (px at 1024) and foam offset
const SAND_HALF   = 8;
const FOAM_OFFSET = 11;

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
  let hasLake = false;
  for (let k = 0; k < GRID * GRID; k++) {
    const b = biomeAt[k];
    if (!b) continue;
    if (b === 'lake') hasLake = true;
    else if (!WATER_BIOMES.has(b) && b !== 'coastal') landBiomes.add(b);
  }
  const tileKeys = new Set<string>(['ocean_deep']);
  if (hasLake) tileKeys.add('inland_lake');
  for (const b of landBiomes) if (BIOME_PATTERN_TILE[b]) tileKeys.add(BIOME_PATTERN_TILE[b]);

  const tiles: Record<string, HTMLImageElement | null> = {};
  await Promise.all([...tileKeys].map(async k => { tiles[k] = await loadImage(`/tiles/${k}.png`); }));

  const patternOf = (tileKey: string, fallback: string): CanvasPattern | string => {
    const img = tiles[tileKey];
    if (img && img.naturalWidth > 0) {
      const p = ctx.createPattern(img, 'repeat');
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
  ctx.fillStyle = patternOf('ocean_deep', OCEAN_FALLBACK);
  ctx.fillRect(0, 0, OUT, OUT);
  // Subtle depth vignette to break up visible tiling
  const vg = ctx.createRadialGradient(OUT / 2, OUT / 2, OUT * 0.25, OUT / 2, OUT / 2, OUT * 0.72);
  vg.addColorStop(0, 'rgba(30,70,120,0)');
  vg.addColorStop(1, 'rgba(8,20,44,0.28)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, OUT, OUT);

  // Lake cells: pre-fill with lake pattern (visible through land-contour holes)
  if (hasLake) {
    ctx.fillStyle = patternOf('inland_lake', LAKE_FALLBACK);
    ctx.fill(biomeRectPath('lake'));
  }

  const anyLand = land.some(v => v === 1);
  if (!anyLand) return canvas.toDataURL('image/png');

  // ── STEP 2: water/land boundary — marching squares + smoothing + jitter ──
  const field = buildCornerField(land);
  const rawContours = marchingSquares(field);

  type Contour = { pts: Pt[]; normals: Pt[]; landSign: number; length: number };
  const contours: Contour[] = [];

  // Bilinear sample of the corner field at pixel coords (for landward detection)
  const fieldAtPx = (x: number, y: number): number => {
    const gx = x / CELL, gy = y / CELL;
    const i0 = Math.floor(gx), j0 = Math.floor(gy);
    const tx = gx - i0, ty = gy - j0;
    return field(i0, j0) * (1 - tx) * (1 - ty) + field(i0 + 1, j0) * tx * (1 - ty)
         + field(i0, j0 + 1) * (1 - tx) * ty  + field(i0 + 1, j0 + 1) * tx * ty;
  };

  for (const raw of rawContours) {
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
    contours.push({ pts, normals, landSign, length: total });
  }

  // Combined land path (evenodd: outer shells fill, lake holes cut out)
  const landPath = new Path2D();
  for (const c of contours) addPolyToPath(landPath, c.pts);

  // ── STEP 3a: teal coast glow (under the land fill) ────────────────────────
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap  = 'round';
  for (const pass of [{ alpha: 0.5, width: 46 }, { alpha: 0.4, width: 30 }]) {
    ctx.globalAlpha = pass.alpha;
    ctx.strokeStyle = GLOW;
    ctx.lineWidth   = pass.width;
    ctx.shadowColor = GLOW;
    ctx.shadowBlur  = 18;
    ctx.stroke(landPath);
  }
  ctx.restore();

  // ── STEP 1b/3b: land fill — biome interiors clipped to the smooth contour ─
  ctx.save();
  ctx.clip(landPath, 'evenodd');
  // Sand underlay: covers coastal-biome cells AND any sliver where the jittered
  // contour bulges past the blocky cell rects.
  ctx.fillStyle = SAND;
  ctx.fillRect(0, 0, OUT, OUT);
  for (const biome of landBiomes) {
    ctx.fillStyle = patternOf(BIOME_PATTERN_TILE[biome], BIOME_FALLBACK[biome] ?? '#888');
    ctx.fill(biomeRectPath(biome));
  }
  ctx.restore();

  // ── STEP 3c: sand band — filled ring polygon (offset curves ±8px) ─────────
  // NOT a wide polyline: offset-ring fill avoids visible joint breaks.
  for (const c of contours) {
    const landN = c.normals.map(n => ({ x: n.x * c.landSign, y: n.y * c.landSign }));
    const outer = offsetClosed(c.pts, landN, +SAND_HALF); // landward edge
    const inner = offsetClosed(c.pts, landN, -SAND_HALF); // seaward edge

    const ring = new Path2D();
    addPolyToPath(ring, outer);
    addPolyToPath(ring, inner);
    ctx.fillStyle = SAND;
    ctx.fill(ring, 'evenodd');

    // Lighter inner (landward) edge of the band
    const hi = new Path2D();
    addPolyToPath(hi, outer);
    addPolyToPath(hi, offsetClosed(c.pts, landN, SAND_HALF * 0.25));
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
  ctx.lineWidth   = 3;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.shadowColor = FOAM;
  ctx.shadowBlur  = 3;
  ctx.globalAlpha = 0.8;

  for (const c of contours) {
    const seaN = c.normals.map(n => ({ x: -n.x * c.landSign, y: -n.y * c.landSign }));
    const foamPts = offsetClosed(c.pts, seaN, FOAM_OFFSET);
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

  return canvas.toDataURL('image/png');
}
