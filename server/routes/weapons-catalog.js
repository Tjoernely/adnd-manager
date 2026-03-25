/**
 * GET /api/weapons-catalog
 *   ?search=sword   — filter by name (case-insensitive)
 *   ?type=S         — filter by weapon_type (contains)
 * Returns all matching weapons ordered by name.
 * No auth required (reference data).
 */
const express = require('express');
const db      = require('../db');
const router  = express.Router();

router.get('/', async (req, res) => {
  try {
    const { search, type } = req.query;
    const params = [];
    let q = 'SELECT * FROM weapons_catalog WHERE 1=1';
    if (search) { params.push(`%${search}%`);  q += ` AND name ILIKE $${params.length}`; }
    if (type)   { params.push(`%${type}%`);    q += ` AND weapon_type ILIKE $${params.length}`; }
    q += ' ORDER BY name';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (e) {
    console.error('[weapons-catalog]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
