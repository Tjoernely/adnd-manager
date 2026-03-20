/**
 * /api/encounters
 *   GET    /       — list encounters (DM: all; players: visibility='party' only)
 *   GET    /:id    — single encounter (DM: any; players: visibility='party' only)
 *   POST   /       — create encounter (DM only)
 *   PUT    /:id    — update encounter (DM only)
 *   DELETE /:id    — delete encounter (DM only)
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List encounters ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = access.isDM
      ? await db.all('SELECT * FROM encounters WHERE campaign_id=$1 ORDER BY created_at DESC', [campaign_id])
      : await db.all("SELECT * FROM encounters WHERE campaign_id=$1 AND visibility='party' ORDER BY created_at DESC", [campaign_id]);

    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Single encounter ───────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT * FROM encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });

    const access = await campaignAccess(enc.campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    if (!access.isDM && (enc.visibility ?? 'dm_only') !== 'party')
      return res.status(403).json({ error: 'Not revealed to party yet' });

    res.json(enc);
  } catch (e) { next500(e, res); }
});

// ── Create encounter (DM only) ─────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, data = {} } = req.body ?? {};
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const enc = await db.one(
      `INSERT INTO encounters (campaign_id, data) VALUES ($1,$2) RETURNING *`,
      [campaign_id, JSON.stringify(data)],
    );
    res.status(201).json(enc);
  } catch (e) { next500(e, res); }
});

// ── Update encounter (DM only) ─────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT * FROM encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      data       = enc.data,
      visibility = enc.visibility ?? 'dm_only',
    } = req.body ?? {};

    const updated = await db.one(
      `UPDATE encounters SET data=$1, visibility=$2, updated_at=NOW() WHERE id=$3 RETURNING *`,
      [JSON.stringify(data), visibility, req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete encounter (DM only) ─────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT campaign_id FROM encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM encounters WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ────────────────────────────────────────────────────────────────
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
  return { isDM: row.is_dm, isMember: row.is_member };
}
function next500(e, res) {
  console.error('[encounters]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
