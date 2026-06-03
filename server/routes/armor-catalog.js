/**
 * GET /api/armor-catalog
 *   ?item_type=armor   — filter by 'armor' or 'shield'
 * Returns all matching armor/shields ordered by item_type then name.
 *
 * Auth required (any logged-in user) — added in the pre-beta security pass.
 * The dataset isn't secret, but gating it kills anonymous scraping/scanning.
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');
const router  = express.Router();

router.get('/', auth, async (req, res) => {
  try {
    const { item_type } = req.query;
    const params = [];
    let q = 'SELECT * FROM armor_catalog WHERE 1=1';
    if (item_type) { params.push(item_type); q += ` AND item_type = $${params.length}`; }
    q += ' ORDER BY item_type, name';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (e) {
    console.error('[armor-catalog]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
