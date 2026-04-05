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

const SYSTEM_PROMPT = `You are a fantasy cartography expert for AD&D 2E campaigns.
Analyze the terrain sketch and create a precise DALL-E 3 prompt for a beautiful top-down fantasy map illustration.

Rules:
- Describe terrain zones by POSITION (north, south, east, west, center)
- Never describe colors from the input image
- Style: parchment paper, hand-drawn ink, Forgotten Realms aesthetic, top-down orthographic view, detailed cartographic illustration
- Include ALL major terrain zones from the sketch
- Include rivers, roads, canyons if present
- Keep prompt under 900 characters
- Do NOT mention grid lines or pixels`;

const visionProvider = {
  name: 'vision-claude-dalle',

  isAvailable() {
    return !!(process.env.ANTHROPIC_API_KEY && process.env.OPENAI_API_KEY);
  },

  /**
   * @param {string} controlImage   base64 data-URI PNG (coloured seg image)
   * @param {string} promptAdditions  terrain description from sketch
   * @returns {Promise<string>}  DALL-E image URL (temporary — caller persists it)
   */
  async render(controlImage, promptAdditions) {
    // ── Step 1: extract base64 data ────────────────────────────────────────────
    const base64 = controlImage.replace(/^data:image\/[^;]+;base64,/, '');

    // ── Step 2: Claude Vision → DALL-E prompt ──────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    const userText = [
      'Create a DALL-E 3 prompt for this terrain sketch.',
      promptAdditions ? `Additional context: ${promptAdditions}` : '',
      'Return ONLY the prompt text, nothing else.',
    ].filter(Boolean).join('\n');

    console.log('[vision] Sending sketch to Claude Vision...');
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
