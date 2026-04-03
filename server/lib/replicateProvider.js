/**
 * server/lib/replicateProvider.js
 *
 * MapRendererProvider — Replicate ControlNet SDXL.
 * Model: lucataco/sdxl-controlnet
 *
 * Replicate predictions are async:
 *   POST /v1/models/{owner}/{name}/predictions → { id, status }
 *   GET  /v1/predictions/:id                  → poll until status=succeeded
 */

const axios = require('axios');

// ── Constants ─────────────────────────────────────────────────────────────────

const REPLICATE_API    = 'https://api.replicate.com/v1';
const MODEL_OWNER      = 'lucataco';
const MODEL_NAME       = 'sdxl-controlnet';
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS       = 120_000;

const STYLE_PROMPT = [
  'top-down fantasy world map, orthographic view, detailed terrain,',
  'parchment paper texture, hand-drawn ink style, Forgotten Realms aesthetic,',
  'natural earth tones, cartographic illustration, high detail',
].join(' ');

const NEGATIVE_PROMPT = [
  'text, labels, watermark, blurry, ugly, modern, photorealistic,',
  '3d render, aerial photo, satellite, distorted, low quality',
].join(' ');

// ── Provider ──────────────────────────────────────────────────────────────────

const replicateProvider = {
  name: 'controlnet-replicate',

  isAvailable() {
    return !!process.env.REPLICATE_API_KEY;
  },

  /**
   * @param {string} controlImage  base64 data-URI PNG (data:image/png;base64,...)
   * @param {string} promptAdditions  sketch-derived terrain/feature description
   * @returns {Promise<string>}  URL of the generated image
   */
  async render(controlImage, promptAdditions) {
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) throw new Error('REPLICATE_API_KEY not set');

    // Build full prompt: style + spatial description
    const prompt = promptAdditions
      ? `${STYLE_PROMPT}. ${promptAdditions}`
      : STYLE_PROMPT;

    const headers = {
      Authorization:  `Token ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // ── Start prediction ───────────────────────────────────────────────────────
    console.log(`[replicate] Starting prediction — prompt length: ${prompt.length}`);
    let prediction;
    try {
      const resp = await axios.post(
        `${REPLICATE_API}/models/${MODEL_OWNER}/${MODEL_NAME}/predictions`,
        {
          input: {
            image:               controlImage,
            prompt,
            negative_prompt:     NEGATIVE_PROMPT,
            num_inference_steps: 30,
            guidance_scale:      7.5,
            condition_scale:     0.9,
          },
        },
        { headers },
      );
      prediction = resp.data;
    } catch (err) {
      const msg = err.response?.data?.detail ?? err.message;
      throw new Error(`Replicate prediction start failed: ${msg}`);
    }

    console.log(`[replicate] Prediction started — id: ${prediction.id} status: ${prediction.status}`);

    // ── Poll until succeeded or timeout ───────────────────────────────────────
    const deadline = Date.now() + TIMEOUT_MS;

    while (true) {
      if (Date.now() > deadline) {
        throw new Error(`Replicate prediction timed out after ${TIMEOUT_MS / 1000}s (id: ${prediction.id})`);
      }

      await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

      let pollResp;
      try {
        pollResp = await axios.get(`${REPLICATE_API}/predictions/${prediction.id}`, { headers });
      } catch (err) {
        console.warn(`[replicate] Poll error (will retry): ${err.message}`);
        continue;
      }

      const p = pollResp.data;
      console.log(`[replicate] Poll — status: ${p.status}`);

      if (p.status === 'succeeded') {
        const output = Array.isArray(p.output) ? p.output[0] : p.output;
        if (!output) throw new Error('Replicate returned succeeded but no output');
        console.log(`[replicate] Done — output URL: ${String(output).substring(0, 80)}...`);
        return output;
      }

      if (p.status === 'failed' || p.status === 'canceled') {
        throw new Error(`Replicate prediction ${p.status}: ${p.error ?? 'unknown error'}`);
      }

      // status: 'starting' | 'processing' — keep polling
    }
  },
};

module.exports = replicateProvider;
