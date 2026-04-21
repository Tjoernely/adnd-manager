/**
 * MapComposer.js
 *
 * Orchestrates deterministic tile compositing. Given a SketchSpec and a
 * loaded TileLibrary, produces a PNG buffer that stamps tiles at their
 * exact sketch coordinates in priority order.
 *
 * MVP scope (step 1-3 of TILE_COMPOSITOR_PLAN.md):
 *   - One biome-priority pass, no edge masks, no overlays.
 *   - Output is "blocky" but spatially 100% faithful to the sketch.
 *
 * Later phases (deliberately NOT in this file yet):
 *   - EdgeMaskLibrary + BitmaskCalculator for soft terrain transitions.
 *   - PathRenderer for rivers / roads.
 *   - Parchment paper texture + vignette.
 */

'use strict';

const { createCanvas } = require('@napi-rs/canvas');
const {
  terrainKeyForCell,
  rankForTerrainKey,
} = require('./TerrainPriority');

const DEFAULT_TILE_SIZE = 128;
const GRID_SIZE_DEFAULT = 32;

class MapComposer {
  /**
   * @param {object}      spec                 SketchSpec (cells + overlays + ...)
   * @param {object}      deps
   * @param {TileLibrary} deps.tileLib
   * @param {number}      [deps.tileSize=128]  px per cell in output
   */
  constructor(spec, { tileLib, tileSize = DEFAULT_TILE_SIZE }) {
    if (spec == null)    throw new Error('MapComposer: spec is required');
    if (tileLib == null) throw new Error('MapComposer: tileLib is required');

    this._spec     = spec;
    this._tileLib  = tileLib;
    this._tileSize = tileSize;
    this._gridW    = spec.grid_size || GRID_SIZE_DEFAULT;
    this._gridH    = spec.grid_size || GRID_SIZE_DEFAULT;
  }

  /**
   * Build the composite PNG. Returns the encoded Buffer.
   * @returns {Promise<Buffer>}
   */
  async compose() {
    const W = this._gridW * this._tileSize;
    const H = this._gridH * this._tileSize;

    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // Solid background = lowest-priority terrain colour (ocean deep).
    // Any unpainted cell reads as "deep water" rather than black.
    this._fillBackground(ctx, W, H);

    const cellsByKey = this._groupCellsByTerrain();

    const orderedKeys = [...cellsByKey.keys()].sort(
      (a, b) => rankForTerrainKey(a) - rankForTerrainKey(b),
    );

    for (const key of orderedKeys) {
      const img = this._tileLib.get(key);
      if (img == null) {
        console.warn(`[MapComposer] no tile image for "${key}" - skipping ${cellsByKey.get(key).length} cells`);
        continue;
      }
      for (const cell of cellsByKey.get(key)) {
        const px = cell.x * this._tileSize;
        const py = cell.y * this._tileSize;
        ctx.drawImage(img, px, py, this._tileSize, this._tileSize);
      }
    }

    return canvas.toBuffer('image/png');
  }

  _fillBackground(ctx, W, H) {
    ctx.fillStyle = '#12263f';
    ctx.fillRect(0, 0, W, H);
  }

  _groupCellsByTerrain() {
    const groups = new Map();
    const cells  = Array.isArray(this._spec.cells) ? this._spec.cells : [];

    for (const cell of cells) {
      if (cell.x < 0 || cell.x >= this._gridW) continue;
      if (cell.y < 0 || cell.y >= this._gridH) continue;
      const key = terrainKeyForCell(cell);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(cell);
    }
    return groups;
  }
}

module.exports = MapComposer;
