/**
 * /api/party-knowledge
 *   GET    /       — list entries visible to the caller
 *   GET    /:id    — single entry (if visible to caller)
 *   POST   /       — create entry (DM only)
 *   PUT    /:id    — update entry (DM only)
 *   DELETE /:id    — delete entry (DM only)
 *
 * visible_to field: JSON array of user_id strings OR ["all"]
 *   ["all"]        → every campaign member can read
 *   ["1","3"]      → only those user IDs (and the DM) can read
 *
 * campaign_id is required as a query param for GET /
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List entries (filtered by visibility) ─────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      `SELECT * FROM party_knowledge WHERE campaign_id=$1 ORDER BY created_at DESC`,
      [campaign_id],
    );

    // DM sees everything; players see only entries where visible_to contains "all"
    // or their own user ID as a string
    const filtered = access.isDM
      ? rows
      : rows.filter(r => {
          const vt = Array.isArray(r.visible_to) ? r.visible_to : JSON.parse(r.visible_to ?? '["all"]');
          return vt.includes('all') || vt.includes(String(req.user.id));
        });

    res.json(filtered);
  } catch (e) { next500(e, res); }
});

// ── Single entry ──────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const entry = await db.one('SELECT * FROM party_knowledge WHERE id=$1', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Not found' });

    const access = await campaignAccess(entry.campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    if (!access.isDM) {
      const vt = Array.isArray(entry.visible_to) ? entry.visible_to : JSON.parse(entry.visible_to ?? '["all"]');
      if (!vt.includes('all') && !vt.includes(String(req.user.id)))
        return res.status(403).json({ error: 'Entry not visible to you' });
    }

    res.json(entry);
  } catch (e) { next500(e, res); }
});

// ── Create entry (DM only) ────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, title, content = '', visible_to = ['all'] } = req.body ?? {};
    if (!campaign_id || !title)
      return res.status(400).json({ error: 'campaign_id and title required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    if (!Array.isArray(visible_to))
      return res.status(400).json({ error: 'visible_to must be an array' });

    const entry = await db.one(
      `INSERT INTO party_knowledge (campaign_id, title, content, visible_to)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [campaign_id, title.trim(), content, JSON.stringify(visible_to)],
    );
    res.status(201).json(entry);
  } catch (e) { next500(e, res); }
});

// ── Update entry (DM only) ────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const entry = await db.one('SELECT * FROM party_knowledge WHERE id=$1', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(entry.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      title      = entry.title,
      content    = entry.content,
      visible_to = entry.visible_to,
    } = req.body ?? {};

    if (!Array.isArray(visible_to))
      return res.status(400).json({ error: 'visible_to must be an array' });

    const updated = await db.one(
      `UPDATE party_knowledge SET title=$1, content=$2, visible_to=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [title.trim(), content, JSON.stringify(visible_to), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete entry (DM only) ────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const entry = await db.one('SELECT campaign_id FROM party_knowledge WHERE id=$1', [req.params.id]);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(entry.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM party_knowledge WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

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
  return { isDM: row.is_dm, isMember: row.is_member };
}
function next500(e, res) {
  console.error('[party-knowledge]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
