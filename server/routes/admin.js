/**
 * /api/admin — minimal admin API. EVERY route is behind auth + requireAdmin.
 *   GET /users               — list users (safe fields only; never password_hash)
 *   PUT /users/:id/approval  — { approved } → set ai_approved
 *   PUT /users/:id/suspend   — { suspended } → set suspended
 *
 * Self-protection (anti-lockout), enforced server-side:
 *   - an admin cannot suspend themselves           (cannot_suspend_self)
 *   - an admin cannot revoke their own ai_approved (cannot_revoke_own_approval)
 *   - the system keeps ≥1 active (non-suspended) admin (cannot_suspend_last_admin)
 *   - there is intentionally NO is_admin-mutation endpoint, so admin rights can
 *     only change via direct DB access — which keeps "can't remove own is_admin"
 *     inherently true and the admin set stable.
 */
const express = require('express');
const db      = require('../db');
const { auth }         = require('../middleware/auth');
const { requireAdmin } = require('../middleware/admin');

const router = express.Router();
router.use(auth, requireAdmin);

// Columns safe to expose to an admin — NEVER password_hash or other secrets.
const SAFE_COLS = 'id, username, email, created_at, ai_approved, is_admin, suspended';

// ── List users ───────────────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT ${SAFE_COLS} FROM users ORDER BY created_at ASC, id ASC`,
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Set ai_approved ────────────────────────────────────────────────────────────
router.put('/users/:id/approval', async (req, res) => {
  try {
    const { approved } = req.body ?? {};
    if (typeof approved !== 'boolean')
      return res.status(400).json({ error: 'approved (boolean) required' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid user id' });

    // Self-protection: an admin can't revoke their own AI approval.
    if (id === req.user.id && approved === false)
      return res.status(403).json({ error: 'cannot_revoke_own_approval' });

    const row = await db.one(
      `UPDATE users SET ai_approved=$1 WHERE id=$2 RETURNING ${SAFE_COLS}`,
      [approved, id],
    );
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (e) { next500(e, res); }
});

// ── Set suspended ──────────────────────────────────────────────────────────────
router.put('/users/:id/suspend', async (req, res) => {
  try {
    const { suspended } = req.body ?? {};
    if (typeof suspended !== 'boolean')
      return res.status(400).json({ error: 'suspended (boolean) required' });
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid user id' });

    // Self-protection: an admin can't suspend themselves (anti-lockout).
    if (id === req.user.id && suspended === true)
      return res.status(403).json({ error: 'cannot_suspend_self' });

    if (suspended === true) {
      const target = await db.one('SELECT is_admin FROM users WHERE id=$1', [id]);
      if (!target) return res.status(404).json({ error: 'User not found' });
      // Keep at least one active admin: don't suspend an admin if it would
      // leave zero non-suspended admins. (Given can't-suspend-self the acting
      // admin always remains, so this is defense-in-depth against odd states.)
      if (target.is_admin) {
        const others = await db.one(
          `SELECT count(*)::int AS n FROM users
           WHERE is_admin=true AND suspended=false AND id<>$1`,
          [id],
        );
        if (!others || others.n === 0)
          return res.status(403).json({ error: 'cannot_suspend_last_admin' });
      }
    }

    const row = await db.one(
      `UPDATE users SET suspended=$1 WHERE id=$2 RETURNING ${SAFE_COLS}`,
      [suspended, id],
    );
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json(row);
  } catch (e) { next500(e, res); }
});

function next500(e, res) {
  console.error('[admin]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
