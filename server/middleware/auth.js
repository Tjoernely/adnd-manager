const jwt = require('jsonwebtoken');
const db  = require('../db');

// SECURITY: JWT_SECRET MUST be configured in the environment. The previous
// fallback ('dnd-manager-secret') was a known string that would have let
// anyone forge tokens if env.JWT_SECRET were ever unset on a live server.
// In production we abort startup loudly; in dev/test we accept a marked
// in-memory secret but log a clear warning so it can't go unnoticed.
const JWT_SECRET = (() => {
  const fromEnv = process.env.JWT_SECRET;
  if (fromEnv && fromEnv.length >= 32 && fromEnv !== 'dnd-manager-secret') {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'JWT_SECRET is missing or too short (need ≥32 chars). ' +
      'Set it in server/.env before starting the server.'
    );
  }
  // Dev / test fallback: a per-process random secret. Restarts the server
  // → invalidates all tokens, which is the correct behaviour outside prod.
  const dev = require('crypto').randomBytes(32).toString('hex');
  console.warn('[auth] JWT_SECRET unset — using a per-process random secret. Tokens reset on restart.');
  return dev;
})();

/** Signs a token for a user row */
function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, role: user.role ?? 'player' },
    JWT_SECRET,
    { expiresIn: '30d' },
  );
}

/**
 * Verify JWT; attach decoded payload to req.user. Then a FRESH per-request
 * suspension check (one PK lookup) so an admin suspending an account takes
 * effect immediately — mid-session, not just at next login. Rejects a
 * suspended account with 403 { error: 'account_suspended' }.
 */
async function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  let decoded;
  try {
    decoded = jwt.verify(header.split(' ')[1], JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  req.user = decoded;
  try {
    const row = await db.one('SELECT suspended FROM users WHERE id=$1', [decoded.id]);
    if (!row) return res.status(401).json({ error: 'account_not_found' });
    if (row.suspended === true) return res.status(403).json({ error: 'account_suspended' });
  } catch (e) {
    // Fail OPEN on a DB hiccup: never turn a transient DB error into a global
    // auth outage. The actual route below will fail anyway if the DB is down,
    // and a suspended user can do nothing useful in that window. Logged.
    console.error('[auth/suspended-check]', e.message);
  }
  next();
}

/** Only allow users whose global role is 'dm' or 'admin' */
function requireDM(req, res, next) {
  if (req.user?.role !== 'dm' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'DM role required' });
  }
  next();
}

module.exports = { auth, makeToken, requireDM, JWT_SECRET };
