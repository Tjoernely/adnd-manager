const express = require('express');
const db      = require('../db');
const { auth } = require('./auth');

const router = express.Router();

// GET /api/campaigns
router.get('/', auth, (req, res) => {
  const rows = db.prepare(
    'SELECT * FROM campaigns WHERE user_id = ? ORDER BY updated_at DESC'
  ).all(req.user.id);
  res.json(rows.map(parse));
});

// POST /api/campaigns
router.post('/', auth, (req, res) => {
  const { name, description = '', data = {} } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'Name required' });
  const result = db.prepare(
    'INSERT INTO campaigns (user_id, name, description, data) VALUES (?, ?, ?, ?)'
  ).run(req.user.id, name, description, JSON.stringify(data));
  res.status(201).json(parse(db.prepare('SELECT * FROM campaigns WHERE id = ?').get(result.lastInsertRowid)));
});

// PUT /api/campaigns/:id
router.put('/:id', auth, (req, res) => {
  const row = own(req, 'campaigns');
  if (!row) return res.status(404).json({ error: 'Not found' });
  const { name = row.name, description = row.description, data } = req.body ?? {};
  db.prepare(
    'UPDATE campaigns SET name=?, description=?, data=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).run(name, description, JSON.stringify(data ?? JSON.parse(row.data)), req.params.id);
  res.json(parse(db.prepare('SELECT * FROM campaigns WHERE id=?').get(req.params.id)));
});

// DELETE /api/campaigns/:id
router.delete('/:id', auth, (req, res) => {
  if (!own(req, 'campaigns')) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM campaigns WHERE id=?').run(req.params.id);
  res.status(204).end();
});

// ── helpers ────────────────────────────────────────────────────────────────────
function parse(row) {
  return row ? { ...row, data: JSON.parse(row.data) } : null;
}
function own(req, table) {
  return db.prepare(`SELECT * FROM ${table} WHERE id=? AND user_id=?`).get(req.params.id, req.user.id);
}

module.exports = router;
