/**
 * CharacterPrintView.jsx
 *
 * Renders the full AD&D 2E S&P character sheet from a plain character_data
 * object (the serialised snapshot stored in the DB / returned by the API).
 *
 * Shared by:
 *   • src/components/PrintSheet.jsx       — full-screen overlay + print toolbar
 *   • src/components/partyhub/PartyHub.jsx — inline panel in Party Knowledge
 *
 * Props:
 *   characterData  {object}  — output of useCharacter → serializeCharacter()
 */

import { useState, useEffect, useMemo } from 'react';

import {
  PARENT_STATS, SUB_ABILITIES, SUB_PARENT,
  getMuscleStats, getStaminaStats, getAimStats, getBalanceStats,
  getHealthStats, getFitnessStats, getReasonStats, getKnowledgeStats,
  getIntuitionStats, getWillpowerStats, getLeadershipStats, getAppearanceStats,
  getExStrLabel,
} from '../../data/abilities.js';

import { RACES, SUB_RACES }             from '../../data/races.js';
import { ALL_CLASSES, CLASS_ABILITIES } from '../../data/classes.js';
import { SP_KITS, CLASS_KITS }          from '../../data/kits.js';
import { CLASS_GROUP_MAP, ALL_NWP }     from '../../data/proficiencies.js';
import { TRAITS, DISADVANTAGES }        from '../../data/traits.js';

import {
  WEAPON_GROUPS_49, canonicalWeapId, MASTERY_TIERS, STYLE_SPECS,
} from '../../data/weapons.js';

function getRangerThievingPct(level) {
  if (level >= 11) return 50;
  if (level >= 9)  return 40;
  if (level >= 7)  return 30;
  if (level >= 5)  return 20;
  if (level >= 3)  return 15;
  return 10;
}

function getWeaponNameById(weapId) {
  if (!weapId) return null;
  for (const bg of WEAPON_GROUPS_49) {
    for (const tg of bg.tightGroups) {
      const w = tg.weapons.find(w => w.id === weapId);
      if (w) return w.name;
    }
    const w = (bg.unrelated ?? []).find(w => w.id === weapId);
    if (w) return w.name;
  }
  return weapId;
}

import {
  THIEF_SKILLS, SKILL_CLASS_ABILS,
  getThiefRacialAdj, getSkillSubAdj, calcThiefSkill, THIEF_ARMOR_ADJ,
  getRangerRacialAdj,
} from '../../data/thieving.js';

import { getSocialRank, getRankTable } from '../../data/socialStatus.js';

import '../PrintSheet.css';

import {
  calcAC, calcWeaponThac0, calcWeaponDamage, calcAttacksPerRound,
} from '../../rules-engine/combatCalc.js';

// ── THAC0 by class group ──────────────────────────────────────────────────────
function getBaseTHAC0(classGroup, level) {
  const lv = level ?? 1;
  if (classGroup === 'warrior') return 21 - lv;
  if (classGroup === 'priest')  return 20 - 2 * Math.floor((lv - 1) / 3);
  if (classGroup === 'wizard')  return 20 - Math.floor((lv - 1) / 3);
  if (classGroup === 'rogue')   return 20 - Math.floor((lv - 1) / 2);
  return 20;
}

// ── Saving throw base values by class group and level ─────────────────────────
// Returns [PPD, RSW, PP, BW, Spell] in that order.
// Formulas per AD&D 2E PHB Tables 53–57 (as simplified linear approximations).
const SAVE_NAMES = [
  'Paralysis / Poison / Death',
  'Rod / Staff / Wand',
  'Petrification / Polymorph',
  'Breath Weapon',
  'Spell',
];
function getSaveBase(classGroup, level) {
  const lv = Math.max(1, parseInt(level) || 1);
  if (classGroup === 'warrior') {
    const d = Math.floor(lv / 2);
    return [14-d, 16-d, 15-d, 17-d, 17-d];
  }
  if (classGroup === 'priest') {
    const d = Math.floor(lv / 3);
    return [10-d, 14-d, 13-d, 16-d, 15-d];
  }
  if (classGroup === 'rogue') {
    const d = Math.floor(lv / 4);
    return [13-d, 14-d, 12-d, 16-d, 15-d];
  }
  if (classGroup === 'wizard') {
    const d = Math.floor(lv / 5);
    return [14-d, 11-d, 13-d, 15-d, 12-d];
  }
  return [16, 18, 17, 20, 19]; // no class selected
}

// ── Sign-format a number ──────────────────────────────────────────────────────
const sgn = n => n === 0 ? '0' : n > 0 ? `+${n}` : `${n}`;

// ── Get bonus summary text for a sub-ability score ────────────────────────────
function subBonusSummary(subId, score, exStrPct, isWarrior) {
  const parts = [];
  const s = score ?? 10;
  if (subId === 'muscle') {
    const ms = getMuscleStats(s, isWarrior ? (exStrPct ?? 0) : 0);
    if (ms.attAdj !== 0)  parts.push(`Att${sgn(ms.attAdj)}`);
    if (ms.dmgAdj !== 0)  parts.push(`Dmg${sgn(ms.dmgAdj)}`);
    if (ms.maxPress)      parts.push(`Press:${ms.maxPress}lbs`);
  }
  if (subId === 'stamina') {
    const st = getStaminaStats(s, isWarrior ? (exStrPct ?? 0) : 0);
    if (st.weightAllow)   parts.push(`Carry:${st.weightAllow}lbs`);
  }
  if (subId === 'aim') {
    const a = getAimStats(s);
    if (a.missileAdj !== 0) parts.push(`Missile${sgn(a.missileAdj)}`);
  }
  if (subId === 'balance') {
    const b = getBalanceStats(s);
    if (b.defAdj !== 0)   parts.push(`AC${sgn(b.defAdj)}`);
    if (b.reactAdj !== 0) parts.push(`Init${sgn(b.reactAdj)}`);
  }
  if (subId === 'health') {
    const h = getHealthStats(s);
    parts.push(`SysShock:${h.sysShock}%`);
  }
  if (subId === 'fitness') {
    const f = getFitnessStats(s);
    const hpB = isWarrior ? f.hpBonusWarrior : f.hpBonus;
    if (hpB !== 0) parts.push(`HP/Lv${sgn(hpB)}`);
    parts.push(`Resurr:${f.resurrSurv}%`);
  }
  if (subId === 'reason') {
    const r = getReasonStats(s);
    parts.push(`MaxSpLv:${r.spellLevel}`);
  }
  if (subId === 'knowledge') {
    const k = getKnowledgeStats(s);
    if (k.learnSpell > 0) parts.push(`Learn:${k.learnSpell}%`);
  }
  if (subId === 'intuition') {
    const i = getIntuitionStats(s);
    if (i.bonusSpells && i.bonusSpells !== 'None') parts.push(`BonusSpells:${i.bonusSpells}`);
    if (i.spellFail > 0) parts.push(`SpellFail:${i.spellFail}%`);
  }
  if (subId === 'willpower') {
    const w = getWillpowerStats(s);
    if (w.magDefAdj !== 0) parts.push(`MagDef${sgn(w.magDefAdj)}`);
    if (w.spellImmunity > 0) parts.push(`SpImmLv${w.spellImmunity}`);
  }
  if (subId === 'leadership') {
    const l = getLeadershipStats(s);
    if (l.maxHench != null) parts.push(`MaxHench:${l.maxHench}`);
    if (l.loyaltyBase !== 0) parts.push(`Loyalty${sgn(l.loyaltyBase)}`);
  }
  if (subId === 'appearance') {
    const a = getAppearanceStats(s);
    if (a.reactionAdj !== 0) parts.push(`Reaction${sgn(a.reactionAdj)}`);
  }
  return parts.join(' · ') || '—';
}

// ── Build deduplicated proficient weapon list ─────────────────────────────────
function buildProfWeaponList(weapPicked) {
  const result = [];
  if (!weapPicked) return result;
  const seen = new Set();

  const addItem = (id, label, level) => {
    if (!seen.has(id)) { seen.add(id); result.push({ id, label, level }); }
  };

  WEAPON_GROUPS_49.forEach(bg => {
    if (weapPicked[bg.id]) addItem(bg.id, bg.broad ?? bg.id, 'broad');
    bg.tightGroups?.forEach(tg => {
      if (weapPicked[tg.id]) addItem(tg.id, tg.name ?? tg.id, 'tight');
      tg.weapons?.forEach(w => {
        if (weapPicked[w.id]) addItem(canonicalWeapId(w), w.name ?? w.id, 'single');
      });
    });
    bg.unrelated?.forEach(w => {
      if (weapPicked[w.id]) addItem(canonicalWeapId(w), w.name ?? w.id, 'single');
    });
  });

  // Style / shield / armor special profs
  Object.entries(weapPicked).forEach(([id, level]) => {
    if (!level) return;
    if (['shield', 'armor', 'style'].includes(level) && !seen.has(id))
      addItem(id, id.replace(/_/g, ' '), level);
  });

  return result;
}

// ── Small shared sub-components ───────────────────────────────────────────────
function SectionHead({ children }) {
  return <div className="ps-section-head">{children}</div>;
}

function StatBox({ label, value, big }) {
  return (
    <div className={`ps-stat-box${big ? ' ps-stat-box--big' : ''}`}>
      <div className="ps-stat-box__value">{value ?? '—'}</div>
      <div className="ps-stat-box__label">{label}</div>
    </div>
  );
}

function FillLine({ label, value, wide }) {
  return (
    <div className={`ps-fill-line${wide ? ' ps-fill-line--wide' : ''}`}>
      <span className="ps-fill-line__label">{label}</span>
      <span className="ps-fill-line__value">{value ?? ''}</span>
      <span className="ps-fill-line__rule" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function CharacterPrintView({ characterData, characterId }) {
  const cd = characterData ?? {};

  // ── Fetch equipped items when characterId is provided ─────────────────────
  const [equippedItems, setEquippedItems] = useState([]);
  useEffect(() => {
    if (!characterId) return;
    fetch(
      `/api/character-equipment?character_id=${characterId}`,
      { headers: { Authorization: 'Bearer ' + localStorage.getItem('dnd_token') } },
    )
      .then(r => r.ok ? r.json() : [])
      .then(items => setEquippedItems(Array.isArray(items) ? items.filter(i => i.slot) : []))
      .catch(() => {});
  }, [characterId]);

  // ── Destructure raw stored fields ─────────────────────────────────────────
  const {
    charName, charGender, charLevel, charAge,
    charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    portraitUrl,
    selectedRace, selectedSubRace, selectedClass, selectedKit, specialistSchool,
    baseScores   = {},
    splitMods    = {},
    exPcts       = {},
    racialPicked = {},
    abilChosenSub = {},
    traitsPicked  = {},
    disadvPicked  = {},
    disadvSubChoice = {},
    profsPicked   = {},
    weapPicked    = {},
    masteryPicked = {},
    wocPicked,
    stylePicked   = {},
    thiefDiscPoints = {},
    thiefArmorType,
    classAbilPicked = {},
    socialStatus,
  } = cd;

  // ── Lookup objects from data files ────────────────────────────────────────
  const raceData = useMemo(
    () => RACES.find(r => r.id === selectedRace) ?? null,
    [selectedRace],
  );
  const classData = useMemo(
    () => ALL_CLASSES.find(c => c.id === selectedClass) ?? null,
    [selectedClass],
  );
  const subRaceData = useMemo(() =>
    selectedRace ? ((SUB_RACES[selectedRace] ?? []).find(sr => sr.id === selectedSubRace) ?? null) : null,
    [selectedRace, selectedSubRace],
  );
  const classGroup = useMemo(
    () => CLASS_GROUP_MAP[selectedClass] ?? null,
    [selectedClass],
  );
  const activeKitObj = useMemo(() => {
    if (!selectedKit) return null;
    const classKits = selectedClass ? (CLASS_KITS[selectedClass] ?? []) : [];
    return [...SP_KITS, ...classKits].find(k => k.id === selectedKit) ?? null;
  }, [selectedKit, selectedClass]);

  // ── effSub computation pipeline ───────────────────────────────────────────
  //  (mirrors useCharacter.js: modParent → racialSubDeltas → effSub)
  const activeRaceStatMods = useMemo(
    () => raceData?.baseStatMods ?? {},
    [raceData],
  );

  const modParent = useMemo(() => stat =>
    Math.min(25, Math.max(1, (baseScores[stat] ?? 10) + (activeRaceStatMods[stat] ?? 0))),
    [baseScores, activeRaceStatMods],
  );

  const racialSubDeltas = useMemo(() => {
    const d = {};
    if (!raceData) return d;
    const pkgIds   = subRaceData?.id !== 'custom' ? (subRaceData?.abilityIds ?? []) : [];
    const indivIds = Object.keys(racialPicked).filter(id => racialPicked[id]);
    const active   = new Set([...pkgIds, ...indivIds]);
    raceData.abilities.forEach(ab => {
      if (!active.has(ab.id) || !ab.statLink) return;
      const subId = ab.statLink.sub === 'choose'
        ? (abilChosenSub[ab.id] ?? null) : ab.statLink.sub;
      if (!subId) return;
      d[subId] = (d[subId] ?? 0) + ab.statLink.delta;
    });
    return d;
  }, [raceData, subRaceData, racialPicked, abilChosenSub]);

  const effSub = useMemo(() => subId => {
    const parent = SUB_PARENT[subId];
    if (!parent) return 10;
    return Math.min(25, Math.max(1,
      modParent(parent) + (racialSubDeltas[subId] ?? 0) + (splitMods[subId] ?? 0)
    ));
  }, [modParent, racialSubDeltas, splitMods]);

  const abilGrantsExStr = useMemo(
    () => (CLASS_ABILITIES[selectedClass] ?? []).some(a => a.allowsExStr && classAbilPicked[a.id]),
    [selectedClass, classAbilPicked],
  );
  const showExStr   = effSub('muscle') === 18;
  const exStrActive = showExStr && (!!classData?.allowsExStr || abilGrantsExStr);

  // ── Equipment-derived combat values ──────────────────────────────────────
  const acCalc = useMemo(
    () => calcAC(cd, equippedItems),
    [cd, equippedItems],
  );
  const equippedWeapons = useMemo(
    () => equippedItems.filter(
      i => (i.slot === 'hand_r' || i.slot === 'hand_l' || i.slot === 'ranged') &&
           i.item_type !== 'ammo' && i.item_type !== 'armor' && i.item_type !== 'shield',
    ),
    [equippedItems],
  );

  // ── Derived combat values ─────────────────────────────────────────────────
  const thac0 = getBaseTHAC0(classGroup, charLevel);

  const muscleStats  = useMemo(
    () => getMuscleStats(effSub('muscle'), exStrActive ? (exPcts?.muscle ?? 0) : 0),
    [effSub, exStrActive, exPcts],
  );
  const meleeAttAdj  = muscleStats.attAdj ?? 0;
  const meleeDmgAdj  = muscleStats.dmgAdj ?? 0;
  const missileAdj   = getAimStats(effSub('aim')).missileAdj ?? 0;
  const acAdj        = getBalanceStats(effSub('balance')).defAdj ?? 0;
  const thac0Melee   = thac0 - meleeAttAdj;
  const thac0Missile = thac0 - missileAdj;
  const isWarrior    = classGroup === 'warrior';

  // ── Picked lists ──────────────────────────────────────────────────────────
  const pickedTraits = useMemo(
    () => TRAITS.filter(t => traitsPicked?.[t.id]),
    [traitsPicked],
  );
  const pickedDisadvs = useMemo(
    () => DISADVANTAGES.filter(d => disadvPicked?.[d.id]),
    [disadvPicked],
  );
  const pickedNWPs = useMemo(
    () => ALL_NWP.filter(p => profsPicked?.[p.id]),
    [profsPicked],
  );
  const profWeapons = useMemo(
    () => buildProfWeaponList(weapPicked),
    [weapPicked],
  );
  const masteryEntries = useMemo(() => {
    if (!masteryPicked) return [];
    return Object.entries(masteryPicked)
      .filter(([, v]) => v?.tier)
      .map(([weapKey, v]) => {
        const tier = MASTERY_TIERS.find(t => t.id === v.tier);
        return { weapKey, tierLabel: tier?.label ?? v.tier, type: v.type };
      });
  }, [masteryPicked]);
  const styleEntries = useMemo(() => {
    if (!stylePicked) return [];
    return Object.entries(stylePicked)
      .filter(([, level]) => level)
      .map(([styleId, level]) => {
        const spec = STYLE_SPECS.find(s => s.id === styleId);
        return { label: spec?.label ?? styleId, level };
      });
  }, [stylePicked]);

  // ── Thieving skills ───────────────────────────────────────────────────────
  const thiefEntries = useMemo(() => {
    if (!selectedClass || !classAbilPicked) return [];
    // Ranger: fixed level-based + Balance + racial modifiers (S&P Table 22)
    if (selectedClass === 'ranger') {
      const base   = getRangerThievingPct(charLevel ?? 1);
      const balMod = getBalanceStats(effSub('balance')).moveSilent ?? 0;
      const racial = getRangerRacialAdj(selectedRace ?? 'human');
      const sgn = n => n === 0 ? '' : (n > 0 ? `+${n}%` : `${n}%`);
      const breakdown = (raceMod) => {
        const parts = [`base ${base}%`];
        if (balMod !== 0) parts.push(`Dex ${sgn(balMod)}`);
        if (raceMod !== 0) parts.push(`Race ${sgn(raceMod)}`);
        return parts.join(' ');
      };
      return [
        {
          id: 'ms', label: 'Move Silently', rangerFixed: true,
          final: Math.min(95, Math.max(5, base + balMod + racial.ms)),
          breakdown: breakdown(racial.ms),
        },
        {
          id: 'hs', label: 'Hide in Shadows', rangerFixed: true,
          final: Math.min(95, Math.max(5, base + balMod + racial.hs)),
          breakdown: breakdown(racial.hs),
        },
      ];
    }
    const racialAdj = getThiefRacialAdj(selectedRace ?? 'human');
    const armorAdj  = THIEF_ARMOR_ADJ[thiefArmorType ?? 'padded_studded'] ?? {};
    const aimScore  = effSub('aim');
    const balScore  = effSub('balance');
    return THIEF_SKILLS.map(sk => {
      const classEntry = SKILL_CLASS_ABILS[sk.id]?.[selectedClass];
      if (!classEntry || !classAbilPicked[classEntry.abilId]) return null;
      const base   = classEntry.base ?? sk.base;
      const subAdj = classEntry.subStat !== undefined
        ? (classEntry.subStat ? getSkillSubAdj({ ...sk, subStat: classEntry.subStat }, aimScore, balScore) : 0)
        : getSkillSubAdj(sk, aimScore, balScore);
      const final  = calcThiefSkill(sk.id, {
        base, racial: racialAdj,
        dex: { [sk.id]: subAdj },
        armor: armorAdj, disc: thiefDiscPoints ?? {},
      });
      return { id: sk.id, label: sk.label, final };
    }).filter(Boolean);
  }, [selectedClass, classAbilPicked, selectedRace, thiefArmorType, effSub, thiefDiscPoints, charLevel]);

  // ── Social status ─────────────────────────────────────────────────────────
  const rankVal = socialStatus?.override ?? socialStatus?.rolled ?? null;
  let socialRankLabel = null;
  if (rankVal !== null) {
    const tbl       = getRankTable(activeKitObj?.name ?? activeKitObj?.id ?? null);
    const rankEntry = getSocialRank(rankVal, tbl);
    if (rankEntry) socialRankLabel = `${rankEntry.tier}: ${rankEntry.label}`;
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ══════════════════════════════════════════════════════════════
          PAGE 1 — Identity · Combat · Ability Scores · Weapons
          ══════════════════════════════════════════════════════════════ */}
      <div className="ps-page">

        {/* ── Title banner ────────────────────────────────────────── */}
        <div className="ps-title-banner">
          <div className="ps-title-left">
            <div className="ps-char-name">{charName || 'Unnamed Adventurer'}</div>
            <div className="ps-char-sub">
              {[
                charGender,
                raceData
                  ? `${raceData.label}${subRaceData ? ` (${subRaceData.label})` : ''}`
                  : selectedRace ?? null,
                classData
                  ? `${classData.label}${specialistSchool ? ` [${specialistSchool}]` : ''}`
                  : selectedClass ?? null,
                charLevel ? `Level ${charLevel}` : null,
                activeKitObj ? `Kit: ${activeKitObj.name}` : null,
              ].filter(Boolean).join('  ·  ')}
            </div>
            <div className="ps-char-appearance">
              {[
                charAge            ? `Age: ${charAge}`              : null,
                charHairColor      ? `Hair: ${charHairColor}`       : null,
                charEyeColor       ? `Eyes: ${charEyeColor}`        : null,
                charDistinctiveFeatures || null,
              ].filter(Boolean).join('   ')}
            </div>
          </div>
          <div className="ps-portrait-box">
            {portraitUrl
              ? <img src={portraitUrl} alt="Portrait" className="ps-portrait-img" />
              : <div className="ps-portrait-placeholder">Portrait</div>
            }
          </div>
        </div>

        {/* ── Combat row ──────────────────────────────────────────── */}
        <SectionHead>Combat Statistics</SectionHead>
        <div className="ps-combat-row">
          <StatBox label="THAC0 (Base)"    value={thac0}         big />
          <StatBox label="THAC0 (Melee)"   value={thac0Melee}    big />
          <StatBox label="THAC0 (Missile)" value={thac0Missile}  big />
          <StatBox label="Melee Att Adj"   value={sgn(meleeAttAdj)} />
          <StatBox label="Melee Dmg Adj"   value={sgn(meleeDmgAdj)} />
          <StatBox label="AC Modifier"     value={sgn(acAdj)} />
          <div className="ps-combat-fields">
            <FillLine label="AC:" value={equippedItems.length ? acCalc.finalAC : undefined} />
            <FillLine label="HP:" />
            <FillLine label="Max HP:" />
            <FillLine label="Init Adj:" value={sgn(getBalanceStats(effSub('balance')).reactAdj)} />
          </div>
        </div>

        {/* ── Saving Throws ───────────────────────────────────────── */}
        <SectionHead>Saving Throws</SectionHead>
        {(() => {
          const bases      = getSaveBase(classGroup, charLevel);
          const poisonMod  = getHealthStats(effSub('health')).poisonSave   ?? 0;
          const magDefMod  = getWillpowerStats(effSub('willpower')).magDefAdj ?? 0;
          // Per-save modifiers: index 0 = PPD (poison), index 4 = Spell (mag def)
          const mods = [poisonMod, 0, 0, 0, magDefMod];
          return (
            <table className="ps-ability-table" style={{ marginBottom: 6 }}>
              <thead>
                <tr>
                  <th>Save vs</th>
                  <th className="ps-score-col">Base</th>
                  <th className="ps-score-col">Modifier</th>
                  <th className="ps-score-col">Final</th>
                </tr>
              </thead>
              <tbody>
                {SAVE_NAMES.map((name, i) => (
                  <tr key={name}>
                    <td className="ps-sub-label">{name}</td>
                    <td className="ps-score-col">{bases[i]}</td>
                    <td className="ps-score-col" style={{ color: mods[i] !== 0 ? 'var(--ps-gold)' : undefined }}>
                      {mods[i] !== 0 ? sgn(mods[i]) : '0'}
                    </td>
                    <td className="ps-score-col ps-score-val">{bases[i] - mods[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          );
        })()}

        {/* ── Ability scores ──────────────────────────────────────── */}
        <SectionHead>Ability Scores</SectionHead>
        <table className="ps-ability-table">
          <thead>
            <tr>
              <th>Stat</th>
              <th>Sub-Ability</th>
              <th className="ps-score-col">Score</th>
              <th>Bonuses &amp; Effects</th>
            </tr>
          </thead>
          <tbody>
            {PARENT_STATS.map(stat => {
              const subs = SUB_ABILITIES[stat];
              return subs.map((sub, si) => {
                const score = effSub(sub.id);
                const bonus = subBonusSummary(sub.id, score, exPcts?.muscle, isWarrior);
                const exLabel = (sub.id === 'muscle' && exStrActive)
                  ? ` (${getExStrLabel(exPcts?.muscle ?? 0)})` : '';
                return (
                  <tr key={sub.id} className={si === 0 ? 'ps-row-top' : ''}>
                    {si === 0 && (
                      <td className="ps-parent-cell" rowSpan={2}>{stat}</td>
                    )}
                    <td className="ps-sub-label">{sub.label}</td>
                    <td className="ps-score-col ps-score-val">{score}{exLabel}</td>
                    <td className="ps-bonus-cell">{bonus}</td>
                  </tr>
                );
              });
            })}
          </tbody>
        </table>

        {/* ── Weapon Proficiencies ────────────────────────────────── */}
        <SectionHead>Weapon Proficiencies</SectionHead>
        <div className="ps-weap-grid">
          {profWeapons.length === 0
            ? <span className="ps-empty">None selected</span>
            : profWeapons.map((w, i) => (
              <div key={i} className="ps-weap-item">
                <span className="ps-weap-name">{w.label}</span>
                <span className="ps-weap-level">{w.level}</span>
              </div>
            ))
          }
        </div>

        {/* ── Mastery & Styles ────────────────────────────────────── */}
        {(masteryEntries.length > 0 || styleEntries.length > 0 || wocPicked) && (
          <>
            <SectionHead>Mastery &amp; Fighting Styles</SectionHead>
            <div className="ps-mastery-grid">
              {wocPicked && (
                <div className="ps-mastery-item">
                  <span className="ps-mastery-label">Weapon of Choice:</span>
                  <span className="ps-mastery-val">{wocPicked}</span>
                </div>
              )}
              {masteryEntries.map((m, i) => (
                <div key={i} className="ps-mastery-item">
                  <span className="ps-mastery-label">{m.weapKey}:</span>
                  <span className="ps-mastery-val">{m.tierLabel}{m.type ? ` (${m.type})` : ''}</span>
                </div>
              ))}
              {styleEntries.map((s, i) => (
                <div key={i} className="ps-mastery-item">
                  <span className="ps-mastery-label">Style:</span>
                  <span className="ps-mastery-val">{s.label} [{s.level}]</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════
          PAGE 2 — NWPs · Thieving · Traits · Disadvs · Status · Equipment
          ══════════════════════════════════════════════════════════════ */}
      <div className="ps-page ps-page--break">

        {/* ── Weapons ───────────────────────────────────────────────── */}
        <SectionHead>Weapons</SectionHead>
        <table className="ps-ability-table ps-weapons-table" style={{ marginBottom: 6 }}>
          <thead>
            <tr>
              <th>Weapon</th>
              <th>Type</th>
              <th className="ps-score-col">Speed</th>
              <th className="ps-score-col">Dmg S/M</th>
              <th className="ps-score-col">Dmg L</th>
              <th>Range</th>
              <th className="ps-score-col">Att/Rd</th>
              <th className="ps-score-col">THAC0</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {equippedWeapons.map((w, i) => {
              const dmg    = calcWeaponDamage(w, cd);
              const thac0w = calcWeaponThac0(w, cd);
              const apr    = calcAttacksPerRound(w, cd, equippedItems);
              const noteNotes = w.notes ? w.notes.substring(0, 50) : null;
              const note   = [
                w.identify_state === 'unidentified' ? '?' : null,
                w.is_cursed ? 'Cursed' : null,
                w.magic_bonus && w.identify_state === 'identified' && w.magic_bonus !== 0
                  ? sgn(w.magic_bonus) : null,
                noteNotes,
              ].filter(Boolean).join(' · ');
              return (
                <tr key={w.id} className={i === 0 ? 'ps-row-top' : ''}>
                  <td>{w.name}{w.slot === 'hand_l' ? ' (off)' : ''}</td>
                  <td>{w.weapon_type ?? '—'}</td>
                  <td className="ps-score-col">{w.speed_factor ?? '—'}</td>
                  <td className="ps-score-col">{dmg.damageSM}</td>
                  <td className="ps-score-col">{dmg.damageL}</td>
                  <td>{w.range_str ?? '—'}</td>
                  <td className="ps-score-col">{apr.attacks}</td>
                  <td className="ps-score-col">{thac0w.finalThac0}</td>
                  <td>{note || '—'}</td>
                </tr>
              );
            })}
            {Array.from({ length: Math.max(0, 4 - equippedWeapons.length) }).map((_, i) => (
              <tr key={`blank-${i}`}>
                <td>&nbsp;</td>
                <td /><td className="ps-score-col" /><td className="ps-score-col" />
                <td className="ps-score-col" /><td /><td className="ps-score-col" />
                <td className="ps-score-col" /><td />
              </tr>
            ))}
          </tbody>
        </table>

        {/* ── NWPs ──────────────────────────────────────────────────── */}
        <SectionHead>Non-Weapon Proficiencies</SectionHead>
        {pickedNWPs.length === 0
          ? <div className="ps-empty">None selected</div>
          : (
            <table className="ps-nwp-table">
              <thead>
                <tr>
                  <th>Proficiency</th>
                  <th>Stat</th>
                  <th className="ps-score-col">Check</th>
                  <th>CP</th>
                </tr>
              </thead>
              <tbody>
                {pickedNWPs.map(p => {
                  const stat  = p.stats?.[0] ?? null;
                  const score = stat ? effSub(stat) : null;
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td>{stat ?? '—'}</td>
                      <td className="ps-score-col">{score ?? '—'}</td>
                      <td>{p.cp}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )
        }

        {/* ── Thieving / Ranger Skills ───────────────────────────────── */}
        {thiefEntries.length > 0 && (
          <>
            <SectionHead>{selectedClass === 'ranger' ? 'Ranger Abilities' : 'Thieving Skills'}</SectionHead>
            {selectedClass === 'ranger' && (
              <div style={{ fontSize:10, color:'#888', marginBottom:6, fontStyle:'italic' }}>
                Base from level (S&P Table 22) + Balance (DEX) + racial bonus — no discretionary points
              </div>
            )}
            <div className="ps-thief-grid">
              {thiefEntries.map(sk => (
                <div key={sk.id} className="ps-thief-item">
                  <span className="ps-thief-label">{sk.label}</span>
                  <span className="ps-thief-val">
                    {sk.final}%
                    {sk.breakdown && (
                      <span style={{ fontSize:'0.8em', color:'#888', display:'block' }}>
                        ({sk.breakdown})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Racial Abilities (weapon choice) ──────────────────────── */}
        {racialPicked['hu01'] && typeof racialPicked['hu01'] === 'object' && (
          <>
            <SectionHead>Racial Abilities</SectionHead>
            <div className="ps-thief-grid">
              <div className="ps-thief-item">
                <span className="ps-thief-label">Attack Bonus</span>
                <span className="ps-thief-val">
                  {racialPicked['hu01'].weapon
                    ? `+1 to hit with ${getWeaponNameById(racialPicked['hu01'].weapon)}`
                    : '+1 to hit (no weapon chosen)'}
                </span>
              </div>
            </div>
          </>
        )}

        {/* ── Traits & Disadvantages ────────────────────────────────── */}
        <div className="ps-two-col">
          <div>
            <SectionHead>Traits</SectionHead>
            {pickedTraits.length === 0
              ? <div className="ps-empty">None</div>
              : (
                <ul className="ps-list">
                  {pickedTraits.map(t => (
                    <li key={t.id}>
                      <strong>{t.name}</strong>
                      <span className="ps-cp"> [{t.cp} CP]</span>
                    </li>
                  ))}
                </ul>
              )
            }
          </div>
          <div>
            <SectionHead>Disadvantages</SectionHead>
            {pickedDisadvs.length === 0
              ? <div className="ps-empty">None</div>
              : (
                <ul className="ps-list">
                  {pickedDisadvs.map(d => {
                    const level  = disadvPicked[d.id];
                    const subId  = disadvSubChoice?.[d.id];
                    const subOpt = d.subOptions?.find(o => o.id === subId);
                    return (
                      <li key={d.id}>
                        <strong>{d.name}</strong>
                        {level === 'severe' && ' (Severe)'}
                        {subOpt && ` — ${subOpt.label}`}
                        <span className="ps-cp"> [{level === 'severe' && d.cpSevere != null ? d.cpSevere : d.cp} CP]</span>
                      </li>
                    );
                  })}
                </ul>
              )
            }
          </div>
        </div>

        {/* ── Social Status ─────────────────────────────────────────── */}
        {(rankVal !== null || socialRankLabel) && (
          <>
            <SectionHead>Social Status</SectionHead>
            <div className="ps-social">
              {activeKitObj && <span className="ps-social-kit">{activeKitObj.name}:</span>}
              <span className="ps-social-rank">{socialRankLabel ?? '—'}</span>
              {rankVal !== null && <span className="ps-social-roll">(Roll: {rankVal})</span>}
              {charAppearanceNotes && (
                <span className="ps-social-notes">{charAppearanceNotes}</span>
              )}
            </div>
          </>
        )}

        {/* ── Spellbook ─────────────────────────────────────────────── */}
        {(classGroup === 'wizard' || classGroup === 'priest') && (
          <>
            <SectionHead>
              {classGroup === 'wizard' ? 'Spellbook' : 'Spell Access'}
            </SectionHead>
            <div className="ps-spells-block">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(lv => (
                <div key={lv} className="ps-spell-level">
                  <div className="ps-spell-level-head">Level {lv}</div>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="ps-spell-line" />
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── Notes ─────────────────────────────────────────────────── */}
        <SectionHead>Notes</SectionHead>
        <div className="ps-notes-block">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="ps-note-line" />
          ))}
        </div>

        <div className="ps-footer">
          AD&amp;D 2nd Edition · Skills &amp; Powers · {charName || 'Character Sheet'}
          {charLevel ? ` · Level ${charLevel}` : ''}
        </div>
      </div>
    </>
  );
}
