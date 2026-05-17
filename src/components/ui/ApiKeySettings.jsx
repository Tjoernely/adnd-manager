/**
 * ApiKeySettings — modal for managing API keys stored in localStorage.
 * Keys:
 *   anthropic_api_key  — used for Claude NPC/Map generation
 *   openai_api_key     — used for DALL-E 3 portrait generation
 */
import { useState } from 'react';
import {
  MODEL_OPTIONS,
  LENGTH_TIER_NAMES,
  DETAIL_TIER_NAMES,
  LS_DEFAULT_MODEL,
  LS_DEFAULT_LENGTH,
  LS_DEFAULT_DETAIL,
  readDefaultModel,
  readDefaultLengthTier,
  readDefaultDetailTier,
} from '../quests/aiGenConfig';

export function ApiKeySettings({ onClose }) {
  const [anthropicKey, setAnthropicKey] = useState(() => localStorage.getItem('anthropic_api_key') ?? '');
  const [openaiKey,    setOpenaiKey]    = useState(() => localStorage.getItem('openai_api_key')    ?? '');
  const [saved,        setSaved]        = useState(false);

  // Quest AI generation defaults
  const [aiModel,  setAiModel]  = useState(() => readDefaultModel());
  const [aiLength, setAiLength] = useState(() => readDefaultLengthTier());
  const [aiDetail, setAiDetail] = useState(() => readDefaultDetailTier());

  const handleSave = () => {
    if (anthropicKey.trim()) localStorage.setItem('anthropic_api_key', anthropicKey.trim());
    else localStorage.removeItem('anthropic_api_key');

    if (openaiKey.trim()) localStorage.setItem('openai_api_key', openaiKey.trim());
    else localStorage.removeItem('openai_api_key');

    localStorage.setItem(LS_DEFAULT_MODEL,  aiModel);
    localStorage.setItem(LS_DEFAULT_LENGTH, String(aiLength));
    localStorage.setItem(LS_DEFAULT_DETAIL, String(aiDetail));

    setSaved(true);
    setTimeout(() => { setSaved(false); }, 1800);
  };

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:500,
      background:'rgba(0,0,0,.82)', backdropFilter:'blur(6px)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:20,
    }} onClick={onClose}>
      <div style={{
        position:'relative', background:'linear-gradient(160deg,#1e1608,#141008)',
        border:'1px solid rgba(200,168,75,.65)', borderRadius:12,
        width:'100%', maxWidth:480, padding:'28px 32px',
        boxShadow:'0 24px 80px rgba(0,0,0,.95)', fontFamily:"'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      }} onClick={e=>e.stopPropagation()}>

        {/* Corner decorations */}
        {[['tl','2px 0 0 2px','5px auto auto 5px'],['tr','2px 2px 0 0','5px 5px auto auto'],
          ['bl','0 0 2px 2px','auto auto 5px 5px'],['br','0 2px 2px 0','auto 5px 5px auto']].map(([k,bw,inset])=>(
          <span key={k} style={{
            position:'absolute', width:12, height:12,
            borderColor:'rgba(200,168,75,.5)', borderStyle:'solid', borderWidth:bw,
            inset, pointerEvents:'none',
          }} />
        ))}

        <div style={{ fontSize:18, fontWeight:'bold', color:'#c8a84b', letterSpacing:1, marginBottom:6 }}>
          ⚙ API Key Settings
        </div>
        <p style={{ fontSize:11, color:'#7a6840', marginBottom:24, lineHeight:1.6 }}>
          Keys are stored only in your browser (localStorage). They are never sent to the campaign server.
        </p>

        <KeyField
          label="Anthropic API Key"
          sublabel="Used for AI NPC and Map generation (Claude)"
          hint="sk-ant-api03-..."
          value={anthropicKey}
          onChange={setAnthropicKey}
          link="https://console.anthropic.com/settings/keys"
          linkLabel="Get key →"
        />

        <KeyField
          label="OpenAI API Key"
          sublabel="Used for portrait generation (DALL·E 3)"
          hint="sk-proj-..."
          value={openaiKey}
          onChange={setOpenaiKey}
          link="https://platform.openai.com/api-keys"
          linkLabel="Get key →"
        />

        <div style={{
          marginBottom:20, padding:'14px 16px', borderRadius:8,
          background:'rgba(0,0,0,.3)', border:'1px solid rgba(200,168,75,.18)',
        }}>
          <div style={{ fontSize:11, letterSpacing:2, color:'#7a6020',
            textTransform:'uppercase', marginBottom:4 }}>
            AI Generation Defaults
          </div>
          <div style={{ fontSize:10, color:'#5a5030', marginBottom:12, lineHeight:1.6 }}>
            These apply to new quests but can be overridden per-quest in the Generate dialog.
          </div>

          <DefaultField label="Default model">
            <select value={aiModel} onChange={e => setAiModel(e.target.value)} style={selectStyle}>
              {MODEL_OPTIONS.map(m => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </DefaultField>

          <DefaultField label="Default detail level">
            <select value={aiDetail} onChange={e => setAiDetail(Number(e.target.value))} style={selectStyle}>
              {DETAIL_TIER_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </DefaultField>

          <DefaultField label="Default length">
            <select value={aiLength} onChange={e => setAiLength(Number(e.target.value))} style={selectStyle}>
              {LENGTH_TIER_NAMES.map((name, i) => (
                <option key={i} value={i}>{name}</option>
              ))}
            </select>
          </DefaultField>
        </div>

        <div style={{ display:'flex', gap:10, marginTop:10 }}>
          <button onClick={handleSave} style={{
            flex:1, padding:'9px 0', borderRadius:6, cursor:'pointer',
            fontFamily:'inherit', fontSize:13, fontWeight:'bold',
            background: saved ? 'rgba(60,180,60,.2)' : 'rgba(200,168,75,.15)',
            border: `1px solid ${saved ? 'rgba(60,180,60,.6)' : 'rgba(200,168,75,.6)'}`,
            color: saved ? '#80e080' : '#c8a84b',
            transition:'all .15s',
          }}>
            {saved ? '✔ Saved!' : '💾 Save Keys'}
          </button>
          <button onClick={onClose} style={{
            padding:'9px 20px', borderRadius:6, cursor:'pointer',
            fontFamily:'inherit', fontSize:12, background:'transparent',
            border:'1px solid rgba(100,80,40,.35)', color:'#7a6840',
          }}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

const selectStyle = {
  background:'rgba(0,0,0,.5)', border:'1px solid rgba(200,168,75,.25)',
  borderRadius:5, color:'#d4c090', fontFamily:'inherit', fontSize:11,
  padding:'5px 8px', outline:'none', minWidth:160, cursor:'pointer',
};

function DefaultField({ label, children }) {
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
      marginBottom:8, gap:12 }}>
      <span style={{ fontSize:11, color:'#9a8850' }}>{label}</span>
      {children}
    </div>
  );
}

function KeyField({ label, sublabel, hint, value, onChange, link, linkLabel }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
        <div style={{ fontSize:11, letterSpacing:2, color:'#7a6020', textTransform:'uppercase' }}>{label}</div>
        <a href={link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize:10, color:'#c8a84b', textDecoration:'none' }}>{linkLabel}</a>
      </div>
      <div style={{ fontSize:10, color:'#5a5030', marginBottom:6 }}>{sublabel}</div>
      <div style={{ display:'flex', gap:6 }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={hint}
          style={{
            flex:1, background:'rgba(0,0,0,.5)', border:'1px solid rgba(200,168,75,.25)',
            borderRadius:5, color:'#d4c090', fontFamily:'monospace', fontSize:11,
            padding:'7px 10px', outline:'none',
          }}
        />
        <button onClick={()=>setShow(v=>!v)} style={{
          background:'rgba(0,0,0,.35)', border:'1px solid rgba(200,168,75,.2)',
          borderRadius:5, color:'#7a6840', cursor:'pointer', padding:'0 10px', fontSize:12,
        }}>
          {show ? '🙈' : '👁'}
        </button>
        {value && <button onClick={()=>onChange('')} style={{
          background:'rgba(180,30,30,.12)', border:'1px solid rgba(180,30,30,.3)',
          borderRadius:5, color:'#c04030', cursor:'pointer', padding:'0 9px', fontSize:12,
        }}>✕</button>}
      </div>
      <div style={{ marginTop:4, fontSize:10, color: value ? '#5a9a30' : '#5a4030' }}>
        {value ? '● Key configured' : '○ Not configured'}
      </div>
    </div>
  );
}

export default ApiKeySettings;
