import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { WEAPON_GROUPS_49, ALL_WEAPON_IDS, WEAPON_GROUPS, getWeaponSiblings, getWeapCost, weapSlotCost, WEAP_COSTS } from "../../data/weapons.js";

import { ChHead, GroupLabel } from "../ui/index.js";

export function WeaponsTab(props) {
  const {
    weapPicked, remainCP, classGroup,
    weapCPSp, wSlotCost,
    ruleBreaker, setInfoModal, setConfirmBox,
    toggleWeap,
  } = props;

  return (
    <div>
      <ChHead icon="🗡️" num="Chapter 7" title="Weapon Proficiencies"
        sub="Warrior: 2 CP/slot. All others: 3 CP/slot. Warriors only may buy Tight Group (2 slots) or Broad Group (3 slots). A weapon appearing in multiple groups is highlighted everywhere but costs CP only once." />

      {/* CP + rules summary */}
      <div style={{ marginBottom:18, padding:"12px 18px",
        background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
        borderRadius:8, display:"flex", gap:20, flexWrap:"wrap", fontSize:12, alignItems:"center" }}>
        <span style={{ color:C.textDim }}>
          CP Available: <strong style={{ color:C.gold, fontSize:15 }}>{remainCP}</strong>
        </span>
        <span style={{ color:C.textDim }}>
          Single: <strong style={{ color:classGroup==="warrior"?"#90d060":C.amber }}>{getWeapCost(classGroup,"single")} CP</strong>
          {" · "}Tight: <strong style={{ color:C.blue }}>{getWeapCost(classGroup,"tight")} CP</strong>
          {" · "}Broad: <strong style={{ color:"#80d080" }}>{getWeapCost(classGroup,"broad")} CP</strong>
        </span>
        <span style={{ color:C.textDim }}>
          Weapon CP spent: <strong style={{ color:C.amber }}>{weapCPSp}</strong>
        </span>
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

      {(() => {
        // Build a set of all weapon IDs that are "covered" by current picks
        // (either directly selected, or part of a picked tight/broad group)
        const coveredWeapIds = new Set();
        WEAPON_GROUPS_49.forEach(bg => {
          if (weapPicked[bg.id] === "broad") {
            // Broad group: all weapons covered
            bg.tightGroups.forEach(tg => tg.weapons.forEach(w => coveredWeapIds.add(w.id)));
            bg.unrelated.forEach(w => coveredWeapIds.add(w.id));
          }
          bg.tightGroups.forEach(tg => {
            if (weapPicked[tg.id] === "tight") {
              tg.weapons.forEach(w => coveredWeapIds.add(w.id));
            }
          });
        });
        // Also add directly-picked singles
        Object.entries(weapPicked).forEach(([id, level]) => {
          if (level === "single") coveredWeapIds.add(id);
        });
        // Expand: for each covered weapon, also mark all siblings (same name, other groups)
        const coveredWithSiblings = new Set(coveredWeapIds);
        coveredWeapIds.forEach(id => {
          getWeaponSiblings(id).forEach(sid => coveredWithSiblings.add(sid));
        });

        return WEAPON_GROUPS_49.map(bg => {
          const broadPicked = weapPicked[bg.id] === "broad";
          const isWarrior   = classGroup === "warrior";

          return (
            <div key={bg.id} style={{ marginBottom:24,
              background: broadPicked?"rgba(60,140,60,.04)":"transparent",
              border:`1px solid ${broadPicked?"rgba(60,180,60,.25)":C.border}`,
              borderRadius:10, padding:"12px 16px" }}>

              {/* Broad group header */}
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:10 }}>
                <GroupLabel>{bg.broad}</GroupLabel>
                <div style={{ marginLeft:"auto", display:"flex", gap:8 }}>
                  {!bg.noBroad && !broadPicked && (
                    <button onClick={()=>toggleWeap(bg.id, bg.broad, "broad")}
                      style={{ fontSize:10, padding:"3px 10px", borderRadius:5, cursor:"pointer",
                        background:"rgba(60,140,60,.1)", border:"1px solid rgba(60,180,60,.3)",
                        color:"#80d080", fontFamily:"inherit" }}>
                      ⊕ Broad Group ({getWeapCost(classGroup,"broad")} CP)
                    </button>
                  )}
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
                return (
                  <div key={tg.id} style={{ marginBottom:10 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:5 }}>
                      <span style={{ fontSize:11, color:C.textDim, fontStyle:"italic" }}>
                        {tg.name}
                        {tightPicked && <span style={{ color:"#70d070", marginLeft:6 }}>✓</span>}
                      </span>
                      {!tightPicked && !broadPicked && (
                        <button onClick={()=>toggleWeap(tg.id, tg.name, "tight")}
                          style={{ fontSize:9, padding:"2px 8px", borderRadius:4, cursor:"pointer",
                            background:"rgba(60,100,200,.1)", border:"1px solid rgba(60,100,200,.3)",
                            color:C.blue, fontFamily:"inherit" }}>
                          ⊕ Tight Group ({getWeapCost(classGroup,"tight")} CP)
                        </button>
                      )}
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
                        const directPicked  = weapPicked[w.id]==="single";
                        const groupCovered  = tightPicked;
                        const siblingCovered= !directPicked && !groupCovered && coveredWithSiblings.has(w.id);
                        const anyPicked     = directPicked || groupCovered || siblingCovered;
                        return (
                          <div key={w.id}
                            title={siblingCovered ? "Covered via same weapon in another group" : ""}
                            onClick={()=>{ if(!groupCovered && !siblingCovered) toggleWeap(w.id, w.name, "single"); }}
                            style={{
                              background: groupCovered?"rgba(60,160,60,.18)":
                                          siblingCovered?"rgba(100,160,220,.12)":
                                          directPicked?"rgba(212,160,53,.18)":"rgba(0,0,0,.3)",
                              border:`1px solid ${groupCovered?"rgba(60,180,60,.4)":
                                                   siblingCovered?"rgba(80,130,200,.4)":
                                                   directPicked?C.borderHi:C.border}`,
                              borderRadius:6, padding:"5px 11px", fontSize:11,
                              color: anyPicked ? (siblingCovered?"#90b8e0":groupCovered?"#90d080":C.textBri) : C.textDim,
                              cursor: (groupCovered||siblingCovered)?"default":"pointer",
                              transition:"all .12s",
                            }}>
                            {directPicked && "✓ "}{w.name}
                            {siblingCovered && <span style={{ fontSize:9, color:"#6090c0", marginLeft:4 }}>↔</span>}
                            {!anyPicked && <span style={{ fontSize:9, color:C.textDim, marginLeft:4 }}>{getWeapCost(classGroup, "single")}cp</span>}
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
                      return (
                        <div key={w.id}
                          title={siblingCovered ? "Covered via same weapon in another group" : ""}
                          onClick={()=>{ if(!groupCovered && !siblingCovered) toggleWeap(w.id, w.name, wLevel); }}
                          style={{
                            background: groupCovered?"rgba(60,160,60,.18)":
                                        siblingCovered?"rgba(100,160,220,.12)":
                                        directPicked?"rgba(212,160,53,.18)":"rgba(0,0,0,.3)",
                            border:`1px solid ${groupCovered?"rgba(60,180,60,.4)":
                                                 siblingCovered?"rgba(80,130,200,.4)":
                                                 directPicked?C.borderHi:C.border}`,
                            borderRadius:6, padding:"5px 11px", fontSize:11,
                            color: anyPicked?(siblingCovered?"#90b8e0":groupCovered?"#90d080":C.textBri):C.textDim,
                            cursor:(groupCovered||siblingCovered)?"default":"pointer",
                            transition:"all .12s",
                          }}>
                          {directPicked && "✓ "}{w.name}
                          {siblingCovered && <span style={{ fontSize:9, color:"#6090c0", marginLeft:4 }}>↔</span>}
                          {!anyPicked && <span style={{ fontSize:9, color:C.textDim, marginLeft:4 }}>{wSlotCost}cp</span>}
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
      <div style={{ marginTop:8, display:"flex", gap:12, flexWrap:"wrap", fontSize:10, color:C.textDim }}>
        <span style={{ background:"rgba(212,160,53,.18)", border:`1px solid ${C.borderHi}`,
          borderRadius:4, padding:"2px 8px", color:C.textBri }}>✓ Directly selected</span>
        <span style={{ background:"rgba(60,160,60,.18)", border:"1px solid rgba(60,180,60,.4)",
          borderRadius:4, padding:"2px 8px", color:"#90d080" }}>Group covered</span>
        <span style={{ background:"rgba(100,160,220,.12)", border:"1px solid rgba(80,130,200,.4)",
          borderRadius:4, padding:"2px 8px", color:"#90b8e0" }}>↔ Same weapon, other group (no extra cost)</span>
      </div>
    </div>
  );
}
