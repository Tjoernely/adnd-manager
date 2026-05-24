/**
 * /api/map-connectors — Sprint 5 (multi-level maps).
 *
 *   GET    /?map_group_id=X       — list all connectors for one building
 *   GET    /?campaign_id=Y        — list all connectors for a campaign (rarely used)
 *   POST   /                      — create a connector (id is client-generated)
 *   PUT    /:id                   — update (move endpoints, change label, toggle flags)
 *   DELETE /:id                   — remove (doesn't touch any map record)
 *
 * Players see connectors only if at least one endpoint is on a player-visible
 * map AND `hidden=false`. DMs see everything.
 *
 * `endpoints` is JSONB: [{ floor: N, x_percent: 0..100, y_percent: 0..100 }, …]
 * Typical v1 layout = 2 endpoints (stairs/ladder/trapdoor between two floors).
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['stairs', 'ladder', 'trapdoor'];

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDM(campaignId, userId) {
  return db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
}
async function campaignAccess(campaignId, userId) {
  const row = await db.one(
    `SELECT (c.dm_user_id=$2) AS is_dm,
            EXISTS(SELECT 1 FROM campaign_members cm WHERE cm.campaign_id=$1 AND cm.user_id=$2) AS is_member
     FROM campaigns c WHERE c.id=$1`,
    [campaignId, userId],
  );
  if (!row || (!row.is_dm && !row.is_member)) return null;
  return { isDM: !!row.is_dm, isMember: !!row.is_member };
}
function next500(e, res) {
  console.error('[map_connectors]', e.message);
  res.status(500).json({ error: 'Server error' });
}
function normalizeEndpoints(eps) {
  if (!Array.isArray(eps)) return [];
  return eps
    .filter(e => e && typeof e === 'object' && Number.isFinite(+e.floor))
    .map(e => ({
      floor:     Math.trunc(+e.floor),
      x_percent: Math.max(0, Math.min(100, +e.x_percent || 0)),
      y_percent: Math.max(0, Math.min(100, +e.y_percent || 0)),
    }));
}

// ── GET / ─────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { map_group_id, campaign_id } = req.query;
    if (!map_group_id && !campaign_id) {
      return res.status(400).json({ error: 'map_group_id or campaign_id required' });
    }

    let rows;
    if (map_group_id) {
      // Find owning campaign via a sample map in the group, then access-check
      const sampleMap = await db.one(
        'SELECT campaign_id FROM maps WHERE map_group_id=$1 LIMIT 1',
        [map_group_id],
      );
      if (!sampleMap) return res.json([]); // empty group → no connectors
      const access = await campaignAccess(sampleMap.campaign_id, req.user.id);
      if (!access) return res.status(403).json({ error: 'Access denied' });

      rows = await db.all(
        `SELECT * FROM map_connectors
         WHERE map_group_id=$1
         ORDER BY created_at`,
        [map_group_id],
      );
      if (!access.isDM) rows = rows.filter(c => !c.hidden);
    } else {
      const access = await campaignAccess(campaign_id, req.user.id);
      if (!access) return res.status(403).json({ error: 'Access denied' });
      rows = await db.all(
        `SELECT * FROM map_connectors
         WHERE campaign_id=$1
         ORDER BY created_at`,
        [campaign_id],
      );
      if (!access.isDM) rows = rows.filter(c => !c.hidden);
    }

    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── POST / ────────────────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      id, map_group_id, campaign_id,
      type, label = null,
      locked = false, hidden = false,
      endpoints = [],
    } = req.body ?? {};

    if (!id || !map_group_id || !campaign_id || !type) {
      return res.status(400).json({ error: 'id, map_group_id, campaign_id, type required' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    if (!(await isDM(campaign_id, req.user.id))) {
      return res.status(403).json({ error: 'DM only' });
    }
    const eps = normalizeEndpoints(endpoints);
    if (eps.length < 2) {
      return res.status(400).json({ error: 'connector needs at least 2 endpoints' });
    }

    const conn = await db.one(
      `INSERT INTO map_connectors
         (id, map_group_id, campaign_id, type, label, locked, hidden, endpoints)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [id, map_group_id, campaign_id, type, label, !!locked, !!hidden, JSON.stringify(eps)],
    );
    res.status(201).json(conn);
  } catch (e) {
    if (/duplicate key/i.test(e.message)) {
      return res.status(409).json({ error: 'connector id already exists' });
    }
    next500(e, res);
  }
});

// ── PUT /:id ──────────────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await db.one('SELECT * FROM map_connectors WHERE id=$1', [req.params.id]);
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(existing.campaign_id, req.user.id))) {
      return res.status(403).json({ error: 'DM only' });
    }

    const {
      type      = existing.type,
      label     = existing.label,
      locked    = existing.locked,
      hidden    = existing.hidden,
      endpoints = existing.endpoints,
    } = req.body ?? {};

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });
    }
    const eps = normalizeEndpoints(endpoints);
    if (eps.length < 2) {
      return res.status(400).json({ error: 'connector needs at least 2 endpoints' });
    }

    const updated = await db.one(
      `UPDATE map_connectors
       SET type=$1, label=$2, locked=$3, hidden=$4, endpoints=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [type, label, !!locked, !!hidden, JSON.stringify(eps), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── DELETE /:id ───────────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const existing = await db.one(
      'SELECT campaign_id FROM map_connectors WHERE id=$1', [req.params.id],
    );
    if (!existing) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(existing.campaign_id, req.user.id))) {
      return res.status(403).json({ error: 'DM only' });
    }
    await db.query('DELETE FROM map_connectors WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

module.exports = router;
