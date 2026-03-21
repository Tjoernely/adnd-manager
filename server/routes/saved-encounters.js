/**
 * /api/saved-encounters
 *   GET  /                     — list saved encounters for campaign
 *   POST /                     — create encounter + creature rows (DM only)
 *   PUT  /:id                  — update title/status/loot (DM only)
 *   DELETE /:id                — delete encounter + creatures (DM only)
 *   GET  /:id/creatures        — list creatures for an encounter
 *   PUT  /:id/creatures/:cid   — update creature HP/status
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List saved encounters ──────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      'SELECT * FROM saved_encounters WHERE campaign_id=$1 ORDER BY created_at DESC',
      [campaign_id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create saved encounter with creatures ──────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, title, terrain, difficulty, party_level, party_size, total_xp, groups = [] } = req.body ?? {};
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    if (!title)       return res.status(400).json({ error: 'title required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    // Create the encounter record
    const enc = await db.one(
      `INSERT INTO saved_encounters
         (campaign_id, title, terrain, difficulty, party_level, party_size, total_xp)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [campaign_id, title, terrain ?? null, difficulty ?? null,
       party_level ?? null, party_size ?? null, total_xp ?? 0],
    );

    // Create individual creature rows (one per creature instance)
    const creatures = [];
    for (const g of groups) {
      const count = Math.max(1, g.count ?? 1);
      for (let i = 0; i < count; i++) {
        const c = await db.one(
          `INSERT INTO encounter_creatures
             (encounter_id, monster_id, monster_name, max_hp, current_hp, initiative)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
          [enc.id, g.monster_id ?? null, g.monster_name ?? 'Unknown',
           g.hp_each ?? 8, g.hp_each ?? 8, g.initiative ?? 0],
        );
        creatures.push(c);
      }
    }

    res.status(201).json({ ...enc, creatures });
  } catch (e) { next500(e, res); }
});

// ── Update encounter metadata ──────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT * FROM saved_encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const { title = enc.title, status = enc.status, loot_official = enc.loot_official, loot_ai = enc.loot_ai } = req.body ?? {};
    const updated = await db.one(
      `UPDATE saved_encounters
       SET title=$1, status=$2, loot_official=$3, loot_ai=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [title, status, loot_official ? JSON.stringify(loot_official) : null, loot_ai, req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete encounter ───────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT campaign_id FROM saved_encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    await db.query('DELETE FROM saved_encounters WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Get creatures for encounter ────────────────────────────────────────────
router.get('/:id/creatures', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT * FROM saved_encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });

    const access = await campaignAccess(enc.campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const rows = await db.all(
      'SELECT * FROM encounter_creatures WHERE encounter_id=$1 ORDER BY initiative DESC, id ASC',
      [req.params.id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Update creature HP / status ────────────────────────────────────────────
router.put('/:id/creatures/:cid', auth, async (req, res) => {
  try {
    const creature = await db.one(
      `SELECT ec.*, se.campaign_id FROM encounter_creatures ec
       JOIN saved_encounters se ON se.id=ec.encounter_id
       WHERE ec.id=$1 AND ec.encounter_id=$2`,
      [req.params.cid, req.params.id],
    );
    if (!creature) return res.status(404).json({ error: 'Creature not found' });

    const access = await campaignAccess(creature.campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const { current_hp, status, notes } = req.body ?? {};
    const newHp     = current_hp !== undefined ? Math.max(0, Number(current_hp)) : creature.current_hp;
    const newStatus = status !== undefined ? status
      : newHp <= 0 ? 'dead'
      : newHp <= Math.ceil(creature.max_hp * 0.25) ? 'critical'
      : newHp <= Math.ceil(creature.max_hp * 0.50) ? 'bloodied'
      : 'alive';

    const updated = await db.one(
      `UPDATE encounter_creatures
       SET current_hp=$1, status=$2, notes=COALESCE($3, notes)
       WHERE id=$4 RETURNING *`,
      [newHp, newStatus, notes ?? null, req.params.cid],
    );
    res.json(updated);
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
  console.error('[saved-encounters]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
