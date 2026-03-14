const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dnd-manager-secret';

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
