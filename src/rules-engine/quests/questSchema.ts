/**
 * Quest data schema — TypeScript types for the quest module.
 *
 * The runtime "source of truth" for taxonomy values is the JSON vocabulary
 * files in src/rulesets/quests/. These types mirror those slugs as literal
 * unions for compile-time safety. If you add a slug in a JSON file, add it
 * here too — otherwise TypeScript won't catch typos.
 *
 * Storage: this shape is stored in the quests.data JSONB column. The DB row
 * has additional fields (id, campaign_id, created_at, updated_at) — see
 * QuestRecord below.
 */

// ── Taxonomy types (mirror questVocabulary.json) ──────────────────────────────

export type QuestScope =
  | 'hook_only'
  | 'single_encounter'
  | 'one_shot'
  | 'side_quest'
  | 'multi_session'
  | 'campaign_arc'
  | 'sandbox_rumor';

export type QuestType =
  | 'rescue' | 'investigation' | 'escort' | 'delivery' | 'monster_problem'
  | 'missing_person' | 'political_intrigue' | 'heist' | 'exploration' | 'diplomacy'
  | 'curse_haunting' | 'ancient_ruin' | 'faction_conflict' | 'revenge' | 'moral_dilemma'
  | 'survival' | 'siege_defense' | 'mystery' | 'treasure_hunt' | 'pilgrimage';

export type QuestTone =
  | 'grim' | 'heroic' | 'weird' | 'folkloric' | 'gothic' | 'sword_and_sorcery'
  | 'political' | 'low_fantasy' | 'high_fantasy' | 'dark_fairy_tale'
  | 'pulp_adventure' | 'tragic' | 'comedic';

export type QuestEnvironment =
  | 'village' | 'city' | 'wilderness' | 'road' | 'forest' | 'swamp'
  | 'mountains' | 'desert' | 'coast' | 'dungeon' | 'ruin' | 'temple'
  | 'castle' | 'underworld' | 'fey_realm' | 'shadow_realm' | 'planar_location';

export type QuestPrimaryChallenge =
  | 'combat' | 'investigation' | 'social' | 'exploration' | 'puzzle' | 'survival'
  | 'moral_choice' | 'stealth' | 'resource_management' | 'race_against_time'
  | 'negotiation' | 'travel_hazard';

export type QuestAntagonistType =
  | 'monster' | 'bandits' | 'cult' | 'noble' | 'merchant_faction' | 'rival_adventurers'
  | 'cursed_spirit' | 'ancient_evil' | 'corrupt_official' | 'desperate_commoners'
  | 'outsider_entity' | 'misunderstood_creature' | 'natural_disaster' | 'internal_betrayal';

// ── Status & pressure ─────────────────────────────────────────────────────────

/** Kanban columns: concept → draft → ready → running → (completed | failed | abandoned) */
export type QuestStatus =
  | 'concept'    // ren idé, ikke planlagt
  | 'draft'      // bliver bygget
  | 'ready'      // klar til at køre
  | 'running'    // aktiv lige nu
  | 'completed'  // afsluttet med succes
  | 'failed'     // afsluttet med fiasko
  | 'abandoned'; // droppet undervejs

export type QuestTimePressure = 'none' | 'soft' | 'hard';

// ── Difficulty & pacing ───────────────────────────────────────────────────────

/** Mirrors the encounter builder's difficulty tiers for consistency. */
export type DifficultyTier = 'easy' | 'standard' | 'tough' | 'deadly';

/** Was party_size/level set automatically from campaign characters, or by hand? */
export type PartyLevelSource = 'auto' | 'manual';

export interface QuestDifficulty {
  /** auto = computed from campaign characters; manual = DM typed it in */
  party_level_source: PartyLevelSource;
  recommended_party_size: number;
  level_range: { min: number; max: number };
  /**
   * Snapshot of average party level at quest creation (or last manual edit).
   * Used to warn when the actual party has outgrown the quest. Null if quest
   * has never been linked to a party (e.g. pure templates).
   */
  captured_party_level: number | null;
  overall_difficulty: DifficultyTier;
  /** Estimated sessions to complete; null = unknown */
  expected_sessions: number | null;
  /** Sum of all encounter XP + completion XP; null = not budgeted yet */
  total_xp_budget: number | null;
  /** XP awarded for finishing the quest itself (separate from encounter XP) */
  quest_completion_xp: number | null;
  /** Free-text DM notes on how to scale up/down */
  scaling_notes: string;
}

// ── Plot beats (three-act structure with level pacing) ────────────────────────

export type PlotBeatTier =
  | 'intro'
  | 'rising_action'
  | 'midpoint'
  | 'climax'
  | 'resolution';

export interface PlotBeat {
  id: string;
  title: string;
  description: string;
  /** Three-act position. Null = unstructured/short quest. */
  act: 1 | 2 | 3 | null;
  tier: PlotBeatTier | null;
  /** What party level should be at when this beat is played */
  expected_level: number | null;
  /** Encounters from saved-encounters table that occur in this beat */
  encounter_ids: number[];
  /** NPCs that appear in this beat */
  npc_ids: number[];
}

// ── Hooks (how the party encounters the quest) ────────────────────────────────

export type HookDelivery =
  | 'encounter'      // partyen møder en NPC
  | 'rumor'          // overhørt i taverne
  | 'letter'         // skriftligt opslag eller brev
  | 'vision'         // drømme eller syner
  | 'discovery'      // partyen finder noget der peger
  | 'environmental'; // verden selv viser tegn

export interface Hook {
  id: string;
  text: string;
  delivery: HookDelivery;
  /** NPC der leverer hook'en (optional — environmental/discovery har sjældent en NPC) */
  source_npc_id: number | null;
}

// ── Objectives ────────────────────────────────────────────────────────────────

export type ObjectiveType =
  | 'main'   // hoved-mål — skal opfyldes for at quest tæller som complete
  | 'side'   // bi-mål — ekstra belønning
  | 'hidden'; // hemmeligt — DM kender det, spillerne ikke (endnu)

export interface Objective {
  id: string;
  text: string;
  type: ObjectiveType;
  done: boolean;
  /** DM-only notes about how this objective is achieved */
  dm_notes: string;
}

// ── Clues (structured for investigations and mysteries) ───────────────────────

export type ClueClarity = 'obvious' | 'moderate' | 'subtle' | 'cryptic';

export interface Clue {
  id: string;
  text: string;
  /** Where can this clue be physically found? */
  location: string;
  /** NPC der kan give clue'en på spørgsmål (optional) */
  source_npc_id: number | null;
  /** What truth does this clue point toward? */
  reveals: string;
  clarity: ClueClarity;
  /** What might players wrongly conclude if they misread this? */
  if_misunderstood: string;
  /** Backup clue — if players miss this one, they can still find the truth */
  backup_clue_id: string | null;
}

// ── Rumors (tavern talk — mix of true and false) ──────────────────────────────

export interface Rumor {
  id: string;
  text: string;
  /** Where/how it's typically heard (tavern name, market, specific NPC type) */
  location: string;
  /** NPC who knows / might share this (optional) */
  source_npc_id: number | null;
  is_true: boolean;
  /** If false, what's the actual truth? (DM reference) */
  actual_truth: string;
}

// ── Complications ─────────────────────────────────────────────────────────────

export interface Complication {
  id: string;
  /** Slug from complicationPresets.json. Null for custom complications. */
  preset_slug: string | null;
  text: string;
  /** When in the quest does this complication trigger? */
  trigger: string;
  /** NPCs involved in this complication */
  npc_ids: number[];
}

// ── Moral dilemma (single optional block per quest) ───────────────────────────

export interface MoralDilemmaOption {
  label: string;
  consequence: string;
}

export interface MoralDilemma {
  /** Slug from moralDilemmaPresets.json. Null for custom dilemmas. */
  preset_slug: string | null;
  setup: string;
  options: MoralDilemmaOption[];
}

// ── Rewards ───────────────────────────────────────────────────────────────────

export interface QuestRewardItem {
  /** Reference to magical_items table (null for narrative-only loot) */
  magical_item_id: number | null;
  name: string;
  description: string;
}

export interface QuestRewards {
  xp: number;
  gold: number;
  items: QuestRewardItem[];
  /** Narrative rewards: titles, reputation, favors, faction standing */
  story: string[];
}

// ── AI generation metadata ───────────────────────────────────────────────────

/** Parameters used when AI generated (or expanded) this quest. Stored for re-generation. */
export interface AIGenerationParams {
  scope: QuestScope | null;
  quest_types: QuestType[];
  tones: QuestTone[];
  environments: QuestEnvironment[];
  primary_challenges: QuestPrimaryChallenge[];
  antagonist_types: QuestAntagonistType[];
  include_moral_dilemma: boolean;
  /** How many complications AI should add (0-3) */
  include_complications: number;
  party_size: number;
  party_level: number;
  difficulty: DifficultyTier;
  /** Optional free-form DM prompt added on top of structured params */
  custom_prompt: string;
}

// ── Main quest data shape (stored in quests.data JSONB) ──────────────────────

export interface QuestData {
  // — Identity & status —
  title: string;
  pitch: string;
  scope: QuestScope;
  status: QuestStatus;
  time_pressure: QuestTimePressure;

  // — Taxonomy (all multi-select) —
  quest_types: QuestType[];
  tones: QuestTone[];
  environments: QuestEnvironment[];
  primary_challenges: QuestPrimaryChallenge[];
  antagonist_types: QuestAntagonistType[];

  // — Difficulty & pacing —
  difficulty: QuestDifficulty;

  // — Content —
  hooks: Hook[];
  objectives: Objective[];
  plot_beats: PlotBeat[];
  clues: Clue[];
  rumors: Rumor[];
  complications: Complication[];
  moral_dilemma: MoralDilemma | null;

  // — Rewards —
  rewards: QuestRewards;

  // — Cross-module links —
  /** Full cast — quest-giver, antagonist, allies, neutrals */
  npc_ids: number[];
  /** Reserved for when map editor is ready (forward-compat) */
  map_ids: number[];
  poi_ids: number[];
  /** Encounters from saved-encounters that belong to this quest */
  encounter_ids: number[];
  /** Parent quest for story-arc chaining */
  parent_quest_id: number | null;

  // — DM vs Player split —
  dm_notes: string;
  player_summary: string;
  /** Which clues the party has actually discovered (subset of clues[].id) */
  discovered_clues: string[];
  discovered_rumors: string[];

  // — Provenance —
  ai_generated: boolean;
  ai_generation_params: AIGenerationParams | null;
}

// ── Full DB record (what /api/quests returns) ────────────────────────────────

export interface QuestRecord {
  id: number;
  campaign_id: number;
  created_at: string;
  updated_at: string;
  data: QuestData;
}

// ── Convenience exports for dropdowns and iteration ──────────────────────────

/**
 * Arrays of all slug values per taxonomy — useful for building dropdowns and
 * filters without importing JSON files. Keep these in sync with the union
 * types above and the JSON vocabulary.
 */
export const ALL_SCOPES: readonly QuestScope[] = [
  'hook_only', 'single_encounter', 'one_shot', 'side_quest',
  'multi_session', 'campaign_arc', 'sandbox_rumor',
] as const;

export const ALL_STATUSES: readonly QuestStatus[] = [
  'concept', 'draft', 'ready', 'running', 'completed', 'failed', 'abandoned',
] as const;

export const KANBAN_COLUMNS: readonly QuestStatus[] = [
  'concept', 'draft', 'ready', 'running',
] as const;

export const ARCHIVE_STATUSES: readonly QuestStatus[] = [
  'completed', 'failed', 'abandoned',
] as const;

export const ALL_DIFFICULTY_TIERS: readonly DifficultyTier[] = [
  'easy', 'standard', 'tough', 'deadly',
] as const;

export const ALL_TIME_PRESSURES: readonly QuestTimePressure[] = [
  'none', 'soft', 'hard',
] as const;

export const ALL_PLOT_BEAT_TIERS: readonly PlotBeatTier[] = [
  'intro', 'rising_action', 'midpoint', 'climax', 'resolution',
] as const;

export const ALL_HOOK_DELIVERIES: readonly HookDelivery[] = [
  'encounter', 'rumor', 'letter', 'vision', 'discovery', 'environmental',
] as const;

export const ALL_OBJECTIVE_TYPES: readonly ObjectiveType[] = [
  'main', 'side', 'hidden',
] as const;

export const ALL_CLUE_CLARITIES: readonly ClueClarity[] = [
  'obvious', 'moderate', 'subtle', 'cryptic',
] as const;
