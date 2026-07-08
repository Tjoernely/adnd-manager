// PortraitTab.jsx — AI Portrait Generator (server-side Gemini, shared key)
import { useState, useEffect, useCallback } from "react";
import { C } from "../../data/constants.js";
import { ChHead } from "../ui/index.js";
import { WEAPON_GROUPS_49 } from "../../data/weapons.js";
import {
  generateCharacterImage, isAiApproved, AI_APPROVAL_MESSAGE, isImageCapError,
} from "../../api/aiClient.js";

// ── Field builder ─────────────────────────────────────────────────────────────
// The PROMPT is built server-side now (server/lib/characterImagePrompt.js) —
// full figure, environment derived from class + race, whitelisted fields only.
// The client's job is just to hand over the descriptive fields it can resolve
// from local game data (weapon IDs → names etc.). No ability scores, no CPs,
// no internal flags — the server would drop them anyway.

// Primary weapon: highest mastery tier, else any single proficiency.
function getPrimaryWeaponName(weapPicked, masteryPicked) {
  const findName = (id) => {
    let name = null;
    WEAPON_GROUPS_49.forEach(bg => {
      bg.tightGroups.forEach(tg => tg.weapons.forEach(w => {
        if (w.id === id && !w.dupe) name = w.name;
      }));
      bg.unrelated.forEach(w => { if (w.id === id) name = w.name; });
    });
    return name;
  };

  const tierOrder = ["grandmastery","highmastery","mastery","spec","expertise"];
  let bestTierIdx = 999, bestId = null;
  Object.entries(masteryPicked ?? {}).forEach(([weapId, info]) => {
    const idx = tierOrder.indexOf(info.tier);
    if (idx >= 0 && idx < bestTierIdx) { bestTierIdx = idx; bestId = weapId; }
  });
  if (bestId) {
    const name = findName(bestId);
    if (name) return name;
  }
  const singles = Object.entries(weapPicked ?? {})
    .filter(([id, lvl]) => !id.startsWith("wsp_") && lvl === "single");
  if (singles.length > 0) return findName(singles[0][0]);
  return null;
}

const ARMOR_BY_GROUP = {
  warrior: "full plate armor",
  priest:  "chainmail",
  rogue:   "leather armor",
  wizard:  "robes or common clothes",
};

function buildPortraitFields({
  charGender, charLevel, raceData, classData, activeKitObj,
  weapPicked, masteryPicked, classGroup,
  charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
  selectedRace,
}) {
  const weapon = getPrimaryWeaponName(weapPicked, masteryPicked);
  return {
    race:      raceData?.label ?? selectedRace ?? "Human",
    charClass: classData?.label ?? "Adventurer",
    ...(activeKitObj?.name ? { kit: activeKitObj.name } : {}),
    ...(charGender ? { gender: charGender } : {}),
    ...(charLevel ? { level: charLevel } : {}),
    ...(weapon ? { weapon } : {}),
    armor: ARMOR_BY_GROUP[classGroup] ?? "robes or common clothes",
    ...(Object.keys(weapPicked ?? {}).some(id => id.startsWith("wsp_shield_")) ? { shield: true } : {}),
    ...(charAge ? { age: charAge } : {}),
    ...(charHairColor ? { hairColor: charHairColor } : {}),
    ...(charEyeColor ? { eyeColor: charEyeColor } : {}),
    ...(charDistinctiveFeatures ? { distinctiveFeatures: charDistinctiveFeatures } : {}),
    ...(charAppearanceNotes?.trim() ? { appearanceNotes: charAppearanceNotes.trim() } : {}),
  };
}

// ── localStorage history helpers ──────────────────────────────────────────────
// gpt-image-1 portraits are stored as ~1.5-3 MB data: URLs (the old dall-e-3
// URLs were tiny), so a 5-deep history could blow the ~5 MB localStorage quota.
// Cap at 3 and degrade gracefully on QuotaExceededError.
const MAX_HISTORY = 3;

function historyKey(dbCharId, charName) {
  return `portrait_history_${dbCharId ?? ("name_" + (charName ?? "unnamed"))}`;
}
function loadHistory(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); }
  catch { return []; }
}
function saveHistory(key, entries) {
  // Drop the oldest kept entries until it fits the quota (entries are
  // newest-first). If even one won't fit, clear the key rather than throw.
  let list = entries.slice(0, MAX_HISTORY);
  while (list.length > 0) {
    try { localStorage.setItem(key, JSON.stringify(list)); return; }
    catch { list = list.slice(0, list.length - 1); }
  }
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

// ── Small input style reused below ────────────────────────────────────────────
const fieldStyle = {
  width: "100%",
  background: "#0d0903",
  border: `1px solid ${C.border}`,
  borderRadius: 5,
  color: C.text,
  fontSize: 12,
  fontFamily: "inherit",
  padding: "6px 10px",
  outline: "none",
  boxSizing: "border-box",
};

// ── Main Component ────────────────────────────────────────────────────────────
export function PortraitTab(props) {
  const {
    // Identity
    charName, charGender, charLevel, selectedRace,
    raceData, classData, activeKitObj, classGroup,
    // Weapons
    weapPicked, masteryPicked,
    // Appearance fields (from useCharacter)
    charAge,                setCharAge,
    charHairColor,          setCharHairColor,
    charEyeColor,           setCharEyeColor,
    charDistinctiveFeatures,setCharDistinctiveFeatures,
    charAppearanceNotes,    setCharAppearanceNotes,
    portraitUrl,            setPortraitUrl,
    // dbCharId from App.jsx
    dbCharId,
  } = props;

  // ── Local state
  const [generating,     setGenerating]      = useState(false);
  const [genError,       setGenError]        = useState(null);
  const [historyOpen,    setHistoryOpen]     = useState(false);
  const [history,        setHistory]         = useState([]);
  const [lastPrompt,     setLastPrompt]      = useState(null);
  const [capInfo,        setCapInfo]         = useState(null);   // { used, cap }

  const aiApproved = isAiApproved();

  // Load history on mount / when character changes
  const hKey = historyKey(dbCharId, charName);
  useEffect(() => {
    setHistory(loadHistory(hKey));
  }, [hKey]);

  // ── Generate portrait (server-side Gemini on the shared key)
  const generate = useCallback(async () => {
    const fields = buildPortraitFields({
      charGender, charLevel, raceData, classData, activeKitObj,
      weapPicked, masteryPicked, classGroup,
      charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
      selectedRace,
    });

    setGenerating(true);
    setGenError(null);

    try {
      // Inline fields carry the live sheet; dbCharId lets the server fall
      // back to the saved record. Returns a permanent data: URL + the
      // server-built prompt.
      const { image, prompt, used, cap } = await generateCharacterImage({
        characterId: dbCharId, fields,
      });

      setPortraitUrl(image);
      setLastPrompt(prompt);
      setCapInfo({ used, cap });

      // Add to history
      const newEntry = { url: image, timestamp: Date.now(), prompt };
      const updated  = [newEntry, ...loadHistory(hKey)].slice(0, MAX_HISTORY);
      saveHistory(hKey, updated);
      setHistory(updated);

    } catch (err) {
      if (isImageCapError(err)) setCapInfo({ used: err.used, cap: err.cap });
      setGenError(err?.message ?? "Image generation failed.");
    } finally {
      setGenerating(false);
    }
  }, [
    charGender, charLevel, raceData, classData, activeKitObj,
    weapPicked, masteryPicked, classGroup,
    charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    selectedRace, dbCharId, hKey, setPortraitUrl,
  ]);

  // ── Set a history entry as current
  const setFromHistory = (entry) => {
    setPortraitUrl(entry.url);
    setGenError(null);
  };

  // ── Delete a history entry
  const deleteHistory = (idx) => {
    const updated = history.filter((_, i) => i !== idx);
    saveHistory(hKey, updated);
    setHistory(updated);
    if (history[idx]?.url === portraitUrl && updated.length > 0) {
      setPortraitUrl(updated[0].url);
    } else if (history[idx]?.url === portraitUrl) {
      setPortraitUrl(null);
    }
  };

  // ── Render
  return (
    <div>
      <ChHead icon="🎨" num="Chapter 10" title="AI Portrait Generator"
        sub="Generate a full-figure character portrait with AI. The scene is automatically derived from your character's race, class, kit, gear, and appearance details." />

      <div style={{ display:"flex", gap:24, flexWrap:"wrap", alignItems:"flex-start" }}>

        {/* ── LEFT: Portrait display + generate + history ── */}
        <div style={{ flex:"0 0 auto", display:"flex", flexDirection:"column", alignItems:"center", gap:12 }}>

          {/* Portrait frame */}
          <div style={{
            width:256, height:256,
            border:`2px solid ${portraitUrl ? C.borderHi : C.border}`,
            borderRadius:12,
            background:"rgba(0,0,0,.5)",
            display:"flex", alignItems:"center", justifyContent:"center",
            overflow:"hidden", position:"relative",
            boxShadow: portraitUrl ? "0 0 24px rgba(212,160,53,.2)" : "none",
          }}>
            {portraitUrl ? (
              <img src={portraitUrl} alt="Character Portrait"
                style={{ width:"100%", height:"100%", objectFit:"cover" }} />
            ) : (
              <div style={{ textAlign:"center", color:C.textDim, fontSize:12, padding:20 }}>
                <div style={{ fontSize:40, marginBottom:10 }}>🎨</div>
                <div>No portrait yet</div>
                <div style={{ fontSize:10, marginTop:4, color:"#4a3a20" }}>
                  Fill in details and click Generate
                </div>
              </div>
            )}
            {generating && (
              <div style={{
                position:"absolute", inset:0,
                background:"rgba(0,0,0,.7)",
                display:"flex", flexDirection:"column",
                alignItems:"center", justifyContent:"center",
                gap:10,
              }}>
                <div style={{ fontSize:24 }}>⏳</div>
                <div style={{ fontSize:11, color:C.amber }}>Generating…</div>
                <div style={{ fontSize:9, color:C.textDim }}>10–20 seconds</div>
              </div>
            )}
          </div>

          {/* Generate button — approval-gated (server enforces regardless) */}
          <button
            onClick={generate}
            disabled={generating || !aiApproved}
            title={aiApproved ? undefined : AI_APPROVAL_MESSAGE}
            style={{
              width:256,
              padding:"10px 0",
              borderRadius:8,
              cursor: (generating || !aiApproved) ? "not-allowed" : "pointer",
              border:`1px solid ${(generating || !aiApproved) ? C.border : C.borderHi}`,
              background: (generating || !aiApproved)
                ? "rgba(0,0,0,.3)"
                : "linear-gradient(135deg,#5a3a00,#c88020)",
              color: (generating || !aiApproved) ? C.textDim : "#1a0f00",
              fontFamily:"inherit", fontSize:13, fontWeight:"bold",
              transition:"all .15s",
            }}
          >
            {!aiApproved ? `🔒 ${AI_APPROVAL_MESSAGE}`
              : generating ? "⏳ Generating…" : "✦ Generate Portrait"}
          </button>

          {capInfo && (
            <div style={{ width:256, fontSize:9, color:C.textDim, textAlign:"center" }}>
              {capInfo.used}/{capInfo.cap} images used today
            </div>
          )}

          {genError && (
            <div style={{
              width:256,
              background:"rgba(180,30,30,.12)",
              border:`1px solid rgba(180,30,30,.4)`,
              borderRadius:6, padding:"8px 12px",
              fontSize:11, color:"#e06060", lineHeight:1.5,
            }}>
              {genError}
            </div>
          )}

          {/* Portrait History */}
          <div style={{ width:256 }}>
            <button
              onClick={() => setHistoryOpen(h => !h)}
              style={{
                width:"100%", textAlign:"left", padding:"6px 10px",
                background:"rgba(0,0,0,.3)", border:`1px solid ${C.border}`,
                borderRadius:6, cursor:"pointer", fontFamily:"inherit",
                fontSize:11, color:C.textDim,
                display:"flex", justifyContent:"space-between",
              }}
            >
              <span>🕐 Portrait History ({history.length}/{MAX_HISTORY})</span>
              <span>{historyOpen ? "▲" : "▼"}</span>
            </button>
            {historyOpen && (
              <div style={{
                marginTop:4,
                background:"rgba(0,0,0,.3)",
                border:`1px solid ${C.border}`,
                borderRadius:6, padding:8,
                display:"flex", flexWrap:"wrap", gap:6,
              }}>
                {history.length === 0 && (
                  <div style={{ fontSize:10, color:C.textDim, fontStyle:"italic", width:"100%" }}>
                    No history yet
                  </div>
                )}
                {history.map((entry, i) => (
                  <div key={i} style={{ position:"relative" }}>
                    <img
                      src={entry.url}
                      alt={`Portrait ${i+1}`}
                      title={new Date(entry.timestamp).toLocaleString()}
                      onClick={() => setFromHistory(entry)}
                      style={{
                        width:68, height:68,
                        objectFit:"cover", borderRadius:5,
                        cursor:"pointer",
                        border:`2px solid ${entry.url === portraitUrl ? C.borderHi : C.border}`,
                        opacity: entry.url === portraitUrl ? 1 : 0.7,
                        transition:"all .12s",
                      }}
                    />
                    <button
                      onClick={() => deleteHistory(i)}
                      title="Delete"
                      style={{
                        position:"absolute", top:1, right:1,
                        width:16, height:16,
                        background:"rgba(0,0,0,.75)",
                        border:`1px solid ${C.border}`,
                        borderRadius:3, cursor:"pointer",
                        color:C.textDim, fontSize:9, lineHeight:"14px",
                        padding:0, fontFamily:"inherit", textAlign:"center",
                      }}
                    >×</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── RIGHT: Appearance fields + Settings ── */}
        <div style={{ flex:1, minWidth:280, display:"flex", flexDirection:"column", gap:14 }}>

          {/* Appearance Fields */}
          <div style={{
            background:"rgba(0,0,0,.35)",
            border:`1px solid ${C.border}`,
            borderRadius:8, padding:"14px 16px",
          }}>
            <div style={{ fontSize:11, letterSpacing:3, color:C.goldDim,
              textTransform:"uppercase", marginBottom:12 }}>
              Appearance Details
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>AGE</span>
                <input
                  value={charAge}
                  onChange={e => setCharAge(e.target.value)}
                  placeholder="e.g. 24 or 'young'"
                  style={fieldStyle}
                />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>HAIR COLOR</span>
                <input
                  value={charHairColor}
                  onChange={e => setCharHairColor(e.target.value)}
                  placeholder="e.g. black, auburn"
                  style={fieldStyle}
                />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>EYE COLOR</span>
                <input
                  value={charEyeColor}
                  onChange={e => setCharEyeColor(e.target.value)}
                  placeholder="e.g. blue, amber"
                  style={fieldStyle}
                />
              </label>
              <label style={{ display:"flex", flexDirection:"column", gap:4 }}>
                <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>DISTINCTIVE FEATURES</span>
                <input
                  value={charDistinctiveFeatures}
                  onChange={e => setCharDistinctiveFeatures(e.target.value)}
                  placeholder="e.g. scar across cheek"
                  style={fieldStyle}
                />
              </label>
            </div>

            <label style={{ display:"flex", flexDirection:"column", gap:4, marginTop:10 }}>
              <span style={{ fontSize:10, color:C.textDim, letterSpacing:1 }}>
                APPEARANCE NOTES <span style={{ color:"#4a3a20" }}>(appended verbatim to prompt)</span>
              </span>
              <textarea
                value={charAppearanceNotes}
                onChange={e => setCharAppearanceNotes(e.target.value)}
                placeholder="Additional description or style guidance…"
                rows={3}
                style={{ ...fieldStyle, resize:"vertical", lineHeight:1.5 }}
              />
            </label>
          </div>

          {/* Prompt Preview — the prompt is built SERVER-side; show the one
              used for the most recent generation */}
          <div style={{
            background:"rgba(0,0,0,.25)",
            border:`1px solid ${C.border}`,
            borderRadius:8, padding:"12px 16px",
          }}>
            <div style={{
              display:"flex", justifyContent:"space-between",
              alignItems:"center", marginBottom:8,
            }}>
              <span style={{ fontSize:10, letterSpacing:3, color:C.goldDim, textTransform:"uppercase" }}>
                Prompt
              </span>
              <span style={{ fontSize:9, color:"#4a3a20" }}>
                built server-side from race, class, kit, gear &amp; appearance
              </span>
            </div>
            <div style={{
              fontSize:10, color:"#7a6a4a", lineHeight:1.7,
              fontStyle:"italic", maxHeight:110, overflowY:"auto",
              scrollbarWidth:"thin",
            }}>
              {lastPrompt
                ?? "The full-figure scene is derived from your character: class sets the environment (ranger → wilderness, cleric → temple, wizard → arcane study…), race colors it (dwarf → mountain hall, elf → ancient forest…). Generate a portrait to see the exact prompt used."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
