/**
 * server/lib/visionProvider.js
 *
 * MapRendererProvider — Claude Vision → DALL-E 3.
 *
 * Flow:
 *   1. Send the coloured seg PNG to Claude Vision (claude-sonnet-4-6)
 *   2. Claude reads zone positions/biomes and writes a precise DALL-E 3 prompt
 *   3. Send that prompt to DALL-E 3
 *   4. Return the generated image URL (maps route persists it)
 */

const Anthropic = require('@anthropic-ai/sdk');
const axios     = require('axios');

const SYSTEM_PROMPT = `You are an expert fantasy cartographer for AD&D 2E.
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

Your task: Write a DALL-E 3 prompt that recreates this terrain layout as a beautiful fantasy map illustration.

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
  fantasy:   'Full color fantasy illustration, painterly style, vibrant terrain colors, professional game art, bird\'s eye view, no text labels.',
  ink:       'Black ink on cream paper, hand-drawn sketch style, artistic pen strokes, minimal shading, no text labels.',
  classic:   'Classic D&D module map, simple top-down symbols, black ink on light background, iconic RPG cartography style, no text labels.',
};

const visionProvider = {
  name: 'vision-claude-dalle',

  isAvailable() {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY);
  },

  /**
   * @param {string} controlImage   base64 data-URI PNG (coloured seg image)
   * @param {string} promptAdditions  terrain description from sketch
   * @param {object} options
   * @param {string} options.stylePreset  'parchment' | 'fantasy' | 'ink' | 'classic'
   * @returns {Promise<string>}  DALL-E image URL (temporary — caller persists it)
   */
  async render(controlImage, promptAdditions, { stylePreset = 'parchment' } = {}) {
    // ── Step 1: extract base64 data ────────────────────────────────────────────
    const base64 = controlImage.replace(/^data:image\/[^;]+;base64,/, '');

    // ── Step 2: Claude Vision → DALL-E prompt ──────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const styleEnding = STYLE_ENDINGS[stylePreset] ?? STYLE_ENDINGS.parchment;
    const userText = [
      'Create a DALL-E 3 prompt for this terrain sketch.',
      `MAP STYLE: ${styleEnding}`,
      promptAdditions ? `Additional context: ${promptAdditions}` : '',
      'Return ONLY the prompt text, nothing else.',
    ].filter(Boolean).join('\n');

    console.log(`[vision] Sending sketch to Claude Vision (style: ${stylePreset})...`);
    const message = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   [{
        role:    'user',
        content: [
          {
            type:   'image',
            source: { type: 'base64', media_type: 'image/png', data: base64 },
          },
          { type: 'text', text: userText },
        ],
      }],
    });

    const dallePrompt = message.content[0]?.text?.trim() ?? '';
    if (!dallePrompt) throw new Error('Claude Vision returned empty prompt');

    console.log('[vision] Claude prompt length:', dallePrompt.length);
    console.log('[vision] Claude prompt preview:', dallePrompt.slice(0, 200));

    // ── Step 3: DALL-E 3 ───────────────────────────────────────────────────────
    console.log('[vision] Sending prompt to DALL-E 3...');
    const dalleResp = await axios.post(
      'https://api.openai.com/v1/images/generations',
      {
        model:           'dall-e-3',
        prompt:          dallePrompt,
        n:               1,
        size:            '1024x1024',
        quality:         'standard',
        response_format: 'url',
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization:  `Bearer ${process.env.OPENAI_API_KEY}`,
        },
      },
    );

    const dalleUrl = dalleResp.data?.data?.[0]?.url;
    if (!dalleUrl) throw new Error('DALL-E returned no image URL');

    console.log('[vision] DALL-E image URL received — will be persisted by caller');
    return dalleUrl;
  },
};

module.exports = visionProvider;
