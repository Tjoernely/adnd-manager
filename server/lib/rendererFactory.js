/**
 * server/lib/rendererFactory.js
 *
 * Strategy pattern — selects ControlNet (Replicate) or DALL-E based on
 * availability and user preference.
 *
 * CONTROLNET_MOCK=true → returns placeholder without calling any API.
 * Easy to add new providers: implement the MapRendererProvider interface,
 * import here, add to the selection logic.
 */

const replicateProvider = require('./replicateProvider');
const dalleProvider     = require('./dalleProvider');

const MOCK_PLACEHOLDER = 'https://placehold.co/1024x1024/4a5d23/ffffff/png?text=ControlNet+Mock';

/**
 * Generate a map image from a sketch segmentation image + prompt additions.
 *
 * @param {object} opts
 * @param {string}  opts.controlImage    base64 data-URI PNG from sketchToPng
 * @param {string}  opts.promptAdditions terrain/feature description string
 * @param {'auto'|'controlnet'|'dalle'} opts.renderer  user preference
 * @returns {Promise<{ imageUrl: string, renderer_used: string }>}
 */
async function generateFromSketch({ controlImage, promptAdditions, renderer = 'auto' }) {

  // ── Mock mode ──────────────────────────────────────────────────────────────
  if (process.env.CONTROLNET_MOCK === 'true') {
    console.log('[rendererFactory] CONTROLNET_MOCK=true — returning placeholder');
    await new Promise(r => setTimeout(r, 2000)); // simulate network delay
    return { imageUrl: MOCK_PLACEHOLDER, renderer_used: 'mock' };
  }

  // ── ControlNet path ────────────────────────────────────────────────────────
  if (renderer === 'controlnet' || renderer === 'auto') {
    if (replicateProvider.isAvailable()) {
      try {
        console.log('[rendererFactory] Using Replicate ControlNet');
        const imageUrl = await replicateProvider.render(controlImage, promptAdditions);
        return { imageUrl, renderer_used: replicateProvider.name };
      } catch (err) {
        if (renderer === 'controlnet') throw err; // explicit request — don't silently fall back
        console.warn(`[rendererFactory] ControlNet failed — falling back to DALL-E: ${err.message}`);
      }
    } else {
      console.log('[rendererFactory] ControlNet not configured (no REPLICATE_API_KEY) — using DALL-E');
    }
  }

  // ── DALL-E fallback ────────────────────────────────────────────────────────
  if (!dalleProvider.isAvailable()) {
    throw new Error('No image renderer available — set REPLICATE_API_KEY or OPENAI_API_KEY');
  }

  console.log('[rendererFactory] Using DALL-E');
  const imageUrl = await dalleProvider.render(controlImage, promptAdditions);
  return { imageUrl, renderer_used: dalleProvider.name };
}

module.exports = { generateFromSketch };
