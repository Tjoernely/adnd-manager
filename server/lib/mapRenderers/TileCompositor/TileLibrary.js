/**
 * TileLibrary.js
 *
 * Loads all terrain tile PNGs from `server/assets/tiles/terrain/` once and
 * caches them as decoded `@napi-rs/canvas` images. A single process-wide
 * instance is enough — tiles never change at runtime.
 *
 * Usage:
 *   const lib = new TileLibrary(tileDir);
 *   await lib.load();              // reads all PNGs
 *   const img = lib.get('forest_hills');   // returns Image, or null if missing
 *   const size = lib.tileSize();   // native px dimensions (all tiles square)
 */

'use strict';

const fs    = require('fs');
const path  = require('path');
const { loadImage } = require('@napi-rs/canvas');
const { ALL_TERRAIN_KEYS } = require('./TerrainPriority');

class TileLibrary {
  /**
   * @param {string} tileDir  absolute path to folder containing *.png tiles
   */
  constructor(tileDir) {
    this._tileDir = tileDir;
    this._tiles   = new Map();    // terrainKey -> Image
    this._size    = null;         // detected from first loaded tile
    this._loaded  = false;
  }

  /**
   * Load every known tile from disk. Missing files are logged and skipped
   * so a partial asset set still works — the renderer falls back gracefully.
   */
  async load() {
    if (this._loaded) return;

    const loads = ALL_TERRAIN_KEYS.map(async (key) => {
      const file = path.join(this._tileDir, `${key}.png`);
      try {
        await fs.promises.access(file, fs.constants.R_OK);
        const img = await loadImage(file);
        this._tiles.set(key, img);
        if (this._size == null && img.width) this._size = img.width;
      } catch (err) {
        console.warn(`[TileLibrary] missing tile ${key}.png (${err.code ?? err.message})`);
      }
    });

    await Promise.all(loads);
    this._loaded = true;
    console.log(`[TileLibrary] loaded ${this._tiles.size}/${ALL_TERRAIN_KEYS.length} tiles (native size=${this._size}px)`);
  }

  /** Returns the loaded Image for a terrainKey, or null if not loaded. */
  get(terrainKey) {
    return this._tiles.get(terrainKey) ?? null;
  }

  /** Native tile size in px (square). Null if nothing loaded. */
  tileSize() { return this._size; }

  has(terrainKey)  { return this._tiles.has(terrainKey); }
  size()           { return this._tiles.size; }
  keys()           { return [...this._tiles.keys()]; }
}

module.exports = TileLibrary;
