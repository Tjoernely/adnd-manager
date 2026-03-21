/**
 * /api/monsters
 *   GET    /           — search/filter monsters
 *   GET    /meta       — counts, types, sizes for filters
 *   GET    /:id        — single monster
 *   POST   /           — create custom monster (DM only)
 *   PUT    /:id        — update monster
 *   DELETE /:id        — delete monster
 *
 * Query params for GET /:
 *   search, type, size, alignment, habitat, frequency, campaign_id
 *   hd_min, hd_max, min_ac, max_ac
 *   sort: name_asc|name_desc|hd_asc|hd_desc|ac_asc|xp_asc|xp_desc
 *   limit (default 50, max 200), page (default 1)
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Computed expression for numeric hit dice value
const HD_EXPR = `COALESCE(NULLIF(regexp_replace(hit_dice, '[^0-9].*', '', 'g'), '')::int, 0)`;

// Safe AC: strip concatenated digits (e.g. 610→6, stored when "6 10" was parsed)
const AC_EXPR = `
  CASE
    WHEN armor_class IS NULL THEN NULL
    WHEN armor_class BETWEEN -10 AND 30 THEN armor_class
    WHEN LEFT(armor_class::text, 1) ~ '^[0-9]$'
      AND LEFT(armor_class::text, 1)::int BETWEEN -10 AND 30
      THEN LEFT(armor_class::text, 1)::int
    ELSE armor_class
  END`;

// Safe THAC0: try 2 digits first (e.g. 15), then 1
const THAC0_EXPR = `
  CASE
    WHEN thac0 IS NULL THEN NULL
    WHEN thac0 BETWEEN -5 AND 20 THEN thac0
    WHEN LENGTH(thac0::text) >= 2
      AND LEFT(thac0::text, 2) ~ '^-?[0-9]+$'
      AND LEFT(thac0::text, 2)::int BETWEEN -5 AND 20
      THEN LEFT(thac0::text, 2)::int
    WHEN LEFT(thac0::text, 1) ~ '^[0-9]$'
      AND LEFT(thac0::text, 1)::int BETWEEN -5 AND 20
      THEN LEFT(thac0::text, 1)::int
    ELSE thac0
  END`;

const SORT_MAP = {
  name_asc:  'name ASC',
  name_desc: 'name DESC',
  hd_asc:    `${HD_EXPR} ASC, name ASC`,
  hd_desc:   `${HD_EXPR} DESC, name ASC`,
  ac_asc:    'armor_class ASC NULLS LAST, name ASC',
  xp_asc:    'xp_value ASC NULLS LAST, name ASC',
  xp_desc:   'xp_value DESC NULLS LAST, name ASC',
};

// ── GET /meta ──────────────────────────────────────────────────────────────
router.get('/meta', async (req, res) => {
  try {
    const [totalRow, types, sizes] = await Promise.all([
      db.one('SELECT COUNT(*)::int AS total FROM monsters WHERE campaign_id IS NULL'),
      db.all(`SELECT type, COUNT(*)::int AS count FROM monsters
              WHERE campaign_id IS NULL AND type IS NOT NULL
              GROUP BY type ORDER BY count DESC`),
      db.all(`SELECT size, COUNT(*)::int AS count FROM monsters
              WHERE campaign_id IS NULL AND size IS NOT NULL
              GROUP BY size ORDER BY count DESC`),
    ]);
    res.json({ total: totalRow?.total ?? 0, types, sizes });
  } catch (e) { next500(e, res); }
});

// ── GET / ──────────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      search     = '',
      type       = '',
      size       = '',
      alignment  = '',
      habitat    = '',
      frequency  = '',
      campaign_id,
      hd_min,
      hd_max,
      min_ac,
      max_ac,
      sort  = 'name_asc',
      limit = 50,
      page  = 1,
    } = req.query;

    const params  = [];
    const clauses = [];
    let   p       = 1;

    // Global monsters (campaign_id IS NULL) or campaign-specific
    if (campaign_id) {
      clauses.push(`(campaign_id IS NULL OR campaign_id=$${p++})`);
      params.push(Number(campaign_id));
    } else {
      clauses.push('campaign_id IS NULL');
    }

    if (search)    { clauses.push(`name ILIKE $${p++}`);      params.push(`%${search}%`);    }
    if (type)      { clauses.push(`type ILIKE $${p++}`);      params.push(`%${type}%`);      }
    if (size)      { clauses.push(`size ILIKE $${p++}`);      params.push(size);             }
    if (alignment) { clauses.push(`alignment ILIKE $${p++}`); params.push(`%${alignment}%`); }
    if (habitat)   { clauses.push(`habitat ILIKE $${p++}`);   params.push(`%${habitat}%`);   }
    if (frequency) { clauses.push(`frequency ILIKE $${p++}`); params.push(`%${frequency}%`); }

    // Hit dice range (parsed from hit_dice string via regex)
    if (hd_min != null && hd_min !== '') {
      clauses.push(`${HD_EXPR} >= $${p++}`);
      params.push(Number(hd_min));
    }
    if (hd_max != null && hd_max !== '') {
      clauses.push(`${HD_EXPR} <= $${p++}`);
      params.push(Number(hd_max));
    }

    // AC range (lower AC = better in AD&D)
    if (min_ac != null && min_ac !== '') {
      clauses.push(`armor_class >= $${p++}`);
      params.push(Number(min_ac));
    }
    if (max_ac != null && max_ac !== '') {
      clauses.push(`armor_class <= $${p++}`);
      params.push(Number(max_ac));
    }

    const where   = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const orderBy = SORT_MAP[sort] ?? 'name ASC';
    const lim     = Math.min(Math.max(1, Number(limit)), 200);
    const offset  = (Math.max(1, Number(page)) - 1) * lim;

    const [rows, countRow] = await Promise.all([
      db.all(
        `SELECT id, name, source, hit_dice, hit_points,
                (${AC_EXPR})    AS armor_class,
                (${THAC0_EXPR}) AS thac0,
                movement, size, type, alignment, attacks, damage, xp_value,
                special_attacks, special_defenses, magic_resistance,
                COALESCE(armor_profile_id, NULL)  AS armor_profile_id,
                COALESCE(generated_hp, NULL)      AS generated_hp,
                COALESCE(generated_hp_base, NULL) AS generated_hp_base,
                COALESCE(random_roll, NULL)        AS random_roll,
                COALESCE(random_modifier, NULL)    AS random_modifier,
                COALESCE(role, 'normal')           AS role,
                frequency, habitat,
                COALESCE(treasure, NULL)           AS treasure,
                COALESCE(tags, NULL)               AS tags
         FROM monsters ${where}
         ORDER BY ${orderBy}
         LIMIT $${p} OFFSET $${p+1}`,
        [...params, lim, offset],
      ),
      db.one(`SELECT COUNT(*)::int AS total FROM monsters ${where}`, params),
    ]);

    res.json({ monsters: rows, total: countRow?.total ?? 0, page: Number(page), limit: lim });
  } catch (e) { next500(e, res); }
});

// ── GET /:id ───────────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const monster = await db.one(
      `SELECT *, (${AC_EXPR}) AS armor_class, (${THAC0_EXPR}) AS thac0
       FROM monsters WHERE id=$1`,
      [req.params.id],
    );
    if (!monster) return res.status(404).json({ error: 'Monster not found' });
    res.json(monster);
  } catch (e) { next500(e, res); }
});

// ── POST / ────────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      campaign_id, name, source = 'Custom',
      hit_dice, hit_points, armor_class, thac0, movement,
      size, type, alignment, attacks, damage,
      special_attacks, special_defenses, magic_resistance, save_as, morale, xp_value,
      description, habitat, frequency,
      armor_profile_id = 'none', generated_hp, tags = [],
    } = req.body ?? {};

    if (!name) return res.status(400).json({ error: 'name required' });

    // DM check for campaign-specific monsters
    if (campaign_id) {
      const ok = await db.one(
        'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
        [campaign_id, req.user.id],
      );
      if (!ok) return res.status(403).json({ error: 'DM only' });
    }

    const row = await db.one(
      `INSERT INTO monsters
         (name, source, hit_dice, hit_points, armor_class, thac0, movement,
          size, type, alignment, attacks, damage, special_attacks, special_defenses,
          magic_resistance, save_as, morale, xp_value, description, habitat, frequency,
          armor_profile_id, generated_hp, tags, campaign_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
       RETURNING *`,
      [name, source, hit_dice, hit_points, armor_class, thac0, movement,
       size, type, alignment, attacks, damage, special_attacks, special_defenses,
       magic_resistance, save_as, morale, xp_value, description, habitat, frequency,
       armor_profile_id, generated_hp, tags, campaign_id ?? null],
    );
    res.status(201).json(row);
  } catch (e) { next500(e, res); }
});

// ── PUT /:id ───────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await db.one('SELECT * FROM monsters WHERE id=$1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (existing.campaign_id) {
      const ok = await db.one(
        'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
        [existing.campaign_id, req.user.id],
      );
      if (!ok) return res.status(403).json({ error: 'DM only' });
    }

    const fields = [
      'name','source','hit_dice','hit_points','armor_class','thac0','movement',
      'size','type','alignment','attacks','damage','special_attacks','special_defenses',
      'magic_resistance','save_as','morale','xp_value','description','habitat','frequency',
      'armor_profile_id','generated_hp','generated_hp_base','random_roll','random_modifier',
      'role','tags',
    ];
    const updates = [];
    const values  = [];
    let p = 1;
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f}=$${p++}`);
        values.push(req.body[f]);
      }
    });
    if (!updates.length) return res.json(existing);

    values.push(req.params.id);
    const row = await db.one(
      `UPDATE monsters SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      values,
    );
    res.json(row);
  } catch (e) { next500(e, res); }
});

// ── DELETE /:id ────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await db.one('SELECT campaign_id FROM monsters WHERE id=$1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });

    if (existing.campaign_id) {
      const ok = await db.one(
        'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
        [existing.campaign_id, req.user.id],
      );
      if (!ok) return res.status(403).json({ error: 'DM only' });
    }
    await db.query('DELETE FROM monsters WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

function next500(e, res) {
  console.error('[monsters]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
