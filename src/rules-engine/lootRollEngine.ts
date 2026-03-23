/**
 * lootRollEngine.ts
 * Phase 6 — Orchestrates the full loot roll:
 *   fetch pool → filter → weight → greedy selection within XP budget.
 */
import type { LootItem, LootRollInput, LootRollResult } from '../rulesets/loot/loot.schema';
import { computeXpBudget }                              from './lootXpEngine';
import { filterByTerrain, buildWeightMap }              from './lootFilterEngine';

// ── Default XP by table letter (for items with null xp_value) ─────────────────
const DEFAULT_XP_BY_TABLE: Record<string, number> = {
  A: 1000, B:  300, C:  200, D: 2000, E: 2500,
  F: 3000, G: 4000, H: 5000, I: 1500, J:   50,
  K:  100, L:  500, M:  800, N:  200, O:  150,
  P: 1000, Q:10000, R:  500, S: 2000, T:  500,
};

// ── Fetch loot pool from our API ──────────────────────────────────────────────

export async function fetchLootPool(opts: {
  minXp?: number;
  maxXp?: number;
  tableLetter?: string;
  limit?: number;
}): Promise<LootItem[]> {
  const p = new URLSearchParams();
  if (opts.minXp      != null) p.set('min_xp',       String(opts.minXp));
  if (opts.maxXp      != null) p.set('max_xp',       String(opts.maxXp));
  if (opts.tableLetter)        p.set('table_letter',  opts.tableLetter);
  p.set('limit', String(Math.min(opts.limit ?? 300, 500)));

  const res = await fetch(`/api/magical-items/loot-pool?${p}`);
  if (!res.ok) throw new Error(`Loot pool fetch failed: HTTP ${res.status}`);
  const rows = await res.json() as Array<LootItem & { table_letter?: string }>;
  // Apply XP defaults for items with no listed xp
  return rows.map(item => ({
    ...item,
    listedXp: item.listedXp > 0
      ? item.listedXp
      : DEFAULT_XP_BY_TABLE[item.table_letter?.toUpperCase() ?? ''] ?? 500,
  }));
}

// ── Weighted random pick ───────────────────────────────────────────────────────

function weightedPick<T extends { id: string }>(
  items:   T[],
  weights: Map<string, number>,
): T | null {
  if (!items.length) return null;
  const total = items.reduce((s, item) => s + (weights.get(item.id) ?? 1), 0);
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= weights.get(item.id) ?? 1;
    if (rand <= 0) return item;
  }
  return items[items.length - 1];
}

// ── Main roll ─────────────────────────────────────────────────────────────────

export async function rollLoot(input: LootRollInput): Promise<LootRollResult> {
  const log: string[] = [];

  // 1. Budget
  const budget = computeXpBudget(input);
  log.push(
    `Party Lv${input.partyLevel} · ${input.difficulty}` +
    (input.partySize ? ` · Party ${input.partySize}` : '') +
    ` → Budget: ${budget.toLocaleString()} XP`,
  );

  // 2. Fetch pool — no minXp filter; XP defaults applied inside fetchLootPool
  const poolCap = Math.max(budget * 2, 1000);
  const raw     = await fetchLootPool({ maxXp: poolCap, limit: 300 });
  log.push(`Fetched ${raw.length} candidate items (max XP per item: ${poolCap.toLocaleString()})`);

  // 3. Exclude cursed unless explicitly included
  const eligible = input.includeCursed ? raw : raw.filter(i => !i.excludedByDefault);

  // 4. Terrain lore filter
  const pool = filterByTerrain(eligible, input.terrain);
  log.push(`After terrain filter (${input.terrain ?? 'any'}): ${pool.length} items`);

  if (!pool.length) {
    log.push('⚠ Pool is empty — no items match filters.');
    return { items: [], totalXp: 0, totalGp: 0, budget, log };
  }

  // 5. Build weights
  const weights = buildWeightMap(pool);

  // 6. Greedy selection within budget
  const results: LootItem[] = [];
  const used = new Set<string>();
  let remaining = budget;
  const maxItems = input.maxItems ?? 4;

  for (let i = 0; i < maxItems && remaining > 0; i++) {
    const candidates = pool.filter(
      item => !used.has(item.id) && item.listedXp <= remaining,
    );
    if (!candidates.length) {
      log.push(`No items fit remaining budget (${remaining.toLocaleString()} XP)`);
      break;
    }

    const picked = weightedPick(candidates, weights);
    if (!picked) break;

    results.push(picked);
    used.add(picked.id);
    remaining -= picked.listedXp;
    log.push(`  [${i + 1}] ${picked.name} — ${picked.listedXp.toLocaleString()} XP · ${picked.gpValue.toLocaleString()} gp`);
  }

  const totalXp = results.reduce((s, i) => s + i.listedXp, 0);
  const totalGp = results.reduce((s, i) => s + i.gpValue, 0);
  log.push(
    `Done: ${results.length} item${results.length !== 1 ? 's' : ''} · ` +
    `${totalXp.toLocaleString()} XP · ${totalGp.toLocaleString()} gp`,
  );

  return { items: results, totalXp, totalGp, budget, log };
}
