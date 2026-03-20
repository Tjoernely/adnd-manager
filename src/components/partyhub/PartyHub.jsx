/**
 * Party Hub — aggregated view of campaign data.
 * DM: sees all + can toggle visibility / manage inventory / add notes.
 * Players: see only revealed (visibility='party') items.
 *
 * Tabs: 👥 Party | 📜 Quests | 🎒 Inventory | ⚔️ Encounters | 📖 Knowledge
 */
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';

const TABS = [
  { id: 'party',      icon: '👥', label: 'Party' },
  { id: 'quests',     icon: '📜', label: 'Quests' },
  { id: 'inventory',  icon: '🎒', label: 'Inventory' },
  { id: 'encounters', icon: '⚔️', label: 'Encounters' },
  { id: 'knowledge',  icon: '📖', label: 'Knowledge' },
];

const ITEM_TYPES = ['mundane', 'armor', 'weapon', 'potion', 'scroll', 'wondrous', 'gold', 'other'];

const DIFF_COLOR = { Easy: C.green, Medium: C.gold, Hard: C.amber, Deadly: C.red };

// ── Helpers ──────────────────────────────────────────────────────────────────

function parseJSON(v) {
  if (!v) return {};
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return {}; }
}

function VisibilityBadge({ visibility, onToggle, isDM }) {
  const isParty = (visibility ?? 'dm_only') === 'party';
  if (!isDM) {
    return isParty
      ? <span style={{ fontSize: 10, color: C.green, background: 'rgba(109,190,136,.12)', border: `1px solid rgba(109,190,136,.3)`, borderRadius: 10, padding: '1px 8px' }}>👁 Visible</span>
      : null;
  }
  return (
    <button onClick={onToggle} title={isParty ? 'Click to hide from party' : 'Click to reveal to party'} style={{
      fontSize: 10, borderRadius: 10, padding: '2px 10px', cursor: 'pointer',
      border: `1px solid ${isParty ? 'rgba(109,190,136,.5)' : C.border}`,
      background: isParty ? 'rgba(109,190,136,.12)' : 'rgba(0,0,0,.3)',
      color: isParty ? C.green : C.textDim,
      fontFamily: 'inherit', transition: 'all .1s',
    }}>
      {isParty ? '👁 Party' : '🔒 DM Only'}
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PartyHub({ campaign, user, onBack }) {
  const [tab,     setTab]     = useState('party');
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  const isDM = campaign.dm_user_id === user.id;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api.getPartyHub(campaign.id);
      setData(d);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaign.id]);

  useEffect(() => { load(); }, [load]);

  // ── Visibility toggle ──────────────────────────────────────────────────────
  async function toggleVisibility(type, id, current) {
    const next = (current ?? 'dm_only') === 'party' ? 'dm_only' : 'party';
    try {
      if (type === 'quest')     await api.setQuestVisibility(id, next);
      if (type === 'encounter') await api.setEncounterVisibility(id, next);
      if (type === 'character') await api.setCharacterVisibility(id, next);
      if (type === 'knowledge') await api.setKnowledgeVisibility(id, next === 'party' ? ['all'] : []);
      load();
    } catch (e) { console.error('Visibility toggle:', e); }
  }

  // ── Shared styles ──────────────────────────────────────────────────────────
  const ff = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

  const sectionCard = {
    background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
    borderRadius: 8, padding: '12px 16px', marginBottom: 10,
  };

  const tabStyle = (active) => ({
    background: active ? 'rgba(212,160,53,.15)' : 'transparent',
    border: `1px solid ${active ? C.gold : C.border}`,
    borderRadius: 6, padding: '7px 18px', cursor: 'pointer',
    color: active ? C.gold : C.textDim, fontFamily: ff, fontSize: 12,
    transition: 'all .12s',
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text, fontFamily: ff,
    }}>
      {/* Header */}
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
            📖 Party Hub
          </div>
        </div>

        {isDM && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, color: C.amber,
            background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '3px 12px',
          }}>
            ⚔ DM View — toggle visibility with 🔒 / 👁 buttons
          </span>
        )}
      </header>

      {/* Tab bar */}
      <div style={{
        background: 'rgba(0,0,0,.3)', borderBottom: `1px solid ${C.border}`,
        padding: '8px 28px', display: 'flex', gap: 8, flexWrap: 'wrap',
      }}>
        {TABS.map(t => (
          <button key={t.id} style={tabStyle(tab === t.id)} onClick={() => setTab(t.id)}>
            {t.icon} {t.label}
            {data && (
              <span style={{ fontSize: 10, color: tab === t.id ? C.goldDim : C.textDim, marginLeft: 6 }}>
                ({
                  t.id === 'party'      ? data.characters?.length :
                  t.id === 'quests'     ? data.quests?.length :
                  t.id === 'inventory'  ? data.inventory?.length :
                  t.id === 'encounters' ? data.encounters?.length :
                  data.knowledge?.length
                })
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Main content */}
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 20px' }}>
        {loading && (
          <div style={{ color: C.textDim, fontSize: 13, textAlign: 'center', padding: 60 }}>
            Loading Party Hub…
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

        {!loading && !error && data && (
          <>
            {tab === 'party'      && <PartyTab      data={data} isDM={isDM} onToggle={toggleVisibility} reload={load} sectionCard={sectionCard} campaign={campaign} />}
            {tab === 'quests'     && <QuestsTab     data={data} isDM={isDM} onToggle={toggleVisibility} sectionCard={sectionCard} />}
            {tab === 'inventory'  && <InventoryTab  data={data} isDM={isDM} reload={load} sectionCard={sectionCard} campaign={campaign} />}
            {tab === 'encounters' && <EncountersTab data={data} isDM={isDM} onToggle={toggleVisibility} sectionCard={sectionCard} />}
            {tab === 'knowledge'  && <KnowledgeTab  data={data} isDM={isDM} onToggle={toggleVisibility} reload={load} sectionCard={sectionCard} campaign={campaign} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Party Tab ─────────────────────────────────────────────────────────────────

function PartyTab({ data, isDM, onToggle, reload, sectionCard, campaign }) {
  const [dmNotesId,  setDmNotesId]  = useState(null);
  const [dmNotesVal, setDmNotesVal] = useState('');
  const [saving,     setSaving]     = useState(false);

  async function saveDmNotes(charId) {
    setSaving(true);
    try {
      await api.setCharacterDmNotes(charId, dmNotesVal);
      setDmNotesId(null);
      reload();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  if (!data.characters?.length) {
    return <EmptyState icon="🧙" msg="No characters in this campaign yet." />;
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
      {data.characters.map(char => {
        const cd = char.character_data ?? {};
        const raceName  = cd.raceId  ? capitalize(String(cd.raceId))  : null;
        const className = cd.classId ? capitalize(String(cd.classId)) : null;
        const level     = cd.charLevel ?? '?';
        const portrait  = cd.portrait_url ?? null;

        return (
          <div key={char.id} style={{
            ...sectionCard,
            border: `1px solid ${char.is_own ? C.borderHi : C.border}`,
          }}>
            {/* Name + visibility */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
              {portrait && (
                <img src={portrait} alt="" style={{
                  width: 52, height: 52, borderRadius: 6, objectFit: 'cover',
                  border: `1px solid ${C.border}`, flexShrink: 0,
                }} />
              )}
              {!portrait && (
                <div style={{
                  width: 52, height: 52, borderRadius: 6, flexShrink: 0,
                  background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22,
                }}>🧙</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15, color: C.gold, fontWeight: 'bold', marginBottom: 2 }}>
                  {char.name}
                  {char.is_own && <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>(you)</span>}
                </div>
                <div style={{ fontSize: 11, color: C.textDim }}>
                  {[raceName, className, level ? `Level ${level}` : null].filter(Boolean).join(' · ')}
                </div>
              </div>
              <VisibilityBadge
                visibility={char.visibility}
                isDM={isDM}
                onToggle={() => onToggle('character', char.id, char.visibility)}
              />
            </div>

            {/* DM notes */}
            {isDM && (
              dmNotesId === char.id ? (
                <div style={{ marginTop: 8 }}>
                  <textarea
                    value={dmNotesVal}
                    onChange={e => setDmNotesVal(e.target.value)}
                    rows={3}
                    placeholder="Secret DM notes for this character…"
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'vertical',
                      background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                      borderRadius: 5, padding: '6px 10px', color: C.text,
                      fontFamily: 'inherit', fontSize: 11, outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button onClick={() => saveDmNotes(char.id)} disabled={saving} style={{
                      background: 'rgba(212,160,53,.2)', border: `1px solid ${C.gold}`,
                      borderRadius: 5, padding: '4px 14px', cursor: 'pointer',
                      color: C.gold, fontFamily: 'inherit', fontSize: 11,
                    }}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button onClick={() => setDmNotesId(null)} style={{
                      background: 'none', border: `1px solid ${C.border}`,
                      borderRadius: 5, padding: '4px 10px', cursor: 'pointer',
                      color: C.textDim, fontFamily: 'inherit', fontSize: 11,
                    }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setDmNotesId(char.id); setDmNotesVal(char.dm_notes ?? ''); }}
                  style={{
                    marginTop: 6, background: 'none', border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: '3px 10px', cursor: 'pointer',
                    color: C.textDim, fontFamily: 'inherit', fontSize: 10,
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  📝 {char.dm_notes ? 'DM Notes ✓' : 'Add DM Notes'}
                </button>
              )
            )}

            {/* Show DM notes to DM (read mode) */}
            {isDM && char.dm_notes && dmNotesId !== char.id && (
              <div style={{
                marginTop: 8, fontSize: 11, color: C.amber, fontStyle: 'italic',
                background: 'rgba(176,120,48,.06)', border: `1px solid rgba(176,120,48,.2)`,
                borderRadius: 5, padding: '5px 8px',
              }}>
                📝 {char.dm_notes}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Quests Tab ────────────────────────────────────────────────────────────────

function QuestsTab({ data, isDM, onToggle, sectionCard }) {
  if (!data.quests?.length) {
    return <EmptyState icon="📜" msg={isDM ? 'No quests yet. Create quests in the Quests module.' : 'No quests have been revealed yet.'} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.quests.map(q => {
        const d = q.data ?? {};
        return (
          <div key={q.id} style={sectionCard}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, color: C.gold, fontWeight: 'bold' }}>{q.title}</span>
                  {d.status && (
                    <span style={{
                      fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
                      border: `1px solid ${d.status === 'completed' ? C.green : d.status === 'failed' ? C.red : C.border}`,
                      color: d.status === 'completed' ? C.green : d.status === 'failed' ? C.red : C.textDim,
                      textTransform: 'uppercase',
                    }}>
                      {d.status}
                    </span>
                  )}
                </div>
                {d.description && (
                  <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.6 }}>
                    {d.description}
                  </div>
                )}
                {d.reward && (
                  <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
                    💰 Reward: {d.reward}
                  </div>
                )}
              </div>
              <VisibilityBadge
                visibility={q.visibility}
                isDM={isDM}
                onToggle={() => onToggle('quest', q.id, q.visibility)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Inventory Tab ─────────────────────────────────────────────────────────────

function InventoryTab({ data, isDM, reload, sectionCard, campaign }) {
  const [showAdd, setShowAdd] = useState(false);
  const [form,    setForm]    = useState({ name: '', description: '', quantity: 1, value_gp: '', item_type: 'mundane', source: '', notes: '' });
  const [saving,  setSaving]  = useState(false);

  async function addItem() {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await api.createInventoryItem({
        ...form,
        campaign_id: campaign.id,
        value_gp: form.value_gp !== '' ? Number(form.value_gp) : null,
        quantity: Number(form.quantity) || 1,
      });
      setForm({ name: '', description: '', quantity: 1, value_gp: '', item_type: 'mundane', source: '', notes: '' });
      setShowAdd(false);
      reload();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function deleteItem(id) {
    try { await api.deleteInventoryItem(id); reload(); }
    catch (e) { console.error(e); }
  }

  async function updateQty(item, delta) {
    const newQty = Math.max(0, (item.quantity ?? 1) + delta);
    try { await api.updateInventoryItem(item.id, { quantity: newQty }); reload(); }
    catch (e) { console.error(e); }
  }

  const inputStyle = {
    background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 5,
    padding: '5px 10px', color: C.text, fontFamily: 'inherit', fontSize: 12,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const gold = (data.inventory ?? []).filter(i => i.item_type === 'gold').reduce((s, i) => s + (i.value_gp ?? 0) * (i.quantity ?? 1), 0);
  const items = (data.inventory ?? []).filter(i => i.item_type !== 'gold');

  return (
    <div>
      {/* Gold tracker */}
      {gold > 0 && (
        <div style={{
          background: 'rgba(212,160,53,.08)', border: `1px solid ${C.borderHi}`,
          borderRadius: 8, padding: '10px 18px', marginBottom: 14,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <span style={{ fontSize: 22 }}>🪙</span>
          <div>
            <div style={{ fontSize: 18, color: C.gold, fontWeight: 'bold' }}>{gold.toLocaleString()} gp</div>
            <div style={{ fontSize: 10, color: C.textDim, letterSpacing: 1 }}>PARTY GOLD</div>
          </div>
        </div>
      )}

      {items.length === 0 && !isDM && <EmptyState icon="🎒" msg="No items in the party inventory yet." />}

      {items.map(item => (
        <div key={item.id} style={{ ...sectionCard, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 13, color: C.text, fontWeight: 'bold' }}>{item.name}</span>
              <span style={{
                fontSize: 9, color: C.textDim, background: 'rgba(0,0,0,.3)',
                border: `1px solid ${C.border}`, borderRadius: 8, padding: '1px 6px',
                textTransform: 'uppercase', letterSpacing: 1,
              }}>{item.item_type}</span>
              {item.value_gp && <span style={{ fontSize: 10, color: C.gold }}>{item.value_gp} gp</span>}
            </div>
            {item.description && <div style={{ fontSize: 11, color: C.textDim, lineHeight: 1.5 }}>{item.description}</div>}
            {item.awarded_to_character_id && (
              <div style={{ fontSize: 10, color: C.purple, marginTop: 2 }}>
                🎁 Awarded to character #{item.awarded_to_character_id}
              </div>
            )}
          </div>
          {/* Quantity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
            {isDM && <button onClick={() => updateQty(item, -1)} style={{ ...qtyBtnStyle }}>−</button>}
            <span style={{ fontSize: 13, color: C.text, minWidth: 24, textAlign: 'center' }}>×{item.quantity ?? 1}</span>
            {isDM && <button onClick={() => updateQty(item, +1)} style={{ ...qtyBtnStyle }}>+</button>}
            {isDM && (
              <button onClick={() => deleteItem(item.id)} style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: C.textDim, fontSize: 14, padding: '0 2px', marginLeft: 4,
              }}>×</button>
            )}
          </div>
        </div>
      ))}

      {/* Add item form (DM only) */}
      {isDM && (
        <div>
          {!showAdd ? (
            <button onClick={() => setShowAdd(true)} style={{
              background: 'rgba(212,160,53,.1)', border: `1px solid ${C.gold}`,
              borderRadius: 6, padding: '8px 20px', cursor: 'pointer',
              color: C.gold, fontFamily: 'inherit', fontSize: 12, marginTop: 4,
            }}>
              + Add Item
            </button>
          ) : (
            <div style={{
              background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borderHi}`,
              borderRadius: 8, padding: '16px 18px', marginTop: 10,
            }}>
              <div style={{ fontSize: 12, color: C.gold, marginBottom: 12 }}>Add Item to Party Inventory</div>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={lblStyle}>Name *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="Sword of Wounding…" style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Qty</label>
                  <input type="number" min={1} value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                    style={inputStyle} />
                </div>
                <div>
                  <label style={lblStyle}>Value (gp)</label>
                  <input type="number" min={0} value={form.value_gp} onChange={e => setForm(f => ({ ...f, value_gp: e.target.value }))}
                    placeholder="—" style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div>
                  <label style={lblStyle}>Type</label>
                  <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value }))}
                    style={{ ...inputStyle, cursor: 'pointer' }}>
                    {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Source</label>
                  <input value={form.source} onChange={e => setForm(f => ({ ...f, source: e.target.value }))}
                    placeholder="Dragon hoard, shop…" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginBottom: 10 }}>
                <label style={lblStyle}>Description</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  placeholder="Item description…" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={addItem} disabled={saving || !form.name.trim()} style={{
                  background: 'rgba(212,160,53,.2)', border: `1px solid ${C.gold}`,
                  borderRadius: 5, padding: '7px 20px', cursor: 'pointer',
                  color: C.gold, fontFamily: 'inherit', fontSize: 12, fontWeight: 'bold',
                }}>
                  {saving ? 'Adding…' : 'Add Item'}
                </button>
                <button onClick={() => setShowAdd(false)} style={{
                  background: 'none', border: `1px solid ${C.border}`,
                  borderRadius: 5, padding: '7px 14px', cursor: 'pointer',
                  color: C.textDim, fontFamily: 'inherit', fontSize: 12,
                }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Encounters Tab ────────────────────────────────────────────────────────────

function EncountersTab({ data, isDM, onToggle, sectionCard }) {
  if (!data.encounters?.length) {
    return <EmptyState icon="⚔️" msg={isDM ? 'No encounters yet. Build encounters in Monsters & Encounters.' : 'No encounters have been revealed yet.'} />;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.encounters.map(enc => (
        <div key={enc.id} style={sectionCard}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                <span style={{ fontSize: 15, color: C.gold, fontWeight: 'bold' }}>{enc.name}</span>
                {enc.difficulty && (
                  <span style={{
                    fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
                    border: `1px solid ${DIFF_COLOR[enc.difficulty] ?? C.border}`,
                    color: DIFF_COLOR[enc.difficulty] ?? C.textDim,
                    textTransform: 'uppercase',
                  }}>
                    {enc.difficulty}
                  </span>
                )}
                {enc.total_xp > 0 && (
                  <span style={{ fontSize: 10, color: C.gold }}>{enc.total_xp.toLocaleString()} XP</span>
                )}
              </div>
              {enc.monsters?.length > 0 && (
                <div style={{ fontSize: 11, color: C.textDim }}>
                  {enc.monsters.map(m => `${m.count > 1 ? `${m.count}× ` : ''}${m.name}`).join(', ')}
                </div>
              )}
            </div>
            <VisibilityBadge
              visibility={enc.visibility}
              isDM={isDM}
              onToggle={() => onToggle('encounter', enc.id, enc.visibility)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Knowledge Tab ─────────────────────────────────────────────────────────────

function KnowledgeTab({ data, isDM, onToggle, reload, sectionCard, campaign }) {
  const [showAdd,  setShowAdd]  = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody,  setNewBody]  = useState('');
  const [saving,   setSaving]   = useState(false);

  async function addEntry() {
    if (!newTitle.trim()) return;
    setSaving(true);
    try {
      await api.createKnowledge({ campaign_id: campaign.id, title: newTitle.trim(), content: newBody, visible_to: ['all'] });
      setNewTitle(''); setNewBody('');
      setShowAdd(false);
      reload();
    } catch (e) { console.error(e); }
    finally { setSaving(false); }
  }

  async function deleteEntry(id) {
    try { await api.deleteKnowledge(id); reload(); }
    catch (e) { console.error(e); }
  }

  function knowledgeVisible(entry) {
    const vt = Array.isArray(entry.visible_to)
      ? entry.visible_to
      : parseJSON(entry.visible_to) || ['all'];
    return vt.includes('all') ? 'party' : 'dm_only';
  }

  return (
    <div>
      {(!data.knowledge?.length) && (
        <EmptyState icon="📖" msg={isDM ? 'No knowledge entries yet. Add lore and discoveries below.' : 'No lore has been shared with the party yet.'} />
      )}

      {data.knowledge?.map(entry => (
        <div key={entry.id} style={{ ...sectionCard, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, color: C.gold, fontWeight: 'bold', marginBottom: 4 }}>{entry.title}</div>
              {entry.content && (
                <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                  {entry.content}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end', flexShrink: 0 }}>
              <VisibilityBadge
                visibility={knowledgeVisible(entry)}
                isDM={isDM}
                onToggle={() => onToggle('knowledge', entry.id, knowledgeVisible(entry))}
              />
              {isDM && (
                <button onClick={() => deleteEntry(entry.id)} style={{
                  background: 'none', border: `1px solid rgba(200,50,50,.3)`,
                  borderRadius: 5, padding: '2px 8px', cursor: 'pointer',
                  color: '#c05050', fontFamily: 'inherit', fontSize: 10,
                }}>Delete</button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* Add entry (DM only) */}
      {isDM && (
        showAdd ? (
          <div style={{
            background: 'rgba(0,0,0,.3)', border: `1px solid ${C.borderHi}`,
            borderRadius: 8, padding: '16px 18px', marginTop: 10,
          }}>
            <div style={{ fontSize: 12, color: C.gold, marginBottom: 12 }}>New Knowledge Entry</div>
            <input
              value={newTitle} onChange={e => setNewTitle(e.target.value)}
              placeholder="Title…"
              style={{
                width: '100%', boxSizing: 'border-box', marginBottom: 8,
                background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 5,
                padding: '6px 10px', color: C.text, fontFamily: 'inherit', fontSize: 13, outline: 'none',
              }}
            />
            <textarea
              value={newBody} onChange={e => setNewBody(e.target.value)}
              placeholder="Lore, rumor, discovery…"
              rows={4}
              style={{
                width: '100%', boxSizing: 'border-box', resize: 'vertical',
                background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 5,
                padding: '6px 10px', color: C.text, fontFamily: 'inherit', fontSize: 12, outline: 'none',
                marginBottom: 10,
              }}
            />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={addEntry} disabled={saving || !newTitle.trim()} style={{
                background: 'rgba(212,160,53,.2)', border: `1px solid ${C.gold}`,
                borderRadius: 5, padding: '7px 20px', cursor: 'pointer',
                color: C.gold, fontFamily: 'inherit', fontSize: 12, fontWeight: 'bold',
              }}>
                {saving ? 'Saving…' : 'Add Entry'}
              </button>
              <button onClick={() => setShowAdd(false)} style={{
                background: 'none', border: `1px solid ${C.border}`,
                borderRadius: 5, padding: '7px 14px', cursor: 'pointer',
                color: C.textDim, fontFamily: 'inherit', fontSize: 12,
              }}>Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} style={{
            background: 'rgba(212,160,53,.1)', border: `1px solid ${C.gold}`,
            borderRadius: 6, padding: '8px 20px', cursor: 'pointer',
            color: C.gold, fontFamily: 'inherit', fontSize: 12, marginTop: 4,
          }}>
            + Add Knowledge Entry
          </button>
        )
      )}
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

function EmptyState({ icon, msg }) {
  return (
    <div style={{
      textAlign: 'center', padding: '60px 20px',
      color: C.textDim, fontSize: 13, fontStyle: 'italic',
    }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      {msg}
    </div>
  );
}

const qtyBtnStyle = {
  background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
  borderRadius: 4, width: 22, height: 22, cursor: 'pointer',
  color: C.textDim, fontFamily: 'inherit', fontSize: 14, lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const lblStyle = {
  fontSize: 9, letterSpacing: 2, color: C.textDim,
  textTransform: 'uppercase', display: 'block', marginBottom: 4,
};

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}
