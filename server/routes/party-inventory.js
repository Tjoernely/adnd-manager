/**
 * /api/party-inventory
 *   GET    /       — list items for a campaign
 *   POST   /       — create item (DM only)
 *   PUT    /:id    — update item (DM only)
 *   DELETE /:id    — delete item (DM only)
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List ──────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    if (!(await hasAccess(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      'SELECT * FROM party_inventory WHERE campaign_id=$1 ORDER BY created_at DESC',
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create (DM only) ──────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      campaign_id, name, description = '', quantity = 1,
      value_gp, item_type = 'mundane', magical_item_id,
      awarded_to_character_id, source = '', notes = '',
    } = req.body ?? {};

    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const row = await db.one(
      `INSERT INTO party_inventory
         (campaign_id, name, description, quantity, value_gp, item_type,
          magical_item_id, awarded_to_character_id, source, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [campaign_id, name.trim(), description, quantity, value_gp ?? null,
       item_type, magical_item_id ?? null, awarded_to_character_id ?? null,
       source, notes],
    );
    res.status(201).json(row);
  } catch (e) { next500(e, res); }
});

// ── Update (DM only) ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT * FROM party_inventory WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const fields = ['name','description','quantity','value_gp','item_type',
                    'magical_item_id','awarded_to_character_id','source','notes'];
    const updates = [];
    const values  = [];
    let p = 1;
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f}=$${p++}`);
        values.push(req.body[f]);
      }
    });
    updates.push(`updated_at=NOW()`);

    if (updates.length === 1) return res.json(item); // only updated_at
    values.push(req.params.id);

    const updated = await db.one(
      `UPDATE party_inventory SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      values,
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete (DM only) ──────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT campaign_id FROM party_inventory WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM party_inventory WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ────────────────────────────────────────────────────────────────
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
  console.error('[party-inventory]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
