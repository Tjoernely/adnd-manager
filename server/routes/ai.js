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
const { GoogleGenAI } = require('@google/genai');
const db            = require('../db');
const { auth }      = require('../middleware/auth');
const { buildCharacterImagePrompt, whitelistFields, fieldsFromCharacterData } = require('../lib/characterImagePrompt');

const router = express.Router();

// ── Model registry ────────────────────────────────────────────────────────────
// Maps client-facing model id → provider + the model's real max output tokens.
// maxOutput doubles as the server-side token cap (replaces the old hard 4096).
const MODEL_REGISTRY = {
  'claude-opus-4-7':   { provider: 'anthropic', maxOutput: 128000 },
  'claude-sonnet-4-6': { provider: 'anthropic', maxOutput: 64000  },
  // Phase 6: cheap fast model for the POI sub-category selection step
  // (~3× cheaper than Sonnet, 2-3× faster, plenty smart enough for "pick
  // 6-12 from this list of 32"). Slug w/o date — Anthropic aliases the
  // slug to the latest snapshot.
  'claude-haiku-4-5':  { provider: 'anthropic', maxOutput: 64000  },
  'gpt-5.4':           { provider: 'openai',    maxOutput: 128000 },
  'gpt-5.5':           { provider: 'openai',    maxOutput: 128000 },
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

// ── AI feature-gate middleware ────────────────────────────────────────────────
// requireAiApproval blocks unapproved users from the shared-key routes below.
// Extracted to middleware/aiApproval.js (2026-06-04) so the server-side image
// route (/api/maps/generate-from-sketch, gpt-image-1/Gemini on the shared
// OpenAI/Google key) can share the exact same gate. See that file for the
// full rationale (shared key → block whole endpoint; fresh DB read; mount
// after `auth`).
const { requireAiApproval } = require('../middleware/aiApproval');

// ── POST /api/ai/prompt ───────────────────────────────────────────────────────
// Generic text proxy — replaces direct browser calls to api.anthropic.com.
// Body: { systemPrompt?: string, userPrompt: string, maxTokens?: number, model?: string }
//   model: "claude-opus-4-7" | "claude-sonnet-4-6" | "gpt-5.4"
//          omitted → claude-sonnet-4-6 (back-compat for NPCGenerator / MapGenerator)
// Returns: { text: string } — identical shape for both providers.
//
// HOTFIX 2026-05-26: Anthropic's non-streaming API rejects max_tokens > 21333
// (Sonnet 4.6's per-request threshold). Sprint 6's POI-tier scaling
// (hard_cap × 1000 + 6000) pushes Town+ generations above this, returning
// 400 "max_tokens exceeds the non-streaming limit". Fix: route every
// Anthropic request through messages.stream().finalMessage(), which
// accumulates chunks server-side and resolves to the same Message object
// the non-streaming path returned. Removes the 21k threshold; uncaps to
// the model's real maxOutput (64k for Sonnet, 128k for Opus). Client
// contract is unchanged — still returns { text } JSON.
router.post('/prompt', auth, requireAiApproval, async (req, res) => {
  try {
    const { systemPrompt, userPrompt, maxTokens = 1024, model } = req.body ?? {};
    if (!userPrompt) return res.status(400).json({ error: '"userPrompt" is required' });

    const modelId = (typeof model === 'string' && MODEL_REGISTRY[model]) ? model : DEFAULT_MODEL;
    const entry   = MODEL_REGISTRY[modelId];
    // Cap requested tokens to the model's real max output (Sonnet 64k, Opus 128k).
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

      // Always use streaming for Anthropic — removes the 21333-token
      // non-streaming threshold and matches what /generate already does
      // for the opus path below. finalMessage() awaits all chunks and
      // resolves to the same Message shape messages.create() returns.
      const start = Date.now();
      console.log('[ai/prompt] streaming Anthropic model=%s max_tokens=%d', modelId, cappedTokens);
      const message = await client.messages.stream(msgOpts).finalMessage();
      console.log('[ai/prompt] stream done in %d ms, stop_reason=%s', Date.now() - start, message.stop_reason);

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
router.post('/loot', auth, requireAiApproval, async (req, res) => {
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
router.post('/generate', auth, requireAiApproval, async (req, res) => {
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

    // Stream and collect full response to avoid timeout.
    // model MUST be a valid id — 'claude-opus-4-6' (never existed in
    // MODEL_REGISTRY) made every /api/ai/generate call 404 at the Anthropic
    // API. The registry's Opus entry is 'claude-opus-4-7'. (2026-06-04 fix)
    const message = await client.messages.stream({
      model:      'claude-opus-4-7',
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

// ── POST /api/ai/character-image ──────────────────────────────────────────────
// Server-side character/NPC portrait generation on the shared GOOGLE_AI_API_KEY
// (replaces the browser-side gpt-image-1 flow that ran on the user's own
// OpenAI key). Shared-key cost route → auth + requireAiApproval, exactly like
// /api/maps/generate-from-sketch, PLUS a per-user daily image cap.
//
// Body: {
//   character_id?: number,   // saved character — whitelisted fields read from the record
//   fields?: { race, subrace, charClass, kit, gender, level, weapon, armor,
//              shield, gear[], age, hairColor, eyeColor, distinctiveFeatures,
//              appearance, appearanceNotes },   // unsaved NPCs / fresh sheet state
// }
// Inline fields override record-derived ones (the sheet in the browser can be
// newer than the last save). Everything is whitelisted server-side — see
// lib/characterImagePrompt.js.
//
// Returns: { image: "data:image/...;base64,...", prompt, used, cap }
// The client stores the data URL in the existing portrait/portraitHistory
// structure (NPC list-stripping already handles the payload weight).

// Current best Gemini image model — "Nano Banana 2". Verified against
// ai.google.dev/gemini-api/docs/image-generation (2026-07-05) and dry-run on
// the server with @google/genai 1.49: generateContent + responseModalities
// works; the model returns image/jpeg (~1 MB, conveniently smaller than
// gpt-image-1's ~2 MB PNGs for the history structures).
const GEMINI_IMAGE_MODEL = 'gemini-3.1-flash-image';

async function generateGeminiImage(prompt) {
  if (!process.env.GOOGLE_AI_API_KEY) {
    throw new Error('GOOGLE_AI_API_KEY not configured on server');
  }
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY });
  const result = await ai.models.generateContent({
    model: GEMINI_IMAGE_MODEL,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: { responseModalities: ['TEXT', 'IMAGE'] },
  });
  const parts = result.candidates?.[0]?.content?.parts ?? [];
  const img = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
  if (!img) throw new Error('Gemini returned no image part in response');
  return `data:${img.inlineData.mimeType};base64,${img.inlineData.data}`;
}

// Per-user daily image cap. Deliberately minimal: one (user_id, day) counter
// row (ai_image_usage, auto-migrate), reset by virtue of the DATE key — no
// token metering. Cap is a global default, overridable via IMAGE_DAILY_CAP.
const DEFAULT_IMAGE_DAILY_CAP = 20;
function imageDailyCap() {
  const n = parseInt(process.env.IMAGE_DAILY_CAP, 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_IMAGE_DAILY_CAP;
}

async function enforceImageCap(req, res, next) {
  try {
    const cap = imageDailyCap();
    const row = await db.one(
      'SELECT count FROM ai_image_usage WHERE user_id=$1 AND day=CURRENT_DATE',
      [req.user.id],
    );
    const used = row ? Number(row.count) : 0;
    if (used >= cap) {
      return res.status(403).json({ error: 'image_cap_reached', used, cap });
    }
    req.imageCap = { used, cap };
    return next();
  } catch (e) {
    // Fail CLOSED — an unreadable counter must not become free images.
    console.error('[ai/character-image] cap check failed:', e.message);
    return res.status(503).json({ error: 'image_cap_unavailable' });
  }
}

// Counted only on success — a failed generation doesn't burn the user's cap.
async function recordImageUse(userId) {
  await db.query(
    `INSERT INTO ai_image_usage (user_id, day, count) VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = ai_image_usage.count + 1`,
    [userId],
  );
}

router.post('/character-image', auth, requireAiApproval, enforceImageCap, async (req, res) => {
  try {
    const { character_id, fields } = req.body ?? {};

    // Record-derived fields (saved characters) — owner or campaign DM only.
    let recordFields = {};
    if (character_id !== undefined && character_id !== null) {
      const charId = parseInt(character_id, 10);
      if (!Number.isFinite(charId)) {
        return res.status(400).json({ error: 'character_id must be a number' });
      }
      const row = await db.one(
        'SELECT player_user_id, campaign_id, character_data FROM characters WHERE id=$1',
        [charId],
      );
      if (!row) return res.status(404).json({ error: 'Character not found' });
      const isOwn = row.player_user_id === req.user.id;
      const isDM  = row.campaign_id
        ? !!(await db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [row.campaign_id, req.user.id]))
        : false;
      if (!isOwn && !isDM) return res.status(403).json({ error: 'Access denied' });
      recordFields = fieldsFromCharacterData(row.character_data);
    }

    // Inline fields (unsaved NPCs / live sheet) override the record's.
    const merged = { ...recordFields, ...whitelistFields(fields) };
    if (Object.keys(merged).length === 0) {
      return res.status(400).json({ error: 'No usable character fields — send "fields" or a valid "character_id"' });
    }

    const prompt = buildCharacterImagePrompt(merged);
    console.log('[ai/character-image] user=%d model=%s prompt=%d chars', req.user.id, GEMINI_IMAGE_MODEL, prompt.length);

    const start = Date.now();
    const image = await generateGeminiImage(prompt);
    console.log('[ai/character-image] done in %d ms (%d KB)', Date.now() - start, Math.round(image.length / 1024));

    await recordImageUse(req.user.id);
    res.json({ image, prompt, used: req.imageCap.used + 1, cap: req.imageCap.cap });
  } catch (e) {
    console.error('[ai/character-image]', e.message);
    if (e.message?.includes('GOOGLE_AI_API_KEY')) {
      return res.status(503).json({ error: 'GOOGLE_AI_API_KEY not configured on server' });
    }
    res.status(500).json({ error: 'Image generation failed', detail: e.message });
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
