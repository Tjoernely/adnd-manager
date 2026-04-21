const GptImageRenderer        = require('./GptImageRenderer');
const GeminiImageRenderer     = require('./GeminiImageRenderer');
const TileCompositorRenderer  = require('./TileCompositor/TileCompositorRenderer');

const renderers = {
  'tile-compositor': new TileCompositorRenderer(),
  'gpt-image-1':     new GptImageRenderer(),
  'gemini':          new GeminiImageRenderer(),
};

/**
 * Returns the renderer for the given name, or auto-selects.
 *
 * Auto-selection priority (tile-compositor is deterministic and free, so it
 * is preferred whenever the tile assets are present):
 *   tile-compositor -> gemini -> gpt-image-1 -> error.
 *
 * @param {string} name  'auto' | 'tile-compositor' | 'gpt-image-1' | 'gemini'
 * @returns {IMapRenderer}
 */
function getRenderer(name = 'auto') {
  if (name === 'auto') {
    const preferred = ['tile-compositor', 'gemini', 'gpt-image-1'];
    const available = preferred.find(r => renderers[r] && renderers[r].isAvailable());
    if (!available) {
      throw new Error('No image renderer available. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY in server/.env, or install tile assets.');
    }
    console.log(`[rendererFactory] Auto-selected: ${available}`);
    return renderers[available];
  }

  const renderer = renderers[name];
  if (!renderer) throw new Error(`Unknown renderer: ${name}`);
  if (!renderer.isAvailable()) throw new Error(`Renderer "${name}" not available - check API key in server/.env or tile assets on disk`);
  return renderer;
}

module.exports = { getRenderer };
