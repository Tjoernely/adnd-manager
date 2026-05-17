/**
 * Quest AI orchestrator — main entry point for AI-driven quest generation.
 *
 * Flow for generateFullQuest:
 *   1. Build prompt via questPrompts.buildFullQuestPrompt
 *   2. Call Claude via callClaude (existing aiClient proxy)
 *   3. Parse JSON response (robust to markdown fences)
 *   4. Resolve NPCs (fuzzy match + auto-create) via npcResolution
 *   5. Convert AI response into QuestData with stable IDs and resolved NPC refs
 *   6. Return QuestData + resolved map (caller saves quest, then finalizes affiliations)
 *
 * ASSUMED callClaude signature (verify against src/api/aiClient.js):
 *   callClaude({ systemPrompt, userPrompt, maxTokens }): Promise<string>
 */

import { callClaude } from '../../api/aiClient';
import {
  buildFullQuestPrompt,
  buildHookBatchPrompt,
  type FullQuestPromptParams,
  type HookBatchPromptParams,
} from './questPrompts';
import {
  defaultQuest,
  mkQuestId,
  type PartyInfo,
} from './defaultQuest';
import {
  resolveQuestNPCs,
  finalizeAffiliationsForCampaign,
  type NPCSuggestion,
  type ResolvedNPCMap,
} from './npcResolution';
import {
  ALL_SCOPES,
  ALL_HOOK_DELIVERIES,
  ALL_OBJECTIVE_TYPES,
  ALL_CLUE_CLARITIES,
  ALL_PLOT_BEAT_TIERS,
  ALL_TIME_PRESSURES,
  type QuestData,
  type Hook,
  type Objective,
  type PlotBeat,
  type Clue,
  type Rumor,
  type Complication,
  type MoralDilemma,
  type QuestRewardItem,
  type AIGenerationParams,
  type QuestType,
  type QuestTone,
  type QuestEnvironment,
  type QuestPrimaryChallenge,
  type QuestAntagonistType,
} from './questSchema';

// Vocab arrays — used for slug validation on AI output
const ALL_QUEST_TYPES: readonly QuestType[] = [
  'rescue','investigation','escort','delivery','monster_problem','missing_person',
  'political_intrigue','heist','exploration','diplomacy','curse_haunting',
  'ancient_ruin','faction_conflict','revenge','moral_dilemma','survival',
  'siege_defense','mystery','treasure_hunt','pilgrimage',
] as const;
const ALL_TONES: readonly QuestTone[] = [
  'grim','heroic','weird','folkloric','gothic','sword_and_sorcery','political',
  'low_fantasy','high_fantasy','dark_fairy_tale','pulp_adventure','tragic','comedic',
] as const;
const ALL_ENVIRONMENTS: readonly QuestEnvironment[] = [
  'village','city','wilderness','road','forest','swamp','mountains','desert',
  'coast','dungeon','ruin','temple','castle','underworld','fey_realm',
  'shadow_realm','planar_location',
] as const;
const ALL_PRIMARY_CHALLENGES: readonly QuestPrimaryChallenge[] = [
  'combat','investigation','social','exploration','puzzle','survival','moral_choice',
  'stealth','resource_management','race_against_time','negotiation','travel_hazard',
] as const;
const ALL_ANTAGONISTS: readonly QuestAntagonistType[] = [
  'monster','bandits','cult','noble','merchant_faction','rival_adventurers',
  'cursed_spirit','ancient_evil','corrupt_official','desperate_commoners',
  'outsider_entity','misunderstood_creature','natural_disaster','internal_betrayal',
] as const;

// ── Result types ─────────────────────────────────────────────────────────────

export interface GenerateFullQuestResult {
  /** QuestData ready to be saved via api.createQuest */
  quest: QuestData;
  /** NPCs touched during generation (caller passes to finalizeAffiliationsForCampaign after save) */
  resolvedNPCs: ResolvedNPCMap;
  /** Raw AI response — useful for debugging. Normally a parsed object since callClaude pre-parses. */
  rawResponse: unknown;
}

export interface GeneratedHook {
  hook: Hook;
  tone_hint: string | null;
  environment_hint: string | null;
}

export interface GenerateHookBatchResult {
  hooks: GeneratedHook[];
  rawResponse: unknown;
}

// ── AI response shapes ───────────────────────────────────────────────────────

interface AIFullQuestResponse {
  title?: string;
  pitch?: string;
  scope?: string;
  quest_types?: string[];
  tones?: string[];
  environments?: string[];
  primary_challenges?: string[];
  antagonist_types?: string[];
  time_pressure?: string;
  hooks?: Array<{ text: string; delivery: string; source_npc_name: string | null }>;
  objectives?: Array<{ text: string; type: string; dm_notes: string }>;
  plot_beats?: Array<{
    title: string; description: string; act: number; tier: string;
    expected_level: number; npc_names: string[]; encounter_hint: string;
  }>;
  clues?: Array<{
    text: string; location: string; reveals: string; clarity: string;
    if_misunderstood: string; backup_index: number | null; source_npc_name: string | null;
  }>;
  rumors?: Array<{
    text: string; location: string; is_true: boolean; actual_truth: string;
    source_npc_name: string | null;
  }>;
  complications?: Array<{ text: string; trigger: string; npc_names: string[] }>;
  moral_dilemma?: { setup: string; options: Array<{ label: string; consequence: string }> } | null;
  rewards?: {
    xp: number; gold: number;
    items?: Array<{ name: string; description: string }>;
    story?: string[];
  };
  npc_suggestions?: NPCSuggestion[];
  dm_notes?: string;
  player_summary?: string;
}

interface AIHookBatchResponse {
  hooks?: Array<{
    text: string; delivery: string;
    tone_hint: string | null; environment_hint: string | null;
  }>;
}

// ── JSON extraction & parsing ────────────────────────────────────────────────
//
// callClaude (src/api/aiClient.js) already runs extractJSON() and JSON.parse()
// internally, so the returned value is normally an object. We still handle
// strings defensively in case the wrapper behavior changes — better fail-soft
// than crash.

function extractJSON(raw: string): string {
  let s = raw.trim();
  // Strip markdown fences if AI ignored instructions
  s = s.replace(/^```json\s*\n?/i, '').replace(/^```\s*\n?/, '');
  s = s.replace(/\n?```\s*$/, '');
  // Strip any preamble before the first {
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace > 0 && lastBrace > firstBrace) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  return s.trim();
}

function parseAIResponse<T>(raw: unknown, mode: string): T {
  // Already an object (the normal path — callClaude does the parsing)
  if (raw !== null && typeof raw === 'object') {
    return raw as T;
  }
  // Fallback: if we got a string for some reason, parse it ourselves
  if (typeof raw === 'string') {
    const cleaned = extractJSON(raw);
    try {
      return JSON.parse(cleaned) as T;
    } catch (e) {
      throw new Error(
        `Could not parse AI ${mode} response as JSON: ${(e as Error).message}\n` +
        `Preview: ${cleaned.slice(0, 250)}...`
      );
    }
  }
  throw new Error(`Unexpected AI ${mode} response type: ${typeof raw}`);
}

// ── Slug validation ──────────────────────────────────────────────────────────

function validSlug<T extends string>(
  value: unknown,
  validList: readonly T[],
  fallback: T,
  field: string
): T {
  if (typeof value === 'string' && (validList as readonly string[]).includes(value)) {
    return value as T;
  }
  if (value !== undefined && value !== null && value !== '') {
    console.warn(`AI returned unknown ${field}: "${value}" — using "${fallback}"`);
  }
  return fallback;
}

function validSlugList<T extends string>(
  values: unknown,
  validList: readonly T[],
  _field: string
): T[] {
  if (!Array.isArray(values)) return [];
  return values
    .filter((v): v is string => typeof v === 'string')
    .filter(v => (validList as readonly string[]).includes(v)) as T[];
}

// ── Full quest generation ────────────────────────────────────────────────────

export async function generateFullQuest(
  params: FullQuestPromptParams,
  partyInfo: PartyInfo | undefined,
  campaignId: number
): Promise<GenerateFullQuestResult> {
  const prompt = buildFullQuestPrompt(params);
  const rawResponse = await callClaude({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    maxTokens: prompt.maxTokens,
    model: prompt.model,
  });

  const ai = parseAIResponse<AIFullQuestResponse>(rawResponse, 'full quest');

  // Step 1: Resolve NPCs first (we need IDs before converting other fields)
  const resolvedNPCs = await resolveQuestNPCs(ai.npc_suggestions ?? [], campaignId);

  // Step 2: Convert AI response to QuestData
  const quest = aiResponseToQuestData(ai, params, partyInfo, resolvedNPCs);

  return { quest, resolvedNPCs, rawResponse };
}

// ── Conversion: AI response → QuestData ──────────────────────────────────────

function aiResponseToQuestData(
  ai: AIFullQuestResponse,
  params: FullQuestPromptParams,
  partyInfo: PartyInfo | undefined,
  resolved: ResolvedNPCMap
): QuestData {
  const base = defaultQuest(partyInfo);

  // NPC name → ID helpers
  const npcId = (name: string | null | undefined): number | null => {
    if (!name || typeof name !== 'string') return null;
    return resolved.nameToId.get(name.trim()) ?? null;
  };
  const npcIds = (names: unknown): number[] => {
    if (!Array.isArray(names)) return [];
    return names
      .map(n => (typeof n === 'string' ? npcId(n) : null))
      .filter((id): id is number => id !== null);
  };

  // — Identity & taxonomy —
  base.title = (ai.title ?? '').trim() || 'Untitled quest';
  base.pitch = (ai.pitch ?? '').trim();
  base.scope = validSlug(ai.scope, ALL_SCOPES, params.scope ?? 'side_quest', 'scope');
  base.time_pressure = validSlug(ai.time_pressure, ALL_TIME_PRESSURES, 'none', 'time_pressure');
  base.quest_types = validSlugList(ai.quest_types, ALL_QUEST_TYPES, 'quest_types');
  base.tones = validSlugList(ai.tones, ALL_TONES, 'tones');
  base.environments = validSlugList(ai.environments, ALL_ENVIRONMENTS, 'environments');
  base.primary_challenges = validSlugList(ai.primary_challenges, ALL_PRIMARY_CHALLENGES, 'primary_challenges');
  base.antagonist_types = validSlugList(ai.antagonist_types, ALL_ANTAGONISTS, 'antagonist_types');

  // — Difficulty — overlay AI's expected level onto difficulty if not auto —
  if (params.party_size != null) base.difficulty.recommended_party_size = params.party_size;
  if (params.party_level != null) {
    const lvl = params.party_level;
    base.difficulty.level_range = { min: Math.max(1, lvl - 1), max: lvl + 1 };
    if (base.difficulty.party_level_source === 'manual') {
      base.difficulty.captured_party_level = lvl;
    }
  }
  if (params.difficulty) base.difficulty.overall_difficulty = params.difficulty;

  // — Hooks —
  base.hooks = (ai.hooks ?? []).map<Hook>(h => ({
    id: mkQuestId('h'),
    text: h.text ?? '',
    delivery: validSlug(h.delivery, ALL_HOOK_DELIVERIES, 'encounter', 'hook.delivery'),
    source_npc_id: npcId(h.source_npc_name),
  }));

  // — Objectives —
  base.objectives = (ai.objectives ?? []).map<Objective>(o => ({
    id: mkQuestId('o'),
    text: o.text ?? '',
    type: validSlug(o.type, ALL_OBJECTIVE_TYPES, 'main', 'objective.type'),
    done: false,
    dm_notes: o.dm_notes ?? '',
  }));

  // — Plot beats —
  base.plot_beats = (ai.plot_beats ?? []).map<PlotBeat>(b => {
    const act = b.act === 1 || b.act === 2 || b.act === 3 ? b.act : null;
    return {
      id: mkQuestId('b'),
      title: b.title ?? '',
      description: b.description ?? '',
      act,
      tier: validSlug(b.tier, ALL_PLOT_BEAT_TIERS, 'intro', 'plot_beat.tier'),
      expected_level: typeof b.expected_level === 'number' ? b.expected_level : null,
      npc_ids: npcIds(b.npc_names),
      encounter_ids: [],
    };
  });

  // — Clues — first pass: create clues with IDs (no backup links yet)
  const clueIds: string[] = (ai.clues ?? []).map(() => mkQuestId('c'));
  base.clues = (ai.clues ?? []).map<Clue>((c, i) => {
    // Resolve backup_index (0-based array index) → backup clue ID
    const backupId = (typeof c.backup_index === 'number'
      && c.backup_index >= 0
      && c.backup_index < clueIds.length
      && c.backup_index !== i)
      ? clueIds[c.backup_index]
      : null;
    return {
      id: clueIds[i],
      text: c.text ?? '',
      location: c.location ?? '',
      source_npc_id: npcId(c.source_npc_name),
      reveals: c.reveals ?? '',
      clarity: validSlug(c.clarity, ALL_CLUE_CLARITIES, 'moderate', 'clue.clarity'),
      if_misunderstood: c.if_misunderstood ?? '',
      backup_clue_id: backupId,
    };
  });

  // — Rumors —
  base.rumors = (ai.rumors ?? []).map<Rumor>(r => ({
    id: mkQuestId('r'),
    text: r.text ?? '',
    location: r.location ?? '',
    source_npc_id: npcId(r.source_npc_name),
    is_true: r.is_true !== false,
    actual_truth: r.actual_truth ?? '',
  }));

  // — Complications —
  base.complications = (ai.complications ?? []).map<Complication>(c => ({
    id: mkQuestId('cp'),
    preset_slug: null,
    text: c.text ?? '',
    trigger: c.trigger ?? '',
    npc_ids: npcIds(c.npc_names),
  }));

  // — Moral dilemma —
  if (ai.moral_dilemma && typeof ai.moral_dilemma === 'object') {
    const md: MoralDilemma = {
      preset_slug: null,
      setup: ai.moral_dilemma.setup ?? '',
      options: Array.isArray(ai.moral_dilemma.options)
        ? ai.moral_dilemma.options.map(o => ({
            label: o?.label ?? '',
            consequence: o?.consequence ?? '',
          }))
        : [],
    };
    base.moral_dilemma = md;
  }

  // — Rewards —
  if (ai.rewards) {
    base.rewards = {
      xp: Math.max(0, Number(ai.rewards.xp) || 0),
      gold: Math.max(0, Number(ai.rewards.gold) || 0),
      items: (ai.rewards.items ?? []).map<QuestRewardItem>(it => ({
        magical_item_id: null,
        name: it?.name ?? '',
        description: it?.description ?? '',
      })),
      story: Array.isArray(ai.rewards.story)
        ? ai.rewards.story.filter((s): s is string => typeof s === 'string')
        : [],
    };
  }

  // — Notes —
  base.dm_notes = ai.dm_notes ?? '';
  base.player_summary = ai.player_summary ?? '';

  // — NPC IDs — all resolved NPCs become quest cast —
  base.npc_ids = resolved.entries.map(e => e.id);

  // — Provenance —
  base.ai_generated = true;
  base.ai_generation_params = paramsToStoredAIParams(params, partyInfo);

  return base;
}

function paramsToStoredAIParams(
  params: FullQuestPromptParams,
  partyInfo: PartyInfo | undefined
): AIGenerationParams {
  return {
    scope: params.scope ?? null,
    quest_types: params.quest_types ?? [],
    tones: params.tones ?? [],
    environments: params.environments ?? [],
    primary_challenges: params.primary_challenges ?? [],
    antagonist_types: params.antagonist_types ?? [],
    include_moral_dilemma: params.include_moral_dilemma ?? false,
    include_complications: params.include_complications ?? 0,
    party_size: params.party_size ?? partyInfo?.size ?? 4,
    party_level: params.party_level ?? (partyInfo ? Math.round(partyInfo.avg_level) : 3),
    difficulty: params.difficulty ?? 'standard',
    custom_prompt: params.custom_prompt ?? '',
  };
}

// ── Hook batch generation ────────────────────────────────────────────────────

export async function generateHookBatch(
  params: HookBatchPromptParams
): Promise<GenerateHookBatchResult> {
  const prompt = buildHookBatchPrompt(params);
  const rawResponse = await callClaude({
    systemPrompt: prompt.systemPrompt,
    userPrompt: prompt.userPrompt,
    maxTokens: prompt.maxTokens,
  });

  const ai = parseAIResponse<AIHookBatchResponse>(rawResponse, 'hook batch');
  const hooks: GeneratedHook[] = (ai.hooks ?? []).map(h => ({
    hook: {
      id: mkQuestId('h'),
      text: h.text ?? '',
      delivery: validSlug(h.delivery, ALL_HOOK_DELIVERIES, 'encounter', 'hook.delivery'),
      source_npc_id: null,
    },
    tone_hint: typeof h.tone_hint === 'string' ? h.tone_hint : null,
    environment_hint: typeof h.environment_hint === 'string' ? h.environment_hint : null,
  }));

  return { hooks, rawResponse };
}

// ── Re-export finalize for convenience ───────────────────────────────────────

export { finalizeAffiliationsForCampaign };
