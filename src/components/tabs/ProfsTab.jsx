import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { ALL_NWP, NWP_GROUPS, PROF_GROUPTAG } from "../../data/proficiencies.js";

import { ChHead, IBtn, Checkbox, CpBadge, GroupLabel } from "../ui/index.js";

export function ProfsTab(props) {
  const {
    profsPicked, effSub, remainCP,
    classGroup, activeKitObj, kitRequiredNWPUnmet, kitNWPRecommended,
    ruleBreaker, setInfoModal,
    nwpEffCp, isKitRecommended, isKitRequired, toggleProf,
    getT44Mod, ALL_SUBS,
  } = props;

  const _ALL_SUBS = props.ALL_SUBS ?? [];
  const _getT44Mod = props.getT44Mod ?? (score => {
    if (score >=  1 && score <=  5) return -5;
    if (score >=  6 && score <=  8) return -3;
    if (score >=  9 && score <= 12) return -1;
    if (score >= 13 && score <= 15) return  0;
    if (score >= 16 && score <= 17) return  1;
    if (score >= 18 && score <= 19) return  2;
    if (score >= 20 && score <= 21) return  3;
    if (score >= 22 && score <= 23) return  4;
    if (score >= 24 && score <= 25) return  5;
    return 0;
  });

  return (
    <div>
      <ChHead icon="📖" num="Chapter 6" title="Nonweapon Proficiencies"
        sub="Select skills for your character. General group: listed cost. Own class group: listed cost. Cross-class (other group): listed cost +2 CP. Kit-recommended profs cost 1 CP less." />

      {/* Kit NWP warnings */}
      {kitRequiredNWPUnmet.length > 0 && (
        <div style={{ marginBottom:14, padding:"10px 16px",
          background:"rgba(200,50,50,.08)", border:"1px solid rgba(200,50,50,.35)",
          borderRadius:8, fontSize:12 }}>
          <div style={{ color:C.red, fontWeight:"bold", marginBottom:6 }}>
            {`⚠ Kit "${activeKitObj?.name}" requires ${kitRequiredNWPUnmet.length} proficienc${kitRequiredNWPUnmet.length!==1?"ies":"y"} not yet selected:`}
          </div>
          <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
            {kitRequiredNWPUnmet.map(p => (
              <span key={p} style={{ background:"rgba(200,50,50,.12)", border:"1px solid rgba(200,50,50,.3)",
                borderRadius:4, padding:"2px 8px", color:C.red, fontSize:11 }}>✗ {p}</span>
            ))}
          </div>
        </div>
      )}
      {activeKitObj && kitNWPRecommended.length > 0 && kitRequiredNWPUnmet.length === 0 && (
        <div style={{ marginBottom:14, padding:"8px 14px",
          background:"rgba(212,160,53,.05)", border:"1px solid rgba(212,160,53,.25)",
          borderRadius:8, fontSize:11, color:C.textDim }}>
          <span style={{ color:C.gold }}>{`★ Kit "${activeKitObj.name}"`}</span>
          {" "}recommended proficiencies cost <strong style={{ color:C.gold }}>1 CP less</strong>:{" "}
          {kitNWPRecommended.join(", ")}
        </div>
      )}

      {/* Legend */}
      <div style={{ marginBottom:18, padding:"11px 18px",
        background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
        borderRadius:8, display:"flex", gap:20, flexWrap:"wrap", fontSize:12, alignItems:"center" }}>
        <span style={{ color:C.textDim }}>
          CP Pool: <strong style={{ color:C.gold, fontSize:15 }}>{remainCP}</strong> remaining
        </span>
        <span style={{ color:C.textDim }}>
          Class: <strong style={{ color:C.textBri }}>{classGroup ? classGroup.charAt(0).toUpperCase()+classGroup.slice(1) : "—"}</strong>
        </span>
        <span style={{ background:"rgba(60,100,180,.12)", border:"1px solid rgba(60,100,180,.3)",
          borderRadius:4, padding:"2px 8px", color:C.blue, fontSize:11 }}>
          General & own class group = listed cost
        </span>
        <span style={{ background:"rgba(180,100,60,.12)", border:"1px solid rgba(180,100,60,.3)",
          borderRadius:4, padding:"2px 8px", color:C.amber, fontSize:11 }}>
          Other class group = +2 CP
        </span>
        <span style={{ fontSize:11, color:C.textDim }}>
          Success roll: Base Rank + Ability Modifier (d20, roll under)
        </span>
      </div>

      {/* Set of all prof names currently picked (any group) — for cross-group dedup */}
      {(() => {
        const pickedNames = new Set(ALL_NWP.filter(p => profsPicked[p.id]).map(p => p.name));

        return NWP_GROUPS.map(grp => {
        const isSameGroup = grp.groupTag === classGroup || grp.groupTag === "general";
        return (
          <div key={grp.group} style={{ marginBottom:28 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
              <GroupLabel>{grp.group}</GroupLabel>
              <span style={{
                fontSize:10, padding:"2px 9px", borderRadius:10,
                background: isSameGroup ? "rgba(60,160,80,.12)" : "rgba(180,100,40,.12)",
                border:`1px solid ${isSameGroup ? "rgba(60,160,80,.3)" : "rgba(180,100,40,.3)"}`,
                color: isSameGroup ? C.green : C.amber,
              }}>
                {isSameGroup ? "✓ In-class cost" : "+2 cross-class"}
              </span>
              <span style={{ fontSize:10, color:C.textDim, marginLeft:"auto" }}>{grp.sub}</span>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:9 }}>
              {grp.profs.map(prof => {
                const pickedById   = !!profsPicked[prof.id];
                const pickedElsew  = !pickedById && pickedNames.has(prof.name);
                const picked       = pickedById || pickedElsew;
                const baseCp     = nwpEffCp(prof);
                const kitRec     = isKitRecommended(prof) && !!activeKitObj;
                const kitReq     = isKitRequired(prof);
                const effCp      = Math.max(0, baseCp - (kitRec ? 1 : 0));
                const crossClass = !isSameGroup;
                // ability mod calc
                const subId      = prof.stats ? prof.stats[0] : "knowledge";
                const statScore  = effSub(subId);
                const skillMod   = _getT44Mod(statScore);
                const success    = Math.min(20, Math.max(1, prof.rank + skillMod));
                const subLabel   = _ALL_SUBS.find(s=>s.id===subId)?.label ?? subId;
                return (
                  <div key={prof.id}
                    onClick={() => { if (!pickedElsew) toggleProf(prof); }}
                    title={pickedElsew ? `Already selected via another group` : undefined}
                    style={{
                    background: picked ? "linear-gradient(145deg,#1a1808,#141408)" : C.card,
                    border:`1px solid ${kitReq && !picked ? C.red : kitRec && !picked ? "rgba(212,160,53,.5)" : picked ? C.borderHi : C.border}`,
                    borderRadius:8, padding:"10px 13px",
                    cursor: pickedElsew ? "default" : "pointer",
                    transition:"all .13s",
                    boxShadow: picked ? "0 0 10px rgba(212,160,53,.09)" : kitReq ? "0 0 6px rgba(200,50,50,.15)" : "none",
                    opacity: pickedElsew ? 0.75 : 1,
                  }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <Checkbox checked={picked} />
                      <span style={{ flex:1, fontSize:13, color: picked ? C.textBri : C.textDim }}>
                        {prof.name}
                        {kitReq && <span style={{ fontSize:9, marginLeft:5, color:C.red,
                          border:`1px solid ${C.red}`, borderRadius:3, padding:"1px 4px" }}>KIT REQ</span>}
                        {kitRec && !kitReq && <span style={{ fontSize:9, marginLeft:5, color:C.gold,
                          border:"1px solid rgba(212,160,53,.5)", borderRadius:3, padding:"1px 4px" }}>★ KIT</span>}
                        {pickedElsew && <span style={{ fontSize:9, marginLeft:5, color:C.textDim,
                          border:`1px solid ${C.border}`, borderRadius:3, padding:"1px 4px" }}>↔ other group</span>}
                      </span>
                      {/* CP display */}
                      <div style={{ display:"flex", alignItems:"center", gap:4 }}>
                        {crossClass && !picked && (
                          <span style={{ fontSize:9, color:C.amber }}>+2</span>
                        )}
                        {kitRec && (
                          <span style={{ fontSize:10, color:C.textDim, textDecoration:"line-through" }}>{baseCp}</span>
                        )}
                        <CpBadge>{effCp}</CpBadge>
                      </div>
                      <IBtn onClick={e=>{e.stopPropagation();setInfoModal({title:prof.name,body:prof.desc});}} />
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:11, color:C.textDim }}>
                      <span style={{ color:"#8a7050" }}>{subLabel} {statScore}</span>
                      <span>·</span>
                      <span>Base <span style={{ color:C.text }}>{prof.rank}</span></span>
                      <span style={{ color: skillMod>0?C.green : skillMod<0?C.red : "#555" }}>
                        {skillMod>=0 ? `+${skillMod}` : skillMod}
                      </span>
                      <span>=</span>
                      <strong style={{ color: success>=15?C.green : success>=10?"#c8b060" : C.amber }}>
                        {success}
                      </strong>
                      <span style={{ color:"#444" }}>/ 20</span>
                    </div>
                    {prof.stats && prof.stats.length > 1 && (
                      <div style={{ fontSize:10, color:"#5a5040", marginTop:3 }}>
                        Also: {prof.stats.slice(1).map(s => _ALL_SUBS.find(x=>x.id===s)?.label ?? s).join(", ")}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      });
      })()}
    </div>
  );
}
