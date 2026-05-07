/**
 * /api/saved-encounters
 *   GET  /                     — list saved encounters for campaign (creatures nested)
 *   POST /                     — create encounter + creature rows (DM only)
 *   PUT  /:id                  — update title/status/loot/current_round (DM only)
 *   DELETE /:id                — delete encounter + creatures (DM only)
 *   GET  /:id/creatures        — list creatures for an encounter
 *   PUT  /:id/creatures/:cid   — update creature HP/initiative/status
 */
const express = require('express');
const db      = require('../db');
const { auth } = require('../middleware/auth');

// ── Save-target computation (mirror of src/rules-engine/combat/savingThrows.ts) ─
// Inlined here so the server doesn't have to import TS at runtime. Same logic.
const SAVES_DATA = require('../../src/rulesets/savingThrows.json');
const SAVES_TABLES = SAVES_DATA.tables;

function hdToFighterLevel(hd) {
  if (typeof hd === 'number') return Math.max(1, Math.floor(hd));
  if (!hd) return 1;
  const trimmed = String(hd).trim();
  // "5+3" → 6 (treat +N as bumping one level)
  const plus  = trimmed.match(/^(\d+)\+(\d+)/);
  if (plus)  return parseInt(plus[1], 10) + (parseInt(plus[2], 10) > 0 ? 1 : 0);
  // "1-1" → 1
  const minus = trimmed.match(/^(\d+)-(\d+)/);
  if (minus) return Math.max(1, parseInt(minus[1], 10));
  if (trimmed === '½' || trimmed === '1/2') return 1;
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? 1 : Math.max(1, n);
}

function computeSaveTargets(tableId, level) {
  const tbl = (tableId === 'monster') ? SAVES_TABLES.warrior : SAVES_TABLES[tableId];
  if (!tbl) return { death: 16, wand: 18, petrify: 17, breath: 20, spell: 19 };
  const row = tbl.rows.find(r => level >= r.from && level <= r.to) ?? tbl.rows[0];
  return { death: row.death, wand: row.wand, petrify: row.petrify, breath: row.breath, spell: row.spell };
}

const router = express.Router();

// ── List saved encounters (creatures nested) ───────────────────────────────
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

    // Nest creatures under each encounter so the client needs only one request
    const encounters = await Promise.all(rows.map(async enc => {
      const creatures = await db.all(
        'SELECT * FROM encounter_creatures WHERE encounter_id=$1 ORDER BY initiative DESC, id ASC',
        [enc.id],
      );
      return { ...enc, creatures };
    }));

    res.json({ encounters });
  } catch (e) {
    // Table may not exist yet on first deploy — return empty rather than 500
    console.error('[saved-encounters GET]', e.message);
    res.json({ encounters: [] });
  }
});

// ── Create saved encounter with creatures ──────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const {
      campaign_id, title, terrain, difficulty,
      party_level, party_size, total_xp,
      loot_data,
      creatures: creaturesInput = [],   // new format: one row per creature
      groups    = [],                   // legacy format: count-based
    } = req.body ?? {};

    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });
    if (!title)       return res.status(400).json({ error: 'title required' });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    // Create the encounter record
    const enc = await db.one(
      `INSERT INTO saved_encounters
         (campaign_id, title, terrain, difficulty, party_level, party_size, total_xp, loot_data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [campaign_id, title, terrain ?? null, difficulty ?? null,
       party_level ?? null, party_size ?? null, total_xp ?? 0,
       loot_data ? JSON.stringify(loot_data) : null],
    );

    const savedCreatures = [];

    if (creaturesInput.length) {
      // New format: each element is already one creature instance
      for (const cr of creaturesInput) {
        // Compute combat-extension data blob: saveTargets, saveTable, saveLevel.
        // Look up monster.hit_dice from DB if not supplied on the input row.
        let hitDice = cr.hit_dice;
        if (!hitDice && cr.monster_id) {
          try {
            const m = await db.one('SELECT hit_dice FROM monsters WHERE id=$1', [cr.monster_id]);
            hitDice = m?.hit_dice;
          } catch { /* monster lookup miss — use defaults */ }
        }
        const saveLevel   = hdToFighterLevel(hitDice ?? 1);
        const saveTargets = computeSaveTargets('monster', saveLevel);
        const dataBlob    = {
          saveTable:    'monster',
          saveLevel,
          saveTargets,
          conditions:   [],
          initModifier: 0,
        };

        const c = await db.one(
          `INSERT INTO encounter_creatures
             (encounter_id, monster_id, monster_name, max_hp, current_hp,
              initiative, ac, thac0, attacks, damage, xp_value, data)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
          [enc.id, cr.monster_id ?? null, cr.monster_name ?? 'Unknown',
           cr.max_hp ?? 8, cr.current_hp ?? cr.max_hp ?? 8,
           cr.initiative ?? 0,
           cr.ac ?? null, cr.thac0 ?? null,
           cr.attacks ?? null, cr.damage ?? null, cr.xp_value ?? 0,
           JSON.stringify(dataBlob)],
        );
        savedCreatures.push(c);
      }
    } else {
      // Legacy groups format: expand count into individual rows
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
          savedCreatures.push(c);
        }
      }
    }

    res.status(201).json({ ...enc, creatures: savedCreatures });
  } catch (e) { next500(e, res); }
});

// ── Update encounter metadata / round ─────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT * FROM saved_encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      title         = enc.title,
      status        = enc.status,
      loot_official = enc.loot_official,
      loot_ai       = enc.loot_ai,
      loot_data     = enc.loot_data,
      current_round = enc.current_round ?? 1,
    } = req.body ?? {};

    const updated = await db.one(
      `UPDATE saved_encounters
       SET title=$1, status=$2, loot_official=$3, loot_ai=$4, current_round=$5,
           loot_data=$6, updated_at=NOW()
       WHERE id=$7 RETURNING *`,
      [title, status,
       loot_official ? JSON.stringify(loot_official) : null,
       loot_ai, current_round,
       loot_data ? JSON.stringify(loot_data) : null,
       req.params.id],
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

// ── Update creature HP / initiative / status ───────────────────────────────
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

    const { current_hp, initiative, status, notes, data } = req.body ?? {};

    const newHp         = current_hp  !== undefined ? Math.max(0, Number(current_hp))  : creature.current_hp;
    const newInitiative = initiative  !== undefined ? Number(initiative)                : (creature.initiative ?? 0);
    const newStatus     = status      !== undefined ? status
      : newHp <= 0                                  ? 'dead'
      : newHp <= Math.ceil(creature.max_hp * 0.25)  ? 'critical'
      : newHp <= Math.ceil(creature.max_hp * 0.50)  ? 'bloodied'
      : 'alive';

    // Combat-extension data blob — shallow-merge incoming `data` into existing
    // (preserves saveTargets etc. when caller only patches conditions/currentInit)
    const mergedData = (data && typeof data === 'object')
      ? { ...(creature.data ?? {}), ...data }
      : (creature.data ?? {});

    const updated = await db.one(
      `UPDATE encounter_creatures
       SET current_hp=$1, initiative=$2, status=$3, notes=COALESCE($4, notes), data=$5
       WHERE id=$6 RETURNING *`,
      [newHp, newInitiative, newStatus, notes ?? null, JSON.stringify(mergedData), req.params.cid],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Append a single creature to an existing encounter (DM only) ────────────
// POST /:id/creatures  { monster_id, monster_name, max_hp, current_hp, ... }
// Used by the "Add to Encounter" button on monster cards / detail modal.
// Mirrors the spawn pattern from POST /  — including server-side saveTargets
// computation from monsters.hit_dice — so adopted creatures behave exactly
// like creatures created with the encounter.
router.post('/:id/creatures', auth, async (req, res) => {
  try {
    const enc = await db.one('SELECT id, campaign_id FROM saved_encounters WHERE id=$1', [req.params.id]);
    if (!enc) return res.status(404).json({ error: 'Encounter not found' });
    if (!(await isDM(enc.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      monster_id,
      monster_name,
      max_hp,
      current_hp,
      initiative = 0,
      status     = 'alive',
      ac,
      thac0,
      attacks,
      damage,
      xp_value   = 0,
      notes      = null,
    } = req.body ?? {};

    // Required-field validation matches the docstring contract on the v4 button.
    if (typeof monster_name !== 'string' || !monster_name.trim())
      return res.status(400).json({ error: 'monster_name required' });
    const mxHp = Number(max_hp);
    const cuHp = Number(current_hp);
    if (!Number.isFinite(mxHp) || mxHp <= 0)
      return res.status(400).json({ error: 'max_hp must be a positive number' });
    if (!Number.isFinite(cuHp) || cuHp < 0)
      return res.status(400).json({ error: 'current_hp must be a non-negative number' });

    // Same saveTargets compute pattern as the encounter-create route.
    // Look up monsters.hit_dice when not supplied; fall back to HD 1 if neither.
    let hitDice = req.body.hit_dice;
    if (!hitDice && monster_id) {
      try {
        const m = await db.one('SELECT hit_dice FROM monsters WHERE id=$1', [Number(monster_id)]);
        hitDice = m?.hit_dice;
      } catch { /* unknown monster — fall through to defaults */ }
    }
    const saveLevel   = hdToFighterLevel(hitDice ?? 1);
    const saveTargets = computeSaveTargets('monster', saveLevel);
    const dataBlob    = {
      saveTable:    'monster',
      saveLevel,
      saveTargets,
      conditions:   [],
      initModifier: 0,
    };

    const created = await db.one(
      `INSERT INTO encounter_creatures
         (encounter_id, monster_id, monster_name, max_hp, current_hp,
          initiative, status, ac, thac0, attacks, damage, xp_value, notes, data)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       RETURNING *`,
      [
        enc.id,
        monster_id ?? null,
        monster_name.trim(),
        mxHp,
        cuHp,
        Number(initiative) || 0,
        status,
        ac     ?? null,
        thac0  ?? null,
        attacks ?? null,
        damage  ?? null,
        Number(xp_value) || 0,
        notes,
        JSON.stringify(dataBlob),
      ],
    );

    // Bump encounter total_xp so the right-pane chip stays accurate.
    await db.query(
      `UPDATE saved_encounters
          SET total_xp   = COALESCE(total_xp, 0) + $1,
              updated_at = NOW()
        WHERE id = $2`,
      [Number(xp_value) || 0, enc.id],
    );

    res.status(201).json(created);
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
