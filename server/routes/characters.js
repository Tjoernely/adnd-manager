const express = require('express');
const db      = require('../db');
const { auth } = require('./auth');

const router = express.Router();

// GET /api/characters?campaign_id=X
router.get('/', auth, (req, res) => {
  const { campaign_id } = req.query;
  const rows = campaign_id
    ? db.prepare('SELECT * FROM characters WHERE user_id=? AND campaign_id=? ORDER BY updated_at DESC').all(req.user.id, campaign_id)
    : db.prepare('SELECT * FROM characters WHERE user_id=? ORDER BY updated_at DESC').all(req.user.id);
  res.json(rows.map(parse));
});

// GET /api/characters/:id
router.get('/:id', auth, (req, res) => {
  const row = own(req);
  if (!row) return res.status(404).json({ error: 'Not found' });
  res.json(parse(row));
});

// POST /api/characters
router.post('/', auth, (req, res) => {
  const { name, campaign_id = null, data = {} } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO characters (user_id, campaign_id, name, data) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, campaign_id, name, JSON.stringify(data));
  res.status(201).json(parse(db.prepare('SELECT * FROM characters WHERE id=?').get(result.lastInsertRowid)));
});

// PUT /api/characters/:id
router.put('/:id', auth, (req, res) => {
  const row = own(req);
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name = row.name, campaign_id = row.campaign_id, data } = req.body ?? {};
  db.prepare(
    'UPDATE characters SET name=?, campaign_id=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name, campaign_id, JSON.stringify(data ?? JSON.parse(row.data)), req.params.id);
  res.json(parse(db.prepare('SELECT * FROM characters WHERE id=?').get(req.params.id)));
});

// DELETE /api/characters/:id
router.delete('/:id', auth, (req, res) => {
  if (!own(req)) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM characters WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ── helpers ────────────────────────────────────────────────────────────────────
function parse(row) {
  return row ? { ...row, data: JSON.parse(row.data) } : null;
}
function own(req) {
  return db.prepare('SELECT * FROM characters WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
}

module.exports = router;
