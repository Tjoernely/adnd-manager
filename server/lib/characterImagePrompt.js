/**
 * buildCharacterImagePrompt — shared server-side prompt builder for
 * POST /api/ai/character-image (character + NPC portraits via Gemini).
 *
 * The whole point is "not random images": the prompt is built ONLY from
 * whitelisted descriptive fields (race, class, kit, gender, level, notable
 * gear, appearance). Raw ability scores, character points, HP, THAC0 and
 * internal flags are deliberately NOT accepted — they don't describe what a
 * character looks like, and letting clients push arbitrary state into an
 * image prompt is how you get garbage.
 *
 * The image shows the character FULL FIGURE in an environment natural to
 * race + class: class picks the scene/activity, race colors it.
 */

// Every field the endpoint will read — anything else in `fields` is dropped.
// Values are coerced to trimmed strings and length-capped so a hostile client
// can't smuggle a novel (or a jailbreak) into the prompt.
const FIELD_MAX = 200;
const NOTES_MAX = 500;

const STRING_FIELDS = [
  'race', 'subrace', 'charClass', 'kit', 'gender',
  'weapon', 'armor', 'age', 'hairColor', 'eyeColor',
  'distinctiveFeatures', 'appearance', 'appearanceNotes',
];

function clean(v, max = FIELD_MAX) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Whitelist + sanitize an incoming fields object (request body or record). */
function whitelistFields(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const k of STRING_FIELDS) {
    const v = clean(src[k], k === 'appearanceNotes' || k === 'appearance' ? NOTES_MAX : FIELD_MAX);
    if (v) out[k] = v;
  }
  const lvl = parseInt(src.level, 10);
  if (Number.isFinite(lvl) && lvl > 0) out.level = Math.min(lvl, 30);
  if (src.shield === true) out.shield = true;
  if (Array.isArray(src.gear)) {
    const gear = src.gear.map(g => clean(g)).filter(Boolean).slice(0, 4);
    if (gear.length) out.gear = gear;
  }
  return out;
}

/** Extract the whitelisted fields from a saved character's character_data. */
function fieldsFromCharacterData(cd) {
  const d = cd && typeof cd === 'object' ? cd : {};
  return whitelistFields({
    race:                d.selectedRace,
    subrace:             d.selectedSubRace,
    charClass:           d.selectedClass,
    kit:                 d.selectedKit,
    gender:              d.charGender,
    level:               d.charLevel,
    age:                 d.charAge,
    hairColor:           d.charHairColor,
    eyeColor:            d.charEyeColor,
    distinctiveFeatures: d.charDistinctiveFeatures,
    appearanceNotes:     d.charAppearanceNotes,
    // weapPicked/masteryPicked hold internal weapon IDs the server can't
    // resolve to names (the catalog lives in src/data/) — clients that know
    // the names pass them inline via fields.weapon.
  });
}

// ── Environment derivation ────────────────────────────────────────────────────
// Class drives the scene/activity; race colors it. Matching is by substring on
// the normalized class/race string, so "Fighter 4", "fighter/mage" and plain
// ids all hit. First match wins (order matters: specialist classes first).
const CLASS_SCENES = [
  ['paladin',      'standing vigil in a consecrated chapel courtyard, banners and a shrine behind them'],
  ['ranger',       'moving through deep trackless wilderness, mist between old trees, a game trail underfoot'],
  ['druid',        'in an ancient grove ringed by standing stones, wild nature pressing close'],
  ['cleric',       'inside a temple sanctum, altar candles and stained light behind them'],
  ['priest',       'inside a temple sanctum, altar candles and stained light behind them'],
  ['illusionist',  'in an arcane laboratory, shelves of grimoires, glowing sigils and alchemical glassware'],
  ['necromancer',  'in a shadowed arcane study, black candles, bones and forbidden tomes'],
  ['mage',         'in an arcane laboratory or wizard\'s tower study, shelves of grimoires and glowing sigils'],
  ['wizard',       'in an arcane laboratory or wizard\'s tower study, shelves of grimoires and glowing sigils'],
  ['specialist',   'in an arcane laboratory or wizard\'s tower study, shelves of grimoires and glowing sigils'],
  ['bard',         'performing in a lively tavern common room, firelight and listeners in the gloom'],
  ['thief',        'on moonlit city rooftops above a narrow alley, chimney smoke and slate tiles'],
  ['rogue',        'on moonlit city rooftops above a narrow alley, chimney smoke and slate tiles'],
  ['assassin',     'in a shadowed alley of a night city, lantern light glinting off wet cobbles'],
  ['fighter',      'on a castle rampart above a war camp, weathered banners stirring in the wind'],
  ['warrior',      'on a castle rampart above a war camp, weathered banners stirring in the wind'],
  ['barbarian',    'on a windswept highland ridge, tribal totems and a hard grey sky'],
  ['monk',         'in a mountain monastery courtyard at dawn, prayer flags and worn flagstones'],
];

const RACE_FLAVOR = [
  ['dwarf',    'the setting carved into a great dwarven mountain-hall: pillared stone, forge-glow and rune-cut granite'],
  ['gnome',    'the setting cluttered with gnomish ingenuity: gadgets, lenses, tools and half-finished contraptions'],
  ['halfling', 'the setting softened by halfling country: rolling green hills, hedgerows and round doors in the distance'],
  ['half-elf', 'the setting touched by elven grace: silver-barked trees and soft ancient light at its edges'],
  ['halfelf',  'the setting touched by elven grace: silver-barked trees and soft ancient light at its edges'],
  ['half-orc', 'the setting rough and frontier-worn: rugged badlands, bone and hide details'],
  ['halforc',  'the setting rough and frontier-worn: rugged badlands, bone and hide details'],
  ['halfogre', 'the setting oversized and crude: rough-hewn timber and stone built for something bigger'],
  ['elf',      'the setting woven into an ancient elven forest: silver-barked trees, hanging lanterns and ageless light'],
];

function matchTable(table, value) {
  const v = clean(value).toLowerCase();
  if (!v) return null;
  for (const [key, text] of table) {
    if (v.includes(key)) return text;
  }
  return null;
}

function levelDescriptor(level) {
  if (!level)      return '';
  if (level >= 15) return 'a legendary, storied figure';
  if (level >= 11) return 'a veteran of many campaigns';
  if (level >= 7)  return 'an experienced adventurer';
  if (level >= 4)  return 'a seasoned adventurer';
  return 'a young, unproven adventurer';
}

/**
 * Build the final Gemini prompt from already-whitelisted fields.
 * Always full-figure, always an environment derived from class + race.
 */
function buildCharacterImagePrompt(rawFields) {
  const f = whitelistFields(rawFields);

  const race      = f.subrace ? `${f.subrace} ${f.race ?? ''}`.trim() : (f.race ?? 'human');
  const charClass = f.charClass ?? 'adventurer';

  let subject = `a ${f.gender ? f.gender.toLowerCase() + ' ' : ''}${race} ${charClass}`;
  if (f.kit) subject += ` (${f.kit})`;
  const lvl = levelDescriptor(f.level);
  if (lvl) subject += `, ${lvl}`;

  const looks = [];
  if (f.age)                 looks.push(/^\d+$/.test(f.age) ? `${f.age} years old` : f.age);
  if (f.hairColor)           looks.push(`${f.hairColor} hair`);
  if (f.eyeColor)            looks.push(`${f.eyeColor} eyes`);
  if (f.distinctiveFeatures) looks.push(f.distinctiveFeatures);
  if (f.appearance)          looks.push(f.appearance);

  const gear = [];
  if (f.weapon) gear.push(`wielding a ${f.weapon}`);
  if (f.armor)  gear.push(`wearing ${f.armor}`);
  if (f.shield) gear.push('carrying a shield');
  if (f.gear)   gear.push(`equipped with ${f.gear.join(', ')}`);

  const scene  = matchTable(CLASS_SCENES, charClass)
    ?? 'in a dramatic fantasy landscape fitting their calling';
  const flavor = matchTable(RACE_FLAVOR, race);

  const parts = [
    'Full-body fantasy character illustration for an AD&D 2nd Edition campaign.',
    `Subject: ${subject}.`,
    looks.length ? `Appearance: ${looks.join(', ')}.` : '',
    gear.length ? `Equipment: ${gear.join(', ')}.` : '',
    `Setting: the character is shown ${scene}${flavor ? `, with ${flavor}` : ''}.`,
    'The ENTIRE figure is visible head to feet, naturally posed and interacting with the environment — NOT a headshot, NOT a bust, NOT waist-up.',
    'Painterly dark-fantasy oil style, dramatic lighting, rich medieval detail, cinematic composition. No text, no watermarks, no border or frame.',
  ].filter(Boolean);

  let prompt = parts.join(' ');
  if (f.appearanceNotes) prompt += ' ' + f.appearanceNotes;
  return prompt;
}

module.exports = { buildCharacterImagePrompt, whitelistFields, fieldsFromCharacterData };
