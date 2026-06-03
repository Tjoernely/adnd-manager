const jwt = require('jsonwebtoken');

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

/** Verify JWT; attach decoded payload to req.user */
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/** Only allow users whose global role is 'dm' or 'admin' */
function requireDM(req, res, next) {
  if (req.user?.role !== 'dm' && req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'DM role required' });
  }
  next();
}

module.exports = { auth, makeToken, requireDM, JWT_SECRET };
