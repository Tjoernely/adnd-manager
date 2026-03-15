/**
 * /api/spells
 *   GET  /              — search / filter spells (public, no auth needed)
 *   GET  /meta          — total counts, distinct schools/spheres/levels
 *   GET  /random        — one random spell (optional filters)
 *   GET  /random/batch  — N unique random spells (optional filters + count)
 *   GET  /:id           — single spell by id
 *
 * Query params for GET /:
 *   q / search   — full-text search across name + description
 *   group        — 'wizard' | 'priest'
 *   level        — exact integer (1-9)
 *   minLevel     — minimum level (inclusive)
 *   maxLevel     — maximum level (inclusive)
 *   school       — filter by school (partial, case-insensitive)
 *   sphere       — filter by sphere (partial, case-insensitive)
 *   reversible   — 'true' to only show reversible spells
 *   source       — source book filter (partial, case-insensitive)
 *   sort         — 'name' (default) | 'level'
 *   limit        — default 50, max 200
 *   offset       — default 0
 */
const express = require('express');
const db      = require('../db');

const router = express.Router();

// ── Meta (/meta must be before /:id) ─────────────────────────────────────────
router.get('/meta', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(*) FILTER (WHERE spell_group = 'wizard')                   AS wizard,
        COUNT(*) FILTER (WHERE spell_group = 'priest')                   AS priest,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(TRIM(school)) ORDER BY LOWER(TRIM(school))),
          NULL)                                                           AS schools,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT LOWER(TRIM(sphere)) ORDER BY LOWER(TRIM(sphere))),
          NULL)                                                           AS spheres,
        ARRAY_REMOVE(ARRAY_AGG(DISTINCT level ORDER BY level), NULL)     AS levels
      FROM spells
    `);
    const row = rows[0];
    res.json({
      total:   parseInt(row.total,  10),
      wizard:  parseInt(row.wizard, 10),
      priest:  parseInt(row.priest, 10),
      schools: row.schools  ?? [],
      spheres: row.spheres  ?? [],
      levels:  (row.levels  ?? []).map(l => parseInt(l, 10)),
    });
  } catch (e) { next500(e, res); }
});

// ── Random spell (/random must be before /:id) ────────────────────────────────
router.get('/random', async (req, res) => {
  try {
    const { conditions, params } = buildFilters(req.query);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const spell = await db.one(
      `SELECT * FROM spells ${where} ORDER BY RANDOM() LIMIT 1`,
      params,
    );
    if (!spell) return res.json({ spell: null, message: 'No spells match filters' });
    res.json(spell);
  } catch (e) { next500(e, res); }
});

// ── Random spell batch ────────────────────────────────────────────────────────
router.get('/random/batch', async (req, res) => {
  try {
    const rawCount = parseInt(req.query.count ?? 5, 10);
    const count = Math.max(1, Math.min(20, Number.isNaN(rawCount) ? 5 : rawCount));

    const { conditions, params } = buildFilters(req.query);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    params.push(count);
    const spells = await db.all(
      `SELECT * FROM spells ${where} ORDER BY RANDOM() LIMIT $${params.length}`,
      params,
    );
    res.json(spells);
  } catch (e) { next500(e, res); }
});

// ── Search / list spells ──────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit  ?? 50,  10), 200);
    const offset =           parseInt(req.query.offset ?? 0,  10);
    const sortBy = req.query.sort === 'level' ? 'level ASC, name ASC' : 'name ASC';

    const { conditions, params, searchTerm } = buildFilters(req.query);

    let orderBy = sortBy;
    if (searchTerm) {
      // rank full-text matches higher; ts_rank is already computed
      orderBy = `ts_rank(to_tsvector('english', name || ' ' || COALESCE(description,'')),
                          plainto_tsquery('english', $${params.indexOf(searchTerm) + 1})) DESC, ${sortBy}`;
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

    const total = parseInt(countRows[0].total, 10);
    res.json({
      total,
      page:   Math.floor(offset / limit) + 1,
      spells: rows,
    });
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

// ── Shared filter builder ─────────────────────────────────────────────────────
/**
 * Build WHERE conditions and params array from common query params.
 * Returns { conditions, params, searchTerm }.
 */
function buildFilters(query) {
  const { group, level, minLevel, maxLevel, school, sphere, source, reversible } = query;
  // `search` is an alias for `q`
  const q = query.search ?? query.q;

  const conditions = [];
  const params     = [];
  let searchTerm   = null;

  if (group) {
    params.push(group.toLowerCase());
    conditions.push(`spell_group = $${params.length}`);
  }
  if (level !== undefined && level !== '') {
    const lvl = parseInt(level, 10);
    if (!Number.isNaN(lvl)) {
      params.push(lvl);
      conditions.push(`level = $${params.length}`);
    }
  } else {
    // Range-based level filtering
    if (minLevel !== undefined && minLevel !== '') {
      const min = parseInt(minLevel, 10);
      if (!Number.isNaN(min)) {
        params.push(min);
        conditions.push(`level >= $${params.length}`);
      }
    }
    if (maxLevel !== undefined && maxLevel !== '') {
      const max = parseInt(maxLevel, 10);
      if (!Number.isNaN(max)) {
        params.push(max);
        conditions.push(`level <= $${params.length}`);
      }
    }
  }
  if (school && school !== '') {
    params.push(`%${school}%`);
    conditions.push(`school ILIKE $${params.length}`);
  }
  if (sphere && sphere !== '') {
    params.push(`%${sphere}%`);
    conditions.push(`sphere ILIKE $${params.length}`);
  }
  if (source && source !== '') {
    params.push(`%${source}%`);
    conditions.push(`source ILIKE $${params.length}`);
  }
  if (reversible === 'true') {
    conditions.push(`reversible = true`);
  }
  if (q && q.trim()) {
    searchTerm = q.trim();
    params.push(searchTerm);
    const qi = params.length;
    conditions.push(
      `(to_tsvector('english', name || ' ' || COALESCE(description,'')) @@ plainto_tsquery('english', $${qi})
        OR name ILIKE $${qi + 1})`,
    );
    params.push(`%${searchTerm}%`);
  }

  return { conditions, params, searchTerm };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function next500(e, res) {
  console.error('[spells]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
