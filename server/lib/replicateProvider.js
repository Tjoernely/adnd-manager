/**
 * server/lib/replicateProvider.js
 *
 * MapRendererProvider — Replicate ControlNet Scribble.
 * Model: jagilley/controlnet-scribble
 *
 * Scribble mode is colour-agnostic: it reads black outlines on white and
 * respects zone boundaries directly without re-segmenting the input image.
 * This is the correct approach for our hand-drawn terrain zone maps.
 *
 * Replicate predictions are async:
 *   POST /v1/predictions → { id, status }
 *   GET  /v1/predictions/:id → poll until status=succeeded
 *
 * NOTE: Replicate requires an accessible URL for the control image — it does
 * not accept raw base64. We save the PNG to server/public/uploads/maps/ and
 * pass the public URL, then delete the temp file after the prediction.
 */

const axios  = require('axios');
const fs     = require('fs');
const path   = require('path');
const crypto = require('crypto');

// ── Constants ─────────────────────────────────────────────────────────────────

const REPLICATE_API    = 'https://api.replicate.com/v1';
// Version hash from: GET /v1/models/jagilley/controlnet-scribble (latest_version.id)
// Scribble reads black-on-white outlines directly — colour-agnostic, layout-faithful.
const MODEL_VERSION    = '435061a1b5a4c1e26740464bf786efdfa9cb3a3ac488595a2de23e143fdb0117';
const POLL_INTERVAL_MS = 2000;
const TIMEOUT_MS       = 150_000;

const PUBLIC_BASE_URL  = process.env.PUBLIC_BASE_URL || 'http://158.180.63.20';
const UPLOADS_DIR      = path.join(__dirname, '..', 'public', 'uploads', 'maps');

const STYLE_PROMPT = [
  'top-down fantasy cartography map, hand-drawn ink illustration,',
  'Tolkien-style map, parchment paper texture, medieval fantasy,',
  'birds eye view, warm earth tones, detailed terrain, Forgotten Realms',
].join(' ');

// ── Helper: save base64 PNG to disk, return public URL ───────────────────────

function saveControlImage(dataUri) {
  const base64 = dataUri.replace(/^data:image\/png;base64,/, '');
  const buf    = Buffer.from(base64, 'base64');
  const fname  = `sketch-control-${crypto.randomUUID()}.png`;
  const fpath  = path.join(UPLOADS_DIR, fname);

  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  fs.writeFileSync(fpath, buf);

  const url = `${PUBLIC_BASE_URL}/uploads/maps/${fname}`;
  console.log(`[replicate] Saved control image → ${url}`);
  return { fpath, url };
}

// ── Provider ──────────────────────────────────────────────────────────────────

const replicateProvider = {
  name: 'controlnet-replicate',

  isAvailable() {
    return !!process.env.REPLICATE_API_KEY;
  },

  /**
   * @param {string} controlImage    base64 data-URI PNG (data:image/png;base64,...)
   * @param {string} promptAdditions sketch-derived terrain/feature description
   * @returns {Promise<string>}  URL of the generated image
   */
  async render(controlImage, promptAdditions, { onStatus } = {}) {
    const apiKey = process.env.REPLICATE_API_KEY;
    if (!apiKey) throw new Error('REPLICATE_API_KEY not set');

    const prompt = promptAdditions
      ? `${STYLE_PROMPT}. ${promptAdditions}`
      : STYLE_PROMPT;

    const headers = {
      Authorization:  `Token ${apiKey}`,
      'Content-Type': 'application/json',
    };

    // Save control image to disk and get a public URL
    // DEBUG: file is kept for inspection (not deleted in finally) when DEBUG_KEEP_CONTROL=true
    const { fpath: controlFilePath, url: controlImageUrl } = saveControlImage(controlImage);
    console.log(`[replicate] Control image saved for inspection: ${controlImageUrl}`);
    console.log(`[replicate] Control image file size: ${fs.statSync(controlFilePath).size} bytes`);

    // ── Start prediction ───────────────────────────────────────────────────────
    const inputPayload = {
      image:            controlImageUrl,
      prompt,
      num_samples:      '1',
      image_resolution: '768',
      ddim_steps:       30,
      scale:            9.0,
      seed:             -1,
      eta:              0.0,
      a_prompt:         'masterpiece, best quality, highly detailed cartographic illustration, fantasy art',
      n_prompt:         'photorealistic, photograph, 3d render, satellite imagery, modern, ugly, watermark, text, labels, blurry, low quality, isometric, nsfw',
    };
    console.log(`[replicate] Payload: version=${MODEL_VERSION.substring(0,12)}... inputKeys=${Object.keys(inputPayload).join(',')} imageUrlLength=${controlImageUrl.length}`);
    console.log(`[replicate] Starting prediction — prompt length: ${prompt.length}`);

    let prediction;
    try {
      const resp = await axios.post(
        `${REPLICATE_API}/predictions`,
        { version: MODEL_VERSION, input: inputPayload },
        { headers },
      );
      prediction = resp.data;
    } catch (err) {
      console.error(`[replicate] POST failed — HTTP ${err.response?.status}`);
      console.error(`[replicate] Response body: ${JSON.stringify(err.response?.data)}`);
      const msg = err.response?.data?.detail ?? err.message;
      throw new Error(`Replicate prediction start failed: ${msg}`);
    }

    console.log(`[replicate] Prediction started — id: ${prediction.id} status: ${prediction.status}`);

    // ── Poll until succeeded or timeout ───────────────────────────────────────
    const deadline = Date.now() + TIMEOUT_MS;

    try {
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
        if (onStatus) onStatus(p.status);

        if (p.status === 'succeeded') {
          // jagilley/controlnet-scribble returns [scribble_visualization, generated_image]
          // output[0] is the processed scribble preview; output[1] is the actual generated result
          const output = Array.isArray(p.output) ? (p.output[1] ?? p.output[0]) : p.output;
          if (!output) throw new Error('Replicate returned succeeded but no output');
          console.log(`[replicate] Done — output URL: ${String(output).substring(0, 80)}...`);
          return output;
        }

        if (p.status === 'failed' || p.status === 'canceled') {
          throw new Error(`Replicate prediction ${p.status}: ${p.error ?? 'unknown error'}`);
        }

        // status: 'starting' | 'processing' — keep polling
      }
    } finally {
      // DEBUG: keep control image on disk for inspection
      // TODO: restore cleanup: fs.unlink(controlFilePath, () => {});
      console.log(`[replicate] DEBUG — control image kept at: ${controlFilePath}`);
    }
  },
};

module.exports = replicateProvider;
