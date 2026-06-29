/**
 * requireAdmin — global admin gate.
 *
 * is_admin is read FRESH from the DB on every call (not from the JWT), so
 * granting/revoking admin via SQL takes effect immediately. Mirrors the
 * requireAiApproval pattern. Fails CLOSED (403) on a DB error — an admin gate
 * should deny by default. Must be mounted AFTER `auth` (needs req.user.id).
 */
const db = require('../db');

async function requireAdmin(req, res, next) {
  try {
    const row = await db.one('SELECT is_admin FROM users WHERE id=$1', [req.user.id]);
    if (row && row.is_admin === true) return next();
    return res.status(403).json({ error: 'admin_required' });
  } catch (e) {
    console.error('[admin/require]', e.message);
    return res.status(403).json({ error: 'admin_required' });
  }
}

module.exports = { requireAdmin };
