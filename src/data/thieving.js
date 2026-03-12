// data/thieving.js — AD&D 2E S&P Thieving Abilities data (Tables 28–30)

export const THIEF_DISC_POINTS = 60; // discretionary skill points per level-up (base)

// ── Skill definitions ─────────────────────────────────────────────────────────
// subStat: which sub-ability score drives the DEX-adjustment column
//   "aim"     → PP, OL, F/RT  (dexterity / fine motor)
//   "balance" → MS, HS        (balance / stealth motor)
//   null      → not affected by DEX sub-stat adjustments
export const THIEF_SKILLS = [
  { id:"pp",   label:"Pick Pockets",       shortLabel:"PP",   base:15, subStat:"aim"     },
  { id:"ol",   label:"Open Locks",         shortLabel:"OL",   base:10, subStat:"aim"     },
  { id:"frt",  label:"Find/Remove Traps",  shortLabel:"F/RT", base:5,  subStat:"aim"     },
  { id:"ms",   label:"Move Silently",      shortLabel:"MS",   base:10, subStat:"balance" },
  { id:"hs",   label:"Hide in Shadows",    shortLabel:"HS",   base:5,  subStat:"balance" },
  { id:"dn",   label:"Detect Noise",       shortLabel:"DN",   base:15, subStat:null      },
  { id:"cw",   label:"Climb Walls",        shortLabel:"CW",   base:60, subStat:null      },
  { id:"rl",   label:"Read Languages",     shortLabel:"RL",   base:0,  subStat:null      },
  { id:"dm",   label:"Detect Magic",       shortLabel:"DM",   base:5,  subStat:null      },
  { id:"di",   label:"Detect Illusion",    shortLabel:"DI",   base:10, subStat:null      },
  { id:"brib", label:"Bribery",            shortLabel:"Brib", base:5,  subStat:null      },
  { id:"tunn", label:"Tunneling",          shortLabel:"Tunn", base:15, subStat:null      },
  { id:"eb",   label:"Escape Bonds",       shortLabel:"EB",   base:10, subStat:null      },
];

// ── Class ability gating ───────────────────────────────────────────────────────
// Maps skill ID → { classId: { abilId, base?, subStat? } }
//   abilId:  CLASS_ABILITIES[classId] entry that must be picked to unlock this skill
//   base:    overrides the skill's default base% for that class (optional)
//   subStat: overrides the skill's subStat for that class (use null to suppress sub-stat adj)
//
// Ranger base values from S&P Table 22 (level 1), before racial/DEX adjustments:
//   MS=15%, HS=10%, F/RT=15%, DN=15%, CW=70%
//
// Classes whose entry is absent or undefined cannot use that skill at all.
export const SKILL_CLASS_ABILS = {
  pp:   { thief: { abilId:"th15" },                  bard:  { abilId:"ba09", base:10 } },
  ol:   { thief: { abilId:"th14" } },
  frt:  { thief: { abilId:"th09" },                  ranger:{ abilId:"rn05", base:15, subStat:null } },
  ms:   { thief: { abilId:"th13" },                  ranger:{ abilId:"rn08", base:15 } },
  hs:   { thief: { abilId:"th12" },                  ranger:{ abilId:"rn07", base:10 } },
  dn:   { thief: { abilId:"th07" }, bard: { abilId:"ba07", base:20 }, ranger:{ abilId:"rn03", base:15, subStat:null } },
  cw:   { thief: { abilId:"th03" }, bard: { abilId:"ba04", base:50 }, ranger:{ abilId:"rn02", base:70, subStat:null } },
  rl:   { thief: { abilId:"th16" }, bard: { abilId:"ba11", base:5  } },
  dm:   { thief: { abilId:"th06" }, bard: { abilId:"ba06", base:10 } },
  di:   { thief: { abilId:"th05" } },
  brib: { thief: { abilId:"th02" } },
  tunn: { thief: { abilId:"th20" } },
  eb:   { thief: { abilId:"th08" } },
};

// ── Table 28 — Racial adjustments to thief skills ─────────────────────────────
// Keys match selectedRace values in useCharacter.js
// Any race not listed → treated as human (all 0)
export const THIEF_RACIAL_ADJ = {
  human:    { pp:0,   ol:0,   frt:0,   ms:0,   hs:0,   dn:0,   cw:0,   rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
  dwarf:    { pp:-10, ol:+10, frt:+15, ms:+5,  hs:0,   dn:+15, cw:-10, rl:+5, dm:0, di:0, brib:0, tunn:+15, eb:0 },
  elf:      { pp:+10, ol:+5,  frt:-5,  ms:+10, hs:+5,  dn:0,   cw:0,   rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
  gnome:    { pp:+5,  ol:+10, frt:+10, ms:+5,  hs:+5,  dn:+10, cw:-15, rl:0, dm:0, di:0, brib:0, tunn:+10, eb:0 },
  halfelf:  { pp:+10, ol:0,   frt:0,   ms:+5,  hs:+10, dn:0,   cw:0,   rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
  halforc:  { pp:-5,  ol:0,   frt:0,   ms:+5,  hs:+5,  dn:+5,  cw:+10, rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
  halfogre: { pp:-10, ol:-5,  frt:-5,  ms:-5,  hs:-5,  dn:+5,  cw:+10, rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
  halfling: { pp:+15, ol:+5,  frt:+5,  ms:+15, hs:+15, dn:+5,  cw:-15, rl:0, dm:0, di:0, brib:0, tunn:0,  eb:0 },
};

// ── Table 29 — Sub-stat adjustments to thief skills ──────────────────────────
// Keyed by sub-ability score (aim or balance, clamped 9–20).
// aim     affects: PP (+/−), OL (+/−), and F/RT column (all 0 — not in PHB table)
// balance affects: MS (+/−), HS (+/−)
// Skills not listed in an entry have an implied adjustment of 0.
export const THIEF_DEX_ADJ = {
   9: { pp:-15, ol:-10, ms:-20, hs:-15 },
  10: { pp:-10, ol:-5,  ms:-15, hs:-10 },
  11: { pp:-5,  ol:-5,  ms:-10, hs:-5  },
  12: {},
  13: {},
  14: {},
  15: {},
  16: { pp:+5 },
  17: { pp:+5,  ol:+5,  ms:+5,  hs:+5  },
  18: { pp:+10, ol:+10, ms:+10, hs:+10 },
  19: { pp:+15, ol:+10, ms:+15, hs:+15 },
  20: { pp:+20, ol:+15, ms:+20, hs:+20 },
};

// ── Table 30 — Armor adjustments to thief skills ─────────────────────────────
// Three choices: no_armor (best), elven_chain (moderate), padded_studded (baseline 0)
export const THIEF_ARMOR_OPTIONS = ["no_armor","elven_chain","padded_studded"];
export const THIEF_ARMOR_ADJ = {
  padded_studded: { label:"Padded / Studded Leather", pp:0,   ol:0,   frt:0,  ms:0,   hs:0,  dn:0, cw:0   },
  elven_chain:    { label:"Elven Chain",              pp:+5,  ol:+5,  frt:0,  ms:+5,  hs:+5, dn:0, cw:0   },
  no_armor:       { label:"No Armor",                 pp:+5,  ol:+10, frt:+5, ms:+10, hs:+5, dn:0, cw:+10 },
};

// Helper: get racial adj for a race (default all-0 if unknown)
export function getThiefRacialAdj(raceId) {
  return THIEF_RACIAL_ADJ[raceId] ?? THIEF_RACIAL_ADJ.human;
}

// Helper: get sub-stat adj for a score (clamp 9-20)
export function getThiefDexAdj(score) {
  const clamped = Math.max(9, Math.min(20, Math.floor(score)));
  return THIEF_DEX_ADJ[clamped] ?? {};
}

// Helper: compute per-skill sub-stat adjustment
// aimScore: effSub("aim"), balScore: effSub("balance")
export function getSkillSubAdj(sk, aimScore, balScore) {
  if (sk.subStat === "aim")     return getThiefDexAdj(aimScore)[sk.id] ?? 0;
  if (sk.subStat === "balance") return getThiefDexAdj(balScore)[sk.id] ?? 0;
  return 0;
}

// Helper: compute final skill score
// base + racial + subAdj + armor + disc (min 1)
export function calcThiefSkill(skillId, { base, racial, dex, armor, disc }) {
  const racAdj  = racial?.[skillId]  ?? 0;
  const dexAdj  = dex?.[skillId]    ?? 0;
  const armAdj  = armor?.[skillId]  ?? 0;
  const discPts = disc?.[skillId]   ?? 0;
  return Math.max(1, base + racAdj + dexAdj + armAdj + discPts);
}
