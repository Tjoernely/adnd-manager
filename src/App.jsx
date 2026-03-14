import { useState, useEffect, useCallback } from "react";
import { useCharacter } from "./hooks/useCharacter.js";
import { useAuth }      from "./hooks/useAuth.js";
import { TABS, C, numInputStyle, statColor } from "./data/constants.js";
import { ALL_SUBS } from "./data/abilities.js";
import { api } from "./api/client.js";

import { LoginScreen }      from "./components/auth/LoginScreen.jsx";
import { CampaignSelector } from "./components/campaign/CampaignSelector.jsx";
import { Toggle, QL, Chip, Overlay, Modal, CloseBtn } from "./components/ui/index.js";

import { ScoresTab }  from "./components/tabs/ScoresTab.jsx";
import { RacesTab }   from "./components/tabs/RacesTab.jsx";
import { ClassesTab } from "./components/tabs/ClassesTab.jsx";
import { KitsTab }    from "./components/tabs/KitsTab.jsx";
import { TraitsTab }  from "./components/tabs/TraitsTab.jsx";
import { ProfsTab }   from "./components/tabs/ProfsTab.jsx";
import { WeaponsTab } from "./components/tabs/WeaponsTab.jsx";
import { MasteryTab } from "./components/tabs/MasteryTab.jsx";
import { ThiefTab }    from "./components/tabs/ThiefTab.jsx";
import { PortraitTab } from "./components/tabs/PortraitTab.jsx";
import { PrintSheet }  from "./components/PrintSheet.jsx";

export default function App() {
  // ── Auth ────────────────────────────────────────────────────────
  const { user, loading: authLoading, error: authError, login, register, logout } = useAuth();

  // ── Campaign selection ──────────────────────────────────────────
  const [activeCampaign, setActiveCampaign] = useState(null);

  // ── Character persistence state ─────────────────────────────────
  const [dbCharId,    setDbCharId]    = useState(null);   // null = unsaved new char
  const [characters,  setCharacters]  = useState([]);     // list in this campaign
  const [saveStatus,  setSaveStatus]  = useState('idle'); // 'idle'|'saving'|'saved'|'error'
  const [showCharMenu, setShowCharMenu] = useState(false);
  const [showPrint,    setShowPrint]    = useState(false);

  const char = useCharacter();
  const { serializeCharacter, loadCharacterState } = char;

  // Load character list when entering a campaign
  useEffect(() => {
    if (!activeCampaign) return;
    api.getCharacters(activeCampaign.id)
      .then(setCharacters)
      .catch(console.error);
  }, [activeCampaign]);

  // Save character to DB (create or update)
  const saveCharacter = useCallback(async () => {
    if (!activeCampaign) return;
    setSaveStatus('saving');
    try {
      const data = serializeCharacter();
      const name = char.charName;
      if (dbCharId) {
        const updated = await api.saveCharacter(dbCharId, { name, data });
        setCharacters(prev => prev.map(c => c.id === dbCharId ? updated : c));
      } else {
        const created = await api.createCharacter({
          campaign_id: activeCampaign.id,
          name,
          data,
        });
        setDbCharId(created.id);
        setCharacters(prev => [created, ...prev]);
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (e) {
      console.error('Save error:', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, [activeCampaign, dbCharId, char, serializeCharacter]);

  // Load a character from the DB list
  const loadCharacter = useCallback((dbChar) => {
    loadCharacterState(dbChar.data);
    setDbCharId(dbChar.id);
    setShowCharMenu(false);
  }, [loadCharacterState]);

  // Start a brand-new character (without saving current)
  const newCharacter = useCallback(() => {
    loadCharacterState(null); // resets to defaults
    setDbCharId(null);
    setShowCharMenu(false);
  }, [loadCharacterState]);

  // Delete current character from DB
  const deleteCharacter = useCallback(async () => {
    if (!dbCharId) return;
    try {
      await api.deleteCharacter(dbCharId);
      setCharacters(prev => prev.filter(c => c.id !== dbCharId));
      loadCharacterState(null);
      setDbCharId(null);
      setShowCharMenu(false);
    } catch (e) {
      console.error('Delete error:', e);
    }
  }, [dbCharId, loadCharacterState]);

  // ── Auth gate ───────────────────────────────────────────────────
  if (!user) {
    return <LoginScreen onLogin={login} onRegister={register} loading={authLoading} error={authError} />;
  }

  // ── Campaign gate ───────────────────────────────────────────────
  if (!activeCampaign) {
    return (
      <CampaignSelector
        user={user}
        onSelect={camp => { setActiveCampaign(camp); setDbCharId(null); }}
        onLogout={logout}
      />
    );
  }

  const {
    activeTab, setActiveTab,
    charName, setCharName, charGender, setCharGender, charLevel, setCharLevel,
    ruleBreaker, setRuleBreaker,
    cpPerLevelOverride, setCpPerLevelOverride,
    dmAwards, setDmAwards, dmAwardInput, setDmAwardInput,
    showDmPanel, setShowDmPanel,
    infoModal, setInfoModal,
    confirmBox, setConfirmBox,
    chooseSubMod, setChooseSubMod,
    classData, raceData, subRaceData,
    baseClassCP, nwpClassPool, weapClassPool, knowledgeCP,
    disadvPool, DISADV_POOL_WARN, dmAwardTotal,
    remainCP, mageSpBonus, MAGE_SP_CLASSES, selectedClass,
    activeKitObj, kitAllReqsMet, kitRequiredNWPUnmet,
    effectiveCpPerLevel,
    effSub,
    validationWarnings,
  } = char;

  return (
    <div id="app-screen" style={{ minHeight:"100vh", background:C.bg, color:C.text,
      fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif" }}>

      {/* Noise grain */}
      <div style={{ position:"fixed", inset:0, zIndex:0, pointerEvents:"none",
        backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.028'/%3E%3C/svg%3E")`,
        backgroundSize:"300px" }} />

      {/* ══════════ HEADER ══════════ */}
      <header style={{ position:"relative", zIndex:2,
        background:"linear-gradient(180deg,#1c1408,#130f05)",
        borderBottom:`2px solid ${C.borderHi}`,
        boxShadow:"0 4px 32px rgba(0,0,0,.8)",
        padding:"18px 28px 0" }}>

        <div style={{ display:"flex", alignItems:"flex-start", gap:18, marginBottom:14, flexWrap:"wrap" }}>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:3, flexWrap:"wrap" }}>
              <span style={{ fontSize:10, letterSpacing:6, color:C.goldDim, textTransform:"uppercase" }}>
                AD&amp;D 2nd Edition ✦ Skills &amp; Powers ✦ Character Creation Engine
              </span>
              {/* Campaign + user pill */}
              <span style={{ fontSize:10, background:"rgba(0,0,0,.4)",
                border:`1px solid ${C.border}`, borderRadius:12,
                padding:"2px 10px", color:C.textDim, cursor:"pointer" }}
                onClick={()=>{ setActiveCampaign(null); setDbCharId(null); }}>
                🗡️ {activeCampaign.name} ▸ {user.email}
              </span>
              <button onClick={logout} style={{
                fontSize:10, background:"transparent", border:"none",
                color:"#5a4030", cursor:"pointer", fontFamily:"inherit", padding:0,
              }}
                onMouseEnter={e=>e.target.style.color=C.red}
                onMouseLeave={e=>e.target.style.color="#5a4030"}>
                sign out
              </button>
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
              <input value={charName} onChange={e=>setCharName(e.target.value)}
                style={{ background:"transparent", border:"none", outline:"none",
                  color:C.gold, fontSize:26, fontWeight:"bold", fontFamily:"inherit",
                  borderBottom:`1px solid ${C.borderHi}`, paddingBottom:2, minWidth:180 }} />
              {/* Gender */}
              <QL label="Gender">
                <select value={charGender} onChange={e=>setCharGender(e.target.value)}
                  style={{ ...numInputStyle, minWidth:80, cursor:"pointer" }}>
                  <option value="">—</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </QL>
              <QL label="Level">
                <input type="number" min={1} max={20} value={charLevel}
                  onChange={e=>setCharLevel(Math.max(1,Math.min(20,+e.target.value)))}
                  style={numInputStyle} />
              </QL>
              {classData && <Chip>{classData.icon} {classData.label}</Chip>}
              {raceData   && <Chip dim>{raceData.icon} {raceData.label}{subRaceData?` (${subRaceData.label})`:""}</Chip>}
              {/* Save / load strip */}
              <div style={{ display:"flex", alignItems:"center", gap:6, marginLeft:"auto" }}>
                {/* Character picker */}
                <div style={{ position:"relative" }}>
                  <button onClick={()=>setShowCharMenu(v=>!v)} style={{
                    fontSize:11, padding:"4px 10px", borderRadius:5, cursor:"pointer",
                    background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                    color:C.textDim, fontFamily:"inherit",
                  }}>
                    📂 {characters.length} char{characters.length!==1?"s":""}
                  </button>
                  {showCharMenu && (
                    <div style={{
                      position:"absolute", top:"calc(100% + 6px)", left:0,
                      background:"#1a1208", border:`1px solid ${C.borderHi}`,
                      borderRadius:8, padding:8, minWidth:220, zIndex:100,
                      boxShadow:"0 8px 30px rgba(0,0,0,.8)",
                    }}>
                      <button onClick={newCharacter} style={{
                        width:"100%", textAlign:"left", padding:"7px 10px",
                        background:"rgba(212,160,53,.08)", border:`1px solid ${C.border}`,
                        borderRadius:5, color:C.gold, cursor:"pointer",
                        fontFamily:"inherit", fontSize:11, marginBottom:4,
                      }}>
                        + New Character
                      </button>
                      <button onClick={()=>{
                        setShowCharMenu(false);
                        setConfirmBox({
                          msg:`Reset "${charName}" to a blank character?\n\nAll unsaved changes will be lost.`,
                          onConfirm: () => { loadCharacterState(null); setDbCharId(null); },
                          label:"Reset", color:"#c07030",
                        });
                      }} style={{
                        width:"100%", textAlign:"left", padding:"7px 10px",
                        background:"rgba(180,80,30,.08)", border:`1px solid rgba(140,60,20,.3)`,
                        borderRadius:5, color:"#c07030", cursor:"pointer",
                        fontFamily:"inherit", fontSize:11, marginBottom:4,
                      }}>
                        ↺ Reset Character
                      </button>
                      {dbCharId && (
                        <button onClick={()=>{
                          setShowCharMenu(false);
                          setConfirmBox({
                            msg:`Delete "${charName}" permanently?\n\nThis cannot be undone.`,
                            onConfirm: deleteCharacter,
                            label:"Delete", color:C.red,
                          });
                        }} style={{
                          width:"100%", textAlign:"left", padding:"7px 10px",
                          background:"rgba(180,30,30,.08)", border:`1px solid rgba(140,20,20,.3)`,
                          borderRadius:5, color:C.red, cursor:"pointer",
                          fontFamily:"inherit", fontSize:11, marginBottom:6,
                        }}>
                          🗑 Delete Character
                        </button>
                      )}
                      {characters.map(c=>(
                        <div key={c.id} onClick={()=>loadCharacter(c)}
                          style={{
                            padding:"6px 10px", borderRadius:5, cursor:"pointer",
                            background: c.id===dbCharId?"rgba(212,160,53,.12)":"transparent",
                            border:`1px solid ${c.id===dbCharId?C.border:"transparent"}`,
                            color: c.id===dbCharId?C.gold:C.text, fontSize:11,
                            marginBottom:2, transition:"background .12s",
                          }}
                          onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}
                          onMouseLeave={e=>e.currentTarget.style.background=c.id===dbCharId?"rgba(212,160,53,.12)":"transparent"}>
                          {c.id===dbCharId?"▶ ":""}{c.name}
                          <span style={{ fontSize:9, color:C.textDim, marginLeft:6 }}>
                            {new Date(c.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                      {characters.length===0 && (
                        <div style={{ fontSize:11, color:C.textDim, padding:"6px 10px", fontStyle:"italic" }}>
                          No saved characters yet
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* Print button */}
                <button onClick={()=>setShowPrint(true)} style={{
                  fontSize:11, padding:"4px 10px", borderRadius:5, cursor:"pointer",
                  background:"rgba(0,0,0,.35)", border:`1px solid ${C.border}`,
                  color:C.textDim, fontFamily:"inherit",
                }}
                  onMouseEnter={e=>{ e.target.style.background="rgba(100,80,20,.3)"; e.target.style.color=C.gold; }}
                  onMouseLeave={e=>{ e.target.style.background="rgba(0,0,0,.35)";   e.target.style.color=C.textDim; }}>
                  🖨 Print
                </button>
                {/* Save button */}
                <button onClick={saveCharacter}
                  disabled={saveStatus==="saving"}
                  style={{
                    fontSize:11, padding:"4px 14px", borderRadius:5, cursor:saveStatus==="saving"?"not-allowed":"pointer",
                    border:"none", fontFamily:"inherit", fontWeight:"bold",
                    background: saveStatus==="saved"  ? "rgba(60,180,60,.25)"  :
                                saveStatus==="error"   ? "rgba(200,50,50,.25)"  :
                                saveStatus==="saving"  ? "rgba(212,160,53,.1)"  :
                                                         `linear-gradient(135deg,#7a5a10,${C.gold})`,
                    color: saveStatus==="saved"  ? "#80e080" :
                           saveStatus==="error"  ? C.red :
                           saveStatus==="saving" ? C.textDim : "#1a0f00",
                  }}>
                  {saveStatus==="saving" ? "Saving…" : saveStatus==="saved" ? "✓ Saved" : saveStatus==="error" ? "✗ Error" : dbCharId ? "💾 Save" : "💾 Save New"}
                </button>
                {dbCharId && (
                  <span style={{ fontSize:9, color:C.textDim }}>
                    #{dbCharId}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* CP Panel */}
          <div style={{ display:"flex", background:"rgba(0,0,0,.5)",
            border:`1px solid ${C.border}`, borderRadius:10, overflow:"hidden" }}>
            {[
              { l:"Class Abil CP",  v:baseClassCP, c:C.text },
              { l:"+NWP Pool",  v:nwpClassPool>0?`+${nwpClassPool}`:"—", c:"#70a8d0", tip:"Ch.6" },
              { l:"+Weap Pool", v:weapClassPool>0?`+${weapClassPool}`:"—", c:"#d09050", tip:"Ch.7" },
              { l:"+Know.",     v:`+${knowledgeCP}`, c:C.green },
              { l:"+Disadv.",   v:disadvPool>0?`+${disadvPool}`:"—",
                c:disadvPool>DISADV_POOL_WARN?C.redBri:C.amber,
                bold:disadvPool>DISADV_POOL_WARN },
              { l:"+DM Awards", v:dmAwardTotal>0?`+${dmAwardTotal}`:"—", c:"#a07fd0" },
              { l:"Available",  v:remainCP,
                c:remainCP<0?C.redBri:remainCP<3?C.amber:C.gold, large:true },
              { l:"Mage SP",    v:mageSpBonus > 0 ? `+${mageSpBonus}` : (MAGE_SP_CLASSES.has(selectedClass) ? `+${mageSpBonus}` : "—"),
                c:C.purple },
            ].map((item,i)=>(
              <div key={i} style={{ padding:"10px 16px", textAlign:"center",
                borderRight:`1px solid ${C.border}`,
                background:item.large?"rgba(212,160,53,.05)":"transparent" }}>
                <div style={{ fontSize:item.large?22:17, fontWeight:"bold",
                  lineHeight:1, color:item.c,
                  textShadow:item.bold?`0 0 14px ${item.c}`:"none" }}>
                  {item.v}
                </div>
                <div style={{ fontSize:9, letterSpacing:2, color:C.textDim,
                  textTransform:"uppercase", marginTop:3 }}>{item.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rule-Breaker + CP/level + DM Awards row */}
        <div style={{ display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap", paddingBottom:4 }}>
          {/* Rule-Breaker toggle */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:C.textDim }}>Rule-Breaker</span>
            <Toggle on={ruleBreaker} onToggle={()=>setRuleBreaker(r=>!r)} />
            {ruleBreaker && <span style={{ fontSize:10, color:C.red, fontStyle:"italic" }}>Active — rules suspended</span>}
            {/* Kit violation warnings in header */}
            {!ruleBreaker && activeKitObj && !kitAllReqsMet && (
              <span style={{ fontSize:10, color:C.red,
                background:"rgba(200,50,50,.1)", border:`1px solid rgba(200,50,50,.3)`,
                borderRadius:4, padding:"2px 7px", marginLeft:4 }}>
                ⚠ Kit "{activeKitObj.name}" reqs not met
              </span>
            )}
            {!ruleBreaker && kitRequiredNWPUnmet.length > 0 && (
              <span style={{ fontSize:10, color:C.red,
                background:"rgba(200,50,50,.1)", border:`1px solid rgba(200,50,50,.3)`,
                borderRadius:4, padding:"2px 7px", marginLeft:4 }}>
                ⚠ Kit needs {kitRequiredNWPUnmet.length} proficienc{kitRequiredNWPUnmet.length!==1?"ies":"y"}
              </span>
            )}
          </div>

          {/* CP per Level counter */}
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:11, color:C.textDim }}>CP / Level</span>
            <div style={{ display:"flex", alignItems:"center", gap:3 }}>
              <button onClick={()=>setCpPerLevelOverride(v=>Math.max(0,v-1))}
                style={{ ...numInputStyle, width:22, padding:"0", textAlign:"center",
                  cursor:"pointer", fontSize:14, lineHeight:"22px" }}>−</button>
              <input type="number" min={0} max={ruleBreaker?99:5}
                value={cpPerLevelOverride}
                onChange={e=>{
                  const raw = Math.max(0, Math.min(ruleBreaker?99:5, +e.target.value||0));
                  if (raw > 5 && !ruleBreaker) {
                    setConfirmBox({
                      msg: `CP/Level above 5 exceeds the S&P maximum.\n\nEnable Rule-Breaker to allow this?`,
                      onConfirm: () => { setRuleBreaker(true); setCpPerLevelOverride(raw); },
                    });
                  } else {
                    setCpPerLevelOverride(raw);
                  }
                }}
                style={{ ...numInputStyle, width:40, textAlign:"center" }} />
              <button onClick={()=>{
                  const next = cpPerLevelOverride + 1;
                  if (next > 5 && !ruleBreaker) {
                    setConfirmBox({
                      msg: `CP/Level above 5 exceeds the S&P maximum.\n\nEnable Rule-Breaker to allow this?`,
                      onConfirm: () => { setRuleBreaker(true); setCpPerLevelOverride(next); },
                    });
                  } else {
                    setCpPerLevelOverride(Math.min(ruleBreaker?99:5, next));
                  }
                }}
                style={{ ...numInputStyle, width:22, padding:"0", textAlign:"center",
                  cursor:"pointer", fontSize:14, lineHeight:"22px" }}>+</button>
            </div>
            {charLevel > 1 && (
              <span style={{ fontSize:10, color:C.amber }}>
                = +{effectiveCpPerLevel*(charLevel-1)} CP at Lv{charLevel}
              </span>
            )}
          </div>

          {/* DM Award toggle */}
          <button onClick={()=>setShowDmPanel(p=>!p)} style={{
            background: showDmPanel ? "rgba(160,127,208,.15)" : "rgba(0,0,0,.3)",
            border:`1px solid ${showDmPanel ? "#a07fd0" : C.border}`,
            borderRadius:5, padding:"4px 12px", cursor:"pointer",
            fontFamily:"inherit", fontSize:11,
            color: showDmPanel ? "#c8a8f0" : C.textDim,
          }}>
            🏆 DM Awards {dmAwards.length > 0 ? `(${dmAwards.length} · +${dmAwardTotal} CP)` : ""}
          </button>
        </div>

        {/* DM Award panel */}
        {showDmPanel && (
          <div style={{ background:"rgba(100,70,160,.08)", border:`1px solid rgba(160,127,208,.3)`,
            borderRadius:10, padding:"14px 18px", marginBottom:4 }}>
            <div style={{ fontSize:11, letterSpacing:3, color:"#a07fd0",
              textTransform:"uppercase", marginBottom:12 }}>DM Awards — Extraordinary CP</div>

            {/* Add award form */}
            <div style={{ display:"flex", gap:8, alignItems:"center", marginBottom:12, flexWrap:"wrap" }}>
              <input type="number" min={1} max={99} value={dmAwardInput.cp}
                onChange={e=>setDmAwardInput(p=>({...p, cp:Math.max(1,+e.target.value)}))}
                style={{ ...numInputStyle, width:52 }} />
              <span style={{ fontSize:11, color:C.textDim }}>CP</span>
              <input value={dmAwardInput.reason}
                onChange={e=>setDmAwardInput(p=>({...p, reason:e.target.value}))}
                placeholder="Reason (e.g. Defeated the lich, discovered the ancient map…)"
                onKeyDown={e=>{
                  if (e.key==="Enter" && dmAwardInput.reason.trim()) {
                    setDmAwards(prev=>[...prev, {
                      id: Date.now(),
                      cp: dmAwardInput.cp,
                      reason: dmAwardInput.reason.trim(),
                      date: new Date().toLocaleDateString(),
                    }]);
                    setDmAwardInput({ cp:1, reason:"" });
                  }
                }}
                style={{ flex:1, minWidth:200, background:"rgba(0,0,0,.4)",
                  border:`1px solid ${C.border}`, borderRadius:5,
                  padding:"5px 10px", color:C.text, fontFamily:"inherit", fontSize:12,
                  outline:"none" }} />
              <button
                onClick={()=>{
                  if (!dmAwardInput.reason.trim()) return;
                  setDmAwards(prev=>[...prev, {
                    id: Date.now(),
                    cp: dmAwardInput.cp,
                    reason: dmAwardInput.reason.trim(),
                    date: new Date().toLocaleDateString(),
                  }]);
                  setDmAwardInput({ cp:1, reason:"" });
                }}
                style={{ background:"rgba(160,127,208,.2)", border:`1px solid #a07fd0`,
                  borderRadius:5, padding:"5px 14px", cursor:"pointer",
                  fontFamily:"inherit", fontSize:12, color:"#c8a8f0" }}>
                + Add
              </button>
            </div>

            {/* Award log */}
            {dmAwards.length === 0
              ? <div style={{ fontSize:12, color:C.textDim, fontStyle:"italic" }}>No awards yet.</div>
              : (
                <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                  {dmAwards.map(a=>(
                    <div key={a.id} style={{ display:"flex", alignItems:"center", gap:8,
                      background:"rgba(0,0,0,.3)", borderRadius:6, padding:"7px 10px",
                      border:`1px solid rgba(160,127,208,.2)` }}>
                      <span style={{ fontSize:13, fontWeight:"bold", color:"#c8a8f0",
                        minWidth:30, textAlign:"center" }}>+{a.cp}</span>
                      <span style={{ flex:1, fontSize:12, color:C.text }}>{a.reason}</span>
                      <button onClick={()=>setDmAwards(prev=>prev.filter(x=>x.id!==a.id))}
                        style={{ background:"none", border:"none", cursor:"pointer",
                          color:C.textDim, fontSize:14, lineHeight:1, padding:"0 2px" }}>×</button>
                    </div>
                  ))}
                  <div style={{ marginTop:4, fontSize:11, color:"#a07fd0", textAlign:"right" }}>
                    Total: +{dmAwardTotal} CP from {dmAwards.length} award{dmAwards.length!==1?"s":""}
                  </div>
                </div>
              )
            }
          </div>
        )}
        {/* Tabs */}
        <nav style={{ display:"flex" }}>
          {TABS.map(tab=>{
            const tabHasWarn = validationWarnings?.some(w => w.tab === tab.id);
            return (
              <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{
                background:"none", border:"none", cursor:"pointer",
                padding:"12px 20px", fontSize:12, fontFamily:"inherit",
                color:activeTab===tab.id?C.gold:tabHasWarn?C.red:C.textDim,
                borderBottom:activeTab===tab.id?`3px solid ${C.gold}`:tabHasWarn?`3px solid ${C.red}`:"3px solid transparent",
                marginBottom:-2, letterSpacing:.4, transition:"color .15s",
                display:"flex", alignItems:"center", gap:5,
              }}>
                <span>{tab.icon}</span><span>{tab.label}</span>
                {tabHasWarn && <span style={{ fontSize:8, color:C.red, lineHeight:1 }}>●</span>}
              </button>
            );
          })}
        </nav>
      </header>

      {/* ══════════ MAIN ══════════ */}
      <main style={{ position:"relative", zIndex:1, maxWidth:1160,
        margin:"0 auto", padding:"30px 22px 80px" }}>

        {/* ── Validation warning banner ─────────────────────────────────────── */}
        {validationWarnings?.length > 0 && (
          <div style={{ marginBottom:20, borderRadius:8, overflow:"hidden",
            border:`2px solid ${C.red}`, background:"rgba(180,30,30,.1)" }}>
            <div style={{ padding:"8px 16px", background:"rgba(180,30,30,.2)",
              display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:14, color:C.redBri, fontWeight:"bold" }}>
                ⚠ Character Validation Issues
              </span>
              <span style={{ fontSize:11, color:"#c08080" }}>
                Earlier choices are no longer valid. Please review and correct before play.
              </span>
            </div>
            {validationWarnings.map((w, i) => (
              <div key={i} style={{ padding:"8px 16px", display:"flex", alignItems:"center", gap:12,
                borderTop: i > 0 ? "1px solid rgba(180,50,50,.2)" : "none" }}>
                <span style={{ fontSize:12, color:C.red, flex:1 }}>{w.detail}</span>
                <button onClick={() => setActiveTab(w.tab)}
                  style={{ fontSize:10, padding:"3px 10px", borderRadius:4, cursor:"pointer",
                    fontFamily:"inherit", border:`1px solid ${C.red}`,
                    background:"rgba(180,30,30,.15)", color:C.red }}>
                  Go to {w.tab.charAt(0).toUpperCase() + w.tab.slice(1)} tab →
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ╔══════════════════════════════╗
            ║   CH.1: ABILITY SCORES       ║
            ╚══════════════════════════════╝ */}
        {activeTab === "scores" && <ScoresTab {...char} />}

        {/* ╔══════════════════════════════╗
            ║   CH.2: RACES                ║
            ╚══════════════════════════════╝ */}
        {activeTab === "races" && <RacesTab {...char} ALL_SUBS={ALL_SUBS} />}

        {/* ╔══════════════════════════════╗
            ║   CH.3: CLASSES              ║
            ╚══════════════════════════════╝ */}
        {activeTab === "classes" && <ClassesTab {...char} ALL_SUBS={ALL_SUBS} />}

        {/* ╔══════════════════════════════════════╗
            ║   CH.5: CHARACTER KITS               ║
            ╚══════════════════════════════════════╝ */}
        {activeTab === "kits" && <KitsTab {...char} />}

        {/* ╔══════════════════════════════╗
            ║   CH.4: TRAITS & DISADVS     ║
            ╚══════════════════════════════╝ */}
        {activeTab === "traits" && <TraitsTab {...char} />}

        {activeTab === "profs" && <ProfsTab {...char} ALL_SUBS={ALL_SUBS} />}

        {activeTab === "weapons" && <WeaponsTab {...char} />}

        {activeTab === "mastery" && <MasteryTab {...char} />}

        {activeTab === "thieving" && <ThiefTab {...char} />}

        {activeTab === "portrait" && <PortraitTab {...char} dbCharId={dbCharId} />}

      </main>

      {/* ══════════ MODALS ══════════ */}

      {infoModal && (
        <Overlay onClick={()=>setInfoModal(null)}>
          <Modal onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:16, color:C.gold, marginBottom:10 }}>{infoModal.title}</div>
            <div style={{ fontSize:13, color:"#a09070", lineHeight:1.75 }}>{infoModal.body}</div>
            <CloseBtn onClick={()=>setInfoModal(null)} />
          </Modal>
        </Overlay>
      )}

      {confirmBox && (
        <Overlay onClick={()=>setConfirmBox(null)}>
          <Modal onClick={e=>e.stopPropagation()} borderColor={confirmBox.color ?? C.red}>
            <div style={{ fontSize:17, color:confirmBox.color ?? C.red, marginBottom:10 }}>
              ⚠ {confirmBox.label ? "Confirm Action" : "Rule Violation"}
            </div>
            <div style={{ fontSize:13, color:"#c0a87a", lineHeight:1.7,
              whiteSpace:"pre-line", marginBottom:20 }}>{confirmBox.msg}</div>
            <div style={{ display:"flex", gap:12 }}>
              <button onClick={()=>{ confirmBox.onConfirm(); setConfirmBox(null); }}
                style={{ background: confirmBox.color ? `${confirmBox.color}33` : "#7a1a1a",
                  border:`1px solid ${confirmBox.color ?? C.red}`,
                  borderRadius:6, padding:"8px 20px",
                  color: confirmBox.color ?? "#fff",
                  cursor:"pointer", fontFamily:"inherit", fontSize:13 }}>
                {confirmBox.label ? `${confirmBox.label} — Confirm` : "Enable Rule-Breaker & Proceed"}
              </button>
              <CloseBtn onClick={()=>setConfirmBox(null)} label="Cancel" />
            </div>
          </Modal>
        </Overlay>
      )}

      {chooseSubMod && (
        <Overlay onClick={()=>setChooseSubMod(null)}>
          <Modal onClick={e=>e.stopPropagation()}>
            <div style={{ fontSize:15, color:C.gold, marginBottom:6 }}>
              Choose Sub-Ability Bonus
            </div>
            <div style={{ fontSize:12, color:C.textDim, marginBottom:14 }}>
              "{chooseSubMod.name}" grants +1 to one sub-ability:
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {ALL_SUBS.map(sub=>(
                <button key={sub.id} onClick={()=>{
                  chooseSubMod.onPick(sub.id); setChooseSubMod(null);
                }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=C.gold}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=C.border}
                  style={{ background:C.card, border:`1px solid ${C.border}`, borderRadius:7,
                    padding:"9px 12px", cursor:"pointer", fontFamily:"inherit",
                    display:"flex", justifyContent:"space-between", alignItems:"center",
                    transition:"border-color .14s" }}>
                  <span style={{ fontSize:13, color:C.textBri }}>{sub.label}</span>
                  <span style={{ fontSize:13, color:statColor(effSub(sub.id)) }}>
                    {effSub(sub.id)}
                  </span>
                </button>
              ))}
            </div>
            <CloseBtn onClick={()=>setChooseSubMod(null)} style={{ marginTop:14 }} />
          </Modal>
        </Overlay>
      )}

      {/* ══════════ PRINT SHEET ══════════ */}
      <PrintSheet {...char} isOpen={showPrint} onClose={()=>setShowPrint(false)} />

    </div>
  );
}
