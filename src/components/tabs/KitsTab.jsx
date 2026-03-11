import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { SP_KITS, CLASS_KITS } from "../../data/kits.js";
import { ALL_CLASSES } from "../../data/classes.js";

import { ChHead } from "../ui/index.js";

export function KitsTab(props) {
  const {
    selectedClass, selectedKit, setSelectedKit,
    profsPicked, effSub, ruleBreaker,
    kitAlignOk, kitBarredOk,
    ALL_PROFS,
  } = props;

  const _ALL_PROFS = props.ALL_PROFS ?? [];

  // local variables that were inside the IIFE
  const classKits  = selectedClass ? (CLASS_KITS[selectedClass] ?? []) : [];
  // Kit stat check helper
  const kitStatsMet = kit => {
    if (!kit.reqStats) return true;
    return Object.entries(kit.reqStats).every(([sub, min]) => effSub(sub) >= min);
  };
  // Kit required NWP check — fuzzy-match prof name in profsPicked
  const profNamePicked = name => {
    const n = name.toLowerCase();
    return _ALL_PROFS.some(p => profsPicked[p.id] &&
      (p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())));
  };
  const kitReqNWPMet = kit => {
    if (!kit.nwpRequired || kit.nwpRequired.length === 0) return true;
    return kit.nwpRequired.every(r => profNamePicked(r));
  };
  // Get the currently selected kit object
  const activeKit = selectedKit
    ? ([...SP_KITS, ...classKits].find(k => k.id === selectedKit))
    : null;
  const activeKitStatsMet  = activeKit ? kitStatsMet(activeKit) : true;
  const activeKitNWPMet    = activeKit ? kitReqNWPMet(activeKit) : true;
  const isClassKit = id => classKits.some(k => k.id === id);

  // Render a single kit card
  const KitCard = ({ kit, compact }) => {
    const picked     = selectedKit === kit.id;
    const statOk     = kitStatsMet(kit);
    const isClass    = isClassKit(kit.id);
    const borderCol  = picked ? (isClass ? "#6090d8" : C.gold)
                     : !statOk ? C.red
                     : C.border;
    return (
      <div onClick={() => setSelectedKit(picked ? null : kit.id)}
        style={{
          background: picked
            ? (isClass ? "linear-gradient(145deg,#08101c,#060c14)"
                        : "linear-gradient(145deg,#1c1608,#141005)")
            : C.card,
          border: `1px solid ${borderCol}`,
          borderRadius: 9, padding: compact ? "9px 12px" : "11px 14px",
          cursor: "pointer", transition: "all .15s",
          boxShadow: picked ? `0 0 12px ${isClass ? "rgba(80,130,220,.25)" : C.gold+"22"}` : "none",
          opacity: !statOk && !ruleBreaker ? 0.55 : 1,
        }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: compact ? 3 : 5 }}>
          <span style={{ fontSize:12, fontWeight:"bold",
            color: picked ? (isClass ? "#90b8f0" : C.gold) : (!statOk ? C.red : C.textBri) }}>
            {picked ? "✓ " : ""}{kit.name}
          </span>
          {!statOk && (
            <span style={{ fontSize:9, color:C.red, border:`1px solid ${C.red}`,
              borderRadius:3, padding:"1px 4px", flexShrink:0, marginLeft:6 }}>
              {ruleBreaker ? "⚠ REQ" : "✗ REQ"}
            </span>
          )}
        </div>
        <div style={{ fontSize:11, color:C.textDim, lineHeight:1.5 }}>
          {(kit.desc||"").length > (compact?130:160) ? (kit.desc||"").slice(0,compact?130:160)+"…" : (kit.desc||kit.benefits?.slice(0,compact?130:160)||"No description available.")}
        </div>
      </div>
    );
  };

  return (
    <div>
      <ChHead icon="🎭" num="Chapter 5" title="Character Kits"
        sub="Kits are free — no CP cost. A character with a kit may purchase listed recommended proficiencies at 1 CP less. One kit per character, chosen at creation." />

      {/* ── Active Kit Rulebreaker ── */}
      {activeKit && !activeKitStatsMet && !ruleBreaker && (
        <div style={{ background:"rgba(200,50,50,.08)", border:`1px solid ${C.red}`,
          borderRadius:8, padding:"10px 14px", marginBottom:14 }}>
          <div style={{ fontSize:12, color:C.red, fontWeight:"bold", marginBottom:4 }}>
            ⚠ Stat Requirements Not Met — {activeKit.name}
          </div>
          <div style={{ fontSize:11, color:C.textDim, marginBottom:8 }}>
            {Object.entries(activeKit.reqStats||{}).map(([sub,min]) => {
              const cur = effSub(sub); const ok = cur >= min;
              return (
                <span key={sub} style={{ marginRight:12, color: ok ? C.textDim : C.red }}>
                  {ok ? "✓" : "✗"} {sub} {cur}/{min}
                </span>
              );
            })}
          </div>
          <div style={{ fontSize:11, color:C.textDim }}>
            Enable Rule Breaker in the header to override requirement.
          </div>
        </div>
      )}

      {/* ── Active Kit Detail Panel ── */}
      {activeKit && (() => {
        const isClass = isClassKit(activeKit.id);
        const statOk  = activeKitStatsMet;
        const nwpOk   = activeKitNWPMet;
        return (
          <div style={{ marginBottom:20, padding:"14px 18px",
            background: isClass ? "rgba(80,140,220,.07)" : "rgba(212,160,53,.06)",
            border:`2px solid ${isClass ? "#5080c0" : C.gold}`,
            borderRadius:10 }}>
            {/* Header */}
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:12, marginBottom:12 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:"bold",
                  color: isClass ? "#90b8f0" : C.gold, marginBottom:4 }}>
                  🎭 {activeKit.name}
                  {isClass && <span style={{ fontSize:10, marginLeft:8, color:"#7090c8",
                    border:"1px solid #5070a0", borderRadius:3, padding:"1px 5px" }}>
                    Handbook Kit
                  </span>}
                  {(!statOk && (ruleBreaker||true)) && (
                    <span style={{ fontSize:10, marginLeft:8, color:C.red,
                      border:`1px solid ${C.red}`, borderRadius:3, padding:"1px 5px" }}>
                      {ruleBreaker ? "⚠ REQ OVERRIDE" : "✗ REQS NOT MET"}
                    </span>
                  )}
                </div>
                <div style={{ fontSize:12, color:C.textMid, lineHeight:1.65 }}>{activeKit.desc}</div>
              </div>
              <button onClick={() => setSelectedKit(null)}
                style={{ background:"none", border:`1px solid ${C.border}`, borderRadius:5,
                  color:C.textDim, cursor:"pointer", padding:"3px 8px", fontSize:11,
                  flexShrink:0, whiteSpace:"nowrap" }}>✕ Clear</button>
            </div>

            {/* Stat Requirements */}
            {activeKit.reqStats && Object.keys(activeKit.reqStats).length > 0 && (
              <div style={{ marginBottom:10 }}>
                <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
                  textTransform:"uppercase", marginBottom:5 }}>Stat Requirements</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {Object.entries(activeKit.reqStats).map(([sub,min]) => {
                    const cur = effSub(sub); const ok = cur >= min;
                    return (
                      <span key={sub} style={{ fontSize:11,
                        color: ok ? "#60c060" : C.red,
                        background: ok ? "rgba(60,160,60,.1)" : "rgba(200,50,50,.1)",
                        border:`1px solid ${ok ? "rgba(60,160,60,.3)" : "rgba(200,50,50,.3)"}`,
                        borderRadius:4, padding:"2px 8px" }}>
                        {ok ? "✓" : "✗"} {sub.charAt(0).toUpperCase()+sub.slice(1)} {cur} / {min} min
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Alignment & barred classes */}
            {(activeKit.reqAlign || (activeKit.barredClasses||[]).length > 0) && (
              <div style={{ marginBottom:10, fontSize:11, color:C.textDim }}>
                {activeKit.reqAlign && (
                  <span style={{ marginRight:12,
                    color: kitAlignOk ? C.textDim : C.red }}>
                    {kitAlignOk ? "✓" : "✗"} ⚖️ Alignment: <span style={{ color: kitAlignOk ? C.textBri : C.red }}>{activeKit.reqAlign}</span>
                  </span>
                )}
                {(activeKit.barredClasses||[]).length > 0 && (
                  <span style={{ color: kitBarredOk ? C.textDim : C.red }}>
                    {kitBarredOk ? "✓" : "✗"} 🚫 Barred to: <span style={{ color: kitBarredOk ? C.textBri : C.red }}>{activeKit.barredClasses.join(', ')}</span>
                  </span>
                )}
              </div>
            )}

            {/* Two-column: Benefits + Hindrances */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:10 }}>
              {activeKit.benefits && (
                <div style={{ background:"rgba(60,180,60,.06)",
                  border:"1px solid rgba(60,180,60,.2)", borderRadius:7, padding:"9px 12px" }}>
                  <div style={{ fontSize:10, color:"#60c060", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:5 }}>✦ Benefits</div>
                  <div style={{ fontSize:11, color:C.textMid, lineHeight:1.6 }}>
                    {(activeKit.benefits||"").length > 280
                      ? (activeKit.benefits||"").slice(0,280)+"…"
                      : (activeKit.benefits||"")}
                  </div>
                </div>
              )}
              {activeKit.hindrances && (
                <div style={{ background:"rgba(200,80,40,.06)",
                  border:"1px solid rgba(200,80,40,.2)", borderRadius:7, padding:"9px 12px" }}>
                  <div style={{ fontSize:10, color:"#e06040", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:5 }}>⚠ Hindrances</div>
                  <div style={{ fontSize:11, color:C.textMid, lineHeight:1.6 }}>
                    {(activeKit.hindrances||"").length > 280
                      ? (activeKit.hindrances||"").slice(0,280)+"…"
                      : (activeKit.hindrances||"")}
                  </div>
                </div>
              )}
            </div>

            {/* NWP sections */}
            {((activeKit.nwpRequired||[]).length>0 || (activeKit.nwpRecommended||[]).length>0) && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:8 }}>
                {(activeKit.nwpRequired||[]).length > 0 && (
                  <div>
                    <div style={{ fontSize:10, color:C.red, letterSpacing:2,
                      textTransform:"uppercase", marginBottom:5 }}>✱ Required Proficiencies</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {(activeKit.nwpRequired||[]).map(p => {
                        const ok = profNamePicked(p);
                        return (
                          <span key={p} style={{ fontSize:11,
                            color: ok ? "#60c060" : C.red,
                            background: ok ? "rgba(60,160,60,.1)" : "rgba(200,50,50,.08)",
                            border:`1px solid ${ok ? "rgba(60,160,60,.25)" : "rgba(200,50,50,.25)"}`,
                            borderRadius:4, padding:"2px 7px" }}>
                            {ok ? "✓" : "✗"} {p}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
                {(activeKit.nwpRecommended||[]).length > 0 && (
                  <div>
                    <div style={{ fontSize:10, color:C.gold, letterSpacing:2,
                      textTransform:"uppercase", marginBottom:5 }}>★ Recommended Proficiencies (–1 CP)</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {(activeKit.nwpRecommended||[]).map(p => {
                        const ok = profNamePicked(p);
                        return (
                          <span key={p} style={{ fontSize:11,
                            color: ok ? C.gold : C.textDim,
                            background: ok ? "rgba(212,160,53,.1)" : "transparent",
                            border:`1px solid ${ok ? "rgba(212,160,53,.3)" : C.border}`,
                            borderRadius:4, padding:"2px 7px" }}>
                            {ok ? "✓" : "◦"} {p}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Rulebreaker for required NWP */}
            {(activeKit.nwpRequired||[]).length > 0 && !nwpOk && (
              <div style={{ fontSize:11, color:C.red, marginTop:6 }}>
                ⚠ Required proficiencies not yet selected — see <strong>VI. Proficiencies</strong> tab
                {!ruleBreaker && " (or enable Rule Breaker to override)"}
              </div>
            )}

            {/* Weapon Proficiencies */}
            {((activeKit.wpRequired||activeKit.weapon_req||[]).length > 0 || (activeKit.wpRecommended||activeKit.weapon_profs||[]).length > 0) && (
              <div style={{ marginTop:8 }}>
                <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
                  textTransform:"uppercase", marginBottom:5 }}>Weapon Proficiencies</div>
                <div style={{ fontSize:11, color:C.textDim, lineHeight:1.6 }}>
                  {(activeKit.wpRequired||[]).length > 0 && (
                    <span><span style={{ color:C.red }}>Required:</span> {(activeKit.wpRequired||[]).join(', ')}. </span>
                  )}
                  {(activeKit.wpRecommended||activeKit.weapon_profs||[]).length > 0 && (
                    <span><span style={{ color:C.gold }}>Recommended:</span> {(activeKit.wpRecommended||activeKit.weapon_profs||[]).join(', ')}</span>
                  )}
                </div>
              </div>
            )}

            {/* Wealth */}
            {activeKit.wealth && (
              <div style={{ marginTop:8, fontSize:11, color:C.textDim }}>
                <span style={{ color:C.textBri }}>💰 Wealth: </span>{activeKit.wealth}
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Class Handbook Kits ── */}
      {classKits.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <div style={{ fontSize:10, color:"#6090d8", letterSpacing:3,
            textTransform:"uppercase", marginBottom:12 }}>
            📖 {(ALL_CLASSES.find(c=>c.id===selectedClass)?.label ?? "")} Handbook Kits
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
            {classKits.map(kit => <KitCard key={kit.id} kit={kit} />)}
          </div>
        </div>
      )}

      {/* ── Standard S&P Kits ── */}
      <div>
        <div style={{ fontSize:10, color:C.gold, letterSpacing:3,
          textTransform:"uppercase", marginBottom:12 }}>
          ✦ Standard S&P Kits (Chapter 5) — available to any class
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))", gap:8 }}>
          {SP_KITS.map(kit => <KitCard key={kit.id} kit={kit} compact />)}
        </div>
      </div>
    </div>
  );
}
