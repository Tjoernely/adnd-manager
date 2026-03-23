/**
 * lootXpEngine.ts
 * Phase 4 — XP Budget computation.
 *
 * Budget = base(level) × difficultyMult × partySizeMult
 * All values come from lootXpConfig.json so the DM can tune them without
 * touching code.
 */
import config from '../rulesets/loot/lootXpConfig.json';
import type { LootRollInput } from '../rulesets/loot/loot.schema';

type NumberMap = Record<string, number>;

/**
 * Compute the XP budget available for a single loot roll.
 */
export function computeXpBudget(input: LootRollInput): number {
  const level = Math.max(1, Math.min(20, Math.round(input.partyLevel)));
  const base  = (config.xpBudgetByLevel as NumberMap)[String(level)] ?? 750;

  const diffMult = (config.difficultyMultiplier as NumberMap)[input.difficulty] ?? 1.0;

  const size     = Math.max(1, Math.min(8, input.partySize ?? 4));
  // Nearest key; if exact size missing, fall back to 4
  const sizeMult =
    (config.partySizeScaling as NumberMap)[String(size)] ??
    (config.partySizeScaling as NumberMap)['4'];

  return Math.round(base * diffMult * sizeMult);
}

/**
 * Human-readable budget breakdown (for debug panel).
 */
export function budgetBreakdown(input: LootRollInput): {
  base: number; diffMult: number; sizeMult: number; total: number;
} {
  const level    = Math.max(1, Math.min(20, Math.round(input.partyLevel)));
  const base     = (config.xpBudgetByLevel as NumberMap)[String(level)] ?? 750;
  const diffMult = (config.difficultyMultiplier as NumberMap)[input.difficulty] ?? 1.0;
  const size     = Math.max(1, Math.min(8, input.partySize ?? 4));
  const sizeMult =
    (config.partySizeScaling as NumberMap)[String(size)] ??
    (config.partySizeScaling as NumberMap)['4'];
  return { base, diffMult, sizeMult, total: Math.round(base * diffMult * sizeMult) };
}
