const express = require('express');
const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const db      = require('../db');

const router     = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'dnd-manager-secret';

// ── Reusable auth middleware (exported for other routes) ───────────────────────
function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(header.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function makeToken(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  try {
    const hash   = await bcrypt.hash(password, 10);
    const result = db.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?)').run(email.trim(), hash);
    const user   = { id: result.lastInsertRowid, email: email.trim() };
    res.status(201).json({ token: makeToken(user), user });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'Email already in use' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email?.trim());
  if (!row) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok)  return res.status(401).json({ error: 'Invalid email or password' });
  const user = { id: row.id, email: row.email };
  res.json({ token: makeToken(user), user });
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, email FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

module.exports = { router, auth };
