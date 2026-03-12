import { useState, useMemo, useCallback } from "react";

import {
  PARENT_STATS, SUB_ABILITIES, ALL_SUBS, SUB_PARENT, SPLIT_PAIRS, MAX_SPLIT,
  PARENT_STAT_LABELS, getMuscleStats, getExStrLabel, getKnowledgeCP, getSpellPointBonus, getT44Mod, getSubStats,
} from "../data/abilities.js";

import { RACES, SUB_RACES, MONSTROUS_RACES, MONSTROUS_FEAT_MAP } from "../data/races.js";

import {
  ALL_CLASSES, CLASS_ABILITIES,
  MAGE_SP_CLASSES, CLERIC_SP_CLASSES,
  WIZARD_SCHOOLS, RACE_CLASS_CAPS,
} from "../data/classes.js";

import { SP_KITS, CLASS_KITS } from "../data/kits.js";

import { TRAITS, DISADVANTAGES, DISADV_POOL_WARN, DISADV_MAX_CP } from "../data/traits.js";

import {
  CLASS_GROUP_MAP, NWP_CP_POOL, WEAP_CP_POOL,
  ALL_NWP, PROF_GROUPTAG, ALL_PROFS,
} from "../data/proficiencies.js";

import {
  getWeapCost, weapSlotCost, specCol,
  MASTERY_TIERS, STYLE_SPECS, WOC_CP,
} from "../data/weapons.js";

import {
  THIEF_SKILLS, THIEF_DISC_POINTS, SKILL_CLASS_ABILS,
} from "../data/thieving.js";

export function useCharacter() {

  // ── Identity
  const [charName,   setCharName]   = useState("Adventurer");
  const [charGender, setCharGender] = useState("");       // "" | "Male" | "Female" | custom string
  const [charLevel,  setCharLevel]  = useState(1);
  const [activeTab,  setActiveTab]  = useState("scores");
  const [ruleBreaker, setRuleBreaker] = useState(false);

  // ── CP per level override (S&P default: use class value; custom: 3–5, or any with RB)
  const [cpPerLevelOverride, setCpPerLevelOverride] = useState(3); // S&P recommends 3–5

  // ── DM award log: [{ id, cp, reason, date }]
  const [dmAwards, setDmAwards] = useState([]);
  const [dmAwardInput, setDmAwardInput] = useState({ cp: 1, reason: "" });
  const [showDmPanel, setShowDmPanel] = useState(false);

  // ── Modals
  const [infoModal,    setInfoModal]    = useState(null); // { title, body }
  const [confirmBox,   setConfirmBox]   = useState(null); // { msg, onConfirm }
  const [chooseSubMod, setChooseSubMod] = useState(null); // { abilId, name, onPick }

  // ─────────────────────────────────────────
  //  CH.1: ABILITY SCORES
  // ─────────────────────────────────────────

  // Base scores: user input, normally 3–18, up to 25 (Rule-Breaker flagged >18)
  const [baseScores, setBaseScores] = useState(
    Object.fromEntries(PARENT_STATS.map(s => [s, 10]))
  );
  const [rollResults, setRollResults] = useState({}); // { STR: [d1,d2,d3,d4], ... }
  const [rollAnim,    setRollAnim]    = useState({}); // { STR: true } when animating
  const [classAbilPicked, setClassAbilPicked] = useState({}); // { abilId: true }
  const [selectedKit,     setSelectedKit]     = useState(null); // kit id string

  // Sub-ability split modifiers per sub-id. Within each pair, mods sum to 0.
  // |mod| ≤ MAX_SPLIT unless ruleBreaker.
  const [splitMods, setSplitMods] = useState(
    Object.fromEntries(ALL_SUBS.map(s => [s.id, 0]))
  );

  // Exceptional Strength percentile (01–100), only when muscle===18 & warrior class
  const [exPcts, setExPcts] = useState({ muscle: 50, stamina: 50 });
  const rollD100 = useCallback((subId) => {
    const v = Math.floor(Math.random() * 100) + 1;
    setExPcts(p => ({ ...p, [subId]: v }));
  }, []);

  // ─────────────────────────────────────────
  //  CH.2: RACES
  // ─────────────────────────────────────────

  const [selectedRace,     setSelectedRace]     = useState(null);
  const [selectedSubRace,  setSelectedSubRace]  = useState(null);
  const [racialPicked,     setRacialPicked]     = useState({});
  const [abilChosenSub,    setAbilChosenSub]    = useState({});

  // Monstrous race state
  const [monstrousRaceId,    setMonstrousRaceId]    = useState(null);
  const [monstrousSelFeats,  setMonstrousSelFeats]  = useState([]);
  const [monstrousCustomize, setMonstrousCustomize] = useState(false);
  const [mongrelChoice,      setMongrelChoice]      = useState(null);

  // ─────────────────────────────────────────
  //  CH.3: CLASSES
  // ─────────────────────────────────────────

  const [selectedClass, setSelectedClass] = useState(null);

  // ─────────────────────────────────────────
  //  CH.3b: WIZARD SCHOOLS / SPECIALIST
  // ─────────────────────────────────────────

  // Specialist school id (null = none chosen)
  const [specialistSchool, setSpecialistSchool] = useState(null);
  // Mage school flavor picks { schoolId: true }
  const [mageSchoolsPicked, setMageSchoolsPicked] = useState({});
  // Extra opposition schools chosen via sw_r3 restriction (array of school ids)
  const [extraOpposition, setExtraOpposition]   = useState([]);

  // ─────────────────────────────────────────
  //  CH.4: TRAITS & DISADVANTAGES
  // ─────────────────────────────────────────

  const [traitsPicked, setTraitsPicked] = useState({});
  const [disadvPicked, setDisadvPicked] = useState({});
  // Sub-option selections for disadvantages that have subOptions (e.g. Fanaticism)
  const [disadvSubChoice, setDisadvSubChoice] = useState({}); // { dvId: subOptionId }

  // Social status: { rolled: number|null, override: string|null }
  const [socialStatus, setSocialStatus] = useState({ rolled: null, override: null });

  // ─────────────────────────────────────────
  //  CH.9: THIEVING ABILITIES
  // ─────────────────────────────────────────
  // Discretionary points allocated per skill { skillId: number (multiples of 5) }
  const [thiefDiscPoints, setThiefDiscPoints] = useState(
    Object.fromEntries(THIEF_SKILLS.map(s => [s.id, 0]))
  );
  // Armor type selector for thieving adjustments
  const [thiefArmorType, setThiefArmorType] = useState("padded_studded");

  // ─────────────────────────────────────────
  //  PORTRAIT & APPEARANCE FIELDS
  // ─────────────────────────────────────────
  const [charAge,                setCharAge]                = useState("");
  const [charHairColor,          setCharHairColor]          = useState("");
  const [charEyeColor,           setCharEyeColor]           = useState("");
  const [charDistinctiveFeatures,setCharDistinctiveFeatures]= useState("");
  const [charAppearanceNotes,    setCharAppearanceNotes]    = useState("");
  const [portraitUrl,            setPortraitUrl]            = useState(null);

  // ─────────────────────────────────────────
  //  CH.5: PROFICIENCIES
  // ─────────────────────────────────────────

  const [profsPicked,     setProfsPicked]     = useState({});
  const [weapPicked,      setWeapPicked]      = useState({});  // weapon prof picks
  const [profT44Override, setProfT44Override] = useState({});
  // Ch.8 Specialization & Mastery
  const [masteryPicked,   setMasteryPicked]   = useState({});  // { weapKey: { tier, type } }
  const [wocPicked,       setWocPicked]       = useState(null); // weapon of choice key
  const [stylePicked,     setStylePicked]     = useState({});  // { styleId: "basic"|"enhanced" }

  // ═════════════════════════════════════════════════════════════════
  //  DERIVED COMPUTATIONS
  // ═════════════════════════════════════════════════════════════════

  const raceData    = useMemo(() => RACES.find(r => r.id === selectedRace) ?? null, [selectedRace]);
  const classData   = useMemo(() => ALL_CLASSES.find(c => c.id === selectedClass) ?? null, [selectedClass]);


  // Class abilities for current class
  const currentAbils = useMemo(() => {
    if (!selectedClass) return [];
    return CLASS_ABILITIES[selectedClass] ?? [];
  }, [selectedClass]);

  // CP spent on class abilities (restrictions give CP back)
  const classAbilCPSpent = useMemo(() => {
    return currentAbils.reduce((sum, a) => {
      if (!classAbilPicked[a.id]) return sum;
      return a.restriction ? sum - a.cp : sum + a.cp;
    }, 0);
  }, [currentAbils, classAbilPicked]);

  // Whether any picked ability grants exStr (warrior-priests etc)
  const abilGrantsExStr = useMemo(() =>
    currentAbils.some(a => a.allowsExStr && classAbilPicked[a.id]),
  [currentAbils, classAbilPicked]);
  const subRaceList = useMemo(() => (selectedRace ? (SUB_RACES[selectedRace] ?? []) : []), [selectedRace]);
  const subRaceData = useMemo(() =>
    subRaceList.find(sr => sr.id === selectedSubRace) ?? null, [subRaceList, selectedSubRace]);

  // Sub-races no longer change stat mods — Table 15 applies to the whole race.
  // All sub-races within a race share the same baseStatMods.
  const activeRaceStatMods = useMemo(() =>
    raceData?.baseStatMods ?? {},
  [raceData]);

  // Modified parent stat = clamp(base + racial base mod, 1, 25)
  const modParent = useCallback(stat =>
    Math.min(25, Math.max(1, (baseScores[stat] ?? 10) + (activeRaceStatMods[stat] ?? 0))),
  [baseScores, activeRaceStatMods]);

  // All abilities that are currently active: package abilities + individually picked
  const allActiveAbilIds = useMemo(() => {
    const pkgIds = subRaceData?.id !== "custom" ? (subRaceData?.abilityIds ?? []) : [];
    const indivIds = Object.keys(racialPicked).filter(id => racialPicked[id]);
    return new Set([...pkgIds, ...indivIds]);
  }, [subRaceData, racialPicked]);

  // Racial ability sub deltas — from both package abilities AND individually picked
  const racialSubDeltas = useMemo(() => {
    const d = {};
    if (!raceData) return d;
    raceData.abilities.forEach(ab => {
      if (!allActiveAbilIds.has(ab.id) || !ab.statLink) return;
      const subId = ab.statLink.sub === "choose"
        ? (abilChosenSub[ab.id] ?? null) : ab.statLink.sub;
      if (!subId) return;
      d[subId] = (d[subId] ?? 0) + ab.statLink.delta;
    });
    return d;
  }, [raceData, allActiveAbilIds, abilChosenSub]);

  // Effective sub-ability: parent (post-racial-base) + racial sub deltas + split modifier
  // This is the full pipeline per the rules.
  const effSub = useCallback(subId => {
    const parent = SUB_PARENT[subId];
    if (!parent) return 10;
    return Math.min(25, Math.max(1,
      modParent(parent) + (racialSubDeltas[subId] ?? 0) + (splitMods[subId] ?? 0)
    ));
  }, [modParent, racialSubDeltas, splitMods]);

  // Check if a class's stat and race requirements are met (needs effSub, so defined here)
  const classStatsMet = useCallback((cls) => {
    if (!cls.reqStats) return true;
    return Object.entries(cls.reqStats).every(([sub, min]) => effSub(sub) >= min);
  }, [effSub]);
  const classRaceMet = useCallback((cls) => {
    if (!cls.allowedRaces || cls.allowedRaces.includes("all_monstrous")) return true;
    if (!selectedRace) return true;
    const raceId = selectedRace?.toLowerCase();
    return cls.allowedRaces.some(r => r === "all_monstrous" || raceId.includes(r) || r === raceId);
  }, [selectedRace]);
  const classReqsMet = useCallback((cls) => classStatsMet(cls) && classRaceMet(cls), [classStatsMet, classRaceMet]);

  // 18/xx gate: muscle exactly 18 AND warrior class
  // showExStr: input always visible at muscle==18 (any class can have 18 STR)
  // exStrActive: stat bonus only applies for warrior classes
  const showExStr   = useMemo(() => effSub("muscle") === 18, [effSub]);
  const exStrActive = useMemo(() => showExStr && (!!classData?.allowsExStr || abilGrantsExStr), [showExStr, classData, abilGrantsExStr]);

  const exStrLabel = useMemo(() =>
    showExStr ? getExStrLabel(exPcts.muscle) : null,
  [showExStr, exPcts]);

  // Melee bonuses: use exStrPct only when warrior class is active
  const muscleStats = useMemo(() =>
    getMuscleStats(effSub("muscle"), exStrActive ? exPcts.muscle : 0),
  [effSub, exStrActive, exPcts]);

  // Spell points
  // Mage spell-point pool (Knowledge) — mage/illusionist/specialist/bard

  const mageSpBonus    = useMemo(() =>
    MAGE_SP_CLASSES.has(selectedClass)
      ? getSpellPointBonus(effSub("knowledge")) : 0,
  [selectedClass, effSub]);

  const clericSpBonus  = useMemo(() =>
    CLERIC_SP_CLASSES.has(selectedClass)
      ? getSpellPointBonus(effSub("willpower")) : 0,
  [selectedClass, effSub]);

  // Legacy alias used in class card display
  const spellPointBonus = classData?.spStat === "knowledge" ? mageSpBonus
                        : classData?.spStat === "willpower" ? clericSpBonus : 0;

  // CP computation
  const knowledgeCP = useMemo(() => getKnowledgeCP(effSub("knowledge")), [effSub]);
  const effectiveCpPerLevel = cpPerLevelOverride;
  const baseClassCP = useMemo(() => classData
    ? classData.baseCp + effectiveCpPerLevel * (charLevel - 1)
    : 0, [classData, effectiveCpPerLevel, charLevel]);
  const dmAwardTotal = useMemo(() => dmAwards.reduce((s, a) => s + a.cp, 0), [dmAwards]);
  const disadvPool  = useMemo(() =>
    DISADVANTAGES.reduce((s, d) => {
      const level = disadvPicked[d.id];
      if (!level) return s;
      // Fanaticism: use sub-option CP if a sub-choice is made
      if (d.subOptions?.length) {
        const subId  = disadvSubChoice[d.id];
        const subOpt = d.subOptions.find(o => o.id === subId);
        if (subOpt) {
          if (level === "severe" && subOpt.cpSevere != null) return s + subOpt.cpSevere;
          return s + subOpt.cp;
        }
        // no sub chosen yet — fall back to base cp
      }
      if (level === "severe" && d.cpSevere != null) return s + d.cpSevere;
      return s + d.cp;
    }, 0),
  [disadvPicked, disadvSubChoice]);
  // Cross-class NWP cost: General = listed; own class group = listed; other = listed+2
  const classGroup  = useMemo(() => CLASS_GROUP_MAP[selectedClass] ?? null, [selectedClass]);
  // Chapter 6 NWP CP pool + Chapter 7 Weapon CP pool per class group (S&P p.125, p.162)
  const nwpClassPool  = useMemo(() => NWP_CP_POOL[classGroup]  ?? 0, [classGroup]);
  const weapClassPool = useMemo(() => WEAP_CP_POOL[classGroup] ?? 0, [classGroup]);
  const totalCP     = baseClassCP + nwpClassPool + weapClassPool + knowledgeCP + disadvPool + dmAwardTotal;
  const traitCPSp   = useMemo(() => TRAITS.filter(t => traitsPicked[t.id]).reduce((s, t) => s + t.cp, 0), [traitsPicked]);
  // NWP cost: General always in-class. Own class group = in-class. Any other group = listed + 2.
  // NWP effective cost (S&P Ch.6): General group always at listed cost for all classes.
  // Own class group = listed cost. Any other group = listed cost + 2.
  // Uses PROF_GROUPTAG lookup because individual prof objects don't carry groupTag.
  const nwpEffCp    = useCallback((prof) => {
    if (!classGroup) return prof.cp;               // no class selected — show base cost
    const tag = PROF_GROUPTAG[prof.id];
    if (tag === "general") return prof.cp;         // General: ALWAYS base cost, never modified
    if (tag === classGroup) return prof.cp;        // own class group: base cost
    return prof.cp + 2;                            // cross-class penalty
  }, [classGroup]);

  // Weapon slot cost: warrior=2 CP/slot, others=3 CP/slot (S&P Table 48)
  const wSlotCost   = useMemo(() => weapSlotCost(classGroup), [classGroup]);
  // weapPicked values: "single"=1slot, "tight"=2slots (warrior only), "broad"=3slots (warrior only)
  const weapCPSp    = useMemo(() => {
    let total = 0;
    Object.entries(weapPicked).forEach(([id, level]) => {
      if (!level) return;
      if (level === "single")   total += getWeapCost(classGroup, "single");
      else if (level === "tight")  total += getWeapCost(classGroup, "tight");
      else if (level === "broad")  total += getWeapCost(classGroup, "broad");
      else if (level === "shield") total += getWeapCost(classGroup, "shield");
      else if (level === "armor")  total += getWeapCost(classGroup, "armor");
      // "style" and legacy "special" still fallback
      else if (level === "style")   total += 2;
      else if (level === "special") total += getWeapCost(classGroup, "shield"); // compat
    });
    return total;
  }, [weapPicked, classGroup]);
  const profCPSp    = useMemo(() => ALL_NWP.filter(p => profsPicked[p.id]).reduce((s, p) => s + nwpEffCp(p), 0), [profsPicked, nwpEffCp]);

  // Ch.8 CP: mastery tiers + weapon of choice + fighting styles
  const mastCPSp    = useMemo(() => {
    const col = specCol(selectedClass);
    let total = 0;
    // Mastery tiers
    Object.values(masteryPicked).forEach(({ tier }) => {
      const t = MASTERY_TIERS.find(x => x.id === tier);
      if (t) { const c = t.cp[col]; if (c) total += c; }
    });
    // Weapon of choice
    if (wocPicked) total += WOC_CP[col] ?? 3;
    // Fighting styles
    Object.entries(stylePicked).forEach(([sid, level]) => {
      if (!level) return;
      const st = STYLE_SPECS.find(x => x.id === sid);
      if (!st) return;
      total += level === "enhanced" && st.hasEnhanced ? (st.enhCp[col] ?? 6) : (st.cp[col] ?? 3);
    });
    return total;
  }, [masteryPicked, wocPicked, stylePicked, selectedClass]);

  // Kit proficiency helpers
  const activeKitObj    = useMemo(() => {
    if (!selectedKit) return null;
    const classKitsForCls = selectedClass ? (CLASS_KITS[selectedClass] ?? []) : [];
    return [...SP_KITS, ...classKitsForCls].find(k => k.id === selectedKit) ?? null;
  }, [selectedKit, selectedClass]);

  const kitNWPRequired    = useMemo(() => activeKitObj?.nwpRequired     ?? [], [activeKitObj]);
  const kitStatReqsMet    = useMemo(() => {
    if (!activeKitObj?.reqStats) return true;
    return Object.entries(activeKitObj.reqStats).every(([sub, min]) => effSub(sub) >= min);
  }, [activeKitObj, effSub]);
  const kitAlignOk        = useMemo(() => {
    // Alignment not yet tracked as a state variable; always pass for now
    return true;
  }, [activeKitObj]);
  const kitBarredOk       = useMemo(() => {
    if (!activeKitObj?.barredClasses?.length || !selectedClass) return true;
    return !activeKitObj.barredClasses.some(b => selectedClass.toLowerCase().includes(b.toLowerCase()));
  }, [activeKitObj, selectedClass]);
  const kitAllReqsMet     = kitStatReqsMet && kitAlignOk && kitBarredOk;
  const kitNWPRecommended = useMemo(() => activeKitObj?.nwpRecommended  ?? [], [activeKitObj]);
  const kitWPRequired     = useMemo(() => activeKitObj?.wpRequired      ?? [], [activeKitObj]);

  // Fuzzy match: does a prof name appear in a list of kit prof strings?
  const profMatchesKitList = useCallback((profName, list) => {
    const n = profName.toLowerCase();
    return list.some(entry => {
      const e = entry.toLowerCase();
      return n.includes(e.split(' ')[0]) || e.includes(n.split(' ')[0]);
    });
  }, []);

  const isKitRequired    = useCallback(prof =>
    profMatchesKitList(prof.name, kitNWPRequired),   [profMatchesKitList, kitNWPRequired]);
  const isKitRecommended = useCallback(prof =>
    profMatchesKitList(prof.name, kitNWPRecommended),[profMatchesKitList, kitNWPRecommended]);

  // Rulebreaker: kit has required NWP that are not yet picked
  const kitRequiredNWPUnmet = useMemo(() => {
    if (kitNWPRequired.length === 0) return [];
    return kitNWPRequired.filter(reqName => {
      const n = reqName.toLowerCase();
      return !ALL_PROFS.some(p => profsPicked[p.id] &&
        (p.name.toLowerCase().includes(n.split(' ')[0]) || n.includes(p.name.toLowerCase().split(' ')[0])));
    });
  }, [kitNWPRequired, profsPicked]);
  const spentCP     = traitCPSp + profCPSp + weapCPSp + classAbilCPSpent + mastCPSp;
  const remainCP    = totalCP - spentCP;

  // Racial pool accounting: package cost + individually picked extra abilities
  const racialPoolSpent = useMemo(() => {
    if (!raceData) return 0;
    const pkgCp = subRaceData?.packageCp ?? 0;
    const pkgIds = new Set(subRaceData?.abilityIds ?? []);
    const extraCp = raceData.abilities
      .filter(ab => racialPicked[ab.id] && !pkgIds.has(ab.id))
      .reduce((s, ab) => s + ab.cp, 0);
    return pkgCp + extraCp;
  }, [raceData, subRaceData, racialPicked]);
  const racialPoolLeft = (raceData?.pool ?? 0) - racialPoolSpent;

  // Monstrous race derived
  const monstrousRaceData = useMemo(() =>
    monstrousRaceId ? MONSTROUS_RACES.find(r => r.id === monstrousRaceId) ?? null : null,
  [monstrousRaceId]);

  // Effective ability mods: base + racial adj + mongrelman +1 choice
  const monstrousAdjMods = useMemo(() => {
    if (!monstrousRaceData) return {};
    const mods = { ...monstrousRaceData.adjMods };
    if (monstrousRaceData.isMongrel && mongrelChoice) {
      mods[mongrelChoice] = (mods[mongrelChoice] ?? 0) + 1;
    }
    return mods;
  }, [monstrousRaceData, mongrelChoice]);

  // Budget: sum of selected standard abilities' bp
  const monstrousBudget = useMemo(() => {
    if (!monstrousRaceData) return { budget: 0, used: 0, remaining: 0 };
    const selSet = new Set(monstrousSelFeats);
    const stdCost = monstrousRaceData.stdAbils
      .filter(id => selSet.has(id))
      .reduce((s, id) => s + (MONSTROUS_FEAT_MAP[id]?.bp ?? 0), 0);
    const optCost = monstrousRaceData.opts
      .filter(id => selSet.has(id))
      .reduce((s, id) => s + (MONSTROUS_FEAT_MAP[id]?.bp ?? 0), 0);
    const budget = monstrousRaceData.stdAbils.reduce((s, id) => s + (MONSTROUS_FEAT_MAP[id]?.bp ?? 0), 0);
    const used = stdCost + optCost;
    return { budget, used, remaining: budget - used };
  }, [monstrousRaceData, monstrousSelFeats]);

  // ═════════════════════════════════════════════════════════════════
  //  HANDLERS
  // ═════════════════════════════════════════════════════════════════

  // ── Toggle class ability
  const toggleClassAbil = useCallback((abilId) => {
    setClassAbilPicked(p => ({ ...p, [abilId]: !p[abilId] }));
  }, []);

  // ── 4d6 drop lowest roll
  const rollStat = useCallback((stat) => {
    // Roll 4d6
    const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
    const sorted = [...dice].sort((a, b) => a - b);
    const total = sorted[1] + sorted[2] + sorted[3]; // drop lowest
    setRollResults(p => ({ ...p, [stat]: dice }));
    setRollAnim(p => ({ ...p, [stat]: true }));
    setTimeout(() => {
      setRollAnim(p => ({ ...p, [stat]: false }));
      setBaseScores(p => ({ ...p, [stat]: total }));
    }, 600);
  }, []);

  const rollAll = useCallback(() => {
    const newScores = {};
    const newResults = {};
    PARENT_STATS.forEach(stat => {
      const dice = Array.from({ length: 4 }, () => Math.floor(Math.random() * 6) + 1);
      const sorted = [...dice].sort((a, b) => a - b);
      newResults[stat] = dice;
      newScores[stat] = sorted[1] + sorted[2] + sorted[3];
    });
    setRollResults(newResults);
    setRollAnim(Object.fromEntries(PARENT_STATS.map(s => [s, true])));
    setTimeout(() => {
      setRollAnim({});
      setBaseScores(p => ({ ...p, ...newScores }));
    }, 600);
  }, []);

  // ── Set a base score (1–25, rule-breaker flags >18)
  const setBase = (stat, raw) => {
    const max = ruleBreaker ? 25 : 18;
    const v   = Math.max(1, Math.min(25, Number(raw)));
    if (v > 18 && !ruleBreaker) {
      setConfirmBox({
        msg: `Base Score ${v} exceeds 18. This breaks standard 2E rules.\n\nEnable Rule-Breaker mode to allow scores above 18?`,
        onConfirm: () => { setRuleBreaker(true); setBaseScores(p => ({ ...p, [stat]: v })); },
      });
      return;
    }
    setBaseScores(p => ({ ...p, [stat]: Math.min(v, max) }));
  };

  // ── Sub-ability split: shift +1 to subA / -1 to subB (paired)
  const adjustSplit = (subId, direction) => {
    const parent  = SUB_PARENT[subId];
    const pair    = SPLIT_PAIRS[parent];               // [sub0, sub1]
    const partner = pair.find(id => id !== subId);
    const curA    = splitMods[subId]   ?? 0;
    const curB    = splitMods[partner] ?? 0;
    const limit   = ruleBreaker ? 99 : MAX_SPLIT;

    // Moving subId up means partner goes down (and vice-versa)
    const newA = curA + direction;
    const newB = curB - direction;

    if (Math.abs(newA) > limit || Math.abs(newB) > limit) {
      if (!ruleBreaker) {
        setConfirmBox({
          msg: `Splitting beyond ±${MAX_SPLIT} is not allowed by standard rules.\n\nEnable Rule-Breaker to allow unlimited splitting?`,
          onConfirm: () => {
            setRuleBreaker(true);
            setSplitMods(p => ({ ...p, [subId]: newA, [partner]: newB }));
          },
        });
        return;
      }
    }
    setSplitMods(p => ({ ...p, [subId]: newA, [partner]: newB }));
  };

  // ── Race select — reset sub-race, abilities, splits
  const handleRaceSelect = id => {
    if (id === selectedRace) return;
    setSelectedRace(id);
    setSelectedSubRace(null);
    setRacialPicked({});
    setAbilChosenSub({});
  };

  const handleSubRaceSelect = id => {
    // Deselect same sub-race click → clear
    if (id === selectedSubRace) {
      setSelectedSubRace(null);
      setRacialPicked({});
      setAbilChosenSub({});
      return;
    }
    // Switch to new sub-race: keep only individually picked abilities
    // (package abilities are auto-applied from subRaceData.abilityIds)
    setSelectedSubRace(id);
    setRacialPicked({});
    setAbilChosenSub({});
  };

  // ── Toggle a racial ability (only in Custom mode or extra picks after package)
  const toggleRacialAbil = ab => {
    const isCustom  = !subRaceData || subRaceData.id === "custom";
    const inPackage = !isCustom && (subRaceData?.abilityIds ?? []).includes(ab.id);

    // Can't individually toggle abilities that are part of the package
    if (inPackage) return;

    // Unique abilities require rulebreaker in Custom mode
    if (ab.unique && isCustom && !ruleBreaker) {
      setConfirmBox({
        msg: `"${ab.name}" is exclusive to a specific sub-race.\n\nEnable Rule-Breaker to allow selection in Custom mode?`,
        onConfirm: () => {
          setRuleBreaker(true);
          setRacialPicked(p => ({ ...p, [ab.id]: true }));
        },
      });
      return;
    }

    const already = !!racialPicked[ab.id];
    if (already) {
      setRacialPicked(p => ({ ...p, [ab.id]: false }));
      if (ab.statLink?.sub === "choose")
        setAbilChosenSub(p => { const n = { ...p }; delete n[ab.id]; return n; });
      return;
    }
    const canAfford = racialPoolLeft >= ab.cp;
    const doSelect  = () => {
      if (ab.statLink?.sub === "choose") {
        setChooseSubMod({
          abilId: ab.id, name: ab.name,
          onPick: subId => {
            setAbilChosenSub(p => ({ ...p, [ab.id]: subId }));
            setRacialPicked(p => ({ ...p, [ab.id]: true }));
          },
        });
      } else {
        setRacialPicked(p => ({ ...p, [ab.id]: true }));
      }
    };
    if (!canAfford && !ruleBreaker) {
      setConfirmBox({
        msg: `"${ab.name}" costs ${ab.cp} CP but only ${racialPoolLeft} CP remains in the racial pool.\n\nEnable Rule-Breaker to allow pool overflow?`,
        onConfirm: () => { setRuleBreaker(true); doSelect(); },
      });
    } else doSelect();
  };

  // ── Toggle class
  // ── Monstrous race selection
  const handleMonstrousRaceSelect = id => {
    const race = MONSTROUS_RACES.find(r => r.id === id);
    if (!race) return;
    if (id === monstrousRaceId) {
      setMonstrousRaceId(null); setMonstrousSelFeats([]); setMonstrousCustomize(false); setMongrelChoice(null); return;
    }
    const defaults = [...race.stdAbils, ...race.penalties];
    setMonstrousRaceId(id);
    setMonstrousSelFeats(defaults);
    setMonstrousCustomize(false);
    setMongrelChoice(null);
  };

  const toggleMonstrousFeat = (featId) => {
    const race = monstrousRaceData;
    if (!race) return;
    const feat = MONSTROUS_FEAT_MAP[featId];
    if (!feat || feat.isPenalty) return; // penalties are immutable
    const isSelected = monstrousSelFeats.includes(featId);
    if (isSelected) {
      setMonstrousSelFeats(prev => prev.filter(id => id !== featId));
    } else {
      // Check budget
      const newUsed = monstrousBudget.used + feat.bp;
      if (newUsed > monstrousBudget.budget && !ruleBreaker) {
        setConfirmBox({
          msg: `"${feat.name}" costs ${feat.bp} bp but only ${monstrousBudget.remaining} bp remain.\n\nEnable Rule-Breaker to allow budget overflow?`,
          onConfirm: () => { setRuleBreaker(true); setMonstrousSelFeats(prev => [...prev, featId]); },
        });
        return;
      }
      setMonstrousSelFeats(prev => [...prev, featId]);
    }
  };

  const handleClassSelect = id => { setSelectedClass(id === selectedClass ? null : id); setClassAbilPicked({}); setSelectedKit(null); };

  // ── Toggle trait (with conflict detection)
  const toggleTrait = tr => {
    const already = !!traitsPicked[tr.id];
    if (already) { setTraitsPicked(p => ({ ...p, [tr.id]: false })); return; }

    // Conflict check: trait conflicts with a currently-active disadvantage
    const conflictId = (tr.conflicts ?? []).find(cid =>
      disadvPicked[cid] && disadvPicked[cid] !== false
    );
    if (conflictId && !ruleBreaker) {
      const conflictEntry = DISADVANTAGES.find(x => x.id === conflictId);
      setConfirmBox({
        msg: `"${tr.name}" conflicts with disadvantage "${conflictEntry?.name ?? conflictId}". They cannot logically coexist.\n\nEnable Rule-Breaker to allow both?`,
        onConfirm: () => { setRuleBreaker(true); setTraitsPicked(p => ({ ...p, [tr.id]: true })); },
      });
      return;
    }

    const doIt = () => setTraitsPicked(p => ({ ...p, [tr.id]: true }));
    if (remainCP < tr.cp && !ruleBreaker) {
      setConfirmBox({
        msg: `"${tr.name}" costs ${tr.cp} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
        onConfirm: () => { setRuleBreaker(true); doIt(); },
      });
    } else doIt();
  };

  // ── Toggle disadvantage (with conflict detection + 15 CP cap)
  const toggleDisadv = (dv, targetLevel) => {
    const current = disadvPicked[dv.id];

    // Deselect: same level clicked, or explicit false
    if (!targetLevel || current === targetLevel) {
      setDisadvPicked(p => ({ ...p, [dv.id]: false }));
      return;
    }

    // Conflict check: disadvantage conflicts with a currently-active trait
    const conflictId = (dv.conflicts ?? []).find(cid => !!traitsPicked[cid]);
    if (conflictId && !ruleBreaker) {
      const conflictEntry = TRAITS.find(x => x.id === conflictId);
      setConfirmBox({
        msg: `"${dv.name}" conflicts with trait "${conflictEntry?.name ?? conflictId}". They cannot logically coexist.\n\nEnable Rule-Breaker to allow both?`,
        onConfirm: () => { setRuleBreaker(true); setDisadvPicked(p => ({ ...p, [dv.id]: targetLevel })); },
      });
      return;
    }

    // CP cap check (max DISADV_MAX_CP from disadvantages)
    const currentContrib = (() => {
      if (!current) return 0;
      if (current === "severe" && dv.cpSevere != null) return dv.cpSevere;
      return dv.cp;
    })();
    const newContrib = (targetLevel === "severe" && dv.cpSevere != null) ? dv.cpSevere : dv.cp;
    const projectedPool = disadvPool - currentContrib + newContrib;
    if (projectedPool > DISADV_MAX_CP && !ruleBreaker) {
      setConfirmBox({
        msg: `Taking "${dv.name}" (${targetLevel}) would give you ${projectedPool} CP from disadvantages, exceeding the ${DISADV_MAX_CP} CP maximum.\n\nEnable Rule-Breaker to override?`,
        onConfirm: () => { setRuleBreaker(true); setDisadvPicked(p => ({ ...p, [dv.id]: targetLevel })); },
      });
      return;
    }

    setDisadvPicked(p => ({ ...p, [dv.id]: targetLevel }));
  };

  // ── Wizard / Specialist school handlers
  const handleSpecialistSchool = useCallback((schoolId) => {
    setSpecialistSchool(prev => prev === schoolId ? null : schoolId);
  }, []);

  const toggleMageSchool = useCallback((schoolId) => {
    setMageSchoolsPicked(prev => ({ ...prev, [schoolId]: !prev[schoolId] }));
  }, []);

  const toggleExtraOpposition = useCallback((schoolId) => {
    setExtraOpposition(prev =>
      prev.includes(schoolId) ? prev.filter(s => s !== schoolId) : [...prev, schoolId]
    );
  }, []);

  // ── Disadvantage sub-option choice
  const handleDisadvSubChoice = useCallback((dvId, subOptionId) => {
    setDisadvSubChoice(prev => ({ ...prev, [dvId]: subOptionId }));
  }, []);

  // ── Social status roll (2d6)
  const rollSocialStatus = useCallback(() => {
    const roll = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
    setSocialStatus(prev => ({ ...prev, rolled: roll }));
  }, []);

  const setSocialStatusOverride = useCallback((val) => {
    setSocialStatus(prev => ({ ...prev, override: val || null }));
  }, []);

  // ── Thieving skill discretionary point adjustment (+5 / -5)
  const adjustThiefDisc = useCallback((skillId, delta) => {
    setThiefDiscPoints(prev => {
      const current = prev[skillId] ?? 0;
      const newVal  = current + delta;
      if (newVal < 0) return prev;
      // Check total disc points used
      const totalUsed = Object.entries(prev).reduce((s, [k, v]) =>
        s + (k === skillId ? newVal : v), 0);
      if (totalUsed > THIEF_DISC_POINTS && !ruleBreaker) return prev; // enforce cap silently
      return { ...prev, [skillId]: newVal };
    });
  }, [ruleBreaker]);

  // ── Toggle proficiency
  const toggleProf = prof => {
    const already = !!profsPicked[prof.id];
    if (already) { setProfsPicked(p => ({ ...p, [prof.id]: false })); return; }
    const effCp = Math.max(0, nwpEffCp(prof) - (isKitRecommended(prof) && activeKitObj ? 1 : 0));
    const doIt  = () => setProfsPicked(p => ({ ...p, [prof.id]: true }));
    if (remainCP < effCp && !ruleBreaker) {
      setConfirmBox({
        msg: `"${prof.name}" costs ${effCp} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
        onConfirm: () => { setRuleBreaker(true); doIt(); },
      });
    } else doIt();
  };

  const toggleWeap = (id, name, level) => {
    const already = !!weapPicked[id];
    if (already) { setWeapPicked(p => { const n={...p}; delete n[id]; return n; }); return; }
    const cost = (level === "style") ? 2
                : (level === "shield") ? getWeapCost(classGroup, "shield")
                : (level === "armor")  ? getWeapCost(classGroup, "armor")
                : (level === "special") ? getWeapCost(classGroup, "shield") // compat
                : getWeapCost(classGroup, level); // single / tight / broad
    const doIt = () => setWeapPicked(p => ({ ...p, [id]: level }));
    if (remainCP < cost && !ruleBreaker) {
      setConfirmBox({
        msg: `"${name}" costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
        onConfirm: () => { setRuleBreaker(true); doIt(); },
      });
    } else doIt();
  };

  // ── Proficiency success calculation (handles new rank/stats[] and old baseRank/keystat)
  const profSuccess = prof => {
    const subId    = profT44Override[prof.id] ?? (prof.stats?.[0] ?? prof.keystat ?? "knowledge");
    const score    = effSub(subId);
    const skillMod = getT44Mod(score);
    const baseRank = prof.rank ?? prof.baseRank ?? 7;
    return {
      subId, score, baseRank, skillMod,
      success: Math.min(20, Math.max(1, baseRank + skillMod)),
    };
  };

  // ── Serialize all saveable character state to a plain object ──────
  const serializeCharacter = useCallback(() => ({
    charName, charGender, charLevel, ruleBreaker, cpPerLevelOverride,
    dmAwards,
    baseScores, exPcts, splitMods,
    classAbilPicked, selectedKit,
    selectedRace, selectedSubRace, racialPicked, abilChosenSub,
    monstrousRaceId, monstrousSelFeats, monstrousCustomize, mongrelChoice,
    selectedClass,
    specialistSchool, mageSchoolsPicked, extraOpposition,
    traitsPicked, disadvPicked, disadvSubChoice,
    profsPicked, weapPicked, profT44Override,
    masteryPicked, wocPicked, stylePicked,
    socialStatus,
    thiefDiscPoints, thiefArmorType,
    charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    portraitUrl,
  }), [
    charName, charGender, charLevel, ruleBreaker, cpPerLevelOverride,
    dmAwards, baseScores, exPcts, splitMods,
    classAbilPicked, selectedKit,
    selectedRace, selectedSubRace, racialPicked, abilChosenSub,
    monstrousRaceId, monstrousSelFeats, monstrousCustomize, mongrelChoice,
    selectedClass,
    specialistSchool, mageSchoolsPicked, extraOpposition,
    traitsPicked, disadvPicked, disadvSubChoice,
    profsPicked, weapPicked, profT44Override,
    masteryPicked, wocPicked, stylePicked,
    socialStatus,
    thiefDiscPoints, thiefArmorType,
    charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    portraitUrl,
  ]);

  // ── Restore character state from a previously serialized object ───
  const loadCharacterState = useCallback((d) => {
    if (!d) return;
    setCharName(d.charName ?? "Adventurer");
    setCharGender(d.charGender ?? "");
    setCharLevel(d.charLevel ?? 1);
    setRuleBreaker(d.ruleBreaker ?? false);
    setCpPerLevelOverride(d.cpPerLevelOverride ?? 3);
    setDmAwards(d.dmAwards ?? []);
    setBaseScores(d.baseScores ?? Object.fromEntries(PARENT_STATS.map(s => [s, 10])));
    setExPcts(d.exPcts ?? { muscle: 50, stamina: 50 });
    setSplitMods(d.splitMods ?? Object.fromEntries(ALL_SUBS.map(s => [s.id, 0])));
    setClassAbilPicked(d.classAbilPicked ?? {});
    setSelectedKit(d.selectedKit ?? null);
    setSelectedRace(d.selectedRace ?? null);
    setSelectedSubRace(d.selectedSubRace ?? null);
    setRacialPicked(d.racialPicked ?? {});
    setAbilChosenSub(d.abilChosenSub ?? {});
    setMonstrousRaceId(d.monstrousRaceId ?? null);
    setMonstrousSelFeats(d.monstrousSelFeats ?? []);
    setMonstrousCustomize(d.monstrousCustomize ?? false);
    setMongrelChoice(d.mongrelChoice ?? null);
    setSelectedClass(d.selectedClass ?? null);
    setSpecialistSchool(d.specialistSchool ?? null);
    setMageSchoolsPicked(d.mageSchoolsPicked ?? {});
    setExtraOpposition(d.extraOpposition ?? []);
    setTraitsPicked(d.traitsPicked ?? {});
    setDisadvPicked(d.disadvPicked ?? {});
    setDisadvSubChoice(d.disadvSubChoice ?? {});
    setProfsPicked(d.profsPicked ?? {});
    setWeapPicked(d.weapPicked ?? {});
    setProfT44Override(d.profT44Override ?? {});
    setMasteryPicked(d.masteryPicked ?? {});
    setWocPicked(d.wocPicked ?? null);
    setStylePicked(d.stylePicked ?? {});
    setSocialStatus(d.socialStatus ?? { rolled: null, override: null });
    setThiefDiscPoints(d.thiefDiscPoints ?? Object.fromEntries(THIEF_SKILLS.map(s => [s.id, 0])));
    setThiefArmorType(d.thiefArmorType ?? "padded_studded");
    setCharAge(d.charAge ?? "");
    setCharHairColor(d.charHairColor ?? "");
    setCharEyeColor(d.charEyeColor ?? "");
    setCharDistinctiveFeatures(d.charDistinctiveFeatures ?? "");
    setCharAppearanceNotes(d.charAppearanceNotes ?? "");
    setPortraitUrl(d.portraitUrl ?? null);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Return all state, derived values, and handlers
  return {
    // Identity
    charName, setCharName, charGender, setCharGender,
    charLevel, setCharLevel,
    activeTab, setActiveTab, ruleBreaker, setRuleBreaker,
    // CP override + DM awards
    cpPerLevelOverride, setCpPerLevelOverride,
    dmAwards, setDmAwards, dmAwardInput, setDmAwardInput,
    showDmPanel, setShowDmPanel,
    // Modals
    infoModal, setInfoModal, confirmBox, setConfirmBox,
    chooseSubMod, setChooseSubMod,
    // Ability scores
    baseScores, setBaseScores, rollResults, rollAnim,
    classAbilPicked, setClassAbilPicked,
    selectedKit, setSelectedKit,
    splitMods, setSplitMods, exPcts, setExPcts,
    rollD100,
    // Race
    selectedRace, selectedSubRace,
    racialPicked, abilChosenSub,
    monstrousRaceId, monstrousSelFeats,
    monstrousCustomize, setMonstrousCustomize,
    mongrelChoice, setMongrelChoice,
    // Class
    selectedClass,
    // Wizard schools
    specialistSchool, mageSchoolsPicked, extraOpposition,
    handleSpecialistSchool, toggleMageSchool, toggleExtraOpposition,
    // Traits
    traitsPicked, disadvPicked, disadvSubChoice,
    handleDisadvSubChoice,
    // Profs + weapons
    profsPicked, weapPicked, setWeapPicked,
    profT44Override, setProfT44Override,
    // Mastery
    masteryPicked, setMasteryPicked,
    wocPicked, setWocPicked,
    stylePicked, setStylePicked,
    // Social status
    socialStatus, rollSocialStatus, setSocialStatusOverride,
    // Thieving abilities
    thiefDiscPoints, setThiefDiscPoints,
    thiefArmorType, setThiefArmorType,
    adjustThiefDisc,
    // Portrait & appearance
    charAge, setCharAge,
    charHairColor, setCharHairColor,
    charEyeColor, setCharEyeColor,
    charDistinctiveFeatures, setCharDistinctiveFeatures,
    charAppearanceNotes, setCharAppearanceNotes,
    portraitUrl, setPortraitUrl,
    // Derived — race
    raceData, classData, currentAbils,
    classAbilCPSpent, abilGrantsExStr,
    subRaceList, subRaceData, activeRaceStatMods,
    modParent, allActiveAbilIds, racialSubDeltas, effSub,
    // Derived — class
    classStatsMet, classRaceMet, classReqsMet,
    // Derived — str
    showExStr, exStrActive, exStrLabel, muscleStats,
    // Derived — spells
    mageSpBonus, clericSpBonus, spellPointBonus,
    // Derived — CP
    knowledgeCP, effectiveCpPerLevel, baseClassCP,
    dmAwardTotal, disadvPool,
    nwpClassPool, weapClassPool, totalCP, traitCPSp,
    classGroup, nwpEffCp, wSlotCost,
    weapCPSp, profCPSp, mastCPSp,
    // Derived — kits
    activeKitObj, kitNWPRequired, kitStatReqsMet, kitAlignOk, kitBarredOk,
    kitAllReqsMet, kitNWPRecommended, kitWPRequired,
    profMatchesKitList, isKitRequired, isKitRecommended, kitRequiredNWPUnmet,
    // Derived — totals
    spentCP, remainCP, racialPoolSpent, racialPoolLeft,
    // Derived — monstrous
    monstrousRaceData, monstrousAdjMods, monstrousBudget,
    // Handlers
    toggleClassAbil, rollStat, rollAll, setBase, adjustSplit,
    handleRaceSelect, handleSubRaceSelect, toggleRacialAbil,
    handleMonstrousRaceSelect, toggleMonstrousFeat,
    handleClassSelect, toggleTrait, toggleDisadv, toggleProf, toggleWeap, profSuccess,
    // Save / Load
    serializeCharacter, loadCharacterState,
    // Data refs needed by JSX (exported for tab components)
    MAGE_SP_CLASSES, CLERIC_SP_CLASSES,
    WIZARD_SCHOOLS, RACE_CLASS_CAPS,
    DISADVANTAGES, DISADV_POOL_WARN, DISADV_MAX_CP,
    TRAITS, ALL_NWP, ALL_PROFS, CLASS_ABILITIES,
    SP_KITS, CLASS_KITS, ALL_CLASSES,
    RACES, SUB_RACES, MONSTROUS_RACES, MONSTROUS_FEAT_MAP,
    PARENT_STATS, SUB_ABILITIES, PARENT_STAT_LABELS, getSubStats, getT44Mod,
    THIEF_SKILLS, THIEF_DISC_POINTS, SKILL_CLASS_ABILS,
  };
}
