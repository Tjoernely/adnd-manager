import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { TRAITS, DISADVANTAGES, DISADV_POOL_WARN, DISADV_MAX_CP } from "../../data/traits.js";

import { ChHead, IBtn, Checkbox, CpBadge, GroupLabel } from "../ui/index.js";

export function TraitsTab(props) {
  const {
    traitsPicked, disadvPicked, disadvSubChoice,
    disadvPool, traitCPSp,
    ruleBreaker, setInfoModal,
    toggleTrait, toggleDisadv, handleDisadvSubChoice,
  } = props;

  return (
    <div>
      <ChHead icon="💫" num="Chapter 4" title="Traits & Disadvantages"
        sub="Traits cost CP. Disadvantages AWARD CP. S&P Table 46 & 47 exact values. Disadvantages with severe versions offer more CP for a harsher penalty." />

      {/* Disadv pool callout */}
      <div style={{ marginBottom:22, padding:"12px 20px",
        background:disadvPool>=DISADV_MAX_CP?"rgba(180,30,30,.12)":disadvPool>DISADV_POOL_WARN?"rgba(180,30,30,.07)":"rgba(0,0,0,.3)",
        border:`2px solid ${disadvPool>=DISADV_MAX_CP?C.redBri:disadvPool>DISADV_POOL_WARN?C.red:C.border}`, borderRadius:10,
        display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>Disadvantage CP Awarded</div>
          <span style={{ fontSize:28, fontWeight:"bold",
            color:disadvPool>=DISADV_MAX_CP?C.redBri:disadvPool>DISADV_POOL_WARN?C.amber:C.amber,
            textShadow:disadvPool>DISADV_POOL_WARN?`0 0 20px ${disadvPool>=DISADV_MAX_CP?C.redBri:C.red}`:"none" }}>
            +{disadvPool} / {DISADV_MAX_CP} CP
          </span>
        </div>
        <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:16 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>Trait CP Spent</div>
          <span style={{ fontSize:28, fontWeight:"bold", color:C.green }}>
            −{traitCPSp} CP
          </span>
        </div>
        {disadvPool >= DISADV_MAX_CP && !ruleBreaker && (
          <div style={{ padding:"6px 14px", background:"rgba(200,40,40,.2)",
            border:`1px solid ${C.redBri}`, borderRadius:6, fontSize:12, color:C.redBri, fontWeight:"bold" }}>
            ✗ {DISADV_MAX_CP} CP MAX REACHED
          </div>
        )}
        {disadvPool > DISADV_POOL_WARN && disadvPool < DISADV_MAX_CP && (
          <div style={{ padding:"6px 14px", background:"rgba(180,30,30,.14)",
            border:`1px solid ${C.red}`, borderRadius:6, fontSize:12, color:C.red, fontWeight:"bold" }}>
            ⚠ EXCEEDS {DISADV_POOL_WARN} CP — DM APPROVAL REQUIRED
          </div>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:26 }}>

        {/* ── TRAITS ── */}
        <div>
          <GroupLabel>Traits — cost CP (Table 46)</GroupLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
            {TRAITS.map(tr => {
              const p = !!traitsPicked[tr.id];
              const isCustom = tr.source === "Custom";
              return (
                <div key={tr.id} onClick={() => toggleTrait(tr)} style={{
                  background: p ? "linear-gradient(145deg,#1a1c08,#141608)" : C.card,
                  border:`1px solid ${p ? "#5a7020" : C.border}`,
                  borderRadius:7, padding:"8px 12px", cursor:"pointer", transition:"all .13s",
                  display:"flex", alignItems:"center", gap:8,
                  boxShadow: p ? "0 0 8px rgba(120,180,30,.08)" : "none",
                }}>
                  <Checkbox checked={p} color="#8ab040" />
                  <span style={{ flex:1, fontSize:12, color: p ? C.textBri : C.textDim }}>
                    {tr.name}
                    {isCustom && (
                      <span style={{ fontSize:9, marginLeft:5, color:"#7090a0",
                        border:"1px solid rgba(70,110,140,.4)", borderRadius:3, padding:"1px 4px" }}>
                        ✦ CUSTOM
                      </span>
                    )}
                  </span>
                  <CpBadge>{tr.cp}</CpBadge>
                  <IBtn onClick={e=>{e.stopPropagation();setInfoModal({title:tr.name,body:tr.desc});}} />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── DISADVANTAGES ── */}
        <div>
          <GroupLabel>Disadvantages — award CP (Table 47)</GroupLabel>
          <div style={{ display:"flex", flexDirection:"column", gap:6, marginTop:8 }}>
            {DISADVANTAGES.map(dv => {
              const level     = disadvPicked[dv.id]; // false | "moderate" | "severe"
              const picked    = !!level;
              const hasSevere = dv.cpSevere != null;
              const isCustom  = dv.source === "Custom";
              const hasSubOpts = dv.subOptions?.length > 0;

              // Effective CP values (use sub-option when chosen)
              const chosenSubId  = disadvSubChoice?.[dv.id];
              const chosenSubOpt = hasSubOpts ? dv.subOptions.find(o => o.id === chosenSubId) : null;
              const effCp        = chosenSubOpt ? chosenSubOpt.cp : dv.cp;
              const effCpSevere  = chosenSubOpt ? chosenSubOpt.cpSevere : dv.cpSevere;
              const effHasSevere = chosenSubOpt ? chosenSubOpt.cpSevere != null : hasSevere;

              const cpGain = level === "severe" ? (effCpSevere ?? effCp) : effCp;

              return (
                <div key={dv.id} style={{
                  background: picked ? "linear-gradient(145deg,#1e0a0a,#180808)" : C.card,
                  border:`1px solid ${level === "severe" ? "#8a1010" : picked ? "#5a1818" : C.border}`,
                  borderRadius:7, padding:"8px 12px", transition:"all .13s",
                  boxShadow: picked ? "0 0 8px rgba(180,30,30,.1)" : "none",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* click name area to toggle moderate (or deselect) */}
                    <div onClick={() => toggleDisadv(dv, picked ? false : "moderate")}
                      style={{ display:"flex", alignItems:"center", gap:8, flex:1, cursor:"pointer" }}>
                      <Checkbox checked={picked} color={level==="severe"?"#d04040":C.red} />
                      <span style={{ flex:1, fontSize:12, color: picked ? "#d08080" : C.textDim }}>
                        {dv.name}
                        {isCustom && (
                          <span style={{ fontSize:9, marginLeft:5, color:"#7090a0",
                            border:"1px solid rgba(70,110,140,.4)", borderRadius:3, padding:"1px 4px" }}>
                            ✦ CUSTOM
                          </span>
                        )}
                        {hasSubOpts && !chosenSubOpt && picked && (
                          <span style={{ fontSize:9, marginLeft:6, color:C.amber }}>
                            ← choose type
                          </span>
                        )}
                        {chosenSubOpt && (
                          <span style={{ fontSize:9, marginLeft:6, color:"#d08080" }}>
                            [{chosenSubOpt.label}]
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Moderate / Severe toggle — uses effective CP values */}
                    {effHasSevere && (
                      <div style={{ display:"flex", gap:3, flexShrink:0 }}>
                        <button onClick={e => { e.stopPropagation(); toggleDisadv(dv, level === "moderate" ? false : "moderate"); }}
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:3, cursor:"pointer",
                            fontFamily:"inherit", border:"none",
                            background: level === "moderate" ? "rgba(180,120,40,.3)" : "rgba(60,50,40,.4)",
                            color: level === "moderate" ? C.amber : "#605040" }}>
                          Mod +{effCp}
                        </button>
                        <button onClick={e => { e.stopPropagation(); toggleDisadv(dv, level === "severe" ? false : "severe"); }}
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:3, cursor:"pointer",
                            fontFamily:"inherit", border:"none",
                            background: level === "severe" ? "rgba(180,40,40,.35)" : "rgba(60,40,40,.4)",
                            color: level === "severe" ? "#e08080" : "#604040" }}>
                          Sev +{effCpSevere}
                        </button>
                      </div>
                    )}

                    {/* CP gain badge */}
                    {picked ? (
                      <span style={{ fontSize:12, fontWeight:"bold", padding:"2px 8px",
                        background: level==="severe"?"rgba(200,40,40,.2)":"rgba(180,80,50,.12)",
                        border:`1px solid ${level==="severe"?"#7a1818":"#5a2020"}`,
                        borderRadius:4, color: level==="severe"?"#f08080":"#d07070", whiteSpace:"nowrap" }}>
                        +{cpGain}
                      </span>
                    ) : (
                      <span style={{ fontSize:11, color:"#503030", whiteSpace:"nowrap" }}>
                        +{dv.cp}{hasSevere ? `/+${dv.cpSevere}` : ""}
                      </span>
                    )}
                    <IBtn onClick={e=>{e.stopPropagation();setInfoModal({title:dv.name,body:dv.desc});}} />
                  </div>

                  {/* Sub-option selector for disadvantages like Fanaticism */}
                  {hasSubOpts && picked && (
                    <div style={{ marginTop:8, paddingTop:8,
                      borderTop:`1px solid rgba(180,50,50,.2)` }}>
                      <div style={{ fontSize:9, color:"#a06060", letterSpacing:2,
                        textTransform:"uppercase", marginBottom:6 }}>
                        Choose type:
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                        {dv.subOptions.map(opt => {
                          const isCh = chosenSubId === opt.id;
                          return (
                            <button key={opt.id}
                              onClick={e => { e.stopPropagation(); handleDisadvSubChoice(dv.id, opt.id); }}
                              style={{
                                padding:"3px 8px", borderRadius:4, fontSize:10,
                                cursor:"pointer", fontFamily:"inherit",
                                background: isCh ? "rgba(200,50,50,.3)" : "rgba(80,30,30,.3)",
                                color: isCh ? "#f08080" : "#a06060",
                                border:`1px solid ${isCh ? "#a03030" : "#5a2020"}`,
                                transition:"all .1s",
                              }}>
                              {isCh ? "✓ " : ""}{opt.label}
                              <span style={{ opacity:.7, marginLeft:4 }}>
                                (+{opt.cp}{opt.cpSevere != null ? `/+${opt.cpSevere}` : ""})
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {chosenSubOpt && (
                        <div style={{ marginTop:5, fontSize:10, color:"#a06060", lineHeight:1.4 }}>
                          {chosenSubOpt.desc}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
