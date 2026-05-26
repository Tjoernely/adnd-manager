/**
 * Sprint 6 bug-fix — racial / inhabitants profiles used to force Sonnet and
 * gpt-image-1 to honour the chosen Inhabitants value. Without this layer the
 * AI silently treats Inhabitants as a soft hint (a "Elves" map ends up with
 * Anglo-Saxon names and seafaring vocabulary).
 *
 * Bridge: dropdown values are human labels ("Half-Orcs", "Mixed Races").
 * JSON keys are snake_case slugs ("half_orcs", "mixed_races"). The lookup
 * normalises in both directions, including a few Sprint-1 / legacy variants
 * ("Half-Elves" → half_elves, "Humanoid Mix" → mixed_races).
 */

import raw from './racialProfiles.json';

export interface RaceProfile {
  label:                string;
  architectural_style:  string;
  naming_examples:      string;
  cultural_notes:       string;
  material_culture:     string;
  npc_default_race:     string | null;
}

interface RawSchema {
  $schema?:  string;
  $version?: number;
  races:     Record<string, RaceProfile>;
}

const PROFILES = (raw as unknown as RawSchema).races ?? {};

// Legacy / alias labels — keep both the dropdown label and its lower-snake
// form pointing at the same profile.
const LABEL_TO_KEY: Record<string, string> = {
  'humans':         'humans',
  'human':          'humans',
  'elves':          'elves',
  'elf':            'elves',
  'dwarves':        'dwarves',
  'dwarf':          'dwarves',
  'halflings':      'halflings',
  'halfling':       'halflings',
  'gnomes':         'gnomes',
  'gnome':          'gnomes',
  'half-orcs':      'half_orcs',
  'half_orcs':      'half_orcs',
  'half-orc':       'half_orcs',
  'half-elves':     'half_elves',
  'half_elves':     'half_elves',
  'half-elf':       'half_elves',
  'mixed races':    'mixed_races',
  'mixed_races':    'mixed_races',
  'humanoid mix':   'mixed_races',
  'humanoids':      'humanoids',
  'humanoid':       'humanoids',
  'undead':         'undead',
  'demons':         'demons',
  'demon':          'demons',
  'fey':            'fey',
  'beasts':         'beasts',
  'beast':          'beasts',
  'monsters':       'monsters',
  'monster':        'monsters',
  'abandoned':      'abandoned',
  'none':           'abandoned',  // legacy "None" → no inhabitants
};

/**
 * Look up the profile for a dropdown Inhabitants value. Returns null for
 * Random / empty / unknown so callers can skip the MANDATORY block entirely.
 */
export function getRaceProfile(value: string | null | undefined): RaceProfile | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'Random' || trimmed === 'random') return null;
  const key = LABEL_TO_KEY[trimmed.toLowerCase()] ?? trimmed.toLowerCase().replace(/[-\s]+/g, '_');
  return PROFILES[key] ?? null;
}

/** Whether the inhabitants are a civilised culture that builds named POIs. */
export function isCivilisedInhabitants(value: string | null | undefined): boolean {
  const p = getRaceProfile(value);
  if (!p) return false;
  // Civilised races have a non-null npc_default_race that's not 'undead' /
  // 'beast' / 'monster' / 'demonic'. mixed_races has null but is civilised.
  if (p.npc_default_race === null) {
    return p.label === 'Mixed Races';
  }
  return !['undead', 'beast', 'monster', 'demonic', 'fey'].includes(p.npc_default_race);
}
