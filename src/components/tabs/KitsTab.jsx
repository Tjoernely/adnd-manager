import { useState } from "react";
import { C, numInputStyle } from "../../data/constants.js";
import { SP_KITS, CLASS_KITS } from "../../data/kits.js";
import { ALL_CLASSES } from "../../data/classes.js";
import { getRankTable, getSocialRank, SOCIAL_RANKS_DEFAULT } from "../../data/socialStatus.js";
import { useKitsByClass } from "../../hooks/useKits.js";

import { ChHead } from "../ui/index.js";

export function KitsTab(props) {
  const {
    selectedClass, selectedKit, setSelectedKit, handleKitSelect,
    profsPicked, effSub, ruleBreaker,
    kitAlignOk, kitBarredOk,
    ALL_PROFS,
    socialStatus, rollSocialStatus, setSocialStatusOverride,
    kitFreeWeaponPick, setKitFreeWeaponPick,
  } = props;

  // Militant Wizard allowed free weapon proficiencies
  const MILITANT_WIZ_WEAPS = [
    { id:"wa_battle_axe",  name:"Battle Axe"       },
    { id:"wb_short_bow",   name:"Short Bow"         },
    { id:"wb_long_bow",    name:"Long Bow"          },
    { id:"wd_light_xbow",  name:"Light Crossbow"    },
    { id:"wd_heavy_xbow",  name:"Heavy Crossbow"    },
    { id:"we_dagger",      name:"Dagger"            },
    { id:"wh_javelin",     name:"Javelin"           },
    { id:"wm_sling",       name:"Sling"             },
    { id:"wh_spear",       name:"Spear"             },
    { id:"ws_short_sword", name:"Short Sword"       },
    { id:"ws_long_sword",  name:"Long Sword"        },
    { id:"ws_bastard_sword",name:"Bastard Sword"    },
    { id:"ws_broadsword",  name:"Broadsword"        },
    { id:"ws_2h_sword",    name:"Two-Handed Sword"  },
    { id:"wa_war_hammer",  name:"War Hammer"        },
  ];
  const _handleKitSelect = handleKitSelect ?? setSelectedKit;

  const [overrideInput, setOverrideInput] = useState(socialStatus?.override ?? "");

  const _ALL_PROFS = props.ALL_PROFS ?? [];

  // Fetch kits from API (normalized to static shape) — falls back to bundle on error
  const { kits: _apiKits } = useKitsByClass(selectedClass);
  const apiClassKits = _apiKits ? _apiKits.filter(k => !k.is_universal) : null;
  const apiSpKits    = _apiKits ? _apiKits.filter(k =>  k.is_universal) : null;


  // local variables that were inside the IIFE
  const classKits  = apiClassKits ?? (selectedClass ? (CLASS_KITS[selectedClass] ?? []) : []);
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
    ? ([...(apiSpKits ?? SP_KITS), ...classKits].find(k => k.id === selectedKit))
    : null;
  const activeKitStatsMet  = activeKit ? kitStatsMet(activeKit) : true;
  const activeKitNWPMet    = activeKit ? kitReqNWPMet(activeKit) : true;
  const isClassKit = id => classKits.some(k => k.id === id);
  // Kit class-restriction check (barredClasses)
  const kitClassOk = kit => {
    if (!kit.barredClasses?.length || !selectedClass) return true;
    return !kit.barredClasses.some(b => selectedClass.toLowerCase().includes(b.toLowerCase()));
  };

  // Render a single kit card
  const KitCard = ({ kit, compact }) => {
    const picked     = selectedKit === kit.id;
    const statOk     = kitStatsMet(kit);
    const classOk    = kitClassOk(kit);
    const eligible   = (statOk && classOk) || ruleBreaker;
    const isClass    = isClassKit(kit.id);
    const borderCol  = picked ? (isClass ? "#6090d8" : C.gold)
                     : !statOk ? C.red
                     : !classOk ? "#e08040"
                     : C.border;
    return (
      <div onClick={() => eligible ? _handleKitSelect(picked ? null : kit.id) : undefined}
        style={{
          background: picked
            ? (isClass ? "linear-gradient(145deg,#08101c,#060c14)"
                        : "linear-gradient(145deg,#1c1608,#141005)")
            : C.card,
          border: `1px solid ${borderCol}`,
          borderRadius: 9, padding: compact ? "9px 12px" : "11px 14px",
          cursor: eligible ? "pointer" : "not-allowed",
          transition: "all .15s",
          boxShadow: picked ? `0 0 12px ${isClass ? "rgba(80,130,220,.25)" : C.gold+"22"}` : "none",
          opacity: !eligible ? 0.5 : 1,
        }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom: compact ? 3 : 5 }}>
          <span style={{ fontSize:12, fontWeight:"bold",
            color: picked ? (isClass ? "#90b8f0" : C.gold) : (!statOk ? C.red : !classOk ? "#e08040" : C.textBri) }}>
            {picked ? "✓ " : ""}{kit.name}
          </span>
          <div style={{ display:"flex", gap:4, alignItems:"center" }}>
            {!statOk && (
              <span style={{ fontSize:9, color:C.red, border:`1px solid ${C.red}`,
                borderRadius:3, padding:"1px 4px", flexShrink:0 }}>
                {ruleBreaker ? "⚠ STAT" : "✗ STAT"}
              </span>
            )}
            {!classOk && (
              <span style={{ fontSize:9, color:"#e08040", border:`1px solid #c06020`,
                borderRadius:3, padding:"1px 4px", flexShrink:0 }}>
                {ruleBreaker ? "⚠ CLASS" : "✗ CLASS"}
              </span>
            )}
          </div>
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

            {/* Requirements text */}
            {activeKit.reqText && (
              <div style={{ marginBottom:10, padding:"7px 12px",
                background:"rgba(0,0,0,.25)", border:`1px solid ${C.border}`,
                borderRadius:6, fontSize:11, color:C.textDim, lineHeight:1.65 }}>
                <span style={{ color:C.textBri, marginRight:5 }}>📜 Requirements:</span>
                {activeKit.reqText}
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
                    {activeKit.benefits||""}
                  </div>
                </div>
              )}
              {activeKit.hindrances && (
                <div style={{ background:"rgba(200,80,40,.06)",
                  border:"1px solid rgba(200,80,40,.2)", borderRadius:7, padding:"9px 12px" }}>
                  <div style={{ fontSize:10, color:"#e06040", letterSpacing:2,
                    textTransform:"uppercase", marginBottom:5 }}>⚠ Hindrances</div>
                  <div style={{ fontSize:11, color:C.textMid, lineHeight:1.6 }}>
                    {activeKit.hindrances||""}
                  </div>
                </div>
              )}
            </div>

            {/* ── Militant Wizard: Free Weapon Proficiency Selector ── */}
            {activeKit.kitFreeWeapProf && (
              <div style={{ marginBottom:14, padding:"10px 14px",
                background:"rgba(80,130,200,.08)", border:`1px solid rgba(80,130,200,.35)`,
                borderRadius:8 }}>
                <div style={{ fontSize:10, color:"#70a8e8", letterSpacing:2,
                  textTransform:"uppercase", marginBottom:8 }}>
                  🗡️ Free Weapon Proficiency
                </div>
                <div style={{ fontSize:11, color:C.textDim, marginBottom:10, lineHeight:1.6 }}>
                  Choose one weapon from the list below. It counts as a free proficiency slot
                  (no CP cost) in addition to your normal wizard proficiencies.
                  Then add it in the <strong style={{ color:C.gold }}>Weapons tab</strong>{" "}
                  — it will cost 0 CP automatically.
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {MILITANT_WIZ_WEAPS.map(w => {
                    const sel = kitFreeWeaponPick === w.id;
                    return (
                      <button key={w.id} onClick={() =>
                        setKitFreeWeaponPick(sel ? null : w.id)
                      } style={{
                        padding:"4px 10px", borderRadius:5, cursor:"pointer",
                        fontSize:11, fontFamily:"inherit",
                        background: sel ? "rgba(80,130,200,.35)" : "rgba(0,0,0,.3)",
                        border: `1px solid ${sel ? "#70a8e8" : C.border}`,
                        color: sel ? "#a8d0ff" : C.textDim,
                        fontWeight: sel ? "bold" : "normal",
                        transition:"all .12s",
                      }}>
                        {sel ? "✓ " : ""}{w.name}
                      </button>
                    );
                  })}
                </div>
                {kitFreeWeaponPick && (
                  <div style={{ marginTop:8, fontSize:11, color:C.green }}>
                    ✓ Free proficiency: <strong>
                      {MILITANT_WIZ_WEAPS.find(w=>w.id===kitFreeWeaponPick)?.name ?? kitFreeWeaponPick}
                    </strong> — add it in the Weapons tab for 0 CP.
                  </div>
                )}
              </div>
            )}

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
          {(apiSpKits ?? SP_KITS).map(kit => <KitCard key={kit.id} kit={kit} compact />)}
        </div>
      </div>

      {/* ── Social Status ── */}
      <div style={{ marginTop:32 }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
          marginBottom:14, flexWrap:"wrap", gap:8 }}>
          <div style={{ fontSize:10, color:C.gold, letterSpacing:3, textTransform:"uppercase" }}>
            ⚜ Social Status (2d6)
          </div>
          {activeKit && (
            <div style={{ fontSize:10, color:C.amber }}>
              {activeKit.name} rank table active
            </div>
          )}
        </div>

        {/* Per-kit rank table + result display */}
        {(() => {
          const roll         = socialStatus?.rolled;
          const override     = socialStatus?.override;
          const displayRoll  = override ? parseInt(override) : roll;
          // Get rank table: per-kit if a kit is selected, otherwise default
          const rankTable    = getRankTable(activeKit?.name ?? "");
          const rank         = displayRoll ? getSocialRank(displayRoll, rankTable) : null;
          const isKitTable   = !!activeKit;

          return (
            <>
              {/* Result display */}
              <div style={{ marginBottom:14 }}>
                {rank ? (
                  <div style={{ padding:"14px 20px",
                    background:"rgba(0,0,0,.35)",
                    border:`2px solid ${rank.color}`, borderRadius:10,
                    display:"flex", alignItems:"center", gap:20, flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
                        textTransform:"uppercase", marginBottom:3 }}>Roll</div>
                      <div style={{ fontSize:32, fontWeight:"bold", color:rank.color, lineHeight:1 }}>
                        {displayRoll}
                      </div>
                    </div>
                    <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
                      <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
                        textTransform:"uppercase", marginBottom:3 }}>Tier</div>
                      <div style={{ fontSize:14, fontWeight:"bold", color:rank.color }}>
                        {rank.tier}
                      </div>
                    </div>
                    <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20, flex:1 }}>
                      <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
                        textTransform:"uppercase", marginBottom:3 }}>Status</div>
                      <div style={{ fontSize:16, fontWeight:"bold", color:C.textBri }}>
                        {rank.label}
                      </div>
                    </div>
                    {override && (
                      <span style={{ fontSize:9, padding:"2px 7px",
                        background:"rgba(212,160,53,.1)",
                        border:`1px solid ${C.gold}44`,
                        borderRadius:4, color:C.gold }}>
                        MANUAL
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ padding:"14px 20px",
                    background:"rgba(0,0,0,.25)",
                    border:`1px solid ${C.border}`, borderRadius:10,
                    fontSize:12, color:C.textDim, fontStyle:"italic" }}>
                    Click a rank, roll 2d6, or enter a value below.
                  </div>
                )}
              </div>

              {/* Clickable rank table */}
              <div style={{ marginBottom:14 }}>
                <div style={{ fontSize:9, color:C.textDim, letterSpacing:2,
                  textTransform:"uppercase", marginBottom:6 }}>
                  {isKitTable
                    ? `${activeKit.name} Rank Table — click any rank to set`
                    : "Rank Table (2d6) — click any rank to set"}
                </div>
                <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                  {rankTable.map(r => {
                    const isCur = displayRoll && displayRoll >= r.min && displayRoll <= r.max;
                    // Clicking picks the midpoint of the range (or min if single value)
                    const pickVal = r.min === r.max ? r.min : Math.round((r.min + r.max) / 2);
                    return (
                      <div key={r.min}
                        onClick={() => {
                          setOverrideInput(String(pickVal));
                          setSocialStatusOverride(String(pickVal));
                        }}
                        style={{
                          padding:"7px 14px", borderRadius:6, cursor:"pointer",
                          background: isCur ? `${r.color}22` : "rgba(0,0,0,.2)",
                          border:`1px solid ${isCur ? r.color : C.border}`,
                          color: isCur ? r.color : C.textDim,
                          display:"flex", alignItems:"center", gap:12,
                          transition:"all .12s",
                        }}
                        onMouseEnter={e => !isCur && (e.currentTarget.style.borderColor = r.color + "66")}
                        onMouseLeave={e => !isCur && (e.currentTarget.style.borderColor = C.border)}>
                        <span style={{ fontSize:11, fontWeight:"bold", minWidth:28,
                          color: isCur ? r.color : C.textDim }}>
                          {r.min}{r.min !== r.max ? `–${r.max}` : ""}
                        </span>
                        <span style={{ fontSize:11, fontWeight: isCur ? "bold" : "normal",
                          color: isCur ? r.color : C.textDim }}>
                          {r.tier}
                        </span>
                        <span style={{ fontSize:11, flex:1, color: isCur ? r.color+"cc" : "#504030" }}>
                          {r.label}
                        </span>
                        {isCur && (
                          <span style={{ fontSize:9, padding:"1px 5px",
                            background:`${r.color}22`, border:`1px solid ${r.color}66`,
                            borderRadius:3 }}>
                            ✓ CURRENT
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          );
        })()}

        {/* Controls */}
        <div style={{ display:"flex", gap:10, alignItems:"center", flexWrap:"wrap" }}>
          <button onClick={rollSocialStatus} style={{
            padding:"8px 18px", borderRadius:7, border:`1px solid ${C.gold}`,
            background:"rgba(212,160,53,.12)",
            color:C.gold, cursor:"pointer", fontFamily:"inherit", fontSize:12,
            fontWeight:"bold", letterSpacing:.5,
          }}>
            🎲 Roll 2d6
          </button>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:C.textDim }}>Manual value (2–12):</span>
            <input
              type="number" min={2} max={12} value={overrideInput}
              onChange={e => setOverrideInput(e.target.value)}
              onBlur={e => setSocialStatusOverride(e.target.value)}
              style={{ ...numInputStyle, width:50, textAlign:"center" }}
              placeholder="—"
            />
            {overrideInput && (
              <button onClick={() => { setOverrideInput(""); setSocialStatusOverride(""); }}
                style={{ padding:"2px 8px", borderRadius:4, fontSize:10,
                  background:"none", border:`1px solid ${C.border}`,
                  color:C.textDim, cursor:"pointer", fontFamily:"inherit" }}>
                ✕ Clear
              </button>
            )}
          </div>
          {!activeKit && (
            <span style={{ fontSize:10, color:C.textDim, fontStyle:"italic" }}>
              Select a kit for kit-specific status ranks
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
