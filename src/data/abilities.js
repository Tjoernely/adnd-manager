// data/abilities.js — AD&D 2nd Edition ability score tables and sub-ability functions

// ───────────────────────────────────────────────────────────────────
//  1. ABILITY SCORE ARCHITECTURE
// ───────────────────────────────────────────────────────────────────

export const PARENT_STATS = ["STR", "DEX", "CON", "INT", "WIS", "CHA"];

export const PARENT_STAT_LABELS = {
  STR: "Strength", DEX: "Dexterity", CON: "Constitution",
  INT: "Intelligence", WIS: "Wisdom",  CHA: "Charisma",
};

// Each parent stat has exactly 2 sub-abilities.
// Sub-ability splitting: each sub can differ from the parent score by ±2 max
// (unlimited when Rule-Breaker mode is active).
export const SUB_ABILITIES = {
  STR: [
    { id: "muscle",    label: "Muscle",    desc: "Raw physical power. Governs melee attack/damage bonuses and max press." },
    { id: "stamina",   label: "Stamina",   desc: "Endurance and resistance to exhaustion. Affects carrying capacity and forced march." },
  ],
  DEX: [
    { id: "aim",       label: "Aim",       desc: "Precision and fine motor skill. Ranged attack bonus and thief skills." },
    { id: "balance",   label: "Balance",   desc: "Agility and reaction speed. Governs AC modifier, initiative, and tumbling." },
  ],
  CON: [
    { id: "health",    label: "Health",    desc: "Resistance to disease, poison, and systemic trauma. Resurrection survival." },
    { id: "fitness",   label: "Fitness",   desc: "Vitality and recovery rate. Governs HP bonus per level and system shock." },
  ],
  INT: [
    { id: "knowledge", label: "Knowledge", desc: "Learning and memory. Grants bonus CP via Table 10 (p.12). Spell learning and lore." },
    { id: "knowledge", label: "Knowledge", desc: "Breadth of learned information. Max languages known. Lore rolls." },
  ],
  WIS: [
    { id: "intuition", label: "Intuition", desc: "Awareness and spiritual insight. Magical attack/defense bonus." },
    { id: "willpower", label: "Willpower", desc: "Mental fortitude. Governs saves vs. compulsion, fear, and mind control." },
  ],
  CHA: [
    { id: "leadership",label: "Leadership",desc: "Command authority. Max henchmen and morale modifier." },
    { id: "appearance",label: "Appearance",desc: "Physical impression. NPC reaction roll modifier on first meeting." },
  ],
};

// Flat list & reverse-lookup parent
export const ALL_SUBS = Object.values(SUB_ABILITIES).flat();
export const SUB_PARENT = {};
ALL_SUBS.forEach(s => {
  const p = Object.entries(SUB_ABILITIES).find(([, arr]) => arr.some(x => x.id === s.id))?.[0];
  if (p) SUB_PARENT[s.id] = p;
});

// For each parent stat, which two sub-ids form the split pair?
export const SPLIT_PAIRS = Object.fromEntries(
  Object.entries(SUB_ABILITIES).map(([p, arr]) => [p, arr.map(s => s.id)])
);

// Max split delta allowed per sub (each direction) — enforced unless Rule-Breaker
export const MAX_SPLIT = 2;

// ───────────────────────────────────────────────────────────────────
//  2. LOOKUP TABLES
// ───────────────────────────────────────────────────────────────────

// Table 10 (p.12): Reason score → bonus NWP CP slots (1 CP per slot)
// ─── TABLE 9/Knowledge: Bonus CPs (= bonus proficiency slots per S&P Table 9) ──
// Knowledge 3-8 = 1 bonus CP; goes up to 20 CPs at 25
// ─── TABLE 9/Knowledge: Bonus CPs (= bonus proficiency slots per S&P Table 9) ──
// Knowledge 3-8 = 1 bonus CP; goes up to 20 CPs at 25
export const TABLE_10 = [
  { max:  8, cp:  1 },
  { max: 11, cp:  2 },
  { max: 13, cp:  3 },
  { max: 15, cp:  4 },
  { max: 16, cp:  5 },
  { max: 17, cp:  6 },
  { max: 18, cp:  7 },
  { max: 19, cp:  8 },
  { max: 20, cp:  9 },
  { max: 21, cp: 10 },
  { max: 22, cp: 11 },
  { max: 23, cp: 12 },
  { max: 24, cp: 15 },
  { max: 99, cp: 20 },
];
export const getKnowledgeCP = score => TABLE_10.find(r => score <= r.max)?.cp ?? 1;

// Table 44: Sub-ability score → Success Roll modifier (proficiency checks)
export const TABLE_44 = [
  { max:  5, mod: -5 },
  { max:  8, mod: -3 },
  { max: 12, mod: -1 },
  { max: 15, mod:  0 },
  { max: 18, mod:  2 },
  { max: 20, mod:  4 },
  { max: 99, mod:  5 },
];
export const getT44Mod = score => TABLE_44.find(r => score <= r.max)?.mod ?? 0;

// ─── TABLE 3: Muscle ─────────────────────────────────────────────────
// attAdj, dmgAdj, maxPress, openDoors, bendBars
// For score === 18 warriors: pass exStrPct (1-100, 100=18/00)
export const getMuscleStats = (score, exStrPct = 0) => {
  if (score <=  3) return { attAdj:-3, dmgAdj:-1, maxPress:10,   openDoors:"2",        bendBars:"0%"  };
  if (score <=  5) return { attAdj:-2, dmgAdj:-1, maxPress:25,   openDoors:"3",        bendBars:"0%"  };
  if (score <=  7) return { attAdj:-1, dmgAdj: 0, maxPress:55,   openDoors:"4",        bendBars:"0%"  };
  if (score <=  9) return { attAdj: 0, dmgAdj: 0, maxPress:90,   openDoors:"5",        bendBars:"1%"  };
  if (score <= 11) return { attAdj: 0, dmgAdj: 0, maxPress:115,  openDoors:"6",        bendBars:"2%"  };
  if (score <= 13) return { attAdj: 0, dmgAdj: 0, maxPress:140,  openDoors:"7",        bendBars:"4%"  };
  if (score <= 15) return { attAdj: 0, dmgAdj: 0, maxPress:170,  openDoors:"8",        bendBars:"7%"  };
  if (score === 16) return { attAdj: 0, dmgAdj:+1, maxPress:195, openDoors:"9",        bendBars:"10%" };
  if (score === 17) return { attAdj:+1, dmgAdj:+1, maxPress:220, openDoors:"10",       bendBars:"13%" };
  if (score === 18) {
    if (exStrPct === 0)  return { attAdj:+1, dmgAdj:+3, maxPress:255, openDoors:"11",       bendBars:"16%" };
    if (exStrPct <=  50) return { attAdj:+1, dmgAdj:+3, maxPress:280, openDoors:"12",       bendBars:"20%" };
    if (exStrPct <=  75) return { attAdj:+2, dmgAdj:+3, maxPress:305, openDoors:"13",       bendBars:"25%" };
    if (exStrPct <=  90) return { attAdj:+2, dmgAdj:+4, maxPress:330, openDoors:"14",       bendBars:"30%" };
    if (exStrPct <=  99) return { attAdj:+2, dmgAdj:+5, maxPress:380, openDoors:"15 (3)",   bendBars:"35%" };
    /* 100=18/00 */       return { attAdj:+3, dmgAdj:+6, maxPress:480, openDoors:"16 (6)",   bendBars:"40%" };
  }
  if (score === 19) return { attAdj:+3, dmgAdj:+7,  maxPress:640,  openDoors:"16 (8)",  bendBars:"50%" };
  if (score === 20) return { attAdj:+3, dmgAdj:+8,  maxPress:700,  openDoors:"17 (10)", bendBars:"60%" };
  if (score === 21) return { attAdj:+4, dmgAdj:+9,  maxPress:810,  openDoors:"17 (12)", bendBars:"70%" };
  if (score === 22) return { attAdj:+4, dmgAdj:+10, maxPress:970,  openDoors:"18 (14)", bendBars:"80%" };
  if (score === 23) return { attAdj:+5, dmgAdj:+11, maxPress:1130, openDoors:"18 (16)", bendBars:"90%" };
  if (score === 24) return { attAdj:+6, dmgAdj:+12, maxPress:1440, openDoors:"19 (17)", bendBars:"95%" };
  /* 25 */          return { attAdj:+7, dmgAdj:+14, maxPress:1535, openDoors:"19 (18)", bendBars:"99%" };
};

// ─── TABLE 2: Stamina — Weight Allowance (lbs) ───────────────────────
// For score === 18 warriors, also pass exStrPct to get 18/xx row
export const getStaminaStats = (score, exStrPct = 0) => {
  if (score <=  3)  return { weightAllow: 5    };
  if (score <=  5)  return { weightAllow: 10   };
  if (score <=  7)  return { weightAllow: 20   };
  if (score <=  9)  return { weightAllow: 35   };
  if (score <= 11)  return { weightAllow: 40   };
  if (score <= 13)  return { weightAllow: 45   };
  if (score <= 15)  return { weightAllow: 55   };
  if (score === 16) return { weightAllow: 70   };
  if (score === 17) return { weightAllow: 85   };
  if (score === 18) {
    if (exStrPct === 0)  return { weightAllow: 110 };
    if (exStrPct <=  50) return { weightAllow: 135 };
    if (exStrPct <=  75) return { weightAllow: 160 };
    if (exStrPct <=  90) return { weightAllow: 185 };
    if (exStrPct <=  99) return { weightAllow: 235 };
    /* 18/00 */           return { weightAllow: 335 };
  }
  if (score === 19) return { weightAllow: 485  };
  if (score === 20) return { weightAllow: 535  };
  if (score === 21) return { weightAllow: 635  };
  if (score === 22) return { weightAllow: 785  };
  if (score === 23) return { weightAllow: 935  };
  if (score === 24) return { weightAllow: 1235 };
  /* 25 */          return { weightAllow: 1535 };
};

// ─── TABLE 4: Aim — Missile Adj, Pick Pockets, Open Locks ────────────
export const getAimStats = score => {
  // [missileAdj, pickPockets%, openLocks%]
  if (score <=  3) return { missileAdj:-3, pickPockets:-30, openLocks:-30 };
  if (score ===  4) return { missileAdj:-2, pickPockets:-25, openLocks:-25 };
  if (score ===  5) return { missileAdj:-1, pickPockets:-25, openLocks:-20 };
  if (score ===  6) return { missileAdj: 0, pickPockets:-20, openLocks:-20 };
  if (score ===  7) return { missileAdj: 0, pickPockets:-20, openLocks:-15 };
  if (score ===  8) return { missileAdj: 0, pickPockets:-15, openLocks:-15 };
  if (score ===  9) return { missileAdj: 0, pickPockets:-15, openLocks:-10 };
  if (score === 10) return { missileAdj: 0, pickPockets:-10, openLocks: -5 };
  if (score === 11) return { missileAdj: 0, pickPockets: -5, openLocks:  0 };
  if (score <= 15)  return { missileAdj: 0, pickPockets:  0, openLocks:  0 };
  if (score === 16) return { missileAdj:+1, pickPockets:  0, openLocks: +5 };
  if (score === 17) return { missileAdj:+2, pickPockets: +5, openLocks:+10 };
  if (score === 18) return { missileAdj:+2, pickPockets:+10, openLocks:+15 };
  if (score === 19) return { missileAdj:+3, pickPockets:+15, openLocks:+20 };
  if (score === 20) return { missileAdj:+3, pickPockets:+20, openLocks:+20 };
  if (score === 21) return { missileAdj:+4, pickPockets:+20, openLocks:+25 };
  if (score === 22) return { missileAdj:+4, pickPockets:+25, openLocks:+25 };
  if (score === 23) return { missileAdj:+4, pickPockets:+25, openLocks:+30 };
  if (score === 24) return { missileAdj:+5, pickPockets:+30, openLocks:+30 };
  /* 25 */          return { missileAdj:+5, pickPockets:+30, openLocks:+35 };
};

// ─── TABLE 5: Balance — Reaction Adj, Defensive Adj (AC), Move Silently, Climb Walls ──
// DefAdj: negative = better AC in 2E. ReactAdj: positive = less likely surprised.
export const getBalanceStats = score => {
  if (score <=  3) return { reactAdj:-3, defAdj:+4, moveSilent:-30, climbWalls:-30 };
  if (score ===  4) return { reactAdj:-2, defAdj:+3, moveSilent:-30, climbWalls:-25 };
  if (score ===  5) return { reactAdj:-1, defAdj:+2, moveSilent:-30, climbWalls:-20 };
  if (score ===  6) return { reactAdj: 0, defAdj:+1, moveSilent:-25, climbWalls:-20 };
  if (score ===  7) return { reactAdj: 0, defAdj: 0, moveSilent:-25, climbWalls:-15 };
  if (score ===  8) return { reactAdj: 0, defAdj: 0, moveSilent:-20, climbWalls:-15 };
  if (score ===  9) return { reactAdj: 0, defAdj: 0, moveSilent:-20, climbWalls:-10 };
  if (score === 10) return { reactAdj: 0, defAdj: 0, moveSilent:-15, climbWalls: -5 };
  if (score === 11) return { reactAdj: 0, defAdj: 0, moveSilent:-10, climbWalls:  0 };
  if (score === 12) return { reactAdj: 0, defAdj: 0, moveSilent: -5, climbWalls:  0 };
  if (score <= 14)  return { reactAdj: 0, defAdj: 0, moveSilent:  0, climbWalls:  0 };
  if (score === 15) return { reactAdj: 0, defAdj:-1, moveSilent:  0, climbWalls:  0 };
  if (score === 16) return { reactAdj:+1, defAdj:-2, moveSilent:  0, climbWalls:  0 };
  if (score === 17) return { reactAdj:+2, defAdj:-3, moveSilent: +5, climbWalls: +5 };
  if (score === 18) return { reactAdj:+2, defAdj:-4, moveSilent:+10, climbWalls:+10 };
  if (score === 19) return { reactAdj:+3, defAdj:-4, moveSilent:+15, climbWalls:+15 };
  if (score === 20) return { reactAdj:+3, defAdj:-4, moveSilent:+15, climbWalls:+20 };
  if (score === 21) return { reactAdj:+4, defAdj:-5, moveSilent:+20, climbWalls:+20 };
  if (score === 22) return { reactAdj:+4, defAdj:-5, moveSilent:+20, climbWalls:+25 };
  if (score === 23) return { reactAdj:+5, defAdj:-6, moveSilent:+25, climbWalls:+25 };
  if (score === 24) return { reactAdj:+5, defAdj:-6, moveSilent:+25, climbWalls:+30 };
  /* 25 */          return { reactAdj:+5, defAdj:-6, moveSilent:+30, climbWalls:+30 };
};

// ─── TABLE 6: Health — System Shock, Poison Save ─────────────────────
// resurrSurv moved to Fitness (Table 7). poisonSave is a saving throw bonus.
export const getHealthStats = score => {
  if (score <=  3) return { sysShock: 35, poisonSave: 0 };
  if (score ===  4) return { sysShock: 40, poisonSave: 0 };
  if (score ===  5) return { sysShock: 45, poisonSave: 0 };
  if (score ===  6) return { sysShock: 50, poisonSave: 0 };
  if (score ===  7) return { sysShock: 55, poisonSave: 0 };
  if (score ===  8) return { sysShock: 60, poisonSave: 0 };
  if (score ===  9) return { sysShock: 65, poisonSave: 0 };
  if (score === 10) return { sysShock: 70, poisonSave: 0 };
  if (score === 11) return { sysShock: 75, poisonSave: 0 };
  if (score === 12) return { sysShock: 80, poisonSave: 0 };
  if (score === 13) return { sysShock: 85, poisonSave: 0 };
  if (score === 14) return { sysShock: 88, poisonSave: 0 };
  if (score === 15) return { sysShock: 90, poisonSave: 0 };
  if (score === 16) return { sysShock: 95, poisonSave: 0 };
  if (score === 17) return { sysShock: 97, poisonSave: 0 };
  if (score === 18) return { sysShock: 99, poisonSave: 0 };
  if (score === 19) return { sysShock: 99, poisonSave:+1 };
  if (score === 20) return { sysShock: 99, poisonSave:+1 };
  if (score === 21) return { sysShock: 99, poisonSave:+2 };
  if (score === 22) return { sysShock: 99, poisonSave:+2 };
  if (score === 23) return { sysShock: 99, poisonSave:+3 };
  if (score === 24) return { sysShock: 99, poisonSave:+3 };
  /* 25 */          return { sysShock:100, poisonSave:+4 };
};

// ─── TABLE 7: Fitness — HP Bonus/Level, Resurrection Survival ────────
// hpBonus: non-warrior cap. hpBonusWarrior: warrior value (parenthetical).
// All classes cap at +2 max per die EXCEPT warriors, who get the parenthetical bonus.
// Note: brackets on S&P table (1→2, 1-2→3, 1-3→4) not tracked here — displayed as note.
export const getFitnessStats = score => {
  if (score <=  3) return { hpBonus:-2, hpBonusWarrior:-2, resurrSurv: 40 };
  if (score ===  4) return { hpBonus:-1, hpBonusWarrior:-1, resurrSurv: 45 };
  if (score ===  5) return { hpBonus:-1, hpBonusWarrior:-1, resurrSurv: 50 };
  if (score ===  6) return { hpBonus:-1, hpBonusWarrior:-1, resurrSurv: 55 };
  if (score ===  7) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 60 };
  if (score ===  8) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 65 };
  if (score ===  9) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 70 };
  if (score === 10) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 75 };
  if (score === 11) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 80 };
  if (score === 12) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 85 };
  if (score === 13) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 90 };
  if (score === 14) return { hpBonus: 0, hpBonusWarrior: 0, resurrSurv: 92 };
  if (score === 15) return { hpBonus:+1, hpBonusWarrior:+1, resurrSurv: 94 };
  if (score === 16) return { hpBonus:+2, hpBonusWarrior:+2, resurrSurv: 96 };
  if (score === 17) return { hpBonus:+2, hpBonusWarrior:+3, resurrSurv: 98 };
  if (score === 18) return { hpBonus:+2, hpBonusWarrior:+4, resurrSurv:100 };
  if (score === 19) return { hpBonus:+2, hpBonusWarrior:+5, resurrSurv:100 };
  if (score === 20) return { hpBonus:+2, hpBonusWarrior:+5, resurrSurv:100 };
  if (score === 21) return { hpBonus:+2, hpBonusWarrior:+6, resurrSurv:100 };
  if (score === 22) return { hpBonus:+2, hpBonusWarrior:+6, resurrSurv:100 };
  if (score === 23) return { hpBonus:+2, hpBonusWarrior:+6, resurrSurv:100 };
  if (score === 24) return { hpBonus:+2, hpBonusWarrior:+7, resurrSurv:100 };
  /* 25 */          return { hpBonus:+2, hpBonusWarrior:+7, resurrSurv:100 };
};

// ─── TABLE 8: Reason — Max Spell Level, Max Spells/Level, Illusion Immunity ──
// spellImmunity: 0 = none, 1-7 = immune to illusions up to that level
export const getReasonStats = score => {
  if (score <=  8) return { spellLevel:"—",  maxSpells:"—",  spellImmunity: 0 };
  if (score ===  9) return { spellLevel:"4th", maxSpells: 6,  spellImmunity: 0 };
  if (score <= 11) return { spellLevel:"5th", maxSpells: 7,  spellImmunity: 0 };
  if (score === 12) return { spellLevel:"6th", maxSpells: 7,  spellImmunity: 0 };
  if (score === 13) return { spellLevel:"6th", maxSpells: 9,  spellImmunity: 0 };
  if (score === 14) return { spellLevel:"7th", maxSpells: 9,  spellImmunity: 0 };
  if (score === 15) return { spellLevel:"7th", maxSpells:11,  spellImmunity: 0 };
  if (score === 16) return { spellLevel:"8th", maxSpells:11,  spellImmunity: 0 };
  if (score === 17) return { spellLevel:"8th", maxSpells:14,  spellImmunity: 0 };
  if (score === 18) return { spellLevel:"9th", maxSpells:18,  spellImmunity: 0 };
  if (score === 19) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 1 };
  if (score === 20) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 2 };
  if (score === 21) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 3 };
  if (score === 22) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 4 };
  if (score === 23) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 5 };
  if (score === 24) return { spellLevel:"9th", maxSpells:"All", spellImmunity: 6 };
  /* 25 */          return { spellLevel:"9th", maxSpells:"All", spellImmunity: 7 };
};

// ─── TABLE 9: Knowledge — Bonus CP (= bonus profs), % Learn Spell ────
export const getKnowledgeStats = score => {
  if (score <=  8) return { learnSpell:  0 };
  if (score ===  9) return { learnSpell: 35 };
  if (score === 10) return { learnSpell: 40 };
  if (score === 11) return { learnSpell: 45 };
  if (score === 12) return { learnSpell: 50 };
  if (score === 13) return { learnSpell: 55 };
  if (score === 14) return { learnSpell: 60 };
  if (score === 15) return { learnSpell: 65 };
  if (score === 16) return { learnSpell: 70 };
  if (score === 17) return { learnSpell: 75 };
  if (score === 18) return { learnSpell: 85 };
  if (score === 19) return { learnSpell: 95 };
  if (score === 20) return { learnSpell: 96 };
  if (score === 21) return { learnSpell: 97 };
  if (score === 22) return { learnSpell: 98 };
  if (score === 23) return { learnSpell: 99 };
  /* 24-25 */       return { learnSpell:100 };
};

// ─── TABLE 10: Intuition — Bonus Priest Spells, % Spell Failure ──────
// bonusSpells: string description of extra spell slots per day
// spellFail: % chance a 1st-level priest spell fails (0 at score 13+)
export const getIntuitionStats = score => {
  if (score <=  3) return { bonusSpells:"None",       spellFail: 50 };
  if (score ===  4) return { bonusSpells:"None",       spellFail: 45 };
  if (score ===  5) return { bonusSpells:"None",       spellFail: 40 };
  if (score ===  6) return { bonusSpells:"None",       spellFail: 35 };
  if (score ===  7) return { bonusSpells:"None",       spellFail: 30 };
  if (score ===  8) return { bonusSpells:"None",       spellFail: 25 };
  if (score ===  9) return { bonusSpells:"None",       spellFail: 20 };
  if (score === 10) return { bonusSpells:"None",       spellFail: 15 };
  if (score === 11) return { bonusSpells:"None",       spellFail: 10 };
  if (score === 12) return { bonusSpells:"None",       spellFail:  5 };
  if (score === 13) return { bonusSpells:"+1 (1st)",   spellFail:  0 };
  if (score === 14) return { bonusSpells:"+1 (1st)",   spellFail:  0 };
  if (score === 15) return { bonusSpells:"+1 (2nd)",   spellFail:  0 };
  if (score === 16) return { bonusSpells:"+1 (2nd)",   spellFail:  0 };
  if (score === 17) return { bonusSpells:"+1 (3rd)",   spellFail:  0 };
  if (score === 18) return { bonusSpells:"+1 (4th)",   spellFail:  0 };
  if (score === 19) return { bonusSpells:"+1ea (1,3)", spellFail:  0 };
  if (score === 20) return { bonusSpells:"+1ea (2,4)", spellFail:  0 };
  if (score === 21) return { bonusSpells:"+1ea (3,5)", spellFail:  0 };
  if (score === 22) return { bonusSpells:"+1ea (4,5)", spellFail:  0 };
  if (score === 23) return { bonusSpells:"+1ea (1,6)", spellFail:  0 };
  if (score === 24) return { bonusSpells:"+1ea (5,6)", spellFail:  0 };
  /* 25 */          return { bonusSpells:"+1ea (6,7)", spellFail:  0 };
};

// ─── TABLE 11: Willpower — Magic Defense Adj, Spell Immunity ─────────
// magDefAdj: saving throw bonus vs mind-affecting spells (charm, fear, etc.)
// spellImmunity: level 1-7 grants cumulative immunity to listed spell groups
export const WILLPOWER_IMMUNITY_DESC = [
  "", // 0
  "Immune: cause fear, charm person/mammal, command, friends, hypnotism",
  "+ Immune: forget, hold person, ray of enfeeblement, scare",
  "+ Immune: fear (spell)",
  "+ Immune: charm monster, confusion, emotion, fumble, suggestion",
  "+ Immune: chaos, feeblemind, hold monster, magic jar, quest",
  "+ Immune: geas, mass suggestion, rod of rulership",
  "+ Immune: antipathy/sympathy, death spell, mass charm",
];
export const getWillpowerStats = score => {
  if (score <=  3) return { magDefAdj:-3, spellImmunity: 0 };
  if (score ===  4) return { magDefAdj:-2, spellImmunity: 0 };
  if (score <=  7) return { magDefAdj:-1, spellImmunity: 0 };
  if (score <= 14) return { magDefAdj: 0, spellImmunity: 0 };
  if (score === 15) return { magDefAdj:+1, spellImmunity: 0 };
  if (score === 16) return { magDefAdj:+2, spellImmunity: 0 };
  if (score === 17) return { magDefAdj:+3, spellImmunity: 0 };
  if (score === 18) return { magDefAdj:+4, spellImmunity: 0 };
  if (score === 19) return { magDefAdj:+4, spellImmunity: 1 };
  if (score === 20) return { magDefAdj:+4, spellImmunity: 2 };
  if (score === 21) return { magDefAdj:+4, spellImmunity: 3 };
  if (score === 22) return { magDefAdj:+4, spellImmunity: 4 };
  if (score === 23) return { magDefAdj:+4, spellImmunity: 5 };
  if (score === 24) return { magDefAdj:+4, spellImmunity: 6 };
  /* 25 */          return { magDefAdj:+4, spellImmunity: 7 };
};

// ─── TABLE 12: Leadership — Loyalty Base, Max Henchmen ───────────────
export const getLeadershipStats = score => {
  if (score <=  3) return { loyaltyBase: -6, maxHench:  1 };
  if (score ===  4) return { loyaltyBase: -5, maxHench:  1 };
  if (score ===  5) return { loyaltyBase: -4, maxHench:  2 };
  if (score ===  6) return { loyaltyBase: -3, maxHench:  2 };
  if (score ===  7) return { loyaltyBase: -2, maxHench:  3 };
  if (score ===  8) return { loyaltyBase: -1, maxHench:  3 };
  if (score <= 11) return { loyaltyBase:  0, maxHench:  4 };
  if (score <= 13) return { loyaltyBase:  0, maxHench:  5 };
  if (score === 14) return { loyaltyBase: +1, maxHench:  6 };
  if (score === 15) return { loyaltyBase: +3, maxHench:  7 };
  if (score === 16) return { loyaltyBase: +4, maxHench:  8 };
  if (score === 17) return { loyaltyBase: +6, maxHench: 10 };
  if (score === 18) return { loyaltyBase: +8, maxHench: 15 };
  if (score === 19) return { loyaltyBase:+10, maxHench: 20 };
  if (score === 20) return { loyaltyBase:+12, maxHench: 25 };
  if (score === 21) return { loyaltyBase:+14, maxHench: 30 };
  if (score === 22) return { loyaltyBase:+16, maxHench: 35 };
  if (score === 23) return { loyaltyBase:+18, maxHench: 40 };
  if (score === 24) return { loyaltyBase:+20, maxHench: 45 };
  /* 25 */          return { loyaltyBase:+20, maxHench: 50 };
};

// ─── TABLE 13: Appearance — Reaction Adjustment ──────────────────────
// reactionAdj: modifier to initial NPC reaction roll (not a %, just a number)
export const getAppearanceStats = score => {
  if (score <=  3) return { reactionAdj: -5 };
  if (score ===  4) return { reactionAdj: -4 };
  if (score ===  5) return { reactionAdj: -3 };
  if (score ===  6) return { reactionAdj: -2 };
  if (score ===  7) return { reactionAdj: -1 };
  if (score <= 12) return { reactionAdj:  0 };
  if (score === 13) return { reactionAdj: +1 };
  if (score === 14) return { reactionAdj: +2 };
  if (score === 15) return { reactionAdj: +3 };
  if (score === 16) return { reactionAdj: +5 };
  if (score === 17) return { reactionAdj: +6 };
  if (score === 18) return { reactionAdj: +7 };
  if (score === 19) return { reactionAdj: +8 };
  if (score === 20) return { reactionAdj: +9 };
  if (score === 21) return { reactionAdj:+10 };
  if (score === 22) return { reactionAdj:+11 };
  if (score === 23) return { reactionAdj:+12 };
  if (score === 24) return { reactionAdj:+13 };
  /* 25 */          return { reactionAdj:+14 };
};

// ─── Master dispatcher: sub-ability ID → display bonuses array ───────
// Returns array of { key, value, desc } for the sub-ability panel
export const getSubStats = (subId, score, exStrPct = 0, isWarrior = false) => {
  const fmtPct = n => n === 0 ? "0%" : n > 0 ? `+${n}%` : `${n}%`;
  const fmtNum = n => n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`;
  const fmtLbs = n => n >= 1000 ? `${(n/1000).toFixed(n%1000===0?0:3).replace(/\.?0+$/,"")}k lb` : `${n} lbs`;

  switch (subId) {
    case "muscle": {
      const s = getMuscleStats(score, exStrPct);
      return [
        { key:"Att. Adj.",   value: fmtNum(s.attAdj),    desc:"Attack Adjustment: Added to d20 attack rolls in melee combat. A bonus makes opponents easier to hit." },
        { key:"Dam. Adj.",   value: fmtNum(s.dmgAdj),    desc:"Damage Adjustment: Added to damage rolls after a successful physical attack." },
        { key:"Max Press",   value: fmtLbs(s.maxPress),  desc:"Maximum Press: Maximum weight a character can lift overhead. Cannot walk more than a few steps with it." },
        { key:"Open Doors",  value: s.openDoors,         desc:"Open Doors: Roll 1d20 equal to or under this number to force a stuck door. Parenthetical = magically held door (one attempt only)." },
        { key:"Bend Bars",   value: s.bendBars,          desc:"Bend Bars/Lift Gates: 1d100 roll equal to or under this percentage to bend iron bars or lift a portcullis. One attempt only." },
      ];
    }
    case "stamina": {
      const s = getStaminaStats(score, exStrPct);
      return [
        { key:"Weight Allow.", value: fmtLbs(s.weightAllow), desc:"Weight Allowance: Pounds a character can carry without encumbrance. Characters at or below this weight move at full speed." },
      ];
    }
    case "aim": {
      const s = getAimStats(score);
      return [
        { key:"Missile Att.", value: fmtNum(s.missileAdj),   desc:"Missile Attack Adjustment: Applied to d20 rolls when attacking with ranged weapons — bows, crossbows, slings, thrown weapons." },
        { key:"Pick Pockets", value: fmtPct(s.pickPockets),  desc:"Pick Pockets: Modifier applied to the rogue Pick Pockets base percentage. Positive values improve the chance of success." },
        { key:"Open Locks",   value: fmtPct(s.openLocks),    desc:"Open Locks: Modifier applied to the rogue Open Locks base percentage. Positive values improve the chance of success." },
      ];
    }
    case "balance": {
      const s = getBalanceStats(score);
      return [
        { key:"React. Adj.",   value: fmtNum(s.reactAdj),    desc:"Reaction Adjustment: Applied to d10 surprise rolls. A positive value makes the character less likely to be surprised by unexpected encounters." },
        { key:"Def. Adj.",     value: fmtNum(s.defAdj),      desc:"Defensive Adjustment: Applied to AC and to saving throws vs. dodgeable attacks (lightning bolt, hurled boulders, etc.). Negative improves AC in 2E." },
        { key:"Move Silently", value: fmtPct(s.moveSilent),  desc:"Move Silently: Modifier to the rogue Move Silently base percentage. Non-rogues generally cannot move silently." },
        { key:"Climb Walls",   value: fmtPct(s.climbWalls),  desc:"Climb Walls: Modifier to the rogue Climb Walls base percentage." },
      ];
    }
    case "health": {
      const s = getHealthStats(score);
      return [
        { key:"System Shock",  value: `${s.sysShock}%`,        desc:"System Shock: Percentage chance (1d100) to survive magical body-altering effects — polymorphing, petrification, magical aging. Failure = instant death." },
        { key:"Poison Save",   value: fmtNum(s.poisonSave),    desc:"Poison Save: Modifier applied to saving throws vs. poison. Only scores above 18 grant a positive bonus; scores 3–18 give no modifier." },
      ];
    }
    case "fitness": {
      const s = getFitnessStats(score);
      const hpVal = isWarrior && s.hpBonusWarrior !== s.hpBonus
        ? `${fmtNum(s.hpBonusWarrior)} (${fmtNum(s.hpBonus)} non-warrior)`
        : fmtNum(s.hpBonus);
      return [
        { key:"HP Bonus/Level", value: hpVal,                    desc:"Hit Point Bonus per Level: Added to each Hit Die roll on level gain. Non-warriors capped at +2 per die. Warriors receive the parenthetical bonus. Negative values are subtracted (minimum 1 HP per die). Ends at level 10 (9 for warriors/priests)." },
        { key:"Resurr. Surv.", value: `${s.resurrSurv}%`,        desc:"Resurrection Survival: Percentage chance (1d100) a dead character returns to life via Raise Dead or Resurrection spell. Failure = permanently dead." },
      ];
    }
    case "reason": {
      const s = getReasonStats(score);
      const immDesc = s.spellImmunity > 0
        ? `Immune to illusion/phantasm spells of level ${s.spellImmunity} and below (cumulative)`
        : "None";
      return [
        { key:"Max Spell Lvl",   value: s.spellLevel,               desc:"Maximum Spell Level: The highest level of arcane spells a wizard with this Reason score can learn and cast." },
        { key:"Max Spells/Lvl",  value: String(s.maxSpells),        desc:"Maximum Spells per Level: The maximum number of spells per level a wizard can have in their spellbook. Scores below 9 cannot cast wizard spells." },
        { key:"Illus. Immunity", value: s.spellImmunity > 0 ? `Lvl ≤ ${s.spellImmunity}` : "None", desc:`Illusion Immunity: ${immDesc}` },
      ];
    }
    case "knowledge": {
      const s  = getKnowledgeStats(score);
      const cp = getKnowledgeCP(score);
      return [
        { key:"Bonus CP",     value: `+${cp}`,                    desc:"Bonus Character Points (Table 9): Extra CPs added to the proficiency pool at character creation. Also equals the maximum number of additional languages the character can learn." },
        { key:"Learn Spell",  value: s.learnSpell > 0 ? `${s.learnSpell}%` : "—", desc:"% Learn Spell: The percentage chance a wizard successfully learns a spell from a scroll or spellbook. Failure means the character can never learn that spell from that source (try again after gaining a level)." },
      ];
    }
    case "intuition": {
      const s = getIntuitionStats(score);
      return [
        { key:"Bonus Spells", value: s.bonusSpells,               desc:"Bonus Priest Spells: Extra spell slots per day for priest characters at the listed levels. These bonus spells are cumulative — higher scores add to lower-score bonuses. Priests must be high enough level to cast the bonus spell levels." },
        { key:"Spell Failure",value: s.spellFail > 0 ? `${s.spellFail}%` : "None", desc:"Priest Spell Failure: Priests with Intuition below 13 risk their 1st-level spells failing when cast. Check this percentage each time a 1st-level priest spell is attempted. Above 12 = no risk." },
      ];
    }
    case "willpower": {
      const s = getWillpowerStats(score);
      const immDesc = s.spellImmunity > 0 ? WILLPOWER_IMMUNITY_DESC[s.spellImmunity] : "None";
      return [
        { key:"Mag. Def. Adj.", value: fmtNum(s.magDefAdj),        desc:"Magical Defense Adjustment: Added automatically to saving throws vs. mind-affecting spells — charm, fear, hypnosis, suggestion, possession, etc. Does NOT apply to area-effect spells." },
        { key:"Spell Immunity", value: s.spellImmunity > 0 ? `Tier ${s.spellImmunity}` : "None", desc:`Spell Immunity (cumulative): ${immDesc}` },
      ];
    }
    case "leadership": {
      const s = getLeadershipStats(score);
      return [
        { key:"Max Henchmen",  value: `${s.maxHench}`,            desc:"Maximum Henchmen: The maximum number of long-term loyal followers (henchmen) a character may have. Does not affect hirelings or mercenaries." },
        { key:"Loyalty Base",  value: fmtNum(s.loyaltyBase),      desc:"Loyalty Base: Added to or subtracted from the starting loyalty score of all henchmen. Also modifies morale checks in dangerous situations." },
      ];
    }
    case "appearance": {
      const s = getAppearanceStats(score);
      return [
        { key:"Reaction Adj.", value: fmtNum(s.reactionAdj),      desc:"Reaction Adjustment: Added to the initial NPC reaction roll when meeting strangers for the first time. Positive = more favorable first impression; negative = immediate distrust." },
      ];
    }
    default: return [];
  }
};



// Exceptional Strength (18/xx) — Warriors only, Muscle exactly 18
// percentile 01-100, stored as integer 1-100 (100 = 18/00)
// Actual att/dmg bonuses come from getMuscleStats(18, pct). This is just for labels.
export const EXCEPTIONAL_STR = [
  { maxPct:  50, label: "18/01–50" },
  { maxPct:  75, label: "18/51–75" },
  { maxPct:  90, label: "18/76–90" },
  { maxPct:  99, label: "18/91–99" },
  { maxPct: 100, label: "18/00"    },
];
export const getExStrLabel = pct =>
  (EXCEPTIONAL_STR.find(r => pct <= r.maxPct) ?? EXCEPTIONAL_STR[0]).label;

// Warrior class IDs (for 18/xx gate)
export const WARRIOR_CLASS_IDS = new Set(["fighter", "paladin", "ranger"]);

// ───────────────────────────────────────────────────────────────────
//  3. SPELL POINT SYSTEM (House Rule)
//  Mages/Bards → key stat: Reason
//  Priests/Druids/Shamans → key stat: Willpower
//  Bonus scale applies to the key sub-ability score.
// ───────────────────────────────────────────────────────────────────

export const SPELL_POINT_TABLE = [
  { max:  8, bonus:  0 },
  { max: 11, bonus:  2 },
  { max: 13, bonus:  3 },
  { max: 15, bonus:  4 },
  { max: 16, bonus:  5 },
  { max: 17, bonus:  6 },
  { max: 99, bonus:  7 },
];
export const getSpellPointBonus = score =>
  SPELL_POINT_TABLE.find(r => score <= r.max)?.bonus ?? 0;

// Maps class id → spell-point key sub-ability (null = no spell points)
export const CLASS_SP_STAT = {
  mage:        "knowledge",
  illusionist: "knowledge",
  specialist:  "knowledge",
  bard:        "knowledge",
  cleric:      "willpower",
  druid:       "willpower",
  shaman:      "willpower",
  fighter:     null,
  paladin:     null,
  ranger:      null,
  thief:       null,
};
