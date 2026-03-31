/**
 * /kits
 *   GET /      — alle kits, filtrerbare på class og race
 *   GET /meta  — antal per klasse
 *   GET /:id   — enkelt kit med proficiency- og weapon-links
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');

const CLASS_FILTER_MAP = {
  fighter:     ['fighter'],
  ranger:      ['ranger'],
  paladin:     ['paladin'],
  thief:       ['thief'],
  bard:        ['bard'],
  cleric:      ['cleric'],
  druid:       ['druid'],
  wizard:      ['wizard'],
  illusionist: ['wizard', 'illusionist'],
};

// GET /kits
router.get('/', async (req, res) => {
  try {
    const { class: cls, race, search } = req.query;
    const conditions = ['1=1'];
    const params     = [];

    if (cls) {
      const mapped = CLASS_FILTER_MAP[cls.toLowerCase()];
      if (mapped) {
        params.push(mapped);
        const pn = params.length;
        if (race) {
          params.push(race.toLowerCase());
          conditions.push(`(k.kit_class = ANY($${pn}) OR k.is_universal = TRUE OR (k.is_racial = TRUE AND k.kit_race = $${params.length}))`);
        } else {
          conditions.push(`(k.kit_class = ANY($${pn}) OR k.is_universal = TRUE)`);
        }
      }
    } else if (race) {
      params.push(race.toLowerCase());
      conditions.push(`(k.kit_race = $${params.length} OR k.is_racial = FALSE)`);
    }

    if (search) {
      params.push(`%${search.toLowerCase()}%`);
      conditions.push(`LOWER(k.name) LIKE $${params.length}`);
    }

    const { rows } = await db.query(`
      SELECT k.id, k.canonical_id, k.name, k.kit_class, k.kit_race,
             k.is_universal, k.is_racial, k.source_book, k.source_url,
             k.description, k.benefits_text, k.hindrances_text,
             k.requirements_text, k.wealth_text,
             k.req_race, k.req_alignment, k.req_min_stats, k.prohibited_races
      FROM kits k
      WHERE ${conditions.join(' AND ')}
      ORDER BY k.is_universal, k.name
    `, params);

    res.json({ total: rows.length, kits: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /kits/meta
router.get('/meta', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT kit_class, COUNT(*)::int AS count,
             SUM(CASE WHEN is_universal THEN 1 ELSE 0 END)::int AS universal_count,
             SUM(CASE WHEN is_racial    THEN 1 ELSE 0 END)::int AS racial_count
      FROM kits GROUP BY kit_class ORDER BY kit_class
    `);
    res.json({ total: rows.reduce((s, r) => s + r.count, 0), classes: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /kits/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const byNum = /^\d+$/.test(id);
    const { rows } = await db.query(`
      SELECT k.*,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'relation_type', kpl.relation_type, 'prof_name_raw', kpl.prof_name_raw,
          'notes', kpl.notes, 'prof_id', p.id, 'canonical_id', p.canonical_id,
          'name', p.name, 'sp_cp_cost', p.sp_cp_cost,
          'sp_stat_1', p.sp_stat_1, 'sp_stat_2', p.sp_stat_2
        )) FILTER (WHERE kpl.id IS NOT NULL), '[]') AS proficiency_links,
        COALESCE(json_agg(DISTINCT jsonb_build_object(
          'relation_type', kwl.relation_type,
          'weapon_name_raw', kwl.weapon_name_raw,
          'weapon_prof_id', kwl.weapon_prof_id
        )) FILTER (WHERE kwl.id IS NOT NULL), '[]') AS weapon_links
      FROM kits k
      LEFT JOIN kit_proficiency_links kpl ON kpl.kit_id = k.id
      LEFT JOIN nonweapon_proficiencies p  ON p.id = kpl.prof_id
      LEFT JOIN kit_weapon_links kwl ON kwl.kit_id = k.id
      WHERE ${byNum ? 'k.id' : 'k.canonical_id'} = $1
      GROUP BY k.id
    `, [byNum ? Number(id) : id]);
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;