/**
 * TileCompositorRenderer.js
 *
 * IMapRenderer implementation that composes a finished fantasy map from
 * pre-rendered tile assets + the SketchSpec, without any AI calls.
 *
 * Contract matches server/lib/mapRenderers/IMapRenderer.js:
 *   render(controlImagePath, stylePreset, userPrompt, spec, aiFredom) : string
 *   isAvailable() : boolean
 *   name         : string
 *
 * The `controlImagePath`, `stylePreset`, `userPrompt`, and `aiFredom`
 * arguments are accepted for interface symmetry but deliberately ignored —
 * the compositor is 100% deterministic: same spec in, byte-identical
 * PNG out. This is the whole point of the redesign (no AI improvisation).
 */

'use strict';

const fs         = require('fs');
const path       = require('path');
const crypto     = require('crypto');
const IMapRenderer = require('../IMapRenderer');

const TileLibrary = require('./TileLibrary');
const MapComposer = require('./MapComposer');

const DEFAULT_TILE_DIR   = path.join(__dirname, '..', '..', '..', 'assets', 'tiles', 'terrain');
const DEFAULT_MASK_DIR   = path.join(__dirname, '..', '..', '..', 'assets', 'tiles', 'masks');
const DEFAULT_BRUSH_DIR  = path.join(__dirname, '..', '..', '..', 'assets', 'tiles', 'brushes');
const DEFAULT_OUTPUT_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads', 'maps');
const DEFAULT_TILE_SIZE  = 128;

class TileCompositorRenderer extends IMapRenderer {
  /**
   * @param {object} [opts]
   * @param {string} [opts.tileDir]    absolute path to terrain tile PNGs
   * @param {string} [opts.maskDir]    absolute path to edge mask PNGs (future)
   * @param {string} [opts.brushDir]   absolute path to brush PNGs (future)
   * @param {string} [opts.outputDir]  absolute path for generated PNG output
   * @param {number} [opts.tileSize]   px per cell in the output canvas
   */
  constructor(opts = {}) {
    super();
    this._tileDir   = opts.tileDir   || DEFAULT_TILE_DIR;
    this._maskDir   = opts.maskDir   || DEFAULT_MASK_DIR;
    this._brushDir  = opts.brushDir  || DEFAULT_BRUSH_DIR;
    this._outputDir = opts.outputDir || DEFAULT_OUTPUT_DIR;
    this._tileSize  = opts.tileSize  || DEFAULT_TILE_SIZE;

    // Lazily loaded on first render so app startup stays fast.
    this._tileLib   = null;
    this._loading   = null;
  }

  get name() { return 'tile-compositor'; }

  /**
   * Compositor is available whenever the required assets exist on disk.
   * No external API key is needed.
   */
  isAvailable() {
    try {
      if (!fs.existsSync(this._tileDir)) return false;
      const pngs = fs.readdirSync(this._tileDir).filter(f => f.endsWith('.png'));
      return pngs.length > 0;
    } catch (err) {
      console.warn(`[tile-compositor] isAvailable check failed: ${err.message}`);
      return false;
    }
  }

  async _ensureLoaded() {
    if (this._tileLib && this._tileLib.size() > 0) return;
    if (!this._loading) {
      this._tileLib = new TileLibrary(this._tileDir);
      this._loading = this._tileLib.load();
    }
    await this._loading;
  }

  /**
   * @param {string}  _controlImagePath  - Ignored (kept for interface parity).
   * @param {string} [_stylePreset]      - Ignored.
   * @param {string} [_userPrompt]       - Ignored.
   * @param {object}  spec               - SketchSpec (required).
   * @param {string} [_aiFredom]         - Ignored.
   * @returns {Promise<string>} absolute path to the generated PNG.
   */
  async render(_controlImagePath, _stylePreset, _userPrompt, spec, _aiFredom) {
    if (!spec || !Array.isArray(spec.cells)) {
      throw new Error('tile-compositor: SketchSpec with cells[] is required');
    }

    await this._ensureLoaded();

    const cellCount    = spec.cells.length;
    const overlayCount = Array.isArray(spec.overlays) ? spec.overlays.length : 0;
    console.log(`[tile-compositor] rendering cells=${cellCount} overlays=${overlayCount} (tileSize=${this._tileSize})`);

    const composer = new MapComposer(spec, {
      tileLib:  this._tileLib,
      tileSize: this._tileSize,
    });

    const t0  = Date.now();
    const buf = await composer.compose();
    const ms  = Date.now() - t0;

    fs.mkdirSync(this._outputDir, { recursive: true });
    const filename = `map-tilecomp-${crypto.randomUUID()}.png`;
    const outPath  = path.join(this._outputDir, filename);
    fs.writeFileSync(outPath, buf);

    console.log(`[tile-compositor] wrote ${filename} (${buf.length} bytes, ${ms}ms)`);
    return outPath;
  }
}

module.exports = TileCompositorRenderer;
