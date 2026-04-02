/**
 * src/rules-engine/mapTypes.ts
 *
 * Core type definitions for the context-driven world engine.
 * Pure types — no runtime code.
 */

// ── Scope ─────────────────────────────────────────────────────────────────────

export type MapScope =
  | 'world'
  | 'region'
  | 'local'
  | 'settlement'
  | 'district'
  | 'building'
  | 'interior'
  | 'dungeon_level';

// ── Tags ──────────────────────────────────────────────────────────────────────

export interface LocationTags {
  terrain:     string[];
  origin:      string[];
  depth:       string[];
  environment: string[];
  structure:   string[];
  hazards:     string[];
  special:     string[];
  [key: string]: string[];
}

// ── Context ───────────────────────────────────────────────────────────────────

export interface LocationContext {
  terrain:       string;
  biome?:        string;
  water_access?: boolean;
}

// ── Connections ───────────────────────────────────────────────────────────────

export type ConnectionType =
  | 'stairs_down'
  | 'stairs_up'
  | 'tunnel'
  | 'portal'
  | 'door'
  | 'ladder'
  | 'secret_passage';

export type ConnectionState = 'open' | 'locked' | 'blocked' | 'secret';

export interface MapConnection {
  id:              string;
  from_poi_id:     string;
  to_location_id:  number | null;
  to_scope:        MapScope;
  type:            ConnectionType;
  bidirectional:   boolean;
  state:           ConnectionState;
}

// ── Location / POI state ──────────────────────────────────────────────────────

export type LocationState = 'pristine' | 'abandoned' | 'occupied' | 'cleared';

// ── Extended POI (added fields on top of existing POI shape) ──────────────────

export interface MapPOIExtended {
  scope?:      MapScope;
  tags:        LocationTags;
  origin:      'terrain' | 'feature' | 'history' | 'connection';
  state:       LocationState;
  connections: MapConnection[];
}

// ── Extended Location (map-level data additions) ──────────────────────────────

export interface LocationExtended {
  scope:   MapScope;
  context: LocationContext;
  tags:    LocationTags;
  state:   LocationState;
}

// ── Ruleset types ─────────────────────────────────────────────────────────────

export interface TagRule {
  tag:           string;
  category:      keyof LocationTags;
  valid_scopes:  MapScope[];
  requires:      string[];
  forbidden:     string[];
  adds_tags:     string[];
}

export interface ScopeRule {
  scope:                    MapScope;
  allowed_child_scopes:     MapScope[];
  allowed_tag_categories:   (keyof LocationTags)[];
  forbidden_tag_categories: (keyof LocationTags)[];
  allowed_poi_types:        string[];
  forbidden_poi_types:      string[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}
