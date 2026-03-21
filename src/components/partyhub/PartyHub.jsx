/**
 * Party Knowledge — aggregated read-only overview of all campaign data.
 * DM: sees everything + can toggle character visibility.
 * Players: see only revealed / party-visible items.
 *
 * Tabs: 👥 Characters | 🗺️ Maps | 📜 Quests | 👹 Encounters | 👤 NPCs
 */
import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';

const TABS = [
  { id: 'characters', icon: '👥', label: 'Characters' },
  { id: 'maps',       icon: '🗺️', label: 'Maps' },
  { id: 'quests',     icon: '📜', label: 'Quests' },
  { id: 'encounters', icon: '👹', label: 'Encounters' },
  { id: 'npcs',       icon: '👤', label: 'NPCs' },
];

const DIFF_COLOR = { Easy: C.green, Medium: C.gold, Hard: C.amber, Deadly: C.red };

const ff = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

// ── Small shared components ────────────────────────────────────────────────────

function VisibilityBadge({ visibility, onToggle }) {
  const isParty = (visibility ?? 'party') === 'party';
  return (
    <button
      onClick={onToggle}
      title={isParty ? 'Click to hide from party' : 'Click to reveal to party'}
      style={{
        fontSize: 10, borderRadius: 10, padding: '2px 10px', cursor: 'pointer',
        border: `1px solid ${isParty ? 'rgba(109,190,136,.5)' : C.border}`,
        background: isParty ? 'rgba(109,190,136,.12)' : 'rgba(0,0,0,.3)',
        color: isParty ? C.green : C.textDim,
        fontFamily: ff, transition: 'all .1s',
      }}
    >
      {isParty ? '👁 Party' : '🔒 DM Only'}
    </button>
  );
}

function NavBtn({ onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, background: 'rgba(212,160,53,.08)', border: `1px solid ${C.border}`,
        borderRadius: 5, padding: '5px 16px', cursor: 'pointer',
        color: C.gold, fontFamily: ff,
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = C.borderHi; e.currentTarget.style.background = 'rgba(212,160,53,.2)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = C.border;   e.currentTarget.style.background = 'rgba(212,160,53,.08)'; }}
    >
      {children}
    </button>
  );
}

function EmptyState({ icon, msg }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: C.textDim, fontSize: 13, fontStyle: 'italic' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      {msg}
    </div>
  );
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PartyHub({ campaign, user, onBack, onNavigate }) {
  const [tab,         setTab]         = useState('characters');
  const [data,        setData]        = useState({ characters: [], maps: [], quests: [], encounters: [], npcs: [] });
  const [savedEncs,   setSavedEncs]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);

  const isDM       = campaign.dm_user_id === user.id;
  const campaignId = campaign.id;

  // Load all data in parallel
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.allSettled([
      api.getCharacters(campaignId),
      api.getMaps(campaignId),
      api.getQuests(campaignId),
      api.getEncounters(campaignId),
      api.getNpcs(campaignId),
      api.getSavedEncounters(campaignId),
    ]).then(([chars, maps, quests, encounters, npcs, saved]) => {
      if (cancelled) return;
      setData({
        characters: chars.status      === 'fulfilled' ? (chars.value      ?? []) : [],
        maps:       maps.status       === 'fulfilled' ? (maps.value       ?? []) : [],
        quests:     quests.status     === 'fulfilled' ? (quests.value     ?? []) : [],
        encounters: encounters.status === 'fulfilled' ? (encounters.value ?? []) : [],
        npcs:       npcs.status       === 'fulfilled' ? (npcs.value       ?? []) : [],
      });
      setSavedEncs(saved.status === 'fulfilled' ? (saved.value ?? []) : []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Toggle character visibility (DM only)
  async function toggleCharVis(charId, current) {
    const next = (current ?? 'party') === 'party' ? 'dm_only' : 'party';
    try {
      await api.setCharacterVisibility(charId, next);
      setData(d => ({
        ...d,
        characters: d.characters.map(c => c.id === charId ? { ...c, visibility: next } : c),
      }));
    } catch (e) { console.error('Visibility toggle:', e); }
  }

  const sectionCard = {
    background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '12px 16px',
  };

  const tabStyle = (active) => ({
    background: active ? 'rgba(212,160,53,.15)' : 'transparent',
    border: `1px solid ${active ? C.gold : C.border}`,
    borderRadius: 6, padding: '7px 18px', cursor: 'pointer',
    color: active ? C.gold : C.textDim, fontFamily: ff, fontSize: 12,
    transition: 'all .12s', display: 'flex', alignItems: 'center', gap: 6,
  });

  // What players see — filter characters to party-visible only
  const visibleChars = isDM
    ? data.characters
    : data.characters.filter(c => (c.visibility ?? 'party') === 'party');

  const counts = {
    characters: visibleChars.length,
    maps:       data.maps.length,
    quests:     data.quests.length,
    encounters: data.encounters.length,
    npcs:       data.npcs.length,
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: ff }}>

      {/* ── Header ── */}
      <header style={{
        background: 'linear-gradient(180deg,#1c1408,#130f05)',
        borderBottom: `2px solid ${C.borderHi}`,
        padding: '16px 28px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(0,0,0,.35)', border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '5px 12px', color: C.textDim,
          cursor: 'pointer', fontFamily: ff, fontSize: 11,
        }}
          onMouseEnter={e => { e.target.style.color = C.gold; e.target.style.borderColor = C.borderHi; }}
          onMouseLeave={e => { e.target.style.color = C.textDim; e.target.style.borderColor = C.border; }}>
          ‹ Dashboard
        </button>

        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: C.textDim, textTransform: 'uppercase' }}>
            {campaign.name}
          </div>
          <div style={{ fontSize: 22, color: C.gold, fontWeight: 'bold' }}>
            📖 Party Knowledge
          </div>
        </div>

        {isDM && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, color: C.amber,
            background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '3px 12px',
          }}>
            ⚔ DM View — use 👁 / 🔒 to control what players see
          </span>
        )}
      </header>

      {/* ── Tab bar ── */}
      <div style={{
        background: 'rgba(0,0,0,.3)', borderBottom: `1px solid ${C.border}`,
        padding: '8px 28px', display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
            <span style={{ fontSize: 10, color: tab === t.id ? C.goldDim : C.textDim }}>
              ({counts[t.id] ?? 0})
            </span>
          </button>
        ))}
      </div>

      {/* ── Content ── */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {loading && (
          <div style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 60 }}>
            Loading Party Knowledge…
          </div>
        )}
        {error && (
          <div style={{
            background: 'rgba(200,50,50,.15)', border: `1px solid rgba(200,50,50,.4)`,
            borderRadius: 7, padding: '12px 16px', color: '#e08080', fontSize: 12,
          }}>
            ⚠ {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {tab === 'characters' && (
              <CharactersTab
                characters={visibleChars}
                allChars={data.characters}
                isDM={isDM}
                onToggleVis={toggleCharVis}
                onOpenModule={() => onNavigate?.('characters')}
                sectionCard={sectionCard}
              />
            )}
            {tab === 'maps' && (
              <MapsTab
                maps={data.maps}
                onOpenModule={() => onNavigate?.('maps')}
                sectionCard={sectionCard}
              />
            )}
            {tab === 'quests' && (
              <QuestsTab
                quests={data.quests}
                isDM={isDM}
                onOpenModule={() => onNavigate?.('quests')}
                sectionCard={sectionCard}
              />
            )}
            {tab === 'encounters' && (
              <EncountersTab
                encounters={data.encounters}
                savedEncs={savedEncs}
                setSavedEncs={setSavedEncs}
                isDM={isDM}
                onOpenModule={() => onNavigate?.('monsters')}
                sectionCard={sectionCard}
              />
            )}
            {tab === 'npcs' && (
              <NpcsTab
                npcs={data.npcs}
                isDM={isDM}
                onOpenModule={() => onNavigate?.('npcs')}
                sectionCard={sectionCard}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Characters Tab ─────────────────────────────────────────────────────────────

function CharactersTab({ characters, allChars, isDM, onToggleVis, onOpenModule, sectionCard }) {
  const hiddenCount = isDM
    ? allChars.filter(c => (c.visibility ?? 'party') !== 'party').length
    : 0;

  if (!characters.length) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <NavBtn onClick={onOpenModule}>Open Character Builder →</NavBtn>
        </div>
        <EmptyState icon="🧙" msg={isDM ? 'No characters in this campaign yet.' : 'No characters have been shared with the party yet.'} />
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {characters.length} character{characters.length !== 1 ? 's' : ''}
          {isDM && hiddenCount > 0 && (
            <span style={{ marginLeft: 8, color: C.amber }}>· {hiddenCount} hidden from party</span>
          )}
        </div>
        <NavBtn onClick={onOpenModule}>Open Character Builder →</NavBtn>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {characters.map(char => {
          const cd      = char.character_data ?? {};
          const portrait  = cd.portrait_url ?? null;
          const raceName  = cd.raceId  ? capitalize(String(cd.raceId))  : null;
          const className = cd.classId ? capitalize(String(cd.classId)) : null;
          const level     = cd.charLevel ?? null;
          const isHidden  = (char.visibility ?? 'party') !== 'party';

          return (
            <div key={char.id} style={{
              ...sectionCard,
              border: `1px solid ${isHidden && isDM ? 'rgba(200,80,30,.4)' : C.border}`,
              opacity: isHidden && isDM ? 0.72 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                {portrait ? (
                  <img src={portrait} alt="" style={{
                    width: 52, height: 52, borderRadius: 6, objectFit: 'cover',
                    border: `1px solid ${C.border}`, flexShrink: 0,
                  }} />
                ) : (
                  <div style={{
                    width: 52, height: 52, borderRadius: 6, flexShrink: 0,
                    background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                  }}>🧙</div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, color: C.gold, fontWeight: 'bold', marginBottom: 2 }}>
                    {char.name}
                  </div>
                  <div style={{ fontSize: 11, color: C.textDim }}>
                    {[raceName, className, level ? `Level ${level}` : null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                {isDM && (
                  <VisibilityBadge
                    visibility={char.visibility ?? 'party'}
                    onToggle={() => onToggleVis(char.id, char.visibility ?? 'party')}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Maps Tab ──────────────────────────────────────────────────────────────────

function MapsTab({ maps, onOpenModule, sectionCard }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>{maps.length} map{maps.length !== 1 ? 's' : ''}</div>
        <NavBtn onClick={onOpenModule}>Open Maps →</NavBtn>
      </div>
      {!maps.length ? (
        <EmptyState icon="🗺️" msg="No maps in this campaign yet." />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {maps.map(m => (
            <div key={m.id} style={sectionCard}>
              {m.image_url ? (
                <img src={m.image_url} alt={m.name} style={{
                  width: '100%', height: 110, objectFit: 'cover',
                  borderRadius: 4, marginBottom: 8, border: `1px solid ${C.border}`,
                }} />
              ) : (
                <div style={{
                  width: '100%', height: 80, borderRadius: 4, marginBottom: 8,
                  background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
                }}>🗺️</div>
              )}
              <div style={{ fontSize: 13, color: C.text, fontWeight: 'bold', marginBottom: 2 }}>{m.name}</div>
              {m.type && (
                <div style={{ fontSize: 10, color: C.textDim, textTransform: 'uppercase', letterSpacing: 1 }}>
                  {m.type}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Quests Tab ────────────────────────────────────────────────────────────────

function QuestsTab({ quests, isDM, onOpenModule, sectionCard }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>{quests.length} quest{quests.length !== 1 ? 's' : ''}</div>
        <NavBtn onClick={onOpenModule}>Open Quests →</NavBtn>
      </div>
      {!quests.length ? (
        <EmptyState icon="📜" msg={isDM ? 'No quests yet. Create them in the Quests module.' : 'No quests have been shared with the party yet.'} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {quests.map(q => {
            const d = q.data ?? {};
            const statusColor = d.status === 'completed' ? C.green : d.status === 'failed' ? C.red : C.textDim;
            return (
              <div key={q.id} style={sectionCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: d.description || d.reward ? 6 : 0 }}>
                  <span style={{ fontSize: 14, color: C.gold, fontWeight: 'bold', flex: 1 }}>{q.title}</span>
                  {d.status && (
                    <span style={{
                      fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
                      border: `1px solid ${statusColor}`, color: statusColor, textTransform: 'uppercase',
                    }}>{d.status}</span>
                  )}
                </div>
                {d.description && (
                  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
                    {d.description.length > 200 ? d.description.slice(0, 200) + '…' : d.description}
                  </div>
                )}
                {d.reward && (
                  <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>💰 {d.reward}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Encounters Tab ────────────────────────────────────────────────────────────

function hpColor(pct) {
  if (pct <= 0)   return '#555';       // dead — grey
  if (pct <= 0.25) return C.red;       // critical
  if (pct <= 0.5)  return C.amber;     // bloodied
  return C.green;                       // healthy
}

function hpLabel(pct) {
  if (pct <= 0)    return 'Dead';
  if (pct <= 0.25) return 'Critical';
  if (pct <= 0.5)  return 'Bloodied';
  return 'Alive';
}

function FightManager({ enc, onEncounterUpdate }) {
  const [creatures,    setCreatures]    = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [adjusting,    setAdjusting]    = useState({});  // cId → true while saving
  const [expanded,     setExpanded]     = useState(false);

  async function load() {
    if (loading) return;
    setLoading(true);
    try {
      const list = await api.getEncounterCreatures(enc.id);
      setCreatures(list ?? []);
    } catch (e) {
      console.error('Load creatures:', e);
      setCreatures([]);
    }
    setLoading(false);
  }

  function toggle() {
    if (!expanded && creatures === null) load();
    setExpanded(v => !v);
  }

  async function adjustHp(creature, delta) {
    const newHp = Math.max(0, Math.min(creature.max_hp, creature.current_hp + delta));
    if (newHp === creature.current_hp) return;
    setAdjusting(a => ({ ...a, [creature.id]: true }));
    try {
      await api.updateCreatureHp(enc.id, creature.id, newHp);
      setCreatures(cs => cs.map(c => c.id === creature.id
        ? { ...c, current_hp: newHp, status: newHp <= 0 ? 'dead'
            : newHp <= Math.ceil(c.max_hp * 0.25) ? 'critical'
            : newHp <= Math.ceil(c.max_hp * 0.50) ? 'bloodied' : 'alive' }
        : c));
    } catch (e) { console.error('HP update:', e); }
    setAdjusting(a => ({ ...a, [creature.id]: false }));
  }

  async function killAll() {
    if (!creatures) return;
    const alive = creatures.filter(c => c.current_hp > 0);
    await Promise.all(alive.map(c => adjustHp(c, -c.current_hp)));
  }

  async function resetAll() {
    if (!creatures) return;
    const notFull = creatures.filter(c => c.current_hp < c.max_hp);
    await Promise.all(notFull.map(c => adjustHp(c, c.max_hp - c.current_hp)));
  }

  async function markDone() {
    try {
      await api.updateSavedEncounter(enc.id, { status: 'completed' });
      onEncounterUpdate(enc.id, { status: 'completed' });
    } catch (e) { console.error('Mark done:', e); }
  }

  const isActive    = enc.status !== 'completed';
  const aliveCount  = creatures ? creatures.filter(c => c.current_hp > 0).length : '?';
  const totalCount  = creatures ? creatures.length : '?';

  return (
    <div style={{
      background: 'rgba(0,0,0,.35)',
      border: `1px solid ${isActive ? C.borderHi : C.border}`,
      borderRadius: 8, overflow: 'hidden',
    }}>
      {/* Header row — always visible */}
      <div
        onClick={toggle}
        style={{
          padding: '10px 14px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 10,
          background: isActive ? 'rgba(212,160,53,.07)' : 'rgba(0,0,0,.2)',
        }}
      >
        <span style={{ fontSize: 13, color: C.gold, fontWeight: 'bold', flex: 1 }}>
          {isActive ? '⚔ ' : '✅ '}{enc.title}
        </span>
        {enc.difficulty && (
          <span style={{
            fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
            border: `1px solid ${DIFF_COLOR[enc.difficulty] ?? C.border}`,
            color: DIFF_COLOR[enc.difficulty] ?? C.textDim, textTransform: 'uppercase',
          }}>{enc.difficulty}</span>
        )}
        {enc.total_xp > 0 && (
          <span style={{ fontSize: 10, color: C.gold }}>{enc.total_xp.toLocaleString()} XP</span>
        )}
        <span style={{ fontSize: 10, color: C.textDim }}>
          {creatures !== null ? `${aliveCount}/${totalCount} alive` : ''}
        </span>
        <span style={{ fontSize: 12, color: C.textDim }}>{expanded ? '▲' : '▼'}</span>
      </div>

      {/* Fight manager body */}
      {expanded && (
        <div style={{ padding: '12px 14px', borderTop: `1px solid ${C.border}` }}>
          {loading && (
            <div style={{ color: C.textDim, fontSize: 12, textAlign: 'center', padding: 20 }}>
              Loading creatures…
            </div>
          )}

          {!loading && creatures !== null && (
            <>
              {/* Control buttons */}
              {isActive && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                  <button onClick={killAll} style={{
                    fontSize: 11, padding: '4px 14px', borderRadius: 5, cursor: 'pointer',
                    background: 'rgba(180,50,50,.15)', border: `1px solid rgba(180,50,50,.4)`,
                    color: C.red, fontFamily: ff,
                  }}>💀 Kill All</button>
                  <button onClick={resetAll} style={{
                    fontSize: 11, padding: '4px 14px', borderRadius: 5, cursor: 'pointer',
                    background: 'rgba(80,160,80,.1)', border: `1px solid rgba(80,160,80,.3)`,
                    color: C.green, fontFamily: ff,
                  }}>❤ Reset All HP</button>
                  <button onClick={markDone} style={{
                    fontSize: 11, padding: '4px 14px', borderRadius: 5, cursor: 'pointer',
                    background: 'rgba(212,160,53,.1)', border: `1px solid ${C.border}`,
                    color: C.gold, fontFamily: ff,
                  }}>✅ Mark Completed</button>
                </div>
              )}

              {/* Creature rows */}
              {creatures.length === 0 && (
                <div style={{ color: C.textDim, fontSize: 12, textAlign: 'center', padding: 16 }}>
                  No creatures found.
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {creatures.map(c => {
                  const pct  = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
                  const col  = hpColor(pct);
                  const lbl  = hpLabel(pct);
                  const busy = adjusting[c.id];
                  return (
                    <div key={c.id} style={{
                      background: 'rgba(0,0,0,.25)', border: `1px solid ${C.border}`,
                      borderRadius: 6, padding: '8px 12px',
                      opacity: c.current_hp <= 0 ? 0.5 : 1,
                      transition: 'opacity .2s',
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: c.current_hp > 0 ? C.text : C.textDim, flex: 1, fontWeight: 'bold' }}>
                          {c.monster_name}
                        </span>
                        <span style={{
                          fontSize: 9, letterSpacing: 1, padding: '1px 7px', borderRadius: 10,
                          border: `1px solid ${col}`, color: col, textTransform: 'uppercase',
                        }}>{lbl}</span>
                        <span style={{ fontSize: 11, color: col, minWidth: 52, textAlign: 'right' }}>
                          {c.current_hp} / {c.max_hp}
                        </span>
                        {/* HP buttons */}
                        {isActive && (
                          <div style={{ display: 'flex', gap: 4 }}>
                            {[-10,-5,-1].map(d => (
                              <button key={d} disabled={busy || c.current_hp <= 0} onClick={() => adjustHp(c, d)}
                                style={{
                                  width: 28, height: 22, borderRadius: 4, cursor: busy ? 'wait' : 'pointer',
                                  background: 'rgba(180,50,50,.15)', border: `1px solid rgba(180,50,50,.35)`,
                                  color: C.red, fontSize: 10, fontWeight: 'bold',
                                  opacity: busy || c.current_hp <= 0 ? 0.4 : 1,
                                }}>{d}</button>
                            ))}
                            {[1,5,10].map(d => (
                              <button key={d} disabled={busy || c.current_hp >= c.max_hp} onClick={() => adjustHp(c, d)}
                                style={{
                                  width: 28, height: 22, borderRadius: 4, cursor: busy ? 'wait' : 'pointer',
                                  background: 'rgba(80,160,80,.1)', border: `1px solid rgba(80,160,80,.3)`,
                                  color: C.green, fontSize: 10, fontWeight: 'bold',
                                  opacity: busy || c.current_hp >= c.max_hp ? 0.4 : 1,
                                }}>+{d}</button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* HP bar */}
                      <div style={{
                        height: 6, background: 'rgba(0,0,0,.4)',
                        borderRadius: 3, overflow: 'hidden',
                      }}>
                        <div style={{
                          height: '100%', width: `${Math.max(0, pct * 100)}%`,
                          background: col, borderRadius: 3, transition: 'width .25s, background .25s',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* AI / Official loot if completed */}
              {enc.loot_ai && (
                <div style={{ marginTop: 12, background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, borderRadius: 6, padding: '10px 12px' }}>
                  <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>AI Loot</div>
                  <pre style={{ fontSize: 11, color: C.text, margin: 0, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{enc.loot_ai}</pre>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function EncountersTab({ encounters, savedEncs, setSavedEncs, isDM, onOpenModule, sectionCard }) {
  function handleEncUpdate(id, patch) {
    setSavedEncs(list => list.map(e => e.id === id ? { ...e, ...patch } : e));
  }

  const activeEncs    = savedEncs.filter(e => e.status !== 'completed');
  const completedEncs = savedEncs.filter(e => e.status === 'completed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {encounters.length} planned · {savedEncs.length} fight{savedEncs.length !== 1 ? 's' : ''}
          {activeEncs.length > 0 && (
            <span style={{ marginLeft: 8, color: C.amber }}>· {activeEncs.length} active</span>
          )}
        </div>
        <NavBtn onClick={onOpenModule}>Open Monsters & Encounters →</NavBtn>
      </div>

      {/* ── Active Fight Managers ── */}
      {activeEncs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.amber, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            ⚔ Active Encounters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeEncs.map(enc => (
              <FightManager key={enc.id} enc={enc} onEncounterUpdate={handleEncUpdate} />
            ))}
          </div>
        </div>
      )}

      {/* ── Completed Saved Encounters ── */}
      {completedEncs.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            ✅ Completed Encounters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {completedEncs.map(enc => (
              <FightManager key={enc.id} enc={enc} onEncounterUpdate={handleEncUpdate} />
            ))}
          </div>
        </div>
      )}

      {/* ── Planned (general) Encounters ── */}
      {encounters.length > 0 && (
        <div>
          <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 10 }}>
            📋 Planned Encounters
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {encounters.map(enc => {
              const monsters = Array.isArray(enc.monsters)
                ? enc.monsters
                : (() => { try { return JSON.parse(enc.monsters ?? '[]'); } catch { return []; } })();
              return (
                <div key={enc.id} style={sectionCard}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: monsters.length ? 6 : 0 }}>
                    <span style={{ fontSize: 14, color: C.gold, fontWeight: 'bold', flex: 1 }}>{enc.name}</span>
                    {enc.difficulty && (
                      <span style={{
                        fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
                        border: `1px solid ${DIFF_COLOR[enc.difficulty] ?? C.border}`,
                        color: DIFF_COLOR[enc.difficulty] ?? C.textDim, textTransform: 'uppercase',
                      }}>{enc.difficulty}</span>
                    )}
                    {enc.total_xp > 0 && (
                      <span style={{ fontSize: 10, color: C.gold }}>{enc.total_xp.toLocaleString()} XP</span>
                    )}
                  </div>
                  {monsters.length > 0 && (
                    <div style={{ fontSize: 11, color: C.textDim }}>
                      {monsters.map(m => `${(m.count ?? 1) > 1 ? `${m.count}× ` : ''}${m.name}`).join(', ')}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!encounters.length && !savedEncs.length && (
        <EmptyState icon="👹" msg={isDM ? 'No encounters yet. Build them in Monsters & Encounters.' : 'No encounters have been shared yet.'} />
      )}
    </div>
  );
}

// ── NPCs Tab ──────────────────────────────────────────────────────────────────

function NpcsTab({ npcs, isDM, onOpenModule, sectionCard }) {
  // Backend already filters hidden NPCs for non-DM users
  const hiddenCount = isDM ? npcs.filter(n => n.is_hidden).length : 0;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {npcs.length} NPC{npcs.length !== 1 ? 's' : ''}
          {isDM && hiddenCount > 0 && (
            <span style={{ marginLeft: 8, color: C.amber }}>· {hiddenCount} hidden from party</span>
          )}
        </div>
        <NavBtn onClick={onOpenModule}>Open NPCs →</NavBtn>
      </div>
      {!npcs.length ? (
        <EmptyState icon="👤" msg={isDM ? 'No NPCs yet. Create them in the NPC Manager.' : 'No NPCs have been revealed yet.'} />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {npcs.map(npc => {
            const d       = npc.data ?? (typeof npc.data === 'string' ? JSON.parse(npc.data) : {});
            const portrait = d.portrait ?? null;
            const subLine  = [d.gender, d.race, d.charClass && `${d.charClass}${d.level ? ` Lv${d.level}` : ''}`]
              .filter(Boolean).join(' · ');

            return (
              <div key={npc.id} style={{
                ...sectionCard,
                opacity: npc.is_hidden && isDM ? 0.65 : 1,
                border: `1px solid ${npc.is_hidden && isDM ? 'rgba(200,80,30,.35)' : C.border}`,
              }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  {portrait ? (
                    <img src={portrait} alt="" style={{
                      width: 46, height: 46, borderRadius: 5, objectFit: 'cover',
                      border: `1px solid ${C.border}`, flexShrink: 0,
                    }} />
                  ) : (
                    <div style={{
                      width: 46, height: 46, borderRadius: 5, flexShrink: 0,
                      background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
                    }}>🎭</div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: C.gold, fontWeight: 'bold', marginBottom: 2 }}>
                      {npc.name}
                      {isDM && npc.is_hidden && (
                        <span style={{ fontSize: 9, color: C.amber, marginLeft: 6 }}>🔒 hidden</span>
                      )}
                    </div>
                    {subLine && <div style={{ fontSize: 11, color: C.textDim }}>{subLine}</div>}
                    {d.alignment && <div style={{ fontSize: 10, color: C.textDim, marginTop: 1 }}>{d.alignment}</div>}
                  </div>
                </div>
                {d.description && (
                  <div style={{ fontSize: 11, color: C.textDim, marginTop: 8, lineHeight: 1.5 }}>
                    {d.description.length > 120 ? d.description.slice(0, 120) + '…' : d.description}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
