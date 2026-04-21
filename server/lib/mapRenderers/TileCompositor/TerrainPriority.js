/**
 * TerrainPriority.js
 *
 * Maps a SketchCell (biome + optional relief) to:
 *   • a unique `terrainKey`    — used as lookup into TileLibrary
 *   • a draw `rank`            — lower = drawn first (further down visually)
 *
 * Higher-ranked terrain is stamped on top of lower-ranked terrain. When edge-
 * masks are added later, they will fade the upper tile's borders into the
 * lower tile beneath, giving a painterly transition without explicit
 * "forest-to-plains" transition tiles.
 *
 * Tile assets live in:
 *   server/assets/tiles/terrain/{terrainKey}.png   (128×128 px)
 *
 * The human-readable filename is the terrainKey directly — no code mapping
 * needed. TileLibrary loads and caches these on startup.
 */

'use strict';

/** Deterministic fallback when a relief has no exact tile variant. */
const RELIEF_FALLBACK = {
  flat:        'flat',
  rolling:     'flat',
  hills:       'hills',
  mountainous: 'mountains',
  cliffs:      'mountains',
  valley:      'flat',
  plateau:     'hills',
};

/**
 * Look up the tile asset key for a (biome, relief) pair.
 *
 * The sparse SketchCell format uses:
 *   biome:  'plains' | 'forest' | 'swamp' | 'desert' | 'tundra'
 *         | 'volcanic' | 'ocean' | 'coastal' | 'lake'
 *   relief: 'flat' | 'rolling' | 'hills' | 'mountainous' | 'cliffs'
 *         | 'valley' | 'plateau'  (optional)
 *
 * Not every (biome, relief) pair has a dedicated tile — we fall back to the
 * nearest available variant so rendering never throws for valid input.
 *
 * @param {{biome: string, relief?: string}} cell
 * @returns {string} terrainKey such as 'forest_hills' or 'ocean_deep'
 */
function terrainKeyForCell(cell) {
  const biome  = (cell?.biome ?? 'plains').toLowerCase();
  const relief = RELIEF_FALLBACK[(cell?.relief ?? 'flat').toLowerCase()] ?? 'flat';

  // Water-ish biomes have a single-variant tile regardless of relief
  if (biome === 'ocean')   return 'ocean_deep';
  if (biome === 'lake')    return 'inland_lake';
  if (biome === 'coastal') return 'coast_flat';

  // Swamp: only flat + "trees" exist. Map hills/mountains -> trees
  if (biome === 'swamp') {
    return relief === 'flat' ? 'swamp_flat' : 'swamp_trees';
  }

  // Volcanic: flat has its own tile; relief goes to mountain_small
  if (biome === 'volcanic') {
    return relief === 'flat' ? 'volcanic_flat' : 'volcanic_mountain_small';
  }

  // Tundra: only tundra_flat + tundra_mountains available
  if (biome === 'tundra') {
    return relief === 'flat' ? 'tundra_flat' : 'tundra_mountains';
  }

  // Desert: flat + hills (no desert_mountains in MVP asset set)
  if (biome === 'desert') {
    return relief === 'flat' ? 'desert_flat' : 'desert_hills';
  }

  // Forest: flat / hills / mountains
  if (biome === 'forest') return `forest_${relief}`;

  // Plains: flat / hills / mountains
  if (biome === 'plains') return `plains_${relief}`;

  // Unknown biome: safe default
  return 'plains_flat';
}

/**
 * Draw-order rank. Lower number = drawn first (beneath). Tiles with the same
 * rank are rendered in insertion order. Tunable — only rule is "looks right".
 */
const TERRAIN_RANK = {
  ocean_deep:                 0,
  ocean_shallow:              1,
  reef:                       1,
  inland_lake:                2,
  coast_flat:                 3,
  desert_flat:                4,
  tundra_flat:                4,
  plains_flat:                5,
  swamp_flat:                 6,
  swamp_trees:                6,
  desert_hills:               7,
  tundra_mountains:           7,
  plains_hills:               7,
  jungle_flat:                8,
  forest_flat:                8,
  jungle_hills:               9,
  forest_hills:               9,
  forest_edge:                9,
  plains_mountains:          10,
  forest_mountains:          11,
  volcanic_flat:             12,
  volcanic_mountain_small:   13,
  volcanic_mountain_large:   13,
};

function rankForTerrainKey(terrainKey) {
  return TERRAIN_RANK[terrainKey] ?? 5;
}

const ALL_TERRAIN_KEYS = Object.keys(TERRAIN_RANK);

module.exports = {
  terrainKeyForCell,
  rankForTerrainKey,
  TERRAIN_RANK,
  ALL_TERRAIN_KEYS,
};
