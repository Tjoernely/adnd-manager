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
  if (pct <= 0)    return '#555';
  if (pct <= 0.25) return C.red;
  if (pct <= 0.5)  return C.amber;
  return C.green;
}

function hpLabel(pct) {
  if (pct <= 0)    return 'Dead';
  if (pct <= 0.25) return 'Critical';
  if (pct <= 0.5)  return 'Bloodied';
  return 'Alive';
}

// ── Sort creatures: alive sorted by chosen key, dead always last ─────────────
function sortCreatures(list, by) {
  const alive = list.filter(c => c.current_hp > 0);
  const dead  = list.filter(c => c.current_hp <= 0);
  alive.sort((a, b) => {
    if (by === 'initiative') return (b.initiative ?? 0) - (a.initiative ?? 0);
    if (by === 'hp_pct') {
      const pa = a.max_hp > 0 ? a.current_hp / a.max_hp : 0;
      const pb = b.max_hp > 0 ? b.current_hp / b.max_hp : 0;
      return pb - pa;
    }
    if (by === 'name')   return (a.monster_name ?? '').localeCompare(b.monster_name ?? '');
    if (by === 'status') {
      const o = { alive: 0, bloodied: 1, critical: 2 };
      return (o[a.status] ?? 0) - (o[b.status] ?? 0);
    }
    return 0;
  });
  return [...alive, ...dead];
}

// ── Full Combat Manager (right pane) ─────────────────────────────────────────
function CombatManager({ enc, onEncounterUpdate, onCreaturesUpdate, isDM }) {
  const [creatures,  setCreatures]  = useState(enc.creatures ?? []);
  const [round,      setRound]      = useState(enc.current_round ?? 1);
  const [sortBy,     setSortBy]     = useState('initiative');
  const [savingMap,  setSavingMap]  = useState({});
  const [editHpId,   setEditHpId]   = useState(null);
  const [editHpVal,  setEditHpVal]  = useState('');
  const [roundMsg,   setRoundMsg]   = useState(null);

  // Re-sync when a different encounter is selected
  useEffect(() => {
    setCreatures(enc.creatures ?? []);
    setRound(enc.current_round ?? 1);
    setEditHpId(null);
    setRoundMsg(null);
  }, [enc.id]);

  const computeStatus = (hp, max) =>
    hp <= 0                            ? 'dead'
    : hp <= Math.ceil(max * 0.25)     ? 'critical'
    : hp <= Math.ceil(max * 0.50)     ? 'bloodied'
    : 'alive';

  async function saveCreature(updated) {
    setSavingMap(m => ({ ...m, [updated.id]: 'saving' }));
    try {
      await api.updateCreature(enc.id, updated.id, {
        current_hp: updated.current_hp,
        initiative: updated.initiative,
        status:     updated.status,
      });
      setSavingMap(m => ({ ...m, [updated.id]: 'saved' }));
      setTimeout(() => setSavingMap(m => ({ ...m, [updated.id]: null })), 1500);
    } catch {
      setSavingMap(m => ({ ...m, [updated.id]: null }));
    }
  }

  function applyHpChange(creature, newHp) {
    const clamped = Math.max(0, Math.min(creature.max_hp, newHp));
    const updated = { ...creature, current_hp: clamped, status: computeStatus(clamped, creature.max_hp) };
    const next    = creatures.map(c => c.id === creature.id ? updated : c);
    setCreatures(next);
    onCreaturesUpdate(enc.id, next);
    saveCreature(updated);
  }

  async function nextRound() {
    const newRound = round + 1;
    const next = creatures.map(c => ({
      ...c,
      initiative: c.current_hp > 0 ? Math.floor(Math.random() * 10) + 1 : 0,
    }));
    setCreatures(next);
    onCreaturesUpdate(enc.id, next);
    setRound(newRound);
    setSortBy('initiative');
    setRoundMsg(`Round ${newRound} begins — Initiative rolled!`);
    setTimeout(() => setRoundMsg(null), 3500);
    try { await api.updateSavedEncounter(enc.id, { current_round: newRound }); } catch { /* */ }
    onEncounterUpdate(enc.id, { current_round: newRound });
    for (const c of next) {
      if (c.current_hp > 0) {
        try { await api.updateCreature(enc.id, c.id, { current_hp: c.current_hp, initiative: c.initiative, status: c.status }); } catch { /* */ }
      }
    }
  }

  async function prevRound() {
    const newRound = Math.max(1, round - 1);
    setRound(newRound);
    try { await api.updateSavedEncounter(enc.id, { current_round: newRound }); } catch { /* */ }
    onEncounterUpdate(enc.id, { current_round: newRound });
  }

  async function markComplete() {
    try {
      await api.updateSavedEncounter(enc.id, { status: 'completed' });
      onEncounterUpdate(enc.id, { status: 'completed' });
    } catch { /* */ }
  }

  const isActive      = enc.status !== 'completed';
  const sorted        = sortCreatures(creatures, sortBy);
  const deadXpEarned  = creatures.filter(c => c.current_hp <= 0).reduce((s, c) => s + (c.xp_value ?? 0), 0);

  const sortBtnSt = id => ({
    fontSize: 10, padding: '3px 10px', borderRadius: 4, cursor: 'pointer', fontFamily: ff,
    border:     `1px solid ${sortBy === id ? C.borderHi : C.border}`,
    background: sortBy === id ? 'rgba(212,160,53,.15)' : 'rgba(0,0,0,.2)',
    color:      sortBy === id ? C.gold : C.textDim,
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* ── Header ── */}
      <div style={{
        background: 'rgba(0,0,0,.35)',
        border: `1px solid ${isActive ? C.borderHi : C.border}`,
        borderRadius: 8, padding: '12px 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 15, color: C.gold, fontWeight: 'bold', flex: 1, fontFamily: ff }}>
            {isActive ? '⚔ ' : '✅ '}{enc.title}
          </span>
          {enc.difficulty && (
            <span style={{
              fontSize: 9, letterSpacing: 1, padding: '2px 10px', borderRadius: 10,
              border: `1px solid ${DIFF_COLOR[enc.difficulty] ?? C.border}`,
              color:  DIFF_COLOR[enc.difficulty] ?? C.textDim, textTransform: 'uppercase',
            }}>{enc.difficulty}</span>
          )}
          {enc.terrain && (
            <span style={{ fontSize: 10, color: C.textDim }}>📍 {enc.terrain}</span>
          )}
        </div>

        {/* Round controls */}
        {isActive && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={prevRound} disabled={round <= 1} style={{
              background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, borderRadius: 5,
              padding: '4px 10px', cursor: round <= 1 ? 'not-allowed' : 'pointer',
              color: round <= 1 ? C.textDim : C.text, fontFamily: ff, fontSize: 11,
              opacity: round <= 1 ? 0.4 : 1,
            }}>◀ Prev</button>

            <span style={{ fontSize: 14, color: C.gold, fontWeight: 'bold', fontFamily: ff, minWidth: 80, textAlign: 'center' }}>
              Round {round}
            </span>

            <button onClick={nextRound} style={{
              background: 'rgba(212,160,53,.15)', border: `1px solid ${C.borderHi}`,
              borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
              color: C.gold, fontFamily: ff, fontSize: 11, fontWeight: 'bold',
            }}>Next Round ▶</button>

            {(enc.total_xp ?? 0) > 0 && (
              <span style={{ fontSize: 10, color: C.gold, marginLeft: 'auto' }}>
                {deadXpEarned > 0
                  ? `${deadXpEarned.toLocaleString()} / ${(enc.total_xp ?? 0).toLocaleString()} XP earned`
                  : `${(enc.total_xp ?? 0).toLocaleString()} XP total`}
              </span>
            )}
          </div>
        )}

        {roundMsg && (
          <div style={{
            marginTop: 8, padding: '6px 12px',
            background: 'rgba(212,160,53,.12)', border: `1px solid ${C.borderHi}`,
            borderRadius: 6, fontSize: 12, color: C.gold, fontFamily: ff, fontStyle: 'italic',
          }}>🎲 {roundMsg}</div>
        )}
      </div>

      {/* ── Sort controls ── */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: C.textDim, marginRight: 4 }}>Sort:</span>
        {[['initiative','Initiative'],['hp_pct','HP %'],['name','Name'],['status','Status']].map(([id, lbl]) => (
          <button key={id} onClick={() => setSortBy(id)} style={sortBtnSt(id)}>{lbl}</button>
        ))}
      </div>

      {/* ── Creature list ── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {sorted.map(c => {
          const hpPct   = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
          const col     = hpColor(hpPct);
          const lbl     = hpLabel(hpPct);
          const isDead  = c.current_hp <= 0;
          const saving  = savingMap[c.id];
          const editing = editHpId === c.id;

          return (
            <div key={c.id} style={{
              background: isDead ? 'rgba(0,0,0,.15)' : 'rgba(0,0,0,.3)',
              border: `1px solid ${isDead ? '#333' : C.border}`,
              borderRadius: 7, padding: '10px 12px',
              opacity: isDead ? 0.55 : 1, transition: 'opacity .2s',
            }}>
              {/* Row 1: initiative + name + status badge + save indicator */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 'bold', color: C.gold, minWidth: 24,
                  textAlign: 'center', fontFamily: ff,
                  opacity: c.initiative > 0 ? 1 : 0.3,
                }}>🎲{c.initiative > 0 ? c.initiative : '—'}</span>

                <span style={{ fontSize: 13, color: isDead ? C.textDim : C.text, flex: 1, fontFamily: ff, fontWeight: 'bold' }}>
                  {c.monster_name}
                </span>

                <span style={{
                  fontSize: 9, letterSpacing: 1, padding: '1px 7px', borderRadius: 10,
                  border: `1px solid ${col}`, color: col, textTransform: 'uppercase',
                }}>{lbl}</span>

                {saving === 'saving' && <span style={{ fontSize: 9, color: C.textDim }}>⏳</span>}
                {saving === 'saved'  && <span style={{ fontSize: 9, color: C.green  }}>✓</span>}
              </div>

              {/* Row 2: HP bar */}
              <div style={{ height: 6, background: 'rgba(0,0,0,.4)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                <div style={{
                  height: '100%', width: `${Math.max(0, hpPct * 100)}%`,
                  background: col, borderRadius: 3, transition: 'width .25s, background .25s',
                }} />
              </div>

              {/* Row 3: stat chips + HP controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                {[
                  c.ac    != null && `AC ${c.ac}`,
                  c.thac0 != null && `THAC0 ${c.thac0}`,
                  c.attacks       && `Atk: ${c.attacks}`,
                  c.damage        && `Dmg: ${c.damage}`,
                ].filter(Boolean).map(s => (
                  <span key={s} style={{
                    fontSize: 10, color: C.textDim, background: 'rgba(0,0,0,.25)',
                    borderRadius: 4, padding: '1px 6px',
                  }}>{s}</span>
                ))}

                {isActive && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto', flexWrap: 'wrap' }}>
                    {[-5, -1].map(d => (
                      <button key={d} disabled={isDead}
                        onClick={() => applyHpChange(c, c.current_hp + d)}
                        style={{
                          width: 30, height: 22, borderRadius: 4,
                          cursor: isDead ? 'not-allowed' : 'pointer',
                          background: 'rgba(180,50,50,.18)', border: '1px solid rgba(180,50,50,.4)',
                          color: C.red, fontSize: 10, fontWeight: 'bold',
                          opacity: isDead ? 0.3 : 1,
                        }}>{d}</button>
                    ))}

                    {/* HP value — click to type exact value */}
                    {editing ? (
                      <input
                        autoFocus type="number" min={0} max={c.max_hp}
                        value={editHpVal}
                        onChange={e => setEditHpVal(e.target.value)}
                        onBlur={() => { applyHpChange(c, parseInt(editHpVal, 10) || 0); setEditHpId(null); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter')  { applyHpChange(c, parseInt(editHpVal, 10) || 0); setEditHpId(null); }
                          if (e.key === 'Escape') { setEditHpId(null); }
                        }}
                        style={{
                          width: 50, textAlign: 'center', background: '#0d0903',
                          border: `1px solid ${C.borderHi}`, borderRadius: 4,
                          color: col, fontSize: 11, fontWeight: 'bold', padding: '1px 4px',
                        }}
                      />
                    ) : (
                      <span
                        title="Click to type exact HP"
                        onClick={() => { if (!isDead) { setEditHpId(c.id); setEditHpVal(String(c.current_hp)); } }}
                        style={{
                          fontSize: 11, fontWeight: 'bold', color: col,
                          minWidth: 54, textAlign: 'center', fontFamily: ff,
                          cursor: isDead ? 'default' : 'pointer',
                          borderBottom: isDead ? 'none' : `1px dashed ${col}`,
                        }}
                      >{c.current_hp}/{c.max_hp}</span>
                    )}

                    {[1, 5].map(d => (
                      <button key={d} disabled={c.current_hp >= c.max_hp}
                        onClick={() => applyHpChange(c, c.current_hp + d)}
                        style={{
                          width: 30, height: 22, borderRadius: 4,
                          cursor: c.current_hp >= c.max_hp ? 'not-allowed' : 'pointer',
                          background: 'rgba(80,160,80,.12)', border: '1px solid rgba(80,160,80,.35)',
                          color: C.green, fontSize: 10, fontWeight: 'bold',
                          opacity: c.current_hp >= c.max_hp ? 0.3 : 1,
                        }}>+{d}</button>
                    ))}

                    <button onClick={() => applyHpChange(c, 0)} disabled={isDead}
                      style={{
                        padding: '2px 8px', borderRadius: 4,
                        cursor: isDead ? 'not-allowed' : 'pointer',
                        background: 'rgba(180,50,50,.12)', border: '1px solid rgba(180,50,50,.35)',
                        color: C.red, fontSize: 10, opacity: isDead ? 0.3 : 1,
                      }}>💀</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Saved loot ── */}
      {(enc.loot_ai || enc.loot_official) && (
        <div style={{
          background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 10, color: C.gold, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 8 }}>
            💰 Loot
          </div>
          {enc.loot_ai && (
            <pre style={{
              fontSize: 11, color: C.text, margin: 0,
              whiteSpace: 'pre-wrap', lineHeight: 1.7, fontStyle: 'italic', fontFamily: ff,
            }}>{enc.loot_ai}</pre>
          )}
        </div>
      )}

      {/* ── Complete encounter button ── */}
      {isActive && isDM && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          <button onClick={markComplete} style={{
            padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontFamily: ff, fontSize: 12,
            background: 'rgba(109,190,136,.12)', border: `1px solid rgba(109,190,136,.4)`,
            color: C.green, fontWeight: 'bold',
          }}>✅ Complete Encounter</button>
          {deadXpEarned > 0 && (
            <span style={{ fontSize: 11, color: C.gold, fontFamily: ff }}>
              ⚔ {deadXpEarned.toLocaleString()} XP earned so far
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── EncountersTab: left list + right Combat Manager ───────────────────────────
function EncountersTab({ encounters, savedEncs, setSavedEncs, isDM, onOpenModule, sectionCard }) {
  const [selectedEncId, setSelectedEncId] = useState(null);
  const [collapsedIds,  setCollapsedIds]  = useState(new Set());

  function handleEncUpdate(id, patch) {
    setSavedEncs(list => list.map(e => e.id === id ? { ...e, ...patch } : e));
  }
  function handleCreaturesUpdate(encId, creatures) {
    setSavedEncs(list => list.map(e => e.id === encId ? { ...e, creatures } : e));
  }
  function toggleCollapse(id) {
    setCollapsedIds(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  const selectedEnc   = savedEncs.find(e => e.id === selectedEncId) ?? null;
  const activeEncs    = savedEncs.filter(e => e.status !== 'completed');
  const completedEncs = savedEncs.filter(e => e.status === 'completed');

  function EncListItem({ enc }) {
    const collapsed  = collapsedIds.has(enc.id);
    const isSelected = selectedEncId === enc.id;
    const isActive   = enc.status !== 'completed';
    const creatures  = enc.creatures ?? [];

    return (
      <div style={{
        border: `1px solid ${isSelected ? C.borderHi : C.border}`,
        borderRadius: 7, overflow: 'hidden', marginBottom: 6,
        background: isSelected ? 'rgba(212,160,53,.07)' : 'rgba(0,0,0,.25)',
      }}>
        <div
          onClick={() => setSelectedEncId(isSelected ? null : enc.id)}
          style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <span
            onClick={e => { e.stopPropagation(); toggleCollapse(enc.id); }}
            style={{ fontSize: 11, color: C.textDim, userSelect: 'none', minWidth: 14 }}
          >{collapsed ? '▶' : '▼'}</span>

          <span style={{ fontSize: 12, color: isSelected ? C.gold : C.text, fontWeight: 'bold', flex: 1, fontFamily: ff }}>
            {isActive ? '⚔ ' : '✅ '}{enc.title}
          </span>

          <span style={{
            fontSize: 9, padding: '1px 7px', borderRadius: 10,
            border: `1px solid ${isActive ? C.borderHi : C.border}`,
            color: isActive ? C.amber : C.textDim,
          }}>{isActive ? 'Active' : 'Done'}</span>
        </div>

        {!collapsed && creatures.length > 0 && (
          <div style={{ padding: '4px 12px 8px 34px', borderTop: `1px solid ${C.border}` }}>
            {creatures.map(c => {
              const pct = c.max_hp > 0 ? c.current_hp / c.max_hp : 0;
              const col = hpColor(pct);
              return (
                <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                  <span style={{ color: c.current_hp <= 0 ? C.textDim : C.text, flex: 1 }}>{c.monster_name}</span>
                  <span style={{ color: col, fontFamily: ff }}>{c.current_hp}/{c.max_hp}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Empty state
  if (!savedEncs.length && !encounters.length) {
    return (
      <div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 14 }}>
          <NavBtn onClick={onOpenModule}>Open Monsters & Encounters →</NavBtn>
        </div>
        <EmptyState icon="👹" msg={isDM
          ? 'No fight encounters yet. Build one in Monsters & Encounters, then click "Save Encounter" to track it here.'
          : 'No encounters have been started yet.'} />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── Left pane: encounter list ── */}
      <div style={{ width: 256, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <span style={{ fontSize: 10, color: C.textDim }}>
            {activeEncs.length} active · {completedEncs.length} done
          </span>
          <NavBtn onClick={onOpenModule}>+ New →</NavBtn>
        </div>

        {activeEncs.length > 0 && (
          <>
            <div style={{ fontSize: 9, color: C.amber, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
              ⚔ Active
            </div>
            {activeEncs.map(enc => <EncListItem key={enc.id} enc={enc} />)}
          </>
        )}

        {completedEncs.length > 0 && (
          <>
            <div style={{
              fontSize: 9, color: C.textDim, letterSpacing: 2, textTransform: 'uppercase',
              marginBottom: 6, marginTop: activeEncs.length ? 12 : 0,
            }}>✅ Completed</div>
            {completedEncs.map(enc => <EncListItem key={enc.id} enc={enc} />)}
          </>
        )}
      </div>

      {/* ── Right pane: Combat Manager or prompt ── */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {selectedEnc ? (
          <CombatManager
            key={selectedEnc.id}
            enc={selectedEnc}
            onEncounterUpdate={handleEncUpdate}
            onCreaturesUpdate={handleCreaturesUpdate}
            isDM={isDM}
          />
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            height: 200, color: C.textDim, fontSize: 13, fontStyle: 'italic', fontFamily: ff,
            border: `1px dashed ${C.border}`, borderRadius: 8,
          }}>
            ← Select an encounter to open Combat Manager
          </div>
        )}
      </div>
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
