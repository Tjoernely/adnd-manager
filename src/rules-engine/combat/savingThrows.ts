/**
 * Saving throws — pure logic, no React.
 *
 * Use:
 *   const targets = computeSaveTargets("warrior", 5);
 *   const result = rollSave(targets, "breath", { modifier: 2 });
 */
import savesData from "../../rulesets/savingThrows.json";
import type {
  SaveCategoryId,
  SaveRollResult,
  SaveTableId,
  SaveTargets,
} from "./types";

interface SaveRow {
  from: number;
  to: number;
  death: number;
  wand: number;
  petrify: number;
  breath: number;
  spell: number;
}

interface SaveTable {
  label: string;
  rows: SaveRow[];
}

const TABLES = savesData.tables as Record<SaveTableId, SaveTable>;

/**
 * Parse a 2E HD string like "5+3" or "1-1" into an effective fighter level for saves.
 * Rule of thumb: HD with "+N" → round up the next bracket. We map +1+ to next level.
 */
export function hdToFighterLevel(hd: string | number): number {
  if (typeof hd === "number") return Math.max(1, Math.floor(hd));
  const trimmed = hd.trim();
  // "5+3" → 5 base, +3 means treat as level 6
  const plus = trimmed.match(/^(\d+)\+(\d+)/);
  if (plus) return parseInt(plus[1], 10) + (parseInt(plus[2], 10) > 0 ? 1 : 0);
  // "1-1" → 1
  const minus = trimmed.match(/^(\d+)-(\d+)/);
  if (minus) return Math.max(1, parseInt(minus[1], 10));
  // "½" or "1/2"
  if (trimmed === "½" || trimmed === "1/2") return 1;
  // plain number
  const n = parseInt(trimmed, 10);
  return isNaN(n) ? 1 : Math.max(1, n);
}

function rowFor(table: SaveTable, level: number): SaveRow | undefined {
  return table.rows.find((r) => level >= r.from && level <= r.to);
}

/**
 * Look up the 5 save targets for a given table + level.
 * For monsters, pass tableId="monster" — we then use the warrior table at the monster's HD level.
 */
export function computeSaveTargets(
  tableId: SaveTableId,
  level: number
): SaveTargets {
  const tbl = tableId === "monster" ? TABLES.warrior : TABLES[tableId];
  if (!tbl) {
    // Defensive default — worst-case low-level fighter
    return { death: 16, wand: 18, petrify: 17, breath: 20, spell: 19 };
  }
  const row = rowFor(tbl, level);
  if (!row) {
    // Fallback to lowest level row
    const fallback = tbl.rows[0];
    return {
      death: fallback.death,
      wand: fallback.wand,
      petrify: fallback.petrify,
      breath: fallback.breath,
      spell: fallback.spell,
    };
  }
  return {
    death: row.death,
    wand: row.wand,
    petrify: row.petrify,
    breath: row.breath,
    spell: row.spell,
  };
}

/**
 * Roll a single save. Returns full result object for UI/log.
 */
export function rollSave(
  targets: SaveTargets,
  category: SaveCategoryId,
  opts: { modifier?: number; rng?: () => number } = {}
): SaveRollResult {
  const rng = opts.rng ?? Math.random;
  const roll = Math.floor(rng() * 20) + 1;
  const modifier = opts.modifier ?? 0;
  const target = targets[category];
  const total = roll + modifier;
  const natural1 = roll === 1;
  const natural20 = roll === 20;
  const success = natural20 ? true : natural1 ? false : total >= target;
  return { category, roll, target, modifier, total, success, natural1, natural20 };
}

export const SAVE_CATEGORIES = (savesData.categories as Array<{
  id: SaveCategoryId;
  label: string;
  short: string;
}>);
