/**
 * /api/maps
 *   GET    /              — list maps for a campaign (DM: all; player: visible only)
 *   GET    /:id           — single map
 *   POST   /              — create map (DM only)
 *   POST   /:id/image     — upload/replace map image (DM only, multipart)
 *   PUT    /:id           — update metadata + data/pois (DM only)
 *   DELETE /:id           — delete map + nullify child parent refs (DM only)
 *
 * POIs stored inside data.pois[] as JSONB.
 * Each POI: { id, name, type, x_percent, y_percent, is_dm_only,
 *             short_description, dm_description, history, current_situation,
 *             encounters, treasure, secrets, can_drill_down, drill_down_type,
 *             quest_hooks[], child_map_id }
 * Legacy pins in data.pins[] still supported.
 * Players see: maps where data.visible_to_players === true,
 *              pois where !is_dm_only, pins where shared === true.
 *
 * Hierarchy: parent_map_id → parent map, parent_poi_id → which POI spawned this map.
 */

const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const crypto  = require('crypto');
const db      = require('../db');
const { auth } = require('../middleware/auth');

const router = express.Router();

// ── Auto-migrate: add hierarchy columns if missing ────────────────────────────
;(async () => {
  try {
    await db.query(`
      ALTER TABLE maps ADD COLUMN IF NOT EXISTS
        parent_map_id INTEGER REFERENCES maps(id) ON DELETE SET NULL;
      ALTER TABLE maps ADD COLUMN IF NOT EXISTS
        parent_poi_id VARCHAR(255);
    `);
  } catch (e) {
    console.warn('[maps] Migration note:', e.message);
  }
})();

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

// ── Server-side world-engine enrichment ───────────────────────────────────────
// Mirrors generationMapper.ts logic but in plain JS for the server.
// Applied on both POST (create) and PUT (update) so data is always enriched
// regardless of whether the frontend sent the fields.

const EMPTY_TAGS = () => ({ terrain: [], origin: [], depth: [], environment: [], structure: [], hazards: [], special: [] });

const MAP_TYPE_TO_SCOPE = {
  world: 'world', region: 'region',
  'city/town': 'settlement', city: 'settlement', town: 'settlement', village: 'settlement',
  dungeon: 'dungeon_level', 'cave system': 'dungeon_level',
  ruins: 'local',
  'castle/keep': 'building', temple: 'building',
  'tavern/inn': 'interior', interior: 'interior', building: 'interior',
};
// backend type → scope fallback
const BACKEND_TYPE_TO_SCOPE = {
  world: 'world', region: 'region', city: 'settlement', town: 'settlement',
  dungeon: 'dungeon_level', interior: 'interior', encounter: 'local', other: 'local',
};
const TERRAIN_TAG = {
  mountains: 'mountainous', hills: 'mountainous',
  forest: 'forested', 'dense forest': 'forested', jungle: 'forested',
  plains: 'plains', desert: 'desert', swamp: 'swamp',
  tundra: 'tundra', coastal: 'coastal', underground: 'subterranean',
};
const TERRAIN_BIOME = {
  mountains: 'alpine', hills: 'highland',
  forest: 'temperate_forest', 'dense forest': 'temperate_forest', jungle: 'tropical',
  plains: 'grassland', desert: 'arid', swamp: 'wetland',
  tundra: 'arctic', coastal: 'coastal', underground: 'subterranean',
};
const ATMO_ENV    = { cursed: 'necrotic', sacred: 'consecrated', enchanted: 'unstable_magic', abandoned: 'necrotic' };
const ATMO_STRUCT = { abandoned: 'ruined', ancient: 'ruined' };
const INH_ORIGIN  = { humanoids: 'constructed', undead: 'undead_built', demons: 'arcane_nexus', fey: 'elven', 'dragon lair': 'ancient', cult: 'constructed' };
const INH_SPECIAL = { demons: 'planar_rift', fey: 'ley_line', cult: 'artifact_site' };
const ERA_ORIGIN  = { ancient: 'ancient', 'forgotten ruins': 'ancient' };
const WATER_TERRAINS = new Set(['coastal', 'swamp', 'ocean', 'river', 'jungle']);

function enrichMapData(data, backendType) {
  const p = data.generated_params;
  if (!p) return data; // no generated_params → nothing to derive

  const mapTypeLower = (p.mapType ?? '').toLowerCase().trim();
  const scope = data.scope
    ?? MAP_TYPE_TO_SCOPE[mapTypeLower]
    ?? BACKEND_TYPE_TO_SCOPE[backendType]
    ?? 'region';

  // context
  const primaryTerrain = (p.terrain?.[0] ?? 'unknown').toLowerCase();
  const context = data.context ?? {
    terrain:      primaryTerrain,
    biome:        TERRAIN_BIOME[primaryTerrain],
    water_access: (p.terrain ?? []).some(t => WATER_TERRAINS.has(t.toLowerCase())) || undefined,
  };

  // tags
  if (!data.tags) {
    const tags = EMPTY_TAGS();
    for (const t of (p.terrain ?? [])) {
      const tag = TERRAIN_TAG[t.toLowerCase()];
      if (tag && !tags.terrain.includes(tag)) tags.terrain.push(tag);
    }
    if (scope === 'dungeon_level' || scope === 'interior') {
      if (!tags.terrain.includes('subterranean')) tags.terrain.push('subterranean');
      if (!tags.environment.includes('dark'))     tags.environment.push('dark');
    }
    const eraTag  = ERA_ORIGIN[(p.era ?? '').toLowerCase()];
    const inhOrig = INH_ORIGIN[(p.inhabitants ?? '').toLowerCase()];
    if (eraTag  && !tags.origin.includes(eraTag))  tags.origin.push(eraTag);
    if (inhOrig && !tags.origin.includes(inhOrig)) tags.origin.push(inhOrig);
    if (['settlement','building','interior'].includes(scope) && !tags.origin.includes('constructed'))
      tags.origin.push('constructed');
    const envTag    = ATMO_ENV[(p.atmosphere ?? '').toLowerCase()];
    if (envTag && !tags.environment.includes(envTag)) tags.environment.push(envTag);
    const structTag = ATMO_STRUCT[(p.atmosphere ?? '').toLowerCase()];
    if (structTag && !tags.structure.includes(structTag)) tags.structure.push(structTag);
    if (mapTypeLower === 'castle/keep') {
      if (!tags.structure.includes('fortified')) tags.structure.push('fortified');
      if (!tags.origin.includes('constructed'))  tags.origin.push('constructed');
    }
    if (scope === 'dungeon_level' && !tags.depth.includes('shallow_underground'))
      tags.depth.push('shallow_underground');
    const specialTag = INH_SPECIAL[(p.inhabitants ?? '').toLowerCase()];
    if (specialTag && !tags.special.includes(specialTag)) tags.special.push(specialTag);
    data = { ...data, tags };
  }

  return { ...data, scope, context, state: data.state ?? 'pristine' };
}

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
        `SELECT id, campaign_id, name, type, image_url, data,
                parent_map_id, parent_poi_id, created_at, updated_at
         FROM maps WHERE campaign_id=$1 ORDER BY created_at`,
        [campaign_id],
      );
    } else {
      const all = await db.all(
        `SELECT id, campaign_id, name, type, image_url, data,
                parent_map_id, parent_poi_id, created_at, updated_at
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
    const map = await db.one(
      `SELECT id, campaign_id, name, type, image_url, data,
              parent_map_id, parent_poi_id, created_at, updated_at
       FROM maps WHERE id=$1`, [req.params.id],
    );
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
    const {
      campaign_id, name,
      type          = 'dungeon',
      image_url     = null,
      data          = {},
      parent_map_id = null,
      parent_poi_id = null,
    } = req.body ?? {};

    if (!campaign_id || !name)
      return res.status(400).json({ error: 'campaign_id and name required' });
    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    if (!(await isDM(campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const baseData   = { visible_to_players: false, pins: [], pois: [], ...data };
    const safeData   = enrichMapData(baseData, type);
    const map = await db.one(
      `INSERT INTO maps (campaign_id, name, type, image_url, data, parent_map_id, parent_poi_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [campaign_id, name.trim(), type, image_url, JSON.stringify(safeData),
       parent_map_id || null, parent_poi_id || null],
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
      `UPDATE maps SET image_url=$1, updated_at=NOW() WHERE id=$2
       RETURNING id, campaign_id, name, type, image_url, data,
                 parent_map_id, parent_poi_id, created_at, updated_at`,
      [image_url, req.params.id],
    );
    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Persist DALL-E (or any temporary) image URL to disk (DM only) ────────────
// POST /api/maps/:id/image/from-url  { url: "<temporary-url>" }
// Downloads the image server-side, saves to UPLOAD_DIR, updates image_url.
router.post('/:id/image/from-url', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT * FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const { url } = req.body ?? {};
    if (!url || typeof url !== 'string') return res.status(400).json({ error: 'url required' });

    // Download the image
    const response = await fetch(url);
    if (!response.ok) return res.status(502).json({ error: `Failed to fetch image: ${response.status}` });

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    const ext = extMap[contentType.split(';')[0].trim()] ?? '.jpg';
    const filename = `map-${crypto.randomUUID()}${ext}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    // Delete old local image if present
    if (map.image_url?.startsWith('/uploads/maps/')) {
      const oldPath = path.join(__dirname, '../public', map.image_url);
      fs.unlink(oldPath, () => {});
    }

    const image_url = `/uploads/maps/${filename}`;
    const updated = await db.one(
      `UPDATE maps SET image_url=$1, updated_at=NOW() WHERE id=$2
       RETURNING id, campaign_id, name, type, image_url, data,
                 parent_map_id, parent_poi_id, created_at, updated_at`,
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
      name          = map.name,
      type          = map.type,
      image_url     = map.image_url,
      data          = map.data,
      parent_map_id = map.parent_map_id,
      parent_poi_id = map.parent_poi_id,
    } = req.body ?? {};

    if (!VALID_TYPES.includes(type))
      return res.status(400).json({ error: `type must be one of: ${VALID_TYPES.join(', ')}` });

    // ── World-engine: enrich with scope/context/tags from generated_params ───
    const enriched   = enrichMapData(data, type);
    const mergedData = {
      ...enriched,
      // Ensure these minimal defaults even if no generated_params
      tags:    enriched.tags    ?? EMPTY_TAGS(),
      state:   enriched.state   ?? 'pristine',
      context: enriched.context ?? { terrain: 'unknown' },
      scope:   enriched.scope   ?? BACKEND_TYPE_TO_SCOPE[type] ?? 'local',
      // Inject defaults on each POI without touching existing fields
      pois: (enriched.pois ?? []).map(poi => ({
        ...poi,
        tags:        poi.tags        ?? EMPTY_TAGS(),
        state:       poi.state       ?? 'pristine',
        connections: poi.connections ?? [],
      })),
    };

    const updated = await db.one(
      `UPDATE maps
       SET name=$1, type=$2, image_url=$3, data=$4,
           parent_map_id=$5, parent_poi_id=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING id, campaign_id, name, type, image_url, data,
                 parent_map_id, parent_poi_id, created_at, updated_at`,
      [name.trim(), type, image_url, JSON.stringify(mergedData),
       parent_map_id || null, parent_poi_id || null, req.params.id],
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

    // Nullify parent refs of children (FK ON DELETE SET NULL also handles this)
    await db.query('UPDATE maps SET parent_map_id=NULL WHERE parent_map_id=$1', [req.params.id]);
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
  data.pins = (data.pins ?? []).filter(p => p.shared);           // legacy pins
  data.pois = (data.pois ?? []).filter(p => !p.is_dm_only);      // new POI system
  // Strip DM-only fields from pois
  data.pois = data.pois.map(p => ({
    id: p.id, name: p.name, type: p.type,
    x_percent: p.x_percent, y_percent: p.y_percent,
    short_description: p.short_description,
    quest_hooks: p.quest_hooks,
    can_drill_down: p.can_drill_down,
    child_map_id: p.child_map_id,
  }));
  // Strip DM-only map metadata
  const { secrets, plot_hooks, random_encounter_table, ...publicData } = data;
  return { ...map, data: publicData };
}

function next500(e, res) {
  console.error('[maps]', e.message);
  res.status(500).json({ error: 'Server error' });
}

module.exports = router;
