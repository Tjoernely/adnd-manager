import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { TRAITS, DISADVANTAGES, DISADV_POOL_WARN } from "../../data/traits.js";

import { ChHead, IBtn, Checkbox, CpBadge, GroupLabel } from "../ui/index.js";

export function TraitsTab(props) {
  const {
    traitsPicked, disadvPicked, setDisadvPicked,
    disadvPool, traitCPSp,
    ruleBreaker, setInfoModal,
    toggleTrait,
  } = props;

  return (
    <div>
      <ChHead icon="💫" num="Chapter 4" title="Traits & Disadvantages"
        sub="Traits cost CP. Disadvantages AWARD CP. S&P Table 46 & 47 exact values. Disadvantages with severe versions offer more CP for a harsher penalty." />

      {/* Disadv pool callout */}
      <div style={{ marginBottom:22, padding:"12px 20px",
        background:disadvPool>DISADV_POOL_WARN?"rgba(180,30,30,.07)":"rgba(0,0,0,.3)",
        border:`2px solid ${disadvPool>DISADV_POOL_WARN?C.red:C.border}`, borderRadius:10,
        display:"flex", alignItems:"center", gap:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>Disadvantage CP Awarded</div>
          <span style={{ fontSize:28, fontWeight:"bold",
            color:disadvPool>DISADV_POOL_WARN?C.redBri:C.amber,
            textShadow:disadvPool>DISADV_POOL_WARN?`0 0 20px ${C.redBri}`:"none" }}>
            +{disadvPool} CP
          </span>
        </div>
        <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:16 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase", marginBottom:2 }}>Trait CP Spent</div>
          <span style={{ fontSize:28, fontWeight:"bold", color:C.green }}>
            −{traitCPSp} CP
          </span>
        </div>
        {disadvPool > DISADV_POOL_WARN && (
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
              const level = disadvPicked[dv.id]; // false | "moderate" | "severe"
              const picked = !!level;
              const hasSevere = dv.cpSevere != null;
              const isCustom = dv.source === "Custom";
              const cpGain = level === "severe" ? dv.cpSevere : dv.cp;
              return (
                <div key={dv.id} style={{
                  background: picked ? "linear-gradient(145deg,#1e0a0a,#180808)" : C.card,
                  border:`1px solid ${level === "severe" ? "#8a1010" : picked ? "#5a1818" : C.border}`,
                  borderRadius:7, padding:"8px 12px", transition:"all .13s",
                  boxShadow: picked ? "0 0 8px rgba(180,30,30,.1)" : "none",
                }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    {/* click name area to toggle moderate */}
                    <div onClick={() => setDisadvPicked(prev => {
                      const cur = prev[dv.id];
                      if (!cur) return {...prev, [dv.id]:"moderate"};
                      if (cur === "moderate" && !hasSevere) return {...prev, [dv.id]:false};
                      if (cur === "moderate") return {...prev, [dv.id]:false};
                      if (cur === "severe") return {...prev, [dv.id]:false};
                      return {...prev, [dv.id]:false};
                    })} style={{ display:"flex", alignItems:"center", gap:8, flex:1, cursor:"pointer" }}>
                      <Checkbox checked={picked} color={level==="severe"?"#d04040":C.red} />
                      <span style={{ flex:1, fontSize:12, color: picked ? "#d08080" : C.textDim }}>
                        {dv.name}
                        {isCustom && (
                          <span style={{ fontSize:9, marginLeft:5, color:"#7090a0",
                            border:"1px solid rgba(70,110,140,.4)", borderRadius:3, padding:"1px 4px" }}>
                            ✦ CUSTOM
                          </span>
                        )}
                      </span>
                    </div>

                    {/* Moderate / Severe toggle */}
                    {hasSevere && (
                      <div style={{ display:"flex", gap:3, flexShrink:0 }}>
                        <button onClick={() => setDisadvPicked(prev => ({...prev, [dv.id]: level === "moderate" ? false : "moderate"}))}
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:3, cursor:"pointer",
                            fontFamily:"inherit", border:"none",
                            background: level === "moderate" ? "rgba(180,120,40,.3)" : "rgba(60,50,40,.4)",
                            color: level === "moderate" ? C.amber : "#605040" }}>
                          Mod +{dv.cp}
                        </button>
                        <button onClick={() => setDisadvPicked(prev => ({...prev, [dv.id]: level === "severe" ? false : "severe"}))}
                          style={{ fontSize:9, padding:"2px 6px", borderRadius:3, cursor:"pointer",
                            fontFamily:"inherit", border:"none",
                            background: level === "severe" ? "rgba(180,40,40,.35)" : "rgba(60,40,40,.4)",
                            color: level === "severe" ? "#e08080" : "#604040" }}>
                          Sev +{dv.cpSevere}
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
