/**
 * requireAiApproval — AI feature-gate middleware.
 *
 * Blocks unapproved users from routes that consume the OWNER's shared API
 * keys:
 *   - Anthropic text routes (/api/ai/prompt, /loot, /generate) — shared
 *     ANTHROPIC_API_KEY.
 *   - Server-side image generation (/api/maps/generate-from-sketch) — the
 *     gpt-image-1 / Gemini renderers run on the shared OPENAI_API_KEY /
 *     GOOGLE_AI_API_KEY. (2026-06-04: added here after the dall-e-3 cost-route
 *     review found this route was rate-limited but not approval-gated.)
 *   - Character/NPC portraits (/api/ai/character-image) — Gemini on the
 *     shared GOOGLE_AI_API_KEY (2026-07-05; moved off the browser-side
 *     user-key OpenAI flow). Also has a per-user daily image cap on top.
 *
 * NOT applied to the map gpt-image-1 call in MapGenerator — that still runs
 * browser-side on the USER's own key, so it costs the user, not the owner.
 * Nor to /api/maps/:id/image or /image/from-url, which only persist an
 * already-generated image (no model call).
 *
 * ai_approved is read FRESH from the DB on every call (not from the JWT), so an
 * owner approval via SQL takes effect immediately without the user re-logging
 * in. One indexed PK lookup is negligible beside model/image latency. Must be
 * mounted AFTER `auth` (it needs req.user.id).
 */
const db = require('../db');

async function requireAiApproval(req, res, next) {
  try {
    const row = await db.one('SELECT ai_approved FROM users WHERE id=$1', [req.user.id]);
    if (row && row.ai_approved === true) return next();
    return res.status(403).json({ error: 'ai_not_approved' });
  } catch (e) {
    console.error('[ai/approval]', e.message);
    return res.status(403).json({ error: 'ai_not_approved' });
  }
}

module.exports = { requireAiApproval };
