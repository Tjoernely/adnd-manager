/**
 * AI generation config for the quest module — model registry, length/detail
 * token matrix, price estimation, and scope-dependent tables.
 *
 * Scope keys match the real taxonomy in src/rulesets/quests/questVocabulary.json
 * (hook_only, single_encounter, one_shot, side_quest, multi_session,
 * campaign_arc, sandbox_rumor) — NOT the illustrative keys from the spec.
 */

import type { QuestScope } from '../../rules-engine/quests/questSchema';
import type { QuestAIModel } from '../../rules-engine/quests/questPrompts';

/** Length / detail axis index — 0..4. */
export type Tier = 0 | 1 | 2 | 3 | 4;

// ── Models ───────────────────────────────────────────────────────────────────

export interface ModelOption {
  id: QuestAIModel;
  label: string;
  description: string;
  isDefault?: boolean;
}

export const MODEL_OPTIONS: ModelOption[] = [
  {
    id: 'claude-opus-4-7',
    label: 'Claude Opus 4.7',
    description:
      'Best creative quality, deepest narrative coherence. Slowest and most expensive ($5/$25 per Mtok).',
  },
  {
    id: 'claude-sonnet-4-6',
    label: 'Claude Sonnet 4.6',
    description:
      'Balanced. Strong creative writing + reliable JSON. ~1/3 the cost of Opus ($3/$15 per Mtok).',
    isDefault: true,
  },
  {
    id: 'gpt-5.4',
    label: 'GPT-5.4',
    description:
      'Best structured logic, tightest puzzle plotting. Less literary prose ($2.50/$15 per Mtok).',
  },
];

export const DEFAULT_MODEL: QuestAIModel = 'claude-sonnet-4-6';

export const MODEL_PRICING: Record<QuestAIModel, { input: number; output: number; maxOutput: number }> = {
  'claude-opus-4-7':   { input: 5,   output: 25, maxOutput: 128000 },
  'claude-sonnet-4-6': { input: 3,   output: 15, maxOutput: 64000  },
  'gpt-5.4':           { input: 2.5, output: 15, maxOutput: 128000 },
};

// ── Length & detail tiers ────────────────────────────────────────────────────

/** Generic length names — used in Settings dropdown (scope-agnostic). */
export const LENGTH_TIER_NAMES: readonly [string, string, string, string, string] =
  ['Encounter', 'Short', 'Medium', 'Long', 'Epic'];

/** Detail axis pill labels. */
export const DETAIL_TIER_NAMES: readonly [string, string, string, string, string] =
  ['Sketch', 'Draft', 'Standard', 'Polished', 'Final'];

/**
 * Scope-dependent length pill labels. Adapted to the real questVocabulary.json
 * scopes. hook_only / sandbox_rumor are seeds / passive lore — no length axis.
 */
export const LENGTH_LABELS_BY_SCOPE: Record<QuestScope, [string, string, string, string, string]> = {
  hook_only:        ['n/a', 'n/a', 'n/a', 'n/a', 'n/a'],
  single_encounter: ['5 min', '15 min', '30 min', '1 hr', '2 hrs'],
  one_shot:         ['2 hrs', '3 hrs', '1 session', '1 long session', '2 sessions'],
  side_quest:       ['1 session', '1-2 sessions', '2-3 sessions', '3-5 sessions', '5+ sessions'],
  multi_session:    ['1-2 sessions', '2-4 sessions', '3-6 sessions', '5-8 sessions', '8-12 sessions'],
  campaign_arc:     ['3-5 sessions', '5-10 sessions', '10-15 sessions', '15-25 sessions', '25+ sessions'],
  sandbox_rumor:    ['n/a', 'n/a', 'n/a', 'n/a', 'n/a'],
};

/** Scopes where the length axis is meaningless — picker is hidden, length pinned to 0. */
export const SCOPES_WITHOUT_LENGTH: ReadonlySet<QuestScope> =
  new Set<QuestScope>(['hook_only', 'sandbox_rumor']);

// ── Token matrix ─────────────────────────────────────────────────────────────

/** Base output tokens for each [lengthIdx][detailIdx] combination. */
export const TOKEN_BASE: readonly (readonly number[])[] = [
  // Sketch  Draft   Standard  Polished  Final
  [  2000,   3000,   4000,     6000,     8000  ],  // Encounter length
  [  4000,   6000,   9000,    14000,    20000  ],  // Short
  [  7000,  11000,  16000,    24000,    32000  ],  // Medium
  [ 10000,  16000,  24000,    35000,    48000  ],  // Long
  [ 15000,  22000,  32000,    45000,    60000  ],  // Epic
];

export const SCOPE_MULTIPLIER: Record<QuestScope, number> = {
  hook_only:        0.2,
  single_encounter: 0.4,
  one_shot:         0.8,
  side_quest:       0.7,
  multi_session:    1.0,
  campaign_arc:     1.5,
  sandbox_rumor:    0.2,
};

/** Per-scope sensible starting length + detail. */
export const SCOPE_DEFAULTS: Record<QuestScope, { length: Tier; detail: Tier }> = {
  hook_only:        { length: 0, detail: 1 },
  single_encounter: { length: 2, detail: 2 },
  one_shot:         { length: 2, detail: 2 },
  side_quest:       { length: 2, detail: 2 },
  multi_session:    { length: 2, detail: 2 },
  campaign_arc:     { length: 1, detail: 1 },
  sandbox_rumor:    { length: 0, detail: 1 },
};

export function calculateMaxTokens(scope: QuestScope, lengthIdx: Tier, detailIdx: Tier): number {
  const base = TOKEN_BASE[lengthIdx][detailIdx];
  const mult = SCOPE_MULTIPLIER[scope] ?? 1.0;
  return Math.round(base * mult);
}

// ── Price estimation ─────────────────────────────────────────────────────────

/** Our quest prompts are large but fixed-ish — treat input as a constant. */
const INPUT_TOKEN_ESTIMATE = 3000;

/** Approximate EUR/USD rate, May 2026 — can be made configurable later. */
const EUR_PER_USD = 0.92;

export function estimateMaxCostUSD(model: QuestAIModel, maxOutputTokens: number): number {
  const p = MODEL_PRICING[model];
  const inputCost  = (INPUT_TOKEN_ESTIMATE / 1_000_000) * p.input;
  const outputCost = (maxOutputTokens / 1_000_000) * p.output;
  return inputCost + outputCost;
}

export function formatPrice(usd: number): string {
  const eur = usd * EUR_PER_USD;
  return `$${usd.toFixed(2)} / €${eur.toFixed(2)}`;
}

// ── Token cap enforcement ────────────────────────────────────────────────────

/** Above this, a generation is flagged as large even if under the model's cap. */
export const LARGE_GENERATION_THRESHOLD = 50000;

export function applyTokenCap(
  requested: number,
  model: QuestAIModel,
): { capped: number; warning: string | null } {
  const max = MODEL_PRICING[model].maxOutput;
  if (requested <= max) {
    return { capped: requested, warning: null };
  }
  return {
    capped: max,
    warning:
      `Requested ${requested.toLocaleString()} tokens exceeds ${model}'s max output of ${max.toLocaleString()}. ` +
      `Generation will be slow and expensive at this size. ` +
      `Consider "Generate in chunks" (coming soon) for very long quests.`,
  };
}

// ── Global defaults (localStorage) ───────────────────────────────────────────

export const LS_DEFAULT_MODEL  = 'quest-default-model';
export const LS_DEFAULT_LENGTH = 'quest-default-length-tier';
export const LS_DEFAULT_DETAIL = 'quest-default-detail-tier';

function clampTier(raw: string | null, fallback: Tier): Tier {
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0 && n <= 4) return n as Tier;
  return fallback;
}

export function readDefaultModel(): QuestAIModel {
  const v = localStorage.getItem(LS_DEFAULT_MODEL);
  return v && v in MODEL_PRICING ? (v as QuestAIModel) : DEFAULT_MODEL;
}

export function readDefaultLengthTier(): Tier {
  return clampTier(localStorage.getItem(LS_DEFAULT_LENGTH), 2);
}

export function readDefaultDetailTier(): Tier {
  return clampTier(localStorage.getItem(LS_DEFAULT_DETAIL), 2);
}
