/**
 * /api/spells
 *   GET  /            — search / filter spells (public, no auth needed)
 *   GET  /random      — one random spell (optional filters)
 *   GET  /:id         — single spell by id
 *
 * Query params for GET /:
 *   q        — full-text search across name + description
 *   group    — 'wizard' | 'priest'
 *   level    — integer (1-9)
 *   school   — abjuration | conjuration | … (wizard)
 *   sphere   — all | animal | charm | … (priest)
 *   source   — source book filter (partial, case-insensitive)
 *   limit    — default 50, max 200
 *   offset   — default 0
 */
const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── Search / list spells ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { q, group, level, school, sphere, source } = req.query;
    const limit  = Math.min(parseInt(req.query.limit  ?? 50,  10), 200);
    const offset =           parseInt(req.query.offset ?? 0,  10);

    const conditions = [];
    const params     = [];

    if (group) {
      params.push(group);
      conditions.push(`spell_group = $${params.length}`);
    }
    if (level !== undefined) {
      params.push(parseInt(level, 10));
      conditions.push(`level = $${params.length}`);
    }
    if (school) {
      params.push(`%${school}%`);
      conditions.push(`school ILIKE $${params.length}`);
    }
    if (sphere) {
      params.push(`%${sphere}%`);
      conditions.push(`sphere ILIKE $${params.length}`);
    }
    if (source) {
      params.push(`%${source}%`);
      conditions.push(`source ILIKE $${params.length}`);
    }

    let orderBy = 'name ASC';

    if (q && q.trim()) {
      // Full-text rank + fallback ILIKE
      params.push(q.trim());
      const qi = params.length;
      conditions.push(
        `(to_tsvector('english', name || ' ' || COALESCE(description,'')) @@ plainto_tsquery('english', $${qi})
          OR name ILIKE $${qi + 1})`,
      );
      params.push(`%${q.trim()}%`);
      orderBy = `ts_rank(to_tsvector('english', name || ' ' || COALESCE(description,'')),
                          plainto_tsquery('english', $${qi})) DESC, name ASC`;
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(limit, offset);
    const rows = await db.all(
      `SELECT id, name, spell_group, level, school, sphere, source,
              casting_time, duration, range, area_of_effect,
              saving_throw, components, reversible, tags,
              LEFT(description, 400) AS description_preview
       FROM spells
       ${where}
       ORDER BY ${orderBy}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    // Count without limit/offset
    const countParams = params.slice(0, -2);
    const { rows: countRows } = await db.query(
      `SELECT COUNT(*) AS total FROM spells ${where}`,
      countParams,
    );

    res.json({ total: parseInt(countRows[0].total, 10), spells: rows });
  } catch (e) { next500(e, res); }
});

// ── Random spell ──────────────────────────────────────────────────────────────
router.get('/random', async (req, res) => {
  try {
    const { group, level, school, sphere } = req.query;
    const conditions = [];
    const params     = [];

    if (group)  { params.push(group);                conditions.push(`spell_group = $${params.length}`); }
    if (level !== undefined) { params.push(parseInt(level, 10)); conditions.push(`level = $${params.length}`); }
    if (school) { params.push(`%${school}%`);        conditions.push(`school ILIKE $${params.length}`); }
    if (sphere) { params.push(`%${sphere}%`);        conditions.push(`sphere ILIKE $${params.length}`); }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const spell = await db.one(
      `SELECT * FROM spells ${where} ORDER BY RANDOM() LIMIT 1`,
      params,
    );
    if (!spell) return res.status(404).json({ error: 'No spells found matching criteria' });
    res.json(spell);
  } catch (e) { next500(e, res); }
});

// ── Single spell ──────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const spell = await db.one('SELECT * FROM spells WHERE id=$1', [req.params.id]);
    if (!spell) return res.status(404).json({ error: 'Spell not found' });
    res.json(spell);
  } catch (e) { next500(e, res); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function next500(e, res) {
  console.error('[spells]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
