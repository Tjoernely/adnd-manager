/**
 * /api/party-equipment
 *   GET    /           — list active pool items for a campaign
 *   POST   /           — create item (DM only)
 *   PUT    /:id        — update item fields (DM only)
 *   DELETE /:id        — soft-delete item (DM only)
 *   POST   /:id/assign — copy to character_equipment + soft-delete from pool (DM, transactional)
 */
const express  = require('express');
const db       = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    if (!(await hasAccess(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      `SELECT * FROM party_equipment
       WHERE campaign_id=$1 AND is_removed=FALSE
       ORDER BY created_at DESC`,
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create (DM only) ──────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      campaign_id, name, description = '', item_type = 'mundane',
      identify_state = 'unknown', weight_lbs, value_gp,
      magical_item_id, notes = '',
    } = req.body ?? {};

    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });
    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const row = await db.one(
      `INSERT INTO party_equipment
         (campaign_id, name, description, item_type, identify_state,
          weight_lbs, value_gp, magical_item_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [campaign_id, name.trim(), description, item_type, identify_state,
       weight_lbs ?? null, value_gp ?? null, magical_item_id ?? null, notes],
    );
    res.status(201).json(row);
  } catch (e) { next500(e, res); }
});

// ── Update (DM only) ──────────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT * FROM party_equipment WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const fields = ['name','description','item_type','identify_state',
                    'weight_lbs','value_gp','magical_item_id','notes'];
    const updates = [];
    const values  = [];
    let p = 1;
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f}=$${p++}`);
        values.push(req.body[f]);
      }
    });
    updates.push('updated_at=NOW()');
    if (updates.length === 1) return res.json(item);
    values.push(req.params.id);

    const updated = await db.one(
      `UPDATE party_equipment SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      values,
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Soft-delete (DM only) ─────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT campaign_id FROM party_equipment WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    await db.query(
      'UPDATE party_equipment SET is_removed=TRUE, updated_at=NOW() WHERE id=$1',
      [req.params.id],
    );
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Assign to character (DM only, transactional) ──────────────────────────────
router.post('/:id/assign', auth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { character_id } = req.body ?? {};
    if (!character_id)
      return res.status(400).json({ error: 'character_id required' });

    await client.query('BEGIN');

    const { rows: [item] } = await client.query(
      'SELECT * FROM party_equipment WHERE id=$1 AND is_removed=FALSE',
      [req.params.id],
    );
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found or already removed' });
    }
    if (!(await isDM(item.campaign_id, req.user.id))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'DM only' });
    }

    // Copy item into the character's equipment
    const { rows: [charItem] } = await client.query(
      `INSERT INTO character_equipment
         (character_id, campaign_id, name, description, item_type, identify_state,
          weight_lbs, value_gp, magical_item_id, notes, source_pool_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [character_id, item.campaign_id, item.name, item.description,
       item.item_type, item.identify_state, item.weight_lbs, item.value_gp,
       item.magical_item_id, item.notes, item.id],
    );

    // Remove from party pool
    await client.query(
      'UPDATE party_equipment SET is_removed=TRUE, updated_at=NOW() WHERE id=$1',
      [item.id],
    );

    await client.query('COMMIT');
    res.status(201).json(charItem);
  } catch (e) {
    await client.query('ROLLBACK');
    next500(e, res);
  } finally {
    client.release();
  }
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
  console.error('[party-equipment]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
