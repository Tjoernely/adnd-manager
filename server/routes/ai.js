/**
 * /api/ai
 *   POST /generate   — AI-assisted content generation (DM only)
 *
 * Body: { type: "npc"|"quest"|"encounter"|"rumors", context: { ... } }
 * Returns structured JSON for the requested content type.
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */
const express  = require('express');
// @anthropic-ai/sdk may export the class as default or as the module itself
const _AnthropicPkg = require('@anthropic-ai/sdk');
const Anthropic     = _AnthropicPkg.default ?? _AnthropicPkg;
const db            = require('../db');
const { auth }      = require('../middleware/auth');

const router = express.Router();

// Lazy-init the client so missing key only errors on actual use
let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── POST /api/ai/generate ──────────────────────────────────────────────────────
router.post('/generate', auth, async (req, res) => {
  try {
    const { type, context = {}, campaign_id } = req.body ?? {};

    if (!type) return res.status(400).json({ error: '"type" is required' });
    if (!campaign_id) return res.status(400).json({ error: '"campaign_id" is required' });

    // DM-only gate
    const isDM = await db.one(
      'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
      [campaign_id, req.user.id],
    );
    if (!isDM) return res.status(403).json({ error: 'DM only' });

    const { systemPrompt, userPrompt } = buildPrompt(type, context);

    const client = getClient();

    // Stream and collect full response to avoid timeout
    const message = await client.messages.stream({
      model:      'claude-opus-4-6',
      max_tokens: 2048,
      thinking:   { type: 'adaptive' },
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userPrompt }],
    }).finalMessage();

    // Extract JSON from the assistant response
    const raw = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    const parsed = extractJSON(raw);
    if (!parsed) {
      console.error('[ai] Could not extract JSON from response:', raw.slice(0, 300));
      return res.status(502).json({ error: 'AI returned malformed JSON' });
    }

    res.json({ type, result: parsed });
  } catch (e) {
    console.error('[ai/generate]', e.message);
    if (e.message.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'AI generation is not configured on this server' });
    }
    res.status(500).json({ error: 'AI generation failed', detail: e.message });
  }
});

// ── Prompt builders ────────────────────────────────────────────────────────────
function buildPrompt(type, ctx) {
  const SYSTEM = `You are a creative assistant for AD&D 2nd Edition (Skills & Powers) tabletop RPG campaigns.
Generate vivid, flavourful content consistent with a dark-fantasy/medieval setting.
Always respond with ONLY valid JSON — no markdown fences, no explanation outside the JSON object.`;

  switch (type) {

    case 'npc': {
      const hints = [
        ctx.race       && `Race: ${ctx.race}`,
        ctx.charClass  && `Class: ${ctx.charClass}`,
        ctx.setting    && `Setting: ${ctx.setting}`,
        ctx.tone       && `Tone: ${ctx.tone}`,
        ctx.notes      && `Additional notes: ${ctx.notes}`,
      ].filter(Boolean).join('\n');

      return {
        systemPrompt: SYSTEM,
        userPrompt: `Generate a fully fleshed-out NPC for an AD&D 2E campaign.
${hints ? `Context:\n${hints}\n` : ''}
Return a JSON object with exactly these fields:
{
  "name": "Full name",
  "race": "Race",
  "charClass": "Class and level (e.g. Fighter 4)",
  "personality": "2-3 sentence personality description",
  "backstory": "3-5 sentence backstory",
  "dialogHooks": ["Hook 1", "Hook 2", "Hook 3"],
  "questHooks": ["A quest or task this NPC could offer", "Another potential hook"],
  "secrets": ["A secret only the DM knows", "Another hidden detail"],
  "rumors": ["A rumor the party might hear about this NPC", "Another rumor"]
}`,
      };
    }

    case 'quest': {
      const hints = [
        ctx.setting    && `Setting/location: ${ctx.setting}`,
        ctx.partyLevel && `Party level: ${ctx.partyLevel}`,
        ctx.tone       && `Tone: ${ctx.tone}`,
        ctx.notes      && `Additional notes: ${ctx.notes}`,
      ].filter(Boolean).join('\n');

      return {
        systemPrompt: SYSTEM,
        userPrompt: `Generate a quest for an AD&D 2E campaign.
${hints ? `Context:\n${hints}\n` : ''}
Return a JSON object with exactly these fields:
{
  "title": "Quest title",
  "description": "2-3 sentence quest overview",
  "plotHooks": ["How the party might first hear about this quest", "An alternative hook"],
  "objectives": ["Primary objective", "Optional secondary objective"],
  "rewards": ["Primary reward (gold, item, etc.)", "Secondary reward or intangible benefit"],
  "complications": ["A twist or complication that could arise", "Another potential complication"],
  "notes": "DM notes or optional extra detail"
}`,
      };
    }

    case 'encounter': {
      const hints = [
        ctx.setting    && `Setting/terrain: ${ctx.setting}`,
        ctx.partyLevel && `Party level: ${ctx.partyLevel}`,
        ctx.partySize  && `Party size: ${ctx.partySize}`,
        ctx.tone       && `Tone: ${ctx.tone}`,
        ctx.notes      && `Additional notes: ${ctx.notes}`,
      ].filter(Boolean).join('\n');

      return {
        systemPrompt: SYSTEM,
        userPrompt: `Generate a combat or exploration encounter for an AD&D 2E campaign.
${hints ? `Context:\n${hints}\n` : ''}
Return a JSON object with exactly these fields:
{
  "title": "Encounter title",
  "terrain": "Vivid 2-3 sentence terrain/scene description",
  "monsters": [
    { "name": "Monster name", "count": 2, "notes": "Special abilities or behaviour" }
  ],
  "tactics": "How the monsters behave in combat",
  "loot": ["Loot item 1", "Loot item 2"],
  "xp": "Estimated XP award (as a string, e.g. '450 XP')",
  "notes": "DM notes, optional triggers, or variations"
}`,
      };
    }

    case 'rumors': {
      const hints = [
        ctx.location   && `Location: ${ctx.location}`,
        ctx.setting    && `Setting context: ${ctx.setting}`,
        ctx.notes      && `Additional notes: ${ctx.notes}`,
      ].filter(Boolean).join('\n');

      return {
        systemPrompt: SYSTEM,
        userPrompt: `Generate a set of rumors the player characters might hear at a tavern, market, or town for an AD&D 2E campaign.
${hints ? `Context:\n${hints}\n` : ''}
Return a JSON object with exactly these fields:
{
  "rumors": [
    { "text": "The rumor text", "truth": "True / Partially true / False", "source": "Who might spread this" },
    { "text": "...", "truth": "...", "source": "..." },
    { "text": "...", "truth": "...", "source": "..." },
    { "text": "...", "truth": "...", "source": "..." },
    { "text": "...", "truth": "...", "source": "..." }
  ]
}`,
      };
    }

    default:
      throw new Error(`Unknown generation type: ${type}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function extractJSON(text) {
  // Try direct parse first
  try { return JSON.parse(text.trim()); } catch (_) {}

  // Attempt to extract the first {...} block (in case of surrounding prose)
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try { return JSON.parse(match[0]); } catch (_) {}
  }
  return null;
}

module.exports = router;
