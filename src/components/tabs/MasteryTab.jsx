import { C } from "../../data/constants.js";
import {
  MASTERY_TIERS, STYLE_SPECS, WOC_CP, NUM_ATTACKS, specCol,
  WEAPON_GROUPS_49, WEAPON_CANONICAL_IDS, canonicalWeapId,
} from "../../data/weapons.js";
import { ChHead, GroupLabel } from "../ui/index.js";

// Automatically determine weapon type (melee vs ranged) from canonical weapon ID prefix
function autoWeapType(canonId) {
  if (canonId.startsWith("wb_") || canonId.startsWith("wd_") || canonId.startsWith("wh_")) return "ranged";
  if (canonId === "wm_sling" || canonId === "wm_blowgun" || canonId === "wm_bolas" ||
      canonId === "wm_boomerang" || canonId === "wm_throwing_star") return "ranged";
  return "melee";
}

// Build the list of proficient weapons from the character's weapPicked state.
// Returns unique weapon objects (deduplicated by name, canonical preferred).
function buildProfWeapons(weapPicked) {
  const byName = new Map(); // lowercase name → weapon object
  const addW = (w) => {
    if (w.id.startsWith("wsp_")) return; // skip shield/armor special profs
    const key = w.name.toLowerCase();
    if (!byName.has(key)) {
      byName.set(key, w);
    } else if (!w.dupe && byName.get(key)?.dupe) {
      byName.set(key, w); // upgrade to canonical (non-dupe) entry
    }
  };
  WEAPON_GROUPS_49.forEach(bg => {
    if (weapPicked[bg.id] === "broad") {
      // Broad group: all tight group members + unrelated
      bg.tightGroups.forEach(tg => tg.weapons.forEach(addW));
      bg.unrelated.forEach(addW);
    } else {
      bg.tightGroups.forEach(tg => {
        if (weapPicked[tg.id] === "tight") {
          // Tight group: all members
          tg.weapons.forEach(addW);
        } else {
          // Check individual single picks within tight groups
          tg.weapons.forEach(w => { if (weapPicked[w.id] === "single") addW(w); });
        }
      });
      // Individual unrelated weapon picks
      bg.unrelated.forEach(w => { if (weapPicked[w.id] === "single") addW(w); });
    }
  });
  return [...byName.values()];
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

  const col       = specCol(selectedClass);
  const isWarrior = col === "fighter" || col === "rp";

  const combatWeapons = buildProfWeapons(weapPicked);

  // Get the canonical ID for any weapon object (use for masteryPicked/wocPicked keys)
  const cId = (w) => canonicalWeapId(w);

  // Weapons that have any mastery tier (spec or higher) — shown in Section C
  const specWeapons = combatWeapons.filter(w => !!masteryPicked[cId(w)]);

  const tierName = (tier) => MASTERY_TIERS.find(t => t.id === tier)?.name ?? tier;

  // ── Section B: toggle spec on a weapon (auto type detection) ──────
  const toggleSpec = (canonId, displayName) => {
    const cur = masteryPicked[canonId];
    if (cur) {
      // Any tier present → remove specialization entirely
      setMasteryPicked(p => { const n = { ...p }; delete n[canonId]; return n; });
    } else {
      const t = MASTERY_TIERS.find(x => x.id === "spec");
      if (!t) return;
      const cost = t.cp[col];
      if (!cost) return; // class can't specialize
      const type = autoWeapType(canonId);
      const doIt = () => setMasteryPicked(p => ({ ...p, [canonId]: { tier: "spec", type } }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({
          msg: `"Specialization: ${displayName}" costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); },
        });
      } else doIt();
    }
  };

  // ── Section C: toggle mastery/highmastery/grandmastery tier+type ──
  const toggleMastery = (canonId, tier, type) => {
    const cur = masteryPicked[canonId];
    if (cur && cur.tier === tier && cur.type === type) {
      // Deactivate → revert to spec
      setMasteryPicked(p => ({ ...p, [canonId]: { tier: "spec", type: autoWeapType(canonId) } }));
    } else {
      const t = MASTERY_TIERS.find(x => x.id === tier);
      if (!t) return;
      const cost = t.cp[col];
      if (!cost) return;
      const doIt = () => setMasteryPicked(p => ({ ...p, [canonId]: { tier, type } }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({
          msg: `"${tierName(tier)}" costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); },
        });
      } else doIt();
    }
  };

  // ── Fighting style toggle ─────────────────────────────────────────
  const toggleStyle = (sid, level) => {
    const cur = stylePicked[sid];
    if (cur === level) {
      setStylePicked(p => { const n = { ...p }; delete n[sid]; return n; });
    } else {
      const st = STYLE_SPECS.find(x => x.id === sid);
      if (!st) return;
      const cost = level === "enhanced" && st.hasEnhanced ? (st.enhCp[col] ?? 6) : (st.cp[col] ?? 3);
      const doIt = () => setStylePicked(p => ({ ...p, [sid]: level }));
      if (remainCP < cost && !ruleBreaker) {
        setConfirmBox({
          msg: `"${st.name}" (${level}) costs ${cost} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
          onConfirm: () => { setRuleBreaker(true); doIt(); },
        });
      } else doIt();
    }
  };

  const MASTERY_TIER_IDS = ["mastery", "highmastery", "grandmastery"];
  const specTierCost = MASTERY_TIERS.find(x => x.id === "spec")?.cp[col];

  // Style eligible classes label
  const eligibleLabel = (st) => {
    if (!st.eligible) return null;
    const labels = { fighter:"Fighter", rp:"Rgr/Pal", rogue:"Rogue", priest:"Priest", wizard:"Wizard" };
    return st.eligible.map(c => labels[c] ?? c).join(", ");
  };

  return (
    <div>
      <ChHead icon="⭐" num="Chapter 8" title="Specialization & Mastery"
        sub="Weapon of choice, specialization, mastery tiers, and fighting style specializations." />

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
        </div>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {combatWeapons.length === 0 && (
            <div style={{ color:C.textDim, fontSize:11, fontStyle:"italic" }}>
              Pick weapons in Tab VII first.
            </div>
          )}
          {combatWeapons.map(w => {
            const canonId = cId(w);
            const isPicked = wocPicked === canonId;
            return (
              <div key={canonId} onClick={() => {
                  const doIt = () => setWocPicked(isPicked ? null : canonId);
                  if (!isPicked && remainCP < (WOC_CP[col] ?? 3) && !ruleBreaker) {
                    setConfirmBox({
                      msg: `Weapon of Choice costs ${WOC_CP[col]??3} CP but only ${remainCP} available.\n\nEnable Rule-Breaker?`,
                      onConfirm: () => { setRuleBreaker(true); doIt(); },
                    });
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
              const canonId = cId(w);
              const pick = masteryPicked[canonId];
              const isAnySpec = !!pick;
              return (
                <div key={canonId} onClick={() => toggleSpec(canonId, w.name)}
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
                      {tierName(pick.tier)} · {pick.type}
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
            const canonId = cId(w);
            const pick = masteryPicked[canonId];
            const curTier = pick?.tier;
            const curType = pick?.type;
            const hasMastery = curTier && curTier !== "spec";
            return (
              <div key={canonId} style={{ marginBottom:12, padding:"12px 16px",
                background: hasMastery ? "linear-gradient(145deg,#1a1208,#141008)" : C.card,
                border:`1px solid ${hasMastery ? C.borderHi : C.border}`,
                borderRadius:9, transition:"all .15s" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:"bold",
                    color: hasMastery ? C.gold : C.textBri }}>
                    {hasMastery && "★ "}{w.name}
                  </span>
                  {hasMastery && (
                    <span style={{ fontSize:10, color:C.amber, marginLeft:4,
                      background:"rgba(212,160,53,.1)", border:`1px solid ${C.amber}`,
                      borderRadius:3, padding:"1px 6px" }}>
                      {tierName(curTier)} · {curType}
                    </span>
                  )}
                  {!hasMastery && (
                    <span style={{ fontSize:10, color:"#666" }}>
                      (specialized — pick a mastery tier below)
                    </span>
                  )}
                </div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {MASTERY_TIERS.filter(t => MASTERY_TIER_IDS.includes(t.id)).map(tier => {
                    const cost = tier.cp[col];
                    if (!cost) return null;
                    const minLvl = tier.minLvl[col];
                    return tier.types.map(type => {
                      const isActive = curTier === tier.id && curType === type;
                      return (
                        <button key={tier.id + type} onClick={() => toggleMastery(canonId, tier.id, type)}
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
        <div style={{ marginBottom:10, padding:"8px 13px",
          background:"rgba(0,0,0,.25)", border:`1px solid ${C.border}`, borderRadius:6,
          fontSize:10, color:C.textDim, lineHeight:1.5 }}>
          Warriors: unlimited styles · Priests / Rogues: max 1 style · Wizards: max 1 style (+1 CP extra slot)
          {" · "}Non-eligible class: spend 1 additional CP with the weapon proficiency purchase.
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:10 }}>
          {STYLE_SPECS.map(st => {
            const basicCost = st.cp[col] ?? 3;
            const enhCost   = st.hasEnhanced ? (st.enhCp[col] ?? basicCost + 2) : null;
            const cur       = stylePicked[st.id];
            const basicOn   = !!cur;
            const enhOn     = cur === "enhanced";
            const isEligible = !st.eligible || st.eligible.includes(col);

            return (
              <div key={st.id} style={{
                background: basicOn ? "linear-gradient(145deg,#181510,#120e08)" : C.card,
                border:`1px solid ${basicOn ? C.borderHi : C.border}`,
                borderRadius:9, padding:"11px 14px",
                transition:"all .15s",
                opacity: isEligible ? 1 : 0.65,
              }}>
                {/* Header row */}
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:5 }}>
                  <div style={{ fontWeight:"bold", fontSize:12, color: basicOn ? C.gold : C.textBri }}>
                    {basicOn && "★ "}{st.name}
                  </div>
                  {!isEligible && (
                    <span style={{ fontSize:9, color:C.amber, border:`1px solid ${C.amber}`,
                      borderRadius:3, padding:"1px 5px", flexShrink:0, marginLeft:6 }}>
                      non-class +1cp
                    </span>
                  )}
                </div>

                {/* Eligible classes */}
                {st.eligible && (
                  <div style={{ fontSize:9, color:"#666", marginBottom:5 }}>
                    Eligible: {eligibleLabel(st)}
                  </div>
                )}

                {/* Stat bonuses row */}
                <div style={{ display:"flex", gap:8, fontSize:10, marginBottom:6, flexWrap:"wrap" }}>
                  {[
                    ["Hit", st.hit], ["Dmg", st.dmg], ["Ini", st.ini], ["AC", st.ac]
                  ].map(([label, val]) => val !== null && val !== undefined && val !== 0 ? (
                    <span key={label} style={{
                      color: String(val).includes("-") ? C.red : C.green,
                      fontWeight:"bold",
                    }}>
                      {label}: {String(val).startsWith("*") || String(val).startsWith("+") || String(val).startsWith("-") ? val : (typeof val === "number" && val > 0 ? `+${val}` : val)}
                    </span>
                  ) : null)}
                </div>

                {/* Description */}
                <div style={{ fontSize:10, color:C.textDim, marginBottom:8, lineHeight:1.5 }}>
                  {st.desc}
                </div>

                {/* Enhanced description (if available) */}
                {st.hasEnhanced && st.enhDesc && !enhOn && (
                  <div style={{ fontSize:9, color:"#666", marginBottom:8, fontStyle:"italic" }}>
                    Enhanced: {st.enhDesc}
                  </div>
                )}

                {/* Buttons */}
                <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                  <button onClick={() => toggleStyle(st.id, "basic")}
                    style={{
                      fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                      background: basicOn && !enhOn ? "rgba(212,160,53,.2)" : "rgba(0,0,0,.35)",
                      border:`1px solid ${basicOn && !enhOn ? C.gold : C.border}`,
                      color: basicOn && !enhOn ? C.gold : C.textDim,
                      fontFamily:"inherit",
                    }}>
                    {basicOn && !enhOn ? "✓ " : "⊕ "}Basic ({basicCost} CP)
                  </button>
                  {st.hasEnhanced && enhCost && (
                    <button onClick={() => toggleStyle(st.id, "enhanced")}
                      style={{
                        fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                        background: enhOn ? "rgba(212,160,53,.3)" : "rgba(0,0,0,.35)",
                        border:`1px solid ${enhOn ? C.gold : C.border}`,
                        color: enhOn ? C.gold : C.textDim,
                        fontFamily:"inherit",
                      }}>
                      {enhOn ? "✓ " : "⊕ "}Enhanced ({enhCost} CP total)
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
              {NUM_ATTACKS.map((row, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "rgba(0,0,0,.2)" : "transparent" }}>
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
        <GroupLabel>⚠ Nonproficiency Attack Penalties</GroupLabel>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {[
            { cls:"Warrior",    np:"–2", fam:"–1" },
            { cls:"Priest",     np:"–3", fam:"–2" },
            { cls:"Rogue",      np:"–3", fam:"–2" },
            { cls:"Wizard",     np:"–5", fam:"–3" },
            { cls:"Psionicist", np:"–4", fam:"–2" },
          ].map(row => (
            <div key={row.cls} style={{ padding:"7px 13px", borderRadius:7,
              background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`, fontSize:11 }}>
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
