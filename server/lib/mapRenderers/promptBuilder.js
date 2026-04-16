/**
 * promptBuilder.js — shared prompt-building logic for all map renderers.
 * Exported functions are used by GptImageRenderer and GeminiImageRenderer.
 */

// ── Base prompt ────────────────────────────────────────────────────────────────

const BASE_PROMPT = `You are given a terrain sketch map built from illustrated tiles.
Each tile visually depicts its terrain type — forests show trees, mountains show
peaks, ocean shows waves, plains show grass, desert shows sand dunes, etc.
Dark / empty cells at the edge are unpainted background — ignore them.

Your task: transform this tiled sketch into a cohesive, seamless,
professionally illustrated fantasy map.

Do NOT reproduce the tile grid, tile edges, or pixelated boundaries.
Blend all terrain zones into natural organic transitions.

Render the map as finished fantasy cartography with:
- organic land and biome shapes with natural boundaries
- believable coastlines and shorelines
- hand-painted terrain textures and surfaces
- illustrated forests as clustered tree masses
- sculpted mountain chains with relief shading
- plains as open textured land, not flat fills
- water with depth gradients and shoreline variation
- swamps with marsh texture and wetland detail
- volcanic areas as dramatic fantasy terrain with distinct mood
- soft relief shading and strong visual hierarchy
- polished published campaign-book map finish

The final image must clearly read as a professionally illustrated
tabletop fantasy regional map — not a terrain mockup, game-board tile, or diagram.

Avoid:
- blocky biome rendering or pixel-like edges
- flat terrain fills or abstract schematic appearance
- game-board look, mobile game style, strategy overlay look
- modern UI, photorealism, or GIS rendering
- icons, symbols, letters, or markers placed on terrain
- settlement, ruin, or landmark icons
- any text rendered directly on the terrain surface`;

// ── Priority order ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER = `Priority order:
 1. The sketch image is authoritative for terrain placement and proportions
 2. Must-keep facts are non-negotiable constraints
 3. Connector descriptions define river/road routes — render as organic curves
 4. Translate to organic illustrated fantasy cartography
    — preserve regional layout, NOT sketch cell boundaries visually`;

// ── Freedom modes ──────────────────────────────────────────────────────────────

const FREEDOM_MODES = {
  strict: `Freedom mode: STRICT
Keep geography and biome layout very close to the sketch.
Do not invent major new regions or relocate terrain.
Only add minor landmarks and small lore-friendly details.
Even in strict mode: render as fully illustrated fantasy cartography,
not a beautified copy of the sketch.
Priority: high structural fidelity + high render quality.
The overall composition and proportions must closely match the sketch.
Major terrain zones must occupy the same relative areas as in the grid.
Do not relocate, resize, or omit any terrain zone present in the grid.
Do NOT add any of the following to the map:
- Icons, symbols, letters, runes, or glyphs on terrain
- Settlement icons, castle symbols, tower markers
- Ruin markers, battle markers, X marks
- Roman numerals or any text labels on terrain
- Decorative markers of any kind
The map must show ONLY natural terrain: mountains, forests, water, plains, swamp, volcanic terrain, rivers, roads.`,

  balanced: `Freedom mode: BALANCED
Preserve core geography and regional layout.
Allow moderate refinement of coastlines, terrain transitions, and landmarks.
Add logical fantasy-map detail where it improves believability.
Keep the sketch recognizable but render as a polished campaign-setting map.
Do NOT add any of the following to the map:
- Icons, symbols, letters, runes, or glyphs on terrain
- Settlement icons, castle symbols, tower markers
- Ruin markers, battle markers, X marks
- Roman numerals or any text labels on terrain
- Decorative markers of any kind
The map must show ONLY natural terrain: mountains, forests, water, plains, swamp, volcanic terrain, rivers, roads.`,

  creative: `Freedom mode: CREATIVE
Use the sketch as structural foundation but allow bold lore-friendly enhancement.
Preserve recognizability of the overall map while expanding worldbuilding.
Add subregions, landmarks, ruins, roads, settlements, and terrain drama.
Result should feel like a finished fantasy sourcebook map inspired by the sketch.`,
};

// ── Biome character encoding ───────────────────────────────────────────────────

const BIOME_CHAR = {
  plains: 'P', forest: 'F', swamp: 'S', desert: 'D',
  tundra: 'T', volcanic: 'V', ocean: 'O', coastal: 'C', lake: 'L',
};

// ── Combined terrain grid (biome + relief, 2 chars per cell) ──────────────────
//
// Each cell = biomeChar + reliefChar, e.g.:
//   P. = plains flat    FM = forest mountains    O. = ocean flat
//   FH = forest hills   S. = swamp flat          .. = empty cell
//
// All 32 rows are always output (no skipping) so the AI can count coordinates.

function buildCombinedGrid(spec) {
  if (!spec?.cells) return '';
  const ROWS = 32, COLS = 32;

  // biome[r][c] and relief[r][c]
  const biome  = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));
  const relief = Array.from({ length: ROWS }, () => Array(COLS).fill('.'));

  for (const cell of (spec.cells ?? [])) {
    const { x, y } = cell;
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) continue;

    // biome
    if (cell.biome !== 'mountains' && cell.biome !== 'hills') {
      const ch = BIOME_CHAR[cell.biome];
      if (ch) biome[y][x] = ch;
    }

    // relief
    const r = cell.relief;
    if (r === 'mountains' || r === 'mountainous' || cell.biome === 'mountains') relief[y][x] = 'M';
    else if (r === 'hills' || cell.biome === 'hills')                           relief[y][x] = 'H';
  }

  const lines = [
    'Terrain grid (32×32). West=left East=right North=top South=bottom.',
    'Each cell = 2 chars: [biome][relief]',
    'Biome:  P=plains F=forest S=swamp D=desert T=tundra V=volcanic O=ocean C=coastal L=lake .=unset',
    'Relief: M=mountains H=hills .=flat',
    'Examples: P.=plains-flat  FM=forest-mountains  FH=forest-hills  O.=ocean  ..=empty',
  ];

  for (let r = 0; r < ROWS; r++) {
    const row = [];
    for (let c = 0; c < COLS; c++) row.push(biome[r][c] + relief[r][c]);
    lines.push(`${String(r).padStart(2)}: ${row.join(' ')}`);
  }

  return lines.join('\n');
}

// ── Connector paths ────────────────────────────────────────────────────────────

function getZoneDescription(x, y, cells) {
  const cell = cells.find(c => c.x === x && c.y === y);
  const biome = cell?.biome || 'terrain';
  const posX = x < 11 ? 'west' : x > 21 ? 'east' : 'central';
  const posY = y < 11 ? 'north' : y > 21 ? 'south' : 'central';
  const pos = [posY, posX].filter(p => p !== 'central').join('-') || 'central';
  return `${pos} ${biome}`;
}

function buildConnectorPaths(spec) {
  if (!spec) return null;
  const overlays = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  if (!overlays.length) return null;
  const cells = spec.cells ?? [];

  const lines = [
    'Connectors:',
    'The input image does NOT show rivers or roads —',
    'they are described below. Add them yourself as natural organic features at the described locations.',
    'Rivers must be gently winding. Roads must be gently curving.',
    'Do NOT draw straight lines, right angles, or stepped geometry.',
    '',
  ];

  for (const ov of overlays) {
    const pts = ov.points;
    const start = pts[0];
    const end   = pts[pts.length - 1];
    const mid   = pts[Math.floor(pts.length / 2)];

    const startZone = getZoneDescription(start.x, start.y, cells);
    const endZone   = getZoneDescription(end.x,   end.y,   cells);
    const midZone   = getZoneDescription(mid.x,   mid.y,   cells);

    const dirX = end.x > start.x ? 'east' : end.x < start.x ? 'west' : '';
    const dirY = end.y > start.y ? 'south' : end.y < start.y ? 'north' : '';
    const dir  = [dirY, dirX].filter(Boolean).join('-') || 'across the region';

    if (ov.type === 'river') {
      lines.push(`- River: originates in the ${startZone}, flows ${dir} through the ${midZone}, reaches the ${endZone}. Draw as a gently winding natural river.`);
    } else if (ov.type === 'road') {
      lines.push(`- Road: runs from the ${startZone} ${dir} to the ${endZone} through the ${midZone}. Draw as a gently curving dirt trail.`);
    } else if (ov.type === 'canyon') {
      lines.push(`- Canyon: cuts from the ${startZone} ${dir} to the ${endZone}. Draw as a natural rocky ravine.`);
    } else if (ov.type === 'chasm') {
      lines.push(`- Chasm: extends from the ${startZone} ${dir} to the ${endZone}. Draw as a dramatic natural fissure.`);
    }
  }

  return lines.join('\n');
}

// ── Must-keep facts ────────────────────────────────────────────────────────────

function buildMustKeepFacts(spec) {
  if (!spec?.cells) return null;
  const allCells = spec.cells ?? [];
  const overlays  = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  if (!allCells.length) return null;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  // Normalise a cell to a single terrain label; mountains relief always → 'mountains'
  function terrainLabel(c) {
    if (c.relief === 'mountains' || c.relief === 'mountainous' || c.biome === 'mountains') return 'mountains';
    return c.biome;
  }

  // Cardinal compass description from an (x,y) centroid on the 32×32 grid
  function compassPos(ax, ay) {
    const ns = ay <= 10 ? 'northern' : ay >= 22 ? 'southern' : '';
    const ew = ax <= 10 ? 'western'  : ax >= 22 ? 'eastern'  : '';
    return [ns, ew].filter(Boolean).join(' ') || 'central';
  }

  const cellMap = new Map();
  for (const c of allCells) cellMap.set(`${c.x},${c.y}`, c);

  const facts = [];

  // ── 1. Dominant edges ────────────────────────────────────────────────────────
  // For each edge band, find whether one terrain type covers ≥ 60 % of painted cells.
  const edgeDefs = [
    { dir: 'eastern',  test: c => c.x >= 28 },
    { dir: 'western',  test: c => c.x <= 3  },
    { dir: 'northern', test: c => c.y <= 3  },
    { dir: 'southern', test: c => c.y >= 28 },
  ];

  let edgeFacts = 0;
  for (const { dir, test } of edgeDefs) {
    if (edgeFacts >= 2) break;
    const eCells = allCells.filter(test);
    if (eCells.length < 4) continue;
    const counts = {};
    for (const c of eCells) {
      const lbl = terrainLabel(c);
      counts[lbl] = (counts[lbl] ?? 0) + 1;
    }
    const [topLabel, topCount] = Object.entries(counts).sort((a,b) => b[1]-a[1])[0] ?? [];
    if (!topLabel || topCount / eCells.length < 0.6) continue;
    facts.push(`A ${topLabel} zone dominates the ${dir} edge — render it along the FULL ${dir} border (do NOT omit)`);
    edgeFacts++;
  }

  // ── 2. Large connected components (BFS flood-fill by terrain label) ──────────
  // Each component > 50 cells is a "major terrain feature" the AI must not shrink.
  const visited = new Set();
  const components = [];

  for (const c of allCells) {
    const key = `${c.x},${c.y}`;
    if (visited.has(key)) continue;
    const lbl   = terrainLabel(c);
    const queue = [c];
    const comp  = [];
    visited.add(key);
    while (queue.length) {
      const cur = queue.shift();
      comp.push(cur);
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nk = `${cur.x+dx},${cur.y+dy}`;
        if (visited.has(nk)) continue;
        const nb = cellMap.get(nk);
        if (!nb || terrainLabel(nb) !== lbl) continue;
        visited.add(nk);
        queue.push(nb);
      }
    }
    components.push({ label: lbl, cells: comp });
  }
  components.sort((a,b) => b.cells.length - a.cells.length);

  let largeFacts = 0;
  for (const { label, cells: comp } of components) {
    if (facts.length >= 6 || largeFacts >= 2) break;
    if (comp.length <= 50) continue;
    // Plains and ocean are self-evident from the image — skip them here
    if (label === 'plains' || label === 'ocean') continue;
    const ax = comp.reduce((s,c) => s+c.x, 0) / comp.length;
    const ay = comp.reduce((s,c) => s+c.y, 0) / comp.length;
    facts.push(`A large ${label} zone covers ${comp.length} cells in the ${compassPos(ax, ay)} area — this is a major terrain feature (do NOT omit or shrink)`);
    largeFacts++;
  }

  // ── 3. Isolated small features (3-14 cells, isolated component) ──────────────
  // Small zones are at risk of being dropped by the AI — flag them explicitly.
  let isolatedFacts = 0;
  for (const { label, cells: comp } of components) {
    if (facts.length >= 7 || isolatedFacts >= 2) break;
    if (comp.length < 3 || comp.length > 14) continue;
    if (label === 'plains') continue; // minor plains patches are not important
    const ax = comp.reduce((s,c) => s+c.x, 0) / comp.length;
    const ay = comp.reduce((s,c) => s+c.y, 0) / comp.length;
    facts.push(`Small but important ${label} zone (${comp.length} cells) in the ${compassPos(ax, ay)} area — render as a distinct feature (do NOT omit)`);
    isolatedFacts++;
  }

  // ── 4. Interesting terrain adjacencies ───────────────────────────────────────
  // Certain biome boundaries have strong visual impact and must be preserved.
  // Keys are alphabetically sorted label pairs joined by '|'.
  const INTERESTING_PAIRS = new Set([
    'coastal|forest', 'forest|ocean',
    'mountains|swamp', 'forest|swamp',
    'desert|mountains', 'mountains|tundra',
    'ocean|volcanic', 'plains|volcanic',
    'lake|mountains', 'coastal|mountains',
  ]);

  const adjFound = new Set();
  const adjFacts = [];
  for (const c of allCells) {
    const lbl1 = terrainLabel(c);
    for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
      const nb = cellMap.get(`${c.x+dx},${c.y+dy}`);
      if (!nb) continue;
      const lbl2 = terrainLabel(nb);
      if (lbl1 === lbl2) continue;
      const pairKey = [lbl1, lbl2].sort().join('|');
      if (adjFound.has(pairKey) || !INTERESTING_PAIRS.has(pairKey)) continue;
      adjFound.add(pairKey);
      const ax = (c.x + nb.x) / 2;
      const ay = (c.y + nb.y) / 2;
      adjFacts.push(`The ${lbl1} zone directly borders the ${lbl2} zone in the ${compassPos(ax, ay)} area — maintain this boundary`);
    }
  }
  for (const f of adjFacts.slice(0, 2)) {
    if (facts.length < 8) facts.push(f);
  }

  // ── Preserved hard constraints ────────────────────────────────────────────────
  // Single-volcano: small volcanic zones must not be multiplied by the AI
  const volCells = allCells.filter(c => c.biome === 'volcanic');
  if (facts.length < 8 && volCells.length > 0 && volCells.length < 25)
    facts.push(`Volcanic zone is small (${volCells.length} cells) — render as a SINGLE volcano, not multiple`);

  // Road/canyon/chasm water constraint
  if (facts.length < 8 && overlays.some(o => o.type === 'road' || o.type === 'canyon' || o.type === 'chasm'))
    facts.push('Roads, canyons, and chasms are land features — they NEVER enter water or the sea');

  if (!facts.length) return null;
  return 'Must preserve (non-negotiable):\n' + facts.slice(0, 8).map(f => `- ${f}`).join('\n');
}

// ── Full prompt ────────────────────────────────────────────────────────────────

function buildFullPrompt(spec, aiFredom, userPrompt) {
  if (!spec) console.warn('[promptBuilder] spec is null — grid/facts will be empty');
  const freedomKey   = (aiFredom || 'strict').toLowerCase();
  const freedomBlock = FREEDOM_MODES[freedomKey] ?? FREEDOM_MODES.strict;

  const mustKeep   = buildMustKeepFacts(spec);
  const connectors = buildConnectorPaths(spec);

  const TERRAIN_ID_GUIDE = `Terrain identification guide for this map:
- Tiles with DEAD/BARE trees and muddy water texture = Swamp — render as wetland/marsh, NOT forest
- Tiles with GREY rocky peaks and snow = Mountains — render with illustrated stone peaks
- Tiles with GREEN leafy trees = Forest — render as living woodland
- Tiles with dark volcanic rock = Volcanic — render as dramatic lava/ash terrain
Do NOT render swamp as forest — swamp must look like a marsh or wetland with standing water and dead vegetation.`;

  const sections = [BASE_PROMPT, TERRAIN_ID_GUIDE, PRIORITY_ORDER];
  if (mustKeep)   sections.push(mustKeep);
  if (connectors) sections.push(connectors);
  sections.push(freedomBlock);
  if (userPrompt?.trim()) sections.push('Additional user instructions:\n' + userPrompt.trim());

  return sections.join('\n\n');
}

module.exports = {
  BASE_PROMPT, PRIORITY_ORDER, FREEDOM_MODES, BIOME_CHAR,
  buildCombinedGrid, buildConnectorPaths,
  buildMustKeepFacts, buildFullPrompt,
};
