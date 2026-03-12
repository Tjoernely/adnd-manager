// ThiefTab.jsx — AD&D 2E S&P Chapter 9: Thieving Abilities
import { C } from "../../data/constants.js";
import {
  THIEF_SKILLS, THIEF_CP_ABILS, THIEF_DISC_POINTS,
  THIEF_RACIAL_ADJ, THIEF_DEX_ADJ, THIEF_ARMOR_ADJ, THIEF_ARMOR_OPTIONS,
  getThiefRacialAdj, getThiefDexAdj, calcThiefSkill,
} from "../../data/thieving.js";
import { ChHead, IBtn, Checkbox } from "../ui/index.js";

// Color-code final skill %
function skillColor(pct) {
  if (pct < 20) return C.red;
  if (pct < 50) return C.amber;
  return C.green;
}

// Signed display helper
function sgn(n) {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${n}`;
  return "—";
}

export function ThiefTab(props) {
  const {
    selectedClass,
    selectedRace,
    modParent,
    thiefDiscPoints,
    thiefArmorType, setThiefArmorType,
    thiefCpAbils,
    adjustThiefDisc, toggleThiefCpAbil,
    THIEF_SKILLS: skillsDef,
    THIEF_CP_ABILS: cpAbilsDef,
    THIEF_DISC_POINTS: discPool,
    remainCP,
    setInfoModal,
    ruleBreaker,
  } = props;

  // Only show for thief / bard
  const isThief = selectedClass === "thief" || selectedClass === "bard";

  if (!isThief) {
    return (
      <div>
        <ChHead icon="🗝️" num="Chapter 9" title="Thieving Abilities"
          sub="Thieving skills are available to Thieves and Bards. Select one of those classes to access this section." />
        <div style={{ padding:"40px 0", textAlign:"center", color:C.textDim, fontStyle:"italic" }}>
          Select <strong style={{ color:C.gold }}>Thief</strong> or <strong style={{ color:C.gold }}>Bard</strong> in the Classes tab to unlock thieving abilities.
        </div>
      </div>
    );
  }

  // Derived adjustments
  const racialAdj = getThiefRacialAdj(selectedRace);
  const dexScore  = modParent("DEX");
  const dexAdj    = getThiefDexAdj(dexScore);
  const armorData = THIEF_ARMOR_ADJ[thiefArmorType] ?? THIEF_ARMOR_ADJ.padded_studded;
  const armorAdj  = armorData;

  // Total discretionary points used
  const discUsed = Object.values(thiefDiscPoints).reduce((s, v) => s + (v || 0), 0);
  const discLeft = discPool - discUsed;

  // Compute unlocked skill IDs based on purchased CP abilities
  const unlockedSkills = new Set(
    cpAbilsDef.flatMap(a => (thiefCpAbils[a.id] && a.unlocks) ? a.unlocks : [])
  );
  // Skills without gating are always unlocked
  const isUnlocked = (sk) => !sk.needsCp || unlockedSkills.has(sk.id);

  return (
    <div>
      <ChHead icon="🗝️" num="Chapter 9" title="Thieving Abilities"
        sub="60 discretionary points distributed in multiples of 5. Base + Racial (Table 28) + DEX (Table 29) + Armor (Table 30) + Discretionary = Final %." />

      {/* ── Armor Type Selector ── */}
      <div style={{ marginBottom:20, padding:"12px 18px",
        background:"rgba(0,0,0,.3)", border:`1px solid ${C.border}`, borderRadius:10 }}>
        <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
          textTransform:"uppercase", marginBottom:8 }}>Armor Type (Table 30)</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {THIEF_ARMOR_OPTIONS.map(key => {
            const arm  = THIEF_ARMOR_ADJ[key];
            const sel  = thiefArmorType === key;
            return (
              <button key={key} onClick={() => setThiefArmorType(key)}
                style={{
                  padding:"6px 14px", borderRadius:6, cursor:"pointer",
                  fontFamily:"inherit", fontSize:12,
                  background: sel ? "rgba(212,160,53,.18)" : "rgba(0,0,0,.3)",
                  border:`1px solid ${sel ? C.gold : C.border}`,
                  color: sel ? C.gold : C.textDim, transition:"all .13s",
                }}>
                {sel ? "✓ " : ""}{arm.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Discretionary Pool Summary ── */}
      <div style={{ marginBottom:20, padding:"12px 20px",
        background: discLeft < 0 ? "rgba(180,30,30,.12)" : "rgba(0,0,0,.3)",
        border:`2px solid ${discLeft < 0 ? C.redBri : discLeft === 0 ? C.border : C.border}`,
        borderRadius:10, display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
            textTransform:"uppercase", marginBottom:2 }}>Discretionary Points</div>
          <span style={{ fontSize:28, fontWeight:"bold",
            color: discLeft < 0 ? C.redBri : discLeft < 10 ? C.amber : C.gold }}>
            {discUsed} / {discPool}
          </span>
        </div>
        <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
            textTransform:"uppercase", marginBottom:2 }}>Remaining</div>
          <span style={{ fontSize:24, fontWeight:"bold",
            color: discLeft < 0 ? C.redBri : discLeft === 0 ? C.textDim : C.green }}>
            {discLeft}
          </span>
        </div>
        <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
            textTransform:"uppercase", marginBottom:2 }}>DEX ({dexScore})</div>
          <span style={{ fontSize:14, color:C.blue }}>
            Aim {dexScore}
          </span>
        </div>
        {discLeft < 0 && !ruleBreaker && (
          <div style={{ padding:"5px 12px", background:"rgba(200,40,40,.2)",
            border:`1px solid ${C.redBri}`, borderRadius:5,
            fontSize:12, color:C.redBri, fontWeight:"bold" }}>
            ✗ OVER BUDGET — Remove {Math.abs(discLeft)} pts
          </div>
        )}
      </div>

      {/* ── Skills Table ── */}
      <div style={{ overflowX:"auto", marginBottom:28 }}>
        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`2px solid ${C.borderHi}` }}>
              {["Skill","Base","Racial","DEX","Armor","Disc","Total"].map(h => (
                <th key={h} style={{ padding:"7px 10px",
                  textAlign: h === "Skill" ? "left" : "center",
                  fontSize:10, letterSpacing:1.5, color:C.textDim,
                  textTransform:"uppercase", whiteSpace:"nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {skillsDef.map((sk, idx) => {
              const unlocked  = isUnlocked(sk);
              const racial    = racialAdj?.[sk.id] ?? 0;
              const dexA      = dexAdj?.[sk.id]   ?? 0;
              const armA      = armorAdj?.[sk.id] ?? 0;
              const disc      = thiefDiscPoints[sk.id] ?? 0;
              const total     = unlocked
                ? calcThiefSkill(sk.id, { base:sk.base, racial:racialAdj, dex:dexAdj, armor:armorAdj, disc:thiefDiscPoints })
                : sk.base + racial + dexA + armA; // show base total even locked

              const rowBg = idx % 2 === 0 ? "rgba(0,0,0,.15)" : "transparent";
              const locked = !unlocked;

              return (
                <tr key={sk.id} style={{
                  background: rowBg,
                  opacity: locked ? 0.55 : 1,
                  transition:"opacity .13s",
                }}>
                  {/* Name */}
                  <td style={{ padding:"7px 10px", color: locked ? C.textDim : C.textBri }}>
                    <span style={{ fontWeight:"bold", marginRight:5 }}>{sk.shortLabel}</span>
                    <span style={{ fontSize:11, color:C.textDim }}>{sk.label}</span>
                    {locked && (
                      <span style={{ marginLeft:6, fontSize:9, padding:"1px 5px",
                        background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                        borderRadius:3, color:C.textDim }}>
                        🔒 needs {THIEF_CP_ABILS.find(a => a.id === sk.needsCp)?.label ?? sk.needsCp}
                      </span>
                    )}
                  </td>

                  {/* Base */}
                  <td style={{ padding:"7px 10px", textAlign:"center", color:C.textDim }}>
                    {sk.base}%
                  </td>

                  {/* Racial */}
                  <td style={{ padding:"7px 10px", textAlign:"center",
                    color: racial > 0 ? C.green : racial < 0 ? C.red : C.textDim }}>
                    {sgn(racial)}
                  </td>

                  {/* DEX */}
                  <td style={{ padding:"7px 10px", textAlign:"center",
                    color: dexA > 0 ? C.green : dexA < 0 ? C.red : C.textDim }}>
                    {sgn(dexA)}
                  </td>

                  {/* Armor */}
                  <td style={{ padding:"7px 10px", textAlign:"center",
                    color: armA > 0 ? C.green : armA < 0 ? C.red : C.textDim }}>
                    {sgn(armA)}
                  </td>

                  {/* Discretionary (+/-) */}
                  <td style={{ padding:"4px 6px", textAlign:"center" }}>
                    {locked ? (
                      <span style={{ color:C.textDim, fontSize:11 }}>—</span>
                    ) : (
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                        <button
                          onClick={() => adjustThiefDisc(sk.id, -5)}
                          disabled={disc <= 0}
                          style={{
                            width:20, height:20, lineHeight:"18px", textAlign:"center",
                            background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                            borderRadius:3, cursor: disc <= 0 ? "not-allowed" : "pointer",
                            color: disc <= 0 ? C.textDim : C.red, fontSize:14,
                            fontFamily:"inherit", opacity: disc <= 0 ? 0.4 : 1,
                          }}>−</button>
                        <span style={{ minWidth:32, textAlign:"center", fontSize:12,
                          color: disc > 0 ? C.gold : C.textDim, fontWeight:"bold" }}>
                          {disc > 0 ? `+${disc}` : "0"}
                        </span>
                        <button
                          onClick={() => adjustThiefDisc(sk.id, 5)}
                          disabled={discLeft < 5 && !ruleBreaker}
                          style={{
                            width:20, height:20, lineHeight:"18px", textAlign:"center",
                            background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                            borderRadius:3, cursor: (discLeft < 5 && !ruleBreaker) ? "not-allowed" : "pointer",
                            color: (discLeft < 5 && !ruleBreaker) ? C.textDim : C.green, fontSize:14,
                            fontFamily:"inherit", opacity: (discLeft < 5 && !ruleBreaker) ? 0.4 : 1,
                          }}>+</button>
                      </div>
                    )}
                  </td>

                  {/* Total */}
                  <td style={{ padding:"7px 10px", textAlign:"center" }}>
                    {locked ? (
                      <span style={{ fontSize:10, color:C.textDim, fontStyle:"italic" }}>locked</span>
                    ) : (
                      <span style={{ fontSize:15, fontWeight:"bold",
                        color: skillColor(total),
                        textShadow: total >= 50 ? `0 0 10px ${skillColor(total)}40` : "none" }}>
                        {total}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── CP-Purchased Abilities ── */}
      <div>
        <div style={{ fontSize:10, color:C.textDim, letterSpacing:3,
          textTransform:"uppercase", marginBottom:12 }}>
          ⚙ CP-Purchased Thieving Abilities
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {cpAbilsDef.map(ab => {
            const picked = !!thiefCpAbils[ab.id];
            const canAff = remainCP >= ab.cp || picked || ruleBreaker;
            return (
              <div key={ab.id}
                onClick={() => toggleThiefCpAbil(ab.id)}
                style={{
                  background: picked
                    ? "linear-gradient(145deg,#141a08,#0f1406)"
                    : "linear-gradient(145deg,#1a1408,#130f06)",
                  border:`1px solid ${picked ? "#5a7020" : C.border}`,
                  borderRadius:7, padding:"9px 14px", cursor:"pointer",
                  display:"flex", alignItems:"center", gap:10,
                  opacity: !canAff ? 0.6 : 1, transition:"all .13s",
                  boxShadow: picked ? "0 0 8px rgba(120,180,30,.08)" : "none",
                }}>
                <Checkbox checked={picked} color="#8ab040" />
                <span style={{ flex:1, fontSize:12,
                  color: picked ? C.textBri : C.textDim }}>
                  {ab.label}
                  {ab.unlocks && (
                    <span style={{ fontSize:9, marginLeft:6, color:C.blue,
                      border:`1px solid rgba(60,100,160,.4)`, borderRadius:3,
                      padding:"1px 4px" }}>
                      unlocks {ab.unlocks.join(", ").toUpperCase()}
                    </span>
                  )}
                </span>
                <span style={{ fontSize:12, fontWeight:"bold", padding:"2px 8px",
                  background: picked ? "rgba(80,160,40,.15)" : "rgba(0,0,0,.3)",
                  border:`1px solid ${picked ? "#4a6a20" : C.border}`,
                  borderRadius:4, color: picked ? C.green : C.textDim,
                  whiteSpace:"nowrap" }}>
                  {ab.cp} CP
                </span>
                <IBtn onClick={e => { e.stopPropagation(); setInfoModal({ title:ab.label, body:ab.desc }); }} />
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Color Legend ── */}
      <div style={{ marginTop:22, display:"flex", gap:16, flexWrap:"wrap",
        fontSize:11, color:C.textDim }}>
        <span>Score legend:</span>
        <span style={{ color:C.red }}>● &lt;20% Untrained</span>
        <span style={{ color:C.amber }}>● 20–49% Novice</span>
        <span style={{ color:C.green }}>● 50%+ Proficient</span>
      </div>
    </div>
  );
}
