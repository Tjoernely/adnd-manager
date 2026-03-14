/**
 * /api/loot
 *   GET    /       — list loot for a campaign (DM: all; players: all)
 *   GET    /:id    — single loot entry
 *   POST   /       — create loot (DM only)
 *   PUT    /:id    — update loot (DM only)
 *   DELETE /:id    — delete loot (DM only)
 *
 * campaign_id is required as a query param for GET /
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List loot ─────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    if (!(await hasAccess(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      'SELECT * FROM loot WHERE campaign_id=$1 ORDER BY created_at DESC',
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Single loot entry ─────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT * FROM loot WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await hasAccess(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });
    res.json(item);
  } catch (e) { next500(e, res); }
});

// ── Create loot (DM only) ─────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, data = {} } = req.body ?? {};
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const item = await db.one(
      `INSERT INTO loot (campaign_id, data) VALUES ($1,$2) RETURNING *`,
      [campaign_id, JSON.stringify(data)],
    );
    res.status(201).json(item);
  } catch (e) { next500(e, res); }
});

// ── Update loot (DM only) ─────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT * FROM loot WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const { data = item.data } = req.body ?? {};
    const updated = await db.one(
      `UPDATE loot SET data=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [JSON.stringify(data), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete loot (DM only) ─────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT campaign_id FROM loot WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM loot WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
function isDM(campaignId, userId) {
  return db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
}
function hasAccess(campaignId, userId) {
  return db.one(
    `SELECT 1 FROM campaigns c
     LEFT JOIN campaign_members cm ON cm.campaign_id=c.id AND cm.user_id=$2
     WHERE c.id=$1 AND (c.dm_user_id=$2 OR cm.user_id=$2)`,
    [campaignId, userId],
  );
}
function next500(e, res) {
  console.error('[loot]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
