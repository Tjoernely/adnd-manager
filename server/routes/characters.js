/**
 * /api/characters
 *   GET    /                — list characters (own + party if campaign_id given)
 *   GET    /:id             — get one character (full if owner/DM, filtered if party)
 *   POST   /                — create character
 *   PUT    /:id             — save character (owner or DM)
 *   PUT    /:id/approval     — approve/reject a rule-breaking character (campaign DM or admin)
 *   DELETE /:id             — delete character (owner or DM)
 *   GET    /party/:campaignId — all characters in campaign (party-filtered for non-owners)
 *
 * Rule-breaker / DM-approval (2026-06-04): `rule_breaker` + `dm_approved` are
 * COLUMNS; `rule_violations` (a short string list of what was broken) lives in
 * character_data. Derived `status`: clean | pending | approved. Saves persist
 * rule_breaker + rule_violations and ALWAYS reset dm_approved=false (only the
 * approval endpoint sets it true; clients can never self-approve).
 *
 * Party-view hides sensitive fields from other players:
 *   disadvPicked, disadvSubChoice, dmAwards, ruleBreaker,
 *   cpPerLevelOverride, dmAwardInput, showDmPanel, socialStatus
 *   (rule_violations + the top-level status/rule_breaker/dm_approved stay
 *    visible so the DM and party can see who's pending approval)
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Resolve the rule-breaker flag + violations from a save payload. Accepts a
// top-level `rule_breaker` (forward-compat) or falls back to the builder's
// character_data.ruleBreaker (current client). Violations come from top-level
// `rule_violations` or character_data.rule_violations — kept to ≤20 short
// strings. `dm_approved` from the client is ALWAYS ignored (only the approval
// endpoint sets it — same hardening as the `role` field on register).
function resolveRuleFlags(body, dataObj) {
  const rule_breaker = (typeof body?.rule_breaker === 'boolean')
    ? body.rule_breaker
    : !!(dataObj && dataObj.ruleBreaker);
  const rv = Array.isArray(body?.rule_violations) ? body.rule_violations
           : (Array.isArray(dataObj?.rule_violations) ? dataObj.rule_violations : []);
  const rule_violations = rv
    .filter(v => typeof v === 'string' && v.trim() !== '')
    .map(v => v.trim().slice(0, 200))
    .slice(0, 20);
  return { rule_breaker, rule_violations };
}

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
// campaign_id="null" (string)  → list UNASSIGNED (orphan) characters for this user
// campaign_id=<numeric id>     → list characters in that campaign
// (omitted)                    → list all characters for this user
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    let rows;
    if (campaign_id === 'null') {
      rows = await db.all(
        `SELECT * FROM characters WHERE player_user_id=$1 AND campaign_id IS NULL
         ORDER BY updated_at DESC`,
        [req.user.id],
      );
    } else if (campaign_id) {
      rows = await db.all(
        `SELECT * FROM characters WHERE player_user_id=$1 AND campaign_id=$2
         ORDER BY updated_at DESC`,
        [req.user.id, campaign_id],
      );
    } else {
      rows = await db.all(
        `SELECT * FROM characters WHERE player_user_id=$1 ORDER BY updated_at DESC`,
        [req.user.id],
      );
    }
    res.json(rows.map(fmt));
  } catch (e) { next500(e, res); }
});

// ── Party view: all characters in a campaign ─────────────────────────────────
router.get('/party/:campaignId', auth, async (req, res) => {
  try {
    const { campaignId } = req.params;
    const access = await campaignAccess(campaignId, req.user.id);
    if (!access) return res.status(403).json({ error: 'Not a member of this campaign' });

    // Join the owner so the DM can see who each character belongs to.
    const rows = await db.all(
      `SELECT c.*, u.username AS owner_username, u.email AS owner_email
       FROM characters c JOIN users u ON u.id = c.player_user_id
       WHERE c.campaign_id=$1 ORDER BY c.updated_at DESC`,
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
    const charData = { ...(character_data ?? data ?? {}) };
    // Rule-breaker flow: persist the flag + violations; new characters are never
    // pre-approved (dm_approved=false). Client can't self-approve.
    const { rule_breaker, rule_violations } = resolveRuleFlags(req.body, charData);
    charData.rule_violations = rule_violations;
    const charName = (name ?? charData.charName ?? 'Adventurer').trim();
    const row = await db.one(
      `INSERT INTO characters (player_user_id, campaign_id, name, character_data, rule_breaker, dm_approved)
       VALUES ($1, $2, $3, $4, $5, false) RETURNING *`,
      [req.user.id, campaign_id, charName, JSON.stringify(charData), rule_breaker],
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
    const baseData    = character_data ?? data ?? row.character_data;
    const newData     = (baseData && typeof baseData === 'object') ? { ...baseData } : {};
    // Rule-breaker flow: persist the flag + violations from the payload.
    const { rule_breaker, rule_violations } = resolveRuleFlags(req.body, newData);
    newData.rule_violations = rule_violations;
    const newName     = (name ?? newData?.charName ?? row.name).trim();
    const newCampaign = campaign_id !== undefined ? campaign_id : row.campaign_id;
    // Only DM can set visibility and dm_notes
    const newVisibility = isDM && visibility !== undefined ? visibility : (row.visibility ?? 'party');
    const newDmNotes    = isDM && dm_notes    !== undefined ? dm_notes    : row.dm_notes;

    // dm_approved is ALWAYS reset to false on save: the client can never
    // self-approve, and any edit to an already-approved rule-breaking character
    // re-enters the pending state (the DM must re-approve). Only
    // PUT /:id/approval sets it true.
    const updated = await db.one(
      `UPDATE characters
       SET name=$1, campaign_id=$2, character_data=$3, visibility=$4, dm_notes=$5,
           rule_breaker=$6, dm_approved=false, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [newName, newCampaign, JSON.stringify(newData), newVisibility, newDmNotes, rule_breaker, req.params.id],
    );
    res.json(fmt(updated));
  } catch (e) { next500(e, res); }
});

// ── Approve / reject a rule-breaking character (campaign DM or admin) ─────────
// Body: { approved: boolean }. Enforced server-side: only the DM of the
// character's campaign — or a global admin (users.is_admin) — may flip
// dm_approved. The owner / any player gets 403 (a player must never be able to
// approve their own rule-break). Roles are contextual: DM = campaign.dm_user_id.
router.put('/:id/approval', auth, async (req, res) => {
  try {
    const { approved } = req.body ?? {};
    if (typeof approved !== 'boolean')
      return res.status(400).json({ error: 'approved (boolean) required' });

    const row = await db.one('SELECT * FROM characters WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });

    const dm    = row.campaign_id ? !!(await isCampaignDM(row.campaign_id, req.user.id)) : false;
    const admin = await isAdmin(req.user.id);
    if (!dm && !admin)
      return res.status(403).json({ error: 'Only the campaign DM or an admin can approve characters' });

    const updated = await db.one(
      `UPDATE characters SET dm_approved=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [approved, req.params.id],
    );
    res.json(fmt(updated));
  } catch (e) { next500(e, res); }
});

// ── Reassign character ownership (campaign DM or admin) ──────────────────────
// Body: { player_user_id }. Transfers ownership. Enforced server-side: only the
// DM of the character's campaign — or a global admin — may reassign; a player
// (incl. the current owner) gets 403. The target MUST be a participant of the
// character's campaign (DM or a campaign_member) — never an arbitrary user.
// Only player_user_id changes: rule_breaker + dm_approved are untouched. The
// new owner can then edit via PUT /:id (its owner check uses player_user_id);
// the previous owner can no longer edit.
router.put('/:id/owner', auth, async (req, res) => {
  try {
    // Accept a number or a numeric string (a <select> value arrives as a string).
    const pid = Number(req.body?.player_user_id);
    if (!Number.isInteger(pid) || pid <= 0)
      return res.status(400).json({ error: 'player_user_id (positive integer) required' });

    const row = await db.one('SELECT * FROM characters WHERE id=$1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (!row.campaign_id)
      return res.status(400).json({ error: 'Character is not in a campaign; nothing to reassign within' });

    const dm    = !!(await isCampaignDM(row.campaign_id, req.user.id));
    const admin = await isAdmin(req.user.id);
    if (!dm && !admin)
      return res.status(403).json({ error: 'Only the campaign DM or an admin can reassign characters' });

    // Target must belong to the character's campaign (DM or member) — not arbitrary.
    const targetAccess = await campaignAccess(row.campaign_id, pid);
    if (!targetAccess)
      return res.status(400).json({ error: 'Target user is not a member of this campaign' });

    const updated = await db.one(
      `UPDATE characters SET player_user_id=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [pid, req.params.id],
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
  // Derived approval status from the rule_breaker / dm_approved columns
  // (present on rest). clean → no rule break; pending → break, not approved;
  // approved → break + DM-approved.
  const status = !rest.rule_breaker ? 'clean' : (rest.dm_approved ? 'approved' : 'pending');
  return { ...rest, character_data: parsed, status };
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
// Roles are contextual: the DM is the owner of the specific campaign.
function isCampaignDM(campaignId, userId) {
  return db.one('SELECT 1 FROM campaigns WHERE id=$1 AND dm_user_id=$2', [campaignId, userId]);
}
// Global admin override (users.is_admin) — read fresh from the DB, not the JWT.
async function isAdmin(userId) {
  const row = await db.one('SELECT is_admin FROM users WHERE id=$1', [userId]);
  return !!(row && row.is_admin);
}
function next500(e, res) {
  console.error('[characters]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
