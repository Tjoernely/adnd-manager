/**
 * src/rules-engine/sketchToMapSpec.ts
 *
 * Converts a SketchSpec into GeneratedParams (for MapGenerator pre-population)
 * and image-prompt additions (for DALL-E enrichment).
 *
 * Pure functions — no side effects.
 */

import type { SketchSpec, SketchCell, BiomeType, ReliefType, ModifierType } from './mapTypes';
import type { GeneratedParams } from './generationMapper';

// ── Biome → MapGenerator terrain string ──────────────────────────────────────

const BIOME_TO_TERRAIN: Record<BiomeType, string> = {
  plains:    'Plains',
  forest:    'Forest',
  swamp:     'Swamp',
  desert:    'Desert',
  tundra:    'Tundra',
  volcanic:  'Volcanic',
  ocean:     'Coastal',
  coastal:   'Coastal',
  mountains: 'Mountains',
  lake:      'Coastal',
};

// ── Biome → atmosphere hint ───────────────────────────────────────────────────

const BIOME_ATMOSPHERE: Partial<Record<BiomeType, string>> = {
  volcanic: 'Dangerous',
  swamp:    'Foreboding',
  tundra:   'Desolate',
  desert:   'Mysterious',
  ocean:    'Mysterious',
};

// ── Modifier → atmosphere override ───────────────────────────────────────────

const MODIFIER_ATMOSPHERE: Partial<Record<ModifierType, string>> = {
  cursed:       'Foreboding',
  sacred:       'Sacred',
  magical:      'Magical',
  blighted:     'Dangerous',
  ancient_ruins:'Mysterious',
};

// ── Scope → mapType ───────────────────────────────────────────────────────────

const SCOPE_TO_MAP_TYPE: Record<string, string> = {
  world:  'World',
  region: 'Region',
  local:  'Region', // closest available option
};

// ── Relief → terrain suffix ───────────────────────────────────────────────────

const RELIEF_SUFFIX: Partial<Record<ReliefType, string>> = {
  mountainous: 'Mountains',
  hills:       'Hills',
  cliffs:      'Cliffs',
  valley:      'Valley',
  plateau:     'Plateau',
};

// ── Dominant biome helper ─────────────────────────────────────────────────────

function dominantBiomes(spec: SketchSpec, topN = 3): BiomeType[] {
  const counts: Record<string, number> = {};
  for (const cell of spec.cells) {
    counts[cell.biome] = (counts[cell.biome] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([b]) => b as BiomeType);
}

function dominantRelief(spec: SketchSpec): ReliefType | null {
  const counts: Record<string, number> = {};
  for (const cell of spec.cells) {
    if (cell.relief) counts[cell.relief] = (counts[cell.relief] ?? 0) + 1;
  }
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? (entries[0][0] as ReliefType) : null;
}

// ── Main conversion: SketchSpec → GeneratedParams ────────────────────────────

export function sketchToGeneratedParams(spec: SketchSpec): Partial<GeneratedParams> {
  const biomes  = dominantBiomes(spec);
  const primary = biomes[0] ?? 'plains';
  const relief  = dominantRelief(spec);

  // Build terrain array: primary biome terrain + relief additions (deduplicated)
  const terrainSet = new Set<string>();
  terrainSet.add(BIOME_TO_TERRAIN[primary]);
  biomes.slice(1).forEach(b => terrainSet.add(BIOME_TO_TERRAIN[b]));
  if (relief && RELIEF_SUFFIX[relief]) terrainSet.add(RELIEF_SUFFIX[relief]!);
  const terrain = [...terrainSet].slice(0, 4);

  // Atmosphere: modifiers take priority, then biome hint, then default
  let atmosphere = 'Neutral';
  const modAtmo = spec.modifiers
    .map(m => MODIFIER_ATMOSPHERE[m.type])
    .find(a => a !== undefined);
  if (modAtmo) {
    atmosphere = modAtmo;
  } else if (BIOME_ATMOSPHERE[primary]) {
    atmosphere = BIOME_ATMOSPHERE[primary]!;
  }

  // Inhabitants: infer from modifiers / biomes
  let inhabitants = 'Mixed';
  if (spec.modifiers.some(m => m.type === 'sacred')) inhabitants = 'Humanoids';
  if (spec.modifiers.some(m => m.type === 'blighted' || m.type === 'cursed'))
    inhabitants = 'Monsters';
  if (primary === 'ocean') inhabitants = 'Seafarers';

  // Era: lore_mode nudges toward ancient
  const era = spec.lore_mode ? 'Ancient' : 'Medieval';

  // Size: rough guess from scale
  let size = 'Medium';
  if (spec.scale === '500mi' || spec.scale === '200mi') size = 'Large';
  if (spec.scale === '10mi') size = 'Small';

  const mapType = SCOPE_TO_MAP_TYPE[spec.scope] ?? 'Region';

  const result: Partial<GeneratedParams> = {
    mapType,
    terrain,
    atmosphere,
    inhabitants,
    era,
    size,
  };

  if (spec.user_prompt) result.user_description = spec.user_prompt;

  return result;
}

// ── Point lookup: terrain at a fractional position ───────────────────────────

/**
 * Returns the biome and relief at a given position (0–1 × 0–1) in the sketch.
 * Used to override terrain for child maps generated from POIs on a sketched map.
 */
export function getPOITerrainAt(
  spec: SketchSpec,
  xPercent: number,
  yPercent: number,
): { biome: BiomeType; relief: ReliefType | null } {
  const cx = Math.round(xPercent * 31);
  const cy = Math.round(yPercent * 31);

  // Exact cell hit first
  const exact = spec.cells.find(c => c.x === cx && c.y === cy);
  if (exact) return { biome: exact.biome, relief: exact.relief ?? null };

  // Nearest painted cell (Manhattan distance)
  let nearest: SketchCell | null = null;
  let bestDist = Infinity;
  for (const cell of spec.cells) {
    const d = Math.abs(cell.x - cx) + Math.abs(cell.y - cy);
    if (d < bestDist) { bestDist = d; nearest = cell; }
  }

  if (nearest) return { biome: nearest.biome, relief: nearest.relief ?? null };

  return { biome: 'plains', relief: null };
}

// ── Image prompt additions ─────────────────────────────────────────────────────

export function sketchToImagePromptAdditions(spec: SketchSpec): string {
  const parts: string[] = [];

  // Biome breakdown
  const biomes = dominantBiomes(spec, 5);
  if (biomes.length) {
    parts.push(`Terrain: ${biomes.map(b => BIOME_TO_TERRAIN[b]).join(', ')}`);
  }

  // Relief
  const relief = dominantRelief(spec);
  if (relief) parts.push(`Relief: ${relief}`);

  // Overlays
  const overlayTypes = [...new Set(spec.overlays.map(o => o.type))];
  if (overlayTypes.length) parts.push(`Features: ${overlayTypes.join(', ')}`);

  // Modifiers
  if (spec.modifiers.length) {
    const modLabels = spec.modifiers.map(m => m.type.replace(/_/g, ' '));
    parts.push(`Special: ${[...new Set(modLabels)].join(', ')}`);
  }

  // Climate + scale
  if (spec.climate) parts.push(`Climate: ${spec.climate}`);
  if (spec.scale)   parts.push(`Scale: ${spec.scale}`);

  // Lore
  if (spec.lore_mode) parts.push('Style: rich historical lore, aged cartography');

  // AI freedom
  if (spec.ai_freedom === 'strict')
    parts.push('Strictly follow the terrain layout as described');
  if (spec.ai_freedom === 'creative')
    parts.push('Feel free to add dramatic artistic flourishes beyond the description');

  // User prompt last
  if (spec.user_prompt) parts.push(spec.user_prompt);

  return parts.join('. ');
}
