import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { PARENT_STATS, SUB_ABILITIES, PARENT_STAT_LABELS, SPLIT_PAIRS, MAX_SPLIT, getT44Mod, getSubStats, getExStrLabel } from "../../data/abilities.js";

import { ChHead, IBtn, TagBadge, StatPill, SplitBtn, SubStatChip } from "../ui/index.js";

export function ScoresTab(props) {
  const {
    baseScores, rollResults, rollAnim,
    activeRaceStatMods, modParent, effSub, splitMods,
    exPcts, setExPcts, exStrActive, showExStr,
    muscleStats, spellPointBonus, classData,
    ruleBreaker, setInfoModal,
    rollStat, rollAll, setBase, adjustSplit, rollD100,
    racialSubDeltas,
    getKnowledgeCP,
  } = props;

  // getKnowledgeCP may not be in props, compute locally if needed
  const _getKnowledgeCP = props.getKnowledgeCP ?? (score => {
    const TABLE_10 = [
      { max:  8, cp:  1 }, { max: 11, cp:  2 }, { max: 13, cp:  3 },
      { max: 15, cp:  4 }, { max: 16, cp:  5 }, { max: 17, cp:  6 },
      { max: 18, cp:  7 }, { max: 19, cp:  8 }, { max: 20, cp:  9 },
      { max: 21, cp: 10 }, { max: 22, cp: 11 }, { max: 23, cp: 12 },
      { max: 24, cp: 15 }, { max: 99, cp: 20 },
    ];
    return TABLE_10.find(r => score <= r.max)?.cp ?? 1;
  });

  return (
    <div>
      <ChHead icon="🎲" num="Chapter 1" title="Ability Scores"
        sub="Enter your rolled Base Score (3–18). The app applies racial base modifiers, then calculates sub-abilities. Use ±split controls to shift up to ±2 between each paired sub-ability." />

      {/* Roll All button */}
      <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:12 }}>
        <button onClick={rollAll} style={{
          background:"linear-gradient(135deg,#1a2e0a,#0f1c06)",
          border:"2px solid #4a7a2a", borderRadius:10,
          padding:"8px 20px", cursor:"pointer", fontFamily:"inherit",
          color:"#a0d060", fontSize:13, fontWeight:"bold",
          display:"flex", alignItems:"center", gap:8, transition:"all .18s",
          boxShadow:"0 0 12px rgba(80,160,40,.2)",
        }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#6aaa3a";e.currentTarget.style.boxShadow="0 0 18px rgba(80,160,40,.4)";}}
          onMouseLeave={e=>{e.currentTarget.style.borderColor="#4a7a2a";e.currentTarget.style.boxShadow="0 0 12px rgba(80,160,40,.2)";}}>
          🎲 Roll All Stats <span style={{ fontSize:10, color:"#607a40" }}>(4d6 drop lowest)</span>
        </button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(340px,1fr))", gap:18 }}>
        {PARENT_STATS.map(stat => {
          const base    = baseScores[stat] ?? 10;
          const racMod  = activeRaceStatMods[stat] ?? 0;
          const modded  = modParent(stat);
          const subs    = SUB_ABILITIES[stat];
          const overBase = base > 18;
          const dice    = rollResults[stat];
          const isRolling = rollAnim[stat];

          return (
            <div key={stat} style={{ background:C.card,
              border:`1px solid ${C.border}`, borderRadius:10, padding:18,
              boxShadow:"0 4px 20px rgba(0,0,0,.45)" }}>

              {/* Stat header */}
              <div style={{ display:"flex", justifyContent:"space-between",
                alignItems:"center", marginBottom:14,
                borderBottom:`1px solid ${C.border}`, paddingBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, letterSpacing:4, color:C.textDim,
                    textTransform:"uppercase" }}>{stat}</span>
                  <span style={{ fontSize:14, color:C.textBri }}>
                    {PARENT_STAT_LABELS[stat]}
                  </span>
                  {/* Show 18/xx badge in header when applicable */}
                  {stat === "STR" && modded === 18 && (
                    <span style={{ fontSize:11, color:C.amber, fontWeight:"bold",
                      background:"rgba(212,160,53,.12)", border:`1px solid ${C.amber}55`,
                      borderRadius:4, padding:"1px 6px" }}>
                      18/{exPcts.muscle <= 9 ? "0"+exPcts.muscle : exPcts.muscle}
                      {exStrActive ? " " + getExStrLabel(exPcts.muscle) : ""}
                    </span>
                  )}
                  {stat === "CON" && modded === 18 && (
                    <span style={{ fontSize:11, color:"#80c0d0", fontWeight:"bold",
                      background:"rgba(80,160,200,.12)", border:"1px solid rgba(80,160,200,.3)",
                      borderRadius:4, padding:"1px 6px" }}>
                      18/{exPcts.stamina <= 9 ? "0"+exPcts.stamina : exPcts.stamina}
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  {/* Roll button */}
                  <button onClick={() => rollStat(stat)} style={{
                    background:"rgba(74,122,42,.15)", border:"1px solid #4a7a2a55",
                    borderRadius:6, padding:"3px 8px", cursor:"pointer",
                    color:"#80b050", fontSize:11, fontFamily:"inherit",
                    transition:"all .15s",
                  }}
                    onMouseEnter={e=>{e.currentTarget.style.borderColor="#6aaa3a";e.currentTarget.style.background="rgba(74,122,42,.3)";}}
                    onMouseLeave={e=>{e.currentTarget.style.borderColor="#4a7a2a55";e.currentTarget.style.background="rgba(74,122,42,.15)";}}>
                    🎲
                  </button>
                  {/* Base score input */}
                  <div style={{ textAlign:"center" }}>
                    <div style={{ fontSize:9, color:C.textDim, letterSpacing:2,
                      textTransform:"uppercase", marginBottom:2 }}>Base</div>
                    <input type="number" min={1} max={25} value={base}
                      onChange={e=>setBase(stat, e.target.value)}
                      style={{ width:50, textAlign:"center",
                        background:overBase?"rgba(200,40,40,.15)":"#0a0703",
                        border:`1px solid ${overBase?C.red:statColor(base)+"55"}`,
                        borderRadius:6, color:overBase?C.redBri:statColor(base),
                        fontSize:20, fontWeight:"bold", fontFamily:"inherit",
                        padding:"3px 0",
                        boxShadow:overBase?`0 0 12px ${C.red}33`:`0 0 8px ${statColor(base)}1a`,
                      }} />
                    {overBase && (
                      <div style={{ fontSize:9, color:C.red, marginTop:2,
                        fontWeight:"bold", letterSpacing:1 }}>RULE-BRK</div>
                    )}
                  </div>
                  {racMod !== 0 && <>
                    <span style={{ color:C.textDim, fontSize:18 }}>→</span>
                    <div style={{ textAlign:"center" }}>
                      <div style={{ fontSize:9, color:C.textDim, letterSpacing:1,
                        textTransform:"uppercase", marginBottom:2 }}>
                        {racMod>0?`+${racMod}`:racMod}
                      </div>
                      <div style={{ fontSize:20, fontWeight:"bold",
                        color:statColor(modded) }}>{modded}</div>
                    </div>
                  </>}
                </div>
              </div>

              {/* Dice roll result */}
              {dice && (
                <div style={{ marginTop:8, display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:10, color:C.textDim }}>Last roll:</span>
                  {dice.map((d, i) => {
                    const sorted = [...dice].sort((a,b)=>a-b);
                    const isDropped = i === dice.indexOf(sorted[0]) && dice.filter(x=>x===sorted[0]).length >= (dice.filter(x=>x===sorted[0]).length);
                    // mark the lowest die (first occurrence of min)
                    const minVal = Math.min(...dice);
                    const minIdx = dice.indexOf(minVal);
                    const dropped = i === minIdx;
                    return (
                      <span key={i} style={{
                        display:"inline-flex", alignItems:"center", justifyContent:"center",
                        width:24, height:24, borderRadius:5, fontSize:12, fontWeight:"bold",
                        background: dropped ? "rgba(100,50,50,.3)" : "rgba(80,140,40,.2)",
                        border: `1px solid ${dropped ? "#8a4040" : "#4a8a2a"}`,
                        color: dropped ? "#804040" : "#80c050",
                        textDecoration: dropped ? "line-through" : "none",
                        opacity: isRolling ? 0.5 : 1,
                        transition:"all .3s",
                      }}>
                        {isRolling ? "?" : d}
                      </span>
                    );
                  })}
                  <span style={{ fontSize:11, color:C.textDim }}>= </span>
                  <span style={{ fontSize:13, fontWeight:"bold",
                    color: isRolling ? C.textDim : statColor(dice.filter((_,i)=>i!==dice.indexOf(Math.min(...dice))).reduce((a,b)=>a+b,0)) }}>
                    {isRolling ? "…" : dice.filter((_,i)=>i!==dice.indexOf(Math.min(...dice))).reduce((a,b)=>a+b,0)}
                  </span>
                </div>
              )}

              {/* Sub-abilities */}
              {subs.map((sub, si) => {
                const eff      = effSub(sub.id);
                const sp       = splitMods[sub.id] ?? 0;
                const racDelta = racialSubDeltas[sub.id] ?? 0;
                const skillMod = getT44Mod(eff);
                const limit    = ruleBreaker ? 99 : MAX_SPLIT;
                const pair     = SPLIT_PAIRS[stat];
                const partner  = pair.find(id => id !== sub.id);
                const partnerSp = splitMods[partner] ?? 0;
                const canUp    = Math.abs(sp + 1) <= limit && Math.abs(partnerSp - 1) <= limit;
                const canDown  = Math.abs(sp - 1) <= limit && Math.abs(partnerSp + 1) <= limit;
                const isMusc   = sub.id === "muscle";
                const isStam   = sub.id === "stamina";
                const showES   = (isMusc && effSub("muscle") === 18) ||
                                 (isStam && effSub("stamina") === 18);
                const esSubId  = isMusc ? "muscle" : "stamina";
                const esActive = isMusc ? exStrActive :
                                 (isStam && effSub("stamina") === 18); // stamina always shows

                return (
                  <div key={sub.id} style={{ marginBottom: si===0 ? 14 : 0 }}>
                    <div style={{ display:"flex", alignItems:"center",
                      justifyContent:"space-between", marginBottom:4 }}>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        <span style={{ fontSize:13, color:"#b09070" }}>{sub.label}</span>
                        <IBtn onClick={()=>setInfoModal({ title:sub.label, body:sub.desc })} />
                        {racDelta!==0 && <TagBadge color={racDelta>0?C.green:C.red}>{racDelta>0?`+${racDelta}`:racDelta} abil</TagBadge>}
                        {sp!==0 && <TagBadge color={sp>0?"#c8d060":"#d0a060"}>{sp>0?`+${sp}`:sp} split</TagBadge>}
                      </div>
                      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                        {/* Split controls */}
                        <div style={{ display:"flex", gap:2, alignItems:"center" }}>
                          <SplitBtn disabled={!canDown && !ruleBreaker}
                            onClick={()=>adjustSplit(sub.id, -1)}>−</SplitBtn>
                          <span style={{ fontSize:10, color:C.textDim, minWidth:16,
                            textAlign:"center" }}>{sp>0?`+${sp}`:sp||""}</span>
                          <SplitBtn disabled={!canUp && !ruleBreaker}
                            onClick={()=>adjustSplit(sub.id, +1)}>+</SplitBtn>
                        </div>
                        <div style={{ fontSize:24, fontWeight:"bold",
                          color:statColor(eff), minWidth:32, textAlign:"right",
                          textShadow:`0 0 10px ${statColor(eff)}44` }}>{eff}</div>
                      </div>
                    </div>

                    {/* Bar */}
                    <div style={{ height:3, background:"#1a1208", borderRadius:2, marginBottom:4 }}>
                      <div style={{ height:"100%", borderRadius:2, transition:"width .3s",
                        width:`${(eff/25)*100}%`,
                        background:`linear-gradient(90deg,${statColor(eff)}55,${statColor(eff)})` }} />
                    </div>

                    {/* ── Stat bonus rows (per sub-ability) ─────────────── */}
                    <div style={{ marginTop:6, display:"flex",
                      flexWrap:"wrap", gap:"4px 10px" }}>
                      {/* Skill Modifier (was T44) */}
                      <SubStatChip
                        label="Skill Mod"
                        value={fmt(getT44Mod(eff))}
                        valueColor={C.blue}
                        desc="Skill Modifier (Table 44): Added to or subtracted from proficiency Success Rolls that use this sub-ability as the key stat. This modifier costs 0 CP — it is applied to the roll only, not to the purchase price."
                        onInfo={setInfoModal}
                      />
                      {/* All sub-specific bonuses */}
                      {getSubStats(sub.id, eff, exStrActive && sub.id==="muscle" ? exPcts.muscle : 0)
                        .map(stat=>(
                        <SubStatChip
                          key={stat.key}
                          label={stat.key}
                          value={stat.value}
                          valueColor={
                            String(stat.value).startsWith("+") ? C.green :
                            String(stat.value).startsWith("-") ? C.red   :
                            C.text
                          }
                          desc={stat.desc}
                          onInfo={setInfoModal}
                        />
                      ))}
                      {/* Knowledge: bonus CP */}
                      {sub.id==="knowledge" && (
                        <SubStatChip
                          label="Bonus CP"
                          value={`+${_getKnowledgeCP(eff)}`}
                          valueColor={C.gold}
                          desc="Bonus CP (Table 10): The Reason score grants additional Character Points for purchasing Non-Weapon Proficiencies. Added directly to the proficiency CP pool at character creation."
                          onInfo={setInfoModal}
                        />
                      )}
                      {/* Spell points for spellcasting classes */}
                      {((sub.id==="willpower" && classData?.spStat==="willpower") ||
                        (sub.id==="knowledge" && classData?.spStat==="knowledge")) && (
                        <SubStatChip
                          label="Spell Pts"
                          value={`+${spellPointBonus}`}
                          valueColor={C.purple}
                          desc="Spell Point Bonus (House Rule): Based on the key casting stat, this bonus is added to the character's total Spell Points at each level. Mages/Bards use Reason; Priests/Druids use Willpower."
                          onInfo={setInfoModal}
                        />
                      )}
                    </div>

                    {/* 18/xx Exceptional sub-stat */}
                    {showES && (() => {
                      const pct = exPcts[esSubId] ?? 50;
                      const lbl = getExStrLabel(pct);
                      const notWarrior = isMusc && !exStrActive;
                      return (
                        <div style={{ marginTop:10, padding:"8px 12px",
                          background:"rgba(212,160,53,.07)",
                          border:`1px solid ${notWarrior ? C.amber+"66" : C.amber}`,
                          borderRadius:8 }}>
                          <div style={{ fontSize:10, color: notWarrior ? C.amber+"99" : C.amber,
                            marginBottom:6, letterSpacing:1, textTransform:"uppercase" }}>
                            ✦ 18/{pct <= 9 ? "0"+pct : pct} Exceptional {sub.label}
                            {notWarrior && <span style={{ color:"#887040", marginLeft:6 }}>(Warriors only for bonus)</span>}
                          </div>
                          <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                            <span style={{ fontSize:13, color:C.textDim }}>18 /</span>
                            <input type="number" min={1} max={100}
                              value={pct}
                              onChange={e => setExPcts(p => ({ ...p, [esSubId]: Math.max(1,Math.min(100,+e.target.value)) }))}
                              style={{ width:50, textAlign:"center", background:"#0d0903",
                                border:`1px solid ${C.amber}44`, borderRadius:5,
                                color:C.amber, fontSize:16, fontWeight:"bold",
                                fontFamily:"inherit", padding:"2px 0" }} />
                            <button onClick={() => rollD100(esSubId)} style={{
                              background:"rgba(212,160,53,.15)", border:`1px solid ${C.amber}66`,
                              borderRadius:6, padding:"3px 9px", cursor:"pointer",
                              color:C.amber, fontSize:12, fontFamily:"inherit",
                            }}>🎲 d100</button>
                            <span style={{ fontSize:15, color:C.amber, fontWeight:"bold",
                              minWidth:60 }}>
                              {lbl}
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Combat summary */}
      <div style={{ marginTop:20, background:C.card,
        border:`1px solid ${C.borderHi}`, borderRadius:10, padding:"14px 22px",
        display:"flex", gap:28, flexWrap:"wrap", alignItems:"center" }}>
        <StatPill label="Muscle (eff)"  val={effSub("muscle")}           color={statColor(effSub("muscle"))} />
        <StatPill label="Att. Adj."     val={fmt(muscleStats.attAdj)}    color={muscleStats.attAdj>=0?C.green:C.red} />
        <StatPill label="Dam. Adj."     val={fmt(muscleStats.dmgAdj)}    color={muscleStats.dmgAdj>=0?C.green:C.red} />
        <StatPill label="Max Press"     val={`${muscleStats.maxPress}lb`} color={C.textDim} />
        <StatPill label="Open Doors"    val={muscleStats.openDoors}      color={C.amber} />
        <StatPill label="Skill Mod"     val={fmt(getT44Mod(effSub("muscle")))} color={C.blue} />
        {showExStr && <StatPill label="Muscle 18/xx" val={exStrActive ? `18/${exPcts.muscle <= 9 ? '0'+exPcts.muscle : exPcts.muscle} ${props.exStrLabel}` : `18/${exPcts.muscle <= 9 ? '0'+exPcts.muscle : exPcts.muscle} (no bonus)`} color={exStrActive ? C.amber : C.textDim} />}
        {classData?.spStat && <StatPill label="Spell Pts +" val={spellPointBonus} color={C.purple} />}
        <StatPill label="Knowledge CP"     val={`+${_getKnowledgeCP(effSub("knowledge"))}`} color={C.gold} />
      </div>

      {/* Split rules reminder */}
      <div style={{ marginTop:12, fontSize:11, color:C.textDim, fontStyle:"italic" }}>
        Split rules: Each sub-ability pair (e.g. Muscle / Stamina) may differ by up to ±{MAX_SPLIT} from the parent score.
        Math: Sub = Parent{"{"}adjusted{"}"} + Racial Δ + Split Δ.
        {ruleBreaker && <span style={{ color:C.red }}> [Rule-Breaker: unlimited splits allowed]</span>}
      </div>
    </div>
  );
}
