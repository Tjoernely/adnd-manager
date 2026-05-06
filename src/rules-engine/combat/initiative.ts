/**
 * Initiative — 2E RAW: each combatant rolls 1d10 + modifier each round.
 * Lowest goes first.
 *
 * Modifiers (DM may apply):
 *  - Weapon speed factor (slower weapon = higher number = acts later)
 *  - Casting time (in segments)
 *  - Dex reaction adjustment (negative = faster)
 *  - Hasted = halve roll, Slowed = double roll (DM discretion)
 */

export interface InitInput {
  id: string | number;
  name: string;
  modifier?: number;
}

export interface InitResult {
  id: string | number;
  name: string;
  roll: number;
  modifier: number;
  total: number;
}

const d10 = (rng: () => number = Math.random) => Math.floor(rng() * 10) + 1;

export function rollInitiative(
  combatants: InitInput[],
  rng: () => number = Math.random
): InitResult[] {
  return combatants
    .map((c) => {
      const roll = d10(rng);
      const modifier = c.modifier ?? 0;
      return { id: c.id, name: c.name, roll, modifier, total: roll + modifier };
    })
    .sort((a, b) => a.total - b.total); // 2E: low goes first
}

/**
 * Group initiative — when many monsters of the same type act together, roll once.
 * Returns a single InitResult that you can apply to all members of the group.
 */
export function rollGroupInitiative(
  groupId: string,
  groupName: string,
  modifier: number = 0,
  rng: () => number = Math.random
): InitResult {
  const roll = d10(rng);
  return { id: groupId, name: groupName, roll, modifier, total: roll + modifier };
}
