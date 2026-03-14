/**
 * /api/npcs
 *   GET    /                    — list NPCs for a campaign
 *   GET    /:id                 — get single NPC
 *   POST   /                    — create NPC (DM only)
 *   PUT    /:id                 — update NPC (DM only)
 *   PUT    /:id/reveal          — set is_hidden=false (DM only)
 *   PUT    /:id/hide            — set is_hidden=true  (DM only)
 *   DELETE /:id                 — delete NPC (DM only)
 *
 * Players only see NPCs where is_hidden=false.
 * DMs see all NPCs.
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List NPCs ─────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = access.isDM
      ? await db.all(
          'SELECT * FROM npcs WHERE campaign_id=$1 ORDER BY name',
          [campaign_id],
        )
      : await db.all(
          'SELECT * FROM npcs WHERE campaign_id=$1 AND is_hidden=false ORDER BY name',
          [campaign_id],
        );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Get single NPC ────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const npc = await db.one('SELECT * FROM npcs WHERE id=$1', [req.params.id]);
    if (!npc) return res.status(404).json({ error: 'Not found' });

    const access = await campaignAccess(npc.campaign_id, req.user.id);
    if (!access)            return res.status(403).json({ error: 'Access denied' });
    if (!access.isDM && npc.is_hidden)
      return res.status(403).json({ error: 'NPC is hidden' });

    res.json(npc);
  } catch (e) { next500(e, res); }
});

// ── Create NPC (DM only) ─────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, name, data = {}, is_hidden = true } = req.body ?? {};
    if (!campaign_id || !name) return res.status(400).json({ error: 'campaign_id and name required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const npc = await db.one(
      `INSERT INTO npcs (campaign_id, name, data, is_hidden)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [campaign_id, name.trim(), JSON.stringify(data), is_hidden],
    );
    res.status(201).json(npc);
  } catch (e) { next500(e, res); }
});

// ── Update NPC (DM only) ─────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const npc = await db.one('SELECT * FROM npcs WHERE id=$1', [req.params.id]);
    if (!npc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(npc.campaign_id, req.user.id))) return res.status(403).json({ error: 'DM only' });

    const { name = npc.name, data = npc.data, is_hidden = npc.is_hidden } = req.body ?? {};
    const updated = await db.one(
      `UPDATE npcs SET name=$1, data=$2, is_hidden=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [name.trim(), JSON.stringify(data), is_hidden, req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Reveal NPC ────────────────────────────────────────────────────────────────
router.put('/:id/reveal', auth, async (req, res) => {
  try {
    const npc = await db.one('SELECT campaign_id FROM npcs WHERE id=$1', [req.params.id]);
    if (!npc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(npc.campaign_id, req.user.id))) return res.status(403).json({ error: 'DM only' });
    const updated = await db.one(
      `UPDATE npcs SET is_hidden=false, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Hide NPC ──────────────────────────────────────────────────────────────────
router.put('/:id/hide', auth, async (req, res) => {
  try {
    const npc = await db.one('SELECT campaign_id FROM npcs WHERE id=$1', [req.params.id]);
    if (!npc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(npc.campaign_id, req.user.id))) return res.status(403).json({ error: 'DM only' });
    const updated = await db.one(
      `UPDATE npcs SET is_hidden=true, updated_at=NOW() WHERE id=$1 RETURNING *`,
      [req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete NPC (DM only) ─────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const npc = await db.one('SELECT campaign_id FROM npcs WHERE id=$1', [req.params.id]);
    if (!npc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(npc.campaign_id, req.user.id))) return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM npcs WHERE id=$1', [req.params.id]);
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
  return row;
}
function next500(e, res) {
  console.error('[npcs]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
