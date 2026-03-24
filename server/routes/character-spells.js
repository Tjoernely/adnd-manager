/**
 * /api/character-spells
 *   GET    /       — list spells for a character
 *   POST   /       — add spell to character (DM or owner)
 *   PUT    /:id    — update spell (DM or owner)
 *   DELETE /:id    — remove spell (DM or owner)
 */
const express  = require('express');
const db       = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List ──────────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { character_id, campaign_id } = req.query;
    if (!character_id && !campaign_id)
      return res.status(400).json({ error: 'character_id or campaign_id required' });

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
      `SELECT * FROM character_spells WHERE ${where}
       ORDER BY spell_level ASC, name ASC`,
      [val],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create (DM or owner) ──────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      character_id, campaign_id, name, spell_level = 1,
      spell_type = 'wizard', description = '', status = 'memorized',
      uses_per_day, uses_remaining, is_special = false,
      notes = '', spell_db_id,
    } = req.body ?? {};

    if (!character_id || !campaign_id || !name)
      return res.status(400).json({ error: 'character_id, campaign_id, and name required' });
    if (!(await canEdit(character_id, campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const row = await db.one(
      `INSERT INTO character_spells
         (character_id, campaign_id, name, spell_level, spell_type, description,
          status, uses_per_day, uses_remaining, is_special, notes, spell_db_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [character_id, campaign_id, name.trim(), spell_level, spell_type, description,
       status, uses_per_day ?? null, uses_remaining ?? null, is_special, notes,
       spell_db_id ?? null],
    );
    res.status(201).json(row);
  } catch (e) { next500(e, res); }
});

// ── Update (DM or owner) ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const spell = await db.one('SELECT * FROM character_spells WHERE id=$1', [req.params.id]);
    if (!spell) return res.status(404).json({ error: 'Not found' });
    if (!(await canEdit(spell.character_id, spell.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const fields = ['name','spell_level','spell_type','description','status',
                    'uses_per_day','uses_remaining','is_special','notes','spell_db_id'];
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
    if (updates.length === 1) return res.json(spell);
    values.push(req.params.id);

    const updated = await db.one(
      `UPDATE character_spells SET ${updates.join(',')} WHERE id=$${p} RETURNING *`,
      values,
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete (DM or owner) ──────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const spell = await db.one('SELECT character_id, campaign_id FROM character_spells WHERE id=$1', [req.params.id]);
    if (!spell) return res.status(404).json({ error: 'Not found' });
    if (!(await canEdit(spell.character_id, spell.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    await db.query('DELETE FROM character_spells WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
async function canEdit(characterId, campaignId, userId) {
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
  console.error('[character-spells]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
