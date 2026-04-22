/**
 * /api/campaigns
 *   GET    /                       — list campaigns (DM-owned + member-of)
 *   POST   /                       — create campaign (caller becomes DM)
 *   GET    /:id                    — get single campaign
 *   PUT    /:id                    — update (DM only)
 *   DELETE /:id                    — delete (DM only)
 *   GET    /:id/members            — list members
 *   DELETE /:id/members/:userId    — kick member (DM only)
 *   GET    /:id/invites            — list active invites (DM only)
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── List my campaigns ────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT DISTINCT c.*,
              (c.dm_user_id = $1)       AS is_dm,
              COALESCE(cm.role, 'dm')   AS my_role
       FROM campaigns c
       LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = $1
       WHERE c.dm_user_id = $1 OR cm.user_id = $1
       ORDER BY c.created_at DESC`,
      [req.user.id],
    );
    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Create campaign ──────────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  const { name, description = '', settings = {} } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name required' });
  try {
    const campaign = await db.one(
      `INSERT INTO campaigns (name, dm_user_id, description, settings)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), req.user.id, description, JSON.stringify(settings)],
    );
    res.status(201).json({ ...campaign, is_dm: true, my_role: 'dm' });
  } catch (e) { next500(e, res); }
});

// ── Get single campaign ──────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const campaign = await db.one(
      `SELECT c.*,
              (c.dm_user_id = $2)      AS is_dm,
              COALESCE(cm.role, 'dm')  AS my_role
       FROM campaigns c
       LEFT JOIN campaign_members cm ON cm.campaign_id = c.id AND cm.user_id = $2
       WHERE c.id = $1
         AND (c.dm_user_id = $2 OR cm.user_id = $2)`,
      [req.params.id, req.user.id],
    );
    if (!campaign) return res.status(404).json({ error: 'Campaign not found' });
    res.json(campaign);
  } catch (e) { next500(e, res); }
});

// ── Update campaign (DM only) ────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const existing = await dmOnly(req.params.id, req.user.id);
    if (!existing) return res.status(403).json({ error: 'Not DM of this campaign' });

    const { name = existing.name, description = existing.description, settings } = req.body ?? {};
    const campaign = await db.one(
      `UPDATE campaigns SET name=$1, description=$2, settings=$3, updated_at=NOW()
       WHERE id=$4 RETURNING *`,
      [name.trim(), description, settings ? JSON.stringify(settings) : existing.settings, req.params.id],
    );
    res.json({ ...campaign, is_dm: true, my_role: 'dm' });
  } catch (e) { next500(e, res); }
});

// ── Delete preview: what will cascade vs. survive? (DM only) ─────────────────
// Returns child-row counts grouped by FK rule so the UI can render a
// confirmation modal that tells the DM *exactly* what will vanish if they
// click delete. Called before DELETE /:id.
router.get('/:id/delete-preview', auth, async (req, res) => {
  try {
    const existing = await dmOnly(req.params.id, req.user.id);
    if (!existing) return res.status(403).json({ error: 'Not DM of this campaign' });

    // Find every table with a campaign_id column and classify by FK delete rule.
    // A single campaign_id column can belong to multiple constraints (PK + FK),
    // so DISTINCT ON picks the FK row when present (NULLs sort LAST with DESC).
    const { rows: tables } = await db.query(
      `SELECT DISTINCT ON (c.table_name)
              c.table_name,
              COALESCE(rc.delete_rule, 'NO FK') AS delete_rule
       FROM information_schema.columns c
       LEFT JOIN information_schema.table_constraints tc
              ON tc.table_name = c.table_name
             AND tc.table_schema = c.table_schema
             AND tc.constraint_type = 'FOREIGN KEY'
       LEFT JOIN information_schema.key_column_usage kcu
              ON kcu.constraint_name = tc.constraint_name
             AND kcu.constraint_schema = tc.constraint_schema
             AND kcu.column_name = c.column_name
       LEFT JOIN information_schema.referential_constraints rc
              ON rc.constraint_name = kcu.constraint_name
             AND rc.constraint_schema = kcu.constraint_schema
       WHERE c.column_name = 'campaign_id'
         AND c.table_schema = 'public'
       ORDER BY c.table_name, rc.delete_rule NULLS LAST`
    );

    const cascade  = {};
    const setnull  = {};
    const other    = {};
    for (const t of tables) {
      const { rows } = await db.query(
        `SELECT COUNT(*)::int AS n FROM ${t.table_name} WHERE campaign_id=$1`,
        [req.params.id],
      );
      const count = rows[0].n;
      if (count === 0) continue;
      if (t.delete_rule === 'CASCADE')       cascade[t.table_name]  = count;
      else if (t.delete_rule === 'SET NULL') setnull[t.table_name]  = count;
      else                                    other[t.table_name]    = count;
    }

    // Also list the character rows themselves (name + id) so the modal can
    // show "these characters will become unassigned" explicitly.
    const { rows: characters } = await db.query(
      `SELECT id, name, class, race, level
         FROM characters
        WHERE campaign_id=$1
        ORDER BY name`,
      [req.params.id],
    );

    res.json({
      campaign: { id: existing.id, name: existing.name },
      cascade,               // { monsters: 42, maps: 3, ... }  (will be deleted)
      set_null: setnull,     // { characters: 2, ... }          (will survive as orphan)
      other,                 // NO FK tables (shouldn't happen post-migration)
      characters,            // full rows for set_null.characters
    });
  } catch (e) { next500(e, res); }
});

// ── Delete campaign (DM only) ────────────────────────────────────────────────
// Query flag ?delete_characters=true tells us to hard-delete this campaign's
// characters first (in the same transaction) — otherwise the SET NULL FK
// leaves them alive as unassigned characters that can be reassigned later.
router.delete('/:id', auth, async (req, res) => {
  const deleteChars = req.query.delete_characters === 'true';
  const client = await db.pool.connect();
  try {
    const existing = await dmOnly(req.params.id, req.user.id);
    if (!existing) {
      client.release();
      return res.status(403).json({ error: 'Not DM of this campaign' });
    }
    await client.query('BEGIN');
    if (deleteChars) {
      await client.query(
        'DELETE FROM characters WHERE campaign_id=$1',
        [req.params.id],
      );
    }
    await client.query('DELETE FROM campaigns WHERE id=$1', [req.params.id]);
    await client.query('COMMIT');
    res.status(204).end();
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    next500(e, res);
  } finally {
    client.release();
  }
});

// ── List members ─────────────────────────────────────────────────────────────
router.get('/:id/members', auth, async (req, res) => {
  try {
    if (!(await hasAccess(req.params.id, req.user.id)))
      return res.status(403).json({ error: 'Access denied' });

    const [dm, ...players] = await Promise.all([
      db.one(
        `SELECT u.id, u.username, u.email, 'dm' AS role, c.created_at AS joined_at
         FROM campaigns c JOIN users u ON u.id = c.dm_user_id WHERE c.id=$1`,
        [req.params.id],
      ),
      db.all(
        `SELECT u.id, u.username, u.email, cm.role, cm.joined_at
         FROM campaign_members cm JOIN users u ON u.id = cm.user_id
         WHERE cm.campaign_id=$1 ORDER BY cm.joined_at`,
        [req.params.id],
      ),
    ]);
    res.json(dm ? [dm, ...players] : players);
  } catch (e) { next500(e, res); }
});

// ── Remove member (DM only) ──────────────────────────────────────────────────
router.delete('/:id/members/:userId', auth, async (req, res) => {
  try {
    if (!(await dmOnly(req.params.id, req.user.id)))
      return res.status(403).json({ error: 'Not DM of this campaign' });
    await db.query(
      'DELETE FROM campaign_members WHERE campaign_id=$1 AND user_id=$2',
      [req.params.id, req.params.userId],
    );
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── List active invites (DM only) ────────────────────────────────────────────
router.get('/:id/invites', auth, async (req, res) => {
  try {
    if (!(await dmOnly(req.params.id, req.user.id)))
      return res.status(403).json({ error: 'Not DM of this campaign' });
    const invites = await db.all(
      `SELECT id, token, email, expires_at, used_at, created_at FROM invites
       WHERE campaign_id=$1 AND used_at IS NULL AND expires_at > NOW()
       ORDER BY created_at DESC`,
      [req.params.id],
    );
    res.json(invites);
  } catch (e) { next500(e, res); }
});

// ── Helpers ──────────────────────────────────────────────────────────────────
function dmOnly(id, userId) {
  return db.one(
    'SELECT * FROM campaigns WHERE id=$1 AND dm_user_id=$2',
    [id, userId],
  );
}
function hasAccess(id, userId) {
  return db.one(
    `SELECT 1 FROM campaigns c
     LEFT JOIN campaign_members cm ON cm.campaign_id=c.id AND cm.user_id=$2
     WHERE c.id=$1 AND (c.dm_user_id=$2 OR cm.user_id=$2)`,
    [id, userId],
  );
}
function next500(e, res) {
  console.error('[campaigns]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
