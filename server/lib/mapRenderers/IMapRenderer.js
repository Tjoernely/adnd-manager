/**
 * Interface all map renderers must implement.
 *
 * @param {string} controlImagePath  - Absolute path to coloured sketch PNG
 * @param {string} stylePreset       - 'parchment' | 'fantasy' | 'ink' | 'classic'
 * @param {string} userPrompt        - Optional extra details from DM
 * @returns {Promise<string>}        - Absolute path to generated image
 */
class IMapRenderer {
  async render(controlImagePath, stylePreset, userPrompt) {
    throw new Error('Not implemented');
  }

  isAvailable() {
    throw new Error('Not implemented');
  }

  get name() {
    throw new Error('Not implemented');
  }
}

module.exports = IMapRenderer;
