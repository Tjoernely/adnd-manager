import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { ALL_CLASSES, CLASS_GROUPS, CLASS_ABILITIES } from "../../data/classes.js";

import { ChHead, TagBadge, StatPill, GroupLabel } from "../ui/index.js";

export function ClassesTab(props) {
  const {
    selectedClass, charLevel,
    classData, classAbilPicked, classAbilCPSpent,
    currentAbils, effSub, spellPointBonus,
    ruleBreaker, setInfoModal,
    handleClassSelect, toggleClassAbil,
    ALL_SUBS, WARRIOR_CLASS_IDS,
    getSpellPointBonus,
  } = props;

  // Fallback for WARRIOR_CLASS_IDS if not in props
  const _WARRIOR_CLASS_IDS = props.WARRIOR_CLASS_IDS ?? new Set(["fighter","ranger","paladin","barbarian","warrior"]);

  // getSpellPointBonus may not be in props
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

  return (
    <div>
      <ChHead icon="⚔️" num="Chapter 3" title="Class Selection"
        sub="Select your class to establish the CP pool and spell-point system. Warriors with Muscle 18 gain access to Exceptional Strength (18/xx) in Chapter 1." />

      {CLASS_GROUPS.map(grp=>(
        <div key={grp.group} style={{ marginBottom:26 }}>
          <GroupLabel>{grp.group}</GroupLabel>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:13 }}>
            {grp.classes.map(cls=>{
              const sel   = selectedClass === cls.id;
              const tCP   = cls.baseCp + cls.cpPerLevel * (charLevel - 1);
              const spSub = cls.spStat ? _ALL_SUBS.find(s=>s.id===cls.spStat) : null;
              const spStat2 = cls.spStat;
              const spVal = spStat2 ? _getSpellPointBonus(effSub(spStat2)) : 0;
              const spPoolLabel = spStat2 === "reason" ? "Mage SP" : spStat2 === "willpower" ? "Cleric SP" : "SP";
              const isWarrior = _WARRIOR_CLASS_IDS.has(cls.id);

              return (
                <div key={cls.id} onClick={()=>handleClassSelect(cls.id)} style={{
                  background:sel?C.cardSel:C.card,
                  border:`2px solid ${sel?C.gold:C.border}`,
                  borderRadius:10, padding:"15px 17px", cursor:"pointer",
                  transition:"all .18s",
                  boxShadow:sel?"0 0 20px rgba(212,160,53,.18)":"none",
                }}>
                  <div style={{ display:"flex", gap:10, alignItems:"center", marginBottom:8 }}>
                    <span style={{ fontSize:22 }}>{cls.icon}</span>
                    <span style={{ fontSize:16, fontWeight:"bold",
                      color:sel?C.gold:C.textBri }}>{cls.label}</span>
                    {sel && <span style={{ fontSize:10, color:C.green, marginLeft:"auto" }}>✓ SELECTED</span>}
                  </div>
                  <div style={{ fontSize:12, color:C.textDim, lineHeight:1.6, marginBottom:10 }}>
                    {cls.desc}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    <StatPill label="Base CP" val={cls.baseCp} color={C.gold} />
                    <StatPill label={`+${cls.cpPerLevel}/lv`} val={`= ${tCP} at Lv${charLevel}`} color={C.amber} />
                    {spSub && (
                      <div style={{ display:"flex", flexDirection:"column",
                        textAlign:"center", minWidth:70 }}>
                        <div style={{ fontSize:15, fontWeight:"bold",
                          color:spStat2==="knowledge"?C.purple:"#60c0a0", lineHeight:1 }}>
                          +{spVal}
                        </div>
                        <div style={{ fontSize:9, letterSpacing:1.5,
                          color:(spStat2==="knowledge"?C.purple:"#60c0a0")+"99",
                          textTransform:"uppercase", marginTop:2 }}>
                          {spPoolLabel} ({spSub.label})
                        </div>
                      </div>
                    )}
                    {isWarrior && (
                      <TagBadge color={C.amber}>18/xx eligible</TagBadge>
                    )}
                  </div>

                  {/* Spell point breakdown when selected and relevant */}
                  {sel && spSub && (
                    <div style={{ marginTop:12, padding:"8px 12px",
                      background:"rgba(160,112,200,.08)",
                      border:`1px solid rgba(160,112,200,.25)`, borderRadius:7 }}>
                      <div style={{ fontSize:10, color:C.purple, letterSpacing:2,
                        textTransform:"uppercase", marginBottom:6 }}>Spell Point Bonus</div>
                      <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                        <span style={{ fontSize:12, color:C.textDim }}>
                          {spSub.label}: <span style={{ color:statColor(effSub(cls.spStat)) }}>
                            {effSub(cls.spStat)}
                          </span>
                        </span>
                        <span style={{ color:C.textDim }}>→</span>
                        <span style={{ fontSize:20, fontWeight:"bold", color:C.purple }}>+{spVal}</span>
                        <span style={{ fontSize:11, color:C.purple }}>bonus spell points</span>
                      </div>
                      <div style={{ marginTop:6, display:"flex", gap:6, flexWrap:"wrap" }}>
                        {[
                          { l:"9–11", v:2 }, { l:"12–13", v:3 }, { l:"14–15", v:4 },
                          { l:"16",   v:5 }, { l:"17",    v:6 }, { l:"18+",   v:7 },
                        ].map(row=>(
                          <div key={row.l} style={{ fontSize:10, padding:"1px 6px",
                            borderRadius:4, background:"rgba(160,112,200,.08)",
                            border:`1px solid rgba(160,112,200,.2)`,
                            color: spVal===row.v ? C.purple : C.textDim }}>
                            {row.l}: +{row.v}
                          </div>
                        ))}
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
        return (
          <div style={{ marginTop:28 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
              marginBottom:14, flexWrap:"wrap", gap:10 }}>
              <div>
                <span style={{ fontSize:13, color:C.gold, fontWeight:"bold",
                  letterSpacing:2, textTransform:"uppercase" }}>
                  ✦ {classData.label} Class Abilities
                </span>
                <span style={{ fontSize:11, color:C.textDim, marginLeft:10 }}>
                  (Chapter 4, S&P)
                </span>
              </div>
              <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ fontSize:12, color:C.textDim }}>CP pool:</div>
                <div style={{ fontSize:18, fontWeight:"bold", color:C.gold }}>{totalPool}</div>
                <div style={{ fontSize:14, color:C.textDim }}>−</div>
                <div style={{ fontSize:18, fontWeight:"bold", color: overBudget ? C.red : C.green }}>{classAbilCPSpent}</div>
                <div style={{ fontSize:14, color:C.textDim }}>=</div>
                <div style={{ fontSize:20, fontWeight:"bold",
                  color: overBudget ? C.red : remaining === 0 ? C.green : C.amber }}>
                  {remaining} CP left
                </div>
                {overBudget && <span style={{ color:C.red, fontSize:11 }}>⚠ Over budget!</span>}
              </div>
            </div>

            {/* CP bar */}
            <div style={{ height:6, borderRadius:3, background:"#1a1410",
              border:`1px solid ${C.border}`, marginBottom:18, overflow:"hidden" }}>
              <div style={{ height:"100%", borderRadius:3, transition:"width .3s",
                background: overBudget ? C.red : `linear-gradient(90deg, ${C.green}, ${C.amber})`,
                width:`${Math.min(100, (classAbilCPSpent/totalPool)*100)}%` }} />
            </div>

            {/* Abilities */}
            {abils.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:10, color:C.textDim, letterSpacing:3,
                  textTransform:"uppercase", marginBottom:10 }}>Abilities</div>
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:8 }}>
                  {abils.map(a => {
                    const picked = !!classAbilPicked[a.id];
                    return (
                      <div key={a.id} onClick={() => toggleClassAbil(a.id)}
                        style={{ background: picked
                          ? "linear-gradient(145deg,#1c1608,#141005)"
                          : C.card,
                          border:`1px solid ${picked ? C.gold : C.border}`,
                          borderRadius:8, padding:"10px 13px", cursor:"pointer",
                          transition:"all .15s",
                          boxShadow: picked ? `0 0 10px ${C.gold}22` : "none",
                        }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"flex-start", gap:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:"bold",
                              color: picked ? C.gold : C.textBri, marginBottom:4 }}>
                              {picked ? "✓ " : ""}{a.name}
                            </div>
                            <div style={{ fontSize:11, color:C.textDim, lineHeight:1.5 }}>
                              {a.desc}
                            </div>
                          </div>
                          <div style={{ flexShrink:0, fontSize:14, fontWeight:"bold",
                            color: picked ? C.gold : C.amber,
                            background: picked ? "rgba(212,160,53,.15)" : "rgba(212,160,53,.06)",
                            border:`1px solid ${picked ? C.gold+"66" : C.amber+"33"}`,
                            borderRadius:6, padding:"2px 8px", whiteSpace:"nowrap" }}>
                            {a.cp} CP
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Spheres (cleric/druid) */}
            {spheres.length > 0 && (
              <div style={{ marginBottom:18 }}>
                <div style={{ fontSize:10, color:"#6080c0", letterSpacing:3,
                  textTransform:"uppercase", marginBottom:10 }}>Spell Spheres</div>
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))", gap:6 }}>
                  {spheres.map(a => {
                    const picked = !!classAbilPicked[a.id];
                    return (
                      <div key={a.id} onClick={() => toggleClassAbil(a.id)}
                        style={{ background: picked
                          ? "linear-gradient(145deg,#080e18,#060c14)"
                          : C.card,
                          border:`1px solid ${picked ? "#6090d8" : C.border}`,
                          borderRadius:7, padding:"8px 12px", cursor:"pointer",
                          transition:"all .15s",
                          boxShadow: picked ? "0 0 8px rgba(80,130,220,.2)" : "none",
                        }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", gap:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:11, fontWeight:"bold",
                              color: picked ? "#90b8f0" : C.textBri, marginBottom:2 }}>
                              {picked ? "✓ " : ""}{a.name}
                            </div>
                            <div style={{ fontSize:10, color:C.textDim, lineHeight:1.4 }}>
                              {a.desc}
                            </div>
                          </div>
                          <div style={{ flexShrink:0, fontSize:12, fontWeight:"bold",
                            color: picked ? "#90b8f0" : C.blue,
                            background: picked ? "rgba(80,130,220,.15)" : "rgba(80,130,220,.06)",
                            border:`1px solid ${picked ? "#6090d866" : "#4070a033"}`,
                            borderRadius:5, padding:"2px 7px" }}>
                            {a.cp} CP
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Restrictions */}
            {restrics.length > 0 && (
              <div>
                <div style={{ fontSize:10, color:"#b06030", letterSpacing:3,
                  textTransform:"uppercase", marginBottom:10 }}>Restrictions (grant bonus CP)</div>
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:6 }}>
                  {restrics.map(a => {
                    const picked = !!classAbilPicked[a.id];
                    return (
                      <div key={a.id} onClick={() => toggleClassAbil(a.id)}
                        style={{ background: picked
                          ? "linear-gradient(145deg,#180c04,#100804)"
                          : C.card,
                          border:`1px solid ${picked ? "#c06030" : C.border}`,
                          borderRadius:7, padding:"8px 12px", cursor:"pointer",
                          transition:"all .15s",
                        }}>
                        <div style={{ display:"flex", justifyContent:"space-between",
                          alignItems:"center", gap:8 }}>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:11, fontWeight:"bold",
                              color: picked ? "#e08050" : "#a07050", marginBottom:2 }}>
                              {picked ? "✓ " : ""}{a.name}
                            </div>
                            <div style={{ fontSize:10, color:C.textDim, lineHeight:1.4 }}>
                              {a.desc}
                            </div>
                          </div>
                          <div style={{ flexShrink:0, fontSize:12, fontWeight:"bold",
                            color: "#c07040",
                            background:"rgba(180,80,30,.1)",
                            border:"1px solid rgba(180,80,30,.3)",
                            borderRadius:5, padding:"2px 7px" }}>
                            +{a.cp} CP
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Picked summary */}
            {Object.values(classAbilPicked).some(Boolean) && (
              <div style={{ marginTop:16, padding:"10px 16px",
                background:"rgba(212,160,53,.05)",
                border:`1px solid ${C.gold}33`, borderRadius:8 }}>
                <div style={{ fontSize:10, color:C.gold, letterSpacing:2,
                  textTransform:"uppercase", marginBottom:6 }}>Selected</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {currentAbils.filter(a => classAbilPicked[a.id]).map(a => (
                    <span key={a.id} style={{ fontSize:10, padding:"2px 8px",
                      borderRadius:4,
                      background: a.restriction ? "rgba(180,80,30,.15)" : a.sphere ? "rgba(80,130,220,.15)" : "rgba(212,160,53,.12)",
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
