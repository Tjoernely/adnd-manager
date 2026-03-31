/**
 * /proficiencies
 *   GET /          — alle NWPs, filtrerbare på group og class
 *   GET /meta      — antal per gruppe
 *   GET /:id       — enkelt NWP med aliases og class-access
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const CLASS_GROUP_MAP = {
  fighter:     ['warrior', 'general'],
  ranger:      ['warrior', 'general'],
  paladin:     ['warrior', 'general'],
  thief:       ['rogue',   'general'],
  bard:        ['rogue',   'general'],
  cleric:      ['priest',  'general'],
  druid:       ['priest',  'general'],
  wizard:      ['wizard',  'general'],
  illusionist: ['wizard',  'general'],
};

// GET /proficiencies
router.get('/', async (req, res) => {
  try {
    const { group, class: cls, search } = req.query;
    const conditions = [];
    const params     = [];

    if (cls && CLASS_GROUP_MAP[cls.toLowerCase()]) {
      params.push(CLASS_GROUP_MAP[cls.toLowerCase()]);
      conditions.push(`p.prof_group = ANY($${params.length})`);
    } else if (group) {
      params.push(group.toLowerCase());
      conditions.push(`p.prof_group = $${params.length}`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      const n = params.length;
      conditions.push(`(LOWER(p.name) LIKE $${n} OR EXISTS (
        SELECT 1 FROM proficiency_aliases a WHERE a.prof_id = p.id AND LOWER(a.alias) LIKE $${n}
      ))`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT p.id, p.canonical_id, p.name, p.prof_group, p.slots_required,
             p.check_ability, p.check_modifier, p.source_book, p.source_url,
             p.sp_cp_cost, p.sp_rank, p.sp_stat_1, p.sp_stat_2,
             p.is_sp_native, p.conversion_note, p.description,
             COALESCE(json_agg(DISTINCT a.alias) FILTER (WHERE a.alias IS NOT NULL), '[]') AS aliases
      FROM nonweapon_proficiencies p
      LEFT JOIN proficiency_aliases a ON a.prof_id = p.id
      ${where}
      GROUP BY p.id
      ORDER BY p.prof_group, p.name
    `, params);

    res.json({ total: rows.length, proficiencies: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /proficiencies/meta
router.get('/meta', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT prof_group,
             COUNT(*)::int AS count,
             COUNT(*) FILTER (WHERE is_sp_native)::int AS sp_native_count,
             COUNT(*) FILTER (WHERE NOT is_sp_native)::int AS converted_count
      FROM nonweapon_proficiencies
      GROUP BY prof_group ORDER BY prof_group
    `);
    res.json({ total: rows.reduce((s, r) => s + r.count, 0), groups: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /proficiencies/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const byNum = /^\d+$/.test(id);
    const { rows } = await db.query(`
      SELECT p.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object('alias', a.alias)) FILTER (WHERE a.alias IS NOT NULL), '[]') AS aliases,
        COALESCE(json_agg(DISTINCT jsonb_build_object('class_group', ca.class_group, 'cp_cost_override', ca.cp_cost_override)) FILTER (WHERE ca.class_group IS NOT NULL), '[]') AS class_access
      FROM nonweapon_proficiencies p
      LEFT JOIN proficiency_aliases a ON a.prof_id = p.id
      LEFT JOIN proficiency_class_access ca ON ca.prof_id = p.id
      WHERE ${byNum ? 'p.id' : 'p.canonical_id'} = $1
      GROUP BY p.id
    `, [byNum ? Number(id) : id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;