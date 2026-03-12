// data/thieving.js — AD&D 2E S&P Thieving Abilities data (Tables 28–30)

export const THIEF_DISC_POINTS = 60; // discretionary skill points per level-up (base)

// ── Skill definitions ─────────────────────────────────────────────────────────
export const THIEF_SKILLS = [
  { id:"pp",   label:"Pick Pockets",       shortLabel:"PP",   base:15 },
  { id:"ol",   label:"Open Locks",         shortLabel:"OL",   base:10 },
  { id:"frt",  label:"Find/Remove Traps",  shortLabel:"F/RT", base:5  },
  { id:"ms",   label:"Move Silently",      shortLabel:"MS",   base:10 },
  { id:"hs",   label:"Hide in Shadows",    shortLabel:"HS",   base:5  },
  { id:"dn",   label:"Detect Noise",       shortLabel:"DN",   base:15 },
  { id:"cw",   label:"Climb Walls",        shortLabel:"CW",   base:60 },
  // Gated skills — need CP purchase to allocate points
  { id:"rl",   label:"Read Languages",     shortLabel:"RL",   base:0,  needsCp:"readLang"  },
  { id:"dm",   label:"Detect Magic",       shortLabel:"DM",   base:5,  needsCp:"scrollUse" },
  { id:"di",   label:"Detect Illusion",    shortLabel:"DI",   base:10, needsCp:"scrollUse" },
  { id:"brib", label:"Bribery",            shortLabel:"Brib", base:5  },
  { id:"tunn", label:"Tunneling",          shortLabel:"Tunn", base:15 },
  { id:"eb",   label:"Escape Bonds",       shortLabel:"EB",   base:10 },
];

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

// ── Table 29 — DEX (aim) adjustments to thief skills ─────────────────────────
// Keyed by aim/DEX score. Use Math.max(9, Math.min(20, score)) to clamp.
// Only PP, OL, MS, HS are affected.
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

// ── CP-Purchased Thieving Abilities ──────────────────────────────────────────
// These cost CP from the main pool. Some unlock gated skills.
export const THIEF_CP_ABILS = [
  {
    id:"backstab",
    label:"Backstab",
    cp:10,
    desc:"May backstab a target who is unaware of attacker: +4 to hit, ×2 damage (×3 at 5th, ×4 at 9th, ×5 at 13th level).",
  },
  {
    id:"defBonus",
    label:"Defense Bonus",
    cp:10,
    desc:"+2 bonus to Armor Class when unarmored and unencumbered.",
  },
  {
    id:"scrollUse",
    label:"Scroll Use",
    cp:10,
    desc:"Read and use magical scrolls (wizard and priest). Unlocks Detect Magic and Detect Illusion thieving skills.",
    unlocks:["dm","di"],
  },
  {
    id:"thiefCant",
    label:"Thieves' Cant",
    cp:5,
    desc:"Knows the secret argot of the thieves' guild. Communicate covertly with other thieves.",
  },
  {
    id:"readLang",
    label:"Read Languages",
    cp:5,
    desc:"Can attempt to read foreign languages with the Read Languages skill (RL). Unlocks RL discretionary allocation.",
    unlocks:["rl"],
  },
];

// Helper: get racial adj for a race (default all-0 if unknown)
export function getThiefRacialAdj(raceId) {
  return THIEF_RACIAL_ADJ[raceId] ?? THIEF_RACIAL_ADJ.human;
}

// Helper: get DEX adj for a dex score (clamp 9-20)
export function getThiefDexAdj(dexScore) {
  const clamped = Math.max(9, Math.min(20, Math.floor(dexScore)));
  return THIEF_DEX_ADJ[clamped] ?? {};
}

// Helper: compute final skill score
// base + racial + dex + armor + disc (min 1, max 95 for most skills)
export function calcThiefSkill(skillId, { base, racial, dex, armor, disc }) {
  const racAdj  = racial?.[skillId]  ?? 0;
  const dexAdj  = dex?.[skillId]    ?? 0;
  const armAdj  = armor?.[skillId]  ?? 0;
  const discPts = disc?.[skillId]   ?? 0;
  return Math.max(1, base + racAdj + dexAdj + armAdj + discPts);
}
