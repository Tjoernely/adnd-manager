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
 *
 * NOT applied to the BROWSER image/portrait paths (NPC/character portraits,
 * map gpt-image-1 in MapGenerator) — those call api.openai.com directly with
 * the USER's own key, so they cost the user, not the owner. Nor to
 * /api/maps/:id/image or /image/from-url, which only persist an
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
