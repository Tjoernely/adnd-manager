import { C } from "../../data/constants.js";
import {
  WEAPON_GROUPS_49, getWeaponSiblings, getWeapCost, weapSlotCost, WEAP_COSTS,
  getWeapTier, getWeapSingleCostByTier, getGroupMaxTier,
  getWeapBadgeColor, getWeapCostTooltip,
  getClassWeaponRestriction, isWeaponAllowed,
} from "../../data/weapons.js";
import { ChHead, GroupLabel } from "../ui/index.js";

// Color constants for tier badge
const BADGE_COLORS = {
  green:  { bg:"rgba(60,160,60,.18)",  border:"rgba(60,180,60,.45)",  text:"#80d080" },
  yellow: { bg:"rgba(200,160,40,.18)", border:"rgba(200,160,40,.5)",  text:"#d4c040" },
  red:    { bg:"rgba(200,50,50,.2)",   border:"rgba(200,50,50,.5)",   text:"#e87070" },
};

function CpBadge({ cost, color }) {
  const c = BADGE_COLORS[color] ?? BADGE_COLORS.green;
  return (
    <span style={{
      fontSize:9, padding:"1px 5px", borderRadius:3,
      background:c.bg, border:`1px solid ${c.border}`, color:c.text,
      fontWeight:"bold", flexShrink:0,
    }}>{cost}cp</span>
  );
}

export function WeaponsTab(props) {
  const {
    weapPicked, remainCP, classGroup, selectedClass,
    weapCPSp, wSlotCost,
    ruleBreaker, setInfoModal, setConfirmBox,
    classAbilPicked,
    toggleWeap,
  } = props;

  const classRestriction = getClassWeaponRestriction(selectedClass, classGroup, classAbilPicked);

  function warnAndToggle(weapId, name, level) {
    if (!isWeaponAllowed(weapId, selectedClass, classGroup, classAbilPicked)) {
      setInfoModal({
        title: "⚠ Weapon Restriction",
        body: `${classRestriction?.label ?? "This class has weapon restrictions."}\n\n` +
          `"${name}" is outside the allowed list and cannot be selected.\n\n` +
          (classRestriction?.weaponAllowanceNote ?? ""),
      });
      return;
    }
    toggleWeap(weapId, name, level);
  }

  return (
    <div>
      <ChHead icon="🗡️" num="Chapter 7" title="Weapon Proficiencies"
        sub="Single weapon, Tight Group (2 slots), or Broad Group (3 slots). Cost varies by class and weapon tier. Familiarity (half non-prof penalty) is automatic for related weapons in the same group." />

      {/* CP + rules summary */}
      <div style={{ marginBottom:18, padding:"12px 18px",
        background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
        borderRadius:8, display:"flex", gap:20, flexWrap:"wrap", fontSize:12, alignItems:"center" }}>
        <span style={{ color:C.textDim }}>
          CP Available: <strong style={{ color:C.gold, fontSize:15 }}>{remainCP}</strong>
        </span>
        <span style={{ color:C.textDim }}>
          Weapon CP spent: <strong style={{ color:C.amber }}>{weapCPSp}</strong>
        </span>
        {/* Tier legend */}
        <span style={{ fontSize:11, color:C.textDim }}>Tiers:</span>
        {[
          { label:"Wizard weapons", color:"green",  desc:"No surcharge for any class" },
          { label:"Rogue/Priest weapons", color:"yellow", desc:"Wizard +2 CP" },
          { label:"Warrior weapons", color:"red",   desc:"Priest/Rogue +1, Wizard +3 CP" },
        ].map(t => (
          <span key={t.color} title={t.desc} style={{
            background:BADGE_COLORS[t.color].bg, border:`1px solid ${BADGE_COLORS[t.color].border}`,
            borderRadius:4, padding:"2px 8px", color:BADGE_COLORS[t.color].text, fontSize:10,
            cursor:"help",
          }}>{t.label}</span>
        ))}
        {[
          {cls:"Warrior",np:"–2",fam:"–1"},
          {cls:"Priest", np:"–3",fam:"–2"},
          {cls:"Rogue",  np:"–3",fam:"–2"},
          {cls:"Wizard", np:"–5",fam:"–3"},
        ].map(row=>(
          <div key={row.cls} style={{ fontSize:10, color:"#5a5040", borderLeft:`1px solid ${C.border}`, paddingLeft:10 }}>
            {row.cls}: <span style={{ color:C.red }}>{row.np}</span> non-prof ·{" "}
            <span style={{ color:C.amber }}>{row.fam}</span> familiar
          </div>
        ))}
      </div>

      {/* ── Class restriction banner ── */}
      {classRestriction && (
        <div style={{ marginBottom:14, padding:"8px 14px",
          background: classRestriction.weaponAllowance ? "rgba(60,120,60,.1)" : "rgba(180,80,20,.1)",
          border:`1px solid ${classRestriction.weaponAllowance ? "rgba(60,160,60,.4)" : "rgba(200,100,30,.4)"}`,
          borderRadius:8, fontSize:12, color: classRestriction.weaponAllowance ? C.green : C.amber }}>
          {classRestriction.weaponAllowance ? "✓" : "⚠"}{" "}
          <strong>Weapon restriction:</strong> {classRestriction.label}
          {" "}Forbidden weapons are marked with 🔒.
          {classRestriction.weaponAllowanceNote && (
            <div style={{ marginTop:4, color: classRestriction.weaponAllowance ? C.green : C.textDim }}>
              {classRestriction.weaponAllowanceNote}
            </div>
          )}
        </div>
      )}

      {(() => {
        // ── Covered weapons (fully proficient) ───────────────────────────────
        const coveredWeapIds = new Set();
        WEAPON_GROUPS_49.forEach(bg => {
          if (weapPicked[bg.id] === "broad") {
            bg.tightGroups.forEach(tg => tg.weapons.forEach(w => coveredWeapIds.add(w.id)));
            bg.unrelated.forEach(w => coveredWeapIds.add(w.id));
          }
          bg.tightGroups.forEach(tg => {
            if (weapPicked[tg.id] === "tight") {
              tg.weapons.forEach(w => coveredWeapIds.add(w.id));
            }
          });
        });
        Object.entries(weapPicked).forEach(([id, level]) => {
          if (level === "single") coveredWeapIds.add(id);
        });
        // Expand cross-group siblings (same-named weapon in another group)
        const coveredWithSiblings = new Set(coveredWeapIds);
        coveredWeapIds.forEach(id => {
          getWeaponSiblings(id).forEach(sid => coveredWithSiblings.add(sid));
        });

        // ── Familiar weapons (half non-prof penalty) ──────────────────────────
        const familiarWeapIds = new Set();
        WEAPON_GROUPS_49.forEach(bg => {
          const broadPicked = weapPicked[bg.id] === "broad";
          if (broadPicked) return;

          bg.tightGroups.forEach(tg => {
            const tightPicked = weapPicked[tg.id] === "tight";

            tg.weapons.forEach(w => {
              if (weapPicked[w.id] === "single") {
                tg.weapons.forEach(sib => {
                  if (sib.id !== w.id && !coveredWithSiblings.has(sib.id)) {
                    familiarWeapIds.add(sib.id);
                  }
                });
              }
            });

            if (tightPicked) {
              bg.tightGroups.forEach(otherTg => {
                if (otherTg.id !== tg.id) {
                  otherTg.weapons.forEach(w => {
                    if (!coveredWithSiblings.has(w.id)) {
                      familiarWeapIds.add(w.id);
                    }
                  });
                }
              });
            }
          });
        });

        return WEAPON_GROUPS_49.map(bg => {
          const broadPicked = weapPicked[bg.id] === "broad";
          const broadTier   = getGroupMaxTier(bg.id);
          const broadCost   = getWeapSingleCostByTier(classGroup, broadTier) * 3;
          const broadColor  = getWeapBadgeColor(classGroup, broadTier);

          return (
            <div key={bg.id} style={{ marginBottom:24,
              background: broadPicked?"rgba(60,140,60,.04)":"transparent",
              border:`1px solid ${broadPicked?"rgba(60,180,60,.25)":C.border}`,
              borderRadius:10, padding:"12px 16px" }}>

              {/* Broad group header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <GroupLabel>{bg.broad}</GroupLabel>
                <div style={{ marginLeft:"auto", display:"flex", gap:8, alignItems:"center" }}>
                  {!bg.noBroad && !broadPicked && (() => {
                    const canAfford = remainCP >= broadCost;
                    const disabled  = !canAfford && !ruleBreaker;
                    return (
                      <button
                        onClick={()=>{ if(!disabled) toggleWeap(bg.id, bg.broad, "broad"); }}
                        title={getWeapCostTooltip(classGroup, broadTier, bg.broad + " (broad)")}
                        style={{ fontSize:10, padding:"3px 10px", borderRadius:5, cursor: disabled?"not-allowed":"pointer",
                          background: disabled?"rgba(60,60,60,.1)":"rgba(60,140,60,.1)",
                          border:`1px solid ${disabled?"rgba(100,100,100,.3)":"rgba(60,180,60,.3)"}`,
                          color: disabled?"#666":"#80d080", fontFamily:"inherit",
                          display:"flex", alignItems:"center", gap:5 }}>
                        ⊕ Broad Group
                        <CpBadge cost={broadCost} color={disabled?"green":broadColor} />
                      </button>
                    );
                  })()}
                  {broadPicked && (
                    <button onClick={()=>toggleWeap(bg.id, bg.broad, "broad")}
                      style={{ fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                        background:"rgba(60,140,60,.2)", border:"1px solid rgba(60,180,60,.5)",
                        color:"#a0f0a0", fontFamily:"inherit" }}>
                      ✓ Broad Group — click to remove
                    </button>
                  )}
                </div>
              </div>

              {/* Tight groups */}
              {bg.tightGroups.map(tg => {
                const tightPicked = weapPicked[tg.id]==="tight" || broadPicked;
                const tightTier   = getGroupMaxTier(tg.id);
                const tightCost   = getWeapSingleCostByTier(classGroup, tightTier) * 2;
                const tightColor  = getWeapBadgeColor(classGroup, tightTier);
                return (
                  <div key={tg.id} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                      <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>
                        {tg.name}
                        {tightPicked && <span style={{ color:"#70d070", marginLeft:6 }}>✓</span>}
                      </span>
                      {!tightPicked && !broadPicked && (() => {
                        const canAfford = remainCP >= tightCost;
                        const disabled  = !canAfford && !ruleBreaker;
                        return (
                          <button
                            onClick={()=>{ if(!disabled) toggleWeap(tg.id, tg.name, "tight"); }}
                            title={getWeapCostTooltip(classGroup, tightTier, tg.name + " (tight)")}
                            style={{ fontSize:9, padding:"2px 8px", borderRadius:4, cursor: disabled?"not-allowed":"pointer",
                              background: disabled?"rgba(40,40,40,.1)":"rgba(60,100,200,.1)",
                              border:`1px solid ${disabled?"rgba(80,80,80,.3)":"rgba(60,100,200,.3)"}`,
                              color: disabled?"#555":C.blue, fontFamily:"inherit",
                              display:"flex", alignItems:"center", gap:4 }}>
                            ⊕ Tight Group
                            <CpBadge cost={tightCost} color={disabled?"green":tightColor} />
                          </button>
                        );
                      })()}
                      {weapPicked[tg.id]==="tight" && (
                        <button onClick={()=>toggleWeap(tg.id, tg.name, "tight")}
                          style={{ fontSize:9, padding:"2px 8px", borderRadius:4, cursor:"pointer",
                            background:"rgba(60,100,200,.2)", border:"1px solid rgba(60,100,200,.5)",
                            color:"#90b8f8", fontFamily:"inherit" }}>
                          ✓ Remove Tight Group
                        </button>
                      )}
                    </div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, paddingLeft:8 }}>
                      {tg.weapons.map(w => {
                        const directPicked   = weapPicked[w.id]==="single";
                        const groupCovered   = tightPicked;
                        const siblingCovered = !directPicked && !groupCovered && coveredWithSiblings.has(w.id);
                        const familiar       = !directPicked && !groupCovered && !siblingCovered && familiarWeapIds.has(w.id);
                        const anyPicked      = directPicked || groupCovered || siblingCovered;
                        const tier           = getWeapTier(w.id);
                        const singleCost     = getWeapSingleCostByTier(classGroup, tier);
                        const badgeColor     = getWeapBadgeColor(classGroup, tier);
                        const tooltip        = getWeapCostTooltip(classGroup, tier, w.name);
                        const canAfford      = remainCP >= singleCost;
                        const unaffordable   = !anyPicked && !familiar && !groupCovered && !siblingCovered && !canAfford && !ruleBreaker;
                        const clickable      = !groupCovered && !siblingCovered && !familiar && !unaffordable;
                        const restricted     = !isWeaponAllowed(w.id, selectedClass, classGroup, classAbilPicked);
                        return (
                          <div key={w.id}
                            title={
                              restricted ? (classRestriction?.label ?? "Restricted for this class") :
                              siblingCovered ? "Covered via same weapon in another group" :
                              familiar ? "Familiar — half non-proficiency penalty" :
                              unaffordable ? `Not enough CP (need ${singleCost}, have ${remainCP})` :
                              !anyPicked ? tooltip : ""
                            }
                            onClick={()=>{ if(clickable) warnAndToggle(w.id, w.name, "single"); }}
                            style={{
                              background: groupCovered?"rgba(60,160,60,.18)":
                                          siblingCovered?"rgba(100,160,220,.12)":
                                          familiar?"rgba(200,140,40,.14)":
                                          directPicked?"rgba(212,160,53,.18)":
                                          restricted?"rgba(180,50,50,.08)":"rgba(0,0,0,.3)",
                              border:`1px solid ${
                                groupCovered?"rgba(60,180,60,.4)":
                                siblingCovered?"rgba(80,130,200,.4)":
                                familiar?"rgba(200,140,40,.45)":
                                restricted?"rgba(180,60,60,.4)":
                                directPicked?C.borderHi:C.border}`,
                              borderRadius:6, padding:"5px 11px", fontSize:11,
                              color: anyPicked ? (siblingCovered?"#90b8e0":groupCovered?"#90d080":C.textBri) :
                                     familiar ? "#d4a040" : unaffordable ? "#444" :
                                     restricted ? "#c06060" : C.textDim,
                              cursor: clickable ? "pointer" : "default",
                              opacity: unaffordable ? 0.45 : 1,
                              transition:"all .12s",
                              display:"flex", alignItems:"center", gap:5,
                            }}>
                            {directPicked && "✓ "}{w.name}
                            {restricted && !anyPicked && <span style={{ fontSize:9, color:"#c06060" }} title={classRestriction?.label}>🔒</span>}
                            {siblingCovered && <span style={{ fontSize:9, color:"#6090c0" }}>↔</span>}
                            {familiar && <span style={{ fontSize:9, color:"#b08030" }}>~</span>}
                            {!anyPicked && !familiar && (
                              <CpBadge cost={singleCost} color={unaffordable ? "green" : badgeColor} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Unrelated / individual weapons */}
              {bg.unrelated.length > 0 && (
                <div>
                  {bg.tightGroups.length > 0 && (
                    <div style={{ fontSize:10, color:"#5a4a30", marginBottom:5, marginTop:4 }}>
                      Ungrouped weapons:
                    </div>
                  )}
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6, paddingLeft:8 }}>
                    {bg.unrelated.map(w => {
                      const wLevel         = w.level || "single";
                      const directPicked   = !!weapPicked[w.id];
                      const groupCovered   = broadPicked;
                      const siblingCovered = !directPicked && !groupCovered && coveredWithSiblings.has(w.id);
                      const anyPicked      = directPicked || groupCovered || siblingCovered;
                      // Special profs (shield/armor) use flat costs
                      const isSpecial      = wLevel === "shield" || wLevel === "armor";
                      const singleCost     = isSpecial ? getWeapCost(classGroup, wLevel)
                                           : getWeapSingleCostByTier(classGroup, getWeapTier(w.id));
                      const tier           = isSpecial ? null : getWeapTier(w.id);
                      const badgeColor     = isSpecial ? "green" : getWeapBadgeColor(classGroup, tier);
                      const tooltip        = isSpecial ? w.name : getWeapCostTooltip(classGroup, tier, w.name);
                      const canAfford      = remainCP >= singleCost;
                      const unaffordable   = !anyPicked && !groupCovered && !siblingCovered && !canAfford && !ruleBreaker;
                      const clickable      = !groupCovered && !siblingCovered && !unaffordable;
                      const restricted     = !isWeaponAllowed(w.id, selectedClass, classGroup, classAbilPicked);
                      return (
                        <div key={w.id}
                          title={
                            restricted ? (classRestriction?.label ?? "Restricted for this class") :
                            siblingCovered ? "Covered via same weapon in another group" :
                            unaffordable ? `Not enough CP (need ${singleCost}, have ${remainCP})` :
                            !anyPicked ? tooltip : ""
                          }
                          onClick={()=>{ if(clickable) warnAndToggle(w.id, w.name, wLevel); }}
                          style={{
                            background: groupCovered?"rgba(60,160,60,.18)":
                                        siblingCovered?"rgba(100,160,220,.12)":
                                        directPicked?"rgba(212,160,53,.18)":
                                        restricted?"rgba(180,50,50,.08)":"rgba(0,0,0,.3)",
                            border:`1px solid ${groupCovered?"rgba(60,180,60,.4)":
                                                 siblingCovered?"rgba(80,130,200,.4)":
                                                 restricted?"rgba(180,60,60,.4)":
                                                 directPicked?C.borderHi:C.border}`,
                            borderRadius:6, padding:"5px 11px", fontSize:11,
                            color: anyPicked?(siblingCovered?"#90b8e0":groupCovered?"#90d080":C.textBri):
                                   unaffordable?"#444":restricted?"#c06060":C.textDim,
                            cursor: clickable?"pointer":"default",
                            opacity: unaffordable ? 0.45 : 1,
                            transition:"all .12s",
                            display:"flex", alignItems:"center", gap:5,
                          }}>
                          {directPicked && "✓ "}{w.name}
                          {restricted && !anyPicked && <span style={{ fontSize:9, color:"#c06060" }}>🔒</span>}
                          {siblingCovered && <span style={{ fontSize:9, color:"#6090c0" }}>↔</span>}
                          {!anyPicked && (
                            <CpBadge cost={singleCost} color={unaffordable ? "green" : badgeColor} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        });
      })()}

      {/* Legend */}
      <div style={{ marginTop:8, display:"flex", gap:10, flexWrap:"wrap", fontSize:10, color:C.textDim }}>
        <span style={{ background:"rgba(212,160,53,.18)", border:`1px solid ${C.borderHi}`,
          borderRadius:4, padding:"2px 8px", color:C.textBri }}>✓ Directly selected</span>
        <span style={{ background:"rgba(60,160,60,.18)", border:"1px solid rgba(60,180,60,.4)",
          borderRadius:4, padding:"2px 8px", color:"#90d080" }}>Group covered</span>
        <span style={{ background:"rgba(200,140,40,.14)", border:"1px solid rgba(200,140,40,.45)",
          borderRadius:4, padding:"2px 8px", color:"#d4a040" }}>~ Familiar (half penalty)</span>
        <span style={{ background:"rgba(100,160,220,.12)", border:"1px solid rgba(80,130,200,.4)",
          borderRadius:4, padding:"2px 8px", color:"#90b8e0" }}>↔ Same weapon, other group</span>
        <span style={{ opacity:0.45, background:"rgba(0,0,0,.3)", border:`1px solid ${C.border}`,
          borderRadius:4, padding:"2px 8px" }}>Faded = unaffordable (Rule-Breaker off)</span>
      </div>
    </div>
  );
}
