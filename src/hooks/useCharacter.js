import { useState, useMemo, useCallback } from "react";

import {
  PARENT_STATS, SUB_ABILITIES, ALL_SUBS, SUB_PARENT, SPLIT_PAIRS, MAX_SPLIT,
  PARENT_STAT_LABELS, getMuscleStats, getExStrLabel, getKnowledgeCP, getSpellPointBonus, getT44Mod, getSubStats,
} from "../data/abilities.js";

import { RACES, SUB_RACES, MONSTROUS_RACES, MONSTROUS_FEAT_MAP } from "../data/races.js";

import {
  ALL_CLASSES, CLASS_ABILITIES,
  MAGE_SP_CLASSES, CLERIC_SP_CLASSES,
  WIZARD_SCHOOLS, RACE_CLASS_CAPS, CLASS_STAT_REQS,
} from "../data/classes.js";

import { SP_KITS, CLASS_KITS } from "../data/kits.js";

import { TRAITS, DISADVANTAGES, DISADV_POOL_WARN, DISADV_MAX_CP } from "../data/traits.js";

import {
  CLASS_GROUP_MAP, NWP_CP_POOL, WEAP_CP_POOL,
  ALL_NWP, NWP_GROUPS, PROF_GROUPTAG, ALL_PROFS,
} from "../data/proficiencies.js";

import { useProficiencies, buildProfGroups } from "./useProficiencies.js";
import { useKits, staticKitsFlat } from "./useKits.js";

import { buildProfIndex, resolveKitProfEntry } from "../rules-engine/profResolver.js";

import {
  getWeapCost, weapSlotCost, specCol,
  MASTERY_TIERS, STYLE_SPECS, WOC_CP,
  getWeapTier, getWeapSingleCostByTier, getGroupMaxTier,
  WEAPON_GROUPS_49, computeProfCanonicalIds,
} from "../data/weapons.js";

import {
  THIEF_SKILLS, THIEF_DISC_POINTS, SKILL_CLASS_ABILS,
} from "../data/thieving.js";

// ── Module-level constants (static, defined outside the hook) ─────────────────

// Racial abilities that require a weapon choice stored as { weapon: weaponId }
const WEAPON_CHOICE_ABILS = new Set(["hu01"]);

// Druid standard package — 7 spheres totalling 60 CP (S&P p.160)
// Major: All(5), Animal(10), Elemental All(15), Healing(10), Plant(10), Weather(5)
// Minor: Divination(5)
const DRUID_STANDARD_PKG_CORE = [
  'cl_all_maj','cl_ani_maj','cl_ela_maj','cl_hea_maj','cl_plt_maj','cl_wea_maj',
  'cl_div_min',
];
// ELA cascade: Elemental All (major) automatically grants these 4 sub-spheres at no CP
const DRUID_ELA_SUB_IDS = ["cl_air_maj","cl_ear_maj","cl_fir_maj","cl_wat_maj"];

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
  const [kitAutoNWPs,     setKitAutoNWPs]     = useState({}); // { profId: true } auto-added by kit
  const [kitFreeWeaponPick, setKitFreeWeaponPick] = useState(null); // weapon ID granted free by kit (e.g. Militant Wizard)

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
  // Druid: replace sphere abilities with the full cleric sphere list,
  // marking the 6 free druid spheres with druidFree: true.
  const currentAbils = useMemo(() => {
    if (!selectedClass) return [];
    if (selectedClass === 'druid') {
      // Druid uses the full cleric sphere list — no spheres are free (all cost normal CP).
      // Use the "📦 Standard Druid Package" button to buy the S&P default 60 CP set.
      const clericSpheres = (CLASS_ABILITIES.cleric ?? []).filter(a => a.sphere);
      const druidOther    = (CLASS_ABILITIES.druid ?? []).filter(a => !a.sphere);
      return [...clericSpheres, ...druidOther];
    }
    return CLASS_ABILITIES[selectedClass] ?? [];
  }, [selectedClass]);

  // CP spent on class abilities (restrictions give CP back)
  const classAbilCPSpent = useMemo(() => {
    // Sub-spheres that are free because Elemental All (major/minor) is active.
    const elaFree = new Set([
      ...(classAbilPicked["cl_ela_maj"] ? ["cl_air_maj","cl_ear_maj","cl_fir_maj","cl_wat_maj"] : []),
      ...(classAbilPicked["cl_ela_min"] ? ["cl_air_min","cl_ear_min","cl_fir_min","cl_wat_min"] : []),
    ]);
    const abilCost = currentAbils.reduce((sum, a) => {
      if (!classAbilPicked[a.id]) return sum;
      if (elaFree.has(a.id)) return sum;              // free via Elemental All
      return a.restriction ? sum - a.cp : sum + a.cp;
    }, 0);
    // Mage school access: 5 CP per school picked individually (S&P p.163)
    // Suppressed if "All 8 Schools (bundle)" (mg00) is already purchased.
    const hasMg00 = !!classAbilPicked["mg00"];
    const schoolCost = hasMg00 ? 0
      : Object.values(mageSchoolsPicked).filter(Boolean).length * 5;
    return abilCost + schoolCost;
  }, [currentAbils, classAbilPicked, mageSchoolsPicked, selectedClass]);

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

  // ── DB proficiencies (311 NWPs) — fetched once, falls back to static bundle ──
  const { profs: _dbProfs } = useProficiencies();

  // Flat list: DB canonical profs when loaded, static ALL_NWP otherwise
  const effectiveNWP = useMemo(() => _dbProfs ?? ALL_NWP, [_dbProfs]);

  // Grouped for ProfsTab display
  const effectiveNWPGroups = useMemo(() => {
    if (!_dbProfs) return NWP_GROUPS;
    const groups = buildProfGroups(_dbProfs);
    return groups;
  }, [_dbProfs]);

  // ── DB kits (137 kits) — fetched once, falls back to static bundle ──────────
  const { kits: _dbKits } = useKits();

  // Flat kit list: DB normalized kits when loaded, static bundle otherwise
  const effectiveKits = useMemo(
    () => _dbKits ?? staticKitsFlat(),
    [_dbKits]
  );

  // Resolver index: built once per prof list, O(1) lookups for kit/prof matching
  const _profIndex = useMemo(() => buildProfIndex(effectiveNWP), [effectiveNWP]);

  // canonical_id → prof_group lookup (used by nwpEffCp)
  const _profGroupTag = useMemo(() => {
    if (!_dbProfs) return PROF_GROUPTAG;
    const m = {};
    for (const p of _dbProfs) m[p.id] = p.profGroup;
    return { ...PROF_GROUPTAG, ...m };
  }, [_dbProfs]);

  // Chapter 6 NWP CP pool + Chapter 7 Weapon CP pool per class group (S&P p.125, p.162)
  const nwpClassPool  = useMemo(() => NWP_CP_POOL[classGroup]  ?? 0, [classGroup]);
  const weapClassPool = useMemo(() => WEAP_CP_POOL[classGroup] ?? 0, [classGroup]);
  // totalCP moved below activeKitObj so kitBonusCP can be included (see below)
  const traitCPSp   = useMemo(() => TRAITS.filter(t => traitsPicked[t.id]).reduce((s, t) => s + t.cp, 0), [traitsPicked]);
  // NWP cost: General always in-class. Own class group = in-class. Any other group = listed + 2.
  // NWP effective cost (S&P Ch.6): General group always at listed cost for all classes.
  // Own class group = listed cost. Any other group = listed cost + 2.
  // Uses PROF_GROUPTAG lookup because individual prof objects don't carry groupTag.
  const nwpEffCp    = useCallback((prof) => {
    if (!classGroup) return prof.cp;               // no class selected — show base cost
    const tag = _profGroupTag[prof.id];
    if (tag === "general") return prof.cp;         // General: ALWAYS base cost, never modified
    if (tag === classGroup) return prof.cp;        // own class group: base cost
    return prof.cp + 2;                            // cross-class penalty
  }, [classGroup, _profGroupTag]);

  // Weapon slot cost: warrior=2 CP/slot, others=3 CP/slot (S&P Table 48)
  const wSlotCost   = useMemo(() => weapSlotCost(classGroup), [classGroup]);
  // weapPicked values: "single"=1slot, "tight"=2slots (warrior only), "broad"=3slots (warrior only)
  const weapCPSp    = useMemo(() => {
    let total = 0;
    Object.entries(weapPicked).forEach(([id, level]) => {
      if (!level) return;
      // Militant Wizard kit: one chosen weapon is free
      const isFreeKitWeap = id === kitFreeWeaponPick && level === "single" && selectedKit === "mag_militant-wizard";
      if (level === "single")        total += isFreeKitWeap ? 0 : getWeapSingleCostByTier(classGroup, getWeapTier(id));
      else if (level === "tight")    total += getWeapSingleCostByTier(classGroup, getGroupMaxTier(id)) * 2;
      else if (level === "broad")    total += getWeapSingleCostByTier(classGroup, getGroupMaxTier(id)) * 3;
      else if (level === "shield")   total += getWeapCost(classGroup, "shield");
      else if (level === "armor")    total += getWeapCost(classGroup, "armor");
      else if (level === "style")    total += 2;
      else if (level === "special")  total += getWeapCost(classGroup, "shield"); // compat
    });
    return total;
  }, [weapPicked, classGroup, kitFreeWeaponPick, selectedKit]);
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
    return effectiveKits.find(k => k.id === selectedKit) ?? null;
  }, [selectedKit, effectiveKits]);

  // totalCP here (after activeKitObj) so kitBonusCP from the active kit is included
  const totalCP = baseClassCP + nwpClassPool + weapClassPool + knowledgeCP + disadvPool + dmAwardTotal + (activeKitObj?.kitBonusCP ?? 0);

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

  // Match a prof object against a kit's raw NWP list using the resolver.
  // Falls back to slug comparison for profs not found by name in effectiveNWP.
  const profMatchesKitList = useCallback((profName, list) => {
    const prof = effectiveNWP.find(p => p.name === profName);
    if (prof) {
      return list.some(raw => {
        const r = resolveKitProfEntry(raw, _profIndex);
        return r.resolved_canonical_id === prof.id;
      });
    }
    // Unknown prof name — fall back to slug comparison
    const profSlug = profName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    return list.some(entry => {
      const eSlug = entry.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      return eSlug === profSlug;
    });
  }, [effectiveNWP, _profIndex]);

  const isKitRequired    = useCallback(prof =>
    profMatchesKitList(prof.name, kitNWPRequired),   [profMatchesKitList, kitNWPRequired]);
  const isKitRecommended = useCallback(prof =>
    profMatchesKitList(prof.name, kitNWPRecommended),[profMatchesKitList, kitNWPRecommended]);

  // Rulebreaker: kit has required NWP that are not yet picked
  const kitRequiredNWPUnmet = useMemo(() => {
    if (kitNWPRequired.length === 0) return [];
    return kitNWPRequired.filter(raw => {
      const r = resolveKitProfEntry(raw, _profIndex);
      if (!r.resolved_canonical_id) return true;   // unresolved → always show as unmet
      return !profsPicked[r.resolved_canonical_id];
    });
  }, [kitNWPRequired, profsPicked, _profIndex]);

  // profCPSp declared here (after activeKitObj + isKitRecommended) so the kit
  // discount can be applied without hitting a temporal dead zone error.
  const profCPSp    = useMemo(() =>
    effectiveNWP.filter(p => profsPicked[p.id])
      .reduce((s, p) => s + Math.max(0, nwpEffCp(p) - (isKitRecommended(p) && activeKitObj ? 1 : 0)), 0),
    [profsPicked, effectiveNWP, nwpEffCp, isKitRecommended, activeKitObj]);

  const spentCP     = traitCPSp + profCPSp + weapCPSp + classAbilCPSpent + mastCPSp;
  const remainCP    = totalCP - spentCP;

  // ── Validation cascade: re-evaluate class/race requirements whenever scores, race, or class change.
  // Produces an array of { tab, type, label, detail } warning objects for display in App.jsx.
  const validationWarnings = useMemo(() => {
    const warnings = [];
    if (!selectedClass) return warnings;

    // 1. Class stat requirements
    const reqs = CLASS_STAT_REQS[selectedClass] ?? [];
    const statFails = reqs
      .map(req => ({ ...req, have: modParent(req.id) }))
      .filter(r => r.have < r.min);
    if (statFails.length > 0) {
      const failStr = statFails
        .map(f => `${PARENT_STAT_LABELS[f.id] ?? f.id} ${f.min} (you have ${f.have})`)
        .join(", ");
      warnings.push({
        tab: "classes",
        type: "class_stats",
        label: classData?.label ?? selectedClass,
        detail: `${classData?.label ?? selectedClass} requires: ${failStr}`,
      });
    }

    // 2. Race/class incompatibility (retroactive — e.g. changed race after picking class)
    if (selectedRace) {
      const caps = RACE_CLASS_CAPS[selectedClass];
      const raceForbidden = !caps || !(selectedRace in caps);
      if (raceForbidden) {
        warnings.push({
          tab: "classes",
          type: "race_class",
          label: classData?.label ?? selectedClass,
          detail: `${raceData?.label ?? selectedRace} cannot be a ${classData?.label ?? selectedClass} — race restriction`,
        });
      }
    }

    return warnings;
  }, [selectedClass, selectedRace, modParent, classData, raceData]);

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

  // Elemental All cascade: when maj/min is toggled, auto-set the 4 sub-spheres
  // free of charge (cost excluded in classAbilCPSpent when the parent is active).
  const ELA_SUB_MAJ = ["cl_air_maj", "cl_ear_maj", "cl_fir_maj", "cl_wat_maj"];
  const ELA_SUB_MIN = ["cl_air_min", "cl_ear_min", "cl_fir_min", "cl_wat_min"];

  // ── Toggle class ability
  const toggleClassAbil = useCallback((abilId) => {
    setClassAbilPicked(p => {
      const next = { ...p, [abilId]: !p[abilId] };
      const on = next[abilId];
      if (abilId === "cl_ela_maj") {
        if (on) { ELA_SUB_MAJ.forEach(id => { next[id] = true; }); }
        else    { ELA_SUB_MAJ.forEach(id => { delete next[id]; }); }
      } else if (abilId === "cl_ela_min") {
        if (on) { ELA_SUB_MIN.forEach(id => { next[id] = true; }); }
        else    { ELA_SUB_MIN.forEach(id => { delete next[id]; }); }
      }
      return next;
    });
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
      } else if (WEAPON_CHOICE_ABILS.has(ab.id)) {
        // Store as object so the weapon choice can be recorded later
        setRacialPicked(p => ({ ...p, [ab.id]: { weapon: null } }));
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

  // ── Update weapon choice for a racial ability (e.g. hu01 attack bonus)
  const setRacialAbilWeapon = useCallback((abilId, weaponId) => {
    setRacialPicked(p => {
      const current = p[abilId];
      if (!current || typeof current !== 'object') return p;
      return { ...p, [abilId]: { ...current, weapon: weaponId || null } };
    });
  }, []);

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

  const handleClassSelect = id => {
    setSelectedClass(id === selectedClass ? null : id);
    setClassAbilPicked({});
    setSelectedKit(null);
  };

  // ── Druid: buy/remove the standard S&P sphere package in one click
  // Selects core 7 spheres (60 CP) + ELA cascade sub-spheres (0 CP).
  // Clicking again when all core spheres are already picked deselects everything.
  const handleDruidStandardPackage = useCallback(() => {
    setClassAbilPicked(prev => {
      const allPicked = DRUID_STANDARD_PKG_CORE.every(id => prev[id]);
      const next = { ...prev };
      if (allPicked) {
        [...DRUID_STANDARD_PKG_CORE, ...DRUID_ELA_SUB_IDS].forEach(id => { next[id] = false; });
      } else {
        [...DRUID_STANDARD_PKG_CORE, ...DRUID_ELA_SUB_IDS].forEach(id => { next[id] = true; });
      }
      return next;
    });
  }, []);

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

    // CP cap check — ALWAYS requires DM approval; ruleBreaker has NO effect on this limit (S&P)
    const currentContrib = (() => {
      if (!current) return 0;
      if (current === "severe" && dv.cpSevere != null) return dv.cpSevere;
      return dv.cp;
    })();
    const newContrib = (targetLevel === "severe" && dv.cpSevere != null) ? dv.cpSevere : dv.cp;
    const projectedPool = disadvPool - currentContrib + newContrib;
    if (projectedPool > DISADV_MAX_CP) {
      setConfirmBox({
        msg: `Taking "${dv.name}" (${targetLevel}) would give you ${projectedPool} CP from disadvantages, exceeding the ${DISADV_MAX_CP} CP maximum from S&P rules.\n\n⚠️ DM Approval Required: The maximum character points from disadvantages is ${DISADV_MAX_CP} (S&P rules). Exceeding this limit requires explicit DM approval for your campaign.`,
        label: "DM Approved — Proceed",
        color: "#a070c8",
        onConfirm: () => { setDisadvPicked(p => ({ ...p, [dv.id]: targetLevel })); },
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
    // Prevent buying same-named prof from a different group
    const sameNamePicked = effectiveNWP.find(p => p.id !== prof.id && p.name === prof.name && profsPicked[p.id]);
    if (sameNamePicked) return;
    const effCp = Math.max(0, nwpEffCp(prof) - (isKitRecommended(prof) && activeKitObj ? 1 : 0));
    const doIt  = () => setProfsPicked(p => ({ ...p, [prof.id]: true }));
    if (remainCP < effCp && !ruleBreaker) {
      setConfirmBox({
        msg: `"${prof.name}" costs ${effCp} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
        onConfirm: () => { setRuleBreaker(true); doIt(); },
      });
    } else doIt();
  };

  // ── Select / deselect a kit — auto-adds/removes required NWPs
  const handleKitSelect = useCallback((newKitId) => {
    const nextKit = newKitId
      ? effectiveKits.find(k => k.id === newKitId)
      : null;

    // Start from current profs, strip any previously auto-added NWPs
    const base = { ...profsPicked };
    Object.keys(kitAutoNWPs).forEach(id => { delete base[id]; });

    // Auto-add required NWPs for the incoming kit
    const newAuto = {};
    if (nextKit?.nwpRequired?.length) {
      nextKit.nwpRequired.forEach(reqName => {
        const r    = resolveKitProfEntry(reqName, _profIndex);
        const prof = r.resolved_canonical_id
          ? effectiveNWP.find(pr => pr.id === r.resolved_canonical_id)
          : effectiveNWP.find(pr => pr.name.toLowerCase() === reqName.toLowerCase()); // last-resort
        if (prof && !base[prof.id]) {
          base[prof.id] = true;
          newAuto[prof.id] = true;
        }
      });
    }

    setProfsPicked(base);
    setKitAutoNWPs(newAuto);
    setSelectedKit(newKitId ?? null);
    setKitFreeWeaponPick(null); // clear any free weapon when kit changes
  }, [effectiveKits, kitAutoNWPs, profsPicked, effectiveNWP, _profIndex]);

  const toggleWeap = (id, name, level) => {
    const already = !!weapPicked[id];
    if (already) {
      // Compute which canonical weapon IDs will no longer be proficient after this removal
      const newWeapPicked = { ...weapPicked };
      delete newWeapPicked[id];
      const newProfIds = computeProfCanonicalIds(newWeapPicked);

      // Find mastery/woc entries invalidated by this removal
      const invalidatedMastery = Object.fromEntries(
        Object.entries(masteryPicked).filter(([wid]) => !newProfIds.has(wid))
      );
      const invalidatedWoc = wocPicked && !newProfIds.has(wocPicked) ? wocPicked : null;

      // Apply removals and show notification if anything was invalidated
      setWeapPicked(newWeapPicked);

      const removedLabels = [];
      if (invalidatedWoc) {
        removedLabels.push("Weapon of Choice");
        setWocPicked(null);
      }
      if (Object.keys(invalidatedMastery).length > 0) {
        const tierNames = [...new Set(Object.values(invalidatedMastery).map(p => p.tier))];
        removedLabels.push(...tierNames.map(t => MASTERY_TIERS.find(x => x.id === t)?.name ?? t));
        setMasteryPicked(p => {
          const n = { ...p };
          Object.keys(invalidatedMastery).forEach(k => delete n[k]);
          return n;
        });
      }

      if (removedLabels.length > 0) {
        // Compute CP refund for the notification
        let refund = 0;
        if (invalidatedWoc) refund += WOC_CP[classGroup ? specCol(selectedClass) : "rogue"] ?? 3;
        Object.values(invalidatedMastery).forEach(pick => {
          const t = MASTERY_TIERS.find(x => x.id === pick.tier);
          const c = specCol(selectedClass);
          if (t?.cp[c]) refund += t.cp[c];
        });
        setInfoModal({
          title: "Proficiency removed",
          body: `${name} removed — ${removedLabels.join(", ")} also removed.\n${refund > 0 ? `${refund} CP refunded.` : ""}`,
        });
      }
      return;
    }
    const cost = (level === "style")   ? 2
                : (level === "shield")  ? getWeapCost(classGroup, "shield")
                : (level === "armor")   ? getWeapCost(classGroup, "armor")
                : (level === "special") ? getWeapCost(classGroup, "shield")
                : (level === "single")  ? getWeapSingleCostByTier(classGroup, getWeapTier(id))
                : (level === "tight")   ? getWeapSingleCostByTier(classGroup, getGroupMaxTier(id)) * 2
                : (level === "broad")   ? getWeapSingleCostByTier(classGroup, getGroupMaxTier(id)) * 3
                : getWeapCost(classGroup, level);

    // Build set of picks that become redundant (already-spent CP that gets refunded)
    const superseded = new Set();
    if (level === "tight") {
      for (const bg of WEAPON_GROUPS_49) {
        const tg = bg.tightGroups.find(t => t.id === id);
        if (tg) { tg.weapons.forEach(w => superseded.add(w.id)); break; }
      }
    } else if (level === "broad") {
      const bg = WEAPON_GROUPS_49.find(b => b.id === id);
      if (bg) {
        bg.tightGroups.forEach(tg => {
          superseded.add(tg.id);
          tg.weapons.forEach(w => superseded.add(w.id));
        });
        bg.unrelated.forEach(w => superseded.add(w.id));
      }
    }

    // CP refunded by removing superseded picks (reduces the net cost we need to afford)
    let supersededRefund = 0;
    superseded.forEach(k => {
      const lv = weapPicked[k];
      if (!lv) return;
      if (lv === "single")  supersededRefund += getWeapSingleCostByTier(classGroup, getWeapTier(k));
      else if (lv === "tight")  supersededRefund += getWeapSingleCostByTier(classGroup, getGroupMaxTier(k)) * 2;
      else if (lv === "broad")  supersededRefund += getWeapSingleCostByTier(classGroup, getGroupMaxTier(k)) * 3;
    });

    const doIt = () => setWeapPicked(p => {
      const n = { ...p };
      superseded.forEach(k => delete n[k]);
      n[id] = level;
      return n;
    });
    const netCost = cost - supersededRefund;
    if (remainCP < netCost && !ruleBreaker) {
      const refundNote = supersededRefund > 0 ? ` (net ${netCost} CP after ${supersededRefund} CP refund)` : "";
      setConfirmBox({
        msg: `"${name}" costs ${cost} CP${refundNote} but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
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
    classAbilPicked, selectedKit, kitAutoNWPs, kitFreeWeaponPick,
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
    classAbilPicked, selectedKit, kitAutoNWPs, kitFreeWeaponPick,
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
    const s = d ?? {};
    setCharName(s.charName ?? "");
    setCharGender(s.charGender ?? "");
    setCharLevel(s.charLevel ?? 1);
    setRuleBreaker(s.ruleBreaker ?? false);
    setCpPerLevelOverride(s.cpPerLevelOverride ?? 3);
    setDmAwards(s.dmAwards ?? []);
    setBaseScores(s.baseScores ?? Object.fromEntries(PARENT_STATS.map(st => [st, 0])));
    setExPcts(s.exPcts ?? { muscle: 50, stamina: 50 });
    setSplitMods(s.splitMods ?? Object.fromEntries(ALL_SUBS.map(st => [st.id, 0])));
    setSelectedKit(s.selectedKit ?? null);
    setKitAutoNWPs(s.kitAutoNWPs ?? {});
    setKitFreeWeaponPick(s.kitFreeWeaponPick ?? null);
    setSelectedRace(s.selectedRace ?? null);
    setSelectedSubRace(s.selectedSubRace ?? null);
    setRacialPicked(s.racialPicked ?? {});
    setAbilChosenSub(s.abilChosenSub ?? {});
    setMonstrousRaceId(s.monstrousRaceId ?? null);
    setMonstrousSelFeats(s.monstrousSelFeats ?? []);
    setMonstrousCustomize(s.monstrousCustomize ?? false);
    setMongrelChoice(s.mongrelChoice ?? null);
    setSelectedClass(s.selectedClass ?? null);
    setClassAbilPicked(s.classAbilPicked ?? {});
    setSpecialistSchool(s.specialistSchool ?? null);
    setMageSchoolsPicked(s.mageSchoolsPicked ?? {});
    setExtraOpposition(s.extraOpposition ?? []);
    setTraitsPicked(s.traitsPicked ?? {});
    setDisadvPicked(s.disadvPicked ?? {});
    setDisadvSubChoice(s.disadvSubChoice ?? {});
    setProfsPicked(s.profsPicked ?? {});
    setWeapPicked(s.weapPicked ?? {});
    setProfT44Override(s.profT44Override ?? {});
    setMasteryPicked(s.masteryPicked ?? {});
    setWocPicked(s.wocPicked ?? null);
    setStylePicked(s.stylePicked ?? {});
    setSocialStatus(s.socialStatus ?? { rolled: null, override: null });
    setThiefDiscPoints(s.thiefDiscPoints ?? Object.fromEntries(THIEF_SKILLS.map(st => [st.id, 0])));
    setThiefArmorType(s.thiefArmorType ?? "padded_studded");
    setCharAge(s.charAge ?? "");
    setCharHairColor(s.charHairColor ?? "");
    setCharEyeColor(s.charEyeColor ?? "");
    setCharDistinctiveFeatures(s.charDistinctiveFeatures ?? "");
    setCharAppearanceNotes(s.charAppearanceNotes ?? "");
    setPortraitUrl(s.portraitUrl ?? null);
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
    selectedKit, setSelectedKit, handleKitSelect,
    kitAutoNWPs,
    kitFreeWeaponPick, setKitFreeWeaponPick,
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
    // Derived — validation
    validationWarnings,
    // Derived — monstrous
    monstrousRaceData, monstrousAdjMods, monstrousBudget,
    // Handlers
    toggleClassAbil, rollStat, rollAll, setBase, adjustSplit,
    handleRaceSelect, handleSubRaceSelect, toggleRacialAbil, setRacialAbilWeapon,
    handleMonstrousRaceSelect, toggleMonstrousFeat,
    handleClassSelect, handleDruidStandardPackage, toggleTrait, toggleDisadv, toggleProf, toggleWeap, profSuccess,
    // Save / Load
    serializeCharacter, loadCharacterState,
    // Data refs needed by JSX (exported for tab components)
    MAGE_SP_CLASSES, CLERIC_SP_CLASSES,
    WIZARD_SCHOOLS, RACE_CLASS_CAPS,
    DISADVANTAGES, DISADV_POOL_WARN, DISADV_MAX_CP,
    TRAITS, ALL_NWP: effectiveNWP, ALL_PROFS: effectiveNWP, CLASS_ABILITIES,
    effectiveNWPGroups,
    SP_KITS, CLASS_KITS, ALL_CLASSES, effectiveKits,
    RACES, SUB_RACES, MONSTROUS_RACES, MONSTROUS_FEAT_MAP,
    PARENT_STATS, SUB_ABILITIES, PARENT_STAT_LABELS, getSubStats, getT44Mod,
    THIEF_SKILLS, THIEF_DISC_POINTS, SKILL_CLASS_ABILS,
  };
}
