/**
 * Shared types for the tag filter system.
 */

export type TagCategory = "primary" | "modifier" | "subtype";
export type LogicMode = "and" | "or";

/**
 * Minimal monster shape the filter engine cares about.
 * Your existing Monster type likely has more fields — this is what we need.
 */
export interface FilterableMonster {
  id: number;
  name: string;
  tags: string[] | null | undefined;
  size?: string | null;
  frequency?: string | null;
  habitat?: string | null;
  /** Free text fallback for the search box */
  hit_dice?: string | null;
  alignment?: string | null;
  /** Any other fields are ignored by the engine. */
  [key: string]: unknown;
}

export interface FilterState {
  /** Free-text search across name + tags + alignment */
  search: string;
  /** Selected tags per category */
  selectedTags: {
    primary: Set<string>;
    modifier: Set<string>;
    subtype: Set<string>;
  };
  /** AND/OR per category */
  logic: {
    primary: LogicMode;
    modifier: LogicMode;
    subtype: LogicMode;
  };
  /** Structured filters — always OR within each */
  selectedSizes: Set<string>;
  selectedFreqs: Set<string>;
  selectedHabitats: Set<string>;
}

export interface SerializedFilterState {
  search: string;
  selectedTags: {
    primary: string[];
    modifier: string[];
    subtype: string[];
  };
  logic: {
    primary: LogicMode;
    modifier: LogicMode;
    subtype: LogicMode;
  };
  selectedSizes: string[];
  selectedFreqs: string[];
  selectedHabitats: string[];
}

export interface QuickFilterDef {
  label: string;
  category: TagCategory;
  tag: string;
}

export interface FilterConfig {
  quickFilters: QuickFilterDef[];
  defaultLogic: {
    primary: LogicMode;
    modifier: LogicMode;
    subtype: LogicMode;
  };
  defaultOpenSections: string[];
  structuredFilters: {
    sizes: string[];
    frequencies: string[];
  };
}
