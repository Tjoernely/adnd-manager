// ── Loot XP Engine — Core Types ───────────────────────────────────────────────
// Adapted from AD&D 2E magical_items DB.
// Table-letter → ItemCategory map lives in lootRollEngine.ts (server-side) and
// is echoed in the /api/magical-items/loot-pool response.

export type ItemCategory =
  | 'misc'
  | 'potion'
  | 'scroll'
  | 'ring'
  | 'rod'
  | 'staff'
  | 'wand'
  | 'gem'
  | 'jewelry'
  | 'boots_gloves_accessories'
  | 'armor_shield'
  | 'weapon'
  | 'artifact_relic';

/** One magical item in loot-engine format (mapped from magical_items DB row). */
export interface LootItem {
  /** DB id as string. */
  id: string;
  name: string;
  /** Derived from table_letter via TABLE_TO_LOOT_CATEGORY mapping. */
  category: ItemCategory;
  /** AD&D 2E listed XP value — used as the primary budget currency. */
  listedXp: number;
  /** Gold-piece market value. */
  gpValue: number;
  /** Terrain/lore tags for context-aware filtering (optional). */
  loreTags?: string[];
  /** true for cursed items — excluded unless includeCursed flag is set. */
  excludedByDefault?: boolean;
}

/** Input parameters for a single loot roll. */
export interface LootRollInput {
  partyLevel:    number;
  difficulty:    'Easy' | 'Medium' | 'Hard' | 'Deadly';
  partySize?:    number;
  terrain?:      string;
  maxItems?:     number;
  includeCursed?: boolean;
}

/** The result returned by rollLoot(). */
export interface LootRollResult {
  items:    LootItem[];
  totalXp:  number;
  totalGp:  number;
  budget:   number;
  log:      string[];
}
