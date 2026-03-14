/**
 * /api/maps
 *   GET    /       — list maps for a campaign (DM only)
 *   GET    /:id    — single map (DM only)
 *   POST   /       — create map (DM only)
 *   PUT    /:id    — update map (DM only)
 *   DELETE /:id    — delete map (DM only)
 *
 * Maps are DM-only (dungeon/world/region layouts, potentially with
 * secret annotations).  Image hosting is handled externally — this
 * route only stores the metadata + image_url + arbitrary data JSONB.
 *
 * campaign_id is required as a query param for GET /
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

const VALID_TYPES = ['dungeon', 'world', 'region', 'town', 'interior', 'other'];

// ── List maps ─────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const rows = await db.all(
      `SELECT id, campaign_id, name, type, image_url, created_at, updated_at
       FROM maps WHERE campaign_id=$1 ORDER BY name`,
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Single map ────────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    res.json(map);
  } catch (e) { next500(e, res); }
});

// ── Create map (DM only) ──────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, name, type = 'dungeon', image_url = null, data = {} } = req.body ?? {};
    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });
    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const map = await db.one(
      `INSERT INTO maps (campaign_id, name, type, image_url, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [campaign_id, name.trim(), type, image_url, JSON.stringify(data)],
    );
    res.status(201).json(map);
  } catch (e) { next500(e, res); }
});

// ── Update map (DM only) ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      name      = map.name,
      type      = map.type,
      image_url = map.image_url,
      data      = map.data,
    } = req.body ?? {};

    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    const updated = await db.one(
      `UPDATE maps SET name=$1, type=$2, image_url=$3, data=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name.trim(), type, image_url, JSON.stringify(data), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete map (DM only) ──────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT campaign_id FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM maps WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDM(campaignId, userId) {
  return db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
}
function next500(e, res) {
  console.error('[maps]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
