/**
 * /api/character-equipment
 *   GET    /          — list items for a character
 *   POST   /          — add item directly to character (DM or owner)
 *   PUT    /:id       — update item fields (DM or owner)
 *   DELETE /:id       — hard-delete item
 *   PUT    /:id/equip — equip / unequip with slot rules
 */
const express  = require('express');
const db       = require('../db');
const { auth } = require('../middleware/auth');

const VALID_SLOTS = [
  'head','neck','shoulders','body','cloak','belt','wrists',
  'ring_l','ring_r','gloves','boots','hand_r','hand_l','ranged','ammo',
];

const router = express.Router();

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { character_id, campaign_id } = req.query;
    if (!character_id && !campaign_id)
      return res.status(400).json({ error: 'character_id or campaign_id required' });

    // Verify access
    let cid = campaign_id;
    if (!cid) {
      const char = await db.one('SELECT campaign_id FROM characters WHERE id=$1', [character_id]);
      if (!char) return res.status(404).json({ error: 'Character not found' });
      cid = char.campaign_id;
    }
    if (!(await hasAccess(cid, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const where = character_id ? 'character_id=$1' : 'campaign_id=$1';
    const val   = character_id ?? campaign_id;
    const rows  = await db.all(
      `SELECT * FROM character_equipment WHERE ${where} ORDER BY created_at ASC`,
      [val],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create (DM or character owner) ───────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      character_id, campaign_id, name, description = '',
      item_type = 'mundane', identify_state = 'identified',
      slot, weapon_type, damage_s_m, damage_l, range_str,
      armor_ac, magic_bonus = 0, is_cursed = false,
      weight_lbs, value_gp, magical_item_id, notes = '',
    } = req.body ?? {};

    if (!character_id || !campaign_id || !name)
      return res.status(400).json({ error: 'character_id, campaign_id, and name required' });

    if (!(await canEdit(character_id, campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const row = await db.one(
      `INSERT INTO character_equipment
         (character_id, campaign_id, name, description, item_type, identify_state,
          slot, weapon_type, damage_s_m, damage_l, range_str,
          armor_ac, magic_bonus, is_cursed, weight_lbs, value_gp, magical_item_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       RETURNING *`,
      [character_id, campaign_id, name.trim(), description, item_type, identify_state,
       slot ?? null, weapon_type ?? null, damage_s_m ?? null, damage_l ?? null, range_str ?? null,
       armor_ac ?? null, magic_bonus, is_cursed, weight_lbs ?? null, value_gp ?? null,
       magical_item_id ?? null, notes],
    );
    res.status(201).json(row);
  } catch (e) { next500(e, res); }
});

// ── Update fields (DM or character owner) ─────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT * FROM character_equipment WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await canEdit(item.character_id, item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const fields = ['name','description','item_type','identify_state','slot',
                    'weapon_type','damage_s_m','damage_l','range_str',
                    'armor_ac','magic_bonus','is_cursed','weight_lbs','value_gp',
                    'magical_item_id','notes'];
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
      `UPDATE character_equipment SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      values,
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete (hard, DM or owner) ────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const item = await db.one('SELECT character_id, campaign_id FROM character_equipment WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Not found' });
    if (!(await canEdit(item.character_id, item.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    await db.query('DELETE FROM character_equipment WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Equip / Unequip (DM or owner, with slot rules) ────────────────────────────
router.put('/:id/equip', auth, async (req, res) => {
  const client = await db.pool.connect();
  try {
    const { is_equipped } = req.body ?? {};
    if (is_equipped === undefined)
      return res.status(400).json({ error: 'is_equipped required' });

    await client.query('BEGIN');

    const { rows: [item] } = await client.query(
      'SELECT * FROM character_equipment WHERE id=$1',
      [req.params.id],
    );
    if (!item) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    if (!(await canEdit(item.character_id, item.campaign_id, req.user.id))) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Access denied' });
    }

    // ── Rule 1: Unequipping a cursed item is blocked ──────────────────────────
    if (!is_equipped && item.is_equipped && item.is_cursed) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Cannot unequip a cursed item' });
    }

    // ── Rule 2: Equipping requires a slot ─────────────────────────────────────
    if (is_equipped && !item.slot) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Item must have a slot assigned before equipping' });
    }

    // ── Rule 3: Slot must be valid ────────────────────────────────────────────
    if (is_equipped && item.slot && !VALID_SLOTS.includes(item.slot)) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `Invalid slot: ${item.slot}` });
    }

    if (is_equipped) {
      // ── Rule 4: Off-hand blocked if main hand has 2H weapon ──────────────────
      if (item.slot === 'hand_l') {
        const { rows: [twoH] } = await client.query(
          `SELECT id FROM character_equipment
           WHERE character_id=$1 AND slot='hand_r' AND weapon_type='2h' AND is_equipped=TRUE`,
          [item.character_id],
        );
        if (twoH) {
          await client.query('ROLLBACK');
          return res.status(403).json({ error: 'Cannot equip off-hand while a two-handed weapon is equipped' });
        }
      }

      // ── Rule 5: Equipping 2H weapon in main hand — clear off-hand ────────────
      if (item.slot === 'hand_r' && item.weapon_type === '2h') {
        await client.query(
          `UPDATE character_equipment
           SET is_equipped=FALSE, updated_at=NOW()
           WHERE character_id=$1 AND slot='hand_l' AND is_equipped=TRUE`,
          [item.character_id],
        );
      }

      // ── Rule 6: Unequip any existing item in the same slot ───────────────────
      await client.query(
        `UPDATE character_equipment
         SET is_equipped=FALSE, updated_at=NOW()
         WHERE character_id=$1 AND slot=$2 AND is_equipped=TRUE AND id<>$3`,
        [item.character_id, item.slot, item.id],
      );
    }

    // ── Apply the change ──────────────────────────────────────────────────────
    const { rows: [updated] } = await client.query(
      `UPDATE character_equipment SET is_equipped=$1, updated_at=NOW()
       WHERE id=$2 RETURNING *`,
      [is_equipped, item.id],
    );

    await client.query('COMMIT');
    res.json(updated);
  } catch (e) {
    await client.query('ROLLBACK');
    next500(e, res);
  } finally {
    client.release();
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function canEdit(characterId, campaignId, userId) {
  // DM or the character's owner
  const dm  = await db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
  if (dm) return true;
  const own = await db.one('SELECT 1 FROM characters WHERE id=$1 AND user_id=$2', [characterId, userId]);
  return !!own;
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
  console.error('[character-equipment]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
