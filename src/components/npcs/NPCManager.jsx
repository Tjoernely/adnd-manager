/**
 * NPCManager — Full NPC management module for AD&D 2E Campaign Manager
 * Supports create, view/edit, AI generation, portrait generation, DM reveal/hide
 *
 * Props:
 *   campaign   object  — active campaign
 *   user       object  — current auth user
 *   onBack     fn()    — returns to campaign dashboard
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { NPCGenerator } from './NPCGenerator.jsx';
import './NPCManager.css';

// ── Constants ──────────────────────────────────────────────────────────────────

const POWER_LEVELS = [
  { id: 'weak',      label: 'Weak',      color: '#6aaa40', icon: '○' },
  { id: 'standard',  label: 'Standard',  color: '#c8a84b', icon: '◈' },
  { id: 'heroic',    label: 'Heroic',    color: '#d07030', icon: '◆' },
  { id: 'legendary', label: 'Legendary', color: '#b040c0', icon: '★' },
  { id: 'demigod',   label: 'Demigod',   color: '#e03040', icon: '✦' },
];

const ALIGNMENTS = [
  { id:'LG', label:'Lawful Good'    }, { id:'LN', label:'Lawful Neutral' }, { id:'LE', label:'Lawful Evil'    },
  { id:'NG', label:'Neutral Good'   }, { id:'TN', label:'True Neutral'   }, { id:'NE', label:'Neutral Evil'   },
  { id:'CG', label:'Chaotic Good'   }, { id:'CN', label:'Chaotic Neutral'}, { id:'CE', label:'Chaotic Evil'   },
];

const RACES   = ['Human','Dwarf','Elf','Gnome','Half-Elf','Halfling','Half-Orc'];
const CLASSES = ['Fighter','Wizard','Cleric','Thief','Ranger','Paladin','Druid','Bard','Assassin','Monk','Illusionist','None'];

const PERSONALITY_TRAITS = {
  positive: ['Brave','Compassionate','Generous','Honest','Loyal','Wise','Witty','Calm','Curious','Resourceful','Humble'],
  negative: ['Greedy','Cowardly','Cruel','Deceitful','Arrogant','Impulsive','Paranoid','Vengeful','Lazy','Envious','Bitter'],
  neutral:  ['Reserved','Pragmatic','Melancholic','Eccentric','Stoic','Superstitious','Nostalgic','Formal','Blunt','Dreamy','Mysterious'],
};

// ── Dice Rolling ──────────────────────────────────────────────────────────────

function dr(sides) { return Math.floor(Math.random() * sides) + 1; }

function rollStat(pl) {
  switch (pl) {
    case 'weak':      { const r=[dr(6),dr(6),dr(6),dr(6)].sort((a,b)=>a-b); return r[0]+r[1]+r[2]; }
    case 'standard':  { const r=[dr(6),dr(6),dr(6),dr(6)].sort((a,b)=>a-b); return r[1]+r[2]+r[3]; }
    case 'heroic':    return dr(4)+dr(4)+12;
    case 'legendary': return dr(4)+15;
    case 'demigod':   return dr(6)+18;
    default: return 10;
  }
}

function rollStats(pl) {
  return { str:rollStat(pl), dex:rollStat(pl), con:rollStat(pl),
           int:rollStat(pl), wis:rollStat(pl), cha:rollStat(pl) };
}

function rollLevel(pl) {
  switch (pl) {
    case 'weak':      return dr(4);
    case 'standard':  return dr(4)+2;
    case 'heroic':    return dr(4)+6;
    case 'legendary': return dr(6)+10;
    case 'demigod':   return dr(4)+16;
    default: return 1;
  }
}

function rollLoot(pl) {
  switch (pl) {
    case 'weak':      return { pp:0,       gp:dr(6),        sp:dr(6)*5,  cp:dr(10)*10, items:[] };
    case 'standard':  return { pp:0,       gp:dr(6)*5,      sp:dr(6)*10, cp:dr(6)*20,  items:[] };
    case 'heroic':    return { pp:dr(4),   gp:dr(6)*20,     sp:dr(6)*30, cp:0,          items:[] };
    case 'legendary': return { pp:dr(6)*5, gp:dr(6)*100,    sp:dr(6)*20, cp:0,          items:[] };
    case 'demigod':   return { pp:dr(10)*10, gp:dr(10)*500, sp:0,        cp:0,          items:[] };
    default:          return { pp:0, gp:0, sp:0, cp:0, items:[] };
  }
}

function statCol(v) {
  if (v>=18) return '#d4a035'; if (v>=16) return '#c07830';
  if (v>=13) return '#5a9a30'; if (v>=10) return '#d4c5a9';
  if (v>=7)  return '#c07030'; return '#c03030';
}

function plInfo(id) { return POWER_LEVELS.find(p=>p.id===id) ?? POWER_LEVELS[1]; }
function alignLabel(id) { return ALIGNMENTS.find(a=>a.id===id)?.label ?? (id || '—'); }

// ── Portrait Generation ───────────────────────────────────────────────────────

async function generatePortrait(npcData, npcName) {
  const apiKey = localStorage.getItem('openai_api_key');
  if (!apiKey) throw new Error('No OpenAI API key found. Add key "openai_api_key" to localStorage.');
  const { race, charClass, gender, alignment, powerLevel, stats } = npcData;
  const pl = plInfo(powerLevel);
  const prompt = [
    'AD&D 2nd Edition dark-fantasy portrait, head and shoulders, dramatic oil painting style, no text, no watermarks.',
    `Subject: ${gender||'Unknown'} ${race||'Human'} ${charClass||'adventurer'}, ${pl.label} tier.`,
    `Name: ${npcName}. Alignment: ${alignLabel(alignment)}.`,
    (stats?.cha >= 16) ? 'Charismatic and striking appearance.' : (stats?.cha <= 7 ? 'Unsettling, off-putting look.' : ''),
    'Moody dramatic lighting, intricate medieval detail, rich dark palette.',
  ].filter(Boolean).join(' ');

  const resp = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model:'dall-e-3', prompt, n:1, size:'1024x1024', quality:'standard' }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(()=>({}));
    throw new Error(err?.error?.message ?? `OpenAI ${resp.status}`);
  }
  return (await resp.json()).data[0].url;
}

// ── NPCManager (root) ─────────────────────────────────────────────────────────

export function NPCManager({ campaign, user, onBack }) {
  const isDM = campaign.dm_user_id === user.id;

  const [npcs,        setNpcs]        = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [searchText,  setSearchText]  = useState('');
  const [filterPower, setFilterPower] = useState('');
  const [filterAlign, setFilterAlign] = useState('');
  const [selectedNpc, setSelectedNpc] = useState(null);
  const [showGenerate,setShowGenerate]= useState(false);
  const [showCreate,  setShowCreate]  = useState(false);

  const loadNpcs = useCallback(() => {
    setLoading(true);
    api.getNpcs(campaign.id)
      .then(r => { setNpcs(Array.isArray(r) ? r : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [campaign.id]);

  useEffect(() => { loadNpcs(); }, [loadNpcs]);

  const filtered = npcs.filter(n => {
    if (!isDM && n.is_hidden) return false;
    if (searchText && !n.name.toLowerCase().includes(searchText.toLowerCase())) return false;
    if (filterPower && (n.data?.powerLevel ?? 'standard') !== filterPower) return false;
    if (filterAlign && (n.data?.alignment  ?? 'TN')       !== filterAlign) return false;
    return true;
  });

  const handleSaveNpc = useCallback(async (npc, updates) => {
    const updated = await api.updateNpc(npc.id, updates);
    setNpcs(prev => prev.map(n => n.id === npc.id ? updated : n));
    setSelectedNpc(updated);
  }, []);

  const handleDeleteNpc = useCallback(async (npc) => {
    await api.deleteNpc(npc.id);
    setNpcs(prev => prev.filter(n => n.id !== npc.id));
    setSelectedNpc(null);
  }, []);

  const handleRevealToggle = useCallback(async (npc) => {
    const updated = npc.is_hidden ? await api.revealNpc(npc.id) : await api.hideNpc(npc.id);
    setNpcs(prev => prev.map(n => n.id === npc.id ? updated : n));
    setSelectedNpc(updated);
  }, []);

  const handleCreated = useCallback((newNpc) => {
    setNpcs(prev => [newNpc, ...prev]);
    setShowCreate(false);
    setShowGenerate(false);
    setSelectedNpc(newNpc);
  }, []);

  return (
    <div className="nm-screen">
      <div className="nm-bg-diamonds" aria-hidden="true" />

      {/* ── Header ── */}
      <header className="nm-header">
        <div className="nm-header-left">
          <button className="nm-back-btn" onClick={onBack}>‹ Dashboard</button>
        </div>
        <div className="nm-header-center">
          <div className="nm-edition-label">AD&amp;D 2nd Edition ✦ Skills &amp; Powers</div>
          <h1 className="nm-title">🎭 NPCs</h1>
          <div className="nm-campaign-name">{campaign.name}</div>
        </div>
        <div className="nm-header-right">
          <span className="nm-user-chip">{user.email}</span>
          {isDM && (
            <>
              <button className="nm-add-btn nm-add-btn--ai" onClick={() => setShowGenerate(true)}>
                ✦ AI Generate
              </button>
              <button className="nm-add-btn" onClick={() => setShowCreate(true)}>
                + New NPC
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Filters ── */}
      <div className="nm-filters">
        <input className="nm-search" placeholder="Search NPCs…" value={searchText}
          onChange={e => setSearchText(e.target.value)} />
        <select className="nm-select" value={filterPower} onChange={e => setFilterPower(e.target.value)}>
          <option value="">All Power Levels</option>
          {POWER_LEVELS.map(p => <option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
        </select>
        <select className="nm-select" value={filterAlign} onChange={e => setFilterAlign(e.target.value)}>
          <option value="">All Alignments</option>
          {ALIGNMENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <span className="nm-count">{filtered.length} NPC{filtered.length !== 1 ? 's' : ''}</span>
      </div>

      {/* ── Grid ── */}
      <main className="nm-main">
        {loading ? (
          <div className="nm-empty">Loading NPCs…</div>
        ) : filtered.length === 0 ? (
          <div className="nm-empty">
            {npcs.length === 0
              ? (isDM ? 'No NPCs yet — generate one with AI or create manually.' : 'No NPCs have been revealed to the party yet.')
              : 'No NPCs match your current filters.'}
          </div>
        ) : (
          <div className="nm-grid">
            {filtered.map(npc => (
              <NPCCard key={npc.id} npc={npc} isDM={isDM} onClick={() => setSelectedNpc(npc)} />
            ))}
          </div>
        )}
      </main>

      {selectedNpc && (
        <NPCDetailModal npc={selectedNpc} isDM={isDM}
          onClose={() => setSelectedNpc(null)}
          onSave={handleSaveNpc}
          onDelete={handleDeleteNpc}
          onRevealToggle={handleRevealToggle}
        />
      )}
      {showGenerate && (
        <NPCGenerator
          campaignId={campaign.id}
          onClose={() => setShowGenerate(false)}
          onSaved={handleCreated}
        />
      )}
      {showCreate && (
        <CreateNPCModal campaignId={campaign.id}
          onClose={() => setShowCreate(false)} onCreated={handleCreated} />
      )}
    </div>
  );
}

// ── NPC Card ─────────────────────────────────────────────────────────────────

function NPCCard({ npc, isDM, onClick }) {
  const d = npc.data ?? {};
  const pl = plInfo(d.powerLevel);
  const stats = d.stats ?? {};
  const hasStats = Object.keys(stats).length > 0;

  return (
    <button className="nm-card" onClick={onClick}>
      <span className="nm-corner nm-corner--tl" aria-hidden="true" />
      <span className="nm-corner nm-corner--tr" aria-hidden="true" />
      <span className="nm-corner nm-corner--bl" aria-hidden="true" />
      <span className="nm-corner nm-corner--br" aria-hidden="true" />

      <div className="nm-card-portrait">
        {d.portrait
          ? <img src={d.portrait} alt={npc.name} className="nm-card-portrait-img" />
          : <div className="nm-card-portrait-placeholder">🎭</div>
        }
        <span className="nm-card-pl-badge" style={{ '--pl-color': pl.color }}>
          {pl.icon} {pl.label}
        </span>
        {isDM && npc.is_hidden && <span className="nm-card-hidden-badge">👁 Hidden</span>}
      </div>

      <div className="nm-card-body">
        <div className="nm-card-name">{npc.name}</div>
        <div className="nm-card-sub">
          {[d.gender, d.race, d.charClass && `${d.charClass}${d.level ? ` Lv${d.level}` : ''}`]
            .filter(Boolean).join(' · ')}
        </div>
        {d.alignment && <div className="nm-card-align">{alignLabel(d.alignment)}</div>}
        {(d.personality?.length ?? 0) > 0 && (
          <div className="nm-card-traits">
            {d.personality.slice(0,3).map(t => <span key={t} className="nm-card-trait">{t}</span>)}
          </div>
        )}
        {hasStats && (
          <div className="nm-card-stats">
            {['str','dex','con','int','wis','cha'].map(s => (
              <span key={s} className="nm-card-stat">
                <span className="nm-card-stat-label">{s.toUpperCase()}</span>
                <span className="nm-card-stat-val" style={{ color: statCol(stats[s]??10) }}>
                  {stats[s] ?? '—'}
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    </button>
  );
}

// ── NPC Detail Modal ──────────────────────────────────────────────────────────

const DETAIL_TABS = ['overview','traits','equipment','loot','portrait','notes'];

function NPCDetailModal({ npc, isDM, onClose, onSave, onDelete, onRevealToggle }) {
  const [draft,      setDraft]      = useState(() => ({ ...(npc.data ?? {}) }));
  const [draftName,  setDraftName]  = useState(npc.name);
  const [activeTab,  setActiveTab]  = useState('overview');
  const [saving,     setSaving]     = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const [portraitGen,setPortraitGen]= useState(false);
  const [portraitErr,setPortraitErr]= useState('');
  const [newEquip,   setNewEquip]   = useState('');
  const [newLootItem,setNewLootItem]= useState('');

  const pl    = plInfo(draft.powerLevel);
  const stats = draft.stats ?? {};

  const updateDraft = (key, val) => setDraft(prev => ({ ...prev, [key]: val }));
  const updateStats = (stat, val) => setDraft(prev => ({
    ...prev, stats: { ...(prev.stats??{}), [stat]: Math.max(1, Math.min(25, +val||10)) }
  }));
  const updateLoot = (key, val) => setDraft(prev => ({
    ...prev, loot: { ...(prev.loot??{}), [key]: val }
  }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(npc, { name: draftName, data: draft }); }
    catch(e) { console.error('Save NPC:', e); }
    setSaving(false);
  };

  const toggleTrait = (trait) => {
    const cur = draft.personality ?? [];
    const lc = trait.toLowerCase();
    const has = cur.some(t => t.toLowerCase() === lc);
    updateDraft('personality', has ? cur.filter(t=>t.toLowerCase()!==lc) : [...cur, trait]);
  };

  const addEquip = () => {
    if (!newEquip.trim()) return;
    updateDraft('equipment', [...(draft.equipment??[]), newEquip.trim()]);
    setNewEquip('');
  };
  const removeEquip = i => updateDraft('equipment', (draft.equipment??[]).filter((_,j)=>j!==i));

  const addLootItem = () => {
    if (!newLootItem.trim()) return;
    updateDraft('loot', { ...(draft.loot??{}), items:[...(draft.loot?.items??[]), newLootItem.trim()] });
    setNewLootItem('');
  };
  const removeLootItem = i => updateDraft('loot', {
    ...(draft.loot??{}), items:(draft.loot?.items??[]).filter((_,j)=>j!==i)
  });

  const handleGeneratePortrait = async () => {
    setPortraitGen(true); setPortraitErr('');
    try {
      const url = await generatePortrait(draft, draftName);
      const history = [url, ...(draft.portraitHistory??[])].slice(0,5);
      setDraft(prev => ({ ...prev, portrait: url, portraitHistory: history }));
    } catch(e) { setPortraitErr(e.message); }
    setPortraitGen(false);
  };

  return (
    <div className="nm-backdrop" onClick={onClose}>
      <div className="nm-detail-modal" onClick={e=>e.stopPropagation()}>
        <span className="nm-corner nm-corner--tl" aria-hidden="true" />
        <span className="nm-corner nm-corner--tr" aria-hidden="true" />
        <span className="nm-corner nm-corner--bl" aria-hidden="true" />
        <span className="nm-corner nm-corner--br" aria-hidden="true" />

        {/* ── Header ── */}
        <div className="nm-dm-header">
          <div className="nm-dm-title-row">
            {isDM
              ? <input className="nm-dm-name-input" value={draftName} onChange={e=>setDraftName(e.target.value)} />
              : <div className="nm-dm-name-static">{draftName}</div>
            }
            <span className="nm-dm-pl-badge" style={{ '--pl-color': pl.color }}>
              {pl.icon} {pl.label}
            </span>
            {isDM && (
              <button
                className={`nm-dm-vis-btn ${npc.is_hidden ? 'nm-dm-vis-btn--hidden' : 'nm-dm-vis-btn--shown'}`}
                onClick={() => onRevealToggle(npc)}>
                {npc.is_hidden ? '👁 Hidden — Click to Reveal' : '👁 Visible — Click to Hide'}
              </button>
            )}
          </div>

          <div className="nm-dm-info-row">
            {isDM ? (
              <>
                <select className="nm-dm-sel" value={draft.race??''}     onChange={e=>updateDraft('race',e.target.value)}>
                  <option value="">Race</option>{RACES.map(r=><option key={r}>{r}</option>)}
                </select>
                <select className="nm-dm-sel" value={draft.charClass??''} onChange={e=>updateDraft('charClass',e.target.value)}>
                  <option value="">Class</option>{CLASSES.map(c=><option key={c}>{c}</option>)}
                </select>
                <input className="nm-dm-inp nm-dm-inp--short" type="number" min={1} max={20}
                  value={draft.level??1} onChange={e=>updateDraft('level',+e.target.value||1)} title="Level" />
                <select className="nm-dm-sel" value={draft.gender??''}    onChange={e=>updateDraft('gender',e.target.value)}>
                  <option value="">Gender</option>
                  <option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option>
                </select>
                <select className="nm-dm-sel" value={draft.alignment??''} onChange={e=>updateDraft('alignment',e.target.value)}>
                  <option value="">Alignment</option>
                  {ALIGNMENTS.map(a=><option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
                <select className="nm-dm-sel" value={draft.powerLevel??'standard'} onChange={e=>updateDraft('powerLevel',e.target.value)}>
                  {POWER_LEVELS.map(p=><option key={p.id} value={p.id}>{p.icon} {p.label}</option>)}
                </select>
              </>
            ) : (
              <span className="nm-dm-info-text">
                {[draft.gender, draft.race, draft.charClass].filter(Boolean).join(' · ')}
                {draft.level ? ` · Lv${draft.level}` : ''}
                {draft.alignment ? ` · ${alignLabel(draft.alignment)}` : ''}
              </span>
            )}
          </div>
        </div>

        {/* ── Sub-tabs ── */}
        <nav className="nm-dm-tabs">
          {DETAIL_TABS.map(t => (
            <button key={t}
              className={`nm-dm-tab ${activeTab===t?'nm-dm-tab--active':''}`}
              onClick={()=>setActiveTab(t)}>
              {t.charAt(0).toUpperCase()+t.slice(1)}
            </button>
          ))}
        </nav>

        {/* ── Tab content ── */}
        <div className="nm-dm-content">

          {/* OVERVIEW */}
          {activeTab==='overview' && (
            <div className="nm-dm-overview">
              <div className="nm-dm-stats-grid">
                {['str','dex','con','int','wis','cha'].map(s => (
                  <div key={s} className="nm-dm-stat-cell">
                    <div className="nm-dm-stat-label">{s.toUpperCase()}</div>
                    {isDM
                      ? <input type="number" min={1} max={25} className="nm-dm-stat-input"
                          style={{ color: statCol(stats[s]??10) }} value={stats[s]??10}
                          onChange={e=>updateStats(s,e.target.value)} />
                      : <div className="nm-dm-stat-val" style={{ color: statCol(stats[s]??10) }}>{stats[s]??'—'}</div>
                    }
                  </div>
                ))}
              </div>
              <label className="nm-dm-label">Background</label>
              <textarea className="nm-dm-textarea"
                value={draft.background??''}
                onChange={e=>updateDraft('background',e.target.value)}
                rows={6} readOnly={!isDM}
                placeholder={isDM ? 'Write the NPC background…' : 'No background recorded.'} />
            </div>
          )}

          {/* TRAITS */}
          {activeTab==='traits' && (
            <div className="nm-dm-traits">
              {isDM && <p className="nm-dm-traits-hint">Click traits to toggle them. Active traits are highlighted.</p>}
              {Object.entries(PERSONALITY_TRAITS).map(([cat, traits]) => (
                <div key={cat} className="nm-dm-trait-group">
                  <div className={`nm-dm-trait-cat nm-dm-trait-cat--${cat}`}>
                    {cat.charAt(0).toUpperCase()+cat.slice(1)}
                  </div>
                  <div className="nm-dm-trait-pills">
                    {traits.map(t => {
                      const active = (draft.personality??[]).some(x=>x.toLowerCase()===t.toLowerCase());
                      return (
                        <button key={t}
                          className={`nm-dm-trait-pill nm-dm-trait-pill--${cat} ${active?'nm-dm-trait-pill--active':''}`}
                          onClick={isDM ? ()=>toggleTrait(t) : undefined}
                          style={!isDM ? { cursor:'default' } : undefined}>
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* EQUIPMENT */}
          {activeTab==='equipment' && (
            <div className="nm-dm-equip">
              <div className="nm-dm-list">
                {(draft.equipment??[]).length===0 && <div className="nm-dm-empty-inline">No equipment listed.</div>}
                {(draft.equipment??[]).map((item,i) => (
                  <div key={i} className="nm-dm-list-item">
                    <span className="nm-dm-list-icon">⚔</span>
                    <span className="nm-dm-list-text">{item}</span>
                    {isDM && <button className="nm-dm-remove" onClick={()=>removeEquip(i)}>×</button>}
                  </div>
                ))}
              </div>
              {isDM && (
                <div className="nm-dm-add-row">
                  <input className="nm-dm-add-input" value={newEquip}
                    onChange={e=>setNewEquip(e.target.value)}
                    onKeyDown={e=>e.key==='Enter'&&addEquip()}
                    placeholder="Add equipment item…" />
                  <button className="nm-dm-add-btn" onClick={addEquip}>+ Add</button>
                </div>
              )}
            </div>
          )}

          {/* LOOT */}
          {activeTab==='loot' && (
            <div className="nm-dm-loot">
              <div className="nm-dm-loot-coins">
                {['pp','gp','sp','cp'].map(coin => (
                  <div key={coin} className="nm-dm-loot-coin">
                    <div className="nm-dm-loot-coin-label">{coin.toUpperCase()}</div>
                    {isDM
                      ? <input type="number" min={0} className="nm-dm-loot-coin-input"
                          value={draft.loot?.[coin]??0}
                          onChange={e=>updateLoot(coin, Math.max(0,+e.target.value||0))} />
                      : <div className="nm-dm-loot-coin-val">{draft.loot?.[coin]??0}</div>
                    }
                  </div>
                ))}
                {isDM && (
                  <button className="nm-dm-reroll-btn" onClick={()=>{
                    const r=rollLoot(draft.powerLevel??'standard');
                    setDraft(prev=>({...prev,loot:{...(prev.loot??{}),pp:r.pp,gp:r.gp,sp:r.sp,cp:r.cp}}));
                  }}>🎲 Re-roll</button>
                )}
              </div>
              <div className="nm-dm-loot-items">
                <div className="nm-dm-label">Special Items</div>
                <div className="nm-dm-list">
                  {(draft.loot?.items??[]).length===0 && <div className="nm-dm-empty-inline">No special items.</div>}
                  {(draft.loot?.items??[]).map((item,i) => (
                    <div key={i} className="nm-dm-list-item">
                      <span className="nm-dm-list-icon">💎</span>
                      <span className="nm-dm-list-text">{item}</span>
                      {isDM && <button className="nm-dm-remove" onClick={()=>removeLootItem(i)}>×</button>}
                    </div>
                  ))}
                </div>
                {isDM && (
                  <div className="nm-dm-add-row">
                    <input className="nm-dm-add-input" value={newLootItem}
                      onChange={e=>setNewLootItem(e.target.value)}
                      onKeyDown={e=>e.key==='Enter'&&addLootItem()}
                      placeholder="Add special item…" />
                    <button className="nm-dm-add-btn" onClick={addLootItem}>+ Add</button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* PORTRAIT */}
          {activeTab==='portrait' && (
            <div className="nm-dm-portrait-tab">
              {draft.portrait
                ? <img src={draft.portrait} alt={npc.name} className="nm-dm-portrait-img" />
                : <div className="nm-dm-portrait-placeholder">🎭<br/>No portrait yet</div>
              }
              {isDM && (
                <>
                  <button className="nm-dm-gen-portrait-btn" onClick={handleGeneratePortrait} disabled={portraitGen}>
                    {portraitGen ? '⏳ Generating portrait…' : '✦ Generate with DALL·E 3'}
                  </button>
                  {portraitErr && <div className="nm-dm-portrait-err">{portraitErr}</div>}
                  {(draft.portraitHistory??[]).length > 0 && (
                    <div className="nm-dm-portrait-history">
                      <div className="nm-dm-label">History (click to restore)</div>
                      <div className="nm-dm-portrait-history-row">
                        {(draft.portraitHistory??[]).map((url,i) => (
                          <img key={i} src={url} alt=""
                            className={`nm-dm-portrait-thumb ${draft.portrait===url?'nm-dm-portrait-thumb--active':''}`}
                            onClick={()=>updateDraft('portrait',url)} />
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* NOTES */}
          {activeTab==='notes' && (
            <div className="nm-dm-notes">
              {isDM
                ? <>
                    <label className="nm-dm-label">DM Notes (private)</label>
                    <textarea className="nm-dm-textarea nm-dm-textarea--tall"
                      value={draft.notes??''}
                      onChange={e=>updateDraft('notes',e.target.value)}
                      rows={12} placeholder="Private DM notes about this NPC…" />
                  </>
                : <div className="nm-dm-empty-inline">No public notes available.</div>
              }
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="nm-dm-footer">
          {isDM && (
            <>
              <button className="nm-dm-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? '⏳ Saving…' : '💾 Save Changes'}
              </button>
              {delConfirm ? (
                <div className="nm-dm-del-confirm">
                  <span>Delete &ldquo;{npc.name}&rdquo;?</span>
                  <button className="nm-dm-del-yes" onClick={()=>onDelete(npc)}>Yes, Delete</button>
                  <button className="nm-dm-del-no"  onClick={()=>setDelConfirm(false)}>Cancel</button>
                </div>
              ) : (
                <button className="nm-dm-del-btn" onClick={()=>setDelConfirm(true)}>🗑 Delete</button>
              )}
            </>
          )}
          <button className="nm-dm-close-btn" onClick={onClose}>✕ Close</button>
        </div>
      </div>
    </div>
  );
}

// ── AI Generate Modal (3-step wizard) ────────────────────────────────────────

function GenerateNPCModal({ campaignId, onClose, onCreated }) {
  const [step,       setStep]       = useState(1);
  const [params,     setParams]     = useState({ powerLevel:'standard', race:'Human', charClass:'Fighter', gender:'Male', alignment:'TN' });
  const [rolledStats,setRolledStats]= useState(null);
  const [level,      setLevel]      = useState(null);
  const [aiResult,   setAiResult]   = useState(null);
  const [generating, setGenerating] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [aiError,    setAiError]    = useState('');

  const updateParam = (k,v) => setParams(p=>({...p,[k]:v}));

  const doRollStats = () => {
    setRolledStats(rollStats(params.powerLevel));
    setLevel(rollLevel(params.powerLevel));
    setStep(2);
  };

  const doGenerate = async () => {
    setGenerating(true); setAiError('');
    try {
      const resp = await api.generateContent('npc_create', campaignId, { ...params, level, stats: rolledStats });
      setAiResult(resp.result);
      setStep(3);
    } catch(e) { setAiError(e.message || 'AI generation failed'); }
    setGenerating(false);
  };

  const doCreate = async () => {
    if (!aiResult) return;
    setCreating(true); setAiError('');
    try {
      const loot = aiResult.loot ?? rollLoot(params.powerLevel);
      const npc = await api.createNpc({
        campaign_id: campaignId,
        name: aiResult.name || 'Unnamed NPC',
        is_hidden: true,
        data: {
          race: params.race, charClass: params.charClass, gender: params.gender,
          alignment: params.alignment, level, powerLevel: params.powerLevel,
          stats: rolledStats,
          background:  aiResult.background  || '',
          personality: Array.isArray(aiResult.personality) ? aiResult.personality : [],
          equipment:   Array.isArray(aiResult.equipment)   ? aiResult.equipment   : [],
          loot: { pp: loot.pp||0, gp: loot.gp||0, sp: loot.sp||0, cp: loot.cp||0, items: loot.items||[] },
          notes: '',
        },
      });
      onCreated(npc);
    } catch(e) { setAiError(e.message || 'Failed to create NPC'); }
    setCreating(false);
  };

  const pl = plInfo(params.powerLevel);

  return (
    <div className="nm-backdrop" onClick={onClose}>
      <div className="nm-gen-modal" onClick={e=>e.stopPropagation()}>
        <span className="nm-corner nm-corner--tl" aria-hidden="true" />
        <span className="nm-corner nm-corner--tr" aria-hidden="true" />
        <span className="nm-corner nm-corner--bl" aria-hidden="true" />
        <span className="nm-corner nm-corner--br" aria-hidden="true" />

        <div className="nm-gen-header">
          <div className="nm-gen-title">✦ AI NPC Generator</div>
          <div className="nm-gen-steps-bar">
            {['Parameters','Stats Roll','Preview'].map((s,i) => (
              <span key={i} className={`nm-gen-step ${step===i+1?'nm-gen-step--active':''} ${step>i+1?'nm-gen-step--done':''}`}>
                {step>i+1?'✓':(i+1)} {s}
              </span>
            ))}
          </div>
        </div>

        {/* ── Step 1: Parameters ── */}
        {step===1 && (
          <div className="nm-gen-body">
            <div className="nm-gen-section">Power Level</div>
            <div className="nm-gen-pl-row">
              {POWER_LEVELS.map(p => (
                <button key={p.id}
                  className={`nm-gen-pl-btn ${params.powerLevel===p.id?'nm-gen-pl-btn--active':''}`}
                  style={{ '--pl-color': p.color }}
                  onClick={()=>updateParam('powerLevel',p.id)}>
                  <div className="nm-gen-pl-icon">{p.icon}</div>
                  <div>{p.label}</div>
                </button>
              ))}
            </div>
            <div className="nm-gen-fields">
              {[
                { label:'Race',      key:'race',      options:RACES.map(r=>({v:r,l:r})) },
                { label:'Class',     key:'charClass', options:CLASSES.map(c=>({v:c,l:c})) },
                { label:'Gender',    key:'gender',    options:[{v:'Male',l:'Male'},{v:'Female',l:'Female'},{v:'Other',l:'Other'}] },
                { label:'Alignment', key:'alignment', options:ALIGNMENTS.map(a=>({v:a.id,l:a.label})) },
              ].map(f=>(
                <div key={f.key} className="nm-gen-field">
                  <label className="nm-gen-field-label">{f.label}</label>
                  <select className="nm-gen-field-select" value={params[f.key]}
                    onChange={e=>updateParam(f.key,e.target.value)}>
                    {f.options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="nm-gen-footer">
              <button className="nm-gen-primary-btn" onClick={doRollStats}>Roll Stats →</button>
              <button className="nm-gen-cancel-btn"  onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}

        {/* ── Step 2: Stats Roll ── */}
        {step===2 && rolledStats && (
          <div className="nm-gen-body">
            <div className="nm-gen-section">
              Rolled Stats —&nbsp;<span style={{color:pl.color}}>{pl.icon} {pl.label}</span>
              <span className="nm-gen-level-tag">Level {level}</span>
            </div>
            <div className="nm-gen-stats-grid">
              {['str','dex','con','int','wis','cha'].map(s => (
                <div key={s} className="nm-gen-stat-cell">
                  <div className="nm-gen-stat-label">{s.toUpperCase()}</div>
                  <div className="nm-gen-stat-val" style={{color:statCol(rolledStats[s])}}>{rolledStats[s]}</div>
                </div>
              ))}
            </div>
            {aiError && <div className="nm-gen-error">{aiError}</div>}
            <div className="nm-gen-footer">
              <button className="nm-gen-reroll-btn" onClick={doRollStats}>🎲 Re-roll</button>
              <button className="nm-gen-primary-btn" onClick={doGenerate} disabled={generating}>
                {generating ? '⏳ Generating…' : '✦ Generate NPC →'}
              </button>
              <button className="nm-gen-cancel-btn" onClick={()=>setStep(1)}>← Back</button>
            </div>
          </div>
        )}

        {/* ── Step 3: Preview ── */}
        {step===3 && aiResult && (
          <div className="nm-gen-body">
            <div className="nm-gen-section">Preview — Edit before saving</div>
            <div className="nm-gen-preview">
              <input className="nm-gen-preview-name"
                value={aiResult.name??''} onChange={e=>setAiResult(r=>({...r,name:e.target.value}))}
                placeholder="NPC name…" />
              <label className="nm-gen-preview-label">Background</label>
              <textarea className="nm-gen-preview-textarea"
                value={aiResult.background??''} onChange={e=>setAiResult(r=>({...r,background:e.target.value}))}
                rows={4} />
              <label className="nm-gen-preview-label">Personality Traits</label>
              <div className="nm-gen-preview-traits">
                {(aiResult.personality??[]).map((t,i)=>(
                  <span key={i} className="nm-gen-preview-trait">{t}
                    <button onClick={()=>setAiResult(r=>({...r,personality:r.personality.filter((_,j)=>j!==i)}))}>×</button>
                  </span>
                ))}
              </div>
              <label className="nm-gen-preview-label">Equipment</label>
              <div className="nm-gen-preview-equip">
                {(aiResult.equipment??[]).map((item,i)=>(
                  <span key={i} className="nm-gen-preview-equip-item">⚔ {item}
                    <button onClick={()=>setAiResult(r=>({...r,equipment:r.equipment.filter((_,j)=>j!==i)}))}>×</button>
                  </span>
                ))}
              </div>
            </div>
            {aiError && <div className="nm-gen-error">{aiError}</div>}
            <div className="nm-gen-footer">
              <button className="nm-gen-create-btn" onClick={doCreate} disabled={creating}>
                {creating ? '⏳ Creating…' : '✔ Create NPC (Hidden)'}
              </button>
              <button className="nm-gen-reroll-btn" onClick={()=>{setAiResult(null);setAiError('');setStep(2);}}>
                ← Re-generate
              </button>
              <button className="nm-gen-cancel-btn" onClick={onClose}>Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Manual Create Modal ───────────────────────────────────────────────────────

function CreateNPCModal({ campaignId, onClose, onCreated }) {
  const [form,    setForm]    = useState({ name:'', race:'Human', charClass:'Fighter', gender:'Male', alignment:'TN', powerLevel:'standard' });
  const [stats,   setStats]   = useState(()=>rollStats('standard'));
  const [level,   setLevel]   = useState(()=>rollLevel('standard'));
  const [creating,setCreating]= useState(false);
  const [error,   setError]   = useState('');

  const update = (k,v) => setForm(p=>({...p,[k]:v}));

  const handlePlChange = (pl) => {
    update('powerLevel', pl);
    setStats(rollStats(pl));
    setLevel(rollLevel(pl));
  };

  const handleCreate = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setCreating(true); setError('');
    try {
      const npc = await api.createNpc({
        campaign_id: campaignId,
        name: form.name.trim(),
        is_hidden: true,
        data: {
          race: form.race, charClass: form.charClass, gender: form.gender,
          alignment: form.alignment, powerLevel: form.powerLevel,
          level, stats, background:'', personality:[], equipment:[], loot:rollLoot(form.powerLevel), notes:'',
        },
      });
      onCreated(npc);
    } catch(e) { setError(e.message||'Failed to create NPC'); }
    setCreating(false);
  };

  return (
    <div className="nm-backdrop" onClick={onClose}>
      <div className="nm-create-modal" onClick={e=>e.stopPropagation()}>
        <span className="nm-corner nm-corner--tl" aria-hidden="true" />
        <span className="nm-corner nm-corner--tr" aria-hidden="true" />
        <span className="nm-corner nm-corner--bl" aria-hidden="true" />
        <span className="nm-corner nm-corner--br" aria-hidden="true" />

        <div className="nm-gen-header">
          <div className="nm-gen-title">+ New NPC</div>
        </div>

        <div className="nm-gen-body">
          <div className="nm-gen-field nm-gen-field--full">
            <label className="nm-gen-field-label">Name *</label>
            <input className="nm-gen-name-input" value={form.name}
              onChange={e=>update('name',e.target.value)} placeholder="NPC name…" />
          </div>

          <div className="nm-gen-section">Power Level</div>
          <div className="nm-gen-pl-row">
            {POWER_LEVELS.map(p=>(
              <button key={p.id}
                className={`nm-gen-pl-btn ${form.powerLevel===p.id?'nm-gen-pl-btn--active':''}`}
                style={{ '--pl-color': p.color }}
                onClick={()=>handlePlChange(p.id)}>
                <div className="nm-gen-pl-icon">{p.icon}</div>
                <div>{p.label}</div>
              </button>
            ))}
          </div>

          <div className="nm-gen-fields">
            {[
              { label:'Race',      key:'race',      options:RACES.map(r=>({v:r,l:r})) },
              { label:'Class',     key:'charClass', options:CLASSES.map(c=>({v:c,l:c})) },
              { label:'Gender',    key:'gender',    options:[{v:'Male',l:'Male'},{v:'Female',l:'Female'},{v:'Other',l:'Other'}] },
              { label:'Alignment', key:'alignment', options:ALIGNMENTS.map(a=>({v:a.id,l:a.label})) },
            ].map(f=>(
              <div key={f.key} className="nm-gen-field">
                <label className="nm-gen-field-label">{f.label}</label>
                <select className="nm-gen-field-select" value={form[f.key]}
                  onChange={e=>update(f.key,e.target.value)}>
                  {f.options.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              </div>
            ))}
          </div>

          <div className="nm-gen-stats-grid">
            {['str','dex','con','int','wis','cha'].map(s=>(
              <div key={s} className="nm-gen-stat-cell">
                <div className="nm-gen-stat-label">{s.toUpperCase()}</div>
                <div className="nm-gen-stat-val" style={{color:statCol(stats[s])}}>{stats[s]}</div>
              </div>
            ))}
          </div>
          <button className="nm-gen-reroll-btn" onClick={()=>{setStats(rollStats(form.powerLevel));setLevel(rollLevel(form.powerLevel));}}>
            🎲 Re-roll Stats
          </button>

          {error && <div className="nm-gen-error">{error}</div>}
          <div className="nm-gen-footer">
            <button className="nm-gen-create-btn" onClick={handleCreate} disabled={creating}>
              {creating ? '⏳ Creating…' : '+ Create NPC (Hidden)'}
            </button>
            <button className="nm-gen-cancel-btn" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NPCManager;
