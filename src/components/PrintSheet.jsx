/**
 * PrintSheet.jsx — AD&D 2E S&P Print-Friendly Character Sheet
 *
 * Usage:
 *   <PrintSheet {...char} isOpen={showPrint} onClose={() => setShowPrint(false)} />
 *
 * Screen: renders as a fixed full-screen overlay when isOpen=true.
 * Print:  @media print in PrintSheet.css hides everything else and shows this.
 */

import { useMemo } from "react";

import {
  PARENT_STATS, SUB_ABILITIES,
  getMuscleStats, getStaminaStats, getAimStats, getBalanceStats,
  getHealthStats, getFitnessStats, getReasonStats, getKnowledgeStats,
  getIntuitionStats, getWillpowerStats, getLeadershipStats, getAppearanceStats,
  getExStrLabel,
} from "../data/abilities.js";

import { TRAITS, DISADVANTAGES } from "../data/traits.js";
import { ALL_NWP } from "../data/proficiencies.js";
import {
  THIEF_SKILLS, SKILL_CLASS_ABILS,
  getThiefRacialAdj, getSkillSubAdj, calcThiefSkill, THIEF_ARMOR_ADJ,
} from "../data/thieving.js";
import {
  WEAPON_GROUPS_49, canonicalWeapId, MASTERY_TIERS, STYLE_SPECS,
} from "../data/weapons.js";
import { getSocialRank, getRankTable } from "../data/socialStatus.js";

import "./PrintSheet.css";

// ── THAC0 by class group ──────────────────────────────────────────────────────
function getBaseTHAC0(classGroup, level) {
  const lv = level ?? 1;
  if (classGroup === "warrior") return 21 - lv;
  if (classGroup === "priest")  return 20 - 2 * Math.floor((lv - 1) / 3);
  if (classGroup === "wizard")  return 20 - Math.floor((lv - 1) / 3);
  if (classGroup === "rogue")   return 20 - Math.floor((lv - 1) / 2);
  return 20; // default
}

// ── Sign-format a number ──────────────────────────────────────────────────────
const sgn = n => n === 0 ? "0" : n > 0 ? `+${n}` : `${n}`;

// ── Get all bonus text for a sub-ability score ────────────────────────────────
function subBonusSummary(subId, score, exStrPct, isWarrior) {
  const parts = [];
  const s = score ?? 10;
  if (subId === "muscle") {
    const ms = getMuscleStats(s, isWarrior ? (exStrPct ?? 0) : 0);
    if (ms.attAdj !== 0)  parts.push(`Att${sgn(ms.attAdj)}`);
    if (ms.dmgAdj !== 0)  parts.push(`Dmg${sgn(ms.dmgAdj)}`);
    if (ms.maxPress)      parts.push(`Press:${ms.maxPress}lbs`);
  }
  if (subId === "stamina") {
    const st = getStaminaStats(s, isWarrior ? (exStrPct ?? 0) : 0);
    if (st.weightAllow)   parts.push(`Carry:${st.weightAllow}lbs`);
  }
  if (subId === "aim") {
    const a = getAimStats(s);
    if (a.missileAdj !== 0) parts.push(`Missile${sgn(a.missileAdj)}`);
  }
  if (subId === "balance") {
    const b = getBalanceStats(s);
    if (b.defAdj !== 0)   parts.push(`AC${sgn(b.defAdj)}`);
    if (b.reactAdj !== 0) parts.push(`Init${sgn(b.reactAdj)}`);
  }
  if (subId === "health") {
    const h = getHealthStats(s);
    parts.push(`SysShock:${h.sysShock}%`);
  }
  if (subId === "fitness") {
    const f = getFitnessStats(s);
    const hpB = isWarrior ? f.hpBonusWarrior : f.hpBonus;
    if (hpB !== 0) parts.push(`HP/Lv${sgn(hpB)}`);
    parts.push(`Resurr:${f.resurrSurv}%`);
  }
  if (subId === "reason") {
    const r = getReasonStats(s);
    parts.push(`MaxSpLv:${r.spellLevel}`);
  }
  if (subId === "knowledge") {
    const k = getKnowledgeStats(s);
    if (k.learnSpell > 0) parts.push(`Learn:${k.learnSpell}%`);
  }
  if (subId === "intuition") {
    const i = getIntuitionStats(s);
    if (i.bonusSpells && i.bonusSpells !== "None") parts.push(`BonusSpells:${i.bonusSpells}`);
    if (i.spellFail > 0) parts.push(`SpellFail:${i.spellFail}%`);
  }
  if (subId === "willpower") {
    const w = getWillpowerStats(s);
    if (w.magDefAdj !== 0) parts.push(`MagDef${sgn(w.magDefAdj)}`);
    if (w.spellImmunity > 0) parts.push(`SpImmLv${w.spellImmunity}`);
  }
  if (subId === "leadership") {
    const l = getLeadershipStats(s);
    if (l.maxHench != null) parts.push(`MaxHench:${l.maxHench}`);
    if (l.loyaltyBase !== 0) parts.push(`Loyalty${sgn(l.loyaltyBase)}`);
  }
  if (subId === "appearance") {
    const a = getAppearanceStats(s);
    if (a.reactionAdj !== 0) parts.push(`Reaction${sgn(a.reactionAdj)}`);
  }
  return parts.join(" · ") || "—";
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
    // broad group prof
    if (weapPicked[bg.id]) {
      addItem(bg.id, bg.broad ?? bg.id, "broad");
    }
    // tight group profs
    bg.tightGroups?.forEach(tg => {
      if (weapPicked[tg.id]) {
        addItem(tg.id, tg.name ?? tg.id, "tight");
      }
      // individual weapons
      tg.weapons?.forEach(w => {
        if (weapPicked[w.id]) {
          const cid = canonicalWeapId(w);
          addItem(cid, w.name ?? w.id, "single");
        }
      });
    });
    // unrelated individual weapons at broad-group level
    bg.unrelated?.forEach(w => {
      if (weapPicked[w.id]) {
        const cid = canonicalWeapId(w);
        addItem(cid, w.name ?? w.id, "single");
      }
    });
  });

  // Style / shield / armor special profs
  Object.entries(weapPicked).forEach(([id, level]) => {
    if (!level) return;
    if (["shield","armor","style"].includes(level) && !seen.has(id)) {
      addItem(id, id.replace(/_/g, " "), level);
    }
  });

  return result;
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHead({ children }) {
  return <div className="ps-section-head">{children}</div>;
}

// ── Box label/value pair ──────────────────────────────────────────────────────
function StatBox({ label, value, big }) {
  return (
    <div className={`ps-stat-box${big ? " ps-stat-box--big" : ""}`}>
      <div className="ps-stat-box__value">{value ?? "—"}</div>
      <div className="ps-stat-box__label">{label}</div>
    </div>
  );
}

// ── Blank fill line ───────────────────────────────────────────────────────────
function FillLine({ label, value, wide }) {
  return (
    <div className={`ps-fill-line${wide ? " ps-fill-line--wide" : ""}`}>
      <span className="ps-fill-line__label">{label}</span>
      <span className="ps-fill-line__value">{value ?? ""}</span>
      <span className="ps-fill-line__rule" />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────

export function PrintSheet({ isOpen, onClose, ...char }) {
  const {
    charName, charGender, charLevel, charAge,
    charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    portraitUrl,
    selectedRace, selectedClass,
    raceData, classData, subRaceData, activeKitObj,
    baseScores, splitMods, exPcts, exStrActive,
    effSub, classGroup,
    traitsPicked, disadvPicked, disadvSubChoice,
    profsPicked, weapPicked, masteryPicked, wocPicked, stylePicked,
    thiefDiscPoints, thiefArmorType,
    classAbilPicked,
    socialStatus,
    specialistSchool,
  } = char;

  // ── Derived values ──────────────────────────────────────────────────────────
  const thac0 = useMemo(
    () => getBaseTHAC0(classGroup, charLevel),
    [classGroup, charLevel],
  );

  const muscleStats = useMemo(
    () => getMuscleStats(effSub("muscle"), exStrActive ? (exPcts?.muscle ?? 0) : 0),
    [effSub, exStrActive, exPcts],
  );

  const meleeAttAdj  = muscleStats.attAdj ?? 0;
  const meleeDmgAdj  = muscleStats.dmgAdj ?? 0;
  const missileAdj   = getAimStats(effSub("aim")).missileAdj ?? 0;
  const acAdj        = getBalanceStats(effSub("balance")).defAdj ?? 0;

  const thac0Melee   = thac0 - meleeAttAdj;
  const thac0Missile = thac0 - missileAdj;

  const isWarrior = classGroup === "warrior";

  // Picked traits
  const pickedTraits = useMemo(
    () => TRAITS.filter(t => traitsPicked?.[t.id]),
    [traitsPicked],
  );
  const pickedDisadvs = useMemo(
    () => DISADVANTAGES.filter(d => disadvPicked?.[d.id]),
    [disadvPicked],
  );

  // Picked NWPs
  const pickedNWPs = useMemo(
    () => ALL_NWP.filter(p => profsPicked?.[p.id]),
    [profsPicked],
  );

  // Picked weapons
  const profWeapons = useMemo(
    () => buildProfWeaponList(weapPicked),
    [weapPicked],
  );

  // Mastery entries
  const masteryEntries = useMemo(() => {
    if (!masteryPicked) return [];
    return Object.entries(masteryPicked)
      .filter(([, v]) => v?.tier)
      .map(([weapKey, v]) => {
        const tier = MASTERY_TIERS.find(t => t.id === v.tier);
        return { weapKey, tierLabel: tier?.label ?? v.tier, type: v.type };
      });
  }, [masteryPicked]);

  // Style entries
  const styleEntries = useMemo(() => {
    if (!stylePicked) return [];
    return Object.entries(stylePicked)
      .filter(([, level]) => level)
      .map(([styleId, level]) => {
        const spec = STYLE_SPECS.find(s => s.id === styleId);
        return { label: spec?.label ?? styleId, level };
      });
  }, [stylePicked]);

  // Thieving skills (only active ones)
  const thiefEntries = useMemo(() => {
    if (!selectedClass || !classAbilPicked) return [];
    const racialAdj = getThiefRacialAdj(selectedRace ?? "human");
    const armorAdj  = THIEF_ARMOR_ADJ[thiefArmorType ?? "padded_studded"] ?? {};
    const aimScore  = effSub("aim");
    const balScore  = effSub("balance");

    return THIEF_SKILLS.map(sk => {
      const classEntry = SKILL_CLASS_ABILS[sk.id]?.[selectedClass];
      if (!classEntry || !classAbilPicked[classEntry.abilId]) return null;
      const base   = classEntry.base ?? sk.base;
      const subAdj = classEntry.subStat !== undefined
        ? (classEntry.subStat ? getSkillSubAdj({ ...sk, subStat: classEntry.subStat }, aimScore, balScore) : 0)
        : getSkillSubAdj(sk, aimScore, balScore);
      const final = calcThiefSkill(sk.id, {
        base,
        racial: racialAdj,
        dex:    { [sk.id]: subAdj },
        armor:  armorAdj,
        disc:   thiefDiscPoints ?? {},
      });
      return { id: sk.id, label: sk.label, shortLabel: sk.shortLabel, final };
    }).filter(Boolean);
  }, [selectedClass, classAbilPicked, selectedRace, thiefArmorType, effSub, thiefDiscPoints]);

  // Social rank
  const rankVal = socialStatus?.override ?? socialStatus?.rolled ?? null;
  let socialRankLabel = null;
  if (rankVal !== null) {
    const tbl = getRankTable(activeKitObj?.name ?? activeKitObj?.id ?? null);
    const rankEntry = getSocialRank(rankVal, tbl);
    if (rankEntry) socialRankLabel = `${rankEntry.tier}: ${rankEntry.label}`;
  }

  return (
    <>
      {/* Screen overlay backdrop — screen only, hidden when closed */}
      {isOpen && <div className="ps-overlay" onClick={onClose} />}

      {/* Sheet container — hidden on screen when closed, always visible in print */}
      <div className={`ps-wrapper${isOpen ? "" : " ps-wrapper--hidden"}`} id="print-sheet">

        {/* ── Screen-only toolbar ─────────────────────────────────────── */}
        <div className="ps-toolbar no-print">
          <button className="ps-btn ps-btn--print" onClick={() => window.print()}>
            🖨 Print
          </button>
          <button className="ps-btn ps-btn--close" onClick={onClose}>
            ✕ Close
          </button>
        </div>

        {/* ══════════════════════════════════════════════════════════════
            PAGE 1 — Identity · Combat · Ability Scores · Weapons
            ══════════════════════════════════════════════════════════════ */}
        <div className="ps-page">

          {/* ── Title banner ──────────────────────────────────────────── */}
          <div className="ps-title-banner">
            <div className="ps-title-left">
              <div className="ps-char-name">{charName || "Unnamed Adventurer"}</div>
              <div className="ps-char-sub">
                {[
                  charGender,
                  raceData ? `${raceData.label}${subRaceData ? ` (${subRaceData.label})` : ""}` : null,
                  classData ? `${classData.label}${specialistSchool ? ` [${specialistSchool}]` : ""}` : null,
                  charLevel ? `Level ${charLevel}` : null,
                  activeKitObj ? `Kit: ${activeKitObj.name}` : null,
                ].filter(Boolean).join("  ·  ")}
              </div>
              <div className="ps-char-appearance">
                {[
                  charAge   ? `Age: ${charAge}`     : null,
                  charHairColor ? `Hair: ${charHairColor}` : null,
                  charEyeColor  ? `Eyes: ${charEyeColor}`  : null,
                  charDistinctiveFeatures ? charDistinctiveFeatures : null,
                ].filter(Boolean).join("   ")}
              </div>
            </div>
            {/* Portrait */}
            <div className="ps-portrait-box">
              {portraitUrl
                ? <img src={portraitUrl} alt="Portrait" className="ps-portrait-img" />
                : <div className="ps-portrait-placeholder">Portrait</div>
              }
            </div>
          </div>

          {/* ── Combat row ────────────────────────────────────────────── */}
          <SectionHead>Combat Statistics</SectionHead>
          <div className="ps-combat-row">
            <StatBox label="THAC0 (Base)"   value={thac0}         big />
            <StatBox label="THAC0 (Melee)"  value={thac0Melee}    big />
            <StatBox label="THAC0 (Missile)"value={thac0Missile}  big />
            <StatBox label="Melee Att Adj"  value={sgn(meleeAttAdj)} />
            <StatBox label="Melee Dmg Adj"  value={sgn(meleeDmgAdj)} />
            <StatBox label="AC Modifier"    value={sgn(acAdj)} />
            <div className="ps-combat-fields">
              <FillLine label="AC:" />
              <FillLine label="HP:" />
              <FillLine label="Max HP:" />
              <FillLine label="Init Adj:" value={sgn(getBalanceStats(effSub("balance")).reactAdj)} />
            </div>
          </div>

          {/* ── Ability scores ────────────────────────────────────────── */}
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
                  const bonus = subBonusSummary(
                    sub.id, score,
                    exPcts?.muscle,
                    isWarrior,
                  );
                  const exLabel = (sub.id === "muscle" && exStrActive)
                    ? ` (${getExStrLabel(exPcts?.muscle ?? 0)})` : "";
                  return (
                    <tr key={sub.id} className={si === 0 ? "ps-row-top" : ""}>
                      {si === 0 && (
                        <td className="ps-parent-cell" rowSpan={2}>
                          {stat}
                        </td>
                      )}
                      <td className="ps-sub-label">{sub.label}</td>
                      <td className="ps-score-col ps-score-val">
                        {score}{exLabel}
                      </td>
                      <td className="ps-bonus-cell">{bonus}</td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>

          {/* ── Weapon Proficiencies ──────────────────────────────────── */}
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

          {/* ── Mastery & Styles ──────────────────────────────────────── */}
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
                    <span className="ps-mastery-val">{m.tierLabel}{m.type ? ` (${m.type})` : ""}</span>
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
            PAGE 2 — NWP · Thieving · Traits · Disadvs · Status · Equipment
            ══════════════════════════════════════════════════════════════ */}
        <div className="ps-page ps-page--break">

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
                    const stat = p.stats?.[0] ?? null;
                    const score = stat ? effSub(stat) : null;
                    return (
                      <tr key={p.id}>
                        <td>{p.name}</td>
                        <td>{stat ?? "—"}</td>
                        <td className="ps-score-col">{score ?? "—"}</td>
                        <td>{p.cp}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          }

          {/* ── Thieving Skills ───────────────────────────────────────── */}
          {thiefEntries.length > 0 && (
            <>
              <SectionHead>Thieving Skills</SectionHead>
              <div className="ps-thief-grid">
                {thiefEntries.map(sk => (
                  <div key={sk.id} className="ps-thief-item">
                    <span className="ps-thief-label">{sk.label}</span>
                    <span className="ps-thief-val">{sk.final}%</span>
                  </div>
                ))}
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
                      const level = disadvPicked[d.id];
                      const subId = disadvSubChoice?.[d.id];
                      const subOpt = d.subOptions?.find(o => o.id === subId);
                      return (
                        <li key={d.id}>
                          <strong>{d.name}</strong>
                          {level === "severe" && " (Severe)"}
                          {subOpt && ` — ${subOpt.label}`}
                          <span className="ps-cp"> [{level === "severe" && d.cpSevere != null ? d.cpSevere : d.cp} CP]</span>
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
                <span className="ps-social-rank">{socialRankLabel ?? "—"}</span>
                {rankVal !== null && <span className="ps-social-roll">(Roll: {rankVal})</span>}
                {charAppearanceNotes && (
                  <span className="ps-social-notes">{charAppearanceNotes}</span>
                )}
              </div>
            </>
          )}

          {/* ── Equipment ─────────────────────────────────────────────── */}
          <SectionHead>Equipment &amp; Encumbrance</SectionHead>
          <div className="ps-equipment-block">
            {Array.from({ length: 14 }).map((_, i) => (
              <div key={i} className="ps-equipment-line">
                <span className="ps-eq-num">{i + 1}.</span>
                <span className="ps-eq-rule" />
                <span className="ps-eq-wt">____lb</span>
              </div>
            ))}
            <div className="ps-equip-totals">
              <FillLine label="Total Weight:" />
              <FillLine label="Max Carry:"
                value={`${getMuscleStats(effSub("muscle"), isWarrior ? (exPcts?.muscle ?? 0) : 0).maxPress} lbs`} />
              <FillLine label="Movement:" />
              <FillLine label="Coins (gp):" />
            </div>
          </div>

          {/* ── Spellbook ─────────────────────────────────────────────── */}
          {(classGroup === "wizard" || classGroup === "priest") && (
            <>
              <SectionHead>
                {classGroup === "wizard" ? "Spellbook" : "Spell Access"}
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

          {/* Footer */}
          <div className="ps-footer">
            AD&amp;D 2nd Edition · Skills &amp; Powers · {charName || "Character Sheet"}
            {charLevel ? ` · Level ${charLevel}` : ""}
          </div>
        </div>
      </div>
    </>
  );
}
