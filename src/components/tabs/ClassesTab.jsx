import { C, statColor } from "../../data/constants.js";
import { ALL_CLASSES, CLASS_GROUPS, CLASS_ABILITIES, WIZARD_SCHOOLS, RACE_CLASS_CAPS, CLASS_STAT_REQS, MAGE_SCHOOLS_8 } from "../../data/classes.js";

import { ChHead, TagBadge, StatPill, GroupLabel } from "../ui/index.js";

// ── Helper: get level cap for race+class (null=unlimited, undefined=forbidden)
function getRaceCap(classId, raceId) {
  if (!raceId) return null; // no race selected → no restriction
  const raceCaps = RACE_CLASS_CAPS[classId];
  if (!raceCaps) return undefined; // class not in table → forbidden
  if (!(raceId in raceCaps)) return undefined; // race not allowed
  return raceCaps[raceId]; // null = unlimited, number = cap
}

// ── Helper: get unmet stat requirements for a class
// Returns array of { id, min, have } for each failing requirement
function getClassStatFailures(classId, modParentFn) {
  const reqs = CLASS_STAT_REQS[classId] ?? [];
  return reqs
    .map(req => ({ ...req, have: modParentFn ? modParentFn(req.id) : 0 }))
    .filter(r => r.have < r.min);
}

// ── Build sphere groups from sphere abilities
// IDs look like "cl_all_maj" / "cl_all_min"
// We strip _maj/_min suffix to get the group key
function buildSphereGroups(spheres) {
  const groups = new Map();
  spheres.forEach(a => {
    const isMaj = a.id.endsWith("_maj");
    const isMin = a.id.endsWith("_min");
    if (!isMaj && !isMin) return;
    const key = a.id.replace(/_maj$/, "").replace(/_min$/, "");
    if (!groups.has(key)) {
      // strip "Sphere: " prefix and " (Major)"/" (Minor)" suffix for label
      const label = a.name
        .replace(/^Sphere:\s*/i, "")
        .replace(/\s*\((Major|Minor)\)\s*$/i, "")
        .trim();
      groups.set(key, { key, label, maj: null, min: null });
    }
    if (isMaj) groups.get(key).maj = a;
    else       groups.get(key).min = a;
  });
  return Array.from(groups.values());
}

export function ClassesTab(props) {
  const {
    selectedClass, selectedRace, charLevel,
    classData, classAbilPicked,  classAbilCPSpent,
    currentAbils, effSub, modParent, PARENT_STAT_LABELS,
    toggleClassAbil,
    specialistSchool, mageSchoolsPicked, extraOpposition,
    handleSpecialistSchool, toggleMageSchool, toggleExtraOpposition,
    ruleBreaker, setConfirmBox,
  } = props;

  const _getSpellPointBonus = props.getSpellPointBonus ?? (score => {
    if (score >= 18) return 7;
    if (score >= 17) return 6;
    if (score >= 16) return 5;
    if (score >= 15) return 4;
    if (score >= 14) return 3;
    if (score >= 12) return 2;
    if (score >=  9) return 2;
    return 0;
  });

  const _ALL_SUBS = props.ALL_SUBS ?? [];
  const _WARRIOR_CLASS_IDS = props.WARRIOR_CLASS_IDS ?? new Set(["fighter","ranger","paladin","barbarian","warrior"]);

  // ── Derived specialist state
  const specSchoolData   = specialistSchool ? WIZARD_SCHOOLS.find(s => s.id === specialistSchool) : null;
  const oppositionSet    = new Set([
    ...(specSchoolData?.opposition ?? []),
    ...extraOpposition,
  ]);

  return (
    <div>
      <ChHead icon="⚔️" num="Chapter 3" title="Class Selection"
        sub="Select your class. Warriors with Muscle 18 gain access to Exceptional Strength (18/xx) in Chapter 1." />

      {CLASS_GROUPS.map(grp => (
        <div key={grp.group} style={{ marginBottom: 26 }}>
          <GroupLabel>{grp.group}</GroupLabel>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))", gap: 13 }}>
            {grp.classes.map(cls => {
              const sel     = selectedClass === cls.id;
              const tCP     = cls.baseCp + cls.cpPerLevel * (charLevel - 1);
              const spSub   = cls.spStat ? _ALL_SUBS.find(s => s.id === cls.spStat) : null;
              const spVal   = cls.spStat ? _getSpellPointBonus(effSub(cls.spStat)) : 0;
              const spLabel = cls.spStat === "knowledge" ? "Mage SP" : cls.spStat === "willpower" ? "Cleric SP" : "SP";
              const isWarrior = _WARRIOR_CLASS_IDS.has(cls.id);

              // Race/class restriction
              const cap      = getRaceCap(cls.id, selectedRace);
              const raceForbidden = cap === undefined && !!selectedRace;
              const capLabel  = cap !== null && cap !== undefined ? `Max Lv ${cap}` : null;
              const forbidden = raceForbidden; // kept for compat

              // Stat requirement check
              const statFails = getClassStatFailures(cls.id, modParent);
              const statBlocked = statFails.length > 0 && !props.ruleBreaker; // blocked by unmet reqs
              const statWarn    = statFails.length > 0 && !!props.ruleBreaker; // warned (rulebreaker on)
              const statTooltip = statFails.length > 0
                ? "Requires: " + statFails.map(f => `${PARENT_STAT_LABELS?.[f.id] ?? f.id} ${f.min} (you have ${f.have})`).join(", ")
                : "";

              const effectivelyBlocked = raceForbidden || statBlocked;
              const cardBorderColor = sel ? C.gold
                : raceForbidden ? "#552222"
                : statBlocked   ? "#553322"
                : statWarn      ? "#7a5510"
                : C.border;

              return (
                <div key={cls.id}
                  onClick={() => !effectivelyBlocked && props.handleClassSelect(cls.id)}
                  title={statBlocked ? statTooltip : statWarn ? statTooltip : ""}
                  style={{
                    background: sel ? C.cardSel : C.card,
                    border: `2px solid ${cardBorderColor}`,
                    borderRadius: 10, padding: "15px 17px",
                    cursor: effectivelyBlocked ? "not-allowed" : "pointer",
                    transition: "all .18s",
                    opacity: effectivelyBlocked ? 0.45 : 1,
                    boxShadow: sel ? "0 0 20px rgba(212,160,53,.18)" : statWarn ? "0 0 8px rgba(200,120,20,.12)" : "none",
                  }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                    <span style={{ fontSize: 22 }}>{cls.icon}</span>
                    <span style={{ fontSize: 16, fontWeight: "bold",
                      color: sel ? C.gold : raceForbidden ? "#884444" : statBlocked ? "#8a5533" : C.textBri }}>
                      {cls.label}
                    </span>
                    {sel && !statWarn && <span style={{ fontSize: 10, color: C.green, marginLeft: "auto" }}>✓ SELECTED</span>}
                    {sel && statWarn && (
                      <span title={statTooltip} style={{ fontSize: 10, color: C.amber, marginLeft: "auto", cursor:"help" }}>
                        ⚠ REQ NOT MET
                      </span>
                    )}
                    {raceForbidden && <span style={{ fontSize: 10, color: "#cc4444", marginLeft: "auto" }}>✗ FORBIDDEN</span>}
                    {statBlocked && !raceForbidden && (
                      <span title={statTooltip} style={{ fontSize: 10, color: "#cc7744", marginLeft: "auto", cursor:"help" }}>
                        ✗ REQ NOT MET
                      </span>
                    )}
                    {!effectivelyBlocked && !statWarn && capLabel && !sel && (
                      <span style={{ fontSize: 10, color: C.amber, marginLeft: "auto" }}>{capLabel}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6, marginBottom: 10 }}>
                    {cls.desc}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    <StatPill label="Base CP" val={cls.baseCp} color={C.gold} />
                    <StatPill label={`+${cls.cpPerLevel}/lv`} val={`= ${tCP} at Lv${charLevel}`} color={C.amber} />
                    {spSub && (
                      <div style={{ display: "flex", flexDirection: "column",
                        textAlign: "center", minWidth: 70 }}>
                        <div style={{ fontSize: 15, fontWeight: "bold",
                          color: cls.spStat === "knowledge" ? C.purple : "#60c0a0", lineHeight: 1 }}>
                          +{spVal}
                        </div>
                        <div style={{ fontSize: 9, letterSpacing: 1.5,
                          color: (cls.spStat === "knowledge" ? C.purple : "#60c0a0") + "99",
                          textTransform: "uppercase", marginTop: 2 }}>
                          {spLabel} ({spSub.label})
                        </div>
                      </div>
                    )}
                    {isWarrior && <TagBadge color={C.amber}>18/xx eligible</TagBadge>}
                    {!raceForbidden && capLabel && sel && <TagBadge color={C.amber}>{capLabel}</TagBadge>}
                  </div>

                  {/* Stat requirement failures — shown inline in the card */}
                  {statFails.length > 0 && (
                    <div style={{ marginTop: 8, padding: "6px 10px",
                      background: statBlocked ? "rgba(180,80,40,.1)" : "rgba(200,120,20,.08)",
                      border: `1px solid ${statBlocked ? "rgba(200,80,40,.3)" : "rgba(200,140,20,.3)"}`,
                      borderRadius: 5 }}>
                      <div style={{ fontSize: 9, letterSpacing: 2,
                        textTransform: "uppercase", marginBottom: 4,
                        color: statBlocked ? "#cc6644" : C.amber }}>
                        {statBlocked ? "✗ Requirements not met" : "⚠ Requirements not met (Rule-Breaker active)"}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {statFails.map(f => (
                          <span key={f.id} style={{ fontSize: 10, padding: "1px 7px",
                            background: "rgba(0,0,0,.3)", borderRadius: 3,
                            color: statBlocked ? "#cc7755" : C.amber,
                            border: `1px solid ${statBlocked ? "rgba(180,80,40,.4)" : "rgba(180,140,20,.4)"}` }}>
                            {PARENT_STAT_LABELS?.[f.id] ?? f.id} {f.min} (have {f.have})
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Spell point breakdown */}
                  {sel && spSub && (
                    <div style={{ marginTop: 12, padding: "8px 12px",
                      background: "rgba(160,112,200,.08)",
                      border: "1px solid rgba(160,112,200,.25)", borderRadius: 7 }}>
                      <div style={{ fontSize: 10, color: C.purple, letterSpacing: 2,
                        textTransform: "uppercase", marginBottom: 6 }}>Spell Point Bonus</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 12, color: C.textDim }}>
                          {spSub.label}: <span style={{ color: statColor(effSub(cls.spStat)) }}>
                            {effSub(cls.spStat)}
                          </span>
                        </span>
                        <span style={{ color: C.textDim }}>→</span>
                        <span style={{ fontSize: 20, fontWeight: "bold", color: C.purple }}>+{spVal}</span>
                        <span style={{ fontSize: 11, color: C.purple }}>bonus spell points</span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ╔══════════════════════════════════════╗
          ║  CLASS ABILITIES BUILDER              ║
          ╚══════════════════════════════════════╝ */}
      {selectedClass && currentAbils.length > 0 && (() => {
        const totalPool = classData.baseCp + classData.cpPerLevel * (charLevel - 1);
        const remaining = totalPool - classAbilCPSpent;
        const overBudget = remaining < 0;
        const abils    = currentAbils.filter(a => !a.restriction && !a.sphere);
        const restrics = currentAbils.filter(a => a.restriction);
        const spheres  = currentAbils.filter(a => a.sphere);
        const sphereGroups = buildSphereGroups(spheres);

        return (
          <div style={{ marginTop: 28 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
              marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
              <div>
                <span style={{ fontSize: 13, color: C.gold, fontWeight: "bold",
                  letterSpacing: 2, textTransform: "uppercase" }}>
                  ✦ {classData.label} Class Abilities
                </span>
                <span style={{ fontSize: 11, color: C.textDim, marginLeft: 10 }}>(Chapter 4, S&P)</span>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <div style={{ fontSize: 12, color: C.textDim }}>CP pool:</div>
                <div style={{ fontSize: 18, fontWeight: "bold", color: C.gold }}>{totalPool}</div>
                <div style={{ fontSize: 14, color: C.textDim }}>−</div>
                <div style={{ fontSize: 18, fontWeight: "bold", color: overBudget ? C.red : C.green }}>{classAbilCPSpent}</div>
                <div style={{ fontSize: 14, color: C.textDim }}>=</div>
                <div style={{ fontSize: 20, fontWeight: "bold",
                  color: overBudget ? C.red : remaining === 0 ? C.green : C.amber }}>
                  {remaining} CP left
                </div>
                {overBudget && <span style={{ color: C.red, fontSize: 11 }}>⚠ Over budget!</span>}
              </div>
            </div>

            {/* CP bar */}
            <div style={{ height: 6, borderRadius: 3, background: "#1a1410",
              border: `1px solid ${C.border}`, marginBottom: 18, overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 3, transition: "width .3s",
                background: overBudget ? C.red : `linear-gradient(90deg, ${C.green}, ${C.amber})`,
                width: `${Math.min(100, (classAbilCPSpent / totalPool) * 100)}%` }} />
            </div>

            {/* ── Abilities */}
            {abils.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 3,
                  textTransform: "uppercase", marginBottom: 10 }}>Abilities</div>
                <div style={{ display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(320px,1fr))", gap: 8 }}>
                  {abils.map(a => {
                    const picked = !!classAbilPicked[a.id];
                    return (
                      <div key={a.id} onClick={() => toggleClassAbil(a.id)}
                        style={{
                          background: picked ? "linear-gradient(145deg,#1c1608,#141005)" : C.card,
                          border: `1px solid ${picked ? C.gold : C.border}`,
                          borderRadius: 8, padding: "10px 13px", cursor: "pointer",
                          transition: "all .15s",
                          boxShadow: picked ? `0 0 10px ${C.gold}22` : "none",
                        }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "flex-start", gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: "bold",
                              color: picked ? C.gold : C.textBri, marginBottom: 4 }}>
                              {picked ? "✓ " : ""}{a.name}
                            </div>
                            <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>
                              {a.desc}
                            </div>
                          </div>
                          <div style={{ flexShrink: 0, fontSize: 14, fontWeight: "bold",
                            color: picked ? C.gold : C.amber,
                            background: picked ? "rgba(212,160,53,.15)" : "rgba(212,160,53,.06)",
                            border: `1px solid ${picked ? C.gold + "66" : C.amber + "33"}`,
                            borderRadius: 6, padding: "2px 8px", whiteSpace: "nowrap" }}>
                            {a.cp} CP
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Spell Spheres — Major/Minor three-way toggle */}
            {sphereGroups.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: "#6080c0", letterSpacing: 3,
                  textTransform: "uppercase", marginBottom: 10 }}>Spell Spheres</div>
                <div style={{ display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 6 }}>
                  {sphereGroups.map(grp => {
                    const majPicked = grp.maj ? !!classAbilPicked[grp.maj.id] : false;
                    const minPicked = grp.min ? !!classAbilPicked[grp.min.id] : false;

                    // mode: "none" | "minor" | "major"
                    const mode = majPicked ? "major" : minPicked ? "minor" : "none";

                    const handleToggle = (target) => {
                      if (target === "major") {
                        // Deselect minor if active
                        if (minPicked && grp.min) toggleClassAbil(grp.min.id);
                        if (grp.maj) toggleClassAbil(grp.maj.id);
                      } else {
                        if (majPicked && grp.maj) toggleClassAbil(grp.maj.id);
                        if (grp.min) toggleClassAbil(grp.min.id);
                      }
                    };

                    return (
                      <div key={grp.key} style={{
                        background: mode !== "none"
                          ? "linear-gradient(145deg,#080e18,#060c14)" : C.card,
                        border: `1px solid ${mode === "major" ? "#6090d8" : mode === "minor" ? "#4070a0" : C.border}`,
                        borderRadius: 7, padding: "8px 12px",
                        transition: "all .15s",
                      }}>
                        <div style={{ display: "flex", justifyContent: "space-between",
                          alignItems: "center", gap: 8, marginBottom: 6 }}>
                          <div style={{ fontSize: 11, fontWeight: "bold",
                            color: mode !== "none" ? "#90b8f0" : C.textBri }}>
                            {grp.label}
                          </div>
                          <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                            {/* None */}
                            <button
                              onClick={() => {
                                if (majPicked && grp.maj) toggleClassAbil(grp.maj.id);
                                if (minPicked && grp.min) toggleClassAbil(grp.min.id);
                              }}
                              style={{
                                padding: "2px 7px", borderRadius: 4, fontSize: 10,
                                cursor: "pointer", fontFamily: "inherit",
                                background: mode === "none" ? "rgba(80,80,80,.4)" : "transparent",
                                color: mode === "none" ? C.text : C.textDim,
                                border: `1px solid ${mode === "none" ? "#666" : "#333"}`,
                                transition: "all .12s",
                              }}>None</button>
                            {/* Minor */}
                            {grp.min && (
                              <button
                                onClick={() => {
                                  if (mode === "minor") {
                                    toggleClassAbil(grp.min.id);
                                  } else {
                                    if (majPicked && grp.maj) toggleClassAbil(grp.maj.id);
                                    if (!minPicked) toggleClassAbil(grp.min.id);
                                  }
                                }}
                                style={{
                                  padding: "2px 7px", borderRadius: 4, fontSize: 10,
                                  cursor: "pointer", fontFamily: "inherit",
                                  background: mode === "minor" ? "rgba(50,80,140,.5)" : "transparent",
                                  color: mode === "minor" ? "#90b8f0" : C.textDim,
                                  border: `1px solid ${mode === "minor" ? "#4070a0" : "#333"}`,
                                  transition: "all .12s",
                                }}>
                                ○ Minor <span style={{ opacity: .7 }}>({grp.min.cp}cp)</span>
                              </button>
                            )}
                            {/* Major */}
                            {grp.maj && (
                              <button
                                onClick={() => {
                                  if (mode === "major") {
                                    toggleClassAbil(grp.maj.id);
                                  } else {
                                    if (minPicked && grp.min) toggleClassAbil(grp.min.id);
                                    if (!majPicked) toggleClassAbil(grp.maj.id);
                                  }
                                }}
                                style={{
                                  padding: "2px 7px", borderRadius: 4, fontSize: 10,
                                  cursor: "pointer", fontFamily: "inherit",
                                  background: mode === "major" ? "rgba(50,100,200,.5)" : "transparent",
                                  color: mode === "major" ? "#b0d0ff" : C.textDim,
                                  border: `1px solid ${mode === "major" ? "#6090d8" : "#333"}`,
                                  transition: "all .12s",
                                }}>
                                ● Major <span style={{ opacity: .7 }}>({grp.maj.cp}cp)</span>
                              </button>
                            )}
                          </div>
                        </div>
                        {mode !== "none" && (
                          <div style={{ fontSize: 10, color: "#6080a0" }}>
                            {mode === "major" ? grp.maj?.desc : grp.min?.desc}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Restrictions */}
            {restrics.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 10, color: "#b06030", letterSpacing: 3,
                  textTransform: "uppercase", marginBottom: 10 }}>Restrictions (grant bonus CP)</div>
                <div style={{ display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 6 }}>
                  {restrics.map(a => {
                    const picked = !!classAbilPicked[a.id];
                    return (
                      <div key={a.id}>
                        <div onClick={() => toggleClassAbil(a.id)}
                          style={{
                            background: picked ? "linear-gradient(145deg,#180c04,#100804)" : C.card,
                            border: `1px solid ${picked ? "#c06030" : C.border}`,
                            borderRadius: 7, padding: "8px 12px", cursor: "pointer",
                            transition: "all .15s",
                          }}>
                          <div style={{ display: "flex", justifyContent: "space-between",
                            alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: 11, fontWeight: "bold",
                                color: picked ? "#e08050" : "#a07050", marginBottom: 2 }}>
                                {picked ? "✓ " : ""}{a.name}
                              </div>
                              <div style={{ fontSize: 10, color: C.textDim, lineHeight: 1.4 }}>
                                {a.desc}
                              </div>
                            </div>
                            <div style={{ flexShrink: 0, fontSize: 12, fontWeight: "bold",
                              color: "#c07040",
                              background: "rgba(180,80,30,.1)",
                              border: "1px solid rgba(180,80,30,.3)",
                              borderRadius: 5, padding: "2px 7px" }}>
                              +{a.cp} CP
                            </div>
                          </div>
                        </div>
                        {/* Sub-selection for sw_r3: extra opposition school dropdown */}
                        {picked && a.subSelect === "school" && (
                          <div style={{ marginTop: 4, padding: "8px 10px",
                            background: "rgba(150,60,20,.08)",
                            border: "1px solid rgba(150,60,20,.25)", borderRadius: 6 }}>
                            <div style={{ fontSize: 9, color: "#c07040", letterSpacing: 2,
                              textTransform: "uppercase", marginBottom: 5 }}>
                              Choose additional opposition school:
                            </div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                              {WIZARD_SCHOOLS.filter(s =>
                                !specSchoolData?.opposition.includes(s.id) && s.id !== specialistSchool
                              ).map(s => {
                                const isChosen = extraOpposition.includes(s.id);
                                return (
                                  <button key={s.id}
                                    onClick={(e) => { e.stopPropagation(); toggleExtraOpposition(s.id); }}
                                    style={{
                                      padding: "3px 8px", borderRadius: 4, fontSize: 10,
                                      cursor: "pointer", fontFamily: "inherit",
                                      background: isChosen ? "rgba(200,80,30,.3)" : "transparent",
                                      color: isChosen ? "#f09060" : C.textDim,
                                      border: `1px solid ${isChosen ? "#c06030" : "#444"}`,
                                    }}>
                                    {isChosen ? "✓ " : ""}{s.name}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ── Specialist School selector — 3-section layout */}
            {selectedClass === "specialist" && (() => {
              // Helper: check if a school is accessible to current char
              const schoolAccessible = (s) => {
                const statVal = modParent ? modParent(s.minStat) : (effSub?.(s.minStat) ?? 10);
                const meetsMin = statVal >= s.minScore;
                const raceOk   = !selectedRace || s.allowedRaces.includes(selectedRace);
                return meetsMin && raceOk;
              };

              const specSel = WIZARD_SCHOOLS.find(s => s.id === specialistSchool);
              // Opposition = school's own list + extra opposition
              const fullOpposition = new Set([
                ...(specSel?.opposition ?? []),
                ...extraOpposition,
              ]);

              // School card for picker
              const SchoolCard = ({ s, onPick, section }) => {
                const statVal  = modParent ? modParent(s.minStat) : 10;
                const meetsMin = statVal >= s.minScore;
                const raceOk   = !selectedRace || s.allowedRaces.includes(selectedRace);
                const avail    = meetsMin && raceOk;
                const statName = (PARENT_STAT_LABELS?.[s.minStat] ?? s.minStat);

                if (section === "yours") {
                  return (
                    <div style={{
                      background:"linear-gradient(145deg,#1e1808,#18140a)",
                      border:`2px solid ${C.gold}`,
                      borderRadius:10, padding:"12px 16px",
                      boxShadow:`0 0 20px ${C.gold}22`,
                    }}>
                      <div style={{ fontSize:13, fontWeight:"bold", color:C.gold, marginBottom:4 }}>
                        ★ {s.name}
                      </div>
                      <div style={{ fontSize:11, color:C.textDim, marginBottom:6 }}>
                        Min {statName} {s.minScore} ·{" "}
                        <span style={{ color: meetsMin ? C.green : C.amber }}>
                          {meetsMin ? `✓ ${statVal}` : `⚠ ${statVal} (rulebreaker active)`}
                        </span>
                        {" · Races: "}{s.allowedRaces.join(", ")}
                      </div>
                      <div style={{ fontSize:11, color:"#8060c0" }}>
                        Opposition: {s.opposition.length > 0 ? s.opposition.join(", ") : "none"}
                      </div>
                      <button onClick={() => handleSpecialistSchool(s.id)}
                        style={{ marginTop:8, padding:"3px 10px", borderRadius:4, fontSize:10,
                          cursor:"pointer", fontFamily:"inherit",
                          background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                          color:C.textDim }}>
                        Change School
                      </button>
                    </div>
                  );
                }
                if (section === "accessible") {
                  return (
                    <div style={{
                      background:"linear-gradient(145deg,#091208,#070e06)",
                      border:`1px solid #3a6a30`,
                      borderRadius:7, padding:"7px 11px",
                    }}>
                      <div style={{ fontSize:11, color:"#80c070", fontWeight:"bold" }}>
                        ✓ {s.name}
                      </div>
                      <div style={{ fontSize:9, color:"#507050" }}>
                        Min {statName} {s.minScore} · {statVal}
                      </div>
                    </div>
                  );
                }
                if (section === "opposition") {
                  return (
                    <div style={{
                      background:"linear-gradient(145deg,#140808,#0e0606)",
                      border:`1px solid #6a2a2a`,
                      borderRadius:7, padding:"7px 11px",
                      opacity:0.7,
                    }}>
                      <div style={{ fontSize:11, color:"#c07070", fontWeight:"bold" }}>
                        ❌ {s.name}
                      </div>
                      <div style={{ fontSize:9, color:"#704040" }}>Forbidden</div>
                    </div>
                  );
                }
                // Picker card
                const blocked = !avail && !ruleBreaker;
                return (
                  <div onClick={() => {
                    if (avail) {
                      handleSpecialistSchool(s.id);
                    } else if (ruleBreaker) {
                      handleSpecialistSchool(s.id);
                    } else {
                      setConfirmBox?.({
                        msg: `"${s.name}" requires ${statName} ${s.minScore}${!raceOk ? ` and is not available to ${selectedRace}` : ""}.`
                          + `\n\nYou have ${statName} ${statVal}. Enable Rule-Breaker to allow this?`,
                        onConfirm: () => handleSpecialistSchool(s.id),
                      });
                    }
                  }}
                  style={{
                    background: C.card,
                    border:`1px solid ${avail ? C.border : "#553322"}`,
                    borderRadius:7, padding:"8px 11px",
                    cursor: "pointer", opacity: blocked ? 0.5 : 1,
                    transition:"all .13s",
                  }}>
                    <div style={{ fontSize:11, fontWeight:"bold",
                      color: avail ? C.textBri : "#c08060", marginBottom:3 }}>
                      {!avail && "⚠ "}{s.name}
                    </div>
                    <div style={{ fontSize:9, color: meetsMin ? C.textDim : C.amber }}>
                      {statName} {s.minScore} · have {statVal}{!meetsMin ? " ✗" : " ✓"}
                    </div>
                    {!raceOk && (
                      <div style={{ fontSize:9, color:C.red }}>
                        Not available to {selectedRace}
                      </div>
                    )}
                  </div>
                );
              };

              return (
                <div style={{ marginBottom:18 }}>
                  <div style={{ fontSize:10, color:C.purple, letterSpacing:3,
                    textTransform:"uppercase", marginBottom:10 }}>Specialist School</div>

                  {/* ── No school chosen: show picker */}
                  {!specialistSchool && (
                    <>
                      <div style={{ fontSize:11, color:C.textDim, marginBottom:10 }}>
                        Select your school of specialization:
                      </div>
                      <div style={{ display:"grid",
                        gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:6 }}>
                        {WIZARD_SCHOOLS.map(s => (
                          <SchoolCard key={s.id} s={s} section="picker" />
                        ))}
                      </div>
                    </>
                  )}

                  {/* ── School chosen: 3-section layout */}
                  {specSel && (
                    <>
                      {/* Section 1: YOUR SCHOOL */}
                      <div style={{ marginBottom:16 }}>
                        <SchoolCard s={specSel} section="yours" />
                      </div>

                      {/* Section 2: ACCESSIBLE SCHOOLS */}
                      <div style={{ marginBottom:12 }}>
                        <div style={{ fontSize:9, color:"#507050", letterSpacing:2,
                          textTransform:"uppercase", marginBottom:6 }}>
                          ✓ Accessible Schools (auto-granted)
                        </div>
                        <div style={{ display:"grid",
                          gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:5 }}>
                          {WIZARD_SCHOOLS
                            .filter(s => s.id !== specSel.id && !fullOpposition.has(s.id))
                            .map(s => <SchoolCard key={s.id} s={s} section="accessible" />)
                          }
                        </div>
                      </div>

                      {/* Section 3: OPPOSITION SCHOOLS */}
                      {fullOpposition.size > 0 && (
                        <div>
                          <div style={{ fontSize:9, color:"#704040", letterSpacing:2,
                            textTransform:"uppercase", marginBottom:6 }}>
                            ❌ Opposition Schools (forbidden)
                          </div>
                          <div style={{ display:"grid",
                            gridTemplateColumns:"repeat(auto-fill,minmax(180px,1fr))", gap:5 }}>
                            {WIZARD_SCHOOLS
                              .filter(s => fullOpposition.has(s.id))
                              .map(s => <SchoolCard key={s.id} s={s} section="opposition" />)
                            }
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            {/* ── Mage school access (5 CP per school, S&P p.163) */}
            {selectedClass === "mage" && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
                  <div style={{ fontSize: 10, color: C.purple, letterSpacing: 3,
                    textTransform: "uppercase" }}>School Access</div>
                  {!classAbilPicked["mg00"] && (
                    <div style={{ fontSize:10, color:C.textDim }}>
                      5 CP per school ·{" "}
                      <span style={{ color:C.gold }}>
                        {Object.values(mageSchoolsPicked).filter(Boolean).length} selected
                        = {Object.values(mageSchoolsPicked).filter(Boolean).length * 5} CP
                      </span>
                    </div>
                  )}
                  {classAbilPicked["mg00"] && (
                    <div style={{ fontSize:10, color:C.green }}>
                      ✓ All 8 Schools bundle purchased (40 CP) — individual picks free
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 11, color: C.textDim, marginBottom: 10 }}>
                  Each of the 8 standard schools costs 5 CP (S&P p.163). Or buy the "All 8 Schools (bundle)" ability above for 40 CP.
                  Generalist Mages access all 8 standard PHB schools — Alchemy, Geometry, Shadow &amp; Song are specialist-only.
                </div>
                <div style={{ display: "grid",
                  gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))", gap: 6 }}>
                  {WIZARD_SCHOOLS.filter(s => MAGE_SCHOOLS_8.has(s.id)).map(s => {
                    const picked   = !!mageSchoolsPicked[s.id];
                    const statVal  = modParent ? modParent(s.minStat) : 10;
                    const statName = (PARENT_STAT_LABELS?.[s.minStat] ?? s.minStat);
                    return (
                      <div key={s.id}
                        onClick={() => toggleMageSchool(s.id)}
                        style={{
                          background: picked
                            ? "linear-gradient(145deg,#110820,#0c0618)"
                            : C.card,
                          border: `1px solid ${picked ? "#7050a8" : C.border}`,
                          borderRadius: 7, padding: "8px 11px",
                          cursor: "pointer", transition: "all .13s",
                          boxShadow: picked ? `0 0 8px rgba(160,112,200,.12)` : "none",
                        }}>
                        <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:3 }}>
                          <div style={{
                            width:13, height:13, borderRadius:3, flexShrink:0,
                            border:`2px solid ${picked ? C.purple : "#5a4070"}`,
                            background: picked ? C.purple : "transparent",
                            display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:8, color:"#fff", fontWeight:"bold",
                          }}>{picked ? "✓" : ""}</div>
                          <span style={{ flex:1, fontSize:11, fontWeight:"bold",
                            color: picked ? "#c0a0f0" : C.textBri }}>
                            {s.name}
                          </span>
                          {!classAbilPicked["mg00"] && (
                            <span style={{ fontSize:9, color: picked ? C.purple : C.textDim,
                              border:`1px solid ${picked ? C.purple : C.border}`,
                              borderRadius:3, padding:"1px 5px" }}>
                              {picked ? "−5 CP" : "5 CP"}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:9, color: C.textDim, paddingLeft:20 }}>
                          Min {statName} {s.minScore} · have{" "}
                          <span style={{ color: statVal >= s.minScore ? C.green : C.amber }}>
                            {statVal}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Picked summary */}
            {Object.values(classAbilPicked).some(Boolean) && (
              <div style={{ marginTop: 16, padding: "10px 16px",
                background: "rgba(212,160,53,.05)",
                border: `1px solid ${C.gold}33`, borderRadius: 8 }}>
                <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2,
                  textTransform: "uppercase", marginBottom: 6 }}>Selected</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {currentAbils.filter(a => classAbilPicked[a.id]).map(a => (
                    <span key={a.id} style={{ fontSize: 10, padding: "2px 8px",
                      borderRadius: 4,
                      background: a.restriction
                        ? "rgba(180,80,30,.15)"
                        : a.sphere ? "rgba(80,130,220,.15)" : "rgba(212,160,53,.12)",
                      border: `1px solid ${a.restriction ? "#c06030" : a.sphere ? "#6090d8" : C.gold}44`,
                      color: a.restriction ? "#e08050" : a.sphere ? "#90b8f0" : C.gold,
                    }}>
                      {a.name} ({a.restriction ? "+" : ""}{a.cp}cp)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}
    </div>
  );
}
