const IMapRenderer = require('./IMapRenderer');

/**
 * Google Gemini Image Generation provider.
 * Ready to activate when GOOGLE_AI_API_KEY is set in server/.env.
 *
 * Docs:  https://ai.google.dev/gemini-api/docs/image-generation
 * Model: gemini-2.0-flash-preview-image-generation
 *
 * To activate:
 *   npm install @google/generative-ai --prefix server
 *   Add GOOGLE_AI_API_KEY=... to server/.env
 */
class GeminiImageRenderer extends IMapRenderer {
  get name() { return 'gemini'; }

  isAvailable() {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  async render(controlImagePath, stylePreset = 'parchment', userPrompt = '') {
    throw new Error(
      'GeminiImageRenderer not yet implemented. ' +
      'Set GOOGLE_AI_API_KEY in server/.env and implement this provider.',
    );
  }
}

module.exports = GeminiImageRenderer;
