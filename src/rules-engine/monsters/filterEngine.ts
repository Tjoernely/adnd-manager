/**
 * Pure filter engine for monsters.
 *
 * - No React dependencies. Pure functions.
 * - Handles: free-text search, tag filtering with per-category AND/OR,
 *   structured filters (size/freq/habitat), and projected-count simulation.
 *
 * Use `filterMonsters(state, monsters)` to get the filtered list.
 * Use `projectedCount(state, monsters, kind, value)` to ask:
 *   "what would the count be if I added this filter?"
 */
import type {
  FilterState,
  FilterableMonster,
  LogicMode,
  SerializedFilterState,
  TagCategory,
} from "../../components/Encounters/filterTypes";

/* ============================================================
   Core filter
   ============================================================ */

export function filterMonsters(
  state: FilterState,
  monsters: FilterableMonster[]
): FilterableMonster[] {
  const searchLower = state.search.trim().toLowerCase();
  return monsters.filter((m) => matchesAll(state, m, searchLower));
}

function matchesAll(
  state: FilterState,
  m: FilterableMonster,
  searchLower: string
): boolean {
  if (searchLower && !matchesSearch(m, searchLower)) return false;
  if (!matchesTagCategory(state, m, "primary")) return false;
  if (!matchesTagCategory(state, m, "modifier")) return false;
  if (!matchesTagCategory(state, m, "subtype")) return false;
  if (!matchesSize(state, m)) return false;
  if (!matchesFreq(state, m)) return false;
  if (!matchesHabitat(state, m)) return false;
  return true;
}

/**
 * Search matches if the query is found in any of: name, tags, alignment.
 * Case-insensitive. Multi-word query treated as AND across the tokens.
 */
function matchesSearch(m: FilterableMonster, queryLower: string): boolean {
  const haystack = [
    m.name,
    ...(Array.isArray(m.tags) ? m.tags : []),
    m.alignment ?? "",
  ]
    .join(" ")
    .toLowerCase();
  // AND across whitespace-separated tokens
  const tokens = queryLower.split(/\s+/).filter(Boolean);
  return tokens.every((t) => haystack.includes(t));
}

function matchesTagCategory(
  state: FilterState,
  m: FilterableMonster,
  cat: TagCategory
): boolean {
  const selected = state.selectedTags[cat];
  if (selected.size === 0) return true;
  const tags = new Set(Array.isArray(m.tags) ? m.tags : []);
  const logic = state.logic[cat];
  if (logic === "and") {
    for (const t of selected) if (!tags.has(t)) return false;
    return true;
  } else {
    for (const t of selected) if (tags.has(t)) return true;
    return false;
  }
}

function matchesSize(state: FilterState, m: FilterableMonster): boolean {
  if (state.selectedSizes.size === 0) return true;
  return state.selectedSizes.has(normalizeSize(m.size));
}

function matchesFreq(state: FilterState, m: FilterableMonster): boolean {
  if (state.selectedFreqs.size === 0) return true;
  return state.selectedFreqs.has(normalizeFreq(m.frequency));
}

function matchesHabitat(state: FilterState, m: FilterableMonster): boolean {
  if (state.selectedHabitats.size === 0) return true;
  const h = (m.habitat ?? "").toLowerCase();
  for (const sel of state.selectedHabitats) {
    if (h.includes(sel.toLowerCase())) return true;
  }
  return false;
}

/* ============================================================
   Normalisation helpers
   ============================================================ */

/**
 * Monster size strings in our database are inconsistent — "medium", "M (5' tall)",
 * "huge", "L (8' long)". Normalise to one of: tiny, small, medium, large, huge, gargantuan.
 */
export function normalizeSize(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).toLowerCase().trim();
  if (s.startsWith("t") || /^t[\s(]/.test(s) || s === "tiny") return "tiny";
  if (s.startsWith("s") || /^s[\s(]/.test(s) || s === "small") return "small";
  if (s.startsWith("m") || /^m[\s(]/.test(s) || s === "medium") return "medium";
  if (s.startsWith("l") || /^l[\s(]/.test(s) || s === "large") return "large";
  if (s.startsWith("h") || /^h[\s(]/.test(s) || s === "huge") return "huge";
  if (s.startsWith("g") || /^g[\s(]/.test(s) || s === "gargantuan") return "gargantuan";
  return s;
}

/**
 * Frequency strings vary in casing ("Very Rare" vs "Very rare"). Normalise to title case.
 */
export function normalizeFreq(raw: string | null | undefined): string {
  if (!raw) return "";
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/* ============================================================
   Habitat extraction
   ============================================================ */

/**
 * Extract a list of unique habitat tokens from a monster array, sorted by
 * descending frequency. Used to populate the habitat filter UI.
 *
 * Habitat strings are messy — "Tropical and temperate mountains",
 * "Subterranean, forest". We split on common delimiters and take the most
 * frequent ~14 tokens.
 */
export function extractHabitats(
  monsters: FilterableMonster[],
  maxCount: number = 14
): string[] {
  const counts = new Map<string, number>();
  for (const m of monsters) {
    if (!m.habitat) continue;
    const parts = String(m.habitat)
      .split(/[,;/]|\s+and\s+/i)
      .map((p) => p.trim())
      .filter((p) => p.length > 2 && p.length < 25);
    for (const p of parts) {
      // Title case
      const key = p.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCount)
    .map((e) => e[0]);
}

/* ============================================================
   Projected counts — "what if I added this filter?"
   ============================================================ */

export type ProjectionKind =
  | "tag-primary"
  | "tag-modifier"
  | "tag-subtype"
  | "size"
  | "freq"
  | "habitat";

export function projectedCount(
  state: FilterState,
  monsters: FilterableMonster[],
  kind: ProjectionKind,
  value: string
): number {
  // Clone state minimally
  const sim: FilterState = {
    search: state.search,
    selectedTags: {
      primary: new Set(state.selectedTags.primary),
      modifier: new Set(state.selectedTags.modifier),
      subtype: new Set(state.selectedTags.subtype),
    },
    logic: { ...state.logic },
    selectedSizes: new Set(state.selectedSizes),
    selectedFreqs: new Set(state.selectedFreqs),
    selectedHabitats: new Set(state.selectedHabitats),
  };

  switch (kind) {
    case "tag-primary":  sim.selectedTags.primary.add(value); break;
    case "tag-modifier": sim.selectedTags.modifier.add(value); break;
    case "tag-subtype":  sim.selectedTags.subtype.add(value); break;
    case "size":         sim.selectedSizes.add(value); break;
    case "freq":         sim.selectedFreqs.add(value); break;
    case "habitat":      sim.selectedHabitats.add(value); break;
  }

  return filterMonsters(sim, monsters).length;
}

/* ============================================================
   Serialization (for sessionStorage)
   ============================================================ */

export function serializeState(state: FilterState): SerializedFilterState {
  return {
    search: state.search,
    selectedTags: {
      primary: [...state.selectedTags.primary],
      modifier: [...state.selectedTags.modifier],
      subtype: [...state.selectedTags.subtype],
    },
    logic: { ...state.logic },
    selectedSizes: [...state.selectedSizes],
    selectedFreqs: [...state.selectedFreqs],
    selectedHabitats: [...state.selectedHabitats],
  };
}

export function deserializeState(
  serialized: SerializedFilterState | null | undefined,
  defaultLogic: { primary: LogicMode; modifier: LogicMode; subtype: LogicMode }
): FilterState {
  if (!serialized) {
    return emptyState(defaultLogic);
  }
  return {
    search: serialized.search ?? "",
    selectedTags: {
      primary: new Set(serialized.selectedTags?.primary ?? []),
      modifier: new Set(serialized.selectedTags?.modifier ?? []),
      subtype: new Set(serialized.selectedTags?.subtype ?? []),
    },
    logic: {
      primary: serialized.logic?.primary ?? defaultLogic.primary,
      modifier: serialized.logic?.modifier ?? defaultLogic.modifier,
      subtype: serialized.logic?.subtype ?? defaultLogic.subtype,
    },
    selectedSizes: new Set(serialized.selectedSizes ?? []),
    selectedFreqs: new Set(serialized.selectedFreqs ?? []),
    selectedHabitats: new Set(serialized.selectedHabitats ?? []),
  };
}

export function emptyState(defaultLogic: {
  primary: LogicMode;
  modifier: LogicMode;
  subtype: LogicMode;
}): FilterState {
  return {
    search: "",
    selectedTags: {
      primary: new Set(),
      modifier: new Set(),
      subtype: new Set(),
    },
    logic: { ...defaultLogic },
    selectedSizes: new Set(),
    selectedFreqs: new Set(),
    selectedHabitats: new Set(),
  };
}

export function hasAnyFilter(state: FilterState): boolean {
  return (
    state.search.trim().length > 0 ||
    state.selectedTags.primary.size > 0 ||
    state.selectedTags.modifier.size > 0 ||
    state.selectedTags.subtype.size > 0 ||
    state.selectedSizes.size > 0 ||
    state.selectedFreqs.size > 0 ||
    state.selectedHabitats.size > 0
  );
}
