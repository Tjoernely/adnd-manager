/**
 * Condition logic — pure functions, no React.
 * Apply, remove, and tick conditions at end of each round.
 */
import conditionsData from "../../rulesets/conditions.json";
import type { AppliedCondition, ConditionDefinition } from "./types";

const ALL_CONDITIONS: ConditionDefinition[] = conditionsData.conditions as ConditionDefinition[];
const BY_ID = new Map(ALL_CONDITIONS.map((c) => [c.id, c]));

export function getAllConditions(): ConditionDefinition[] {
  return ALL_CONDITIONS;
}

export function getConditionDef(id: string): ConditionDefinition | undefined {
  return BY_ID.get(id);
}

/**
 * Add a condition. Idempotent — re-applying refreshes duration to the larger value.
 */
export function applyCondition(
  current: AppliedCondition[] | undefined,
  conditionId: string,
  currentRound: number,
  opts: { duration?: number | null; source?: string; notes?: string } = {}
): AppliedCondition[] {
  const def = getConditionDef(conditionId);
  if (!def) return current ?? [];

  const list = current ? [...current] : [];
  const existingIdx = list.findIndex((c) => c.conditionId === conditionId);

  const duration =
    opts.duration !== undefined ? opts.duration : def.defaultDuration;

  const next: AppliedCondition = {
    conditionId,
    roundsRemaining: duration,
    source: opts.source,
    notes: opts.notes,
    appliedOnRound: currentRound,
  };

  if (existingIdx >= 0) {
    const existing = list[existingIdx];
    // Refresh: keep the longer duration.
    if (
      existing.roundsRemaining === null ||
      next.roundsRemaining === null ||
      (next.roundsRemaining ?? 0) > (existing.roundsRemaining ?? 0)
    ) {
      list[existingIdx] = { ...existing, ...next };
    }
  } else {
    list.push(next);
  }

  return list;
}

export function removeCondition(
  current: AppliedCondition[] | undefined,
  conditionId: string
): AppliedCondition[] {
  if (!current) return [];
  return current.filter((c) => c.conditionId !== conditionId);
}

/**
 * Tick down every condition by 1. Conditions with roundsRemaining null are unaffected.
 * Conditions that hit 0 are removed.
 */
export function tickConditions(current: AppliedCondition[] | undefined): AppliedCondition[] {
  if (!current) return [];
  return current
    .map((c) =>
      c.roundsRemaining === null
        ? c
        : { ...c, roundsRemaining: c.roundsRemaining - 1 }
    )
    .filter((c) => c.roundsRemaining === null || c.roundsRemaining > 0);
}

/**
 * Quick checks for combat UI — does this combatant have an action-blocking condition?
 */
export function hasBlockingCondition(current: AppliedCondition[] | undefined): boolean {
  if (!current) return false;
  return current.some((c) => {
    const def = BY_ID.get(c.conditionId);
    return def?.blocksActions ?? false;
  });
}

export function hasAttackPrevention(current: AppliedCondition[] | undefined): boolean {
  if (!current) return false;
  return current.some((c) => {
    const def = BY_ID.get(c.conditionId);
    return def?.preventsAttack ?? false;
  });
}

/**
 * Format a condition for display — used in tooltips and badges.
 */
export function describeCondition(applied: AppliedCondition): string {
  const def = getConditionDef(applied.conditionId);
  if (!def) return applied.conditionId;
  const dur =
    applied.roundsRemaining === null
      ? "indefinite"
      : `${applied.roundsRemaining} rd${applied.roundsRemaining === 1 ? "" : "s"} left`;
  return `${def.name} (${dur})`;
}
