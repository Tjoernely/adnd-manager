import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { MASTERY_TIERS, STYLE_SPECS, WOC_CP, WOC_BONUS, NUM_ATTACKS, specCol, WEAPON_GROUPS_49 } from "../../data/weapons.js";

import { ChHead, GroupLabel } from "../ui/index.js";

// Automatically determine weapon type (melee vs ranged) from weapon ID prefix
function autoWeapType(weapId) {
  if (weapId.startsWith("wb_") || weapId.startsWith("wd_") || weapId.startsWith("wh_")) return "ranged";
  if (weapId === "wm_sling") return "ranged";
  return "melee";
}

export function MasteryTab(props) {
  const {
    weapPicked, masteryPicked, setMasteryPicked,
    wocPicked, setWocPicked,
    stylePicked, setStylePicked,
    selectedClass, remainCP, mastCPSp,
    ruleBreaker, setRuleBreaker,
    setInfoModal, setConfirmBox,
  } = props;

  const col      = specCol(selectedClass);
  const isWarrior = col === "fighter" || col === "rp";

  // All weapons the character is proficient in (individual picks from Tab VII)
  const profWeapons = [];
  WEAPON_GROUPS_49.forEach(bg => {
    if (weapPicked[bg.id] === "broad") {
      bg.tightGroups.forEach(tg => tg.weapons.forEach(w => profWeapons.push(w)));
      bg.unrelated.forEach(w => profWeapons.push(w));
    }
    bg.tightGroups.forEach(tg => {
      if (weapPicked[tg.id] === "tight" || weapPicked[bg.id] === "broad") {
        tg.weapons.forEach(w => { if (!profWeapons.find(x=>x.id===w.id)) profWeapons.push(w); });
      }
    });
    bg.unrelated.forEach(w => {
      if (weapPicked[w.id]) { if (!profWeapons.find(x=>x.id===w.id)) profWeapons.push(w); }
    });
  });
  // Remove shield/armor special profs and dupe entries
  const combatWeapons = profWeapons.filter(w => !w.id.startsWith("wsp_") && !w.dupe);

  // Weapons that have any mastery tier (spec or higher) — shown in Section C
  const specWeapons = combatWeapons.filter(w => !!masteryPicked[w.id]);

  const tierLabel = (tier) => MASTERY_TIERS.find(t=>t.id===tier)?.name ?? tier;

  // Section B: toggle spec on a weapon (simple on/off, auto type)
  const toggleSpec = (weapId) => {
    const cur = masteryPicked[weapId];
    if (cur) {
      // Any tier → remove specialization entirely
      setMasteryPicked(p => { const n={...p}; delete n[weapId]; return n; });
    } else {
      const t = MASTERY_TIERS.find(x=>x.id==="spec");
      if (!t) return;
      const cost = t.cp[col];
      if (!cost) return; // class can't specialize
      const type = autoWeapType(weapId);
      const doIt = () => setMasteryPicked(p => ({ ...p, [weapId]: { tier: "spec", type } }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({ msg: `"Specialization" costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); } });
      } else doIt();
    }
  };

  // Section C: toggle mastery/highmastery/grandmastery tier+type
  const toggleMastery = (weapId, tier, type) => {
    const cur = masteryPicked[weapId];
    if (cur && cur.tier === tier && cur.type === type) {
      // Deactivate → revert to spec
      setMasteryPicked(p => ({ ...p, [weapId]: { tier: "spec", type: autoWeapType(weapId) } }));
    } else {
      const t = MASTERY_TIERS.find(x=>x.id===tier);
      if (!t) return;
      const cost = t.cp[col];
      if (!cost) return;
      const doIt = () => setMasteryPicked(p => ({ ...p, [weapId]: { tier, type } }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({ msg: `"${tierLabel(tier)}" costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); } });
      } else doIt();
    }
  };

  const toggleStyle = (sid, level) => {
    const cur = stylePicked[sid];
    if (cur === level) {
      setStylePicked(p => { const n={...p}; delete n[sid]; return n; });
    } else {
      const st = STYLE_SPECS.find(x=>x.id===sid);
      if (!st) return;
      const cost = level === "enhanced" && st.hasEnhanced ? (st.enhCp[col]??6) : (st.cp[col]??3);
      const doIt = () => setStylePicked(p => ({ ...p, [sid]: level }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({ msg: `"${st.name}" (${level}) costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); } });
      } else doIt();
    }
  };

  const MASTERY_TIER_IDS = ["mastery","highmastery","grandmastery"];
  const specTierCost = MASTERY_TIERS.find(x=>x.id==="spec")?.cp[col];

  return (
    <div>
      <ChHead icon="⭐" num="Chapter 8" title="Specialization & Mastery"
        sub="Weapon of choice, specialization, mastery tiers, and fighting style specializations. CP costs vary by class." />

      {/* CP Summary bar */}
      <div style={{ marginBottom:18, padding:"12px 18px",
        background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
        borderRadius:8, display:"flex", gap:20, flexWrap:"wrap", fontSize:12, alignItems:"center" }}>
        <span style={{ color:C.textDim }}>
          CP Available: <strong style={{ color:C.gold, fontSize:15 }}>{remainCP}</strong>
        </span>
        <span style={{ color:C.textDim }}>
          Ch.8 CP Spent: <strong style={{ color:C.amber }}>{mastCPSp}</strong>
        </span>
        {!selectedClass && (
          <span style={{ color:C.red, fontSize:11 }}>⚠ Select a class first for correct CP costs</span>
        )}
      </div>

      {/* ── SECTION A: Weapon of Choice ───────────────────────────────── */}
      <div style={{ marginBottom:28 }}>
        <GroupLabel>🎯 A. Weapon of Choice</GroupLabel>
        <div style={{ marginBottom:10, padding:"10px 14px",
          background:"rgba(80,130,200,.06)", border:"1px solid rgba(80,130,200,.25)",
          borderRadius:8, fontSize:11, color:C.textDim }}>
          Cost: <strong style={{ color:C.blue }}>{WOC_CP[col] ?? 3} CP</strong>
          {" · "}Bonus: <strong style={{ color:C.green }}>+1 to hit</strong> with the chosen weapon.
          No bonus to damage, initiative, or AC.
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {combatWeapons.map(w => {
            const isPicked = wocPicked === w.id;
            return (
              <div key={w.id} onClick={() => {
                  const doIt = () => setWocPicked(isPicked ? null : w.id);
                  if (!isPicked && remainCP < (WOC_CP[col]??3) && !ruleBreaker) {
                    setConfirmBox({ msg: `Weapon of Choice costs ${WOC_CP[col]??3} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
                      onConfirm:()=>{ setRuleBreaker(true); doIt(); } });
                  } else doIt();
                }}
                style={{
                  background: isPicked ? "rgba(80,130,200,.22)" : "rgba(0,0,0,.3)",
                  border:`1px solid ${isPicked ? "rgba(80,150,220,.6)" : C.border}`,
                  borderRadius:6, padding:"5px 11px", fontSize:11,
                  color: isPicked ? "#a0c8f0" : C.textDim, cursor:"pointer",
                  transition:"all .12s",
                }}>
                {isPicked && "🎯 "}{w.name}
              </div>
            );
          })}
          {combatWeapons.length === 0 && (
            <div style={{ color:C.textDim, fontSize:11, fontStyle:"italic" }}>
              Pick weapons in Tab VII first.
            </div>
          )}
        </div>
      </div>

      {/* ── SECTION B: Specialization ─────────────────────────────────── */}
      <div style={{ marginBottom:28 }}>
        <GroupLabel>⭐ B. Specialization</GroupLabel>
        {!specTierCost && selectedClass && (
          <div style={{ padding:"10px 14px", background:C.card, border:`1px solid ${C.border}`,
            borderRadius:8, color:C.textDim, fontSize:12, fontStyle:"italic", marginBottom:8 }}>
            This class cannot specialize in weapons.
          </div>
        )}
        {combatWeapons.length === 0 && (
          <div style={{ padding:"14px 18px", background:C.card, border:`1px solid ${C.border}`,
            borderRadius:8, color:C.textDim, fontSize:12, fontStyle:"italic" }}>
            No weapon proficiencies selected yet. Go to Tab VII to pick weapons first.
          </div>
        )}
        {specTierCost > 0 && (
          <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
            {combatWeapons.map(w => {
              const pick = masteryPicked[w.id];
              const isAnySpec = !!pick;
              return (
                <div key={w.id} onClick={() => toggleSpec(w.id)}
                  style={{
                    background: isAnySpec ? "rgba(212,160,53,.2)" : "rgba(0,0,0,.3)",
                    border:`1px solid ${isAnySpec ? C.gold : C.border}`,
                    borderRadius:6, padding:"6px 12px", fontSize:11,
                    color: isAnySpec ? C.gold : C.textDim, cursor:"pointer",
                    transition:"all .12s", display:"flex", alignItems:"center", gap:6,
                  }}>
                  {isAnySpec ? "★ " : "⊕ "}{w.name}
                  {!isAnySpec && <span style={{ color:"#888", fontSize:10 }}>{specTierCost}cp</span>}
                  {isAnySpec && (
                    <span style={{ fontSize:10, color:C.amber }}>
                      {tierLabel(pick.tier)} · {pick.type}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── SECTION C: Mastery Tiers (warriors & rangers/paladins only) ── */}
      {isWarrior && (
        <div style={{ marginBottom:28 }}>
          <GroupLabel>⚔ C. Mastery Tiers</GroupLabel>
          {specWeapons.length === 0 && (
            <div style={{ padding:"14px 18px", background:C.card, border:`1px solid ${C.border}`,
              borderRadius:8, color:C.textDim, fontSize:12, fontStyle:"italic" }}>
              Specialize in weapons first (Section B) to unlock Mastery tiers.
            </div>
          )}
          {specWeapons.map(w => {
            const pick = masteryPicked[w.id];
            const curTier = pick?.tier;
            const curType = pick?.type;
            const hasMastery = curTier && curTier !== "spec";

            return (
              <div key={w.id} style={{ marginBottom:12, padding:"12px 16px",
                background: hasMastery ? "linear-gradient(145deg,#1a1208,#141008)" : C.card,
                border:`1px solid ${hasMastery ? C.borderHi : C.border}`,
                borderRadius:9, transition:"all .15s" }}>
                {/* Weapon name row */}
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:"bold",
                    color: hasMastery ? C.gold : C.textBri }}>
                    {hasMastery && "★ "}{w.name}
                  </span>
                  {hasMastery && (
                    <span style={{ fontSize:10, color:C.amber, marginLeft:4,
                      background:"rgba(212,160,53,.1)", border:`1px solid ${C.amber}`,
                      borderRadius:3, padding:"1px 6px" }}>
                      {tierLabel(curTier)} · {curType}
                    </span>
                  )}
                  {!hasMastery && (
                    <span style={{ fontSize:10, color:"#666" }}>
                      (specialized — pick a mastery tier below)
                    </span>
                  )}
                </div>
                {/* Mastery tier buttons */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {MASTERY_TIERS.filter(t => MASTERY_TIER_IDS.includes(t.id)).map(tier => {
                    const cost = tier.cp[col];
                    if (!cost) return null;
                    const minLvl = tier.minLvl[col];
                    return tier.types.map(type => {
                      const isActive = curTier === tier.id && curType === type;
                      return (
                        <button key={tier.id+type} onClick={() => toggleMastery(w.id, tier.id, type)}
                          title={tier.desc}
                          style={{
                            fontSize:10, padding:"4px 10px", borderRadius:5, cursor:"pointer",
                            background: isActive ? "rgba(212,160,53,.25)" : "rgba(0,0,0,.3)",
                            border:`1px solid ${isActive ? C.gold : C.border}`,
                            color: isActive ? C.gold : C.textDim,
                            fontFamily:"inherit", transition:"all .13s",
                          }}>
                          {tier.name} {type === "melee" ? "⚔" : "🏹"}
                          <span style={{ color:"#888", marginLeft:5 }}>{cost}cp</span>
                          {minLvl && <span style={{ color:"#666", marginLeft:3 }}>lv{minLvl}+</span>}
                        </button>
                      );
                    });
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SECTION D: Fighting Style Specializations ─────────────────── */}
      <div style={{ marginBottom:28 }}>
        <GroupLabel>🛡 D. Fighting Style Specializations</GroupLabel>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:10 }}>
          {STYLE_SPECS.map(st => {
            const basicCost = st.cp[col] ?? 3;
            const enhCost   = st.hasEnhanced ? (st.enhCp[col] ?? 6) : null;
            const cur       = stylePicked[st.id];
            const basicOn   = !!cur;
            const enhOn     = cur === "enhanced";

            return (
              <div key={st.id} style={{
                background: basicOn ? "linear-gradient(145deg,#181510,#120e08)" : C.card,
                border:`1px solid ${basicOn ? C.borderHi : C.border}`,
                borderRadius:9, padding:"11px 14px",
                transition:"all .15s",
              }}>
                <div style={{ fontWeight:"bold", fontSize:12,
                  color: basicOn ? C.gold : C.textBri, marginBottom:5 }}>
                  {basicOn && "★ "}{st.name}
                </div>
                {/* Stat bonuses row */}
                <div style={{ display:"flex", gap:8, fontSize:10, marginBottom:6, flexWrap:"wrap" }}>
                  {[
                    ["Hit",st.hit], ["Dmg",st.dmg], ["Ini",st.ini], ["AC",st.ac]
                  ].map(([label, val]) => val !== null && val !== 0 ? (
                    <span key={label} style={{ color:String(val).startsWith("-")?C.red:C.green }}>
                      {label}: {String(val).startsWith("*") ? val : (val > 0 ? `+${val}` : val)}
                    </span>
                  ) : null)}
                </div>
                <div style={{ fontSize:10, color:C.textDim, marginBottom:8, lineHeight:1.4 }}>
                  {st.desc}
                </div>
                {/* Buttons */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button onClick={()=>toggleStyle(st.id, "basic")}
                    style={{ fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                      background: basicOn&&!enhOn ? "rgba(212,160,53,.2)" : "rgba(0,0,0,.35)",
                      border:`1px solid ${basicOn&&!enhOn ? C.gold : C.border}`,
                      color: basicOn&&!enhOn ? C.gold : C.textDim,
                      fontFamily:"inherit" }}>
                    {basicOn&&!enhOn ? "✓ " : "⊕ "}Basic ({basicCost} CP)
                  </button>
                  {st.hasEnhanced && (
                    <button onClick={()=>toggleStyle(st.id, "enhanced")}
                      style={{ fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                        background: enhOn ? "rgba(212,160,53,.3)" : "rgba(0,0,0,.35)",
                        border:`1px solid ${enhOn ? C.gold : C.border}`,
                        color: enhOn ? C.gold : C.textDim,
                        fontFamily:"inherit" }}>
                      {enhOn ? "✓ " : "⊕ "}Enhanced ({enhCost} CP)
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── SECTION E: Number of Attacks Reference ─────────────────────── */}
      <div style={{ marginBottom:16 }}>
        <GroupLabel>📊 Number of Attacks Reference (specialized)</GroupLabel>
        <div style={{ overflowX:"auto" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:11 }}>
            <thead>
              <tr>
                {["Base Rate","Weapon","Level 1–6","Level 7–12","Level 13+"].map(h => (
                  <th key={h} style={{ textAlign:"left", padding:"5px 10px",
                    background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                    color:C.textDim, fontSize:10, letterSpacing:1 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {NUM_ATTACKS.map((row,i) => (
                <tr key={i} style={{ background: i%2===0?"rgba(0,0,0,.2)":"transparent" }}>
                  <td style={{ padding:"4px 10px", border:`1px solid ${C.border}`, color:"#8888a0", textAlign:"center" }}>{row.rate}</td>
                  <td style={{ padding:"4px 10px", border:`1px solid ${C.border}`, color:C.text }}>{row.weapon}</td>
                  <td style={{ padding:"4px 10px", border:`1px solid ${C.border}`, color:"#90d080", textAlign:"center" }}>{row.lv1}</td>
                  <td style={{ padding:"4px 10px", border:`1px solid ${C.border}`, color:"#a0e090", textAlign:"center" }}>{row.lv7}</td>
                  <td style={{ padding:"4px 10px", border:`1px solid ${C.border}`, color:"#b0f0a0", textAlign:"center" }}>{row.lv13}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── SECTION F: Nonproficiency Penalties Reference ───────────────── */}
      <div style={{ marginBottom:16 }}>
        <GroupLabel>⚠ Nonproficiency Attack Penalties (reference)</GroupLabel>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {[
            { cls:"Warrior",    np:"–2", fam:"–1" },
            { cls:"Priest",     np:"–3", fam:"–2" },
            { cls:"Rogue",      np:"–3", fam:"–2" },
            { cls:"Wizard",     np:"–5", fam:"–3" },
            { cls:"Psionicist", np:"–4", fam:"–2" },
          ].map(row => (
            <div key={row.cls} style={{ padding:"7px 13px", borderRadius:7,
              background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
              fontSize:11 }}>
              <span style={{ color:C.textBri, fontWeight:"bold" }}>{row.cls}</span>
              <span style={{ color:C.textDim, marginLeft:6 }}>
                Non-prof: <span style={{ color:C.red }}>{row.np}</span>
                {" · "}Familiar: <span style={{ color:C.amber }}>{row.fam}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
