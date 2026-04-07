const GptImageRenderer    = require('./GptImageRenderer');
const GeminiImageRenderer = require('./GeminiImageRenderer');

const renderers = {
  'gpt-image-1': new GptImageRenderer(),
  'gemini':      new GeminiImageRenderer(),
};

/**
 * Returns the renderer for the given name, or auto-selects.
 * Priority: gpt-image-1 → gemini → error.
 *
 * @param {string} name  'auto' | 'gpt-image-1' | 'gemini'
 * @returns {IMapRenderer}
 */
function getRenderer(name = 'auto') {
  if (name === 'auto') {
    const preferred = ['gpt-image-1', 'gemini'];
    const available = preferred.find(r => renderers[r]?.isAvailable());
    if (!available) {
      throw new Error('No image renderer available. Set OPENAI_API_KEY or GOOGLE_AI_API_KEY in server/.env');
    }
    console.log(`[rendererFactory] Auto-selected: ${available}`);
    return renderers[available];
  }

  const renderer = renderers[name];
  if (!renderer) throw new Error(`Unknown renderer: ${name}`);
  if (!renderer.isAvailable()) throw new Error(`Renderer "${name}" not available — check API key in server/.env`);
  return renderer;
}

module.exports = { getRenderer };
