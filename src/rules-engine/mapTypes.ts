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

// ── Settlement system ─────────────────────────────────────────────────────────

export type SettlementArchetype =
  | 'mining_town'
  | 'trade_town'
  | 'religious_center'
  | 'military_outpost'
  | 'farming_village'
  | 'port_town'
  | 'ruins';

export type SettlementDistrict =
  | 'market'
  | 'residential'
  | 'industrial'
  | 'religious'
  | 'noble'
  | 'slums'
  | 'military'
  | 'docks';

export interface SettlementFeature {
  id:                 string;
  name:               string;
  category:           'economic' | 'religious' | 'military' | 'civic' | 'criminal' | 'arcane';
  requires:           string[];
  forbidden:          string[];
  provides_tags:      string[];
  preferred_district: SettlementDistrict;
}

export interface SettlementData {
  archetype: SettlementArchetype;
  features:  SettlementFeature[];
  districts: SettlementDistrict[];
}

// ── Extended Location (map-level data additions) ──────────────────────────────

export interface LocationExtended {
  scope:       MapScope;
  context:     LocationContext;
  tags:        LocationTags;
  state:       LocationState;
  settlement?: SettlementData;
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

// ── MapSpec (image generation specification) ──────────────────────────────────
// Built from generated_params + world-engine data + Claude metadata.
// Passed to buildImagePrompt() for deterministic DALL-E prompt construction.
// Optionally enriched by enrichSpecWithAI() when user_description is present.

export interface MapSpec {
  // Core generation params
  mapType:     string;
  scope:       MapScope;
  size:        string;
  terrain:     string[];
  atmosphere:  string;
  era:         string;
  inhabitants: string;

  // World-engine data
  tags:        LocationTags;
  context:     LocationContext;
  settlement?: SettlementData;

  // Claude metadata
  title:                   string;
  dalle_prompt_additions?: string;

  // User input (optional — triggers AI enrichment when set)
  user_description?: string;

  // AI enrichment (populated by applyEnrichment after enrichSpecWithAI call)
  visual_keywords?:  string[];
  landmark_details?: string[];
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:  boolean;
  errors: string[];
}
