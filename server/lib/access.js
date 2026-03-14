/**
 * Campaign access helpers shared across all campaign-scoped routes.
 */
const db = require('../db');

/**
 * Returns { isDM, isMember, hasAccess } for a user/campaign pair.
 * Returns null if the campaign doesn't exist.
 */
async function getCampaignAccess(campaignId, userId) {
  const row = await db.one(
    `SELECT
       c.id,
       (c.dm_user_id = $2) AS is_dm,
       EXISTS(
         SELECT 1 FROM campaign_members cm
         WHERE cm.campaign_id = $1 AND cm.user_id = $2
       ) AS is_member
     FROM campaigns c
     WHERE c.id = $1`,
    [campaignId, userId],
  );
  if (!row) return null;
  return {
    isDM:      row.is_dm,
    isMember:  row.is_member,
    hasAccess: row.is_dm || row.is_member,
  };
}

/**
 * Express middleware factory.
 * Attaches access info to req.campaignAccess, or sends 403/404.
 *
 * Usage:
 *   router.get('/', auth, requireAccess('campaignId'), handler)
 *   router.post('/', auth, requireAccess('campaignId', true), handler) // DM only
 */
function requireAccess(paramName = 'campaignId', dmOnly = false) {
  return async (req, res, next) => {
    const campaignId = req.params[paramName] ?? req.body?.campaign_id ?? req.query?.campaign_id;
    if (!campaignId) return res.status(400).json({ error: 'campaign_id required' });

    const access = await getCampaignAccess(campaignId, req.user.id);
    if (!access)           return res.status(404).json({ error: 'Campaign not found' });
    if (!access.hasAccess) return res.status(403).json({ error: 'Not a member of this campaign' });
    if (dmOnly && !access.isDM) return res.status(403).json({ error: 'DM only' });

    req.campaignAccess = access;
    next();
  };
}

module.exports = { getCampaignAccess, requireAccess };
