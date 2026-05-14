/**
 * XP threshold calculations for encounter generation.
 *
 * The thresholds shown in the existing UI footer:
 *   "Easy < 2,000 XP · Medium < 5,000 XP · Hard < 10,000 XP"
 *
 * These appear to be the **upper bound** for each difficulty band for a
 * party of 4 level-5 characters. We derive a scaling factor from
 * (partySize × partyLevel) so the same logic works for other party shapes.
 *
 * NOTE: If your existing generator already has thresholds defined somewhere,
 * use those instead. Check for a function like `calculateTargetXp`,
 * `getEncounterBudget`, or similar before adopting this file. The numbers
 * here are reverse-engineered from the visible UI; the source of truth in
 * your codebase wins.
 */

export type Difficulty = "easy" | "medium" | "hard" | "deadly";

export interface XpBudget {
  /** Inclusive lower bound. */
  min: number;
  /** Inclusive upper bound (exclusive of the next tier's min). */
  max: number;
}

/**
 * Baseline thresholds for partySize=4, partyLevel=5 (from existing UI):
 *   Easy:   1   - 2000   (anything under Medium is Easy)
 *   Medium: 2000 - 5000
 *   Hard:   5000 - 10000
 *   Deadly: 10000+
 */
const BASELINE_PARTY_SIZE = 4;
const BASELINE_PARTY_LEVEL = 5;

const BASELINE_THRESHOLDS: Record<Difficulty, XpBudget> = {
  easy:   { min: 1,     max: 2000 },
  medium: { min: 2000,  max: 5000 },
  hard:   { min: 5000,  max: 10000 },
  deadly: { min: 10000, max: 50000 },
};

/**
 * Compute the XP budget range for a given difficulty and party shape.
 * Scales linearly with partySize × partyLevel relative to baseline.
 */
export function getXpBudget(
  difficulty: Difficulty,
  partySize: number,
  partyLevel: number
): XpBudget {
  const baseline = BASELINE_THRESHOLDS[difficulty];
  const scaleFactor =
    (partySize * partyLevel) / (BASELINE_PARTY_SIZE * BASELINE_PARTY_LEVEL);

  return {
    min: Math.round(baseline.min * scaleFactor),
    max: Math.round(baseline.max * scaleFactor),
  };
}

/**
 * Given a total encounter XP, determine which difficulty band it falls into.
 * Used by the "Difficulty Rating" display after generation.
 */
export function classifyTotalXp(
  totalXp: number,
  partySize: number,
  partyLevel: number
): Difficulty {
  const medium = getXpBudget("medium", partySize, partyLevel);
  const hard = getXpBudget("hard", partySize, partyLevel);
  if (totalXp < medium.min) return "easy";
  if (totalXp < hard.min) return "medium";
  if (totalXp < hard.max) return "hard";
  return "deadly";
}

export function formatXp(n: number): string {
  return n.toLocaleString("en-US");
}
