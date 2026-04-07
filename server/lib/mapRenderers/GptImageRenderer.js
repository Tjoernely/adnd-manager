const OpenAI      = require('openai');
const fs          = require('fs');
const path        = require('path');
const crypto      = require('crypto');
const { getPrompt } = require('./stylePresets');
const IMapRenderer  = require('./IMapRenderer');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

class GptImageRenderer extends IMapRenderer {
  constructor() {
    super();
    // Lazily instantiated so missing key doesn't crash on require
    this._client = null;
  }

  get name() { return 'gpt-image-1'; }

  isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }

  _getClient() {
    if (!this._client) {
      this._client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return this._client;
  }

  async render(controlImagePath, stylePreset = 'parchment', userPrompt = '') {
    const prompt = getPrompt(stylePreset, userPrompt);
    const client = this._getClient();

    console.log(`[${this.name}] Starting render — style: ${stylePreset}`);
    console.log(`[${this.name}] Control image: ${controlImagePath}`);
    console.log(`[${this.name}] Prompt (${prompt.length} chars): ${prompt.slice(0, 150)}...`);

    const imageStream = fs.createReadStream(controlImagePath);

    const result = await client.images.edit({
      model:   'gpt-image-1',
      image:   imageStream,
      prompt,
      size:    '1024x1024',
      quality: 'medium',
      n:       1,
    });

    const imageBase64 = result.data[0].b64_json;
    if (!imageBase64) throw new Error('gpt-image-1 returned no image data');

    const imageBytes = Buffer.from(imageBase64, 'base64');
    const filename   = `map-sketch-${crypto.randomUUID()}.png`;
    const outputPath = path.join(UPLOADS_DIR, filename);

    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.writeFileSync(outputPath, imageBytes);

    console.log(`[${this.name}] Done — saved: ${filename} (${imageBytes.length} bytes)`);
    return outputPath;
  }
}

module.exports = GptImageRenderer;
