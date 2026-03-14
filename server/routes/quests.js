/**
 * /api/quests
 *   GET    /           — list quests for a campaign (DM: all; players: all)
 *   GET    /:id        — single quest
 *   POST   /           — create quest (DM only)
 *   PUT    /:id        — update quest (DM only)
 *   DELETE /:id        — delete quest (DM only)
 *
 * campaign_id is required as a query param for GET /
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List quests ───────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    if (!(await hasAccess(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      'SELECT * FROM quests WHERE campaign_id=$1 ORDER BY created_at DESC',
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Single quest ──────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const quest = await db.one('SELECT * FROM quests WHERE id=$1', [req.params.id]);
    if (!quest) return res.status(404).json({ error: 'Not found' });
    if (!(await hasAccess(quest.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });
    res.json(quest);
  } catch (e) { next500(e, res); }
});

// ── Create quest (DM only) ────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, title, data = {} } = req.body ?? {};
    if (!campaign_id || !title)
      return res.status(400).json({ error: 'campaign_id and title required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const quest = await db.one(
      `INSERT INTO quests (campaign_id, title, data) VALUES ($1,$2,$3) RETURNING *`,
      [campaign_id, title.trim(), JSON.stringify(data)],
    );
    res.status(201).json(quest);
  } catch (e) { next500(e, res); }
});

// ── Update quest (DM only) ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const quest = await db.one('SELECT * FROM quests WHERE id=$1', [req.params.id]);
    if (!quest) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(quest.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const { title = quest.title, data = quest.data } = req.body ?? {};
    const updated = await db.one(
      `UPDATE quests SET title=$1, data=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [title.trim(), JSON.stringify(data), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete quest (DM only) ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const quest = await db.one('SELECT campaign_id FROM quests WHERE id=$1', [req.params.id]);
    if (!quest) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(quest.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM quests WHERE id=$1', [req.params.id]);
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
  console.error('[quests]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
