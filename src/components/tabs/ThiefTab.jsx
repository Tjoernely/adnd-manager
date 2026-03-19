// ThiefTab.jsx — AD&D 2E S&P Chapter 9: Thieving Abilities
import { C } from "../../data/constants.js";
import {
  THIEF_SKILLS, THIEF_DISC_POINTS, SKILL_CLASS_ABILS,
  THIEF_ARMOR_ADJ, THIEF_ARMOR_OPTIONS,
  getThiefRacialAdj, getThiefDexAdj, calcThiefSkill,
} from "../../data/thieving.js";
import { ChHead } from "../ui/index.js";

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

// Classes that show this tab
const THIEF_CLASSES   = new Set(["thief", "bard", "ranger"]);
const TURNING_CLASSES = new Set(["cleric", "paladin", "shaman"]);

// ── Turn Undead table (S&P Table 36) ─────────────────────────────────────────
// '-' = cannot turn, 'T' = automatic turn, 'D' = automatic destroy, number = d20 roll needed
const TURN_TABLE = [
  { name:"Skeleton", vals:[10,7,4,"T","T","D","D","D","D","D","D","D","D"] },
  { name:"Zombie",   vals:[13,10,7,4,"T","T","D","D","D","D","D","D","D"] },
  { name:"Ghoul",    vals:[16,13,10,7,4,"T","T","D","D","D","D","D","D"] },
  { name:"Shadow",   vals:[19,16,13,10,7,4,"T","T","D","D","D","D","D"] },
  { name:"Wight",    vals:[20,19,16,13,10,7,4,"T","T","D","D","D","D"] },
  { name:"Ghast",    vals:["-",20,19,16,13,10,7,4,"T","T","D","D","D"] },
  { name:"Wraith",   vals:["-","-",20,19,16,13,10,7,4,"T","T","D","D"] },
  { name:"Mummy",    vals:["-","-","-",20,19,16,13,10,7,4,"T","T","D"] },
  { name:"Spectre",  vals:["-","-","-","-",20,19,16,13,10,7,4,"T","T"] },
  { name:"Vampire",  vals:["-","-","-","-","-",20,19,16,13,10,7,4,"T"] },
  { name:"Ghost",    vals:["-","-","-","-","-","-",20,19,16,13,10,7,4] },
  { name:"Lich",     vals:["-","-","-","-","-","-","-",20,19,16,13,10,7] },
  { name:"Special",  vals:["-","-","-","-","-","-","-","-",20,19,16,13,10] },
];
const TURN_COLS = ["1","2","3","4","5","6","7","8","9","10","11","12","13+"];

export function ThiefTab(props) {
  const {
    selectedClass,
    selectedRace,
    charLevel,
    effSub,
    thiefDiscPoints,
    thiefArmorType, setThiefArmorType,
    classAbilPicked,
    adjustThiefDisc,
    THIEF_SKILLS: skillsDef,
    THIEF_DISC_POINTS: discPool,
    SKILL_CLASS_ABILS: classAbilMap,
    CLASS_ABILITIES,
    setInfoModal,
    ruleBreaker,
  } = props;

  // ── Turn Undead section for Clerics and Paladins ──────────────────────────
  if (TURNING_CLASSES.has(selectedClass)) {
    const hasTurnAbil  = !!(classAbilPicked?.cl11 || classAbilPicked?.pa12);
    const isPaladin    = selectedClass === "paladin";
    const lvl          = Math.max(1, charLevel ?? 1);
    // Paladins turn as a cleric 2 levels lower (minimum 1)
    const effLvl       = isPaladin ? Math.max(1, lvl - 2) : lvl;
    const colIdx       = Math.min(effLvl - 1, 12); // 0-based index into TURN_COLS

    function cellColor(v) {
      if (v === "-") return C.textDim;
      if (v === "D") return "#a8ff78";
      if (v === "T") return C.green;
      if (typeof v === "number" && v <= 7)  return C.green;
      if (typeof v === "number" && v <= 13) return C.amber;
      return C.red;
    }

    return (
      <div>
        <ChHead icon="✝️" num="Chapter 9" title="Turn Undead"
          sub={isPaladin
            ? `Paladins turn as a cleric 2 levels lower. Your level: ${lvl} → effective cleric level: ${effLvl}. Purchase "Turn Undead" in the Classes tab to unlock.`
            : `Turn or destroy undead per Table 36 (S&P p.86). Purchase "Turn Undead" in the Classes tab to unlock.`}
        />

        {!hasTurnAbil && (
          <div style={{ marginBottom:16, padding:"8px 14px",
            background:"rgba(180,120,20,.1)", border:`1px solid rgba(180,120,20,.35)`,
            borderRadius:8, fontSize:12, color:C.amber }}>
            ⚠ Turn Undead is not yet purchased — buy it in the <strong>Classes tab</strong> to confirm access.
          </div>
        )}

        {isPaladin && (
          <div style={{ marginBottom:14, padding:"8px 14px",
            background:"rgba(80,80,160,.12)", border:`1px solid rgba(120,120,200,.3)`,
            borderRadius:8, fontSize:12, color:"#a0a8e0" }}>
            🛡 Paladin: turns as Cleric level <strong>{effLvl}</strong> (character level {lvl} − 2)
          </div>
        )}

        <div style={{ overflowX:"auto", marginBottom:24 }}>
          <table style={{ borderCollapse:"collapse", fontSize:11, minWidth:600 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${C.borderHi}` }}>
                <th style={{ padding:"6px 12px", textAlign:"left",
                  fontSize:10, letterSpacing:1.5, color:C.textDim,
                  textTransform:"uppercase", whiteSpace:"nowrap" }}>
                  Undead Type
                </th>
                {TURN_COLS.map((col, ci) => (
                  <th key={ci} style={{
                    padding:"6px 10px", textAlign:"center", minWidth:36,
                    fontSize:10, letterSpacing:1, color: ci === colIdx ? C.gold : C.textDim,
                    textTransform:"uppercase", whiteSpace:"nowrap",
                    background: ci === colIdx ? "rgba(212,160,53,.15)" : "transparent",
                    borderRadius: ci === colIdx ? "6px 6px 0 0" : 0,
                    fontWeight: ci === colIdx ? "bold" : "normal",
                  }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TURN_TABLE.map((row, ri) => (
                <tr key={ri} style={{
                  background: ri % 2 === 0 ? "rgba(0,0,0,.15)" : "transparent",
                  opacity: hasTurnAbil ? 1 : 0.5,
                }}>
                  <td style={{ padding:"5px 12px", color:C.textBri, fontWeight:"bold", whiteSpace:"nowrap" }}>
                    {row.name}
                  </td>
                  {row.vals.map((v, ci) => {
                    const isActive = ci === colIdx;
                    return (
                      <td key={ci} style={{
                        padding:"5px 10px", textAlign:"center",
                        background: isActive ? "rgba(212,160,53,.12)" : "transparent",
                        fontWeight: isActive ? "bold" : "normal",
                        fontSize: isActive ? 13 : 12,
                      }}>
                        <span style={{
                          color: isActive ? (v === "-" ? C.textDim : cellColor(v)) : cellColor(v),
                          textShadow: isActive && v !== "-" ? `0 0 8px ${cellColor(v)}60` : "none",
                        }}>
                          {v}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ display:"flex", gap:20, flexWrap:"wrap", fontSize:11, color:C.textDim, marginBottom:12 }}>
          <span>Legend:</span>
          <span style={{ color:C.textDim }}>— = Cannot turn</span>
          <span style={{ color:C.red }}>20/19/16 = Hard (high d20 roll needed)</span>
          <span style={{ color:C.amber }}>13/10/7 = Moderate</span>
          <span style={{ color:C.green }}>4 / T = Easy / Auto-Turn</span>
          <span style={{ color:"#a8ff78" }}>D = Auto-Destroy</span>
        </div>
        <div style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>
          Roll d20 equal to or above the listed number to turn. T = automatic turn, D = automatic destroy.
        </div>
      </div>
    );
  }

  const isThiefClass = THIEF_CLASSES.has(selectedClass);

  if (!isThiefClass) {
    return (
      <div>
        <ChHead icon="🗝️" num="Chapter 9" title="Class Skills"
          sub="Class-specific skills are available to Thieves, Bards, Rangers, Clerics, and Paladins." />
        <div style={{ padding:"40px 0", textAlign:"center", color:C.textDim, fontStyle:"italic" }}>
          Select <strong style={{ color:C.gold }}>Thief</strong>,{" "}
          <strong style={{ color:C.gold }}>Bard</strong>,{" "}
          <strong style={{ color:C.gold }}>Ranger</strong>,{" "}
          <strong style={{ color:C.gold }}>Cleric</strong>, or{" "}
          <strong style={{ color:C.gold }}>Paladin</strong> in the Classes tab to unlock this section.
        </div>
      </div>
    );
  }

  // ── Sub-stat scores for DEX adjustments ──────────────────────────────────────
  const aimScore = effSub("aim");
  const balScore = effSub("balance");
  const aimAdj   = getThiefDexAdj(aimScore);
  const balAdj   = getThiefDexAdj(balScore);

  // Class entry can override a skill's subStat (e.g. ranger F/RT, DN, CW have no DEX adj)
  // "subStat" in entry = explicit override (even null = suppress adj)
  const getEffSubStat = (sk) => {
    const entry = getClassEntry(sk);
    if (entry && Object.prototype.hasOwnProperty.call(entry, "subStat")) return entry.subStat;
    return sk.subStat;
  };

  // ── Racial and armor adjustments ─────────────────────────────────────────────
  // Rangers do not receive racial or armor bonuses to their thieving abilities (S&P p.70)
  const isRanger  = selectedClass === "ranger";
  const racialAdj = isRanger ? {} : getThiefRacialAdj(selectedRace);
  const armorData = isRanger ? {} : (THIEF_ARMOR_ADJ[thiefArmorType] ?? THIEF_ARMOR_ADJ.padded_studded);

  // ── Filter skills to only those with a class entry for this class ─────────────
  const classAbils = CLASS_ABILITIES?.[selectedClass] ?? [];

  const availableSkills = (skillsDef ?? THIEF_SKILLS).filter(sk =>
    !!(classAbilMap ?? SKILL_CLASS_ABILS)[sk.id]?.[selectedClass]
  );

  // ── Unlock check ─────────────────────────────────────────────────────────────
  const getClassEntry = (sk) => (classAbilMap ?? SKILL_CLASS_ABILS)[sk.id]?.[selectedClass] ?? null;
  const isUnlocked    = (sk) => {
    const entry = getClassEntry(sk);
    if (!entry) return false;
    return !!classAbilPicked[entry.abilId];
  };
  const getLockMsg = (sk) => {
    const entry = getClassEntry(sk);
    if (!entry) return "Not available for this class";
    const abil = classAbils.find(a => a.id === entry.abilId);
    const name = abil ? abil.name.replace(" ✦", "") : entry.abilId;
    return `Requires "${name}" in Classes tab`;
  };

  // ── Effective base (class can override default base %) ───────────────────────
  const effectiveBase = (sk) => {
    const entry = getClassEntry(sk);
    return entry?.base ?? sk.base;
  };

  // ── Total discretionary points used ──────────────────────────────────────────
  const discUsed = Object.values(thiefDiscPoints).reduce((s, v) => s + (v || 0), 0);
  const discLeft = (discPool ?? THIEF_DISC_POINTS) - discUsed;

  // ── How many skills are still locked (needs purchase) ────────────────────────
  const lockedCount = availableSkills.filter(sk => !isUnlocked(sk)).length;

  return (
    <div>
      <ChHead icon="🗝️" num="Chapter 9" title="Thieving Abilities"
        sub="60 discretionary points in multiples of 5. Base + Racial (Table 28) + Sub-Stat (Table 29) + Armor (Table 30) + Discretionary = Final %. Purchase class abilities in the Classes tab to unlock each skill." />

      {/* ── Class ability reminder (if any skills still locked) ── */}
      {lockedCount > 0 && (
        <div style={{ marginBottom:14, padding:"8px 14px",
          background:"rgba(180,120,20,.1)", border:`1px solid rgba(180,120,20,.35)`,
          borderRadius:8, fontSize:12, color:C.amber }}>
          ⚠ {lockedCount} skill{lockedCount > 1 ? "s" : ""} locked — purchase the corresponding class{" "}
          {selectedClass === "ranger" ? "ability" : "ability (✦)"} in the{" "}
          <strong>Classes tab</strong> to unlock them.
        </div>
      )}

      {/* ── Armor Type Selector (thieves/bards only — rangers have no armor modifier) ── */}
      {!isRanger && <div style={{ marginBottom:20, padding:"12px 18px",
        background:"rgba(0,0,0,.3)", border:`1px solid ${C.border}`, borderRadius:10 }}>
        <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
          textTransform:"uppercase", marginBottom:8 }}>Armor Type (Table 30)</div>
        <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
          {THIEF_ARMOR_OPTIONS.map(key => {
            const arm = THIEF_ARMOR_ADJ[key];
            const sel = thiefArmorType === key;
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
      </div>}

      {/* ── Discretionary Pool Summary ── */}
      <div style={{ marginBottom:20, padding:"12px 20px",
        background: discLeft < 0 ? "rgba(180,30,30,.12)" : "rgba(0,0,0,.3)",
        border:`2px solid ${discLeft < 0 ? C.redBri : C.border}`,
        borderRadius:10, display:"flex", alignItems:"center", gap:24, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
            textTransform:"uppercase", marginBottom:2 }}>Disc. Points</div>
          <span style={{ fontSize:28, fontWeight:"bold",
            color: discLeft < 0 ? C.redBri : discLeft < 10 ? C.amber : C.gold }}>
            {discUsed} / {discPool ?? THIEF_DISC_POINTS}
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
            textTransform:"uppercase", marginBottom:2 }}>Aim</div>
          <span style={{ fontSize:13, color:C.blue }}>{aimScore}</span>
        </div>
        <div style={{ borderLeft:`1px solid ${C.border}`, paddingLeft:20 }}>
          <div style={{ fontSize:10, color:C.textDim, letterSpacing:2,
            textTransform:"uppercase", marginBottom:2 }}>Balance</div>
          <span style={{ fontSize:13, color:C.blue }}>{balScore}</span>
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
              {["Skill","Base","Racial","Sub-Stat","Armor","Disc","Total"].map(h => (
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
            {availableSkills.map((sk, idx) => {
              const unlocked = isUnlocked(sk);
              const base     = effectiveBase(sk);
              const racial   = racialAdj?.[sk.id] ?? 0;
              // Per-skill sub-stat DEX adjustment (uses class-entry override if present)
              const effSS    = getEffSubStat(sk);
              const subAdj   = effSS === "aim"
                ? (aimAdj[sk.id] ?? 0)
                : effSS === "balance"
                  ? (balAdj[sk.id] ?? 0)
                  : 0;
              const armA     = armorData?.[sk.id] ?? 0;
              const disc     = thiefDiscPoints[sk.id] ?? 0;

              // Build a synthetic dex-adj object with just this skill for calcThiefSkill
              const dexAdjSingle = { [sk.id]: subAdj };

              const total = unlocked
                ? calcThiefSkill(sk.id, { base, racial:racialAdj, dex:dexAdjSingle, armor:armorData, disc:thiefDiscPoints })
                : base + racial + subAdj + armA; // preview even if locked

              const rowBg = idx % 2 === 0 ? "rgba(0,0,0,.15)" : "transparent";
              const locked = !unlocked;

              // Sub-stat label for tooltip
              const subLabel = effSS === "aim"     ? `Aim ${aimScore}`
                             : effSS === "balance" ? `Bal ${balScore}`
                             : null;

              return (
                <tr key={sk.id} style={{
                  background: rowBg,
                  opacity: locked ? 0.5 : 1,
                  transition:"opacity .13s",
                }}>
                  {/* Name */}
                  <td style={{ padding:"7px 10px", color: locked ? C.textDim : C.textBri }}>
                    <span style={{ fontWeight:"bold", marginRight:5 }}>{sk.shortLabel}</span>
                    <span style={{ fontSize:11, color:C.textDim }}>{sk.label}</span>
                    {locked && (
                      <span style={{ marginLeft:6, fontSize:9, padding:"1px 5px",
                        background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                        borderRadius:3, color:C.amber }}>
                        🔒 {getLockMsg(sk)}
                      </span>
                    )}
                  </td>

                  {/* Base */}
                  <td style={{ padding:"7px 10px", textAlign:"center", color:C.textDim }}>
                    {base}%
                  </td>

                  {/* Racial */}
                  <td style={{ padding:"7px 10px", textAlign:"center",
                    color: racial > 0 ? C.green : racial < 0 ? C.red : C.textDim }}>
                    {sgn(racial)}
                  </td>

                  {/* Sub-Stat */}
                  <td style={{ padding:"7px 10px", textAlign:"center",
                    color: subAdj > 0 ? C.green : subAdj < 0 ? C.red : C.textDim }}>
                    {effSS
                      ? <span title={subLabel ?? undefined}>{sgn(subAdj)}</span>
                      : <span style={{ color:C.textDim, fontSize:10 }}>—</span>
                    }
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

      {/* ── Sub-Stat Key ── */}
      <div style={{ marginBottom:16, padding:"8px 14px",
        background:"rgba(0,0,0,.2)", border:`1px solid ${C.border}`,
        borderRadius:7, fontSize:11, color:C.textDim, display:"flex", gap:20, flexWrap:"wrap" }}>
        <span>Sub-Stat key:</span>
        <span><strong style={{ color:C.blue }}>Aim</strong> → PP, OL {selectedClass !== "ranger" ? ", F/RT" : ""}</span>
        <span><strong style={{ color:C.blue }}>Balance</strong> → MS, HS</span>
        <span style={{ fontStyle:"italic" }}>— = no sub-stat adj (S&P Table 22/29)</span>
      </div>

      {/* ── Color Legend ── */}
      <div style={{ display:"flex", gap:16, flexWrap:"wrap",
        fontSize:11, color:C.textDim }}>
        <span>Score legend:</span>
        <span style={{ color:C.red }}>● &lt;20% Untrained</span>
        <span style={{ color:C.amber }}>● 20–49% Novice</span>
        <span style={{ color:C.green }}>● 50%+ Proficient</span>
      </div>
    </div>
  );
}
