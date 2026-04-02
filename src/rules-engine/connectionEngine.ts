/**
 * src/rules-engine/connectionEngine.ts
 *
 * Pure functions for working with MapConnection objects.
 * Used by MapManager (frontend) and mirrored in maps.js (server).
 *
 * No React, no side effects.
 */

import type {
  MapConnection,
  MapScope,
  LocationTags,
  LocationContext,
} from './mapTypes';
import type { GeneratedParams } from './generationMapper';

// ── Connection type + target scope for each POI type ─────────────────────────
// to_scope matches mapTypeToScope() output so getChildGenerationParams can
// suggest the correct mapType for generation.

const POI_CONN_MAP: Record<string, { type: MapConnection['type']; to_scope: MapScope }> = {
  cave:          { type: 'tunnel',      to_scope: 'dungeon_level' },
  dungeon:       { type: 'stairs_down', to_scope: 'dungeon_level' },
  monster_lair:  { type: 'tunnel',      to_scope: 'dungeon_level' },
  ruins:         { type: 'door',        to_scope: 'local'         },
  temple:        { type: 'door',        to_scope: 'building'      },
  city:          { type: 'tunnel',      to_scope: 'settlement'    },
  village:       { type: 'tunnel',      to_scope: 'settlement'    },
  building:      { type: 'door',        to_scope: 'building'      },
  interior:      { type: 'door',        to_scope: 'interior'      },
};

const DEFAULT_CONN = { type: 'door' as const, to_scope: 'interior' as MapScope };

// ── defaultConnectionForPOI ────────────────────────────────────────────────────

export function defaultConnectionForPOI(poi: {
  type:            string;
  drill_down_type?: string | null;
  id:              string;
  child_map_id?:   number | null;
}): MapConnection {
  const key     = (poi.drill_down_type ?? poi.type ?? '').toLowerCase();
  const mapping = POI_CONN_MAP[key] ?? DEFAULT_CONN;

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

// ── getConnectionTarget ────────────────────────────────────────────────────────

export function getConnectionTarget(connection: MapConnection): {
  scope:       MapScope;
  exists:      boolean;
  location_id: number | null;
} {
  return {
    scope:       connection.to_scope,
    exists:      connection.to_location_id !== null,
    location_id: connection.to_location_id,
  };
}

// ── to_scope → mapType string (for MapGenerator params.mapType) ───────────────

const SCOPE_TO_MAP_TYPE: Partial<Record<MapScope, string>> = {
  dungeon_level: 'Dungeon',
  settlement:    'City/Town',
  building:      'Temple',
  interior:      'Tavern/Inn',
  local:         'Ruins',
  region:        'Region',
};

// ── getChildGenerationParams ───────────────────────────────────────────────────
// Suggests GeneratedParams for a child map based on parent context + connection.
// Returns Partial — caller merges with existing presetType (which takes priority
// for mapType when the POI has an explicit drill_down_type).

export function getChildGenerationParams(
  parentLocation: {
    scope:   MapScope;
    tags:    LocationTags;
    context: LocationContext;
  },
  connection: MapConnection,
): Partial<GeneratedParams> {
  const result: Partial<GeneratedParams> = {};

  // mapType from connection target scope
  const mapType = SCOPE_TO_MAP_TYPE[connection.to_scope];
  if (mapType) result.mapType = mapType;

  // terrain from parent context (capitalise to match TERRAIN_OPTIONS)
  const rawTerrain = parentLocation.context.terrain;
  if (rawTerrain && rawTerrain !== 'unknown') {
    const cap = rawTerrain.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    result.terrain = [cap];
  }

  // atmosphere derived from parent environment/special tags
  const env     = parentLocation.tags.environment ?? [];
  const special = parentLocation.tags.special     ?? [];

  if (env.includes('necrotic') || special.includes('undead_presence')) {
    result.atmosphere = 'Abandoned';
  } else if (env.includes('consecrated')) {
    result.atmosphere = 'Sacred';
  } else if (env.includes('unstable_magic') || special.includes('ley_line') || special.includes('planar_rift')) {
    result.atmosphere = 'Enchanted';
  }

  // inhabitants from parent special tags
  if (special.includes('undead_presence')) {
    result.inhabitants = 'Undead';
  } else if (special.includes('dragon_lair')) {
    result.inhabitants = 'Dragon Lair';
  }

  return result;
}
