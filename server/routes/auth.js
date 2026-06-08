/**
 * /api/auth
 *   POST /register   — create account
 *   POST /login      — get JWT
 *   GET  /me         — current user info
 *   POST /invite     — DM creates invite link for a campaign
 *   GET  /invite/:token   — preview invite (campaign name, no auth)
 *   POST /invite/:token/accept — logged-in user joins campaign
 */
require('dotenv').config({ path: `${__dirname}/../.env` });

const express = require('express');
const bcrypt  = require('bcryptjs');
const crypto  = require('crypto');
const db      = require('../db');
const { auth, makeToken } = require('../middleware/auth');

const router  = express.Router();
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// ── Register ────────────────────────────────────────────────────────────────
// SECURITY: `role` is NOT accepted from the request body. Every new account
// is created as a 'player'. DM rights are granted per-campaign (campaigns
// table dm_user_id) rather than as a global property — see campaigns.js +
// the per-route isDM checks. This closes a privilege-escalation path where
// a self-registering user could set role='dm' and unlock any future
// requireDM-gated endpoint.
//
// Password hashing uses bcrypt cost 12 (was 10). Cost 12 ≈ 250ms on modern
// CPUs — still fast enough for interactive login and meaningfully stronger
// against offline cracking if the DB ever leaks.
const BCRYPT_COST = 12;

router.post('/register', async (req, res) => {
  const { email, password, username } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' });

  // Minimum-strength gate: rejects accidentally-empty strings and the most
  // trivially-guessable passwords. The real protection is rate-limiting +
  // bcrypt cost; this is just hygiene at the edge.
  if (typeof password !== 'string' || password.length < 8)
    return res.status(400).json({ error: 'password must be at least 8 characters' });

  try {
    const hash = await bcrypt.hash(password, BCRYPT_COST);
    const uname = (username ?? email.split('@')[0]).trim().slice(0, 100);
    const user = await db.one(
      `INSERT INTO users (email, password_hash, username, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, email, username, role, ai_approved, is_admin`,
      [email.trim().toLowerCase(), hash, uname, 'player'],
    );
    res.status(201).json({ token: makeToken(user), user });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'Email already in use' });
    console.error('[auth/register]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Login ───────────────────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password)
    return res.status(400).json({ error: 'email and password required' });

  const user = await db.one(
    'SELECT * FROM users WHERE email = $1',
    [email.trim().toLowerCase()],
  );
  if (!user) return res.status(401).json({ error: 'Invalid email or password' });

  console.log('[login] bcrypt.compare start', new Date().toISOString());
  const ok = await Promise.race([
    bcrypt.compare(password, user.password_hash),
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000))
  ]).catch(() => false);
  console.log('[login] bcrypt.compare done', new Date().toISOString(), 'ok:', ok);
  if (!ok)  return res.status(401).json({ error: 'Invalid email or password' });

  const { password_hash: _ph, ...safeUser } = user;
  res.json({ token: makeToken(user), user: safeUser });
});

// ── Me ──────────────────────────────────────────────────────────────────────
router.get('/me', auth, async (req, res) => {
  // ai_approved + is_admin (2026-06-04 AI feature-gate) are surfaced so the
  // frontend can gate the server-AI buttons. Enforcement is server-side in
  // requireAiApproval — these flags are UX only. login() already returns both
  // (it spreads all columns minus password_hash into safeUser).
  const user = await db.one(
    'SELECT id, email, username, role, ai_approved, is_admin, created_at FROM users WHERE id = $1',
    [req.user.id],
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

// ── Create invite ────────────────────────────────────────────────────────────
// POST /api/auth/invite  { campaign_id, email? }
router.post('/invite', auth, async (req, res) => {
  const { campaign_id, email } = req.body ?? {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

  // Only the DM of the campaign may create invites
  const campaign = await db.one(
    'SELECT id, name FROM campaigns WHERE id = $1 AND dm_user_id = $2',
    [campaign_id, req.user.id],
  );
  if (!campaign) return res.status(403).json({ error: 'Not DM of this campaign' });

  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await db.query(
    `INSERT INTO invites (campaign_id, token, email, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [campaign_id, token, email ?? null, req.user.id, expiresAt],
  );

  res.status(201).json({
    token,
    url:       `${APP_URL}/join/${token}`,
    campaign:  campaign.name,
    expires_at: expiresAt,
  });
});

// ── Preview invite (no auth required) ───────────────────────────────────────
// GET /api/auth/invite/:token
router.get('/invite/:token', async (req, res) => {
  const inv = await db.one(
    `SELECT i.*, c.name AS campaign_name, u.username AS dm_name
     FROM invites i
     JOIN campaigns c ON c.id = i.campaign_id
     JOIN users    u ON u.id  = i.created_by
     WHERE i.token = $1`,
    [req.params.token],
  );
  if (!inv) return res.status(404).json({ error: 'Invalid invite link' });
  if (inv.used_at)          return res.status(410).json({ error: 'Invite already used' });
  if (new Date(inv.expires_at) < new Date())
                            return res.status(410).json({ error: 'Invite expired' });

  res.json({
    campaign_id:   inv.campaign_id,
    campaign_name: inv.campaign_name,
    dm_name:       inv.dm_name,
    email:         inv.email,
    expires_at:    inv.expires_at,
  });
});

// ── Accept invite ────────────────────────────────────────────────────────────
// POST /api/auth/invite/:token/accept  (must be logged in)
router.post('/invite/:token/accept', auth, async (req, res) => {
  const inv = await db.one(
    `SELECT * FROM invites WHERE token = $1`,
    [req.params.token],
  );
  if (!inv)                              return res.status(404).json({ error: 'Invalid invite' });
  if (inv.used_at)                       return res.status(410).json({ error: 'Invite already used' });
  if (new Date(inv.expires_at) < new Date()) return res.status(410).json({ error: 'Invite expired' });
  if (inv.email && inv.email !== req.user.email)
    return res.status(403).json({ error: 'Invite is for a different email address' });

  // Already a member?
  const existing = await db.one(
    `SELECT id FROM campaign_members WHERE campaign_id=$1 AND user_id=$2`,
    [inv.campaign_id, req.user.id],
  );
  if (existing) return res.status(409).json({ error: 'Already a member of this campaign' });

  // Join + mark invite used
  await db.query(
    `INSERT INTO campaign_members (campaign_id, user_id, role) VALUES ($1, $2, 'player')`,
    [inv.campaign_id, req.user.id],
  );
  await db.query(
    `UPDATE invites SET used_at=NOW(), used_by=$1 WHERE id=$2`,
    [req.user.id, inv.id],
  );

  const campaign = await db.one(
    'SELECT id, name FROM campaigns WHERE id=$1',
    [inv.campaign_id],
  );
  res.json({ message: `Joined campaign: ${campaign.name}`, campaign });
});

module.exports = { router, auth }; // keep named export for backward compat
