/**
 * GptImageRenderer — OpenAI gpt-image-1 via /v1/images/edits.
 *
 * Important: the OpenAI Node SDK's `images.edit()` rejects gpt-image-1
 * with `"Value must be 'dall-e-2'"` (it validates the model name client-side).
 * We bypass the SDK and call the endpoint directly with native fetch +
 * FormData + global File (Node 18+).
 *
 * Prompt: kept deliberately short. Empirical testing across 9+ generations
 * showed the simple Danish prompt produces the best spatial fidelity (~77%
 * checkpoint match). Adding must-keep facts, biome lists, or buildPrompt()
 * output reduces fidelity — the model interprets verbose prompts as
 * artistic license rather than constraints.
 *
 * Input format: the raw colored sketch.png (segmentation-style, no labels,
 * no biome icons). Both labeled and icon-stamped variants tested worse —
 * labels leak verbatim into output text, geometric icons (×) leak through
 * as artifacts.
 */

'use strict';

const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');
const ENDPOINT    = 'https://api.openai.com/v1/images/edits';

// When gpt-image-2 API opens (~early May 2026), test that model.
// If spatial fidelity is better, switch this string. Test by running
// existing test_openai_image_api.mjs with model='gpt-image-2'.
const MODEL = 'gpt-image-1';

// The exact Danish prompt that worked in ChatGPT and reproduced 9/9 in
// API testing. Do NOT extend this — testing showed verbose prompts hurt.
const PROMPT =
  'Baseret på denne sketch, kan du så lave et lore friendly fantasy ' +
  'map til AD&D brug? Det er vigtigt at du ikke ændrer på det ' +
  'grundlæggende design.';

class GptImageRenderer extends IMapRenderer {
  get name() { return 'gpt-image-1'; }

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }

  /**
   * Render the colored sketch into a fantasy map via gpt-image-1.
   *
   * The remaining args (stylePreset, userPrompt, spec, aiFredom) are
   * accepted for IMapRenderer interface compatibility with Gemini but
   * are intentionally ignored — the simple prompt is what works.
   *
   * @param {string} controlImagePath  Absolute path to colored sketch PNG
   * @returns {Promise<string>}        Absolute path to generated PNG
   */
  async render(controlImagePath /*, stylePreset, userPrompt, spec, aiFredom */) {
    if (!this.isAvailable()) {
      throw new Error('OPENAI_API_KEY not set in server/.env');
    }

    const sketchBytes = fs.readFileSync(controlImagePath);
    console.log(`[gpt-image-1] Input: ${path.basename(controlImagePath)} (${(sketchBytes.length / 1024).toFixed(0)} KB)`);
    console.log(`[gpt-image-1] Model: ${MODEL} via ${ENDPOINT}`);

    // Build multipart form. Native fetch + FormData + File (Node 18+).
    // The SDK's images.edit() blocks gpt-image-1 with a model validator.
    const file = new File([sketchBytes], 'sketch.png', { type: 'image/png' });
    const form = new FormData();
    form.append('model',  MODEL);
    form.append('image',  file);
    form.append('prompt', PROMPT);
    form.append('n',      '1');
    form.append('size',   '1024x1024');

    const t0 = Date.now();
    const res = await fetch(ENDPOINT, {
      method:  'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body:    form,
    });

    const json = await res.json();
    if (json.error) {
      const err = new Error(json.error.message ?? 'gpt-image-1 request failed');
      err.status   = res.status;
      err.apiError = json.error;
      throw err;
    }

    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw new Error('gpt-image-1 response missing b64_json');

    const imageBytes = Buffer.from(b64, 'base64');
    const filename   = `map-sketch-${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, imageBytes);

    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[gpt-image-1] Saved: ${filename} (${(imageBytes.length / 1024).toFixed(0)} KB, ${dt}s)`);
    if (json.usage) {
      console.log(`[gpt-image-1] Usage: input=${json.usage.input_tokens} output=${json.usage.output_tokens} total=${json.usage.total_tokens}`);
    }
    return outputPath;
  }
}

module.exports = GptImageRenderer;
