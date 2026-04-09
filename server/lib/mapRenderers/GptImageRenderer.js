/**
 * GptImageRenderer — OpenAI Responses API, gpt-4o + image_generation tool.
 * Prompt logic lives in promptBuilder.js.
 */

const OpenAI       = require('openai');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');
const { buildFullPrompt } = require('./promptBuilder');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

class GptImageRenderer extends IMapRenderer {
  constructor() {
    super();
    this._openai = null;
  }

  get name() { return 'gpt-image-1'; }

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }

  _getOpenAI() {
    if (!this._openai) this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._openai;
  }

  async render(controlImagePath, stylePreset = 'schley', userPrompt = '', spec = null, aiFredom = 'strict') {
    const fullPrompt  = buildFullPrompt(spec, aiFredom, userPrompt);
    const imageBase64 = fs.readFileSync(controlImagePath).toString('base64');

    console.log('[gpt-image-1] Responses API — gpt-4o + image_generation tool');
    console.log(`[gpt-image-1] Cells: ${spec?.cells?.length ?? 0} / Overlays: ${spec?.overlays?.length ?? 0}`);
    console.log(`[gpt-image-1] Prompt length: ${fullPrompt.length} chars`);

    const response = await this._getOpenAI().responses.create({
      model: 'gpt-4o',
      input: [{
        role: 'user',
        content: [
          { type: 'input_image', image_url: `data:image/png;base64,${imageBase64}` },
          { type: 'input_text',  text: fullPrompt },
        ],
      }],
      tools: [{ type: 'image_generation', size: '1024x1024' }],
    });

    const imageData = response.output
      .filter(o => o.type === 'image_generation_call')
      .map(o => o.result)[0];

    if (!imageData) throw new Error('Responses API returned no image_generation_call output');

    const imageBytes = Buffer.from(imageData, 'base64');
    const filename   = `map-sketch-${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, imageBytes);

    console.log(`[gpt-image-1] Saved: ${filename} (${imageBytes.length} bytes)`);
    return outputPath;
  }
}

module.exports = GptImageRenderer;
