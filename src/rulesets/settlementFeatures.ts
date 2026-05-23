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

export type FeaturePresence = 'required' | 'auto' | 'excluded';
export type FeatureKey  = string;
export type CategoryKey = string;

export interface SettlementFeature {
  label:                     string;
  subType:                   string;
  description:               string;
  minSize:                   string;
  rarityBySize:              Record<string, number>;
  dm_only_default?:          boolean;
  requires_settlement_role?: string[];
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
  presences:       Record<FeatureKey, FeaturePresence>;
}

export interface AutoSelectionResult {
  required_features:    Array<SettlementFeature & { key: FeatureKey }>;
  auto_picked_features: Array<SettlementFeature & { key: FeatureKey }>;
  excluded_features:    FeatureKey[];
  rationale:            string;
}

/**
 * Roll the auto-composition for a settlement.
 *
 *   - 'required' overrides always include the feature (UI greys out unavailable
 *      ones so DM shouldn't be able to mark them required in the first place,
 *      but we honour the override either way).
 *   - 'excluded' overrides always block the feature.
 *   - Defaults / 'auto' presence:
 *       * skipped when popOrder(population) < popOrder(minSize)
 *       * skipped when requires_settlement_role is set and role doesn't match
 *       * otherwise rolled: include when Math.random() < rarityBySize[pop]
 */
export function autoSelectFeatures(input: AutoSelectionInput): AutoSelectionResult {
  const popSlug  = normalizePopulation(input.population);
  const roleSlug = normalizeSettlementRole(input.settlement_role);
  const presences = input.presences ?? {};

  const required: Array<SettlementFeature & { key: FeatureKey }> = [];
  const auto:     Array<SettlementFeature & { key: FeatureKey }> = [];
  const excluded: FeatureKey[] = [];

  for (const cat of Object.values(getAllCategories())) {
    for (const [fk, f] of Object.entries(cat.features)) {
      const p = presences[fk] ?? 'auto';
      if (p === 'excluded') {
        excluded.push(fk);
        continue;
      }
      if (p === 'required') {
        required.push({ ...f, key: fk });
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
    `${required.length} required, ${auto.length} auto-rolled, ${excluded.length} excluded`;

  return {
    required_features:    required,
    auto_picked_features: auto,
    excluded_features:    excluded,
    rationale,
  };
}
