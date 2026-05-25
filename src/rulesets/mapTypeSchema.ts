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

/**
 * One option in a select-field's options_global list. Strings are allowed
 * for simple cases (e.g. "Random", "Medium"). Sprint 6 introduced the object
 * form so settlement_role can carry compatible_populations gating.
 */
export type FieldOption =
  | string
  | {
      value: string;
      label: string;
      /**
       * Sprint 6 — settlement_role gating. "*" means available for every
       * population; an array lists the population slugs (hamlet, village,
       * town, small_city, large_city, metropolis) the role is appropriate
       * for. UI filters the dropdown and auto-resets incompatible picks.
       */
      compatible_populations?: '*' | string[];
    };

export interface FieldDefinition {
  type:           'select' | 'multi_chip' | 'textarea';
  label:          string;
  source?:        string;
  submap_only?:   boolean;
  max?:           number;
  options_global?: FieldOption[];
  options?:       Array<{ value: string; label: string }>;
  placeholder?:   string;
}

/**
 * Sprint 6 — recommended + hard cap POI counts for one (mapType, population)
 * combination. Tier resolver falls back through:
 *   1. by_population[popSlug]   2. .default   3. _poi_count_tiers._default
 */
export interface PoiCountTier {
  recommended: [number, number];
  hard_cap:    number;
}

export interface MapTypeConfig {
  label:           string;
  context:         MapContext;
  fields:          string[];
  field_overrides?: Record<string, Partial<FieldDefinition>>;
  /** Sprint 6 — default image dimensions for this map-type (e.g. "1024x1024"). */
  default_image_size?: string;
  /**
   * Sprint 6 — per-population overrides for settlements. Looked up by the
   * population slug from normalizePopulation (hamlet, village, town,
   * small_city, large_city, metropolis). Falls back to default_image_size.
   */
  image_sizes_by_population?: Record<string, string>;
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

/**
 * Full config for one map-type, or null if the slug is unknown. Accepts BOTH
 * canonical schema slugs ('city') and legacy human labels ('City/Town') —
 * needed because params.mapType is the legacy label and DynamicField reaches
 * here every render. Without this normalisation field_overrides (Population
 * options, Terrain.max) silently never get applied.
 */
export function getMapTypeConfig(key: string | null | undefined): MapTypeConfig | null {
  if (!key) return null;
  const schemaMap = SCHEMA as unknown as Record<string, unknown>;
  const slug = schemaMap[key] ? key : normalizeMapType(key);
  if (!slug) return null;
  const cfg = schemaMap[slug];
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

// ── Sprint 6 — Settlement Role × Population gating ───────────────────────────
//
// Filter the settlement_role options to those compatible with the given
// population slug. Roles with compatible_populations === "*" or undefined
// stay available for every population (Random is the prime example).
// String-only options (legacy form) pass through unchanged.

export function isRoleCompatibleWithPopulation(opt: FieldOption, popSlug: string): boolean {
  if (typeof opt === 'string') return true;
  const cp = opt.compatible_populations;
  if (cp == null || cp === '*') return true;
  if (!Array.isArray(cp)) return true;
  return cp.includes(popSlug);
}

/**
 * Pre-filtered list of {value, label} for the settlement_role dropdown, given
 * the current population. Always includes Random as the first option even if
 * the schema author forgot it.
 */
export function getCompatibleRoleOptions(popSlug: string): Array<{ value: string; label: string }> {
  const def = FIELD_DEFS.settlement_role;
  const opts = def?.options_global ?? [];
  return opts
    .filter(o => isRoleCompatibleWithPopulation(o, popSlug))
    .map(o => typeof o === 'string' ? { value: o, label: o } : { value: o.value, label: o.label });
}

// ── Sprint 6 — Image size resolution ─────────────────────────────────────────

/**
 * Resolve gpt-image-1 image dimensions for a (mapType, population) pair.
 * mapType is a legacy label or slug; population is a slug (or label — we
 * pass the label straight through to normalizePopulation in the caller).
 * Falls back to '1024x1024' when the schema doesn't specify.
 */
export function resolveImageSize(mapType: string | null | undefined, popSlug: string | null | undefined): string {
  const cfg = getMapTypeConfig(mapType);
  if (!cfg) return '1024x1024';
  if (popSlug && cfg.image_sizes_by_population?.[popSlug]) {
    return cfg.image_sizes_by_population[popSlug];
  }
  return cfg.default_image_size ?? '1024x1024';
}

// ── Sprint 6 — POI-count tiers ───────────────────────────────────────────────

const TIERS = (SCHEMA as unknown as Record<string, unknown>)._poi_count_tiers as
  | Record<string, unknown>
  | undefined;

const FALLBACK_TIER: PoiCountTier = { recommended: [6, 10], hard_cap: 15 };

/**
 * Returns the recommended POI count range + hard cap for the given map-type
 * and population. Lookup order:
 *   1. tiers[mapTypeSlug].by_population[popSlug]   (settlement-style)
 *   2. tiers[mapTypeSlug].default                  (settlement fallback)
 *   3. tiers[mapTypeSlug]                          (flat shape)
 *   4. tiers._default                              (global)
 *   5. hardcoded FALLBACK_TIER                     (safety net)
 */
export function getPoiCountTier(
  mapType:  string | null | undefined,
  popSlug:  string | null | undefined,
): PoiCountTier {
  if (!TIERS) return FALLBACK_TIER;
  const slug = normalizeMapType(mapType);
  if (slug) {
    const entry = TIERS[slug] as Record<string, unknown> | undefined;
    if (entry) {
      const byPop = entry.by_population as Record<string, PoiCountTier> | undefined;
      if (byPop && popSlug && byPop[popSlug]) return byPop[popSlug];
      if (entry.default) return entry.default as PoiCountTier;
      if (entry.recommended && entry.hard_cap != null) {
        return entry as unknown as PoiCountTier;
      }
    }
  }
  const def = TIERS._default as PoiCountTier | undefined;
  return def ?? FALLBACK_TIER;
}
