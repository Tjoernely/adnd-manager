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
const { enrichByMagicalItemId } = require('../lib/magicItemParser/enrichForAssign');

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

// ── Create (any campaign member) ──────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      campaign_id, name, description = '', item_type = 'mundane',
      identify_state = 'unknown', weight_lbs, value_gp,
      magical_item_id, notes = '',
      source, source_encounter_id,
    } = req.body ?? {};

    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });
    if (!(await hasAccess(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const row = await db.one(
      `INSERT INTO party_equipment
         (campaign_id, name, description, item_type, identify_state,
          weight_lbs, value_gp, magical_item_id, notes, source, source_encounter_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [campaign_id, name.trim(), description, item_type, identify_state,
       weight_lbs ?? null, value_gp ?? null, magical_item_id ?? null, notes,
       source ?? null, source_encounter_id ?? null],
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

    // If the pool item points at a magical_items row, enrich via parser so
    // slot / damage / magic_bonus / weapon_type flow through. Otherwise use
    // the lean pool fields unchanged (mundane loot).
    let enriched = null;
    if (item.magical_item_id) {
      try {
        enriched = await enrichByMagicalItemId(item.magical_item_id, client);
      } catch (e) {
        console.warn('[party-equipment] enrich failed, using lean copy:',
                     e.message);
      }
    }

    // Merge strategy: prefer enriched values where available, but never
    // overwrite non-null pool values with null — e.g. DM edits to notes
    // or a custom identify_state on the pool row must survive the copy.
    const prefer = (a, b) => (a != null && a !== '' ? a : b);

    const INS = {
      character_id,
      campaign_id:    item.campaign_id,
      name:           enriched?.name          ?? item.name,
      description:    prefer(item.description, enriched?.description),
      item_type:      enriched?.item_type     ?? item.item_type,
      identify_state: item.identify_state     ?? enriched?.identify_state ?? 'unknown',
      slot:           enriched?.slot          ?? null,
      weapon_type:    enriched?.weapon_type   ?? null,
      damage_s_m:     enriched?.damage_s_m    ?? null,
      damage_l:       enriched?.damage_l      ?? null,
      range_str:      enriched?.range_str     ?? null,
      armor_ac:       enriched?.armor_ac      ?? null,
      magic_bonus:    enriched?.magic_bonus   ?? 0,
      is_cursed:      enriched?.is_cursed     ?? false,
      is_two_handed:  enriched?.is_two_handed ?? false,
      speed_factor:   enriched?.speed_factor  ?? null,
      weight_lbs:     prefer(item.weight_lbs, enriched?.weight_lbs),
      value_gp:       prefer(item.value_gp,   enriched?.value_gp),
      magical_item_id: item.magical_item_id,
      notes:          prefer(item.notes,      enriched?.notes),
      source_pool_id: item.id,
    };

    const { rows: [charItem] } = await client.query(
      `INSERT INTO character_equipment
         (character_id, campaign_id, name, description, item_type, identify_state,
          slot, weapon_type, damage_s_m, damage_l, range_str, armor_ac,
          magic_bonus, is_cursed, is_two_handed, speed_factor,
          weight_lbs, value_gp, magical_item_id, notes, source_pool_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
       RETURNING *`,
      [INS.character_id, INS.campaign_id, INS.name, INS.description,
       INS.item_type, INS.identify_state,
       INS.slot, INS.weapon_type, INS.damage_s_m, INS.damage_l,
       INS.range_str, INS.armor_ac,
       INS.magic_bonus, INS.is_cursed, INS.is_two_handed, INS.speed_factor,
       INS.weight_lbs, INS.value_gp, INS.magical_item_id, INS.notes,
       INS.source_pool_id],
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
