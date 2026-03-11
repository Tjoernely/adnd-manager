// data/races.js — AD&D 2nd Edition race data: SUB_RACES, RACES, MONSTROUS_RACES

export const SUB_RACES = {
  // ── DWARF (pool: 45, can save 5) ──────────────────────────────────
  dwarf: [
    {
      id: "hill",   label: "Hill Dwarf",     packageCp: 40,
      abilityIds: ["dw16","dw23","dw19","dw20"],
      uniqueIds: [],
      desc: "The most common dwarf variety. Live in rolling headlands above and below ground. Sturdy and traditionalist.",
      penalties: "–2 penalty to reaction rolls when in or adjacent to rivers, lakes, and seas.",
    },
    {
      id: "mountain", label: "Mountain Dwarf", packageCp: 40,
      abilityIds: ["dw16","dw23","dw19","dw20"],
      uniqueIds: [],
      desc: "Dwell beneath mountain strongholds. Taller and heavier than hill dwarves, suspicious of outsiders.",
      penalties: "–2 penalty to reaction rolls only when on board sea-going vessels or in large bodies of water.",
    },
    {
      id: "deep",   label: "Deep Dwarf",     packageCp: 45,
      abilityIds: ["dw_u01","dw23","dw19","dw20"],
      uniqueIds: ["dw_u01"],
      desc: "Live deep underground, rarely contacting surface races. Large-boned and thin, moving easily through narrow tunnels. Mostly neutral alignment.",
      penalties: "–1 penalty to all rolls in bright sunlight or continual light. Suffer no penalty from lesser light sources.",
    },
    {
      id: "gray",   label: "Gray Dwarf (Duergar)", packageCp: 45,
      abilityIds: ["dw_u02","dw23","dw19","dw25","dw20"],
      uniqueIds: ["dw_u02"],
      desc: "The Duergar dwell even deeper than deep dwarves. Almost bald with white beards. Rarely venture aboveground as sunlight pains their eyes.",
      penalties: "–1 penalty on all rolls in bright sunlight or continual light. –2 initial reaction penalty from other dwarves.",
    },
    {
      id: "custom", label: "Custom",          packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the dwarven ability list. All 45 CP available to spend freely.",
      penalties: "",
    },
  ],

  // ── ELF (pool: 45, can save 5) ────────────────────────────────────
  elf: [
    {
      id: "aquatic", label: "Aquatic Elf",    packageCp: 40,
      abilityIds: ["el17","el16","el05","el18","el14"],
      uniqueIds: [],
      desc: "Sea elves of lagoons and ocean depths. Silver-green to pale-blue skin. Can survive on land for days equal to Fitness score, then begin to dehydrate.",
      penalties: "Cannot gain the elven bow attack bonus (bows are ineffective underwater). Must return to salt water regularly.",
    },
    {
      id: "drow",   label: "Dark Elf (Drow)", packageCp: 45,
      abilityIds: ["el_u01","el21","el05","el16","el14"],
      uniqueIds: ["el_u01"],
      desc: "The drow dwell underground, masters of the Underdark. Jet-black skin and feral red eyes. Very few are of good alignment.",
      penalties: "–1 to all rolls in bright sunlight or continual light. –2 initial reaction penalty from all other elves.",
    },
    {
      id: "gray",   label: "Gray Elf",        packageCp: 45,
      abilityIds: ["el04","el14","el09","el16","el05","el12","el20"],
      uniqueIds: [],
      desc: "Also called the Faerie. The most reclusive and noble elves, devoted to improving their minds. Amber or violet eyes, silver or pale gold hair.",
      penalties: "–1 reaction penalty with other elves. –2 reaction penalty with all other races.",
    },
    {
      id: "high",   label: "High Elf",        packageCp: 40,
      abilityIds: ["el04","el14","el09","el16","el05","el12"],
      uniqueIds: [],
      desc: "The most common and sociable elf. Pale complexion, blond or dark hair. Open and cooperative, set the standard for elven appearance.",
      penalties: "–2 penalty when attempting to disbelieve illusions (take things at face value).",
    },
    {
      id: "sylvan", label: "Sylvan (Wood) Elf", packageCp: 40,
      abilityIds: ["el04","el14","el09","el16","el05","el19"],
      uniqueIds: [],
      desc: "The most primitive and temperamental elves. Yellow to copper-red hair. Prefer simple survival over philosophy or magic study.",
      penalties: "–1 reaction penalty when encountered outside their home forest (the elf's discomfort shows).",
    },
    {
      id: "custom", label: "Custom",          packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the elven ability list. All 45 CP available to spend freely.",
      penalties: "",
    },
  ],

  // ── GNOME (pool: 45, can save 5) ──────────────────────────────────
  gnome: [
    {
      id: "svirfneblin", label: "Deep Gnome (Svirfneblin)", packageCp: 45,
      abilityIds: ["gn17","gn07","gn15","gn06","gn_u01","gn12","gn02"],
      uniqueIds: ["gn_u01"],
      desc: "The Svirfneblin live far underground. Wiry but as strong as surface gnomes. Males are usually bald. Mostly neutral with good tendencies.",
      penalties: "–2 reaction roll penalty when initially encountering individuals of other races.",
    },
    {
      id: "forest",  label: "Forest Gnome",    packageCp: 45,
      abilityIds: ["gn13","gn02","gn03","gn14","gn06","gn16"],
      uniqueIds: [],
      desc: "The rarest gnomes. Live above ground in hollow trees or log cabins, caring for small woodland creatures. The smallest of gnomes at 2½' tall.",
      penalties: "Forest gnomes cannot have infravision.",
    },
    {
      id: "rock",    label: "Rock Gnome",       packageCp: 40,
      abilityIds: ["gn05","gn07","gn02","gn03","gn06"],
      uniqueIds: [],
      desc: "The most common gnome. The biggest noses of all (remarkable even among gnomes). Love gems and fine craftsmanship. About 3½' tall.",
      penalties: "None.",
    },
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the gnome ability list. All 45 CP available to spend freely.",
      penalties: "",
    },
  ],

  // ── HALFLING (pool: 35, can save 5) ───────────────────────────────
  halfling: [
    {
      id: "hairfoot", label: "Hairfoot",        packageCp: 30,
      abilityIds: ["hf08","hf09","hf04"],
      uniqueIds: [],
      desc: "The most common halfling. Practical and rural. Stockier than cousins. Complexions from pale peach to dark brown. Lack facial hair.",
      penalties: "None.",
    },
    {
      id: "stout",   label: "Stout",            packageCp: 35,
      abilityIds: ["hf08","hf_u01","hf15","hf04","hf09"],
      uniqueIds: [],
      desc: "Stockier and stronger than hairfoots. May have some dwarven blood. Ruddy complexions. Often found near dwarven communities.",
      penalties: "–1 penalty to reaction rolls from elves (due to friendship with dwarves).",
    },
    {
      id: "tallfellow", label: "Tallfellow",    packageCp: 35,
      abilityIds: ["hf08","hf11","hf12","hf09","hf04"],
      uniqueIds: [],
      desc: "The tallest and slimmest halflings at just over 4'. Live near elves in temperate woodlands. Best carpenters. Prefer riding ponies.",
      penalties: "–2 reaction roll penalty vs. dwarves (due to friendship with elves).",
    },
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the halfling ability list. All 35 CP available to spend freely.",
      penalties: "",
    },
  ],

  // ── HALF-ELF (pool: 25, can save 5) ──────────────────────────────
  halfelf: [
    {
      id: "standard", label: "Standard",        packageCp: 20,
      abilityIds: ["he06","he08","he03"],
      uniqueIds: [],
      desc: "The standard half-elf package includes: Infravision 60', Resistance (30% vs sleep/charm), Secret Doors, and starting languages (Common, Elf, Gnome, Halfling, Goblin, Hobgoblin, Orc, Gnoll).",
      penalties: "None.",
    },
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the half-elf ability list. All 25 CP available.",
      penalties: "",
    },
  ],

  // ── HALF-ORC (pool: 15, can save 5) ──────────────────────────────
  halforc: [
    {
      id: "standard", label: "Standard",        packageCp: 10,
      abilityIds: ["ho06"],
      uniqueIds: [],
      desc: "The standard half-orc package includes: Infravision 60' and starting languages (Common, Orc, Dwarf, Goblin, Hobgoblin, Ogre).",
      penalties: "–2 reaction roll penalty in human societies.",
    },
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the half-orc ability list. All 15 CP available.",
      penalties: "",
    },
  ],

  // ── HALF-OGRE (pool: 15, can save 5) ─────────────────────────────
  halfogre: [
    {
      id: "standard", label: "Standard",        packageCp: 10,
      abilityIds: ["og08"],
      uniqueIds: [],
      desc: "The standard half-ogre package includes: Tough Hide (natural AC 8) and starting languages (Common, Ogre, Orc, Troll, Stone Giant, Gnoll).",
      penalties: "Qualify as Large creatures — suffer more damage from many weapons. Smaller races have combat bonuses vs. half-ogres.",
    },
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Choose your own abilities from the half-ogre ability list. All 15 CP available.",
      penalties: "",
    },
  ],

  // ── Exotic races — no sub-races ──────────────────────────────────
  aarakocra: [],
  thrikreen: [],
  wemic:     [],

  // ── HUMAN (pool: 10, can save all 10) ────────────────────────────
  human: [
    {
      id: "custom",  label: "Custom",           packageCp: 0,
      abilityIds: [],
      uniqueIds: [],
      desc: "Humans have no standard sub-race package. Spend your 10 CP on individual abilities, or save them for use later in character creation.",
      penalties: "",
    },
  ],
};

// ───────────────────────────────────────────────────────────────────
//  5. RACES  —  Exact CP costs from the S&P rulebook. No invention.
//  statLink: { sub: subAbilityId | "choose", delta: number } | null
// ───────────────────────────────────────────────────────────────────

export const RACES = [
  // ─── DWARF ───────────────────────────────────────────────────────
  {
    id: "dwarf", label: "Dwarf", icon: "⛏️", pool: 45,
    baseStatMods: { CON: 1, CHA: -1 },
    desc: "Stout and resilient demi-humans of the mountain halls. Renowned warriors and craftsmen with deep ties to stone and metal.",
    abilities: [
      { id:"dw01", cp: 5,  statLink: null,                           name:"Axe bonus",                   desc:"+1 to hit with all axe-type weapons (battle axe, hand axe, etc.)." },
      { id:"dw02", cp:10,  statLink:{ sub:"balance",  delta:1 },     name:"Better Balance",              desc:"+1 to Balance sub-ability. Improved AC modifier and reaction time." },
      { id:"dw03", cp: 5,  statLink: null,                           name:"Brewing",                     desc:"Proficiency in brewing ales, spirits, and potent dwarven drinks. Identify brews by taste." },
      { id:"dw04", cp: 5,  statLink: null,                           name:"Close to the earth",          desc:"When underground, the dwarf heals 2 HP of damage overnight (instead of the normal 1). Does not apply above ground." },
      { id:"dw05", cp:10,  statLink:{ sub:"health",   delta:1 },     name:"Constitution/Health bonus",   desc:"+1 to Health sub-ability. Improved resistance to poison and disease." },
      { id:"dw06", cp: 5,  statLink: null,                           name:"Crossbow bonus",              desc:"+1 to hit with light and heavy crossbows." },
      { id:"dw07", cp: 5,  statLink: null,                           name:"Determine stability",         desc:"Evaluate whether stone or earthwork structures are safe or unstable. 75% base accuracy." },
      { id:"dw08", cp: 5,  statLink: null,                           name:"Determine age",               desc:"Estimate the age of stonework, metalwork, or a dwarf by examination. 70% accuracy." },
      { id:"dw09", cp:10,  statLink: null,                           name:"Dense skin",                  desc:"If struck by a blunt weapon (club, hammer, flail), the dwarf suffers only HALF the normal damage. Edged and piercing weapons deal full damage." },
      { id:"dw10", cp: 5,  statLink: null,                           name:"Detect poison",               desc:"Detect poison in food, drink, or objects by smell and taste. 60% accuracy." },
      { id:"dw11", cp: 5,  statLink: null,                           name:"Evaluate gems",               desc:"Identify gemstone type and estimate value. +15% to all gem appraisal checks." },
      { id:"dw12", cp: 5,  statLink: null,                           name:"Expert haggler",              desc:"Skilled bartering and price negotiation. May reduce prices by 10–20%." },
      { id:"dw13", cp:10,  statLink: null,                           name:"Hit point bonus",             desc:"The dwarf gains +1 additional hit point each time the character attains a new level. This is a flat HP bonus, not a stat change." },
      { id:"dw14", cp: 5,  statLink: null,                           name:"Illusion resistant",          desc:"+2 to saving throws against all illusion and phantasm spells." },
      { id:"dw15", cp:10,  statLink:{ sub:"stamina",  delta:1 },     name:"Improved Stamina",            desc:"+1 to Stamina sub-ability. Greater endurance in prolonged combat and forced marches." },
      { id:"dw16", cp:10,  statLink: null,                           name:"Infravision 60'",             desc:"See heat signatures in total darkness up to 60 feet. Monochromatic." },
      { id:"dw17", cp: 5,  statLink: null,                           name:"Mace bonus",                  desc:"+1 to hit with maces and morning stars." },
      { id:"dw18", cp:10,  statLink: null,                           name:"Meld into stone",             desc:"Once per day, merge into natural stone for up to 10 rounds. Invulnerable while melded." },
      { id:"dw19", cp:10,  statLink: null,                           name:"Melee combat bonuses",        desc:"+1 attack bonus vs. orcs, half-orcs, goblins, and hobgoblins. Ogres, half-ogres, ogre magi, trolls, giants, and titans suffer a –4 penalty on all attack rolls against this dwarf." },
      { id:"dw20", cp:10,  statLink: null,                           name:"Mining Detection",            desc:"Detect slopes (75%), unsafe ceilings (66%), depth underground (50%), new tunnels (75%)." },
      { id:"dw21", cp:10,  statLink:{ sub:"muscle",   delta:1 },     name:"More muscles",                desc:"+1 to Muscle sub-ability ONLY. Increases melee hit/damage bonuses. Stamina unchanged." },
      { id:"dw22", cp: 5,  statLink: null,                           name:"Pick bonus",                  desc:"+1 to hit with military picks and mattocks." },
      { id:"dw23", cp:10,  statLink: null,                           name:"Saving Throw Bonuses",        desc:"Bonus to saving throws vs. poison and vs. magical attacks from rods, wands, and spells. Determined by CON/Health score: 4–6: +1, 7–10: +2, 11–13: +3, 14–17: +4, 18–20: +5." },
      { id:"dw24", cp: 5,  statLink: null,                           name:"Short sword bonus",           desc:"+1 to hit with short swords and dirks." },
      { id:"dw25", cp:10,  statLink: null,                           name:"Stealth",                     desc:"Not in metal armor: opponents suffer –2 to surprise rolls. The dwarf also receives +2 to his own surprise rolls. Must be 90'+ ahead of non-stealthy party members." },
      { id:"dw26", cp:10,  statLink: null,                           name:"Stone tell",                  desc:"Once per day: speak with stone to learn its history — who has touched it, what events have occurred in its presence." },
      { id:"dw27", cp: 5,  statLink: null,                           name:"Warhammer bonus",             desc:"+1 to hit with warhammers and mauls." },
      // ── Unique sub-race abilities (Rule-Breaker required for Custom) ──
      { id:"dw_u01", cp:15, unique:true, statLink: null,             name:"Infravision 90' ✦",           desc:"[Deep Dwarf exclusive] Extended infravision range to 90 feet underground. Not available to custom dwarves without Rule-Breaker." },
      { id:"dw_u02", cp:15, unique:true, statLink: null,             name:"Infravision 120' ✦",          desc:"[Gray Dwarf / Duergar exclusive] Full underground darkness vision to 120 feet. Not available to custom dwarves without Rule-Breaker." },
    ],
  },

  // ─── ELF ─────────────────────────────────────────────────────────
  {
    id: "elf", label: "Elf", icon: "🌿", pool: 45,
    baseStatMods: { DEX: 1, CON: -1 },
    desc: "Ancient and graceful fey-blooded people, touched by magic and bound to the natural world. Unmatched archers and enchanters.",
    abilities: [
      { id:"el01", cp:10,  statLink:{ sub:"aim",     delta:1 },    name:"Aim bonus",                desc:"+1 to Aim sub-ability. Negates the requirement that Dexterity sub-abilities must be within 4 points — they can now be within 5." },
      { id:"el03", cp:10,  statLink:{ sub:"balance", delta:1 },    name:"Balance bonus",            desc:"+1 to Balance sub-ability. Negates the requirement that Dexterity sub-abilities must be within 4 points — they can now be within 5." },
      { id:"el04", cp: 5,  statLink: null,                         name:"Bow bonus",                desc:"+1 on attacks with long or short bows." },
      { id:"el06", cp: 5,  statLink: null,                         name:"Cold resistance",          desc:"+1 bonus on saving throws vs. cold- and ice-based attacks, as the elf's body is less susceptible to extreme temperatures." },
      { id:"el25", cp:10,  statLink: null,                         name:"Companion",                desc:"The elf gains the companionship of a cooshee or an elven cat. See the Animal Master kit for specifics on companion animals." },
      { id:"el17", cp:10,  statLink: null,                         name:"Confer water breathing",   desc:"Once per day, the elf can confer the ability to breathe water upon another creature. Lasts 1 hour per experience level of the elf conferring the ability." },
      { id:"el15", cp: 5,  statLink: null,                         name:"Dagger bonus",             desc:"+1 attack roll bonus with daggers." },
      { id:"el08", cp: 5,  statLink: null,                         name:"Heat resistance",          desc:"+1 bonus on saving throws vs. heat- and fire-based attacks, as the elf's body is less susceptible to extreme temperatures." },
      { id:"el09", cp:10,  statLink: null,                         name:"Infravision 60'",          desc:"60' infravision range — the ability to see heat patterns given off by living warm-blooded creatures in the dark." },
      { id:"el22", cp: 5,  statLink: null,                         name:"Javelin bonus",            desc:"+1 attack roll bonus when using a javelin." },
      { id:"el11", cp: 5,  statLink: null,                         name:"Less sleep",               desc:"The elf requires only four hours of rest (trance) to be fully rested. Especially valuable for spellcasters." },
      { id:"el23", cp:10,  statLink: null,                         name:"Magic identification",     desc:"A 5% chance per experience level of identifying the general purpose and function of any magical item — as per the bard ability." },
      { id:"el20", cp:10,  statLink:{ sub:"knowledge",  delta:1 },    name:"Reason bonus",             desc:"+1 to Knowledge sub-ability, due to gray elves' devotion to developing their intellects. Also grants bonus CP via Table 10." },
      { id:"el05", cp:10,  statLink: null,                         name:"Resistance",               desc:"90% resistant to sleep and charm-related spells." },
      { id:"el14", cp: 5,  statLink: null,                         name:"Secret doors",             desc:"Passing within 10' of a concealed door: 1-in-6 chance to notice it. Actively searching: 2-in-6 for secret doors, 3-in-6 for concealed doors." },
      { id:"el24", cp:10,  statLink: null,                         name:"Speak with plants",        desc:"Once per day, the elf can use the speak with plants ability, as a priest of the same level." },
      { id:"el19", cp: 5,  statLink: null,                         name:"Spear bonus",              desc:"+1 attack roll bonus when using a spear." },
      { id:"el21", cp:15,  statLink: null,                         name:"Spell Abilities",          desc:"Once per day: faerie fire, dancing lights, and darkness (as priest/wizard of same level). At 4th level adds: levitate, detect magic, and know alignment." },
      { id:"el16", cp:10,  statLink: null,                         name:"Stealth",                  desc:"When alone and not in metal armor: opponents suffer –4 to surprise rolls (–2 if the elf must open a door)." },
      { id:"el12", cp: 5,  statLink: null,                         name:"Sword bonus",              desc:"+1 on attack rolls using a short sword or a long sword." },
      { id:"el18", cp: 5,  statLink: null,                         name:"Trident bonus",            desc:"+1 on attack rolls when using a trident." },
      // ── Unique sub-race ability (Rule-Breaker required for Custom) ──
      { id:"el_u01", cp:15, unique:true, statLink: null,           name:"Infravision 120' ✦",       desc:"[Dark Elf / Drow exclusive] Full 120' infravision range underground. Not available to custom elves without Rule-Breaker." },
    ],
  },

  // ─── GNOME ───────────────────────────────────────────────────────
  {
    id: "gnome", label: "Gnome", icon: "🔮", pool: 45,
    baseStatMods: { INT: 1, WIS: -1 },
    desc: "Quick-witted illusionists and tinkerers, friends to burrowing beasts. The most intellectually curious of the demi-human races.",
    abilities: [
      { id:"gn13", cp:10,  statLink: null,                           name:"Animal friendship",  desc:"Once per day, cast animal friendship as the priest spell, with respect to burrowing animals." },
      { id:"gn02", cp:10,  statLink: null,                           name:"Melee combat bonus",  desc:"+1 bonus on attack rolls vs. kobolds and goblins. Gnolls, bugbears, ogres, half-ogres, ogre magi, trolls, giants, and titans suffer a –4 penalty on attack rolls vs. this gnome." },
      { id:"gn18", cp: 5,  statLink: null,                           name:"Dagger bonus",        desc:"+1 to attack rolls with daggers." },
      { id:"gn17", cp: 5,  statLink: null,                           name:"Dart bonus",          desc:"+1 to attack rolls with darts — the gnome's preferred missile weapon." },
      { id:"gn03", cp: 5,  statLink: null,                           name:"Defensive bonus",     desc:"+1 to Armor Class when in their native underground environment." },
      { id:"gn19", cp: 5,  statLink: null,                           name:"Engineering bonus",   desc:"If the gnome has the Engineering proficiency, he gains a +2 bonus to the proficiency score." },
      { id:"gn14", cp:10,  statLink: null,                           name:"Forest movement",     desc:"Pass without trace through native woodland, as the druidic ability." },
      { id:"gn15", cp:10,  statLink: null,                           name:"Freeze",              desc:"\"Freeze\" motionless in underground environment: 60% chance not to be noticed by passersby." },
      { id:"gn16", cp:10,  statLink: null,                           name:"Hide",                desc:"Hide in woods with a chance equal to a thief of the same level's hide-in-shadows ability." },
      { id:"gn05", cp:10,  statLink: null,                           name:"Infravision 60'",     desc:"60' infravision range." },
      { id:"gn07", cp:10,  statLink: null,                           name:"Mining Detection",    desc:"Determine depth underground (1–4/1d6), direction underground (1–3/1d6), detect grade/slope (1–5/1d6), detect unsafe walls/ceilings/floors (1–7/1d10)." },
      { id:"gn20", cp: 5,  statLink: null,                           name:"Short sword bonus",   desc:"+1 to attack rolls with short swords." },
      { id:"gn06", cp: 5,  statLink: null,                           name:"Saving Throw Bonus",  desc:"Bonus to all saving throws vs. magical wands, staves, rods, and spells. For every 3½ points of Health: 4–6: +1, 7–10: +2, 11–13: +3, 14–17: +4, 18–20: +5." },
      { id:"gn10", cp: 5,  statLink: null,                           name:"Potion identification",desc:"Percentage chance equal to Wisdom score of identifying a potion by appearance and scent. No tasting required." },
      { id:"gn08", cp:10,  statLink:{ sub:"knowledge", delta:1 },       name:"Reason bonus",        desc:"+1 to Knowledge sub-ability. Also grants bonus CP via Table 10." },
      { id:"gn11", cp: 5,  statLink: null,                           name:"Sling bonus",         desc:"+1 to hit when using a sling." },
      { id:"gn12", cp:10,  statLink: null,                           name:"Stealth",             desc:"Not in metal armor, and at least 90' ahead of characters without this ability (or with equivalent stealth): opponents suffer –4 to surprise rolls. The gnome also receives +2 to his own surprise rolls." },
      // ── Unique sub-race ability ──
      { id:"gn_u01", cp:15, unique:true, statLink: null,             name:"Infravision 120' ✦",  desc:"[Deep Gnome / Svirfneblin exclusive] 120' infravision range. Not available to custom gnomes without Rule-Breaker." },
    ],
  },

  // ─── HALFLING ─────────────────────────────────────────────────────
  {
    id: "halfling", label: "Halfling", icon: "🍀", pool: 35,
    baseStatMods: { DEX: 1, STR: -1 },
    desc: "Small, cheerful folk of remarkable luck and surprising toughness. Masters of silence and the sling.",
    abilities: [
      { id:"hf02", cp: 5,  statLink: null,                           name:"Infravision 30'",    desc:"Infravision with a 30' range, which indicates some Stout halfling blood in the character's lineage." },
      { id:"hf04", cp:10,  statLink: null,                           name:"Saving Throw Bonuses",desc:"Bonus to all saving throws vs. magical wands, staves, rods, spells, and poison. For every 3½ points of Health: 4–6: +1, 7–10: +2, 11–13: +3, 14–17: +4, 18–20: +5. Halflings are NOT hindered when using magical items." },
      { id:"hf05", cp:10,  statLink:{ sub:"aim",     delta:1 },      name:"Aim bonus",           desc:"+1 to Aim sub-ability score." },
      { id:"hf08", cp: 5,  statLink: null,                           name:"Attack bonus",        desc:"+1 attack bonus with hurled weapons and slings." },
      { id:"hf16", cp:10,  statLink:{ sub:"balance", delta:1 },      name:"Balance bonus",       desc:"+1 to Balance sub-ability. Allows up to a difference of 5 in the Dexterity sub-ability scores." },
      { id:"hf14", cp: 5,  statLink: null,                           name:"Detect evil",         desc:"Once per day, detect evil in creatures or individuals. Does not function on items or locations." },
      { id:"hf11", cp: 5,  statLink: null,                           name:"Detect secret doors", desc:"Detect secret and concealed doors as an elf: 1-in-6 passive (within 10'), 2-in-6 for secret doors, 3-in-6 for concealed doors when actively searching." },
      { id:"hf06", cp:10,  statLink:{ sub:"health",  delta:1 },      name:"Health bonus",        desc:"+1 to Health sub-ability score." },
      { id:"hf12", cp:10,  statLink: null,                           name:"Hide",                desc:"Hide in woods with a chance equal to a thief of the same level's hide-in-shadows ability." },
      { id:"hf15", cp: 5,  statLink: null,                           name:"Mining Detection",    desc:"Determine approximate direction underground (1–3 on 1d6). Detect grade or slope in passage (1–3 on 1d4)." },
      { id:"hf13", cp: 5,  statLink: null,                           name:"Reaction bonus",      desc:"+1 to reaction rolls due to other races' acceptance of halflings." },
      { id:"hf09", cp:10,  statLink: null,                           name:"Stealth",             desc:"Not in metal armor: opponents suffer –4 to surprise rolls (–2 if the halfling must open a door or move aside an obstruction)." },
      { id:"hf10", cp: 5,  statLink: null,                           name:"Taunt",               desc:"Once per day: taunt someone, as per the 1st-level wizard spell." },
      // ── Unique sub-race ability ──
      { id:"hf_u01", cp:10, unique:true, statLink: null,             name:"Infravision 60' ✦",  desc:"[Stout Halfling exclusive] Infravision with a 60' range. Not available to custom halflings without Rule-Breaker." },
    ],
  },

  // ─── HALF-ELF ────────────────────────────────────────────────────
  {
    id: "halfelf", label: "Half-Elf", icon: "🌙", pool: 25,
    baseStatMods: {},
    desc: "Born of two worlds, Half-Elves carry elven grace and human ambition. Adaptable and charismatic bridge-builders.",
    abilities: [
      { id:"he01", cp: 5,  statLink: null,                           name:"Bow bonus",          desc:"+1 to attack rolls with any bows other than crossbows." },
      { id:"he02", cp: 5,  statLink: null,                           name:"Cold resistance",    desc:"+1 bonus on saving throws vs. cold- and ice-based attacks." },
      { id:"he03", cp: 5,  statLink: null,                           name:"Detect secret doors",desc:"Passing within 10' of a concealed door: 1-in-6 chance to notice it. Actively searching: 2-in-6 for secret doors, 3-in-6 for concealed doors." },
      { id:"he04", cp:10,  statLink:{ sub:"health", delta:1 },       name:"Health bonus",       desc:"+1 to Health sub-ability. The score can be up to 5 points higher than the character's Fitness score." },
      { id:"he05", cp: 5,  statLink: null,                           name:"Heat resistance",    desc:"+1 bonus on saving throws vs. heat- and fire-based attacks." },
      { id:"he06", cp:10,  statLink: null,                           name:"Infravision 60'",    desc:"Infravision with a range of 60'." },
      { id:"he07", cp: 5,  statLink: null,                           name:"Less sleep",         desc:"The half-elf requires only four hours of sleep to be rested. Especially valuable for spellcasters." },
      { id:"he08", cp: 5,  statLink: null,                           name:"Resistance",         desc:"30% resistance to sleep and charm spells." },
      { id:"he09", cp:10,  statLink: null,                           name:"Stealth",            desc:"Alone and not in metal armor: opponents suffer –4 to surprise rolls (–2 if the half-elf must open a door)." },
      { id:"he10", cp: 5,  statLink: null,                           name:"Sword bonus",        desc:"+1 to attacks with long swords or short swords." },
    ],
  },

  // ─── HUMAN ───────────────────────────────────────────────────────
  {
    id: "human", label: "Human", icon: "👤", pool: 10,
    baseStatMods: {},
    desc: "Diverse and adaptable, humans dominate through ambition, versatility, and sheer numbers. No racial restrictions on class or stat maxima.",
    abilities: [
      { id:"hu01", cp: 5,  statLink: null,                           name:"Attack bonus",       desc:"+1 to attack with any one weapon of the human's choice." },
      { id:"hu02", cp:10,  statLink:{ sub:"balance", delta:1 },      name:"Balance bonus",      desc:"+1 to Balance sub-ability. The character's Balance score may be up to 5 points higher than his Aim sub-ability score." },
      { id:"hu03", cp:10,  statLink: null,                           name:"Experience bonus",   desc:"+5% experience point bonus. Cumulative if the human also meets class requirements for a 10% XP bonus." },
      { id:"hu04", cp:10,  statLink:{ sub:"health",  delta:1 },      name:"Health bonus",       desc:"+1 to Health sub-ability. The character's Health score may be up to 5 points higher than his Fitness sub-ability score." },
      { id:"hu05", cp:10,  statLink: null,                           name:"Hit point bonus",    desc:"One additional hit point whenever new hit points (for advancing to a new level) are rolled. Flat HP bonus — not a stat change." },
      { id:"hu06", cp:10,  statLink: null,                           name:"Secret doors",       desc:"A human with a trace of elven blood: 1-in-6 chance to notice a concealed door when passing within 10'. Actively searching: 2-in-6 for secret doors, 3-in-6 for concealed doors." },
      { id:"hu07", cp:10,  statLink: null,                           name:"Tough hide",         desc:"Natural AC of 8. If worn armor would give AC better than 8, this has no effect. If worn armor gives AC 8 or worse, add +1 bonus to AC." },
    ],
  },

  // ─── HALF-ORC ────────────────────────────────────────────────────
  {
    id: "halforc", label: "Half-Orc", icon: "🪓", pool: 15,
    baseStatMods: { STR: 1, CON: 1, CHA: -2 },
    desc: "Products of human and orcish blood, Half-Orcs combine brutal strength with cunning survival instincts. Feared and underestimated.",
    abilities: [
      { id:"ho01", cp: 5,  statLink: null,                           name:"Active sense of smell", desc:"Sense of smell is sensitive enough to give a +1 bonus to surprise rolls." },
      { id:"ho02", cp: 5,  statLink: null,                           name:"Acute taste",            desc:"+2 bonus to saving throws vs. imbibed poisons." },
      { id:"ho03", cp: 5,  statLink: null,                           name:"Attack bonus",           desc:"+1 attack bonus with one weapon of the player's choice." },
      { id:"ho04", cp: 5,  statLink: null,                           name:"Damage bonus",           desc:"+1 damage bonus with one weapon of the player's choice." },
      { id:"ho05", cp:10,  statLink:{ sub:"fitness", delta:1 },      name:"Fitness bonus",          desc:"+1 to Fitness sub-ability, due to hardy heritage. The character's Fitness score may be up to 5 points higher than his Health sub-ability score." },
      { id:"ho06", cp:10,  statLink: null,                           name:"Infravision 60'",        desc:"Infravision with a 60' range." },
      { id:"ho07", cp: 5,  statLink: null,                           name:"Mining Detection",       desc:"Detect grade/slope in passage (1 on 1d4). Detect new stonework construction (1–2 on 1d6)." },
      { id:"ho08", cp:10,  statLink:{ sub:"stamina", delta:1 },      name:"Stamina bonus",          desc:"+1 to Stamina sub-ability. The character's Stamina score may be up to 5 points higher than his Muscle sub-ability score." },
    ],
  },

  // ─── HALF-OGRE ───────────────────────────────────────────────────
  {
    id: "halfogre", label: "Half-Ogre", icon: "🗿", pool: 15,
    baseStatMods: { STR: 1, CON: 1, INT: -1, CHA: -1 },
    desc: "Massively built beings of ogre and human blood. Extraordinary physical power offset by social stigma and intellectual limitations.",
    abilities: [
      { id:"og01", cp: 5,  statLink: null,                           name:"Attack bonus",       desc:"+1 attack bonus with one melee weapon of the player's choice." },
      { id:"og02", cp: 5,  statLink: null,                           name:"Damage bonus",       desc:"+1 to damage rolls with one melee weapon of the player's choice." },
      { id:"og03", cp:10,  statLink:{ sub:"fitness", delta:1 },      name:"Fitness bonus",      desc:"+1 to Fitness sub-ability, due to hardy heritage. The character's Fitness score may be up to 5 points higher than his Health sub-ability score." },
      { id:"og04", cp:10,  statLink: null,                           name:"Hit point bonus",    desc:"One additional hit point whenever new hit points (for advancing to a new level) are rolled. Flat HP bonus — not a stat change." },
      { id:"og05", cp: 5,  statLink: null,                           name:"Infravision 30'",    desc:"Infravision with a 30' range." },
      { id:"og06", cp:10,  statLink:{ sub:"muscle",  delta:1 },      name:"Muscle bonus",       desc:"+1 to Muscle sub-ability, due to great size. The character's Muscle score may be up to 5 points higher than his Stamina sub-ability score." },
      { id:"og07", cp: 5,  statLink: null,                           name:"Poison resistance",  desc:"+1 to saving throws versus poison." },
      { id:"og08", cp: 5,  statLink: null,                           name:"Tough hide",         desc:"Natural AC of 8. If worn armor would give AC better than 8, this has no effect. If worn armor gives AC 8 or worse, add +1 bonus to AC." },
    ],
  },

  // ─── AARAKOCRA ───────────────────────────────────────────────────
  {
    id: "aarakocra", label: "Aarakocra", icon: "🦅", pool: 20,
    baseStatMods: { DEX: 1, STR: -1 },
    desc: "Avian humanoids from mountain peaks. Their gift of flight comes at the cost of physical frailty and societal isolation.",
    abilities: [
      { id:"ak01", cp:15,  statLink: null,                           name:"Flight",                      desc:"Fly at movement rate 30 (average maneuverability). Cannot fly in heavy armour or full encumbrance." },
      { id:"ak02", cp: 5,  statLink: null,                           name:"Talons",                      desc:"Natural weapons: 2 talon attacks per round at 1d4 each. May grapple mid-flight." },
      { id:"ak03", cp: 5,  statLink: null,                           name:"Weapon bonus",                desc:"+1 to hit with javelins, spears, and other thrown/thrust weapons. Natural aerial combat training." },
    ],
  },

  // ─── THRI-KREEN ──────────────────────────────────────────────────
  {
    id: "thrikreen", label: "Thri-Kreen", icon: "🦗", pool: 25,
    baseStatMods: { DEX: 2, STR: 1, INT: -2, CHA: -4 },
    desc: "Mantis-warriors of the desert wastes. Four-armed, carapace-armoured, and never sleeping — the Thri-Kreen are apex hunters.",
    abilities: [
      { id:"tk01", cp:10,  statLink: null,                           name:"Defensives",                  desc:"+2 to AC and saving throws from lightning-fast reflexes and chitinous exoskeleton." },
      { id:"tk02", cp: 5,  statLink: null,                           name:"Infravision 60'",             desc:"Heat-based darkvision to 60 feet. Highly sensitive compound eyes." },
      { id:"tk03", cp:15,  statLink: null,                           name:"Multiple limbs",              desc:"Four functional arms. May wield 2 weapons in each pair. Extra attack options as per DM." },
      { id:"tk04", cp:10,  statLink: null,                           name:"Natural armor AC 5",          desc:"Chitinous exoskeleton grants natural AC 5. Magical armour bonuses still apply." },
      { id:"tk05", cp:10,  statLink: null,                           name:"Natural weaponry",            desc:"Claw/claw/bite attacks: 1d4+1 / 1d4+1 / 1d4+2. May use all in one round." },
      { id:"tk06", cp:10,  statLink: null,                           name:"Paralyzing bite",             desc:"Bite delivers paralyzing saliva. Target saves vs. poison or paralyzed for 2d6 rounds." },
      { id:"tk07", cp: 5,  statLink: null,                           name:"Poison resistance",           desc:"+4 to all saving throws against poison. Chitinous biology resists toxins." },
      { id:"tk08", cp:10,  statLink: null,                           name:"Psionics",                    desc:"Innate psionic ability: telepathic communication with other Thri-Kreen within 120 feet." },
      { id:"tk09", cp: 5,  statLink: null,                           name:"Special leap",                desc:"Leap up to 20 ft. horizontally or 10 ft. vertically with no running start required." },
      { id:"tk10", cp:10,  statLink: null,                           name:"Stealth",                     desc:"Shift body color to match surroundings. 75% to hide in any natural terrain." },
    ],
  },

  // ─── WEMIC ───────────────────────────────────────────────────────
  {
    id: "wemic", label: "Wemic", icon: "🦁", pool: 20,
    baseStatMods: { STR: 2, INT: -1 },
    desc: "Lion-centaurs of the open savanna. Proud warrior nomads whose leonine lower bodies grant them speed and power unmatched on open ground.",
    abilities: [
      { id:"wm01", cp: 5,  statLink: null,                           name:"Jumping",                     desc:"Leap up to 30 ft. horizontally or 15 ft. vertically when running. Double on sprint." },
      { id:"wm02", cp: 5,  statLink: null,                           name:"Natural AC 6",                desc:"Dense leonine hide provides natural AC 6. Armour (if fitted) stacks as magical bonus only." },
      { id:"wm03", cp: 5,  statLink: null,                           name:"Natural weaponry",            desc:"Claw/claw attacks: 1d6/1d6. If both hit the same target, rear raking claws: 2d4/2d4." },
    ],
  },
];

// ───────────────────────────────────────────────────────────────────
//  5b. MONSTROUS / SPECIAL RACES  (Skills & Powers)
//  budgetCost = internal balance points, NOT official CP.
// ───────────────────────────────────────────────────────────────────

export const MONSTROUS_FEATURES = [
  // ── Standard abilities ──────────────────────────────────────────
  { id:"a_charge_attack",           code:"a",  name:"Charge Attack",                    bp:4, isPenalty:false, isOpt:false, tags:["combat"],     text:"+2 to attack on a charge. With impaling weapon: double damage. Aarakocra dive; centaurs charge; bullywugs leap." },
  { id:"b_move_silently",           code:"b",  name:"Move Silently",                    bp:4, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Move Silently as thief. Base 40% +5%/level." },
  { id:"c_hide_natural",            code:"c",  name:"Hide in Natural Settings",         bp:3, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Hide in natural surroundings as thief. Base 35% +5%/level." },
  { id:"c_hide_75",                 code:"c",  name:"Hide in Natural Settings (75%)",   bp:4, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Fixed 75% chance to hide in natural surroundings." },
  { id:"c_hide_80",                 code:"c",  name:"Hide in Natural Settings (80%)",   bp:5, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Fixed 80% chance to hide in natural surroundings." },
  { id:"c_hide_90",                 code:"c",  name:"Hide in Natural Settings (90%)",   bp:6, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Fixed 90% chance to hide in natural surroundings." },
  { id:"d_infravision_60",          code:"d",  name:"Infravision 60'",                  bp:2, isPenalty:false, isOpt:false, tags:["senses"],      text:"See heat signatures in total darkness up to 60 feet." },
  { id:"e_surprise_opponents",      code:"e",  name:"Surprise Opponents",               bp:3, isPenalty:false, isOpt:false, tags:["combat"],      text:"Bonus to surprise enemies when alone or with stealthy companions. Bugbears: –3 to foes' surprise checks." },
  { id:"f_amphibious",              code:"f",  name:"Amphibious",                       bp:3, isPenalty:false, isOpt:false, tags:["movement"],    text:"No combat penalties in water. Bullywugs breathe water. Lizard men hold breath (CON×2/3) rounds." },
  { id:"g_leap_30",                 code:"g",  name:"Leap (30')",                       bp:3, isPenalty:false, isOpt:false, tags:["movement"],    text:"Leap up to 30' forward or 10' up. Leaping to close = charge. Suffer double damage from spear set vs. charge." },
  { id:"g_leap_50",                 code:"g",  name:"Leap (50')",                       bp:4, isPenalty:false, isOpt:false, tags:["movement"],    text:"Leap up to 50' forward or 20' up (from 3rd level). Leaping to close = charge.", notes:"Unlocks at 3rd level." },
  { id:"h_detect_25",               code:"h",  name:"Detect New Construction (25%)",    bp:1, isPenalty:false, isOpt:false, tags:["underground"], text:"25% chance to detect new or unusual stone construction." },
  { id:"h_detect_35",               code:"h",  name:"Detect New Construction (35%)",    bp:2, isPenalty:false, isOpt:false, tags:["underground"], text:"35% chance to detect new or unusual stone construction." },
  { id:"h_detect_40",               code:"h",  name:"Detect New Construction (40%)",    bp:2, isPenalty:false, isOpt:false, tags:["underground"], text:"40% chance to detect new or unusual stone construction." },
  { id:"i_detect_slope_25",         code:"i",  name:"Detect Sloping Passages (25%)",    bp:1, isPenalty:false, isOpt:false, tags:["underground"], text:"25% chance to detect subtle grades or slopes in underground passages." },
  { id:"i_detect_slope_40",         code:"i",  name:"Detect Sloping Passages (40%)",    bp:2, isPenalty:false, isOpt:false, tags:["underground"], text:"40% chance to detect subtle grades or slopes in underground passages." },
  { id:"j_detect_walls_40",         code:"j",  name:"Detect Shifting Walls (40%)",      bp:2, isPenalty:false, isOpt:false, tags:["underground"], text:"40% chance to detect walls that move or shift." },
  { id:"k_attacked_last",           code:"k",  name:"Attacked Last",                    bp:0, isPenalty:false, isOpt:false, tags:["social"],      text:"Enemies dismiss character as negligible and target others first — unless character displays unusual prowess." },
  { id:"l_hard_to_surprise",        code:"l",  name:"Hard to Surprise",                 bp:3, isPenalty:false, isOpt:false, tags:["senses"],      text:"+2 bonus to all surprise checks." },
  { id:"m_tracking_smell",          code:"m",  name:"Tracking by Scent",                bp:3, isPenalty:false, isOpt:false, tags:["senses"],      text:"Track (as Tracking proficiency) with 50% base success." },
  { id:"n_maze_immunity",           code:"n",  name:"Maze Spell Immunity",              bp:3, isPenalty:false, isOpt:false, tags:["magic"],       text:"Immune to maze spells due to innate familiarity with labyrinths." },
  { id:"o_fearlessness",            code:"o",  name:"Fearlessness",                     bp:2, isPenalty:false, isOpt:false, tags:["combat"],      text:"+3 saving throw vs. fear, scare, cause fear, emotion, dragon fear, and similar." },
  { id:"p_sound_mimicry",           code:"p",  name:"Sound Mimicry",                    bp:2, isPenalty:false, isOpt:false, tags:["social"],      text:"Perfectly imitate any sound heard. Cannot produce magical effects, but non-magical aspects are exact." },
  { id:"q_pick_pockets",            code:"q",  name:"Pick Pockets",                     bp:4, isPenalty:false, isOpt:false, tags:["stealth"],     text:"Pick pockets as thief ability. Base 70% +5%/level." },
  { id:"r_magical_pipes",           code:"r",  name:"Create Magical Pipes",             bp:5, isPenalty:false, isOpt:false, tags:["magic"],       text:"Craft pan pipes that cast charm, sleep, or cause fear (60' radius). Requires 4 CP in Music/Instrument + 3× 2 CP in Music proficiency. Earliest: 3rd level.", notes:"Unlocks at 3rd level after proficiency investment." },
  { id:"s_magic_res_10",            code:"s",  name:"Magic Resistance (10%)",           bp:4, isPenalty:false, isOpt:false, tags:["magic"],       text:"Flat 10% magic resistance." },
  { id:"s_magic_res_level",         code:"s",  name:"Magic Resistance (5%/level)",      bp:5, isPenalty:false, isOpt:false, tags:["magic"],       text:"Magic resistance of 5% per character level (e.g. 30% at 6th level)." },
  { id:"t_antennae",                code:"t",  name:"Antennae",                         bp:2, isPenalty:false, isOpt:false, tags:["senses"],      text:"Sense motion; reduces darkness combat penalties by 1 vs. enemies within 15'." },
  { id:"u_paralyzing_bite",         code:"u",  name:"Paralyzing Bite",                  bp:4, isPenalty:false, isOpt:false, tags:["combat"],      text:"At 5th level: bite attack. Target saves vs. poison or paralyzed 2–16 rounds (1–8 if large; 1 if H+).", notes:"Unlocks at 5th level." },
  { id:"v_dodge_missiles",          code:"v",  name:"Dodge Missiles",                   bp:4, isPenalty:false, isOpt:false, tags:["combat"],      text:"At 7th level: dodge thrown or fired missiles on a roll of 9+ on 1d20.", notes:"Unlocks at 7th level." },
  { id:"w_racial_weapons",          code:"w",  name:"Racial Weapons Proficiency",       bp:2, isPenalty:false, isOpt:false, tags:["combat"],      text:"At 5th level: free chatkcha proficiency (returns if it misses). At 7th level: free gythka proficiency.", notes:"Chatkcha at 5th; gythka at 7th." },
  { id:"x_swan_form",               code:"x",  name:"Swan Form",                        bp:8, isPenalty:false, isOpt:false, tags:["magic"],       text:"Polymorph into swan at will (requires magical token). Swan form: hit only by +1+ weapons; fly at listed speed; MR 2%/level. Equipment stays behind. Losing token blocks transformation." },
  // ── Penalties ───────────────────────────────────────────────────
  { id:"y_claustrophobia",          code:"y",  name:"Claustrophobia",                   bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"–3 to all attack rolls when indoors or underground." },
  { id:"z_size_large",              code:"z",  name:"Size Large",                       bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Size L: wield large weapons one-handed, huge two-handed. Suffers damage as large creature. Equipment restrictions apply." },
  { id:"aa_dehydration",            code:"aa", name:"Dehydration Vulnerability",        bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Must wet entire body 3× per day or lose 2 CON per missed bath. CON 0 = death." },
  { id:"bb_light_sensitivity",      code:"bb", name:"Light Sensitivity",                bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"–1 to attack rolls in daylight or within continual light radius." },
  { id:"cc_racial_enmity",          code:"cc", name:"Racial Enmity (Demihumans)",       bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Dwarves +1 to hit you; gnomes +1 vs. kobolds/goblins. Ogres, bugbears, gnolls suffer –4 to hit gnomes; ogres –4 vs. dwarves." },
  { id:"dd_hideous_appearance",     code:"dd", name:"Hideous Appearance",               bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Effective CHA = 1 (–7) for all Reaction Checks." },
  { id:"ee_easily_distracted",      code:"ee", name:"Easily Distracted",                bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Female with CHA 15+ triggers 1–6 turn distraction. Must save vs. spells to harm or ignore a beautiful woman. Strong drink same effect." },
  { id:"ff_inhuman_form",           code:"ff", name:"Inhuman Form",                     bp:0, isPenalty:true,  isOpt:false, tags:["penalty"],     text:"Body shape restricts standard armor and some magical items. DM adjudicates edge cases." },
  // ── Optional / lore-friendly ────────────────────────────────────
  { id:"opt_keen_eyesight",         code:"–",  name:"Keen Eyesight",                    bp:3, isPenalty:false, isOpt:true, tags:["senses"],      text:"Spot movement up to 1 mile in clear conditions. +2 to surprise checks and ranged attacks from altitude." },
  { id:"opt_aerial_dodge",          code:"–",  name:"Aerial Dodge",                     bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"When airborne: +2 AC vs. ranged attacks." },
  { id:"opt_storm_sense",           code:"–",  name:"Storm Sense",                      bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"Predict weather 12 hours ahead (85% accuracy). +1 initiative outdoors." },
  { id:"opt_flock_tongue",          code:"–",  name:"Flock Tongue",                     bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Communicate simple concepts with normal birds. Birds within 300' warn of approaching enemies." },
  { id:"opt_riddle_master",         code:"–",  name:"Riddle Master",                    bp:3, isPenalty:false, isOpt:true, tags:["social"],      text:"+2 effective INT for puzzles/riddles/strategy. INT 8+ creatures may pause combat for a riddle contest (Reaction +3)." },
  { id:"opt_forest_path",           code:"–",  name:"Forest Path",                      bp:3, isPenalty:false, isOpt:true, tags:["stealth"],     text:"Leaves no tracks in woodland. Group following suffers –20% to being tracked." },
  { id:"opt_berserker",             code:"–",  name:"Berserker Fury",                   bp:4, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: frenzy 3 rounds — +2 attack, +4 damage, –2 AC. Cannot end voluntarily." },
  { id:"opt_stone_catch",           code:"–",  name:"Stone Catch",                      bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/round: catch or deflect a thrown missile (DEX check –2). Caught stone may be thrown back." },
  { id:"opt_ambush_expert",         code:"–",  name:"Ambush Expert",                    bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Doubles surprise penalty from concealment. +1d4 damage on first attack vs. surprised target." },
  { id:"opt_iron_stomach",          code:"–",  name:"Iron Stomach",                     bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"Immune to food poisoning. +4 to saves vs. ingested poisons." },
  { id:"opt_battle_cry",            code:"–",  name:"Battle Cry",                       bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: terrifying roar. All enemies within 20' save vs. fear or flee 1 round." },
  { id:"opt_intimidating_size",     code:"–",  name:"Intimidating Size",                bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Creatures 2 HD or less make morale check on first sight. +2 to Intimidation checks." },
  { id:"opt_swamp_lord",            code:"–",  name:"Swamp Lord",                       bp:3, isPenalty:false, isOpt:true, tags:["movement"],    text:"No movement penalty in swamp/marsh/bog. Cannot sink in mud or quicksand." },
  { id:"opt_toxic_skin",            code:"–",  name:"Toxic Skin Secretion",             bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Creatures making bite or unarmed attacks save vs. poison or nauseated 1 round (–1 all rolls)." },
  { id:"opt_croak_of_doom",         code:"–",  name:"Croak of Doom",                    bp:4, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: deafening croak. All within 20' (except bullywugs) save vs. breath weapon or stunned 1 round." },
  { id:"opt_sticky_tongue",         code:"–",  name:"Sticky Tongue",                    bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Prehensile tongue snatches small items within 10' (DEX check). Can disarm at –2." },
  { id:"opt_nature_lore",           code:"–",  name:"Nature Lore",                      bp:3, isPenalty:false, isOpt:true, tags:["survival"],    text:"70% chance to identify plants/animals/weather. Find food and water for 4 people/day." },
  { id:"opt_trample",               code:"–",  name:"Trample",                          bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Trample a prone, smaller enemy for 2d6 damage (no attack roll needed)." },
  { id:"opt_mounted_archer",        code:"–",  name:"Mounted Archer",                   bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"No attack penalty when firing bows at full movement. May move and shoot in same round." },
  { id:"opt_woodland_guide",        code:"–",  name:"Woodland Guide",                   bp:2, isPenalty:false, isOpt:true, tags:["movement"],    text:"Group travels forests at full speed and cannot become lost by natural means." },
  { id:"opt_pack_tactics",          code:"–",  name:"Pack Tactics",                     bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"+1 to attack rolls when an ally also threatens the same target." },
  { id:"opt_fearsome_presence",     code:"–",  name:"Fearsome Presence",                bp:3, isPenalty:false, isOpt:true, tags:["social"],      text:"Once/day: fierce display. Enemies 1 HD or less within 30' make morale check; failures flee 1d4 rounds." },
  { id:"opt_flindbar_mastery",      code:"–",  name:"Flindbar Mastery",                 bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Free proficiency with the flindbar. On attack roll 19–20, target's held weapon entangled and unusable 1 round." },
  { id:"opt_gnoll_command",         code:"–",  name:"Gnoll Commander",                  bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Allied gnolls within 60' gain +1 to morale checks and attack rolls while visible in combat." },
  { id:"opt_weapons_specialist",    code:"–",  name:"Weapons Specialist",               bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Free proficiency in all firearms and siege engines. +1 attack with such weapons." },
  { id:"opt_military_tactics",      code:"–",  name:"Military Tactics",                 bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: tactical order grants all allies +1 initiative for next round." },
  { id:"opt_thick_skull",           code:"–",  name:"Thick Skull",                      bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Natural DR 2 vs. blunt weapons. +2 to saves vs. stunning." },
  { id:"opt_planar_sense",          code:"–",  name:"Planar Sense",                     bp:3, isPenalty:false, isOpt:true, tags:["magic"],       text:"Sense active portals within 100'. +2 saves vs. planar displacement and banishment." },
  { id:"opt_unarmed_mastery",       code:"–",  name:"Monastic Unarmed Training",        bp:4, isPenalty:false, isOpt:true, tags:["combat"],      text:"Unarmed attacks deal 1d4 damage. Add DEX bonus to AC when unarmored." },
  { id:"opt_chaos_sight",           code:"–",  name:"Chaos Sight",                      bp:3, isPenalty:false, isOpt:true, tags:["magic"],       text:"+4 to saves to disbelieve illusions and phantasms." },
  { id:"opt_mental_discipline",     code:"–",  name:"Mental Discipline",                bp:3, isPenalty:false, isOpt:true, tags:["magic"],       text:"+2 to saves vs. all mind-affecting spells (beyond standard magic resistance)." },
  { id:"opt_pack_hunter",           code:"–",  name:"Pack Hunter",                      bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"+2 to attack when flanking an enemy with at least one other gnoll or flind." },
  { id:"opt_carrion_nose",          code:"–",  name:"Carrion Nose",                     bp:3, isPenalty:false, isOpt:true, tags:["senses"],      text:"Smell blood/corpses within 300'. Track by scent at 30% base success." },
  { id:"opt_battle_howl",           code:"–",  name:"Battle Howl",                      bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/combat: rallying howl. Allied gnolls/flinds within 60' gain +1 attack for 2 rounds." },
  { id:"opt_bone_crusher",          code:"–",  name:"Bone Crusher",                     bp:4, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: vicious bite for 1d6. Target saves vs. death or loses use of one limb 1 turn." },
  { id:"opt_trap_sense",            code:"–",  name:"Trap Sense",                       bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"+2 to saves vs. mechanical traps. 20% chance to notice simple traps when actively searching." },
  { id:"opt_quick_fingers",         code:"–",  name:"Quick Fingers",                    bp:2, isPenalty:false, isOpt:true, tags:["stealth"],     text:"Pick pockets at 30% +3%/level." },
  { id:"opt_vanish_crowds",         code:"–",  name:"Vanish in Crowds",                 bp:3, isPenalty:false, isOpt:true, tags:["stealth"],     text:"In urban/market settings, blend into crowds as standard move. Invisible to pursuit while crowd persists." },
  { id:"opt_sneak_attack",          code:"–",  name:"Sneak Attack",                     bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"+1d4 damage when attacking an unaware or flanked target from behind." },
  { id:"opt_military_bearing",      code:"–",  name:"Military Bearing",                 bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"+2 to Leadership/Reaction in military contexts. Can command up to 10 soldiers effectively." },
  { id:"opt_weapon_training",       code:"–",  name:"Weapon Training",                  bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Free proficiency in three military weapons of choice at character creation." },
  { id:"opt_shield_wall",           code:"–",  name:"Shield Wall",                      bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"When adjacent to a shield-using ally, both gain +1 AC." },
  { id:"opt_forced_march",          code:"–",  name:"Forced March",                     bp:2, isPenalty:false, isOpt:true, tags:["movement"],    text:"Can march 12 hours/day without fatigue checks (normal limit: 8 hours)." },
  { id:"opt_trapmaster",            code:"–",  name:"Trapmaster",                       bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Set simple pit/spike/snare traps given 1 turn + materials. 70% success. +30% to detecting others' traps." },
  { id:"opt_mine_cunning",          code:"–",  name:"Mine Cunning",                     bp:2, isPenalty:false, isOpt:true, tags:["underground"], text:"Underground: +20% to all detection abilities (h, i, j codes)." },
  { id:"opt_swarm_tactics",         code:"–",  name:"Swarm Tactics",                    bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"When 3+ kobolds attack same target, each gains +1 attack (cumulative; max +3)." },
  { id:"opt_shrill_cry",            code:"–",  name:"Shrill Alarm Cry",                 bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Alarm cry audible 300' away. Creatures with acute hearing save vs. breath weapon or stunned 1 round." },
  { id:"opt_hardened_scales",       code:"–",  name:"Hardened Scales",                  bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Natural AC improves by 1 (to AC 4) when wearing no armor." },
  { id:"opt_tail_sweep",            code:"–",  name:"Tail Sweep",                       bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Tail attack: 1d3 damage; target saves vs. petrification or knocked prone (loses next attack)." },
  { id:"opt_cold_blood",            code:"–",  name:"Cold-Blooded Endurance",           bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"Unaffected by natural (non-magical) cold/heat. Half damage from weather exposure." },
  { id:"opt_death_roll",            code:"–",  name:"Death Roll",                       bp:4, isPenalty:false, isOpt:true, tags:["combat"],      text:"When grappling: death roll for 2d4 damage. Target trapped until STR check (–2) or rescue." },
  { id:"opt_labyrinth_memory",      code:"–",  name:"Labyrinth Memory",                 bp:3, isPenalty:false, isOpt:true, tags:["senses"],      text:"Perfect memory for traversed paths. Cannot become lost in dungeon or maze environments." },
  { id:"opt_gore",                  code:"–",  name:"Gore",                             bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Natural horn attack: 1d6 damage; used as secondary attack at –2." },
  { id:"opt_bellowing_charge",      code:"–",  name:"Bellowing Charge",                 bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"When charging, may bellow. Targets 3 HD or less in path save vs. fear or lose next action." },
  { id:"opt_bull_rush",             code:"–",  name:"Bull Rush",                        bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"When charging, push target back 10' (opposed STR) in addition to normal attack. Wall: +1d4 damage." },
  { id:"opt_adaptive",              code:"–",  name:"Adaptive Physiology",              bp:4, isPenalty:false, isOpt:true, tags:["magic"],       text:"Once/day: mimic one natural feature of an observed creature for 1 hour (DM adjudicates)." },
  { id:"opt_shadow_blend",          code:"–",  name:"Shadow Blend",                     bp:3, isPenalty:false, isOpt:true, tags:["stealth"],     text:"Motionless in dim light or shadow: treated as invisible (60% hide success)." },
  { id:"opt_scavengers_eye",        code:"–",  name:"Scavenger's Eye",                  bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"80% chance to find something useful in garbage, ruins, or refuse. Takes 1 turn." },
  { id:"opt_outcasts_empathy",      code:"–",  name:"Outcast's Empathy",                bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Sense emotional states of nearby creatures. +2 Reaction with outcasts, non-evil humanoids, enslaved beings." },
  { id:"opt_brute_force",           code:"–",  name:"Brute Force",                      bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Break wooden doors automatically. Stone doors: 1–2 on 1d6. +2 to STR checks to break/force objects." },
  { id:"opt_thick_hide",            code:"–",  name:"Thick Hide",                       bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Warty hide: natural DR 2 vs. blunt weapons." },
  { id:"opt_hurl_rocks",            code:"–",  name:"Hurl Rocks",                       bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Hurl large stones as ranged attack: 1d8 damage, 60' range, –2 per range increment." },
  { id:"opt_terrifying_presence",   code:"–",  name:"Terrifying Presence",              bp:3, isPenalty:false, isOpt:true, tags:["social"],      text:"Creatures 2 HD or less make morale check on first sight. Failures flee or freeze." },
  { id:"opt_ogre_resilience",       code:"–",  name:"Ogre's Resilience",                bp:3, isPenalty:false, isOpt:true, tags:["survival"],    text:"Regenerate 1 HP per hour of complete rest (natural toughness; not in combat)." },
  { id:"opt_battle_frenzy",         code:"–",  name:"Battle Frenzy",                    bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: frenzy 3 rounds — +2 attack, +1 damage, –1 AC. Cannot disengage voluntarily." },
  { id:"opt_war_paint",             code:"–",  name:"War Paint",                        bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Ritual war paint (1 hour): +2 morale, +1 vs. fear. Washes off after 8 hours or heavy rain." },
  { id:"opt_night_hunter",          code:"–",  name:"Night Hunter",                     bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"+1 to surprise checks when attacking at night or in dim conditions." },
  { id:"opt_orcish_endurance",      code:"–",  name:"Orcish Endurance",                 bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"Recover 1 HP per hour of rest (double normal rate)." },
  { id:"opt_silver_tongue",         code:"–",  name:"Silver Tongue",                    bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"+3 to Reaction checks involving music or merriment. Bards/entertainers begin at Friendly." },
  { id:"opt_woodland_knowledge",    code:"–",  name:"Woodland Knowledge",               bp:2, isPenalty:false, isOpt:true, tags:["survival"],    text:"Know all edible plants, poisonous flora, safe water in woodland. Provide food/water for 4 people/day." },
  { id:"opt_wild_dance",            code:"–",  name:"Dance of the Wild",                bp:4, isPenalty:false, isOpt:true, tags:["magic"],       text:"Once/day: hypnotic dance. Watchers save vs. spells or entranced 1 round (may save each round to break)." },
  { id:"opt_sure_footed",           code:"–",  name:"Sure-Footed",                      bp:2, isPenalty:false, isOpt:true, tags:["combat"],      text:"Cannot be knocked prone. +4 to saves vs. tripping, unbalancing, or knockdown." },
  { id:"opt_sisterhood_bond",       code:"–",  name:"Sisterhood Bond",                  bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Sense location and emotional state of any swanmay within 5 miles. +2 Reaction with druids and rangers." },
  { id:"opt_speak_animals",         code:"–",  name:"Speak with Animals",               bp:3, isPenalty:false, isOpt:true, tags:["social"],      text:"Speak with animals at will (as Druid spell). Birds and waterfowl especially receptive." },
  { id:"opt_swan_call",             code:"–",  name:"Swan Call",                        bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Once/day: summon 1d4 normal swans. They carry messages, distract enemies, or conceal the swanmay." },
  { id:"opt_graceful_evasion",      code:"–",  name:"Graceful Evasion",                 bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"+2 AC when unarmored and unencumbered." },
  { id:"opt_desert_survival",       code:"–",  name:"Desert Survival",                  bp:3, isPenalty:false, isOpt:true, tags:["survival"],    text:"Requires only half normal food/water. +4 saves vs. dehydration and heat exhaustion." },
  { id:"opt_tremorsense",           code:"–",  name:"Tremorsense",                      bp:3, isPenalty:false, isOpt:true, tags:["senses"],      text:"Detect vibrations within 30'. Perceive nearby movement in total darkness or while blinded." },
  { id:"opt_sand_camouflage",       code:"–",  name:"Sandy Camouflage",                 bp:3, isPenalty:false, isOpt:true, tags:["stealth"],     text:"40% chance to hide when motionless in desert or sandy terrain, even without cover." },
  { id:"opt_pack_mind",             code:"–",  name:"Pack Mind",                        bp:2, isPenalty:false, isOpt:true, tags:["social"],      text:"Wordless communication with other thri-kreen within 100'. +1 initiative when acting with another thri-kreen." },
  { id:"opt_lions_roar",            code:"–",  name:"Lion's Roar",                      bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Once/day: terrifying roar. Creatures 3 HD or less within 30' save vs. fear or flee 1d4 rounds." },
  { id:"opt_savanna_stride",        code:"–",  name:"Savanna Stride",                   bp:2, isPenalty:false, isOpt:true, tags:["movement"],    text:"Never fatigued by normal movement on open plains. +3\" MV on open terrain. Cannot become lost on grassland." },
  { id:"opt_pounce",                code:"–",  name:"Pounce",                           bp:3, isPenalty:false, isOpt:true, tags:["combat"],      text:"Leap-attack from standstill: +2 attack as charge, no 1-round setup required." },
  { id:"opt_primal_senses",         code:"–",  name:"Primal Senses",                    bp:3, isPenalty:false, isOpt:true, tags:["senses"],      text:"+2 to all surprise checks. Hear and smell threats at twice normal range." },
];

// Fast lookup map: id → feature
export const MONSTROUS_FEAT_MAP = Object.fromEntries(MONSTROUS_FEATURES.map(f => [f.id, f]));

export const MONSTROUS_RACES = [
  { id:"aarakocra",  name:"Aarakocra",  icon:"🦅", lore:"Intelligent bird-men of the highest mountain peaks. Hollow-boned, swift fliers. Extremely claustrophobic.",
    adjMods:{ DEX:+1, STR:-1, CON:-1 }, ac:7, hpBonus:0, mv:"6, Fl 36(C)", natAtk:"1d3/1d3/1d3 (talons, beak)",
    stdAbils:["a_charge_attack"], penalties:["y_claustrophobia","ff_inhuman_form"],
    opts:["opt_keen_eyesight","opt_aerial_dodge","opt_storm_sense","opt_flock_tongue"] },

  { id:"alaghi",     name:"Alaghi",     icon:"🦍", lore:"Forest-dwelling yeti-kin. Shy and peaceful despite fearsome size. Love riddles and chess.",
    adjMods:{ STR:+2, INT:-2 }, ac:4, hpBonus:9, mv:"12", natAtk:"2d6 (fist)",
    stdAbils:["b_move_silently","c_hide_80"], penalties:["ff_inhuman_form","z_size_large"],
    opts:["opt_riddle_master","opt_forest_path","opt_berserker","opt_stone_catch"] },

  { id:"bugbear",    name:"Bugbear",    icon:"👹", lore:"Largest goblinkind, ~7 ft. Keen senses, amazingly stealthy. True carnivores who live by plunder and ambush.",
    adjMods:{ STR:+1, INT:-1, CHA:-1 }, ac:10, hpBonus:3, mv:"9", natAtk:null,
    stdAbils:["d_infravision_60","e_surprise_opponents"], penalties:["z_size_large"],
    opts:["opt_ambush_expert","opt_iron_stomach","opt_battle_cry","opt_intimidating_size"] },

  { id:"bullywug",   name:"Bullywug",   icon:"🐸", lore:"Bipedal frog-like amphibians of swamps and marshes. Strong swimmers; vulnerable to dehydration.",
    adjMods:{ DEX:+1, INT:-1, CHA:-1 }, ac:6, hpBonus:0, mv:"6, Sw 15", natAtk:null,
    stdAbils:["a_charge_attack","c_hide_75","e_surprise_opponents","f_amphibious","g_leap_30"], penalties:["aa_dehydration"],
    opts:["opt_swamp_lord","opt_toxic_skin","opt_croak_of_doom","opt_sticky_tongue"] },

  { id:"centaur",    name:"Centaur",    icon:"🐴", lore:"Human torso on a horse body. Strong, proud, and impulsive. Fierce warriors who respect nature's balance.",
    adjMods:{ CON:+1, WIS:+1, DEX:-2 }, ac:5, hpBonus:4, mv:"18", natAtk:"1d6/1d6 (hooves)",
    stdAbils:["a_charge_attack"], penalties:["z_size_large","ff_inhuman_form"],
    opts:["opt_nature_lore","opt_trample","opt_mounted_archer","opt_woodland_guide"] },

  { id:"flind",      name:"Flind",      icon:"🐺", lore:"Stronger, smarter hyena-kin. Gnolls regard flinds as champions. More organized and calculating than gnolls.",
    adjMods:{ STR:+1, CHA:-1 }, ac:10, hpBonus:2, mv:"12", natAtk:null,
    stdAbils:["c_hide_natural"], penalties:[],
    opts:["opt_pack_tactics","opt_fearsome_presence","opt_flindbar_mastery","opt_gnoll_command"] },

  { id:"giff",       name:"Giff",       icon:"🦛", lore:"Hulking bipedal hippopotamus-like mercenaries. Immensely strong and loyal. Fascinated by weapons and military tradition.",
    adjMods:{ STR:+2, DEX:-1, INT:-1 }, ac:6, hpBonus:4, mv:"6", natAtk:"2d6 (head butt)",
    stdAbils:["s_magic_res_10"], penalties:["z_size_large"],
    opts:["opt_weapons_specialist","opt_military_tactics","opt_thick_skull"] },

  { id:"githzerai",  name:"Githzerai",  icon:"🧘", lore:"Monastic race from the plane of Limbo. Gaunt and human-like. Strongly loyal to their race despite years of solo wandering.",
    adjMods:{}, ac:10, hpBonus:0, mv:"12", natAtk:null,
    stdAbils:["d_infravision_60","s_magic_res_level"], penalties:[],
    opts:["opt_planar_sense","opt_unarmed_mastery","opt_chaos_sight","opt_mental_discipline"] },

  { id:"gnoll",      name:"Gnoll",      icon:"🦴", lore:"Hyena-like humanoids, chaotic and faithless. Short-tempered and brutish. Subject to demihuman enmity.",
    adjMods:{ STR:+1, INT:-1, CHA:-1 }, ac:10, hpBonus:2, mv:"12", natAtk:null,
    stdAbils:[], penalties:["cc_racial_enmity"],
    opts:["opt_pack_hunter","opt_carrion_nose","opt_battle_howl","opt_bone_crusher"] },

  { id:"goblin",     name:"Goblin",     icon:"👺", lore:"Small (~4 ft), cowardly opportunists. Prefer ambush and letting others fight. Subject to demihuman enmity.",
    adjMods:{ STR:-1, CHA:-1 }, ac:10, hpBonus:0, mv:"6", natAtk:null,
    stdAbils:["d_infravision_60","h_detect_25"], penalties:["bb_light_sensitivity","cc_racial_enmity"],
    opts:["opt_trap_sense","opt_quick_fingers","opt_vanish_crowds","opt_sneak_attack"] },

  { id:"hobgoblin",  name:"Hobgoblin",  icon:"⚔️", lore:"Stocky, militaristic humanoids ~6.5 ft. Society built around war. Perpetually at war with all intelligent creatures.",
    adjMods:{ CHA:-1 }, ac:10, hpBonus:0, mv:"9", natAtk:null,
    stdAbils:["d_infravision_60","h_detect_40","i_detect_slope_40","j_detect_walls_40"], penalties:["cc_racial_enmity"],
    opts:["opt_military_bearing","opt_weapon_training","opt_shield_wall","opt_forced_march"] },

  { id:"kobold",     name:"Kobold",     icon:"🐊", lore:"Smallest goblinkind, ~3 ft, dark scaly hides. Cowardly but vicious when advantaged. Masters of traps and dirty tricks.",
    adjMods:{ STR:-1, CON:-1 }, ac:10, hpBonus:0, mv:"6", natAtk:null,
    stdAbils:["d_infravision_60","k_attacked_last"], penalties:["bb_light_sensitivity","cc_racial_enmity"],
    opts:["opt_trapmaster","opt_mine_cunning","opt_swarm_tactics","opt_shrill_cry"] },

  { id:"lizard_man", name:"Lizard Man", icon:"🦎", lore:"Reptilian humanoids 6–7 ft, tough scales, powerful claws and tail. Exceptional swimmers. Barbarians who react with violence.",
    adjMods:{}, ac:5, hpBonus:0, mv:"6, Sw 12", natAtk:"1d3/1d3/1d6 (claws, tail)",
    stdAbils:["f_amphibious"], penalties:["aa_dehydration"],
    opts:["opt_hardened_scales","opt_tail_sweep","opt_cold_blood","opt_death_roll"] },

  { id:"minotaur",   name:"Minotaur",   icon:"🐂", lore:"Standard AD&D minotaurs. Bull-headed, 7+ ft, revere strength above all. Fight to the death; surrender is weakness.",
    adjMods:{ STR:+2, CON:+2, WIS:-2, CHA:-2 }, ac:6, hpBonus:6, mv:"12", natAtk:"2d6 (head butt)",
    stdAbils:["d_infravision_60","l_hard_to_surprise","m_tracking_smell","n_maze_immunity","o_fearlessness"], penalties:["z_size_large"],
    opts:["opt_labyrinth_memory","opt_gore","opt_bellowing_charge","opt_bull_rush"] },

  { id:"mongrelman", name:"Mongrelman", icon:"🧟", lore:"Grotesque combination of many humanoid races. All hideously ugly. Often enslaved or ostracized. Patient and surprisingly compassionate.",
    adjMods:{ INT:-1, CHA:-1 }, ac:5, hpBonus:0, mv:"9", natAtk:null,
    isMongrel:true,
    stdAbils:["c_hide_80","p_sound_mimicry","q_pick_pockets"], penalties:["dd_hideous_appearance"],
    opts:["opt_adaptive","opt_shadow_blend","opt_scavengers_eye","opt_outcasts_empathy"] },

  { id:"ogre",       name:"Ogre",       icon:"👾", lore:"9+ ft brutes with warty hides. Ill-tempered, cruel, dim-witted. PC ogres are extraordinarily rare exceptions.",
    adjMods:{ STR:+2, CON:+2, INT:-2, CHA:-2 }, ac:5, hpBonus:4, mv:"9", natAtk:null,
    stdAbils:[], penalties:["z_size_large"],
    opts:["opt_brute_force","opt_thick_hide","opt_hurl_rocks","opt_terrifying_presence","opt_ogre_resilience"] },

  { id:"orc",        name:"Orc",        icon:"🗡️", lore:"Primitive-looking humanoids with gray-green skin. Aggressive raiders; respect skill in battle. PC orcs are rare champions.",
    adjMods:{ STR:+1, CHA:-2 }, ac:10, hpBonus:0, mv:"12", natAtk:null,
    stdAbils:["d_infravision_60","h_detect_35","i_detect_slope_25"], penalties:["bb_light_sensitivity","cc_racial_enmity"],
    opts:["opt_battle_frenzy","opt_war_paint","opt_night_hunter","opt_orcish_endurance"] },

  { id:"satyr",      name:"Satyr",      icon:"🐐", lore:"Half-human, half-goat; personifications of wild nature. Love sport, music, and pleasure. See battle as a game.",
    adjMods:{ DEX:+1, CON:+1, INT:-1, CHA:-1 }, ac:5, hpBonus:0, mv:"18", natAtk:"2d4 (head butt)",
    stdAbils:["c_hide_90","d_infravision_60","l_hard_to_surprise","r_magical_pipes"], penalties:["ee_easily_distracted"],
    opts:["opt_silver_tongue","opt_woodland_knowledge","opt_wild_dance","opt_sure_footed"] },

  { id:"swanmay",    name:"Swanmay",    icon:"🦢", lore:"Human females gifted with swan-transformation. Druidic sisterhood near silent lakes. Oppose poachers and raiders.",
    adjMods:{ DEX:+1, WIS:+1 }, ac:7, hpBonus:0, mv:"15, Fl 19(D)", natAtk:null,
    stdAbils:["x_swan_form"], penalties:[],
    opts:["opt_sisterhood_bond","opt_speak_animals","opt_swan_call","opt_graceful_evasion"] },

  { id:"thri_kreen", name:"Thri-kreen", icon:"🦗", lore:"Large intelligent insects ('mantis warriors'). 7 ft at shoulder, six limbs, tough exoskeleton. Nomadic hunters.",
    adjMods:{ DEX:+1, WIS:+1, INT:-1, CHA:-1 }, ac:5, hpBonus:0, mv:"18", natAtk:"1d4 (×4 claws), 2–5 (bite)",
    stdAbils:["g_leap_50","t_antennae","u_paralyzing_bite","v_dodge_missiles","w_racial_weapons"], penalties:["ff_inhuman_form"],
    opts:["opt_desert_survival","opt_tremorsense","opt_sand_camouflage","opt_pack_mind"] },

  { id:"wemic",      name:"Wemic",      icon:"🦁", lore:"Part human, part lion (as centaur combines human and horse). Aboriginal nomadic hunters. Leonine and fierce.",
    adjMods:{ STR:+1, DEX:-1 }, ac:6, hpBonus:5, mv:"12", natAtk:"1d4/1d4 (claws)",
    stdAbils:["g_leap_50"], penalties:["z_size_large","ff_inhuman_form"],
    opts:["opt_lions_roar","opt_savanna_stride","opt_pounce","opt_primal_senses"] },
];
