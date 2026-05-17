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
const _OpenAIPkg    = require('openai');
const OpenAI        = _OpenAIPkg.default ?? _OpenAIPkg;
const db            = require('../db');
const { auth }      = require('../middleware/auth');

const router = express.Router();

// ── Model registry ────────────────────────────────────────────────────────────
// Maps client-facing model id → provider + the model's real max output tokens.
// maxOutput doubles as the server-side token cap (replaces the old hard 4096).
const MODEL_REGISTRY = {
  'claude-opus-4-7':   { provider: 'anthropic', maxOutput: 128000 },
  'claude-sonnet-4-6': { provider: 'anthropic', maxOutput: 64000  },
  'gpt-5.4':           { provider: 'openai',    maxOutput: 128000 },
};
// Default when no model is specified — keeps NPCGenerator / MapGenerator working.
const DEFAULT_MODEL = 'claude-sonnet-4-6';

// Lazy-init the shared server-key client (only used when env key is present)
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

// Per-request client: env key takes priority, then x-anthropic-key header.
function getClientForRequest(req) {
  const apiKey = process.env.ANTHROPIC_API_KEY || req.headers['x-anthropic-key'];
  if (!apiKey) return null;
  // Reuse the cached client when using the server-side env key
  if (apiKey === process.env.ANTHROPIC_API_KEY) return getClient();
  return new Anthropic({ apiKey });
}

// Lazy-init OpenAI client. Throws a clearly-worded error when the key is absent.
let _openai = null;
function getOpenAI() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured on server');
  }
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

// Run a single OpenAI chat completion and normalize the result to plain text.
async function runOpenAIPrompt({ model, systemPrompt, userPrompt, maxTokens }) {
  const client = getOpenAI();
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const completion = await client.chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    messages,
  });
  return completion.choices?.[0]?.message?.content ?? '';
}

// ── POST /api/ai/prompt ───────────────────────────────────────────────────────
// Generic text proxy — replaces direct browser calls to api.anthropic.com.
// Body: { systemPrompt?: string, userPrompt: string, maxTokens?: number, model?: string }
//   model: "claude-opus-4-7" | "claude-sonnet-4-6" | "gpt-5.4"
//          omitted → claude-sonnet-4-6 (back-compat for NPCGenerator / MapGenerator)
// Returns: { text: string } — identical shape for both providers.
router.post('/prompt', auth, async (req, res) => {
  try {
    const { systemPrompt, userPrompt, maxTokens = 1024, model } = req.body ?? {};
    if (!userPrompt) return res.status(400).json({ error: '"userPrompt" is required' });

    const modelId = (typeof model === 'string' && MODEL_REGISTRY[model]) ? model : DEFAULT_MODEL;
    const entry   = MODEL_REGISTRY[modelId];
    // Cap requested tokens to the model's real max output (replaces old hard 4096).
    const cappedTokens = Math.min(Math.max(Number(maxTokens) || 1024, 1), entry.maxOutput);

    let text;
    if (entry.provider === 'openai') {
      text = await runOpenAIPrompt({ model: modelId, systemPrompt, userPrompt, maxTokens: cappedTokens });
    } else {
      const client = getClientForRequest(req);
      if (!client) return res.status(400).json({ error: 'AI not configured — provide an Anthropic API key' });

      const msgOpts = {
        model:      modelId,
        max_tokens: cappedTokens,
        messages:   [{ role: 'user', content: userPrompt }],
      };
      if (systemPrompt) msgOpts.system = systemPrompt;

      const message = await client.messages.create(msgOpts);
      text = message.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('');
    }

    res.json({ text });
  } catch (e) {
    console.error('[ai/prompt]', e.message);
    if (e.message?.includes('OPENAI_API_KEY')) {
      return res.status(503).json({ error: 'OPENAI_API_KEY not configured on server' });
    }
    res.status(500).json({ error: 'AI request failed', detail: e.message });
  }
});

// ── POST /api/ai/loot ─────────────────────────────────────────────────────────
// Returns plain-text lore-friendly loot description (no DM gate, just auth).
router.post('/loot', auth, async (req, res) => {
  try {
    const { monsters = [], terrain = 'dungeon', difficulty = 'Medium', party_level = 5 } = req.body ?? {};

    const client = getClientForRequest(req);
    if (!client) return res.status(400).json({ error: 'AI not configured — provide an Anthropic API key' });

    const monsterDesc = monsters.length
      ? monsters.map(m => `${m.count > 1 ? `${m.count}× ` : ''}${m.name}`).join(', ')
      : 'some monsters';
    const message = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 350,
      system: `You are a witty Dungeon Master for AD&D 2nd Edition.
Generate treasure that is lore-appropriate but with a fun twist.
Respond with ONLY bullet points — no intro sentence, no closing remarks.`,
      messages: [{
        role: 'user',
        content: `The party defeated ${monsterDesc} in a ${terrain} environment.
Party level: ${party_level}. Difficulty: ${difficulty}.
Generate interesting loot with:
- Appropriate coins (cp/sp/gp amounts)
- 1-2 unique items with brief flavor text (funny or mysterious)
- Lore-friendly but memorable
Keep it under 120 words, use bullet points.`,
      }],
    });

    const text = message.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('');

    res.json({ text });
  } catch (e) {
    console.error('[ai/loot]', e.message);
    if (e.message?.includes('ANTHROPIC_API_KEY')) {
      return res.status(503).json({ error: 'AI not configured on this server' });
    }
    res.status(500).json({ error: 'AI loot generation failed', detail: e.message });
  }
});

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

    case 'npc_create': {
      const ALIGN_FULL = {
        LG:'Lawful Good',  LN:'Lawful Neutral',  LE:'Lawful Evil',
        NG:'Neutral Good', TN:'True Neutral',     NE:'Neutral Evil',
        CG:'Chaotic Good', CN:'Chaotic Neutral',  CE:'Chaotic Evil',
      };
      const { race, charClass, gender, alignment, level, powerLevel, stats } = ctx;
      const { str, dex, con, int: int_, wis, cha } = stats ?? {};
      const hints = [
        `Race: ${race || 'Human'}`,
        `Class: ${charClass || 'Fighter'}`,
        `Gender: ${gender || 'Unknown'}`,
        `Alignment: ${alignment || 'TN'} (${ALIGN_FULL[alignment] || 'True Neutral'})`,
        `Level: ${level || 1}`,
        `Power Level: ${powerLevel || 'standard'}`,
        stats ? `STR ${str}  DEX ${dex}  CON ${con}  INT ${int_}  WIS ${wis}  CHA ${cha}` : null,
      ].filter(Boolean).join('\n');
      return {
        systemPrompt: SYSTEM,
        userPrompt: `Generate an AD&D 2E NPC with these parameters:\n${hints}\n\nRespond with ONLY valid JSON (no markdown, no explanation):\n{\n  "name": "",\n  "background": "",\n  "personality": ["trait1","trait2"],\n  "equipment": ["item1","item2","item3"],\n  "loot": { "pp": 0, "gp": 0, "sp": 0, "cp": 0, "items": [] }\n}`,
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
