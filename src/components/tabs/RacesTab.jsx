import { C, fmt, statColor, numInputStyle } from "../../data/constants.js";
import { RACES, SUB_RACES, MONSTROUS_RACES, MONSTROUS_FEAT_MAP, MONSTROUS_FEATURES } from "../../data/races.js";
import { PARENT_STATS, PARENT_STAT_LABELS } from "../../data/abilities.js";
import { WEAPON_CANONICAL_IDS } from "../../data/weapons.js";

import { ChHead, IBtn, TagBadge, Checkbox, CpBadge } from "../ui/index.js";

// Flat sorted weapon list for hu01 dropdown (de-duped canonical weapons)
const FLAT_WEAPONS = Object.values(WEAPON_CANONICAL_IDS)
  .sort((a, b) => a.name.localeCompare(b.name));

const WEAPON_CHOICE_ABILS = new Set(["hu01"]);

export function RacesTab(props) {
  const {
    selectedRace, selectedSubRace, racialPicked, abilChosenSub,
    monstrousRaceId, monstrousSelFeats, monstrousCustomize, setMonstrousCustomize,
    mongrelChoice, setMongrelChoice,
    raceData, subRaceData, subRaceList,
    activeRaceStatMods, allActiveAbilIds, effSub,
    racialPoolLeft, racialPoolSpent,
    monstrousRaceData, monstrousAdjMods, monstrousBudget, monstrousSelFeats: _monstrousSelFeats,
    baseScores,
    ruleBreaker,
    setInfoModal, setConfirmBox,
    handleRaceSelect, handleSubRaceSelect, toggleRacialAbil, setRacialAbilWeapon,
    handleMonstrousRaceSelect, toggleMonstrousFeat,
    muscleStats,
    ALL_SUBS,
  } = props;

  // ALL_SUBS may come from props or we derive it locally
  const _ALL_SUBS = props.ALL_SUBS ?? [];

  return (
    <div>
      <ChHead icon="🌍" num="Chapter 2" title="Racial Selection"
        sub="Choose race then sub-race. Sub-race stat mods replace the base racial mods. All racial abilities begin at zero — purchase from the racial CP pool separately from character CP." />

      {/* Race grid */}
      <div style={{ display:"flex", flexWrap:"wrap", gap:10, marginBottom:22 }}>
        {RACES.map(r=>(
          <button key={r.id} onClick={()=>handleRaceSelect(r.id)} style={{
            background:selectedRace===r.id?C.cardSel:C.card,
            border:`2px solid ${selectedRace===r.id?C.gold:C.border}`,
            borderRadius:10, padding:"11px 16px", cursor:"pointer",
            display:"flex", flexDirection:"column", alignItems:"center", gap:4,
            fontFamily:"inherit", transition:"all .18s",
            boxShadow:selectedRace===r.id?"0 0 18px rgba(212,160,53,.22)":"none",
          }}>
            <span style={{ fontSize:24 }}>{r.icon}</span>
            <span style={{ fontSize:12, color:selectedRace===r.id?C.gold:C.textDim }}>{r.label}</span>
            <span style={{ fontSize:10, color:C.textDim }}>{r.pool} CP</span>
          </button>
        ))}
      </div>

      {raceData && (
        <div>
          {/* Sub-race selector */}
          {subRaceList.length > 0 && (
            <div style={{ marginBottom:18, background:C.card,
              border:`1px solid ${C.borderHi}`, borderRadius:10, padding:"14px 18px" }}>
              <div style={{ fontSize:11, letterSpacing:4, color:C.textDim,
                textTransform:"uppercase", marginBottom:12 }}>Choose Sub-Race / Package</div>
              <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                {subRaceList.map(sr=>{
                  const sel = selectedSubRace===sr.id;
                  const isCustom = sr.id === "custom";
                  return (
                    <button key={sr.id} onClick={()=>handleSubRaceSelect(sr.id)} style={{
                      background:sel?"rgba(212,160,53,.12)":"rgba(0,0,0,.3)",
                      border:`1px solid ${sel ? (isCustom ? C.amber : C.gold) : C.border}`,
                      borderRadius:8, padding:"8px 14px", cursor:"pointer",
                      fontFamily:"inherit", transition:"all .15s",
                    }}>
                      <div style={{ fontSize:13, color:sel?C.gold:C.textDim, marginBottom:2 }}>
                        {sr.label}
                      </div>
                      <div style={{ fontSize:10, color:isCustom ? C.amber : C.textDim }}>
                        {isCustom ? "Build your own" : `Package: ${sr.packageCp} CP`}
                      </div>
                    </button>
                  );
                })}
              </div>
              {subRaceData && (
                <div style={{ marginTop:12 }}>
                  <div style={{ fontSize:12, color:C.textDim, fontStyle:"italic",
                    lineHeight:1.6, marginBottom:8 }}>{subRaceData.desc}</div>
                  {subRaceData.penalties && (
                    <div style={{ fontSize:11, color:"#c07060", padding:"6px 10px",
                      background:"rgba(255,100,60,.06)", borderRadius:5,
                      border:"1px solid rgba(255,100,60,.15)" }}>
                      ⚠ {subRaceData.penalties}
                    </div>
                  )}
                  {subRaceData.id !== "custom" && subRaceData.abilityIds.length > 0 && (
                    <div style={{ marginTop:10 }}>
                      <div style={{ fontSize:10, letterSpacing:2, color:C.gold,
                        textTransform:"uppercase", marginBottom:6 }}>
                        Included in package ({subRaceData.packageCp} CP total):
                      </div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:5 }}>
                        {subRaceData.abilityIds.map(abilId => {
                          const ab = raceData?.abilities.find(a => a.id === abilId);
                          if (!ab) return null;
                          return (
                            <TagBadge key={abilId} color={C.gold}>
                              {ab.name} ({ab.cp})
                            </TagBadge>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Race description + pool meter */}
          <div style={{ background:C.card, border:`1px solid ${C.borderHi}`,
            borderRadius:10, padding:"14px 20px", marginBottom:20,
            display:"flex", gap:22, flexWrap:"wrap", alignItems:"center" }}>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, color:C.gold, marginBottom:4 }}>
                {raceData.icon} {raceData.label}
                {subRaceData && <span style={{ fontSize:13, color:C.amber }}> — {subRaceData.label}</span>}
              </div>
              <div style={{ fontSize:13, color:C.textDim, lineHeight:1.6 }}>{raceData.desc}</div>
              {Object.keys(activeRaceStatMods).length > 0 && (
                <div style={{ marginTop:8, display:"flex", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontSize:11, color:C.textDim }}>Racial stat mods (Table 15):</span>
                  {Object.entries(activeRaceStatMods).map(([s,v])=>(
                    <TagBadge key={s} color={v>0?C.green:C.red}>{s} {v>0?`+${v}`:v}</TagBadge>
                  ))}
                </div>
              )}
            </div>
            {/* Pool meter */}
            <div style={{ textAlign:"center", minWidth:130 }}>
              <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, marginBottom:4 }}>RACIAL POOL</div>
              <div style={{ fontSize:30, fontWeight:"bold",
                color:racialPoolLeft<0?C.redBri:racialPoolLeft===0?"#888":C.gold }}>
                {racialPoolLeft}
              </div>
              <div style={{ fontSize:10, color:C.textDim }}>of {raceData.pool} CP</div>
              <div style={{ height:5, background:"#1a1208", borderRadius:3, marginTop:5 }}>
                <div style={{ height:"100%", borderRadius:3, transition:"width .3s",
                  width:`${Math.min(100,(racialPoolSpent/raceData.pool)*100)}%`,
                  background:`linear-gradient(90deg,${C.amber},${C.gold})` }} />
              </div>
            </div>
          </div>

          {/* Racial ability grid */}
          {(() => {
            const isCustom   = !subRaceData || subRaceData.id === "custom";
            const pkgIds     = new Set(subRaceData?.id !== "custom" ? (subRaceData?.abilityIds ?? []) : []);
            const uniqueIds  = new Set(subRaceData?.uniqueIds ?? []);
            const allAbils   = raceData?.abilities ?? [];
            // In non-custom mode: show package section + remaining optional abilities
            // In custom mode: show all abilities, unique ones require rule-breaker
            const headerLabel = isCustom
              ? `Custom — choose freely from ${raceData?.pool} CP`
              : `Additional abilities (${racialPoolLeft} CP remaining)`;
            const pickableAbils = isCustom
              ? allAbils
              : allAbils.filter(ab => !pkgIds.has(ab.id));
            return (
              <>
                <div style={{ fontSize:11, color:C.textDim, marginBottom:10, fontStyle:"italic" }}>
                  {headerLabel}{" "}
                  <span style={{ color:C.green }}>✦ green = stat-linked</span>
                </div>
                <div style={{ display:"grid",
                  gridTemplateColumns:"repeat(auto-fill,minmax(310px,1fr))", gap:10 }}>
                  {pickableAbils.map(ab=>{
                    const picked    = allActiveAbilIds.has(ab.id);
                    const inPackage = pkgIds.has(ab.id);
                    const isUnique  = ab.unique;
                    const needsRB   = isUnique && isCustom && !ruleBreaker;
                    const linked    = ab.statLink && picked;
                    const chosenSub = linked && ab.statLink.sub==="choose"
                      ? (abilChosenSub[ab.id] ?? null) : null;
                    const linkedLabel = linked
                      ? (ab.statLink.sub === "choose"
                          ? chosenSub
                            ? `${_ALL_SUBS.find(s=>s.id===chosenSub)?.label} ${fmt(ab.statLink.delta)} → ${effSub(chosenSub)}`
                            : "choose sub-ability…"
                          : `${_ALL_SUBS.find(s=>s.id===ab.statLink.sub)?.label} ${fmt(ab.statLink.delta)} → ${effSub(ab.statLink.sub)}`)
                      : null;
                    return (
                      <div key={ab.id} onClick={()=>!inPackage && toggleRacialAbil(ab)} style={{
                        background: inPackage
                          ? "linear-gradient(145deg,#1c1800,#151100)"
                          : picked ? "linear-gradient(145deg,#221a08,#1a1406)" : C.card,
                        border:`1px solid ${inPackage ? C.borderHi : picked ? C.borderHi : C.border}`,
                        borderRadius:8, padding:"11px 13px",
                        cursor: inPackage ? "default" : "pointer",
                        transition:"all .14s", display:"flex", gap:9, alignItems:"flex-start",
                        opacity: needsRB ? 0.55 : 1,
                        boxShadow:picked?"0 0 12px rgba(212,160,53,.12)":"none",
                      }}>
                        {inPackage
                          ? <span style={{ color:C.gold, fontSize:14, marginTop:1 }}>📦</span>
                          : <Checkbox checked={!!racialPicked[ab.id]} />
                        }
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ display:"flex", justifyContent:"space-between",
                            alignItems:"center", marginBottom:3 }}>
                            <span style={{ fontSize:13, color: inPackage ? C.gold : picked ? C.textBri : C.textDim }}>
                              {ab.name}
                              {ab.statLink && <span style={{ color:C.green, fontSize:11, marginLeft:4 }}>✦</span>}
                              {needsRB && <span style={{ color:C.red, fontSize:10, marginLeft:4 }}>⚠ RB</span>}
                            </span>
                            <div style={{ display:"flex", gap:5, alignItems:"center" }}>
                              {inPackage && <TagBadge color={C.gold}>pkg</TagBadge>}
                              <CpBadge>{ab.cp}</CpBadge>
                              <IBtn onClick={e=>{e.stopPropagation();setInfoModal({title:ab.name,body:ab.desc});}} />
                            </div>
                          </div>
                          {linkedLabel && (
                            <div style={{ fontSize:11, color:C.green }}>
                              → {linkedLabel}
                              {ab.statLink?.sub==="muscle" && picked && (
                                <span style={{ color:C.amber, marginLeft:8 }}>
                                  Att {fmt(muscleStats.attAdj)} Dmg {fmt(muscleStats.dmgAdj)}
                                </span>
                              )}
                            </div>
                          )}
                          {WEAPON_CHOICE_ABILS.has(ab.id) && picked && (
                            <div style={{ marginTop:8 }} onClick={e => e.stopPropagation()}>
                              <select
                                value={typeof racialPicked[ab.id] === "object" ? (racialPicked[ab.id]?.weapon ?? "") : ""}
                                onChange={e => setRacialAbilWeapon(ab.id, e.target.value)}
                                style={{
                                  width:"100%", padding:"5px 8px", borderRadius:5,
                                  background:"#0c1008", border:`1px solid ${
                                    racialPicked[ab.id]?.weapon ? C.gold : C.red}`,
                                  color: racialPicked[ab.id]?.weapon ? C.textBri : C.red,
                                  fontSize:11, fontFamily:"inherit", cursor:"pointer",
                                }}>
                                <option value="">— Choose weapon —</option>
                                {FLAT_WEAPONS.map(w => (
                                  <option key={w.id} value={w.id}>{w.name}</option>
                                ))}
                              </select>
                              {!racialPicked[ab.id]?.weapon && (
                                <div style={{ fontSize:10, color:C.red, marginTop:3 }}>
                                  ⚠ Must select a weapon to complete this ability
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </div>
      )}
      {!raceData && (
        <div style={{ textAlign:"center", padding:60, color:C.textDim, fontSize:16 }}>
          Select a race above to begin.
        </div>
      )}

      {/* ── Monstrous / Special Races divider ── */}
      <div style={{ margin:"32px 0 18px", borderTop:`1px solid ${C.border}`, paddingTop:24 }}>
        <ChHead icon="🐉" num="Chapter 2B" title="Monstrous & Special Races"
          sub="Skills & Powers monstrous races. These are independent of the standard race above — choose one or the other. Budget points (bp) are internal balance values, not official CP." />

        {/* Race grid */}
        <div style={{ display:"flex", flexWrap:"wrap", gap:8, marginBottom:20 }}>
          {MONSTROUS_RACES.map(r => {
            const sel = monstrousRaceId === r.id;
            return (
              <button key={r.id} onClick={() => handleMonstrousRaceSelect(r.id)} style={{
                background: sel ? C.cardSel : C.card,
                border:`2px solid ${sel ? C.gold : C.border}`,
                borderRadius:10, padding:"9px 13px", cursor:"pointer",
                display:"flex", flexDirection:"column", alignItems:"center", gap:3,
                fontFamily:"inherit", transition:"all .18s",
                boxShadow: sel ? "0 0 16px rgba(212,160,53,.2)" : "none",
              }}>
                <span style={{ fontSize:20 }}>{r.icon}</span>
                <span style={{ fontSize:11, color: sel ? C.gold : C.textDim }}>{r.name}</span>
              </button>
            );
          })}
        </div>

        {monstrousRaceData && (() => {
          const { budget, used, remaining } = monstrousBudget;
          const selSet = new Set(monstrousSelFeats);
          const pct = budget === 0 ? 0 : Math.min(100, Math.round((used / budget) * 100));
          const barColor = remaining < 0 ? C.red : remaining === 0 ? "#888" : C.gold;
          return (
            <div>
              {/* Lore + stat summary */}
              <div style={{ background:C.card, border:`1px solid ${C.borderHi}`, borderRadius:10,
                padding:"14px 18px", marginBottom:16 }}>
                <div style={{ fontSize:16, color:C.gold, marginBottom:6 }}>
                  {monstrousRaceData.icon} {monstrousRaceData.name}
                </div>
                <div style={{ fontSize:12, color:C.textDim, fontStyle:"italic", lineHeight:1.5, marginBottom:12 }}>
                  {monstrousRaceData.lore}
                </div>
                {/* Stat row */}
                <div style={{ display:"flex", flexWrap:"wrap", gap:"8px 22px" }}>
                  <div><div style={{ fontSize:9, color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>Natural AC</div>
                    <div style={{ fontSize:14, color:C.textBri, fontWeight:"bold" }}>{monstrousRaceData.ac}</div></div>
                  <div><div style={{ fontSize:9, color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>HP Bonus (Lv1)</div>
                    <div style={{ fontSize:14, color:C.textBri, fontWeight:"bold" }}>{monstrousRaceData.hpBonus > 0 ? `+${monstrousRaceData.hpBonus}` : monstrousRaceData.hpBonus}</div></div>
                  <div><div style={{ fontSize:9, color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>Movement</div>
                    <div style={{ fontSize:14, color:C.textBri, fontWeight:"bold" }}>{monstrousRaceData.mv}</div></div>
                  {monstrousRaceData.natAtk && (
                    <div><div style={{ fontSize:9, color:C.textDim, textTransform:"uppercase", letterSpacing:1 }}>Natural Attacks</div>
                      <div style={{ fontSize:14, color:C.textBri, fontWeight:"bold" }}>{monstrousRaceData.natAtk}</div></div>
                  )}
                </div>
              </div>

              {/* Ability adjustments */}
              {Object.keys(monstrousAdjMods).length > 0 && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase",
                    marginBottom:8, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>
                    Ability Score Adjustments
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {PARENT_STATS.map(stat => {
                      const delta = monstrousAdjMods[stat] ?? 0;
                      const base = baseScores[stat] ?? 10;
                      const adj = Math.min(25, Math.max(1, base + delta));
                      if (delta === 0) return null;
                      return (
                        <div key={stat} style={{
                          background:"rgba(255,255,255,0.04)", borderRadius:6,
                          padding:"6px 12px", textAlign:"center",
                          border:`1px solid ${delta > 0 ? C.green : C.red}44`
                        }}>
                          <div style={{ fontSize:10, color:C.textDim }}>{stat}</div>
                          <div style={{ fontSize:18, fontWeight:"bold",
                            color: delta > 0 ? C.green : C.red }}>{adj}</div>
                          <div style={{ fontSize:10, color: delta > 0 ? C.green : C.red }}>
                            ({delta > 0 ? "+" : ""}{delta} from {base})
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mongrelman +1 choice */}
              {monstrousRaceData.isMongrel && (
                <div style={{ marginBottom:16, padding:"10px 14px",
                  background:"rgba(255,200,100,.05)", borderRadius:8, border:`1px solid ${C.amber}44` }}>
                  <div style={{ fontSize:12, color:C.amber, marginBottom:8 }}>
                    Mongrelman: Choose one ability to receive +1
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                    {PARENT_STATS.map(stat => (
                      <button key={stat} onClick={() => setMongrelChoice(mongrelChoice === stat ? null : stat)}
                        style={{
                          background: mongrelChoice === stat ? "#5a3a10" : "#1a1208",
                          color: mongrelChoice === stat ? C.gold : C.textDim,
                          border:`1px solid ${mongrelChoice === stat ? C.gold : C.border}`,
                          borderRadius:5, padding:"4px 10px", cursor:"pointer",
                          fontSize:12, fontFamily:"inherit",
                        }}>
                        {PARENT_STAT_LABELS[stat]} (+1)
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Budget meter */}
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                  <span style={{ fontSize:12, color:C.textDim }}>Feature Budget</span>
                  <span style={{ fontSize:12, color:barColor, fontWeight:"bold" }}>
                    {used} / {budget} bp {remaining < 0 ? `(–${Math.abs(remaining)} overspent)` : ""}
                  </span>
                </div>
                <div style={{ height:5, background:"#1a1208", borderRadius:3 }}>
                  <div style={{ height:"100%", borderRadius:3, width:`${pct}%`,
                    background:`linear-gradient(90deg,${barColor}88,${barColor})`,
                    transition:"width .3s" }} />
                </div>
                <div style={{ fontSize:10, color:"#555", marginTop:3, fontStyle:"italic" }}>
                  Budget points (bp) are internal balance values — not official CP costs.
                  {budget === 0 && " This race has no standard abilities; optional features require DM permission."}
                </div>
              </div>

              {/* Customize toggle */}
              <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:14,
                fontSize:12, color:C.textDim, cursor:"pointer" }}>
                <input type="checkbox" checked={monstrousCustomize}
                  onChange={e => setMonstrousCustomize(e.target.checked)}
                  style={{ accentColor:C.gold }} />
                Customize Race Features
                {monstrousCustomize && (
                  <span style={{ fontStyle:"italic", color:"#555" }}>
                    — deselect standard abilities to free budget for optionals
                  </span>
                )}
              </label>

              {/* Standard abilities */}
              {monstrousRaceData.stdAbils.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase",
                    marginBottom:6, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>
                    Standard Abilities
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
                    {monstrousRaceData.stdAbils.map(fid => {
                      const feat = MONSTROUS_FEAT_MAP[fid];
                      if (!feat) return null;
                      const checked = selSet.has(fid);
                      const locked = !monstrousCustomize;
                      return (
                        <div key={fid} onClick={() => !locked && toggleMonstrousFeat(fid)}
                          style={{
                            background: checked ? "rgba(255,255,255,0.04)" : "transparent",
                            border:`1px solid ${checked ? C.borderHi : C.border}`,
                            borderRadius:8, padding:"9px 11px",
                            cursor: locked ? "default" : "pointer",
                            display:"flex", gap:8, alignItems:"flex-start",
                          }}>
                          <span style={{ fontSize:13, marginTop:1, minWidth:16 }}>
                            {locked ? "🔒" : checked ? "☑" : "☐"}
                          </span>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ fontSize:12, fontWeight:"bold", color:C.gold }}>
                                {feat.name}
                              </span>
                              <span style={{ fontSize:10, color:C.textDim,
                                background:"rgba(255,255,255,.06)", borderRadius:4, padding:"1px 4px" }}>
                                [{feat.code}]
                              </span>
                              <span style={{ fontSize:10, color:C.amber, marginLeft:"auto" }}>
                                {feat.bp} bp
                              </span>
                            </div>
                            <div style={{ fontSize:11, color:C.textDim, marginTop:3, lineHeight:1.4 }}>
                              {feat.text}
                            </div>
                            {feat.notes && (
                              <div style={{ fontSize:10, color:C.blue, marginTop:2, fontStyle:"italic" }}>
                                ℹ {feat.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Mandatory penalties */}
              {monstrousRaceData.penalties.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase",
                    marginBottom:6, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>
                    Mandatory Penalties
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
                    {monstrousRaceData.penalties.map(fid => {
                      const feat = MONSTROUS_FEAT_MAP[fid];
                      if (!feat) return null;
                      return (
                        <div key={fid} style={{
                          background:"rgba(200,60,60,0.04)",
                          border:`1px solid rgba(200,60,60,0.2)`,
                          borderRadius:8, padding:"9px 11px",
                          display:"flex", gap:8, alignItems:"flex-start",
                        }}>
                          <span style={{ fontSize:13, marginTop:1 }}>🔒</span>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ fontSize:12, fontWeight:"bold", color:C.red }}>
                                {feat.name}
                              </span>
                              <span style={{ fontSize:10, color:C.textDim,
                                background:"rgba(255,255,255,.06)", borderRadius:4, padding:"1px 4px" }}>
                                [{feat.code}]
                              </span>
                              <TagBadge color={C.red}>mandatory</TagBadge>
                            </div>
                            <div style={{ fontSize:11, color:C.textDim, marginTop:3, lineHeight:1.4 }}>
                              {feat.text}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Optional features — only in customize mode */}
              {monstrousCustomize && monstrousRaceData.opts.length > 0 && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:10, color:C.textDim, letterSpacing:2, textTransform:"uppercase",
                    marginBottom:6, borderBottom:`1px solid ${C.border}`, paddingBottom:4 }}>
                    Optional Features (Lore-Friendly)
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(300px,1fr))", gap:8 }}>
                    {monstrousRaceData.opts.map(fid => {
                      const feat = MONSTROUS_FEAT_MAP[fid];
                      if (!feat) return null;
                      const checked = selSet.has(fid);
                      const canAfford = checked || remaining >= feat.bp || ruleBreaker;
                      return (
                        <div key={fid} onClick={() => canAfford && toggleMonstrousFeat(fid)}
                          style={{
                            background: checked ? "rgba(80,160,80,0.07)" : "transparent",
                            border:`1px solid ${checked ? "#4a7a4a" : C.border}`,
                            borderRadius:8, padding:"9px 11px",
                            cursor: canAfford ? "pointer" : "not-allowed",
                            opacity: canAfford ? 1 : 0.45,
                            display:"flex", gap:8, alignItems:"flex-start",
                          }}>
                          <span style={{ fontSize:13, marginTop:1, minWidth:16 }}>
                            {checked ? "☑" : "☐"}
                          </span>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                              <span style={{ fontSize:12, fontWeight:"bold", color:"#8bc34a" }}>
                                {feat.name}
                              </span>
                              <TagBadge color="#8bc34a">optional</TagBadge>
                              <span style={{ fontSize:10, color:C.amber, marginLeft:"auto" }}>
                                {feat.bp} bp
                              </span>
                            </div>
                            <div style={{ fontSize:11, color:C.textDim, marginTop:3, lineHeight:1.4 }}>
                              {feat.text}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
