/**
 * Shared rate-limit middlewares.
 *
 * Three named limiters cover the surfaces we actually care about for a small
 * DM tool going to beta:
 *
 *   - loginLimiter    — anti-brute-force on /api/auth/login (and register).
 *                       Keyed on IP + email so one attacker IP can't lock out
 *                       a real user just by burning their account quota.
 *   - aiLimiter       — per-user cap on /api/ai/* so a runaway client or a
 *                       leaked JWT can't drain the Anthropic / OpenAI bill.
 *   - imageLimiter    — separate, slightly tighter cap on the map-image
 *                       generation surfaces (DALL-E + Gemini cost real money
 *                       per call).
 *
 * Limits are conservative defaults; tune in env vars once we see real beta
 * traffic. All limiters skip on health/static traffic by virtue of being
 * mounted only on the relevant /api/* routes.
 *
 * trust proxy = 1 is set in index.js so req.ip reflects the real client
 * behind nginx (X-Forwarded-For), not the loopback address.
 */
const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

// ── /api/auth — anti-brute-force ────────────────────────────────────────────
// 10 attempts per IP+email per 15 min. Tight enough to block credential-
// stuffing, loose enough that a fat-fingered DM doesn't get locked out
// during normal use. Returns 429 with retry-after header on hit.
const loginLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  max:             isProd ? 10 : 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many login attempts. Try again later.' },
  keyGenerator:    (req) => {
    const email = (req.body?.email ?? '').toString().toLowerCase().trim();
    return `${req.ip}|${email}`;
  },
});

// Slightly looser registration limiter (no email coupling — caller hasn't
// committed to one yet). Stops drive-by account-creation spam.
const registerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             isProd ? 5 : 100,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Too many accounts created from this address. Try again later.' },
});

// ── /api/ai — per-user budget shield ────────────────────────────────────────
// 60 AI calls per user per hour. Sonnet at full quest length is ~$0.05 a
// call, so 60/h ≈ $3/h per user worst-case — survivable on a leaked JWT.
const aiLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             isProd ? 60 : 1000,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'AI request quota exceeded for this user. Try again later.' },
  keyGenerator:    (req) => `ai:${req.user?.id ?? req.ip}`,
});

// Tighter cap on image generation — gpt-image-1 + Gemini are pricier per
// call than text, so 20/h is a safer ceiling.
const imageLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,
  max:             isProd ? 20 : 200,
  standardHeaders: true,
  legacyHeaders:   false,
  message:         { error: 'Image generation quota exceeded for this user. Try again later.' },
  keyGenerator:    (req) => `image:${req.user?.id ?? req.ip}`,
});

module.exports = { loginLimiter, registerLimiter, aiLimiter, imageLimiter };
