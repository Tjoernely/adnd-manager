/**
 * /api/characters
 *   GET    /                — list characters (own + party if campaign_id given)
 *   GET    /:id             — get one character (full if owner/DM, filtered if party)
 *   POST   /                — create character
 *   PUT    /:id             — save character (owner or DM)
 *   DELETE /:id             — delete character (owner or DM)
 *   GET    /party/:campaignId — all characters in campaign (party-filtered for non-owners)
 *
 * Party-view hides sensitive fields from other players:
 *   disadvPicked, disadvSubChoice, dmAwards, ruleBreaker,
 *   cpPerLevelOverride, dmAwardInput, showDmPanel, socialStatus
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Fields hidden when a player views another player's character
const PARTY_HIDDEN = new Set([
  'disadvPicked', 'disadvSubChoice',
  'dmAwards', 'dmAwardInput', 'dmAwardTotal', 'showDmPanel',
  'ruleBreaker', 'cpPerLevelOverride',
  'socialStatus',
]);
function partyFilter(data) {
  return Object.fromEntries(Object.entries(data).filter(([k]) => !PARTY_HIDDEN.has(k)));
}

// ── List characters ──────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    const rows = campaign_id
      ? await db.all(
          `SELECT * FROM characters WHERE player_user_id=$1 AND campaign_id=$2
           ORDER BY updated_at DESC`,
          [req.user.id, campaign_id],
        )
      : await db.all(
          `SELECT * FROM characters WHERE player_user_id=$1 ORDER BY updated_at DESC`,
          [req.user.id],
        );
    res.json(rows.map(fmt));
  } catch (e) { next500(e, res); }
});

// ── Party view: all characters in a campaign ─────────────────────────────────
router.get('/party/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const access = await campaignAccess(campaignId, req.user.id);
    if (!access) return res.status(403).json({ error: 'Not a member of this campaign' });

    const rows = await db.all(
      'SELECT * FROM characters WHERE campaign_id=$1 ORDER BY updated_at DESC',
      [campaignId],
    );
    // DM sees everything; each player sees own full + others filtered
    const result = rows.map(row => {
      const isOwn  = row.player_user_id === req.user.id;
      const isDM   = access.isDM;
      const fmtRow = fmt(row);   // ensures character_data is a parsed JS object
      const cd     = (isOwn || isDM) ? fmtRow.character_data : partyFilter(fmtRow.character_data ?? {});
      return { ...fmtRow, character_data: cd, is_own: isOwn };
    });
    res.json(result);
  } catch (e) { next500(e, res); }
});

// ── Get single character ─────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const row = await db.one('SELECT * FROM characters WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const isOwn = row.player_user_id === req.user.id;
    if (!isOwn) {
      // Check if requester is DM of this character's campaign
      const isDM = row.campaign_id
        ? !!(await db.one(
            'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
            [row.campaign_id, req.user.id],
          ))
        : false;
      // Check if requester is a campaign member
      const isMember = row.campaign_id
        ? !!(await db.one(
            'SELECT 1 FROM campaign_members WHERE campaign_id=$1 AND user_id=$2',
            [row.campaign_id, req.user.id],
          ))
        : false;

      if (!isDM && !isMember) return res.status(403).json({ error: 'Access denied' });

      const data = isDM ? row.character_data : partyFilter(row.character_data);
      return res.json(fmt({ ...row, character_data: data }));
    }
    res.json(fmt(row));
  } catch (e) { next500(e, res); }
});

// ── Create character ─────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    // Accept either 'character_data' or legacy 'data' key; no default so ?? works correctly
    const { name, campaign_id = null, character_data, data } = req.body ?? {};
    const charData = character_data ?? data ?? {};
    const charName = (name ?? charData.charName ?? 'Adventurer').trim();
    const row = await db.one(
      `INSERT INTO characters (player_user_id, campaign_id, name, character_data)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, campaign_id, charName, JSON.stringify(charData)],
    );
    res.status(201).json(fmt(row));
  } catch (e) { next500(e, res); }
});

// ── Save / update character ───────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const row = await db.one('SELECT * FROM characters WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const isOwn = row.player_user_id === req.user.id;
    const isDM  = row.campaign_id
      ? !!(await db.one(
          'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
          [row.campaign_id, req.user.id],
        ))
      : false;
    if (!isOwn && !isDM) return res.status(403).json({ error: 'Access denied' });

    const { character_data, data, name, campaign_id, visibility, dm_notes } = req.body ?? {};
    // Diagnostic: log what was received to help trace save issues
    console.log(`[PUT /characters/${req.params.id}] keys=${Object.keys(req.body ?? {}).join(',')}`
      + ` cd=${character_data != null ? 'present(' + JSON.stringify(character_data).length + 'B)' : 'absent'}`
      + ` data=${data != null ? 'present' : 'absent'}`);
    const newData     = character_data ?? data ?? row.character_data;
    const newName     = (name ?? newData?.charName ?? row.name).trim();
    const newCampaign = campaign_id !== undefined ? campaign_id : row.campaign_id;
    // Only DM can set visibility and dm_notes
    const newVisibility = isDM && visibility !== undefined ? visibility : (row.visibility ?? 'party');
    const newDmNotes    = isDM && dm_notes    !== undefined ? dm_notes    : row.dm_notes;

    const updated = await db.one(
      `UPDATE characters
       SET name=$1, campaign_id=$2, character_data=$3, visibility=$4, dm_notes=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [newName, newCampaign, JSON.stringify(newData), newVisibility, newDmNotes, req.params.id],
    );
    res.json(fmt(updated));
  } catch (e) { next500(e, res); }
});

// ── Delete character ─────────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const row = await db.one('SELECT * FROM characters WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const isOwn = row.player_user_id === req.user.id;
    const isDM  = row.campaign_id
      ? !!(await db.one(
          'SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2',
          [row.campaign_id, req.user.id],
        ))
      : false;
    if (!isOwn && !isDM) return res.status(403).json({ error: 'Access denied' });

    await db.query('DELETE FROM characters WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(row) {
  if (!row) return null;
  const { character_data, data, ...rest } = row;
  // typeof null === 'object' in JS — guard against null explicitly
  const raw = character_data ?? data;
  let parsed;
  if (raw !== null && raw !== undefined && typeof raw === 'object') {
    parsed = raw;                                  // already a JS object (pg JSONB)
  } else if (typeof raw === 'string') {
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
  } else {
    parsed = {};                                   // null / undefined → empty object
  }
  return { ...rest, character_data: parsed };
}
async function campaignAccess(campaignId, userId) {
  const row = await db.one(
    `SELECT (c.dm_user_id=$2) AS is_dm,
            EXISTS(SELECT 1 FROM campaign_members cm WHERE cm.campaign_id=$1 AND cm.user_id=$2) AS is_member
     FROM campaigns c WHERE c.id=$1`,
    [campaignId, userId],
  );
  if (!row) return null;
  if (!row.is_dm && !row.is_member) return null;
  return { isDM: row.is_dm, isMember: row.is_member };
}
function next500(e, res) {
  console.error('[characters]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
