/**
 * promptBuilder.js — shared prompt-building logic for all map renderers.
 * Exported functions are used by GptImageRenderer and GeminiImageRenderer.
 */

// ── Base prompt ────────────────────────────────────────────────────────────────

const BASE_PROMPT = `Create a fully illustrated regional fantasy map from the provided sketch.

The sketch is a symbolic terrain-layout plan only.
Preserve its structural geography — coastlines, water bodies, river paths,
biome placement, and major regional relationships.

CRITICAL — PATHS AND RIVERS IN THE SKETCH:
The sketch is drawn on a pixel grid, so ALL rivers, roads, and paths in the
sketch image appear as stepped, staircase-like, right-angled zigzag lines.
This is a technical artifact of the grid — it does NOT mean the features are
straight or angular in reality.
You MUST ignore the visual staircase shape of any path or river in the sketch.
Instead, render every river as a naturally winding organic watercourse and
every road as a gently curving dirt trail. No right angles. No zigzags.
No stepped geometry. Smooth organic curves only.

Do NOT preserve the sketch's visual appearance.
Do NOT keep:
- square cell edges or blocky pixel shapes
- flat color regions or game-editor appearance
- prototype terrain rendering or abstract diagram aesthetics
- mobile game style, board-game tile look, or strategy-game terrain overlay look
- stepped, staircase, or zigzag lines for rivers or roads

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

// ── Combined terrain grid (biome + relief, 2 chars per cell) ──────────────────
//
// Each cell = biomeChar + reliefChar, e.g.:
//   P. = plains flat    FM = forest mountains    O. = ocean flat
//   FH = forest hills   S. = swamp flat          .. = empty cell
//
// All 32 rows are always output (no skipping) so the AI can count coordinates.

function buildCombinedGrid(spec) {
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

  const mustKeep     = buildMustKeepFacts(spec);
  const combinedGrid = buildCombinedGrid(spec);
  const connectors   = buildConnectorPaths(spec);

  const sections = [BASE_PROMPT, PRIORITY_ORDER];
  if (mustKeep)   sections.push(mustKeep);
  sections.push(combinedGrid);
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
