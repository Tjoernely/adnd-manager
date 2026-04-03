/**
 * server/lib/dalleProvider.js
 *
 * MapRendererProvider — DALL-E 3 fallback.
 * Uses OPENAI_API_KEY from server env.
 * Does NOT use sketchToPng (no ControlNet) — relies on text prompt only.
 */

const axios = require('axios');

const DALLE_API     = 'https://api.openai.com/v1/images/generations';
const STYLE_PREFIX  = 'Top-down fantasy world map, parchment paper texture, hand-drawn ink style, Forgotten Realms aesthetic, orthographic view, cartographic illustration.';
const STYLE_SUFFIX  = 'High detail, natural earth tones. No text, no labels, no watermarks.';

const dalleProvider = {
  name: 'dalle',

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  },

  /**
   * @param {string} _controlImage  ignored — DALL-E has no ControlNet
   * @param {string} promptAdditions  sketch-derived terrain/feature description
   * @returns {Promise<string>}  URL of the generated image (expires ~1h)
   */
  async render(_controlImage, promptAdditions) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const prompt = [STYLE_PREFIX, promptAdditions, STYLE_SUFFIX]
      .filter(Boolean)
      .join(' ')
      .substring(0, 4000); // DALL-E prompt limit

    console.log(`[dalle] Generating — prompt length: ${prompt.length}`);

    try {
      const resp = await axios.post(
        DALLE_API,
        {
          model:   'dall-e-3',
          prompt,
          n:       1,
          size:    '1024x1024',
          quality: 'standard',
        },
        {
          headers: {
            Authorization:  `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 60_000,
        },
      );

      const url = resp.data?.data?.[0]?.url;
      if (!url) throw new Error('DALL-E returned no image URL');
      console.log(`[dalle] Done — URL: ${url.substring(0, 80)}...`);
      return url;
    } catch (err) {
      const msg = err.response?.data?.error?.message ?? err.message;
      throw new Error(`DALL-E generation failed: ${msg}`);
    }
  },
};

module.exports = dalleProvider;
