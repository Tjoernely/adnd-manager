/**
 * Build prompts for quest AI generation.
 *
 * Each builder returns { systemPrompt, userPrompt, maxTokens } matching
 * the callClaude() signature in src/api/aiClient.js. The orchestrator
 * (questAI.ts) passes these directly to callClaude.
 *
 * Vocabulary is imported from src/rulesets/quests/ — Vite bundles the JSON.
 */

import questVocabulary from '../../rulesets/quests/questVocabulary.json';
import complicationPresets from '../../rulesets/quests/complicationPresets.json';
import moralDilemmaPresets from '../../rulesets/quests/moralDilemmaPresets.json';

import type {
  QuestScope,
  QuestType,
  QuestTone,
  QuestEnvironment,
  QuestPrimaryChallenge,
  QuestAntagonistType,
  DifficultyTier,
} from './questSchema';

// ── Public types ─────────────────────────────────────────────────────────────

/** AI model ids accepted by /api/ai/prompt. */
export type QuestAIModel = 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'gpt-5.4';

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  /** Model to use. Omitted → backend default (claude-sonnet-4-6). */
  model?: QuestAIModel;
}

export interface FullQuestPromptParams {
  scope?: QuestScope;
  quest_types?: QuestType[];
  tones?: QuestTone[];
  environments?: QuestEnvironment[];
  primary_challenges?: QuestPrimaryChallenge[];
  antagonist_types?: QuestAntagonistType[];
  include_moral_dilemma?: boolean;
  include_complications?: number;
  party_size?: number;
  party_level?: number;
  difficulty?: DifficultyTier;
  custom_prompt?: string;
  /** AI model — forwarded through callClaude to /api/ai/prompt. */
  model?: QuestAIModel;
  /** Computed max output tokens for this generation. Omitted → default 8192. */
  max_tokens?: number;
}

export interface HookBatchPromptParams {
  count?: number;
  party_level?: number;
  environments?: QuestEnvironment[];
  tones?: QuestTone[];
  custom_prompt?: string;
}

// ── Vocab type helpers ───────────────────────────────────────────────────────

type VocabEntry = { slug: string; label: string; description: string };
type VocabCategory =
  | 'scopes' | 'quest_types' | 'tones' | 'environments'
  | 'primary_challenges' | 'antagonist_types';

function vocabBullets(category: VocabCategory): string {
  const entries = ((questVocabulary as unknown) as Record<string, VocabEntry[]>)[category] ?? [];
  return entries.map(e => `  - ${e.slug}: ${e.description}`).join('\n');
}

function selectedLabels(slugs: string[] | undefined, category: VocabCategory): string {
  if (!slugs || !slugs.length) return '(open — AI chooses)';
  const entries = ((questVocabulary as unknown) as Record<string, VocabEntry[]>)[category] ?? [];
  return slugs.map(slug => {
    const found = entries.find(e => e.slug === slug);
    return found ? `${slug} (${found.label})` : slug;
  }).join(', ');
}

// ── System prompt (shared across modes) ───────────────────────────────────────

const SYSTEM_BASE = `You are an experienced AD&D 2nd Edition adventure designer
familiar with the Player's Option expansions (Skills & Powers, Spells & Magic,
Combat & Tactics). You design quests for hobbyist Dungeon Masters.

OUTPUT FORMAT:
- Always pure JSON matching the schema. No markdown fences. No preamble.
- User-facing text (title, pitch, hooks, descriptions, NPC names, dialogue,
  rumors, dm_notes, player_summary) MUST be in Danish.
- Slug values (scope, quest_types, tones, environments, primary_challenges,
  antagonist_types, clarity, delivery, race, class, alignment) MUST remain
  in English snake_case as specified by the vocabulary.

DESIGN PRINCIPLES:
- Quests must be solvable AND escapable. Plot beats need clear stakes.
- Clues are useless without backups. Every important clue should have a backup
  pointing to the same truth, so players can't get stuck if they miss one.
- Hooks need delivery context — where, who, when. A vague hook is a bad hook.
- NPCs need motivation, not just role. "Quest-giver" is a function; the NPC
  is a person with their own goal.
- Difficulty matches level. Level 3 party doesn't face dragons. Level 12 party
  doesn't fear giant rats.
- Plot beats escalate. Early beats establish; middle beats complicate; late
  beats deliver climax. The expected_level should rise across acts for
  multi-session quests.
- Moral dilemmas have no clean answer. Every option costs the party something.
- Rewards balance XP, gold, items, and story value. Pure gold feels empty.

AD&D 2E XP & DIFFICULTY HEURISTICS:
- Standard session XP per character: ~1000-2500 (varies by class progression).
- Level 1-3 encounters: monsters HD 1-3, low magic, mundane stakes.
- Level 4-8 encounters: monsters HD 3-8, some magic items, regional stakes.
- Level 9-14 encounters: monsters HD 6-12, planar threats, kingdom stakes.
- Level 15+ encounters: artifacts, demigods, world-shaking events.
- "easy" difficulty: party should win most encounters with minor resource cost.
- "standard": meaningful resource cost, occasional risk of unconsciousness.
- "tough": real chance of PC death, requires tactics and consumables.
- "deadly": expected casualties without preparation, escape valued over victory.`;

// ── Full quest output schema (embedded in user prompt) ───────────────────────

const FULL_QUEST_SCHEMA = `{
  "title":              "Danish, evocative, max 60 chars",
  "pitch":              "Danish, one-sentence logline",
  "scope":              "side_quest",                    // slug from scopes
  "quest_types":        ["investigation"],               // 1-3 slugs
  "tones":              ["gothic"],                      // 1-2 slugs
  "environments":       ["village"],                     // 1-3 slugs
  "primary_challenges": ["investigation"],               // 1-3 slugs
  "antagonist_types":   ["cursed_spirit"],               // 1-2 slugs
  "time_pressure":      "soft",                          // none|soft|hard

  "hooks": [                                             // 2-4 hooks total
    {
      "text":             "Danish — how party encounters this",
      "delivery":         "encounter",                   // encounter|rumor|letter|vision|discovery|environmental
      "source_npc_name":  "Name from npc_suggestions, or null"
    }
  ],

  "objectives": [                                        // 2-4 main + 0-2 side
    {
      "text":     "Danish description of objective",
      "type":     "main",                                // main|side|hidden
      "dm_notes": "Danish — how achieved, what counts as done"
    }
  ],

  "plot_beats": [                                        // 3-7 beats
    {
      "title":           "Short Danish title",
      "description":     "Danish — what happens, what party encounters",
      "act":             1,                              // 1|2|3
      "tier":            "intro",                        // intro|rising_action|midpoint|climax|resolution
      "expected_level":  3,                              // party level when played
      "npc_names":       ["Names from npc_suggestions"],
      "encounter_hint":  "Danish hint — monster types, count, terrain. DM builds the actual encounter in Encounter Builder."
    }
  ],

  "clues": [                                             // ONLY if investigation/mystery
    {
      "text":             "Danish — what the clue is",
      "location":         "Danish — where it's found",
      "reveals":          "Danish — what truth this points to",
      "clarity":          "moderate",                    // obvious|moderate|subtle|cryptic
      "if_misunderstood": "Danish — wrong conclusion players might draw",
      "backup_index":     1,                             // 0-based index of backup clue in this array, or null
      "source_npc_name":  "Name or null"
    }
  ],

  "rumors": [                                            // 0-5 rumors, mix true & false
    {
      "text":            "Danish — what's overheard",
      "location":        "Danish — where typically heard",
      "is_true":         true,
      "actual_truth":    "Danish — if false, what's the real truth",
      "source_npc_name": "Name or null"
    }
  ],

  "complications": [                                     // matches include_complications count
    {
      "text":      "Danish — what complicates the quest",
      "trigger":   "Danish — when/how this activates",
      "npc_names": ["Names from npc_suggestions"]
    }
  ],

  "moral_dilemma": null,                                 // null OR object below
  // { "setup": "Danish", "options": [{"label": "Danish", "consequence": "Danish"}] }

  "rewards": {
    "xp":    0,                                          // total quest-completion XP (excluding encounter XP)
    "gold":  0,                                          // gold piece reward
    "items": [{ "name": "Danish", "description": "Danish" }],
    "story": ["Danish narrative reward 1", "Danish narrative reward 2"]
  },

  "npc_suggestions": [                                   // 2-6 NPCs the quest needs
    {
      "name":        "Danish name",
      "role":        "Danish — role in this quest (quest-giver, antagonist, ally, witness, victim)",
      "race":        "human",                            // AD&D 2E race slug
      "class":       "fighter",                          // AD&D 2E class, or null for commoners
      "level":       5,                                  // number, or null
      "alignment":   "lawful neutral",                   // AD&D 2E alignment
      "motivation":  "Danish — what they want and why",
      "personality": "Danish — 2-3 distinctive traits",
      "appearance":  "Danish — brief physical description",
      "secrets":     ["Danish — DM-only secrets about this NPC"]
    }
  ],

  "dm_notes":       "Danish — full DM notes: the real story, hidden truths, key decisions, things to telegraph",
  "player_summary": "Danish — short summary players will see in their party hub"
}`;

// ── Full quest builder ───────────────────────────────────────────────────────

export function buildFullQuestPrompt(params: FullQuestPromptParams): BuiltPrompt {
  const {
    scope = 'side_quest',
    quest_types = [],
    tones = [],
    environments = [],
    primary_challenges = [],
    antagonist_types = [],
    include_moral_dilemma = false,
    include_complications = 0,
    party_size = 4,
    party_level = 3,
    difficulty = 'standard',
    custom_prompt = '',
    model,
    max_tokens,
  } = params;

  const isMystery = quest_types.some(t =>
    (['investigation', 'mystery', 'missing_person'] as QuestType[]).includes(t)
  );

  const cluesHint = isMystery
    ? `Generate 4-7 structured clues with backups. Every important clue should
       have a backup_index pointing to another clue that reveals the same truth.`
    : `Clues array can be empty unless investigation is needed.`;

  const dilemmaHint = include_moral_dilemma
    ? `Generate a moral_dilemma block with 2-3 options. Each option must have
       a clear cost — no clean answer. Tie the dilemma to existing NPCs or
       quest_types where possible.`
    : `Leave moral_dilemma as null.`;

  const compHint = include_complications > 0
    ? `Generate exactly ${include_complications} complication(s). Each must
       have a clear trigger (when/how it activates) and reference NPCs from
       npc_suggestions where relevant.`
    : `Leave complications array empty.`;

  const vocabSection = `TAXONOMY VOCABULARY (use these exact slugs):

Scopes:
${vocabBullets('scopes')}

Quest types:
${vocabBullets('quest_types')}

Tones:
${vocabBullets('tones')}

Environments:
${vocabBullets('environments')}

Primary challenges:
${vocabBullets('primary_challenges')}

Antagonist types:
${vocabBullets('antagonist_types')}`;

  const requestSection = `QUEST PARAMETERS:
- Scope:               ${scope}
- Quest types:         ${selectedLabels(quest_types, 'quest_types')}
- Tones:               ${selectedLabels(tones, 'tones')}
- Environments:        ${selectedLabels(environments, 'environments')}
- Primary challenges:  ${selectedLabels(primary_challenges, 'primary_challenges')}
- Antagonist types:    ${selectedLabels(antagonist_types, 'antagonist_types')}
- Party:               ${party_size} characters at average level ${party_level}
- Difficulty:          ${difficulty}
- Moral dilemma:       ${include_moral_dilemma ? 'yes' : 'no'}
- Complications count: ${include_complications}`;

  const dmPromptSection = custom_prompt
    ? `\nDM NOTES (incorporate these into the design):\n${custom_prompt}\n`
    : '';

  const userPrompt = `Generate one AD&D 2E quest in pure JSON.

${vocabSection}

${requestSection}
${dmPromptSection}
GUIDANCE FOR THIS QUEST:
- ${cluesHint}
- ${dilemmaHint}
- ${compHint}

OUTPUT SCHEMA (return JSON matching this exact shape — Danish content where
indicated, English slugs everywhere else):

${FULL_QUEST_SCHEMA}

Return ONLY the JSON object. No markdown fences. No preamble. No commentary.`;

  return {
    systemPrompt: SYSTEM_BASE,
    userPrompt,
    // Caller-supplied budget (length × detail × scope) wins; fallback covers a
    // full quest with 6 NPCs + 7 plot beats + 5 clues.
    maxTokens: max_tokens && max_tokens > 0 ? max_tokens : 8192,
    model,
  };
}

// ── Hook batch builder ───────────────────────────────────────────────────────

export function buildHookBatchPrompt(params: HookBatchPromptParams): BuiltPrompt {
  const {
    count = 10,
    party_level = 3,
    environments = [],
    tones = [],
    custom_prompt = '',
  } = params;

  const filterLines = [
    `Party level around ${party_level}`,
    environments.length ? `Environments: ${selectedLabels(environments, 'environments')}` : null,
    tones.length        ? `Tones: ${selectedLabels(tones, 'tones')}` : null,
  ].filter(Boolean).map(l => `- ${l}`).join('\n');

  const dmPromptSection = custom_prompt
    ? `\nDM NOTES (incorporate into hooks where relevant):\n${custom_prompt}\n`
    : '';

  const userPrompt = `Generate ${count} short quest hooks in Danish.

A hook is a one-or-two-sentence seed that could grow into a full quest. Hooks
should feel concrete and curious — something a DM can immediately imagine
running. Each hook hints at depth (there's always something more beneath).

CONSTRAINTS:
${filterLines}
- Each hook is 1-2 sentences, Danish.
- Variety across the batch: mix tones (some grim, some weird, some heroic),
  mix delivery (some rumors, some NPC encounters, some environmental).
- Avoid clichés (kill 10 rats, fetch the McGuffin, missing princess).
- Each hook should suggest a twist or hidden layer — not just a surface ask.
${dmPromptSection}

OUTPUT SCHEMA (return JSON):
{
  "hooks": [
    {
      "text":              "Danish hook text, 1-2 sentences",
      "delivery":          "encounter",      // encounter|rumor|letter|vision|discovery|environmental
      "tone_hint":         "gothic",          // optional tone slug or null
      "environment_hint":  "village"          // optional environment slug or null
    }
  ]
}

Return ONLY the JSON object.`;

  return {
    systemPrompt: SYSTEM_BASE,
    userPrompt,
    maxTokens: 2048,  // 10 hooks * ~150 tokens = ~1500 tokens, lille buffer
  };
}

// ── Re-exports for use in dropdowns and presets pickers ──────────────────────

export const QUEST_VOCABULARY = questVocabulary;
export const COMPLICATION_PRESETS = complicationPresets;
export const MORAL_DILEMMA_PRESETS = moralDilemmaPresets;
