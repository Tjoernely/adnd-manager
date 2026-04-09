/**
 * GptImageRenderer — OpenAI Responses API with gpt-4o + image_generation tool.
 *
 * Flow:
 *   1. Build semantic grid + relief grid + connector grid + must-keep facts
 *   2. Build full 9-part prompt
 *   3. Send sketch PNG + prompt to gpt-4o via responses.create
 *   4. Extract image_generation_call result → save to disk
 */

const OpenAI       = require('openai');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

// ── Biome character encoding ───────────────────────────────────────────────────

const BIOME_CHAR = {
  plains:   'P',
  forest:   'F',
  swamp:    'S',
  desert:   'D',
  tundra:   'T',
  volcanic: 'V',
  ocean:    'O',
  coastal:  'C',
  lake:     'L',
};

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

const PRIORITY_ORDER = `Rendering priority order (follow strictly):
1. Must-keep facts below are HARD constraints — never violate them
2. Terrain grid defines exact biome placement — treat as authoritative
3. Relief and connector grids refine terrain — apply where shown
4. Freedom mode governs artistic latitude beyond the constraints above
5. Style suffix defines visual aesthetic
6. User instructions are additive — do not override constraints 1–3`;

// ── Freedom modes ──────────────────────────────────────────────────────────────

const FREEDOM_MODES = {
  strict: `Freedom mode: STRICT
Keep geography and biome layout very close to the sketch.
Do not invent major new regions or relocate terrain.
Only add minor landmarks and small lore-friendly details.
Even in strict mode: render as fully illustrated fantasy cartography,
not a beautified copy of the sketch.
Priority: high structural fidelity + high render quality.`,

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

// ── Semantic grid builder ──────────────────────────────────────────────────────

function buildSemanticGrid(spec) {
  const rows = spec.grid?.rows || 32;
  const cols = spec.grid?.cols || 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));

  for (const cell of (spec.cells ?? [])) {
    if (cell.biome && cell.y < rows && cell.x < cols) {
      grid[cell.y][cell.x] = BIOME_CHAR[cell.biome] ?? '.';
    }
  }

  const lines = [];
  lines.push('Terrain grid (32×32, origin top-left, X=west→east, Y=north→south):');
  lines.push('Legend: P=plains F=forest S=swamp D=desert T=tundra V=volcanic O=ocean C=coastal L=lake .=empty');
  lines.push('');

  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;  // skip fully-empty rows
    lines.push(`Y${String(r).padStart(2,'0')}: ${grid[r].join('')}`);
  }

  return lines.join('\n');
}

// ── Relief grid builder ────────────────────────────────────────────────────────

function buildReliefGrid(spec) {
  const rows = spec.grid?.rows || 32;
  const cols = spec.grid?.cols || 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));

  let hasRelief = false;
  for (const cell of (spec.cells ?? [])) {
    if (cell.relief && cell.relief !== 'flat' && cell.y < rows && cell.x < cols) {
      if (cell.relief === 'mountainous') { grid[cell.y][cell.x] = 'M'; hasRelief = true; }
      else if (cell.relief === 'hills')  { grid[cell.y][cell.x] = 'H'; hasRelief = true; }
    }
  }

  if (!hasRelief) return null;

  const lines = [];
  lines.push('Relief grid (same coordinate system):');
  lines.push('Legend: M=mountains H=hills .=flat/unspecified');
  lines.push('');

  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;
    lines.push(`Y${String(r).padStart(2,'0')}: ${grid[r].join('')}`);
  }

  return lines.join('\n');
}

// ── Connector grid builder ─────────────────────────────────────────────────────

function buildConnectorGrid(spec) {
  const rows = spec.grid?.rows || 32;
  const cols = spec.grid?.cols || 32;
  const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));

  const OVERLAY_CHAR = {
    river:  '~',
    road:   '=',
    canyon: '|',
    chasm:  '#',
  };

  const overlays = spec.overlays ?? [];
  if (!overlays.length) return null;

  let hasConnector = false;
  for (const overlay of overlays) {
    const ch = OVERLAY_CHAR[overlay.type];
    if (!ch) continue;
    for (const pt of (overlay.points ?? [])) {
      if (pt.y < rows && pt.x < cols) {
        grid[pt.y][pt.x] = ch;
        hasConnector = true;
      }
    }
  }

  if (!hasConnector) return null;

  const lines = [];
  lines.push('Connector grid (same coordinate system):');
  lines.push('Legend: ~=river ==road |=canyon #=chasm .=none');
  lines.push('');

  for (let r = 0; r < rows; r++) {
    if (grid[r].every(v => v === '.')) continue;
    lines.push(`Y${String(r).padStart(2,'0')}: ${grid[r].join('')}`);
  }

  return lines.join('\n');
}

// ── Must-keep facts builder ────────────────────────────────────────────────────

function buildMustKeepFacts(spec) {
  const cells   = spec.cells ?? [];
  const overlays = spec.overlays ?? [];
  const facts   = [];

  if (!cells.length) return null;

  // Edge zone analysis (N: y<8, S: y≥24, E: x≥24, W: x<8, center: 8–23)
  const edges = { N: [], S: [], E: [], W: [], center: [] };
  for (const cell of cells) {
    if (cell.y < 8)       edges.N.push(cell.biome);
    if (cell.y >= 24)     edges.S.push(cell.biome);
    if (cell.x >= 24)     edges.E.push(cell.biome);
    if (cell.x < 8)       edges.W.push(cell.biome);
    if (cell.x >= 8 && cell.x < 24 && cell.y >= 8 && cell.y < 24)
                          edges.center.push(cell.biome);
  }

  const uniqueBiomesIn = arr => [...new Set(arr)];
  const dominantIn = arr => {
    if (!arr.length) return null;
    const counts = {};
    for (const b of arr) counts[b] = (counts[b] ?? 0) + 1;
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
  };

  // Biomes exclusive to specific edges (exist on that edge, absent from center)
  const centerBiomes = new Set(uniqueBiomesIn(edges.center));
  for (const [edge, edgeCells] of Object.entries(edges)) {
    if (edge === 'center') continue;
    const edgeBiomes = uniqueBiomesIn(edgeCells);
    const exclusive  = edgeBiomes.filter(b => !centerBiomes.has(b));
    if (exclusive.length) {
      const dir = { N:'north', S:'south', E:'east', W:'west' }[edge];
      facts.push(`- ${exclusive.join('/')} exists only along the ${dir} edge — do not place it in the center`);
    }
  }

  // Dominant biome per edge
  for (const [edge, edgeCells] of Object.entries(edges)) {
    if (edge === 'center' || !edgeCells.length) continue;
    const dom = dominantIn(edgeCells);
    if (dom) {
      const dir = { N:'north', S:'south', E:'east', W:'west' }[edge];
      facts.push(`- ${dir} edge is dominated by ${dom}`);
    }
  }

  // Forest-ocean/coastal adjacency
  const WATER_BIOMES = new Set(['ocean', 'coastal', 'lake']);
  const cellMap = new Map();
  for (const cell of cells) cellMap.set(`${cell.x},${cell.y}`, cell);

  const forestCells = cells.filter(c => c.biome === 'forest');
  for (const fc of forestCells) {
    const neighbors = [
      [fc.x, fc.y - 1], [fc.x, fc.y + 1],
      [fc.x - 1, fc.y], [fc.x + 1, fc.y],
    ];
    const waterNeighbor = neighbors.find(([nx, ny]) => {
      const n = cellMap.get(`${nx},${ny}`);
      return n && WATER_BIOMES.has(n.biome);
    });
    if (waterNeighbor) {
      facts.push(`- forest meets water at approximately (${fc.x},${fc.y}) — render as wooded coastline`);
      break; // one representative fact is enough
    }
  }

  // Isolated inland lakes (lake cells not adjacent to ocean/coastal)
  const lakeCells = cells.filter(c => c.biome === 'lake');
  const isolatedLakes = lakeCells.filter(lc => {
    const neighbors = [
      [lc.x, lc.y - 1], [lc.x, lc.y + 1],
      [lc.x - 1, lc.y], [lc.x + 1, lc.y],
    ];
    return !neighbors.some(([nx, ny]) => {
      const n = cellMap.get(`${nx},${ny}`);
      return n && (n.biome === 'ocean' || n.biome === 'coastal');
    });
  });
  if (isolatedLakes.length) {
    facts.push(`- ${isolatedLakes.length} inland lake(s) present — render as landlocked, not connected to ocean`);
  }

  // Overlay path facts (river/road origin→destination)
  const OVERLAY_LABELS = { river: 'river', road: 'road', canyon: 'canyon', chasm: 'chasm' };
  for (const overlay of overlays) {
    const pts = overlay.points ?? [];
    if (pts.length < 2) continue;
    const label = OVERLAY_LABELS[overlay.type] ?? overlay.type;
    const start = pts[0];
    const end   = pts[pts.length - 1];
    facts.push(`- ${label} runs from (${start.x},${start.y}) to (${end.x},${end.y})`);
  }

  // Negative constraints — biomes absent from edge zones
  const allBiomes = uniqueBiomesIn(cells.map(c => c.biome));
  for (const [edge, edgeCells] of Object.entries(edges)) {
    if (edge === 'center' || !edgeCells.length) continue;
    const edgeBiomeSet = new Set(edgeCells);
    const dir = { N:'north', S:'south', E:'east', W:'west' }[edge];
    // Only emit for dramatic mismatches (ocean/volcanic absent from an edge with many cells)
    for (const b of ['ocean', 'volcanic']) {
      if (allBiomes.includes(b) && !edgeBiomeSet.has(b) && edgeCells.length > 4) {
        facts.push(`- no ${b} along ${dir} edge`);
      }
    }
  }

  if (!facts.length) return null;

  return 'Must-keep structural facts (hard constraints):\n' + facts.join('\n');
}

// ── Style suffix ───────────────────────────────────────────────────────────────

function buildStyleSuffix(spec) {
  const parts = [];
  if (spec.scope)  parts.push(`Scope: ${spec.scope}`);
  if (spec.scale)  parts.push(`Scale: ${spec.scale}`);
  if (spec.climate) parts.push(`Climate: ${spec.climate}`);
  if (spec.lore_mode) parts.push('Style: rich historical lore, aged cartography');
  return parts.length ? parts.join('. ') : null;
}

// ── Full prompt builder ────────────────────────────────────────────────────────

function buildFullPrompt(spec, aiFredom, userPrompt) {
  const freedomKey   = (aiFredom || 'balanced').toLowerCase();
  const freedomBlock = FREEDOM_MODES[freedomKey] ?? FREEDOM_MODES.balanced;

  const mustKeep      = buildMustKeepFacts(spec);
  const terrainGrid   = buildSemanticGrid(spec);
  const reliefGrid    = buildReliefGrid(spec);
  const connectorGrid = buildConnectorGrid(spec);
  const styleSuffix   = buildStyleSuffix(spec);

  const sections = [
    BASE_PROMPT,
    PRIORITY_ORDER,
  ];

  if (mustKeep)      sections.push(mustKeep);
  sections.push(terrainGrid);
  if (reliefGrid)    sections.push(reliefGrid);
  if (connectorGrid) sections.push(connectorGrid);
  sections.push(freedomBlock);
  if (styleSuffix)   sections.push(styleSuffix);
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
    console.log('[gpt-image-1] Using Responses API with gpt-4o + image_generation tool');
    console.log('[gpt-image-1] Grid size:', spec?.cells?.length ?? 0, 'cells');

    const fullPrompt  = buildFullPrompt(spec, aiFredom, userPrompt);
    const imageBase64 = fs.readFileSync(controlImagePath).toString('base64');

    console.log('[gpt-image-1] Prompt length:', fullPrompt.length);

    const response = await this._getOpenAI().responses.create({
      model: 'gpt-4o',
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` },
          { type: 'input_text',  text: fullPrompt },
        ],
      }],
      tools: [{ type: 'image_generation' }],
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

    console.log(`[gpt-image-1] Done — saved: ${filename} (${imageBytes.length} bytes)`);
    return outputPath;
  }
}

module.exports = GptImageRenderer;
