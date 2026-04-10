/**
 * GeminiImageRenderer — Google Gemini image generation (text-only mode).
 * Model: gemini-2.5-flash-image
 * Requires: GOOGLE_AI_API_KEY in server/.env
 *
 * No control image sent — the 2-char terrain grid in the prompt is the
 * sole source of truth for layout.
 */

const { GoogleGenAI } = require('@google/genai');
const path         = require('path');
const crypto       = require('crypto');
const fs           = require('fs');
const IMapRenderer = require('./IMapRenderer');
const { buildFullPrompt } = require('./promptBuilder');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

class GeminiImageRenderer extends IMapRenderer {
  get name() { return 'gemini'; }

  isAvailable() {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  async render(_controlImagePath, stylePreset = 'schley', userPrompt = '', spec = null, aiFredom = 'strict') {
    const fullPrompt = buildFullPrompt(spec, aiFredom, userPrompt);

    console.log('[gemini] gemini-2.5-flash-image (text-only, no control image)');
    console.log(`[gemini] Cells: ${spec?.cells?.length ?? 0} / Overlays: ${spec?.overlays?.length ?? 0}`);
    console.log(`[gemini] Prompt length: ${fullPrompt.length} chars`);

    const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });

    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: [{
        role: 'user',
        parts: [{ text: fullPrompt }],
      }],
      config: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const parts = result.candidates[0].content.parts;
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (!imagePart) throw new Error('Gemini returned no image part in response');

    const imageBytes = Buffer.from(imagePart.inlineData.data, 'base64');
    const filename   = `map-sketch-${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, imageBytes);

    console.log(`[gemini] Saved: ${filename} (${imageBytes.length} bytes)`);
    return outputPath;
  }
}

module.exports = GeminiImageRenderer;
