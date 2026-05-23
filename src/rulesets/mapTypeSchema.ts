/**
 * Sprint 1 — types + helpers for the config-driven map-type schema.
 *
 * The shape of the JSON is intentionally permissive (each map-type can
 * carry its own field set + overrides); these helpers funnel everything
 * through a small, type-safe surface for `MapGenerator` and `specBuilder`.
 *
 * Naming bridge:
 *   - Schema field-keys are snake_case (e.g. "map_style", "poi_count").
 *   - The existing MapGenerator params object uses camelCase for legacy
 *     keys (mapType, mapStyle, poiCount) — see SCHEMA_TO_PARAM in
 *     MapGenerator.jsx for the lookup.
 *   - Map-type values from the live dropdown are legacy human labels
 *     ("City/Town", "Cave System"); LEGACY_TO_KEY maps them to the
 *     snake_case schema keys used everywhere else.
 */

import rawSchema from './mapTypeSchema.json';

// ── Types ────────────────────────────────────────────────────────────────────

export type MapTypeKey =
  | 'city'
  | 'village'
  | 'wilderness'
  | 'dungeon'
  | 'cave_system'
  | 'ruins'
  | 'temple'
  | 'castle'
  | 'building_interior';

/**
 * Map context — a coarse classifier that downstream features (Sprint 2:
 * daughter-map system, prompt-engineering) condition on. Wider than the
 * map-type itself: a Temple and a Castle both have context
 * "buildingInterior".
 */
export type MapContext =
  | 'world'
  | 'region'
  | 'wilderness'
  | 'settlement'
  | 'buildingExterior'
  | 'buildingInterior'
  | 'dungeon'
  | 'cave'
  | 'ruins'
  | 'sewer';

export interface FieldDefinition {
  type:           'select' | 'multi_chip' | 'textarea';
  label:          string;
  source?:        string;
  submap_only?:   boolean;
  max?:           number;
  options_global?: string[];
  options?:       Array<{ value: string; label: string }>;
  placeholder?:   string;
}

export interface MapTypeConfig {
  label:           string;
  context:         MapContext;
  fields:          string[];
  field_overrides?: Record<string, Partial<FieldDefinition>>;
}

// ── Raw access (filtering out $-prefixed metadata + _-prefixed defs) ─────────

interface RawSchema {
  $schema?:        string;
  $schema_version?: number;
  _field_definitions: Record<string, FieldDefinition>;
  [mapType: string]: unknown;
}

const SCHEMA = rawSchema as unknown as RawSchema;
const FIELD_DEFS = SCHEMA._field_definitions ?? {};

// ── Legacy bridge ────────────────────────────────────────────────────────────
//
// Existing DB rows + dropdown values use human-friendly labels like "City/Town"
// and "Cave System". The new schema keys these as snake_case slugs. Map both
// directions so older maps load cleanly and the backend keeps receiving the
// same labels it always has.

const LEGACY_TO_KEY: Record<string, MapTypeKey> = {
  // canonical schema keys (round-trip safety)
  'city':              'city',
  'village':           'village',
  'wilderness':        'wilderness',
  'dungeon':           'dungeon',
  'cave_system':       'cave_system',
  'ruins':             'ruins',
  'temple':            'temple',
  'castle':            'castle',
  'building_interior': 'building_interior',
  // legacy human labels (existing maps / dropdown values)
  'City/Town':         'city',
  'City':              'city',
  'Town':              'city',
  'Village':           'village',
  'Wilderness':        'wilderness',
  'Dungeon':           'dungeon',
  'Cave System':       'cave_system',
  'Ruins':             'ruins',
  'Castle/Keep':       'castle',
  'Castle':            'castle',
  'Castle/Fortress':   'castle',
  'Temple':            'temple',
  'Tavern/Inn':        'building_interior',
  'Building':          'building_interior',
  'Building Interior': 'building_interior',
  // Region (legacy, dropped from new schema) → closest fit
  'Region':            'wilderness',
};

const KEY_TO_LEGACY_LABEL: Record<MapTypeKey, string> = {
  city:              'City/Town',
  village:           'Village',
  wilderness:        'Wilderness',
  dungeon:           'Dungeon',
  cave_system:       'Cave System',
  ruins:             'Ruins',
  temple:            'Temple',
  castle:            'Castle/Fortress',
  building_interior: 'Building Interior',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

/** All map-type slugs, excluding metadata keys. Insertion order preserved. */
export function getMapTypeKeys(): MapTypeKey[] {
  const out: MapTypeKey[] = [];
  for (const key of Object.keys(SCHEMA)) {
    if (key.startsWith('$') || key.startsWith('_')) continue;
    out.push(key as MapTypeKey);
  }
  return out;
}

/** Full config for one map-type, or null if the slug is unknown. */
export function getMapTypeConfig(key: string | null | undefined): MapTypeConfig | null {
  if (!key) return null;
  const cfg = (SCHEMA as unknown as Record<string, unknown>)[key];
  if (!cfg || typeof cfg !== 'object') return null;
  return cfg as MapTypeConfig;
}

/**
 * Field definition for one field on one map-type, with map-type overrides
 * merged on top of the global definition. Returns null if the field doesn't
 * exist in the global registry.
 */
export function getFieldDefinition(mapType: string | null | undefined, fieldKey: string): FieldDefinition | null {
  const base = FIELD_DEFS[fieldKey];
  if (!base) return null;
  const cfg = getMapTypeConfig(mapType);
  const override = cfg?.field_overrides?.[fieldKey];
  if (!override) return { ...base };
  // Shallow-merge override on top of base. `options_global` and `options` are
  // explicitly handled — override replaces (doesn't concat).
  return { ...base, ...override };
}

/**
 * The visible fields for a map-type, in display order. When `isSubmap` is
 * true, the purpose field is appended after map_style (the Sprint 5B-b
 * convention). Top-level maps omit purpose entirely.
 */
export function getFieldsForMapType(mapType: string | null | undefined, isSubmap: boolean): string[] {
  const cfg = getMapTypeConfig(mapType);
  if (!cfg) return [];
  const base = cfg.fields.slice();
  if (!isSubmap) return base;
  if (base.includes('purpose')) return base;
  // Insert purpose immediately after map_style (or at index 0 if absent).
  const mapStyleIdx = base.indexOf('map_style');
  const insertAt = mapStyleIdx >= 0 ? mapStyleIdx + 1 : 0;
  base.splice(insertAt, 0, 'purpose');
  return base;
}

/** Map context for one map-type, defaulting to 'wilderness' on unknown. */
export function getMapContext(mapType: string | null | undefined): MapContext {
  return getMapTypeConfig(mapType)?.context ?? 'wilderness';
}

/**
 * Normalize a legacy or canonical map-type value to a schema slug. Returns
 * null if the value can't be mapped (caller falls back to 'wilderness' or
 * whatever its default is).
 */
export function normalizeMapType(value: string | null | undefined): MapTypeKey | null {
  if (!value) return null;
  return LEGACY_TO_KEY[value] ?? LEGACY_TO_KEY[value.toLowerCase()] ?? null;
}

/**
 * Inverse: map a schema slug back to its preferred legacy human label.
 * Used when the backend or existing prompt code still expects the
 * "City/Town"-style strings.
 */
export function mapTypeToLegacyLabel(key: MapTypeKey | string | null | undefined): string {
  const slug = normalizeMapType(key);
  return slug ? KEY_TO_LEGACY_LABEL[slug] : '';
}

/** All field-keys defined globally, useful for stale-param cleanup. */
export function getAllFieldKeys(): string[] {
  return Object.keys(FIELD_DEFS);
}
