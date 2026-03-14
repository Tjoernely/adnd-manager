/**
 * /api/maps
 *   GET    /              — list maps (DM: all; player: visible_to_players only)
 *   GET    /:id           — single map (same visibility rules, pins filtered for players)
 *   POST   /              — create map (DM only)
 *   POST   /:id/image     — upload/replace map image (DM only, multipart)
 *   PUT    /:id           — update metadata + data/pins (DM only)
 *   DELETE /:id           — delete map (DM only)
 *
 * Pins are stored inside data.pins[] as JSONB.
 * Each pin: { id, x, y, label, notes, shared, color, icon, links:{npcIds,encounterIds,questIds} }
 * Players only see pins where pin.shared === true, and only maps where data.visible_to_players === true.
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── Image upload setup ────────────────────────────────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '../public/uploads/maps');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `map-${crypto.randomUUID()}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },  // 20 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^image\/(jpeg|png|gif|webp|bmp|tiff)$/.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

const VALID_TYPES = ['dungeon', 'world', 'region', 'city', 'town', 'interior', 'encounter', 'other'];

// ── List maps ─────────────────────────────────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'campaign_id required' });

    const access = await campaignAccess(campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    let rows;
    if (access.isDM) {
      rows = await db.all(
        `SELECT id, campaign_id, name, type, image_url, data, created_at, updated_at
         FROM maps WHERE campaign_id=$1 ORDER BY name`,
        [campaign_id],
      );
    } else {
      const all = await db.all(
        `SELECT id, campaign_id, name, type, image_url, data, created_at, updated_at
         FROM maps WHERE campaign_id=$1`,
        [campaign_id],
      );
      rows = all
        .filter(m => m.data?.visible_to_players)
        .map(m => filterMapForPlayer(m));
    }

    res.json(rows);
  } catch (e) { next500(e, res); }
});

// ── Single map ────────────────────────────────────────────────────────────────
router.get('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });

    const access = await campaignAccess(map.campaign_id, req.user.id);
    if (!access) return res.status(403).json({ error: 'Access denied' });

    if (!access.isDM) {
      if (!map.data?.visible_to_players)
        return res.status(403).json({ error: 'Map not shared with players' });
      return res.json(filterMapForPlayer(map));
    }

    res.json(map);
  } catch (e) { next500(e, res); }
});

// ── Create map (DM only) ──────────────────────────────────────────────────────
router.post('/', auth, async (req, res) => {
  try {
    const { campaign_id, name, type = 'dungeon', image_url = null, data = {} } = req.body ?? {};
    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });
    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const safeData = { visible_to_players: false, pins: [], ...data };
    const map = await db.one(
      `INSERT INTO maps (campaign_id, name, type, image_url, data)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [campaign_id, name.trim(), type, image_url, JSON.stringify(safeData)],
    );
    res.status(201).json(map);
  } catch (e) { next500(e, res); }
});

// ── Upload / replace map image (DM only, multipart) ───────────────────────────
router.post('/:id/image', auth, upload.single('image'), async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });
    if (!req.file)
      return res.status(400).json({ error: 'No image file uploaded' });

    // Delete old local image if present
    if (map.image_url?.startsWith('/uploads/maps/')) {
      const oldPath = path.join(__dirname, '../public', map.image_url);
      fs.unlink(oldPath, () => {});
    }

    const image_url = `/uploads/maps/${req.file.filename}`;
    const updated = await db.one(
      `UPDATE maps SET image_url=$1, updated_at=NOW() WHERE id=$2 RETURNING *`,
      [image_url, req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Update map (DM only) ──────────────────────────────────────────────────────
router.put('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const {
      name      = map.name,
      type      = map.type,
      image_url = map.image_url,
      data      = map.data,
    } = req.body ?? {};

    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    const updated = await db.one(
      `UPDATE maps SET name=$1, type=$2, image_url=$3, data=$4, updated_at=NOW()
       WHERE id=$5 RETURNING *`,
      [name.trim(), type, image_url, JSON.stringify(data), req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Delete map (DM only) ──────────────────────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT campaign_id, image_url FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    if (map.image_url?.startsWith('/uploads/maps/')) {
      const p = path.join(__dirname, '../public', map.image_url);
      fs.unlink(p, () => {});
    }

    await db.query('DELETE FROM maps WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (e) { next500(e, res); }
});

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  return { isDM: !!row.is_dm, isMember: !!row.is_member };
}

function filterMapForPlayer(map) {
  const data = { ...(map.data ?? {}) };
  data.pins = (data.pins ?? []).filter(p => p.shared);
  return { ...map, data };
}

function next500(e, res) {
  console.error('[maps]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
