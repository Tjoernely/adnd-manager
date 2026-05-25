/**
 * Sprint 3 — settlement features taxonomy + auto-selection logic.
 *
 * Feature subTypes are emitted as POI.subType so MapManager + analytics can
 * recognise them. Auto-select rolls per-feature rarity scoped by population
 * (and gates by `requires_settlement_role` where set). DM overrides via the
 * Settlement Composition panel — 'required' always includes, 'excluded'
 * always blocks, 'auto' (default) defers to the dice.
 */

import raw from './settlementFeatures.json';

// ── Types ────────────────────────────────────────────────────────────────────

/**
 * Sprint 3: 'required' | 'auto' | 'excluded'.
 * Sprint 6 rewrite: 'auto' | number (0 = excluded, 1..5 = exact count).
 * The old strings are still accepted for backward compatibility — see
 * normalizeFeaturePresence — so DB rows / sessionStorage values written
 * before Sprint 6 keep loading correctly.
 */
export type FeaturePresence = 'auto' | number;
export type FeaturePresenceInput = FeaturePresence | 'required' | 'excluded';

export type FeatureKey  = string;
export type CategoryKey = string;

/** Max count selectable in the dropdown (Sprint 6 spec: 0..5). */
export const MAX_FEATURE_COUNT = 5;

/**
 * Bridge: turn anything a caller might pass us into the canonical Sprint 6
 * presence value. Tolerates legacy 'required'/'excluded' strings, numeric
 * strings ("3"), and the new direct values.
 */
export function normalizeFeaturePresence(v: unknown): FeaturePresence {
  if (v == null) return 'auto';
  if (v === 'auto')                     return 'auto';
  if (v === 'required')                 return 1;          // legacy → 1 copy
  if (v === 'excluded')                 return 0;
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.max(0, Math.min(MAX_FEATURE_COUNT, Math.trunc(v))) as FeaturePresence;
  }
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n)) {
      return Math.max(0, Math.min(MAX_FEATURE_COUNT, Math.trunc(n))) as FeaturePresence;
    }
  }
  return 'auto';
}

export interface NpcSuggestionSpec {
  enabled: boolean;
  count?:  number;
  roles?:  string[];
}

export interface SettlementFeature {
  label:                     string;
  subType:                   string;
  description:               string;
  minSize:                   string;
  rarityBySize:              Record<string, number>;
  dm_only_default?:          boolean;
  requires_settlement_role?: string[];
  npc_suggestions?:          NpcSuggestionSpec;
}

export interface FeatureCategory {
  label:    string;
  features: Record<FeatureKey, SettlementFeature>;
}

// ── Static schema access ─────────────────────────────────────────────────────

interface RawSchema {
  $schema?:         string;
  $schema_version?: number;
  _size_order?:     string[];
  [category: string]: unknown;
}

const SCHEMA = raw as unknown as RawSchema;

export const POP_SIZE_ORDER: string[] = SCHEMA._size_order ?? [
  'hamlet', 'village', 'town', 'small_city', 'large_city', 'metropolis',
];

function popOrder(slug: string): number {
  const idx = POP_SIZE_ORDER.indexOf(slug);
  return idx === -1 ? 0 : idx;
}

/** All real categories, filtering out $-/_-prefixed metadata. */
export function getAllCategories(): Record<CategoryKey, FeatureCategory> {
  const out: Record<CategoryKey, FeatureCategory> = {};
  for (const [k, v] of Object.entries(SCHEMA)) {
    if (k.startsWith('$') || k.startsWith('_')) continue;
    out[k] = v as FeatureCategory;
  }
  return out;
}

/** Flat list of feature keys across all categories. */
export function getAllFeatureKeys(): FeatureKey[] {
  const out: FeatureKey[] = [];
  for (const cat of Object.values(getAllCategories())) {
    for (const fk of Object.keys(cat.features)) out.push(fk);
  }
  return out;
}

/** Lookup a feature by its key (no category prefix needed). */
export function getFeature(key: FeatureKey): SettlementFeature | null {
  for (const cat of Object.values(getAllCategories())) {
    const f = cat.features[key];
    if (f) return f;
  }
  return null;
}

/**
 * Sprint 4 — lookup a feature by its subType slug (snake_case, as emitted on
 * POIs by Sonnet). Returns null if no feature matches. Used by the POI panel
 * to decide whether to surface the Suggested NPCs section.
 */
export function getFeatureBySubType(subType: string | null | undefined): SettlementFeature | null {
  if (!subType) return null;
  for (const cat of Object.values(getAllCategories())) {
    for (const f of Object.values(cat.features)) {
      if (f.subType === subType) return f;
    }
  }
  return null;
}

/** Grouped form for UI rendering. */
export function getFeaturesByCategory(): Array<{ key: CategoryKey; label: string; features: Array<{ key: FeatureKey; def: SettlementFeature }> }> {
  return Object.entries(getAllCategories()).map(([catKey, cat]) => ({
    key:    catKey,
    label:  cat.label,
    features: Object.entries(cat.features).map(([fk, def]) => ({ key: fk, def })),
  }));
}

// ── Population + role label/slug bridges ─────────────────────────────────────
//
// The map-type schema (mapTypeSchema.json) carries human labels in its
// dropdowns ("Hamlet (<100)", "Market Town"). settlementFeatures.json keys
// on snake_case slugs ("hamlet", "market_town"). These normalisers bridge
// the two so callers can pass schema values straight through.

const POP_LABEL_TO_SLUG: Record<string, string> = {
  // City buckets
  'Small City (2,000-10,000)':  'small_city',
  'Large City (10,000-25,000)': 'large_city',
  'Metropolis (25,000+)':       'metropolis',
  // Village buckets
  'Hamlet (<100)':              'hamlet',
  'Village (100-500)':          'village',
  'Town (500-2,000)':           'town',
  // Slug round-trip
  'small_city':                 'small_city',
  'large_city':                 'large_city',
  'metropolis':                 'metropolis',
  'hamlet':                     'hamlet',
  'village':                    'village',
  'town':                       'town',
};

const ROLE_LABEL_TO_SLUG: Record<string, string> = {
  'Farming Village':      'farming_village',
  'Fishing Village':      'fishing_village',
  'Mining Town':          'mining_town',
  'Market Town':          'market_town',
  'Port City':            'port_city',
  'Fortress Town':        'fortress_town',
  'Temple City':          'temple_city',
  'Trade Hub':            'trade_hub',
  'Frontier Settlement':  'frontier_settlement',
  'Noble Capital':        'noble_capital',
  // Slug round-trip
  'farming_village':      'farming_village',
  'fishing_village':      'fishing_village',
  'mining_town':          'mining_town',
  'market_town':          'market_town',
  'port_city':            'port_city',
  'fortress_town':        'fortress_town',
  'temple_city':          'temple_city',
  'trade_hub':            'trade_hub',
  'frontier_settlement':  'frontier_settlement',
  'noble_capital':        'noble_capital',
};

/**
 * "Hamlet (<100)" → "hamlet". Random / unknown → 'town' as a safe middle
 * default that allows most features and gates the rarest ones.
 */
export function normalizePopulation(label: string | undefined | null): string {
  if (!label || label === 'Random') return 'town';
  return POP_LABEL_TO_SLUG[label] ?? 'town';
}

export function normalizeSettlementRole(label: string | undefined | null): string {
  if (!label || label === 'Random') return '';
  return ROLE_LABEL_TO_SLUG[label] ?? '';
}

// ── Availability check (for greying out unavailable features in the UI) ──────

export interface AvailabilityResult {
  ok:     boolean;
  reason: string | null;
}

export function isFeatureAvailable(
  f:        SettlementFeature,
  popSlug:  string,
  roleSlug: string,
): AvailabilityResult {
  if (popOrder(popSlug) < popOrder(f.minSize)) {
    return { ok: false, reason: `Requires ${f.minSize.replace('_', ' ')} or larger.` };
  }
  if (f.requires_settlement_role && f.requires_settlement_role.length > 0) {
    if (!roleSlug) {
      return { ok: false, reason: `Only available for: ${f.requires_settlement_role.join(', ').replace(/_/g, ' ')}.` };
    }
    if (!f.requires_settlement_role.includes(roleSlug)) {
      return { ok: false, reason: `Only available for: ${f.requires_settlement_role.join(', ').replace(/_/g, ' ')}.` };
    }
  }
  return { ok: true, reason: null };
}

// ── Auto-selection ───────────────────────────────────────────────────────────

export interface AutoSelectionInput {
  population:      string;
  settlement_role: string;
  /** Accepts new (number) and legacy ('required'/'excluded') shapes. */
  presences:       Record<FeatureKey, FeaturePresenceInput>;
}

/**
 * Each required feature carries a `requested_count` (Sprint 6) so the prompt
 * builder can emit "3× inn_tavern" and Sonnet can generate that many distinct
 * POIs of that subType. Auto-picked features remain count=1 by definition.
 */
export interface AutoSelectionResult {
  required_features:    Array<SettlementFeature & { key: FeatureKey; requested_count: number }>;
  auto_picked_features: Array<SettlementFeature & { key: FeatureKey }>;
  excluded_features:    FeatureKey[];
  /** Sprint 6 — total POI count required by explicit numeric presences. */
  required_poi_total:   number;
  rationale:            string;
}

/**
 * Roll the auto-composition for a settlement.
 *
 * Sprint 6 semantics — presence per feature:
 *   - 'auto'   → rolled (population + role gates, then Math.random < rarity)
 *   - 0        → excluded (won't appear regardless of rarity)
 *   - 1..5     → exactly N copies of this feature must appear; emitted to
 *                Sonnet as "N× <subType>". Unavailable features (wrong
 *                min_size / wrong role) still get the explicit count
 *                honoured because the UI greys them out, but if the DM
 *                bypasses that we trust their intent.
 *
 * Legacy 'required'/'excluded' strings are normalised on the way in.
 */
export function autoSelectFeatures(input: AutoSelectionInput): AutoSelectionResult {
  const popSlug   = normalizePopulation(input.population);
  const roleSlug  = normalizeSettlementRole(input.settlement_role);
  const presences = input.presences ?? {};

  const required: Array<SettlementFeature & { key: FeatureKey; requested_count: number }> = [];
  const auto:     Array<SettlementFeature & { key: FeatureKey }> = [];
  const excluded: FeatureKey[] = [];
  let requiredPoiTotal = 0;

  for (const cat of Object.values(getAllCategories())) {
    for (const [fk, f] of Object.entries(cat.features)) {
      const p = normalizeFeaturePresence(presences[fk]);
      if (p === 0) {
        excluded.push(fk);
        continue;
      }
      if (typeof p === 'number' && p >= 1) {
        required.push({ ...f, key: fk, requested_count: p });
        requiredPoiTotal += p;
        continue;
      }
      // 'auto' path
      if (popOrder(popSlug) < popOrder(f.minSize)) continue;
      if (f.requires_settlement_role && f.requires_settlement_role.length > 0
          && !f.requires_settlement_role.includes(roleSlug)) {
        continue;
      }
      const rarity = f.rarityBySize?.[popSlug] ?? 0;
      if (rarity <= 0) continue;
      if (Math.random() < rarity) {
        auto.push({ ...f, key: fk });
      }
    }
  }

  const rationale =
    `${popSlug}${roleSlug ? ' / ' + roleSlug : ''} → ` +
    `${required.length} required type(s) (${requiredPoiTotal} POIs), ` +
    `${auto.length} auto-rolled, ${excluded.length} excluded`;

  return {
    required_features:    required,
    auto_picked_features: auto,
    excluded_features:    excluded,
    required_poi_total:   requiredPoiTotal,
    rationale,
  };
}
