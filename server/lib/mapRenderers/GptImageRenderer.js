/**
 * GptImageRenderer — Claude Vision → gpt-image-1.
 *
 * Flow:
 *   1. Read coloured seg PNG from disk → base64
 *   2. Claude Vision (claude-sonnet-4-6) reads the colour-coded zones and
 *      writes a precise spatial prompt with the chosen style
 *   3. gpt-image-1 images.generate produces the final map
 *   4. Save b64_json output to disk, return path
 *
 * gpt-image-1 does NOT support images.edit (dall-e-2 only).
 * gpt-image-1 supports images.generate and returns b64_json.
 */

const Anthropic    = require('@anthropic-ai/sdk');
const OpenAI       = require('openai');
const fs           = require('fs');
const path         = require('path');
const crypto       = require('crypto');
const IMapRenderer = require('./IMapRenderer');

const UPLOADS_DIR = path.join(__dirname, '../../public/uploads/maps');

// Color legend Claude uses to interpret the segmentation PNG
const VISION_SYSTEM_PROMPT = `You are an expert fantasy cartographer for AD&D 2E.
You will receive a COLOR-CODED terrain map where each color zone represents a specific terrain type:
- LIGHT YELLOW-GREEN (#9dc183) = Plains/Grasslands
- DARK GREEN (#228b22) = Forest/Woodland
- DARK OLIVE (#4a5d23) = Swamp/Marshland
- TAN/BEIGE (#edc9af) = Desert/Arid land
- LIGHT CYAN (#e0f7fa) = Tundra/Ice/Snow
- VERY DARK RED (#332222) = Volcanic/Lava terrain
- DARK NAVY (#1a237e) = Deep Ocean/Sea
- TEAL (#4db6ac) = Coastal/Shallow water
- BLUE (#1976d2) = Lake/Inland water
- BRIGHT BLUE lines = Rivers
- BROWN lines = Roads/Paths
- DARK BROWN lines = Canyons
- BLACK lines = Chasms/Rifts

Your task: Write an image generation prompt that recreates this terrain layout as a beautiful fantasy map.

RULES:
1. Identify EACH colored zone and its compass position
2. Use explicit positional language:
   'fills the entire northwestern quadrant'
   'runs along the southern edge'
   'occupies the central region'
   'a river flows from northeast to southwest'
3. Start with: 'Fantasy map. North is top.'
4. Apply the requested MAP STYLE at the end
5. Under 950 characters. Return ONLY the prompt.`;

const STYLE_ENDINGS = {
  parchment: 'Aged parchment, sepia ink, hand-drawn atlas style, Tolkien/Forgotten Realms aesthetic, no text labels.',
  fantasy:   "Full color fantasy illustration, painterly style, vibrant terrain colors, professional game art, bird's eye view, no text labels.",
  ink:       'Black ink on cream paper, hand-drawn sketch style, artistic pen strokes, minimal shading, no text labels.',
  classic:   'Classic D&D module map, simple top-down symbols, black ink on light background, iconic RPG cartography style, no text labels.',
};

class GptImageRenderer extends IMapRenderer {
  constructor() {
    super();
    this._anthropic = null;
    this._openai    = null;
  }

  get name() { return 'gpt-image-1'; }

  isAvailable() {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY);
  }

  _getAnthropic() {
    if (!this._anthropic) this._anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return this._anthropic;
  }

  _getOpenAI() {
    if (!this._openai) this._openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    return this._openai;
  }

  async render(controlImagePath, stylePreset = 'parchment', userPrompt = '') {
    console.log(`[${this.name}] Starting render — style: ${stylePreset}`);

    // ── Step 1: read control image → base64 ──────────────────────────────────
    const base64 = fs.readFileSync(controlImagePath).toString('base64');

    // ── Step 2: Claude Vision → image generation prompt ───────────────────────
    const styleEnding = STYLE_ENDINGS[stylePreset] ?? STYLE_ENDINGS.parchment;
    const userText = [
      'Create a fantasy map image generation prompt for this terrain sketch.',
      `MAP STYLE: ${styleEnding}`,
      userPrompt ? `Additional context: ${userPrompt}` : '',
      'Return ONLY the prompt text, nothing else.',
    ].filter(Boolean).join('\n');

    console.log(`[${this.name}] Sending sketch to Claude Vision...`);
    const message = await this._getAnthropic().messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     VISION_SYSTEM_PROMPT,
      messages:   [{
        role:    'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: base64 } },
          { type: 'text',  text: userText },
        ],
      }],
    });

    const imagePrompt = message.content[0]?.text?.trim() ?? '';
    if (!imagePrompt) throw new Error('Claude Vision returned empty prompt');
    console.log(`[${this.name}] Claude prompt (${imagePrompt.length} chars): ${imagePrompt.slice(0, 150)}...`);

    // ── Step 3: gpt-image-1 generate ─────────────────────────────────────────
    console.log(`[${this.name}] Sending prompt to gpt-image-1...`);
    const result = await this._getOpenAI().images.generate({
      model:           'gpt-image-1',
      prompt:          imagePrompt,
      size:            '1024x1024',
      n:               1,
      response_format: 'b64_json',
    });

    const imageBase64 = result.data[0].b64_json;
    if (!imageBase64) throw new Error('gpt-image-1 returned no image data');

    // ── Step 4: save to disk ──────────────────────────────────────────────────
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
