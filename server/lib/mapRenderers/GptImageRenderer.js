/**
 * GptImageRenderer — OpenAI Responses API, gpt-4o + image_generation tool.
 */

const OpenAI       = require('openai');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

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

// ── Priority order block ───────────────────────────────────────────────────────

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

// ── Biome grid builder ─────────────────────────────────────────────────────────

const BIOME_CHAR = {
  plains: 'P', forest: 'F', swamp: 'S', desert: 'D',
  tundra: 'T', volcanic: 'V', ocean: 'O', coastal: 'C', lake: 'L',
};

function buildBiomeGrid(spec) {
  const rows = 32, cols = 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));

  for (const cell of (spec.cells ?? [])) {
    // Skip mountains/hills stored as biome (backwards compat) — shown in relief grid
    if (cell.biome === 'mountains' || cell.biome === 'hills') continue;
    const ch = BIOME_CHAR[cell.biome];
    if (ch && cell.y < rows && cell.x < cols) {
      grid[cell.y][cell.x] = ch;
    }
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

// ── Relief grid builder ────────────────────────────────────────────────────────

function buildReliefGrid(spec) {
  const rows = 32, cols = 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
  let hasRelief = false;

  for (const cell of (spec.cells ?? [])) {
    let ch = null;
    if (cell.relief === 'mountains' || cell.relief === 'mountainous') ch = 'M';
    else if (cell.relief === 'hills') ch = 'H';
    else if (cell.biome === 'mountains') ch = 'M'; // backwards compat
    else if (cell.biome === 'hills')     ch = 'H'; // backwards compat

    if (ch && cell.y < rows && cell.x < cols) {
      grid[cell.y][cell.x] = ch;
      hasRelief = true;
    }
  }

  if (!hasRelief) return null;

  const lines = [
    'Relief grid (same coordinates as biome grid):',
    'Key: M=mountains H=hills .=flat',
  ];
  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;
    lines.push(`${String(r).padStart(2)}: ${grid[r].join('')}`);
  }
  return lines.join('\n');
}

// ── Connector paths builder ────────────────────────────────────────────────────

function buildConnectorPaths(spec) {
  const overlays = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  if (!overlays.length) return null;

  // Build cell lookup for biome context at path endpoints
  const cellMap = new Map();
  for (const c of (spec.cells ?? [])) cellMap.set(`${c.x},${c.y}`, c);

  function biomeLabelAt(pt) {
    const c = cellMap.get(`${pt.x},${pt.y}`);
    return c?.biome ?? 'unknown terrain';
  }

  const WATER_BIOMES = new Set(['ocean', 'coastal', 'lake']);

  const lines = ['Connector paths (x=east y=south, origin top-left):'];
  for (const ov of overlays) {
    const pts   = ov.points;
    const start = pts[0];
    const end   = pts[pts.length - 1];
    const dirX  = end.x > start.x ? 'east' : 'west';
    const dirY  = end.y > start.y ? 'south' : 'north';
    const path  = pts.map(p => `(${p.x},${p.y})`).join('→');
    const startBiome = biomeLabelAt(start);
    const endBiome   = biomeLabelAt(end);
    lines.push(`- ${ov.type}: flows ${dirY}-${dirX}, starts in ${startBiome}, ends in ${endBiome}, path: ${path}`);

    // Warn explicitly if either endpoint is on water (common source of road-into-sea bug)
    if (ov.type === 'road' || ov.type === 'canyon' || ov.type === 'chasm') {
      if (WATER_BIOMES.has(startBiome) || WATER_BIOMES.has(endBiome)) {
        lines.push(`  ⚠ This ${ov.type} passes near water — DO NOT draw it into the sea. Terminate on land.`);
      }
    }
  }
  lines.push('CRITICAL: Roads, canyons, and chasms never enter water. Rivers flow into water (sea/lake), not across land arbitrarily.');
  lines.push('Biome grid is preserved unchanged on connector cells.');
  return lines.join('\n');
}

// ── Must-keep facts builder ────────────────────────────────────────────────────

function buildMustKeepFacts(spec) {
  const cells   = (spec.cells ?? []).filter(c => BIOME_CHAR[c.biome]); // only real biomes
  const overlays = (spec.overlays ?? []).filter(o => o.points?.length >= 2);
  const facts   = [];

  if (!cells.length) return null;

  // Build a lookup map
  const cellMap = new Map();
  for (const c of cells) cellMap.set(`${c.x},${c.y}`, c);

  // Edge zone membership per cell
  function edgeLabels(c) {
    const labels = [];
    if (c.y < 8)   labels.push('north');
    if (c.y >= 24) labels.push('south');
    if (c.x >= 24) labels.push('east');
    if (c.x < 8)   labels.push('west');
    return labels;
  }

  // A. Biomes exclusive to specific edge zones
  const biomeEdges = {}; // biome → Set of edge labels where it appears
  const biomeInCenter = new Set();
  for (const c of cells) {
    const edges = edgeLabels(c);
    if (edges.length === 0) {
      biomeInCenter.add(c.biome);
    } else {
      if (!biomeEdges[c.biome]) biomeEdges[c.biome] = new Set();
      edges.forEach(e => biomeEdges[c.biome].add(e));
    }
  }

  for (const [biome, edgeSet] of Object.entries(biomeEdges)) {
    if (biomeInCenter.has(biome)) continue; // not exclusive to edges
    const edgeArr = [...edgeSet];
    // Combine adjacent edges into quadrant names
    const hasN = edgeArr.includes('north'), hasS = edgeArr.includes('south');
    const hasE = edgeArr.includes('east'),  hasW = edgeArr.includes('west');
    let where;
    if (hasN && hasE && !hasS && !hasW)      where = 'the northeast';
    else if (hasN && hasW && !hasS && !hasE) where = 'the northwest';
    else if (hasS && hasE && !hasN && !hasW) where = 'the southeast';
    else if (hasS && hasW && !hasN && !hasE) where = 'the southwest';
    else                                     where = edgeArr.join(' and ');

    facts.push(`${biome.charAt(0).toUpperCase() + biome.slice(1)} terrain exists only in ${where}`);
    if (facts.length >= 3) break;
  }

  // B. Forest-ocean/coastal adjacency
  const WATER = new Set(['ocean', 'coastal']);
  const forestCells = cells.filter(c => c.biome === 'forest');
  for (const fc of forestCells) {
    const dirs = [[0,-1,'northern'],[0,1,'southern'],[-1,0,'western'],[1,0,'eastern']];
    for (const [dx, dy, dir] of dirs) {
      const n = cellMap.get(`${fc.x+dx},${fc.y+dy}`);
      if (n && WATER.has(n.biome)) {
        facts.push(`Forest reaches the ${dir} coastline`);
        break;
      }
    }
    if (facts.length >= 5) break;
  }

  // C. Isolated inland lakes
  const lakeCells = cells.filter(c => c.biome === 'lake');
  const isolatedLakes = lakeCells.filter(lc => {
    const neighbors = [[0,-1],[0,1],[-1,0],[1,0]];
    return !neighbors.some(([dx,dy]) => {
      const n = cellMap.get(`${lc.x+dx},${lc.y+dy}`);
      return n && (n.biome === 'ocean' || n.biome === 'coastal');
    });
  });
  if (isolatedLakes.length) {
    // Find centroid of isolated lake cells
    const avgX = isolatedLakes.reduce((s,c) => s+c.x, 0) / isolatedLakes.length;
    const avgY = isolatedLakes.reduce((s,c) => s+c.y, 0) / isolatedLakes.length;
    const pos  = avgY < 12 ? 'northern' : avgY > 20 ? 'southern' : avgX < 12 ? 'western' : avgX > 20 ? 'eastern' : 'central';
    facts.push(`A distinct inland lake exists in the ${pos} region`);
  }

  // C2. Biome proportions — give the model a size anchor per biome
  const totalCells = cells.length || 1;
  const biomeCounts = {};
  for (const c of cells) biomeCounts[c.biome] = (biomeCounts[c.biome] ?? 0) + 1;
  const majorBiomes = Object.entries(biomeCounts)
    .filter(([, n]) => n / totalCells >= 0.05)   // ≥5% of painted area
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [biome, count] of majorBiomes) {
    const pct = Math.round(count / totalCells * 100);
    facts.push(`${biome.charAt(0).toUpperCase() + biome.slice(1)} covers ~${pct}% of the map — preserve this proportion`);
    if (facts.length >= 5) break;
  }

  // C3. Single-feature constraint for small volcanic zones
  const volcanicCount = biomeCounts['volcanic'] ?? 0;
  if (volcanicCount > 0 && volcanicCount < 25) {
    facts.push(`Volcanic zone is small (${volcanicCount} cells) — render as a SINGLE volcano, not multiple`);
  }

  // C4. Swamp visibility
  const swampCount = biomeCounts['swamp'] ?? 0;
  if (swampCount > 50) {
    facts.push('Swamp must be rendered as a VISIBLE marsh/wetland zone with distinctive visual texture — not just labeled as text');
  }

  // D. Negative constraints — ocean absent from specific edges
  const allBiomes = new Set(cells.map(c => c.biome));
  if (allBiomes.has('ocean') || allBiomes.has('coastal')) {
    const oceanCells = cells.filter(c => c.biome === 'ocean' || c.biome === 'coastal');
    const oceanEdges = new Set(oceanCells.flatMap(c => edgeLabels(c)));
    const absent = ['north','south','east','west'].filter(e => !oceanEdges.has(e));
    if (absent.length > 0 && absent.length <= 3) {
      facts.push(`No ocean in the ${absent.join(' or ')}`);
    }
  }

  // E. Connector constraints — roads must not enter water
  const roadOverlays = overlays.filter(o => o.type === 'road' || o.type === 'canyon' || o.type === 'chasm');
  if (roadOverlays.length > 0) {
    facts.push('Roads, canyons, and chasms are land features — they NEVER enter water or the sea');
  }

  // F. Overlay summary
  for (const ov of overlays.slice(0, 2)) {
    const pts   = ov.points;
    const start = pts[0];
    const end   = pts[pts.length - 1];
    const dirX  = end.x > start.x ? 'east' : 'west';
    const dirY  = end.y > start.y ? 'south' : 'north';
    facts.push(`A major ${ov.type} runs from (${start.x},${start.y}) toward (${end.x},${end.y}) — ${dirY}-${dirX}`);
  }

  if (!facts.length) return null;

  const capped = facts.slice(0, 8);
  return 'Must preserve (non-negotiable):\n' + capped.map(f => `- ${f}`).join('\n');
}

// ── Full prompt builder ────────────────────────────────────────────────────────

function buildFullPrompt(spec, aiFredom, userPrompt) {
  const freedomKey   = (aiFredom || 'strict').toLowerCase();
  const freedomBlock = FREEDOM_MODES[freedomKey] ?? FREEDOM_MODES.strict;

  const mustKeep      = buildMustKeepFacts(spec);
  const biomeGrid     = buildBiomeGrid(spec);
  const reliefGrid    = buildReliefGrid(spec);
  const connectors    = buildConnectorPaths(spec);

  const sections = [BASE_PROMPT, PRIORITY_ORDER];
  if (mustKeep)   sections.push(mustKeep);
  sections.push(biomeGrid);
  if (reliefGrid) sections.push(reliefGrid);
  if (connectors) sections.push(connectors);
  sections.push(freedomBlock);
  if (userPrompt?.trim()) sections.push('Additional user instructions:\n' + userPrompt.trim());

  return sections.join('\n\n');
}

// ── Renderer class ─────────────────────────────────────────────────────────────

class GptImageRenderer extends IMapRenderer {
  constructor() {
    super();
    this._openai = null;
  }

  get name() { return 'gpt-image-1'; }

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }

  _getOpenAI() {
    if (!this._openai) this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._openai;
  }

  async render(controlImagePath, stylePreset = 'schley', userPrompt = '', spec = null, aiFredom = 'balanced') {
    console.log('[gpt-image-1] Responses API — gpt-4o + image_generation tool');
    console.log('[gpt-image-1] Cells:', spec?.cells?.length ?? 0, '/ Overlays:', spec?.overlays?.length ?? 0);

    const fullPrompt  = buildFullPrompt(spec, aiFredom, userPrompt);
    const imageBase64 = fs.readFileSync(controlImagePath).toString('base64');

    console.log('[gpt-image-1] Prompt length:', fullPrompt.length, 'chars');

    const response = await this._getOpenAI().responses.create({
      model: 'gpt-4o',
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` },
          { type: 'input_text',  text: fullPrompt },
        ],
      }],
      tools: [{ type: 'image_generation', size: '1024x1024' }],
    });

    const imageData = response.output
      .filter(o => o.type === 'image_generation_call')
      .map(o => o.result)[0];

    if (!imageData) throw new Error('Responses API returned no image_generation_call output');

    const imageBytes = Buffer.from(imageData, 'base64');
    const filename   = `map-sketch-${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, imageBytes);

    console.log(`[gpt-image-1] Saved: ${filename} (${imageBytes.length} bytes)`);
    return outputPath;
  }
}

module.exports = GptImageRenderer;
