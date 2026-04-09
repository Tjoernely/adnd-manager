/**
 * promptBuilder.js — shared prompt-building logic for all map renderers.
 * Exported functions are used by GptImageRenderer and GeminiImageRenderer.
 */

// ── Base prompt ────────────────────────────────────────────────────────────────

const BASE_PROMPT = `Create a fully illustrated regional fantasy map from the provided sketch.

The sketch is a symbolic terrain-layout plan only.
Preserve its structural geography — coastlines, water bodies, river paths,
biome placement, and major regional relationships.

Do NOT preserve the sketch's visual appearance.
Do NOT keep:
- square cell edges or blocky pixel shapes
- flat color regions or game-editor appearance
- prototype terrain rendering or abstract diagram aesthetics
- mobile game style, board-game tile look, or strategy-game terrain overlay look

Translate the sketch into finished fantasy cartography with:
- organic land and biome shapes with natural boundaries
- believable coastlines and shorelines
- hand-painted terrain textures and surfaces
- illustrated forests as clustered tree masses
- sculpted mountain chains with relief shading
- plains as open textured land, not flat fills
- water with depth gradients and shoreline variation
- swamps with marsh texture and wetland detail
- volcanic areas as dramatic fantasy terrain with distinct mood
- readable cartographic symbols throughout
- soft relief shading and strong visual hierarchy
- polished published campaign-book map finish

The final image must clearly read as a professionally illustrated
tabletop fantasy regional map — not a terrain mockup, editor screenshot,
abstract biome diagram, mobile game map, or strategy-game terrain layer.

Avoid:
- blocky biome rendering or pixel-like edges
- flat terrain fills or abstract schematic appearance
- game-board look, mobile game style, strategy overlay look
- modern UI, photorealism, or GIS rendering`;

// ── Priority order ─────────────────────────────────────────────────────────────

const PRIORITY_ORDER = `Priority order:
 1. Biome and relief grids are authoritative for terrain placement
 2. Must-keep facts are non-negotiable constraints
 3. Connector paths define exact river/road routes
 4. Sketch image is compositional reference only
 5. Translate to organic illustrated fantasy cartography
    — preserve cell semantics, NOT cell boundaries visually`;

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
Do not relocate, resize, or omit any terrain zone present in the grid.`,

  balanced: `Freedom mode: BALANCED
Preserve core geography and regional layout.
Allow moderate refinement of coastlines, terrain transitions, and landmarks.
Add logical fantasy-map detail where it improves believability.
Keep the sketch recognizable but render as a polished campaign-setting map.`,

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

// ── Biome grid ─────────────────────────────────────────────────────────────────

function buildBiomeGrid(spec) {
  const rows = 32, cols = 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));

  for (const cell of (spec.cells ?? [])) {
    if (cell.biome === 'mountains' || cell.biome === 'hills') continue;
    const ch = BIOME_CHAR[cell.biome];
    if (ch && cell.y < rows && cell.x < cols) grid[cell.y][cell.x] = ch;
  }

  const lines = [
    'Biome grid (32×32). West=left East=right North=top South=bottom.',
    'Key: P=plains F=forest S=swamp D=desert T=tundra V=volcanic O=ocean C=coastal L=lake .=empty',
  ];
  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;
    lines.push(`${String(r).padStart(2)}: ${grid[r].join('')}`);
  }
  return lines.join('\n');
}

// ── Relief grid ────────────────────────────────────────────────────────────────

function buildReliefGrid(spec) {
  const rows = 32, cols = 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  let hasRelief = false;

  for (const cell of (spec.cells ?? [])) {
    let ch = null;
    if (cell.relief === 'mountains' || cell.relief === 'mountainous') ch = 'M';
    else if (cell.relief === 'hills') ch = 'H';
    else if (cell.biome === 'mountains') ch = 'M';
    else if (cell.biome === 'hills')     ch = 'H';

    if (ch && cell.y < rows && cell.x < cols) { grid[cell.y][cell.x] = ch; hasRelief = true; }
  }

  if (!hasRelief) return null;

  const lines = ['Relief grid (same coordinates as biome grid):', 'Key: M=mountains H=hills .=flat'];
  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;
    lines.push(`${String(r).padStart(2)}: ${grid[r].join('')}`);
  }
  return lines.join('\n');
}

// ── Connector paths ────────────────────────────────────────────────────────────

function buildConnectorPaths(spec) {
  const overlays = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  if (!overlays.length) return null;

  const cellMap = new Map();
  for (const c of (spec.cells ?? [])) cellMap.set(`${c.x},${c.y}`, c);

  const WATER_BIOMES = new Set(['ocean', 'coastal', 'lake']);
  function biomeLabelAt(pt) { return cellMap.get(`${pt.x},${pt.y}`)?.biome ?? 'unknown terrain'; }

  const lines = ['Connector paths (x=east y=south, origin top-left):'];
  for (const ov of overlays) {
    const pts = ov.points;
    const start = pts[0], end = pts[pts.length - 1];
    const dirX = end.x > start.x ? 'east' : 'west';
    const dirY = end.y > start.y ? 'south' : 'north';
    const startBiome = biomeLabelAt(start), endBiome = biomeLabelAt(end);
    lines.push(`- ${ov.type}: flows ${dirY}-${dirX}, starts in ${startBiome}, ends in ${endBiome}, path: ${pts.map(p => `(${p.x},${p.y})`).join('→')}`);
    if ((ov.type === 'road' || ov.type === 'canyon' || ov.type === 'chasm') &&
        (WATER_BIOMES.has(startBiome) || WATER_BIOMES.has(endBiome))) {
      lines.push(`  ⚠ This ${ov.type} passes near water — DO NOT draw it into the sea. Terminate on land.`);
    }
  }
  lines.push('CRITICAL: Roads, canyons, and chasms never enter water. Rivers flow into water (sea/lake), not across land arbitrarily.');
  lines.push('Biome grid is preserved unchanged on connector cells.');
  return lines.join('\n');
}

// ── Must-keep facts ────────────────────────────────────────────────────────────

function buildMustKeepFacts(spec) {
  const cells   = (spec.cells ?? []).filter(c => BIOME_CHAR[c.biome]);
  const overlays = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  const facts   = [];
  if (!cells.length) return null;

  const cellMap = new Map();
  for (const c of cells) cellMap.set(`${c.x},${c.y}`, c);

  function edgeLabels(c) {
    const l = [];
    if (c.y < 8)   l.push('north');
    if (c.y >= 24) l.push('south');
    if (c.x >= 24) l.push('east');
    if (c.x < 8)   l.push('west');
    return l;
  }

  // A. Edge-exclusive biomes
  const biomeEdges = {}, biomeInCenter = new Set();
  for (const c of cells) {
    const edges = edgeLabels(c);
    if (!edges.length) { biomeInCenter.add(c.biome); continue; }
    if (!biomeEdges[c.biome]) biomeEdges[c.biome] = new Set();
    edges.forEach(e => biomeEdges[c.biome].add(e));
  }
  for (const [biome, edgeSet] of Object.entries(biomeEdges)) {
    if (biomeInCenter.has(biome)) continue;
    const a = [...edgeSet];
    const hasN = a.includes('north'), hasS = a.includes('south');
    const hasE = a.includes('east'),  hasW = a.includes('west');
    let where;
    if      (hasN && hasE && !hasS && !hasW) where = 'the northeast';
    else if (hasN && hasW && !hasS && !hasE) where = 'the northwest';
    else if (hasS && hasE && !hasN && !hasW) where = 'the southeast';
    else if (hasS && hasW && !hasN && !hasE) where = 'the southwest';
    else                                     where = a.join(' and ');
    facts.push(`${biome[0].toUpperCase() + biome.slice(1)} terrain exists only in ${where}`);
    if (facts.length >= 3) break;
  }

  // B. Forest-coast adjacency
  const WATER = new Set(['ocean', 'coastal']);
  for (const fc of cells.filter(c => c.biome === 'forest')) {
    for (const [dx, dy, dir] of [[0,-1,'northern'],[0,1,'southern'],[-1,0,'western'],[1,0,'eastern']]) {
      const n = cellMap.get(`${fc.x+dx},${fc.y+dy}`);
      if (n && WATER.has(n.biome)) { facts.push(`Forest reaches the ${dir} coastline`); break; }
    }
    if (facts.length >= 5) break;
  }

  // C. Inland lakes
  const isolatedLakes = cells.filter(c => c.biome === 'lake' &&
    ![[0,-1],[0,1],[-1,0],[1,0]].some(([dx,dy]) => {
      const n = cellMap.get(`${c.x+dx},${c.y+dy}`);
      return n && (n.biome === 'ocean' || n.biome === 'coastal');
    }));
  if (isolatedLakes.length) {
    const ax = isolatedLakes.reduce((s,c) => s+c.x, 0) / isolatedLakes.length;
    const ay = isolatedLakes.reduce((s,c) => s+c.y, 0) / isolatedLakes.length;
    const pos = ay < 12 ? 'northern' : ay > 20 ? 'southern' : ax < 12 ? 'western' : ax > 20 ? 'eastern' : 'central';
    facts.push(`A distinct inland lake exists in the ${pos} region`);
  }

  // D. Biome proportions
  const total = cells.length || 1;
  const counts = {};
  for (const c of cells) counts[c.biome] = (counts[c.biome] ?? 0) + 1;
  for (const [biome, n] of Object.entries(counts).sort((a,b) => b[1]-a[1]).slice(0,5)) {
    if (n / total < 0.05) continue;
    facts.push(`${biome[0].toUpperCase() + biome.slice(1)} covers ~${Math.round(n/total*100)}% of the map — preserve this proportion`);
    if (facts.length >= 6) break;
  }

  // E. Single-volcano constraint
  const volCount = counts['volcanic'] ?? 0;
  if (volCount > 0 && volCount < 25) facts.push(`Volcanic zone is small (${volCount} cells) — render as a SINGLE volcano, not multiple`);

  // F. Swamp visibility
  if ((counts['swamp'] ?? 0) > 50) facts.push('Swamp must be rendered as a VISIBLE marsh/wetland zone with distinctive visual texture — not just labeled as text');

  // G. Ocean negative constraints
  if (counts['ocean'] || counts['coastal']) {
    const oceanEdges = new Set(cells.filter(c => c.biome === 'ocean' || c.biome === 'coastal').flatMap(edgeLabels));
    const absent = ['north','south','east','west'].filter(e => !oceanEdges.has(e));
    if (absent.length > 0 && absent.length <= 3) facts.push(`No ocean in the ${absent.join(' or ')}`);
  }

  // H. Road/path water constraint
  if (overlays.some(o => o.type === 'road' || o.type === 'canyon' || o.type === 'chasm'))
    facts.push('Roads, canyons, and chasms are land features — they NEVER enter water or the sea');

  // I. Overlay summary
  for (const ov of overlays.slice(0, 2)) {
    const pts = ov.points, s = pts[0], e = pts[pts.length-1];
    facts.push(`A major ${ov.type} runs from (${s.x},${s.y}) toward (${e.x},${e.y}) — ${e.y>s.y?'south':'north'}-${e.x>s.x?'east':'west'}`);
  }

  if (!facts.length) return null;
  return 'Must preserve (non-negotiable):\n' + facts.slice(0, 8).map(f => `- ${f}`).join('\n');
}

// ── Full prompt ────────────────────────────────────────────────────────────────

function buildFullPrompt(spec, aiFredom, userPrompt) {
  const freedomKey   = (aiFredom || 'strict').toLowerCase();
  const freedomBlock = FREEDOM_MODES[freedomKey] ?? FREEDOM_MODES.strict;

  const mustKeep  = buildMustKeepFacts(spec);
  const biomeGrid = buildBiomeGrid(spec);
  const relief    = buildReliefGrid(spec);
  const connectors = buildConnectorPaths(spec);

  const sections = [BASE_PROMPT, PRIORITY_ORDER];
  if (mustKeep)    sections.push(mustKeep);
  sections.push(biomeGrid);
  if (relief)      sections.push(relief);
  if (connectors)  sections.push(connectors);
  sections.push(freedomBlock);
  if (userPrompt?.trim()) sections.push('Additional user instructions:\n' + userPrompt.trim());

  return sections.join('\n\n');
}

module.exports = {
  BASE_PROMPT, PRIORITY_ORDER, FREEDOM_MODES, BIOME_CHAR,
  buildBiomeGrid, buildReliefGrid, buildConnectorPaths,
  buildMustKeepFacts, buildFullPrompt,
};
