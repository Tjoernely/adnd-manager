/**
 * Combat types — extensions for inline statblock, conditions, saves, and per-round initiative.
 *
 * INTEGRATION NOTE: If you already have a Combatant type, merge these fields into it
 * rather than replacing — keep your existing currentHp, maxHp, etc. intact.
 */

export type SaveCategoryId = "death" | "wand" | "petrify" | "breath" | "spell";

export type SaveTableId = "warrior" | "wizard" | "priest" | "rogue" | "monster";

export type ConditionTag = "positive" | "negative" | "neutral";

export interface ConditionDefinition {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultDuration: number | null; // rounds; null = until removed manually
  description: string;
  blocksActions: boolean;
  preventsAttack: boolean;
  noSave: boolean;
  tag: ConditionTag;
}

export interface AppliedCondition {
  conditionId: string;
  roundsRemaining: number | null; // null = indefinite
  source?: string;                 // who/what applied it
  notes?: string;                  // DM scratch note
  appliedOnRound: number;
}

export interface SaveTargets {
  death: number;
  wand: number;
  petrify: number;
  breath: number;
  spell: number;
}

/**
 * Minimal extension fields. Merge into your existing Combatant type.
 */
export interface CombatExtensionFields {
  conditions?: AppliedCondition[];
  /** Re-rolled each round (1d10 + modifier per 2E RAW). Falls back to base initiative if absent. */
  currentInit?: number;
  /** Optional per-round initiative modifier (weapon speed, casting time, dex). */
  initModifier?: number;
  /** Cached save targets — recomputed when class/level/HD changes. */
  saveTargets?: SaveTargets;
  /** For monsters this is HD (e.g. "5+3"); for PCs this is class id. */
  saveTable?: SaveTableId;
  /** Effective level for the save table (HD for monsters, class level for PCs). */
  saveLevel?: number;
}

/**
 * Result of a single saving-throw roll.
 */
export interface SaveRollResult {
  category: SaveCategoryId;
  roll: number;        // raw d20
  target: number;      // number to meet or beat
  modifier: number;    // racial/magic bonus, default 0
  total: number;       // roll + modifier
  success: boolean;
  natural1: boolean;   // automatic failure (house rule supported)
  natural20: boolean;  // automatic success
}
