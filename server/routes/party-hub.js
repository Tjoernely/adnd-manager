/**
 * GET /api/party-hub?campaign_id=X
 *
 * Aggregated read-only view for the Party Hub.
 * DM sees all items; players see only visibility='party' items.
 *
 * Response: { isDM, characters[], quests[], encounters[], inventory[], knowledge[] }
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// Fields stripped from other players' character data (same set as characters.js)
const PARTY_HIDDEN = new Set([
  'disadvPicked', 'disadvSubChoice',
  'dmAwards', 'dmAwardInput', 'dmAwardTotal', 'showDmPanel',
  'ruleBreaker', 'cpPerLevelOverride',
  'socialStatus',
]);
function partyFilter(data) {
  if (!data || typeof data !== 'object') return {};
  return Object.fromEntries(Object.entries(data).filter(([k]) => !PARTY_HIDDEN.has(k)));
}

function parseJSON(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    const { isDM } = access;

    const [charRows, questRows, encRows, invRows, knowledgeRows] = await Promise.all([
      // All characters in campaign
      db.all('SELECT * FROM characters WHERE campaign_id=$1 ORDER BY updated_at DESC', [campaign_id]),

      // Quests: DM all, players party-visible only
      isDM
        ? db.all('SELECT * FROM quests WHERE campaign_id=$1 ORDER BY created_at DESC', [campaign_id])
        : db.all("SELECT * FROM quests WHERE campaign_id=$1 AND visibility='party' ORDER BY created_at DESC", [campaign_id]),

      // Encounters: DM all, players party-visible only
      isDM
        ? db.all('SELECT * FROM encounters WHERE campaign_id=$1 ORDER BY created_at DESC', [campaign_id])
        : db.all("SELECT * FROM encounters WHERE campaign_id=$1 AND visibility='party' ORDER BY created_at DESC", [campaign_id]),

      // Inventory: visible to all campaign members
      db.all('SELECT * FROM party_inventory WHERE campaign_id=$1 ORDER BY created_at DESC', [campaign_id]),

      // Knowledge: DM all, players filtered by visible_to
      db.all('SELECT * FROM party_knowledge WHERE campaign_id=$1 ORDER BY created_at DESC', [campaign_id]),
    ]);

    // ── Characters ─────────────────────────────────────────────────────────
    const characters = (isDM ? charRows : charRows.filter(r => (r.visibility ?? 'party') === 'party'))
      .map(r => {
        const isOwn = r.player_user_id === req.user.id;
        const raw   = parseJSON(r.character_data);
        const data  = (isOwn || isDM) ? raw : partyFilter(raw);
        return {
          id:             r.id,
          name:           r.name,
          player_user_id: r.player_user_id,
          visibility:     r.visibility ?? 'party',
          dm_notes:       isDM ? (r.dm_notes ?? '') : undefined,
          updated_at:     r.updated_at,
          is_own:         isOwn,
          character_data: data,
        };
      });

    // ── Quests ──────────────────────────────────────────────────────────────
    const quests = questRows.map(r => ({
      id:         r.id,
      title:      r.title,
      visibility: r.visibility ?? 'dm_only',
      created_at: r.created_at,
      updated_at: r.updated_at,
      data:       parseJSON(r.data),
    }));

    // ── Encounters ──────────────────────────────────────────────────────────
    const encounters = encRows.map(r => {
      const d = parseJSON(r.data);
      return {
        id:         r.id,
        visibility: r.visibility ?? 'dm_only',
        created_at: r.created_at,
        updated_at: r.updated_at,
        name:       d.name ?? 'Untitled Encounter',
        difficulty: d.difficulty,
        total_xp:   d.total_xp,
        monsters:   d.monsters ?? [],
        data:       d,
      };
    });

    // ── Knowledge ───────────────────────────────────────────────────────────
    const knowledge = isDM
      ? knowledgeRows
      : knowledgeRows.filter(r => {
          const vt = Array.isArray(r.visible_to)
            ? r.visible_to
            : parseJSON(r.visible_to) || ['all'];
          return vt.includes('all') || vt.includes(String(req.user.id));
        });

    res.json({ isDM, characters, quests, encounters, inventory: invRows, knowledge });
  } catch (e) { next500(e, res); }
});

// ── Helpers ────────────────────────────────────────────────────────────────
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
  console.error('[party-hub]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
