/**
 * GET /api/weapons-catalog        — all weapons (excludes ammo)
 *   ?search=sword   — filter by name (case-insensitive)
 *   ?type=S         — filter by weapon_type (contains)
 * GET /api/weapons-catalog/ammo   — ammo catalog
 *   ?ranged_weapon_name=Bow,+Long — filter by compatible ranged weapon
 */
const express = require('express');
const db      = require('../db');
const router  = express.Router();

// Detect ranged category from weapon name (mirrors client-side logic)
function detRangedCat(name) {
  const n = (name || '').toLowerCase();
  if (n.includes('hand') && n.includes('crossbow')) return 'crossbow_hand';
  if (n.includes('heavy') && n.includes('crossbow')) return 'crossbow_heavy';
  if (n.includes('crossbow')) return 'crossbow_light';
  if (n.includes('bow'))     return 'bow';
  if (n.includes('sling'))   return 'sling';
  if (n.includes('blowgun')) return 'blowgun';
  return null; // thrown / no ammo
}

// ── Ammo sub-route (must be before '/' to avoid shadowing) ──────────────────
router.get('/ammo', async (req, res) => {
  try {
    const { ranged_weapon_name } = req.query;
    const params = [];
    let q = 'SELECT * FROM weapons_catalog WHERE compatible_ranged IS NOT NULL';
    if (ranged_weapon_name) {
      const cat = detRangedCat(ranged_weapon_name);
      if (!cat) return res.json([]); // thrown weapon — no ammo
      params.push(cat);
      q += ` AND compatible_ranged=$${params.length}`;
    }
    q += ' ORDER BY compatible_ranged, ammo_type, name';
    const result = await db.query(q, params);
    res.json(result.rows);
  } catch (e) {
    console.error('[weapons-catalog/ammo]', e.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── All weapons (excludes ammo entries) ─────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { search, type } = req.query;
    const params = [];
    // compatible_ranged IS NULL distinguishes weapons from ammo entries
    let q = 'SELECT * FROM weapons_catalog WHERE compatible_ranged IS NULL';
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
