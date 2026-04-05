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
const visionProvider    = require('./visionProvider');

const MOCK_PLACEHOLDER = 'https://placehold.co/1024x1024/4a5d23/ffffff/png?text=ControlNet+Mock';

/**
 * Generate a map image from a sketch image + prompt additions.
 *
 * @param {object} opts
 * @param {string}  opts.controlImage    base64 data-URI PNG from sketchToPng
 * @param {string}  opts.promptAdditions terrain/feature description string
 * @param {'auto'|'controlnet'|'dalle'|'vision'} opts.renderer  user preference
 * @param {function} opts.onStatus  optional status callback (controlnet only)
 * @returns {Promise<{ imageUrl: string, renderer_used: string }>}
 */
async function generateFromSketch({ controlImage, promptAdditions, renderer = 'auto', onStatus }) {

  // ── Mock mode ──────────────────────────────────────────────────────────────
  if (process.env.CONTROLNET_MOCK === 'true') {
    console.log('[rendererFactory] CONTROLNET_MOCK=true — returning placeholder');
    await new Promise(r => setTimeout(r, 2000));
    return { imageUrl: MOCK_PLACEHOLDER, renderer_used: 'mock' };
  }

  // ── Vision path (Claude → DALL-E) ──────────────────────────────────────────
  if (renderer === 'vision') {
    if (!visionProvider.isAvailable()) {
      throw new Error('Vision renderer requires ANTHROPIC_API_KEY and OPENAI_API_KEY');
    }
    console.log('[rendererFactory] Using Vision (Claude → DALL-E)');
    const imageUrl = await visionProvider.render(controlImage, promptAdditions);
    return { imageUrl, renderer_used: visionProvider.name };
  }

  // ── ControlNet path ────────────────────────────────────────────────────────
  if (renderer === 'controlnet' || renderer === 'auto') {
    if (replicateProvider.isAvailable()) {
      try {
        console.log('[rendererFactory] Using Replicate ControlNet');
        const imageUrl = await replicateProvider.render(controlImage, promptAdditions, { onStatus });
        return { imageUrl, renderer_used: replicateProvider.name };
      } catch (err) {
        if (renderer === 'controlnet') throw err; // explicit — don't fall back
        console.warn(`[rendererFactory] ControlNet failed — falling back: ${err.message}`);
      }
    } else {
      console.log('[rendererFactory] ControlNet not configured — trying Vision/DALL-E');
    }
    // auto fallback: try Vision, then plain DALL-E
    if (visionProvider.isAvailable()) {
      console.log('[rendererFactory] Auto fallback: Using Vision (Claude → DALL-E)');
      const imageUrl = await visionProvider.render(controlImage, promptAdditions);
      return { imageUrl, renderer_used: visionProvider.name };
    }
  }

  // ── DALL-E path ────────────────────────────────────────────────────────────
  if (renderer === 'dalle' || renderer === 'auto') {
    if (!dalleProvider.isAvailable()) {
      throw new Error('No image renderer available — set REPLICATE_API_KEY, ANTHROPIC_API_KEY, or OPENAI_API_KEY');
    }
    console.log('[rendererFactory] Using DALL-E');
    const imageUrl = await dalleProvider.render(controlImage, promptAdditions);
    return { imageUrl, renderer_used: dalleProvider.name };
  }

  throw new Error(`Unknown renderer: ${renderer}`);
}

module.exports = { generateFromSketch };
