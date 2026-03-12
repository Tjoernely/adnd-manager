// PortraitTab.jsx — AI Portrait Generator using DALL-E 3
import { useState, useEffect, useCallback } from "react";
import { C, numInputStyle } from "../../data/constants.js";
import { ChHead } from "../ui/index.js";
import { WEAPON_GROUPS_49 } from "../../data/weapons.js";
import { getRankTable, getSocialRank } from "../../data/socialStatus.js";

// ── Prompt Builder ────────────────────────────────────────────────────────────
function buildPortraitPrompt({
  charName, charGender, charLevel, raceData, classData, activeKitObj,
  effSub, traitsPicked, socialStatus, weapPicked, masteryPicked, classGroup,
  charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
  selectedKit, selectedRace,
}) {
  const parts = [];

  // 1. Core Identity
  const levelDesc = charLevel >= 15 ? "legendary"
                  : charLevel >= 11 ? "veteran"
                  : charLevel >= 7  ? "experienced"
                  : charLevel >= 4  ? "seasoned"
                  : "novice";
  const raceName  = raceData?.label  ?? "Human";
  const className = classData?.label ?? "Adventurer";
  const kitName   = activeKitObj?.name ?? "";
  const genderStr = charGender ? charGender.toLowerCase() : "character";

  let coreId = `${charName || "An adventurer"}, a ${genderStr} ${raceName} ${className}`;
  if (kitName) coreId += ` (${kitName})`;
  coreId += `, ${levelDesc} adventurer`;
  parts.push(coreId);

  // 2. Appearance (CHA sub-ability "appearance")
  const app = effSub?.("appearance") ?? 10;
  const appDesc = app >= 18 ? "exceptionally beautiful/handsome, turning heads"
                : app >= 16 ? "striking and handsome/beautiful"
                : app >= 13 ? "attractive features"
                : app >= 9  ? "average looking"
                : app >= 6  ? "unremarkable features"
                : "plain and weathered features";
  parts.push(appDesc);

  // 3. Muscle (STR sub-ability)
  const muscle = effSub?.("muscle") ?? 10;
  const muscleDesc = muscle >= 18 ? "massively muscular, imposing physique"
                   : muscle >= 16 ? "powerfully built, broad-shouldered"
                   : muscle >= 12 ? "athletic, muscular build"
                   : muscle >= 8  ? "average build"
                   : "slight, lean build";
  parts.push(muscleDesc);

  // 4. Stamina (CON sub-ability)
  const stamina = effSub?.("stamina") ?? 10;
  const staminaDesc = stamina >= 15 ? "tough, battle-hardened look"
                    : stamina >= 9  ? "healthy appearance"
                    : "looking somewhat frail";
  parts.push(staminaDesc);

  // 5. Leadership (CHA sub-ability)
  const lead = effSub?.("leadership") ?? 10;
  const leadDesc = lead >= 17 ? "natural authority, people look to them instinctively"
                 : lead >= 13 ? "commanding presence"
                 : lead >= 9  ? "confident bearing"
                 : "unremarkable presence";
  parts.push(leadDesc);

  // 6. Balance (DEX sub-ability)
  const balance = effSub?.("balance") ?? 10;
  const balDesc = balance >= 18 ? "cat-like grace and perfect posture"
                : balance >= 14 ? "graceful, poised"
                : balance >= 9  ? "normal posture"
                : "slightly awkward posture";
  parts.push(balDesc);

  // 7. Racial features
  const raceFeatures = {
    dwarf:    "stocky build, thick beard, sturdy appearance",
    elf:      "pointed ears, ageless graceful features",
    gnome:    "small stature, large curious eyes, expressive face",
    halfelf:  "slightly pointed ears, blend of human and elven features",
    halforc:  "greenish-grey skin, prominent lower canines, strong jaw",
    halfogre: "massive imposing frame, rough skin, great height",
    halfling: "small stature, curly hair, large bare feet, cheerful face",
  };
  const raceId = selectedRace ?? raceData?.id;
  if (raceId && raceFeatures[raceId]) {
    parts.push(raceFeatures[raceId]);
  }

  // 8. Social Status + Kit combination
  let statusTier = null;
  const rollVal = socialStatus?.override
    ? parseInt(socialStatus.override)
    : socialStatus?.rolled;
  if (rollVal && !isNaN(rollVal)) {
    const rankTable = getRankTable(activeKitObj?.name ?? selectedKit);
    const rank = getSocialRank(rollVal, rankTable);
    statusTier = rank?.tier ?? null;
  }

  const tierToKey = (tier) => {
    if (!tier) return null;
    const t = tier.toLowerCase().replace(/\s+/g, " ").trim();
    if (t === "lower")        return "lower";
    if (t === "lower middle") return "lower_middle";
    if (t === "middle")       return "lower_middle";
    if (t === "upper middle") return "upper_middle";
    if (t === "upper")        return "upper";
    return null; // kit-specific custom tier — no mapping
  };
  const statusKey = tierToKey(statusTier);

  const statusVisuals = {
    lower:        "worn patched clothing, simple battered equipment, weathered by hard labor",
    lower_middle: "decent practical clothing, well-maintained equipment, respectable appearance",
    upper_middle: "quality clothing, prosperous appearance, well-groomed and confident",
    upper:        "fine expensive clothing, masterwork equipment, tasteful jewelry or insignia, impeccably presented",
  };

  const kitVisuals = {
    "Barbarian":     "wild unkempt appearance, tribal markings",
    "Noble":         "heraldic symbols, signet ring, noble bearing",
    "Pirate":        "weathered sea-worn look, rope and salt stained",
    "Assassin":      "dark clothing, concealed blades, watchful eyes",
    "Scholar":       "ink-stained fingers, carrying books or scrolls",
    "Gladiator":     "arena scars, showman's confidence",
    "Beggar":        "ragged worn clothing, humble demeanor",
    "Savage":        "primitive clothing, natural materials, face paint",
    "Spy":           "nondescript clothing, forgettable face, alert eyes",
    "Soldier":       "military bearing, campaign-worn gear",
    "Swashbuckler":  "flamboyant clothing, rakish grin, rapier at hip",
    "Jester":        "colorful motley, bells, exaggerated expression",
    "Mariner":       "sea-weathered skin, rope-calloused hands",
    "Merchant":      "practical prosperous clothing, coin purse visible",
    "Acrobat":       "light flexible clothing, athletic stance",
    "Cavalier":      "mounted warrior bearing, polished equipment",
    "Diplomat":      "formal attire, composed neutral expression",
    "Explorer":      "practical travel gear, maps and rope at belt",
    "Mystic":        "robes, meditative calm expression, prayer beads",
    "Outlaw":        "rough practical clothing, wanted poster look",
    "Peasant Hero":  "simple farm clothing, unlikely hero's determined look",
    "Pugilist":      "scarred knuckles, fighter's stance, minimal armor",
    "Rider":         "riding gear, horse-worn boots, weathered outdoors",
    "Scout":         "camouflage practical clothing, bow over shoulder",
    "Sharpshooter":  "steady eyes, missile weapons prominently displayed",
    "Smuggler":      "concealed pockets, shifty confident expression",
    "Thug":          "intimidating scarred look, heavy practical weapons",
    "Weapon Master": "focused intense expression, prized weapon prominently displayed",
  };

  const statusVisual = statusKey ? statusVisuals[statusKey] : null;
  const kitVisual    = kitName ? (kitVisuals[kitName] ?? null) : null;

  if (statusVisual && kitVisual) {
    parts.push(`${kitVisual}, ${statusVisual}`);
  } else if (statusVisual) {
    parts.push(statusVisual);
  } else if (kitVisual) {
    parts.push(kitVisual);
  }

  // 9. Equipment — Primary weapon (highest mastery tier, else any single)
  let primaryWeap = null;
  const mastEntries = Object.entries(masteryPicked ?? {});
  if (mastEntries.length > 0) {
    const tierOrder = ["grandmastery","highmastery","mastery","spec","expertise"];
    let bestTierIdx = 999;
    let bestId = null;
    mastEntries.forEach(([weapId, info]) => {
      const idx = tierOrder.indexOf(info.tier);
      if (idx >= 0 && idx < bestTierIdx) { bestTierIdx = idx; bestId = weapId; }
    });
    if (bestId) {
      WEAPON_GROUPS_49.forEach(bg => {
        bg.tightGroups.forEach(tg => tg.weapons.forEach(w => {
          if (w.id === bestId && !w.dupe) primaryWeap = w.name;
        }));
        bg.unrelated.forEach(w => { if (w.id === bestId) primaryWeap = w.name; });
      });
    }
  }
  if (!primaryWeap) {
    const singles = Object.entries(weapPicked ?? {})
      .filter(([id, lvl]) => !id.startsWith("wsp_") && lvl === "single");
    if (singles.length > 0) {
      const [wId] = singles[0];
      WEAPON_GROUPS_49.forEach(bg => {
        bg.tightGroups.forEach(tg => tg.weapons.forEach(w => {
          if (w.id === wId && !w.dupe) primaryWeap = w.name;
        }));
        bg.unrelated.forEach(w => { if (w.id === wId) primaryWeap = w.name; });
      });
    }
  }
  if (primaryWeap) parts.push(`wielding or carrying a ${primaryWeap}`);

  // Armor (inferred from class group)
  const armorByGroup = {
    warrior: "wearing full plate armor",
    priest:  "wearing chainmail",
    rogue:   "wearing leather armor",
    wizard:  "wearing robes or common clothes",
  };
  parts.push(armorByGroup[classGroup] ?? "wearing robes or common clothes");

  // Shield
  const hasShield = Object.keys(weapPicked ?? {}).some(id => id.startsWith("wsp_shield_"));
  if (hasShield) parts.push("carrying a shield");

  // 10. Physical traits
  if (traitsPicked?.tr_keeneye)  parts.push("sharp piercing eyes");
  if (traitsPicked?.tr_ambidex)  parts.push("weapons in both hands");
  if (traitsPicked?.tr_djointed) parts.push("unusually flexible posture");

  // 11. Optional appearance fields
  if (charAge) {
    const ageNum = parseInt(charAge);
    if (!isNaN(ageNum)) {
      parts.push(ageNum < 25 ? "young" : ageNum < 50 ? "middle-aged" : "old");
    } else {
      parts.push(charAge.trim());
    }
  }
  const detailParts = [];
  if (charHairColor)           detailParts.push(`${charHairColor.trim()} hair`);
  if (charEyeColor)            detailParts.push(`${charEyeColor.trim()} eyes`);
  if (detailParts.length > 0)  parts.push(detailParts.join(", "));
  if (charDistinctiveFeatures) parts.push(charDistinctiveFeatures.trim());

  // 12. Style — always last
  parts.push(
    "Fantasy portrait, painterly style, dramatic lighting, " +
    "detailed character illustration, D&D fantasy art style, " +
    "high quality, cinematic composition. " +
    "The character is shown from the waist up against a moody " +
    "atmospheric background appropriate to their class and kit."
  );

  let prompt = parts.join(". ");
  if (charAppearanceNotes?.trim()) prompt += " " + charAppearanceNotes.trim();
  return prompt;
}

// ── Error classifier ──────────────────────────────────────────────────────────
function classifyError(err, status) {
  if (!status) return "Could not connect to OpenAI. Please check your internet connection.";
  if (status === 401) return "Your OpenAI API key appears to be invalid. Please check your settings.";
  if (status === 429) return "OpenAI rate limit reached. Please wait a moment and try again.";
  if (status === 400 && err?.toLowerCase().includes("content")) {
    return "The portrait could not be generated due to content restrictions. Try adjusting the appearance notes.";
  }
  return `OpenAI error (${status}): ${err ?? "Unknown error"}`;
}

// ── localStorage history helpers ──────────────────────────────────────────────
const MAX_HISTORY = 5;

function historyKey(dbCharId, charName) {
  return `portrait_history_${dbCharId ?? ("name_" + (charName ?? "unnamed"))}`;
}
function loadHistory(key) {
  try { return JSON.parse(localStorage.getItem(key) ?? "[]"); }
  catch { return []; }
}
function saveHistory(key, entries) {
  localStorage.setItem(key, JSON.stringify(entries.slice(0, MAX_HISTORY)));
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
    charName, charGender, charLevel, selectedRace, selectedKit,
    raceData, classData, activeKitObj, classGroup,
    // Stats
    effSub,
    // Traits
    traitsPicked,
    // Social
    socialStatus,
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
  const [apiKey,         setApiKey]         = useState(() => localStorage.getItem("openai_api_key") ?? "");
  const [showApiKey,     setShowApiKey]      = useState(false);
  const [generating,     setGenerating]      = useState(false);
  const [genError,       setGenError]        = useState(null);
  const [historyOpen,    setHistoryOpen]     = useState(false);
  const [history,        setHistory]         = useState([]);
  const [showSettings,   setShowSettings]    = useState(!localStorage.getItem("openai_api_key"));

  // Keep API key in sync with localStorage
  const handleApiKeyChange = (val) => {
    setApiKey(val);
    if (val.trim()) localStorage.setItem("openai_api_key", val.trim());
    else localStorage.removeItem("openai_api_key");
  };

  // Load history on mount / when character changes
  const hKey = historyKey(dbCharId, charName);
  useEffect(() => {
    setHistory(loadHistory(hKey));
  }, [hKey]);

  // ── Generate portrait
  const generate = useCallback(async () => {
    const key = localStorage.getItem("openai_api_key");
    if (!key) {
      setShowSettings(true);
      setGenError("Please enter your OpenAI API key in Settings below.");
      return;
    }

    const prompt = buildPortraitPrompt({
      charName, charGender, charLevel, raceData, classData, activeKitObj,
      effSub, traitsPicked, socialStatus, weapPicked, masteryPicked, classGroup,
      charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
      selectedKit, selectedRace,
    });

    console.log("[PortraitTab] DALL-E 3 prompt:\n", prompt);

    setGenerating(true);
    setGenError(null);

    try {
      const res = await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "dall-e-3",
          prompt,
          n: 1,
          size: "1024x1024",
          quality: "standard",
          style: "vivid",
        }),
      });

      if (!res.ok) {
        let errMsg = null;
        try { const j = await res.json(); errMsg = j?.error?.message ?? null; } catch {}
        throw { status: res.status, message: errMsg };
      }

      const data = await res.json();
      const url  = data?.data?.[0]?.url;
      if (!url) throw { status: 200, message: "No image URL in response" };

      // Update current portrait
      setPortraitUrl(url);

      // Add to history
      const newEntry = { url, timestamp: Date.now(), prompt };
      const updated  = [newEntry, ...loadHistory(hKey)].slice(0, MAX_HISTORY);
      saveHistory(hKey, updated);
      setHistory(updated);

    } catch (err) {
      setGenError(classifyError(err?.message, err?.status));
    } finally {
      setGenerating(false);
    }
  }, [
    charName, charGender, charLevel, raceData, classData, activeKitObj,
    effSub, traitsPicked, socialStatus, weapPicked, masteryPicked, classGroup,
    charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
    selectedKit, selectedRace, hKey, setPortraitUrl,
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
        sub="Generate a character portrait using DALL-E 3. The prompt is automatically built from your character's stats, race, class, kit, and appearance details." />

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

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={generating}
            style={{
              width:256,
              padding:"10px 0",
              borderRadius:8,
              cursor: generating ? "not-allowed" : "pointer",
              border:`1px solid ${generating ? C.border : C.borderHi}`,
              background: generating
                ? "rgba(0,0,0,.3)"
                : "linear-gradient(135deg,#5a3a00,#c88020)",
              color: generating ? C.textDim : "#1a0f00",
              fontFamily:"inherit", fontSize:13, fontWeight:"bold",
              transition:"all .15s",
            }}
          >
            {generating ? "⏳ Generating…" : "✦ Generate Portrait"}
          </button>

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

          {/* Prompt Preview */}
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
                Prompt Preview
              </span>
              <span style={{ fontSize:9, color:"#4a3a20" }}>
                auto-built from character data
              </span>
            </div>
            <div style={{
              fontSize:10, color:"#7a6a4a", lineHeight:1.7,
              fontStyle:"italic", maxHeight:110, overflowY:"auto",
              scrollbarWidth:"thin",
            }}>
              {buildPortraitPrompt({
                charName, charGender, charLevel, raceData, classData, activeKitObj,
                effSub, traitsPicked, socialStatus, weapPicked, masteryPicked, classGroup,
                charAge, charHairColor, charEyeColor, charDistinctiveFeatures, charAppearanceNotes,
                selectedKit, selectedRace,
              })}
            </div>
          </div>

          {/* Settings */}
          <div style={{
            background:"rgba(0,0,0,.35)",
            border:`1px solid ${C.border}`,
            borderRadius:8, padding:"12px 16px",
          }}>
            <button
              onClick={() => setShowSettings(s => !s)}
              style={{
                background:"none", border:"none", cursor:"pointer",
                fontFamily:"inherit", fontSize:11, color:C.textDim,
                padding:0, display:"flex", alignItems:"center", gap:6,
              }}
            >
              ⚙ Settings {showSettings ? "▲" : "▼"}
            </button>
            {showSettings && (
              <div style={{ marginTop:10 }}>
                <div style={{ fontSize:10, color:C.textDim, marginBottom:6 }}>
                  OpenAI API Key
                  <span style={{ color:"#3a2a10", marginLeft:6 }}>
                    (stored in browser localStorage — never sent to our server)
                  </span>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={e => handleApiKeyChange(e.target.value)}
                    placeholder="sk-..."
                    style={{ ...fieldStyle, flex:1, fontFamily:"monospace" }}
                  />
                  <button
                    onClick={() => setShowApiKey(v => !v)}
                    style={{
                      background:"rgba(0,0,0,.4)", border:`1px solid ${C.border}`,
                      borderRadius:5, cursor:"pointer", color:C.textDim,
                      fontSize:11, padding:"0 8px", fontFamily:"inherit",
                    }}
                  >
                    {showApiKey ? "🙈" : "👁"}
                  </button>
                </div>
                {apiKey && (
                  <div style={{ fontSize:9, color:"#3a9a3a", marginTop:4 }}>
                    ✓ API key set
                  </div>
                )}
                <div style={{ fontSize:9, color:"#4a3a20", marginTop:8, lineHeight:1.6 }}>
                  Get an API key at platform.openai.com · DALL-E 3 costs ~$0.04 per image
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
