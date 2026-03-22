/**
 * NPCGenerator — AI-powered single-click NPC creation.
 * All options default to Random. DM overrides only what they want.
 *
 * Props:
 *   campaignId  string
 *   onClose     fn()
 *   onSaved     fn(npc)  — called after NPC is saved to backend
 */
import { useState } from 'react';
import { api } from '../../api/client.js';
import { callClaude, hasAnthropicKey, getOpenAIKey } from '../../api/aiClient.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';
import './NPCGenerator.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const RACES      = ['Random','Human','Elf','Dwarf','Gnome','Halfling','Half-Elf','Half-Orc','Half-Ogre'];
const CLASSES    = ['Random','Fighter','Mage','Cleric','Thief','Ranger','Paladin','Bard','Druid','None'];
const GENDERS    = ['Random','Male','Female','Non-binary'];
const POWER_LVLS = ['Random','Weak','Standard','Heroic','Legendary','Demigod'];
const ROLES      = ['Random','Villain','Ally','Merchant','Guard','Innkeeper','Noble','Sage',
                    'Assassin','Spy','Cultist','Bandit','Beggar','Priest','Wanderer'];
const ALIGNMENTS = {
  list:  ['Random','LG','LN','LE','NG','TN','NE','CG','CN','CE'],
  label: { LG:'Lawful Good', LN:'Lawful Neutral', LE:'Lawful Evil',
           NG:'Neutral Good', TN:'True Neutral',   NE:'Neutral Evil',
           CG:'Chaotic Good', CN:'Chaotic Neutral', CE:'Chaotic Evil' },
};

const PL_INFO = {
  Weak:      { color:'#6aaa40', weight:20 },
  Standard:  { color:'#c8a84b', weight:40 },
  Heroic:    { color:'#d07030', weight:25 },
  Legendary: { color:'#b040c0', weight:12 },
  Demigod:   { color:'#e03040', weight:3  },
};

// ── Dice & random helpers ──────────────────────────────────────────────────────

function dr(n) { return Math.floor(Math.random() * n) + 1; }

function weightedPick(items) {
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of items) { r -= x.w; if (r <= 0) return x.v; }
  return items[items.length - 1].v;
}

function randFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function rollStat(pl) {
  switch (pl) {
    case 'Weak':      { const r = [dr(6),dr(6),dr(6),dr(6)].sort((a,b)=>a-b); return r[0]+r[1]+r[2]; }
    case 'Standard':  { const r = [dr(6),dr(6),dr(6),dr(6)].sort((a,b)=>a-b); return r[1]+r[2]+r[3]; }
    case 'Heroic':    return dr(4)+dr(4)+12;
    case 'Legendary': return dr(4)+15;
    case 'Demigod':   return 18;
    default: return 10;
  }
}

function rollStats(pl) {
  return { str:rollStat(pl), dex:rollStat(pl), con:rollStat(pl),
           int:rollStat(pl), wis:rollStat(pl), cha:rollStat(pl) };
}

function rollLevel(pl) {
  switch (pl) {
    case 'Weak':      return dr(4);
    case 'Standard':  return dr(4)+2;
    case 'Heroic':    return dr(4)+6;
    case 'Legendary': return dr(6)+10;
    case 'Demigod':   return dr(4)+16;
    default: return 1;
  }
}

function resolve(params) {
  const pl  = params.powerLevel === 'Random'
    ? weightedPick(Object.entries(PL_INFO).map(([v,i])=>({v,w:i.weight})))
    : params.powerLevel;
  const race      = params.race      === 'Random' ? randFrom(RACES.slice(1))      : params.race;
  const charClass = params.charClass === 'Random' ? randFrom(CLASSES.slice(1))    : params.charClass;
  const gender    = params.gender    === 'Random' ? randFrom(GENDERS.slice(1))    : params.gender;
  const alignment = params.alignment === 'Random' ? randFrom(ALIGNMENTS.list.slice(1)) : params.alignment;
  const role      = params.role      === 'Random' ? randFrom(ROLES.slice(1))      : params.role;
  const level     = params.level     === 'Random' ? rollLevel(pl)                 : +params.level;
  const stats     = rollStats(pl);
  return { race, charClass, gender, alignment, powerLevel: pl, level, role, stats };
}

// ── Prompts ────────────────────────────────────────────────────────────────────

const SYS = `You are an expert AD&D 2nd Edition Dungeon Master running a campaign in the Forgotten Realms. Generate vivid, lore-accurate NPCs that fit the Forgotten Realms setting. Use appropriate FR names for each race (elven names for elves, dwarven clan names for dwarves etc.). Reference FR factions, deities and locations in backgrounds. IMPORTANT: Respond with raw JSON only. Do NOT wrap in markdown code fences. Do NOT include \`\`\`json or \`\`\` in your response.`;

function buildPrompt(r) {
  const { race, charClass, gender, alignment, level, powerLevel, role, stats } = r;
  const alignFull = ALIGNMENTS.label[alignment] ?? alignment;
  return `Generate a complete AD&D 2E NPC with these parameters:
Race: ${race}, Class: ${charClass}, Gender: ${gender}
Alignment: ${alignment} (${alignFull}), Level: ${level}, Power Level: ${powerLevel}
Role in story: ${role}
Stats: STR ${stats.str} DEX ${stats.dex} CON ${stats.con} INT ${stats.int} WIS ${stats.wis} CHA ${stats.cha}

Respond with ONLY this JSON (no markdown):
{
  "name": "A fitting fantasy name for their race and culture",
  "title": "Optional title or nickname (e.g. The Scarred, Ironhands) or null",
  "appearance": "One vivid sentence describing their look and most memorable feature",
  "background": "3-4 sentence backstory: origin, a defining moment, and current motivation",
  "personality": ["2-4 traits from: brave, cowardly, compassionate, cruel, cunning, deceptive, eccentric, fanatical, greedy, honorable, impulsive, loyal, melancholic, mysterious, naive, paranoid, pragmatic, sarcastic, stoic, vengeful, wise"],
  "speech_style": "One sentence describing HOW they speak (accent, vocabulary, manner)",
  "dialogue": [
    "A greeting or first impression line",
    "Something they say when threatened",
    "A line hinting at their secret or past",
    "A memorable quote that defines their character"
  ],
  "secrets": [
    "A secret only the DM knows",
    "A fear or vulnerability that can be used against them"
  ],
  "quest_hooks": [
    "A plot hook or quest this NPC could provide",
    "Another reason the party might interact with them"
  ],
  "equipment": ["3-6 items appropriate for their class, level and power level"],
  "loot": { "pp": 0, "gp": 0, "sp": 0, "cp": 0, "items": [] }
}`;
}

function buildRegenPrompt(section, npc, r) {
  const prompts = {
    background:  `Generate ONLY a new "background" (3-4 sentences) for: ${r.race} ${r.charClass} ${r.gender}, ${r.alignment}, Lv${r.level}, Role: ${r.role}, named ${npc.name}. JSON: {"background":"..."}`,
    dialogue:    `Generate ONLY new "dialogue" (4 lines) for ${npc.name}, ${r.race} ${r.charClass}. Speech style: ${npc.speech_style}. JSON: {"dialogue":["...","...","...","..."]}`,
    quest_hooks: `Generate ONLY new "quest_hooks" (2 hooks) for ${npc.name}, role: ${r.role}, ${r.alignment} ${r.race}. JSON: {"quest_hooks":["...","..."]}`,
    secrets:     `Generate ONLY new "secrets" (2 secrets/fears) for ${npc.name}, ${r.race} ${r.charClass}, role: ${r.role}. JSON: {"secrets":["...","..."]}`,
  };
  return prompts[section] ?? '';
}

// ── Main Component ─────────────────────────────────────────────────────────────

export function NPCGenerator({ campaignId, onClose, onSaved }) {
  const [params,    setParams]    = useState({
    race:'Random', charClass:'Random', gender:'Random',
    alignment:'Random', powerLevel:'Random', level:'Random', role:'Random',
  });
  const [generating, setGenerating] = useState(false);
  const [error,      setError]      = useState('');
  const [result,     setResult]     = useState(null);
  const [resolved,   setResolved]   = useState(null);
  const [regenSec,   setRegenSec]   = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [saved,      setSaved]      = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const up = (k, v) => setParams(p => ({ ...p, [k]: v }));

  const handleGenerate = async () => {
    if (!hasAnthropicKey()) { setShowSettings(true); return; }
    console.log('[NPCGenerator] Starting generation. params:', params);
    setGenerating(true); setError(''); setResult(null); setSaved(false);
    try {
      const res = resolve(params);
      setResolved(res);
      console.log('[NPCGenerator] Resolved params:', res);
      console.log('[NPCGenerator] Calling Claude...');
      const npc = await callClaude({ systemPrompt: SYS, userPrompt: buildPrompt(res), maxTokens: 4096 });
      console.log('[NPCGenerator] Claude returned NPC:', npc?.name);
      setResult(npc);
    } catch(e) {
      console.error('[NPCGenerator] Generation failed:', e.message, e);
      setError(e.message);
    }
    setGenerating(false);
  };

  const handleRegen = async (section) => {
    if (!result || !resolved) return;
    console.log('[NPCGenerator] Regenerating section:', section);
    setRegenSec(section); setError('');
    try {
      const partial = await callClaude({
        systemPrompt: SYS,
        userPrompt: buildRegenPrompt(section, result, resolved),
        maxTokens: 512,
      });
      console.log('[NPCGenerator] Regen complete for:', section);
      setResult(r => ({ ...r, ...partial }));
    } catch(e) {
      console.error('[NPCGenerator] Regen failed for', section, ':', e.message);
      setError(`Regen ${section}: ${e.message}`);
    }
    setRegenSec(null);
  };

  const handleRerollStats = () => {
    if (!resolved) return;
    const stats = rollStats(resolved.powerLevel);
    setResolved(r => ({ ...r, stats }));
  };

  const handleSave = async () => {
    if (!result || !resolved) return;
    setSaving(true);
    try {
      const name = [result.name, result.title].filter(Boolean).join(' — ');
      const npc = await api.createNpc({
        campaign_id: campaignId,
        name,
        is_hidden: true,
        data: {
          race:        resolved.race,
          charClass:   resolved.charClass,
          gender:      resolved.gender,
          alignment:   resolved.alignment,
          powerLevel:  resolved.powerLevel,
          level:       resolved.level,
          role:        resolved.role,
          stats:       resolved.stats,
          appearance:  result.appearance   ?? '',
          background:  result.background   ?? '',
          personality: Array.isArray(result.personality)  ? result.personality  : [],
          speech_style:result.speech_style ?? '',
          dialogue:    Array.isArray(result.dialogue)     ? result.dialogue     : [],
          secrets:     Array.isArray(result.secrets)      ? result.secrets      : [],
          quest_hooks: Array.isArray(result.quest_hooks)  ? result.quest_hooks  : [],
          equipment:   Array.isArray(result.equipment)    ? result.equipment    : [],
          loot:        result.loot ?? { pp:0, gp:0, sp:0, cp:0, items:[] },
          notes:       '',
          portrait:    result._portrait ?? null,
          portraitHistory: [],
        },
      });
      setSaved(true);
      if (onSaved) onSaved(npc);
    } catch(e) { setError(`Save failed: ${e.message}`); }
    setSaving(false);
  };

  return (
    <div className="npg-overlay">
      <div className="nm-bg-diamonds" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="npg-header">
        <button className="nm-back-btn" onClick={onClose}>‹ Back to NPCs</button>
        <h1 className="npg-title">⚡ AI NPC Generator</h1>
        <div className="npg-header-right">
          <button className="npg-settings-btn" onClick={() => setShowSettings(true)} title="API Key Settings">⚙ Settings</button>
          {result && (
            <button className="npg-save-btn" onClick={handleSave} disabled={saving || saved}>
              {saving ? '⏳ Saving…' : saved ? '✔ Saved!' : '💾 Save to Campaign'}
            </button>
          )}
        </div>
      </header>

      <div className="npg-layout">

        {/* ── Left: form ── */}
        <aside className="npg-form-panel">
          <div className="npg-form-title">Generation Options</div>
          <p className="npg-form-hint">All fields default to Random. Override only what you want.</p>

          <div className="npg-form-grid">
            {[
              { label:'Race',        key:'race',        opts:RACES    },
              { label:'Class',       key:'charClass',   opts:CLASSES  },
              { label:'Gender',      key:'gender',      opts:GENDERS  },
              { label:'Alignment',   key:'alignment',   opts:ALIGNMENTS.list },
              { label:'Power Level', key:'powerLevel',  opts:POWER_LVLS },
              { label:'Role',        key:'role',        opts:ROLES    },
            ].map(f => (
              <label key={f.key} className="npg-field">
                <span className="npg-field-label">{f.label}</span>
                <select className="npg-select" value={params[f.key]} onChange={e=>up(f.key,e.target.value)}>
                  {f.opts.map(o => <option key={o} value={o}>{o==='Random'?'🎲 Random':o}</option>)}
                </select>
              </label>
            ))}
            <label className="npg-field">
              <span className="npg-field-label">Level</span>
              <select className="npg-select" value={params.level}
                onChange={e=>up('level', e.target.value==='Random'?'Random':+e.target.value)}>
                <option value="Random">🎲 Random</option>
                {Array.from({length:20},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>

          {error && <div className="npg-error">{error}</div>}

          <button className="npg-generate-btn" onClick={handleGenerate} disabled={generating}>
            {generating ? '⏳ Generating NPC…' : '⚡ Generate NPC'}
          </button>

          {/* Key status indicator */}
          <div className="npg-key-status">
            <span className={`npg-key-dot ${hasAnthropicKey()?'npg-key-dot--ok':''}`} />
            <span>{hasAnthropicKey() ? 'Claude key configured' : 'No Claude key — click ⚙ Settings'}</span>
          </div>
        </aside>

        {/* ── Right: result ── */}
        <section className="npg-result-panel">
          {!result && !generating && (
            <div className="npg-empty">
              <div className="npg-empty-icon">🎭</div>
              <div>Configure options and click <strong>Generate NPC</strong></div>
              <div style={{fontSize:11,opacity:.6,marginTop:6}}>All fields are optional — Random means fully AI-decided</div>
            </div>
          )}
          {generating && (
            <div className="npg-loading">
              <div className="npg-loading-spinner">⚡</div>
              <div>Channeling arcane forces…</div>
            </div>
          )}
          {result && resolved && (
            <NPCCard
              result={result}  resolved={resolved}
              regenSec={regenSec}
              onRegen={handleRegen}
              onRerollStats={handleRerollStats}
              onPortraitDone={url => setResult(r => ({...r, _portrait:url}))}
            />
          )}
        </section>
      </div>

      {showSettings && <ApiKeySettings onClose={()=>setShowSettings(false)} />}
    </div>
  );
}

// ── NPC Result Card ───────────────────────────────────────────────────────────

function NPCCard({ result, resolved, regenSec, onRegen, onRerollStats, onPortraitDone }) {
  const [dlgOpen,    setDlgOpen]    = useState(true);
  const [portraitGen,setPortraitGen]= useState(false);
  const [portraitErr,setPortraitErr]= useState('');

  const pl = PL_INFO[resolved.powerLevel] ?? PL_INFO.Standard;
  const sc = v => { if(v>=18)return'#d4a035';if(v>=16)return'#c07830';if(v>=13)return'#5a9a30';if(v>=10)return'#d4c5a9';if(v>=7)return'#c07030';return'#c03030'; };

  const TRAIT_COL = {
    brave:'#5a9a30',compassionate:'#5a9a30',honorable:'#5a9a30',loyal:'#5a9a30',wise:'#5a9a30',
    greedy:'#c04030',cruel:'#c04030',deceptive:'#c04030',vengeful:'#c04030',fanatical:'#c04030',cowardly:'#c04030',
    mysterious:'#6070c0',paranoid:'#c07030',melancholic:'#7070a0',cunning:'#b08020',impulsive:'#e06020',
  };
  const traitCol = t => TRAIT_COL[t.toLowerCase()] ?? '#7a6840';

  const handlePortrait = async () => {
    const key = getOpenAIKey();
    if (!key) { setPortraitErr('No OpenAI key. Add it in ⚙ Settings.'); return; }
    setPortraitGen(true); setPortraitErr('');
    try {
      console.log('[NPCGenerator] Requesting DALL-E portrait...');
      const subject = result.appearance || `${resolved.gender} ${resolved.race} ${resolved.charClass}`;
      const prompt = [
        'Forgotten Realms fantasy art style portrait, head and shoulders, dramatic oil painting.',
        `${subject}.`,
        `${resolved.powerLevel} power level. ${ALIGNMENTS.label[resolved.alignment] ?? resolved.alignment}.`,
        'No text, no watermarks. Moody lighting, intricate medieval detail.',
      ].join(' ').substring(0, 800);
      const resp = await fetch('https://api.openai.com/v1/images/generations', {
        method:'POST',
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
        body:JSON.stringify({model:'dall-e-3',prompt,n:1,size:'1024x1024',quality:'standard'}),
      });
      if (!resp.ok) {
        const e = await resp.json().catch(() => ({}));
        console.error('[NPCGenerator] DALL-E portrait error:', e);
        throw new Error(e?.error?.message || `OpenAI ${resp.status}`);
      }
      const portraitData = await resp.json();
      console.log('[NPCGenerator] DALL-E portrait received.');
      onPortraitDone(portraitData.data[0].url);
    } catch(e) {
      console.error('[NPCGenerator] Portrait failed:', e.message);
      setPortraitErr(e.message);
    }
    setPortraitGen(false);
  };

  const loot = result.loot ?? {};
  const coins = ['pp','gp','sp','cp'].filter(c => (loot[c]??0)>0);

  return (
    <div className="npg-card">

      {/* ── Hero row: portrait + identity ── */}
      <div className="npg-card-hero">
        <div className="npg-portrait-col">
          {result._portrait
            ? <img src={result._portrait} alt="" className="npg-portrait-img" />
            : <div className="npg-portrait-ph">🎭</div>
          }
          <button className="npg-portrait-btn" onClick={handlePortrait} disabled={portraitGen}>
            {portraitGen ? '⏳ Generating…' : '🖼 DALL·E Portrait'}
          </button>
          {portraitErr && <div className="npg-portrait-err">{portraitErr}</div>}
        </div>

        <div className="npg-identity">
          <div className="npg-npc-name">
            {result.name}
            {result.title && <span className="npg-npc-title"> &ldquo;{result.title}&rdquo;</span>}
          </div>
          <div className="npg-badge-row">
            <span className="npg-badge npg-badge--class">{resolved.race} {resolved.charClass !== 'None' ? resolved.charClass : ''} Lv{resolved.level}</span>
            <span className="npg-badge npg-badge--align">{resolved.alignment}</span>
            <span className="npg-badge npg-badge--pl" style={{'--plc':pl.color}}>{resolved.powerLevel}</span>
            <span className="npg-badge npg-badge--role">{resolved.role}</span>
          </div>
          {result.appearance && (
            <div className="npg-appearance">&ldquo;{result.appearance}&rdquo;</div>
          )}
        </div>
      </div>

      {/* ── Stats ── */}
      <div className="npg-section">
        <div className="npg-sec-header">
          <span className="npg-sec-title">Ability Scores</span>
          <button className="npg-regen-btn" onClick={onRerollStats}>🎲 Re-roll</button>
        </div>
        <div className="npg-stats-grid">
          {['str','dex','con','int','wis','cha'].map(s => (
            <div key={s} className="npg-stat-cell">
              <div className="npg-stat-lbl">{s.toUpperCase()}</div>
              <div className="npg-stat-val" style={{color:sc(resolved.stats[s])}}>{resolved.stats[s]}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Personality ── */}
      <div className="npg-section">
        <div className="npg-sec-title">Personality</div>
        <div className="npg-trait-row">
          {(result.personality??[]).map(t=>(
            <span key={t} className="npg-trait" style={{color:traitCol(t),borderColor:traitCol(t)+'66'}}>{t}</span>
          ))}
        </div>
        {result.speech_style && <div className="npg-speech">💬 {result.speech_style}</div>}
      </div>

      {/* ── Background ── */}
      <div className="npg-section">
        <div className="npg-sec-header">
          <span className="npg-sec-title">Background</span>
          <button className="npg-regen-btn" onClick={()=>onRegen('background')} disabled={regenSec==='background'}>
            {regenSec==='background'?'⏳':' ↺ Regenerate'}
          </button>
        </div>
        <p className="npg-prose">{result.background}</p>
      </div>

      {/* ── Dialogue ── */}
      <div className="npg-section">
        <div className="npg-sec-header">
          <span className="npg-sec-title">Dialogue</span>
          <div style={{display:'flex',gap:6}}>
            <button className="npg-regen-btn" onClick={()=>onRegen('dialogue')} disabled={regenSec==='dialogue'}>
              {regenSec==='dialogue'?'⏳':'↺ New Lines'}
            </button>
            <button className="npg-expand-btn" onClick={()=>setDlgOpen(v=>!v)}>
              {dlgOpen?'▲ Hide':'▼ Show'}
            </button>
          </div>
        </div>
        {dlgOpen && (
          <div className="npg-dialogue">
            {(result.dialogue??[]).map((line,i)=>(
              <div key={i} className="npg-quote">&ldquo;{line}&rdquo;</div>
            ))}
          </div>
        )}
      </div>

      {/* ── Secrets (DM only) ── */}
      <div className="npg-section npg-section--secrets">
        <div className="npg-sec-header">
          <span className="npg-sec-title">🔒 Secrets — DM Only</span>
          <button className="npg-regen-btn" onClick={()=>onRegen('secrets')} disabled={regenSec==='secrets'}>
            {regenSec==='secrets'?'⏳':'↺ New Secrets'}
          </button>
        </div>
        {(result.secrets??[]).map((s,i)=>(
          <div key={i} className="npg-secret">🔑 {s}</div>
        ))}
      </div>

      {/* ── Quest Hooks ── */}
      <div className="npg-section npg-section--hooks">
        <div className="npg-sec-header">
          <span className="npg-sec-title">📜 Quest Hooks</span>
          <button className="npg-regen-btn" onClick={()=>onRegen('quest_hooks')} disabled={regenSec==='quest_hooks'}>
            {regenSec==='quest_hooks'?'⏳':'↺ New Hooks'}
          </button>
        </div>
        {(result.quest_hooks??[]).map((h,i)=>(
          <div key={i} className="npg-hook">⚔ {h}</div>
        ))}
      </div>

      {/* ── Equipment ── */}
      <div className="npg-section">
        <div className="npg-sec-title">Equipment</div>
        <div className="npg-list">
          {(result.equipment??[]).map((item,i)=>(
            <div key={i} className="npg-list-item">⚔ {item}</div>
          ))}
        </div>
      </div>

      {/* ── Loot ── */}
      {(coins.length > 0 || (loot.items?.length ?? 0) > 0) && (
        <div className="npg-section">
          <div className="npg-sec-title">Loot</div>
          <div className="npg-loot-row">
            {coins.map(c=>(
              <span key={c} className="npg-coin">
                <span className="npg-coin-amt">{loot[c]}</span>
                <span className="npg-coin-lbl">{c.toUpperCase()}</span>
              </span>
            ))}
            {(loot.items??[]).map((item,i)=>(
              <span key={i} className="npg-loot-item">💎 {item}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NPCGenerator;
