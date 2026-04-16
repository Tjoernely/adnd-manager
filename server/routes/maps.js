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
const ARCHETYPE_RULES = require('../../src/rulesets/settlementArchetypes.json');
// mapTags.json is now { tags: [...], poi_influence_rules: {...} }
const MAP_TAGS_JSON   = require('../../src/rulesets/mapTags.json');
// tag → category lookup
const TAG_CATEGORY = (() => {
  const m = {};
  for (const entry of (MAP_TAGS_JSON.tags ?? MAP_TAGS_JSON)) m[entry.tag] = entry.category;
  return m;
})();
// POI influence rules
const POI_INFLUENCE_RULES = MAP_TAGS_JSON.poi_influence_rules ?? {};

// ── JS mirror of influenceEngine.ts ──────────────────────────────────────────

function getInfluenceForPOI(poi) {
  const key  = (poi.type ?? '').toLowerCase().trim();
  const rule = POI_INFLUENCE_RULES[key];
  if (!rule) return null;
  const provides_tags = {};
  for (const [cat, tags] of Object.entries(rule.provides_tags ?? {})) {
    if (Array.isArray(tags) && tags.length > 0) provides_tags[cat] = tags;
  }
  return { provides_tags, influence_radius: rule.radius ?? 'local' };
}

function applyPOIInfluencesJS(locationTags, pois) {
  const result = {};
  const CATS = ['terrain', 'origin', 'depth', 'environment', 'structure', 'hazards', 'special'];
  for (const c of CATS) result[c] = [...(locationTags[c] ?? [])];

  for (const poi of pois) {
    const influence = poi.influence ?? getInfluenceForPOI(poi);
    if (!influence) continue;
    for (const [cat, tags] of Object.entries(influence.provides_tags)) {
      if (!Array.isArray(tags) || !result[cat]) continue;
      for (const tag of tags) {
        if (!result[cat].includes(tag)) result[cat].push(tag);
      }
    }
  }
  return result;
}

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
const INH_SPECIAL = { undead: 'undead_presence', demons: 'planar_rift', fey: 'ley_line', cult: 'artifact_site', 'dragon lair': 'dragon_lair' };
const ERA_ORIGIN  = { ancient: 'ancient', 'forgotten ruins': 'ancient' };
const WATER_TERRAINS = new Set(['coastal', 'swamp', 'ocean', 'river', 'jungle']);

// ── Connection helpers (mirrors connectionEngine.ts) ──────────────────────────
// to_scope matches mapTypeToScope() so child generation gets correct scope.
const POI_CONN_MAP = {
  cave:         { type: 'tunnel',      to_scope: 'dungeon_level' },
  dungeon:      { type: 'stairs_down', to_scope: 'dungeon_level' },
  monster_lair: { type: 'tunnel',      to_scope: 'dungeon_level' },
  ruins:        { type: 'door',        to_scope: 'local'         },
  temple:       { type: 'door',        to_scope: 'building'      },
  city:         { type: 'tunnel',      to_scope: 'settlement'    },
  village:      { type: 'tunnel',      to_scope: 'settlement'    },
  building:     { type: 'door',        to_scope: 'building'      },
  interior:     { type: 'door',        to_scope: 'interior'      },
};

function defaultConnectionForPOI(poi) {
  const key     = (poi.drill_down_type ?? poi.type ?? '').toLowerCase();
  const mapping = POI_CONN_MAP[key] ?? { type: 'door', to_scope: 'interior' };
  return {
    id:             `conn_${poi.id}_0`,
    from_poi_id:    poi.id,
    to_location_id: poi.child_map_id ?? null,
    to_scope:       mapping.to_scope,
    type:           mapping.type,
    bidirectional:  true,
    state:          'open',
  };
}

// ── Settlement helpers (mirrors settlementEngine.ts) ─────────────────────────

function deriveArchetype(p) {
  const inh     = (p.inhabitants ?? '').toLowerCase();
  const atmo    = (p.atmosphere  ?? '').toLowerCase();
  const size    = (p.size        ?? '').toLowerCase();
  const terrain = (p.terrain     ?? []).map(t => t.toLowerCase());

  if (inh === 'cult')         return 'religious_center';
  if (inh === 'undead')       return 'ruins';
  if (inh === 'demons')       return 'ruins';
  if (inh === 'dragon lair')  return 'ruins';
  if (atmo === 'sacred')      return 'religious_center';
  if (atmo === 'abandoned')   return 'ruins';
  if (terrain.includes('coastal'))   return 'port_town';
  if (terrain.includes('mountains')) return 'mining_town';
  if (inh === 'humanoids' && atmo === 'dangerous') return 'military_outpost';
  if (size === 'small')       return 'farming_village';
  return 'trade_town';
}

function buildSettlementDataJS(p) {
  const rules    = ARCHETYPE_RULES;
  const archetype = deriveArchetype(p);
  const rule      = rules.archetypes[archetype];
  const allFeats  = rules.features;

  // Required features
  const selected = rule.required_features.filter(id => id in allFeats);

  // Up to 3 optional features (deterministic first-match)
  const optional = Object.keys(allFeats).filter(
    id => !selected.includes(id) && !rule.forbidden_features.includes(id),
  );
  let added = 0;
  for (const id of optional) {
    if (added >= 3) break;
    const feat = allFeats[id];
    if (!feat.requires.every(r => selected.includes(r))) continue;
    if (feat.forbidden.some(f => selected.includes(f))) continue;
    if (selected.some(s => allFeats[s]?.forbidden.includes(id))) continue;
    selected.push(id);
    added++;
  }

  const features = selected.map(id => ({ id, ...allFeats[id] }));

  // Districts: typical + feature preferred, dedup, max 6
  const seen = new Set();
  const districts = [];
  for (const d of [...rule.typical_districts, ...features.map(f => f.preferred_district)]) {
    if (!seen.has(d)) { seen.add(d); districts.push(d); }
    if (districts.length >= 6) break;
  }

  return { archetype, features, districts };
}

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

  // ── Settlement data ───────────────────────────────────────────────────────
  if (scope === 'settlement' && !data.settlement) {
    const settlement = buildSettlementDataJS(p);
    // Merge provides_tags from features into tags
    const tagsCopy = data.tags ? { ...data.tags } : EMPTY_TAGS();
    for (const feat of settlement.features) {
      for (const tag of (feat.provides_tags ?? [])) {
        // Find category from ARCHETYPE_RULES (not available here) — use static lookup
        const cat = TAG_CATEGORY[tag];
        if (cat && !tagsCopy[cat].includes(tag)) tagsCopy[cat].push(tag);
      }
    }
    // Merge archetype default_tags
    const archetypeEntry = ARCHETYPE_RULES.archetypes[settlement.archetype];
    for (const cat of ['origin', 'structure', 'environment']) {
      for (const tag of (archetypeEntry.default_tags[cat] ?? [])) {
        if (!tagsCopy[cat].includes(tag)) tagsCopy[cat].push(tag);
      }
    }
    data = { ...data, tags: tagsCopy, settlement };
  }

  // ── POI influence: each POI radiates tags into the location ─────────────────
  const pois = data.pois ?? [];
  if (pois.length > 0 && data.tags) {
    // Stamp influence on each POI (for transparency in GET response)
    for (const poi of pois) {
      const influence = getInfluenceForPOI(poi);
      if (influence) poi.influence = influence;
    }
    // Merge all POI influences into location tags
    data = { ...data, tags: applyPOIInfluencesJS(data.tags, pois) };
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
    // DEBUG — remove after verification
    if (baseData.spec) {
      console.log('[maps POST] spec received — keys:', Object.keys(baseData.spec).join(', '));
      console.log('[maps POST] spec.state:', baseData.spec.state,
        '| spec.poi_candidates:', JSON.stringify(baseData.spec.poi_candidates),
        '| spec.constraints:', JSON.stringify(baseData.spec.constraints));
    } else {
      console.log('[maps POST] WARNING: no spec in data');
    }
    const safeData   = enrichMapData(baseData, type);
    // DEBUG — verify spec survives enrichMapData
    if (safeData.spec) {
      console.log('[maps POST] spec after enrichMapData — state:', safeData.spec.state,
        '| poi_candidates:', JSON.stringify(safeData.spec.poi_candidates));
    } else {
      console.log('[maps POST] WARNING: spec lost after enrichMapData');
    }
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

    console.log(`[maps from-url] id=${req.params.id} type=${map.type} url=${url.substring(0, 80)}...`);

    // DEBUG — check fetch availability
    console.log(`[maps from-url] id=${req.params.id} fetch available: ${typeof fetch}`);

    // Download the image
    let response;
    try {
      response = await fetch(url);
    } catch (fetchErr) {
      console.error(`[maps from-url] id=${req.params.id} fetch() threw: ${fetchErr.message}`);
      return res.status(502).json({ error: `fetch failed: ${fetchErr.message}` });
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[maps from-url] id=${req.params.id} fetch failed: HTTP ${response.status} body=${body.substring(0, 200)}`);
      return res.status(502).json({ error: `Failed to fetch image: ${response.status}` });
    }

    const contentType = response.headers.get('content-type') ?? 'image/jpeg';
    const extMap = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif' };
    const ext = extMap[contentType.split(';')[0].trim()] ?? '.jpg';
    const filename = `map-${crypto.randomUUID()}${ext}`;
    const destPath = path.join(UPLOAD_DIR, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`[maps from-url] id=${req.params.id} saved ${buffer.length} bytes → ${filename}`);

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
    console.log(`[maps from-url] id=${req.params.id} DB updated image_url=${image_url}`);
    res.json(updated);
  } catch (e) {
    console.error(`[maps from-url] id=${req.params.id} FAILED:`, e.message);
    next500(e, res);
  }
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

    // DEBUG: trace image_url for every PUT so we can spot any overwrite
    console.log(`[maps PUT] id=${req.params.id} body.image_url=${JSON.stringify(req.body?.image_url)} db.image_url=${JSON.stringify(map.image_url)} resolved=${JSON.stringify(image_url)}`);
    console.log(`[maps PUT] id=${req.params.id} body.data.sketch.cells=${req.body?.data?.sketch?.cells?.length ?? 'MISSING'}`);

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
      // Inject defaults on each POI; auto-generate connection for drillable POIs
      pois: (enriched.pois ?? []).map(poi => {
        const basePoi = {
          ...poi,
          tags:        poi.tags        ?? EMPTY_TAGS(),
          state:       poi.state       ?? 'pristine',
          connections: poi.connections ?? [],
        };
        if (basePoi.can_drill_down && basePoi.connections.length === 0) {
          basePoi.connections = [defaultConnectionForPOI(basePoi)];
        }
        return basePoi;
      }),
    };

    console.log(`[maps PUT] id=${req.params.id} mergedData.sketch.cells=${mergedData?.sketch?.cells?.length ?? 'MISSING'}`);

    let updated = await db.one(
      `UPDATE maps
       SET name=$1, type=$2, image_url=$3, data=$4,
           parent_map_id=$5, parent_poi_id=$6, updated_at=NOW()
       WHERE id=$7
       RETURNING id, campaign_id, name, type, image_url, data,
                 parent_map_id, parent_poi_id, created_at, updated_at`,
      [name.trim(), type, image_url, JSON.stringify(mergedData),
       parent_map_id || null, parent_poi_id || null, req.params.id],
    );

    // Belt-and-suspenders: if body contained sketch cells, ensure they are
    // written via jsonb_set so they are never dropped by enrichMapData spreads.
    const sketchFromBody = req.body?.data?.sketch;
    if (sketchFromBody?.cells?.length > 0) {
      console.log(`[maps PUT] id=${req.params.id} jsonb_set fallback — patching ${sketchFromBody.cells.length} cells`);
      updated = await db.one(
        `UPDATE maps
         SET data = jsonb_set(data::jsonb, '{sketch}', $1::jsonb, true),
             updated_at = NOW()
         WHERE id = $2
         RETURNING id, campaign_id, name, type, image_url, data,
                   parent_map_id, parent_poi_id, created_at, updated_at`,
        [JSON.stringify(sketchFromBody), req.params.id],
      );
      console.log(`[maps PUT] id=${req.params.id} jsonb_set done — cells now in DB: ${updated.data?.sketch?.cells?.length ?? '?'}`);
    }

    res.json(updated);
  } catch (e) { next500(e, res); }
});

// ── Patch sketch data directly via jsonb_set (DM only) ───────────────────────
// PUT /api/maps/:id/sketch  { sketchSpec: {...} }
// Uses jsonb_set so only data->sketch is touched — all other data fields preserved.
router.put('/:id/sketch', auth, async (req, res) => {
  try {
    const map = await db.one('SELECT campaign_id FROM maps WHERE id=$1', [req.params.id]);
    if (!map) return res.status(404).json({ error: 'Not found' });
    if (!(await isDM(map.campaign_id, req.user.id)))
      return res.status(403).json({ error: 'DM only' });

    const { sketchSpec } = req.body ?? {};
    if (!sketchSpec) return res.status(400).json({ error: 'sketchSpec required' });

    const cells = sketchSpec.cells ?? [];
    console.log(`[maps PUT sketch] id=${req.params.id} cells=${cells.length} overlays=${(sketchSpec.overlays ?? []).length}`);

    const updated = await db.one(
      `UPDATE maps
       SET data = jsonb_set(data::jsonb, '{sketch}', $1::jsonb, true),
           updated_at = NOW()
       WHERE id = $2
       RETURNING id, data->'sketch'->'cells' AS sketch_cells_check`,
      [JSON.stringify(sketchSpec), req.params.id],
    );
    const savedCount = Array.isArray(updated.sketch_cells_check) ? updated.sketch_cells_check.length : '?';
    console.log(`[maps PUT sketch] id=${req.params.id} saved — cells in DB: ${savedCount}`);
    res.json({ ok: true, cells_saved: savedCount });
  } catch (e) {
    console.error(`[maps PUT sketch] id=${req.params.id} FAILED:`, e.message);
    next500(e, res);
  }
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

// ── Sketch-generation async job store ────────────────────────────────────────
// In-memory map: jobId → { status, imageUrl, renderer_used, error, createdAt }
// Jobs expire after 30 minutes; cleanup runs every 10 minutes.

const { getRenderer } = require('../lib/mapRenderers/rendererFactory');

const sketchJobs = new Map();

setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, job] of sketchJobs) {
    if (job.createdAt < cutoff) sketchJobs.delete(id);
  }
}, 10 * 60 * 1000);

// ── Build prompt additions from a sketchSpec ──────────────────────────────────
function buildPromptAdditions(sketchSpec) {
  const cells = sketchSpec.cells ?? [];
  const biomeCounts = {};
  for (const c of cells) biomeCounts[c.biome] = (biomeCounts[c.biome] ?? 0) + 1;
  const topBiomes = Object.entries(biomeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([b]) => b);

  const BIOME_LABEL = {
    plains:'plains', forest:'dense forest', swamp:'swamp', desert:'desert',
    tundra:'tundra', volcanic:'volcanic wasteland', ocean:'ocean', coastal:'coastal shores',
    mountains:'mountains', hills:'rolling hills',
  };

  const overlayLabels = [...new Set((sketchSpec.overlays ?? []).map(o => o.type))];
  const modLabels     = [...new Set((sketchSpec.modifiers ?? []).map(m => m.type.replace(/_/g, ' ')))];

  const parts = [`Terrain: ${topBiomes.map(b => BIOME_LABEL[b] ?? b).join(', ')}`];
  if (overlayLabels.length) parts.push(`Features: ${overlayLabels.join(', ')}`);
  if (modLabels.length)     parts.push(`Special: ${modLabels.join(', ')}`);
  if (sketchSpec.climate)   parts.push(`Climate: ${sketchSpec.climate}`);
  if (sketchSpec.lore_mode) parts.push('historical lore, aged cartographic style');
  if (sketchSpec.user_prompt) parts.push(sketchSpec.user_prompt);

  return parts.join('. ');
}

// ── POST /api/maps/generate-from-sketch ──────────────────────────────────────
// Starts a background generation job and returns { jobId } immediately.
// Body: { sketchSpec, renderer?, controlImage, stylePreset?, userPrompt? }

router.post('/generate-from-sketch', auth, (req, res) => {
  const {
    sketchSpec,
    renderer:     rendererName = 'auto',
    controlImage,
    stylePreset   = 'schley',
    userPrompt    = '',
    aiFredom      = 'balanced',
  } = req.body ?? {};

  console.log('[server] req.body keys:', Object.keys(req.body ?? {}));
  console.log('[server] sketchSpec received:', req.body?.sketchSpec?.cells?.length);
  console.log('[server] controlImage length:', req.body?.controlImage?.length);

  if (!sketchSpec) return res.status(400).json({ error: 'sketchSpec required' });
  if (!controlImage || typeof controlImage !== 'string')
    return res.status(400).json({ error: 'controlImage (base64 PNG) required' });

  const cells = sketchSpec.cells ?? [];
  console.log(`[generate-from-sketch] received sketchSpec — cells=${cells.length} overlays=${(sketchSpec.overlays ?? []).length} body_keys=${Object.keys(req.body ?? {}).join(',')}`);
  if (!Array.isArray(cells) || cells.length === 0)
    return res.status(400).json({ error: 'Sketch has no painted cells — paint some terrain first' });

  // Validate renderer is available before queuing
  let renderer;
  try {
    renderer = getRenderer(rendererName);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }

  const jobId = crypto.randomUUID();
  sketchJobs.set(jobId, { status: 'pending', createdAt: Date.now() });

  console.log(`[generate-from-sketch] job=${jobId} renderer=${renderer.name} style=${stylePreset} cells=${cells.length}`);
  res.json({ jobId, status: 'pending' });

  // Run generation in background — do not await
  (async () => {
    const controlFilename = `sketch-control-${crypto.randomUUID()}.png`;
    const controlPath     = path.join(UPLOAD_DIR, controlFilename);
    try {
      const base64Data = controlImage.replace(/^data:image\/[^;]+;base64,/, '');
      fs.writeFileSync(controlPath, Buffer.from(base64Data, 'base64'));

      const outputPath     = await renderer.render(controlPath, stylePreset, userPrompt, sketchSpec, aiFredom);
      const localImageUrl  = `/uploads/maps/${path.basename(outputPath)}`;

      sketchJobs.set(jobId, {
        status:        'succeeded',
        imageUrl:      localImageUrl,
        renderer_used: renderer.name,
        spec:          sketchSpec,
        createdAt:     sketchJobs.get(jobId)?.createdAt ?? Date.now(),
      });
      console.log(`[job-worker] ${jobId} succeeded — ${localImageUrl}`);
    } catch (err) {
      console.error(`[job-worker] ${jobId} failed:`, err.message);
      sketchJobs.set(jobId, {
        status:    'failed',
        error:     err.message,
        createdAt: sketchJobs.get(jobId)?.createdAt ?? Date.now(),
      });
    } finally {
      // Clean up temporary control image
      try { fs.unlinkSync(controlPath); } catch {}
    }
  })();
});

// ── GET /api/maps/sketch-job/:jobId ──────────────────────────────────────────
// Poll for job status. Returns { status, imageUrl?, renderer_used?, error? }

router.get('/sketch-job/:jobId', auth, (req, res) => {
  const job = sketchJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json(job);
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
