/**
 * lootFilterEngine.ts
 * Phase 5 — Lore-based item filtering and category weighting.
 */
import config from '../rulesets/loot/lootXpConfig.json';
import type { LootItem } from '../rulesets/loot/loot.schema';

type TagMap    = Record<string, string[]>;
type NumberMap = Record<string, number>;

/**
 * Filter items so only terrain-appropriate ones remain.
 * Items with NO loreTags are always included (they're generic enough for anywhere).
 */
export function filterByTerrain(items: LootItem[], terrain?: string): LootItem[] {
  if (!terrain) return items;
  const key  = terrain.toLowerCase().trim();
  const tags = (config.loreTagsByTerrain as TagMap)[key];
  if (!tags || tags.length === 0) return items;

  return items.filter(
    item => !item.loreTags?.length || item.loreTags.some(t => tags.includes(t)),
  );
}

/**
 * Filter items to those whose XP value falls within [minXp, maxXp].
 */
export function filterByXpRange(items: LootItem[], minXp: number, maxXp: number): LootItem[] {
  return items.filter(item => item.listedXp >= minXp && item.listedXp <= maxXp);
}

/**
 * Build a weight map (item.id → weight) driven by category weights in the config.
 * Higher weight = more likely to be picked.
 */
export function buildWeightMap(items: LootItem[]): Map<string, number> {
  const catW    = config.categoryWeights as NumberMap;
  const weights = new Map<string, number>();
  for (const item of items) {
    weights.set(item.id, catW[item.category] ?? 1);
  }
  return weights;
}

/**
 * Summarise an item pool by category (for the debug panel).
 */
export function summarisePool(items: LootItem[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }
  return counts;
}
