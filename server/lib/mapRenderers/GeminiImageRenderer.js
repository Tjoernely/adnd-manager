/**
 * GeminiImageRenderer — Google Gemini image generation.
 * Model: gemini-2.0-flash-preview-image-generation
 * Requires: GOOGLE_AI_API_KEY in server/.env
 *
 * Prompt logic lives in promptBuilder.js.
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');
const { buildFullPrompt } = require('./promptBuilder');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

class GeminiImageRenderer extends IMapRenderer {
  get name() { return 'gemini'; }

  isAvailable() {
    return !!process.env.GOOGLE_AI_API_KEY;
  }

  async render(controlImagePath, stylePreset = 'schley', userPrompt = '', spec = null, aiFredom = 'strict') {
    const fullPrompt  = buildFullPrompt(spec, aiFredom, userPrompt);
    const imageBase64 = fs.readFileSync(controlImagePath).toString('base64');

    console.log('[gemini] gemini-2.0-flash-preview-image-generation');
    console.log(`[gemini] Cells: ${spec?.cells?.length ?? 0} / Overlays: ${spec?.overlays?.length ?? 0}`);
    console.log(`[gemini] Prompt length: ${fullPrompt.length} chars`);

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash-preview-image-generation',
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });

    const result = await model.generateContent([
      { inlineData: { mimeType: 'image/png', data: imageBase64 } },
      { text: fullPrompt },
    ]);

    const parts = result.response.candidates[0].content.parts;
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
