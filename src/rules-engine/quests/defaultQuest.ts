/**
 * Factory functions for creating new quest data with sensible defaults.
 *
 * Every form in the QuestEditor uses these — when the user clicks
 * "Add hook" or "Add clue", we call the corresponding default*() factory.
 * All factories generate stable unique IDs.
 *
 * Pure functions — no API calls, no React hooks, no side effects.
 */

import type {
  AIGenerationParams,
  Clue,
  Complication,
  Hook,
  MoralDilemma,
  Objective,
  ObjectiveType,
  PlotBeat,
  QuestData,
  QuestDifficulty,
  QuestRewardItem,
  QuestRewards,
  Rumor,
} from './questSchema';

// ── ID generation ─────────────────────────────────────────────────────────────

/**
 * Generate a short, readable, locally-unique ID with a type prefix.
 * Format: <prefix>_<base36-timestamp>_<random5>
 * Example: "h_lxk3a8_pq12r"
 *
 * Not cryptographically unique — fine for client-side keys in a JSONB blob.
 * Collisions are astronomically unlikely within a single quest.
 */
export function mkQuestId(prefix: string): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${ts}_${rand}`;
}

// ── Party info input shape ───────────────────────────────────────────────────

/**
 * Optional party context passed when creating a new quest. When provided,
 * the difficulty block is pre-filled from these values and the source is
 * marked as 'auto'. When omitted, defaults to manual entry.
 */
export interface PartyInfo {
  size: number;
  /** Average party level — usually computed from campaign characters */
  avg_level: number;
}

// ── Nested factories ──────────────────────────────────────────────────────────

export function defaultHook(): Hook {
  return {
    id: mkQuestId('h'),
    text: '',
    delivery: 'encounter',
    source_npc_id: null,
  };
}

export function defaultObjective(type: ObjectiveType = 'main'): Objective {
  return {
    id: mkQuestId('o'),
    text: '',
    type,
    done: false,
    dm_notes: '',
  };
}

export function defaultPlotBeat(): PlotBeat {
  return {
    id: mkQuestId('b'),
    title: '',
    description: '',
    act: null,
    tier: null,
    expected_level: null,
    encounter_ids: [],
    npc_ids: [],
  };
}

export function defaultClue(): Clue {
  return {
    id: mkQuestId('c'),
    text: '',
    location: '',
    source_npc_id: null,
    reveals: '',
    clarity: 'moderate',
    if_misunderstood: '',
    backup_clue_id: null,
  };
}

export function defaultRumor(): Rumor {
  return {
    id: mkQuestId('r'),
    text: '',
    location: '',
    source_npc_id: null,
    is_true: true,
    actual_truth: '',
  };
}

export function defaultComplication(): Complication {
  return {
    id: mkQuestId('cp'),
    preset_slug: null,
    text: '',
    trigger: '',
    npc_ids: [],
  };
}

export function defaultMoralDilemma(): MoralDilemma {
  return {
    preset_slug: null,
    setup: '',
    options: [
      { label: '', consequence: '' },
      { label: '', consequence: '' },
    ],
  };
}

export function defaultRewardItem(): QuestRewardItem {
  return {
    magical_item_id: null,
    name: '',
    description: '',
  };
}

function defaultRewards(): QuestRewards {
  return {
    xp: 0,
    gold: 0,
    items: [],
    story: [],
  };
}

// ── Difficulty factory (handles party info hybrid) ───────────────────────────

function defaultDifficulty(partyInfo?: PartyInfo): QuestDifficulty {
  if (partyInfo) {
    // Auto from campaign — DM can still override afterwards
    const lvl = Math.max(1, Math.round(partyInfo.avg_level));
    return {
      party_level_source: 'auto',
      recommended_party_size: partyInfo.size,
      level_range: {
        min: Math.max(1, lvl - 1),
        max: lvl + 1,
      },
      captured_party_level: partyInfo.avg_level,
      overall_difficulty: 'standard',
      expected_sessions: null,
      total_xp_budget: null,
      quest_completion_xp: null,
      scaling_notes: '',
    };
  }
  // Manual fallback — DM fills it in
  return {
    party_level_source: 'manual',
    recommended_party_size: 4,
    level_range: { min: 1, max: 3 },
    captured_party_level: null,
    overall_difficulty: 'standard',
    expected_sessions: null,
    total_xp_budget: null,
    quest_completion_xp: null,
    scaling_notes: '',
  };
}

// ── AI generation params factory ──────────────────────────────────────────────

/**
 * Empty AI generation params — used as the starting point for the
 * "Generate quest" dialog. Pre-fills party info if available.
 */
export function defaultAIGenerationParams(partyInfo?: PartyInfo): AIGenerationParams {
  return {
    scope: null,
    quest_types: [],
    tones: [],
    environments: [],
    primary_challenges: [],
    antagonist_types: [],
    include_moral_dilemma: false,
    include_complications: 0,
    party_size: partyInfo?.size ?? 4,
    party_level: partyInfo ? Math.max(1, Math.round(partyInfo.avg_level)) : 3,
    difficulty: 'standard',
    custom_prompt: '',
  };
}

// ── Top-level factory ─────────────────────────────────────────────────────────

/**
 * Create an empty quest with all fields populated to safe defaults.
 *
 * If partyInfo is provided, the difficulty block is auto-filled from the
 * campaign's current party (source = 'auto'). Otherwise, the DM enters it
 * manually (source = 'manual').
 *
 * Status defaults to 'concept' — every new quest starts as an idea.
 */
export function defaultQuest(partyInfo?: PartyInfo): QuestData {
  return {
    title: '',
    pitch: '',
    scope: 'side_quest',
    status: 'concept',
    time_pressure: 'none',

    quest_types: [],
    tones: [],
    environments: [],
    primary_challenges: [],
    antagonist_types: [],

    difficulty: defaultDifficulty(partyInfo),

    hooks: [],
    objectives: [],
    plot_beats: [],
    clues: [],
    rumors: [],
    complications: [],
    moral_dilemma: null,

    rewards: defaultRewards(),

    npc_ids: [],
    map_ids: [],
    poi_ids: [],
    encounter_ids: [],
    parent_quest_id: null,

    dm_notes: '',
    player_summary: '',
    discovered_clues: [],
    discovered_rumors: [],

    ai_generated: false,
    ai_generation_params: null,
  };
}

// ── Specialized starting points ───────────────────────────────────────────────

/**
 * Convenience factory for a "hook only" quest — these are typically the
 * output of the "Generate 10 hooks" batch button. Smaller defaults that
 * reflect the lighter intent.
 */
export function defaultHookQuest(partyInfo?: PartyInfo): QuestData {
  const quest = defaultQuest(partyInfo);
  return {
    ...quest,
    scope: 'hook_only',
    status: 'concept',
  };
}

/**
 * Convenience factory for sandbox rumors — passive world lore. These
 * typically have no objectives or rewards until promoted to a real quest.
 */
export function defaultSandboxRumor(partyInfo?: PartyInfo): QuestData {
  const quest = defaultQuest(partyInfo);
  return {
    ...quest,
    scope: 'sandbox_rumor',
    status: 'concept',
    // Sandbox rumors don't have difficulty until promoted — null out the snapshot
    difficulty: {
      ...quest.difficulty,
      captured_party_level: null,
    },
  };
}
