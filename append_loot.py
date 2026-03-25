import re

code = r"""
// -- Party Loot Tab ------------------------------------------------------------

function PartyLootTab({ campaignId, isDM, characters, initialItems, sectionCard }) {
  const [items,      setItems]      = useState(initialItems ?? []);
  const [error,      setError]      = useState(null);
  const [addOpen,    setAddOpen]    = useState(false);
  const [addName,    setAddName]    = useState('');
  const [addType,    setAddType]    = useState('misc');
  const [addValue,   setAddValue]   = useState('');
  const [addNotes,   setAddNotes]   = useState('');
  const [addWorking, setAddWorking] = useState(false);
  const [assigning,  setAssigning]  = useState({});
  const [assignTo,   setAssignTo]   = useState({});

  const refresh = () =>
    api.getPartyEquipment(campaignId)
      .then(d => setItems(Array.isArray(d) ? d : []))
      .catch(() => {});

  async function cycleIdentify(item) {
    if (!isDM) return;
    const next = ID_STATES[(ID_STATES.indexOf(item.identify_state ?? 'unknown') + 1) % ID_STATES.length];
    try {
      await api.updatePartyEquipment(item.id, { identify_state: next });
      setItems(prev => prev.map(x => x.id === item.id ? { ...x, identify_state: next } : x));
    } catch (e) { setError(e.message); }
  }

  async function handleRemove(itemId) {
    if (!isDM) return;
    try {
      await api.deletePartyEquipment(itemId);
      setItems(prev => prev.filter(x => x.id !== itemId));
    } catch (e) { setError(e.message); }
  }

  async function handleAssign(itemId) {
    const charId = assignTo[itemId];
    if (!charId || !isDM) return;
    setAssigning(m => ({ ...m, [itemId]: true }));
    setError(null);
    try {
      await api.assignPartyEquipment(itemId, parseInt(charId));
      setItems(prev => prev.filter(x => x.id !== itemId));
      setAssignTo(m => { const n = { ...m }; delete n[itemId]; return n; });
    } catch (e) { setError(e.message); }
    finally { setAssigning(m => ({ ...m, [itemId]: false })); }
  }

  async function handleAdd(e) {
    e.preventDefault();
    if (!addName.trim()) return;
    setAddWorking(true);
    setError(null);
    try {
      await api.createPartyEquipment({
        campaign_id: campaignId,
        name:        addName.trim(),
        item_type:   addType,
        value_gp:    parseFloat(addValue) || 0,
        notes:       addNotes,
      });
      setAddName(''); setAddType('misc'); setAddValue(''); setAddNotes('');
      setAddOpen(false);
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setAddWorking(false); }
  }

  const LOOT_GROUPS = [
    { key: 'scroll',     label: 'Scrolls' },
    { key: 'potion',     label: 'Potions' },
    { key: 'weapon',     label: 'Weapons' },
    { key: 'armor',      label: 'Armor' },
    { key: 'magic_item', label: 'Magic Items' },
    { key: 'wand',       label: 'Wands' },
    { key: 'ring',       label: 'Rings' },
    { key: 'treasure',   label: 'Treasure' },
    { key: 'mundane',    label: 'Mundane' },
    { key: 'misc',       label: 'Misc' },
  ];

  const grouped = {};
  items.forEach(item => {
    const key = item.item_type ?? 'misc';
    (grouped[key] = grouped[key] || []).push(item);
  });

  const totalValue = items
    .filter(i => i.identify_state === 'identified' && (i.value_gp ?? 0) > 0)
    .reduce((sum, i) => sum + (i.value_gp ?? 0), 0);

  const inpSt = {
    fontSize: 12, background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
    borderRadius: 4, padding: '4px 8px', color: C.text, fontFamily: ff, outline: 'none',
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: C.textDim }}>
          {items.length} item{items.length !== 1 ? 's' : ''}
          {totalValue > 0 && (
            <span style={{ marginLeft: 10, color: C.amber }}>
              {totalValue.toLocaleString()} gp identified
            </span>
          )}
        </div>
        {isDM && (
          <button onClick={() => setAddOpen(o => !o)} style={{
            fontSize: 11, padding: '5px 12px', borderRadius: 5, cursor: 'pointer',
            background: 'rgba(212,160,53,.08)', border: `1px solid ${C.border}`,
            color: C.gold, fontFamily: ff,
          }}>{addOpen ? 'Cancel' : 'Add Item'}</button>
        )}
      </div>

      {error && (
        <div style={{ fontSize: 11, color: '#e08080', marginBottom: 10,
          background: 'rgba(200,50,50,.12)', border: '1px solid rgba(200,50,50,.3)',
          borderRadius: 5, padding: '6px 10px' }}>
          {error}
        </div>
      )}

      {addOpen && isDM && (
        <form onSubmit={handleAdd} style={{ ...sectionCard, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input required placeholder="Item name" value={addName}
              onChange={e => setAddName(e.target.value)}
              style={{ ...inpSt, flex: '1 1 160px' }} />
            <select value={addType} onChange={e => setAddType(e.target.value)} style={inpSt}>
              {['weapon','armor','shield','magic_item','potion','scroll','wand','ring','treasure','mundane','misc'].map(t => (
                <option key={t} value={t}>{capitalize(t.replace(/_/g,' '))}</option>
              ))}
            </select>
            <input type="number" min={0} step={0.01} placeholder="Value gp"
              value={addValue} onChange={e => setAddValue(e.target.value)}
              style={{ ...inpSt, width: 90 }} />
            <input placeholder="Notes" value={addNotes}
              onChange={e => setAddNotes(e.target.value)}
              style={{ ...inpSt, flex: '1 1 120px' }} />
            <button type="submit" disabled={addWorking} style={{
              fontSize: 11, padding: '5px 14px', borderRadius: 4, cursor: addWorking ? 'not-allowed' : 'pointer',
              background: 'rgba(212,160,53,.15)', border: `1px solid ${C.borderHi}`,
              color: C.gold, fontFamily: ff, opacity: addWorking ? 0.5 : 1,
            }}>{addWorking ? 'Adding...' : 'Add'}</button>
          </div>
        </form>
      )}

      {items.length === 0 ? (
        <EmptyState icon="treasure" msg="No items in the party loot pool." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {LOOT_GROUPS.filter(g => grouped[g.key] && grouped[g.key].length).map(g => (
            <div key={g.key}>
              <div style={{ fontSize: 9, color: C.gold, letterSpacing: 2, textTransform: 'uppercase',
                marginBottom: 6, paddingBottom: 4, borderBottom: `1px solid ${C.border}` }}>
                {g.label}
              </div>
              {grouped[g.key].map(item => (
                <div key={item.id} style={{
                  ...sectionCard, display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 10px', marginBottom: 5,
                }}>
                  <span title={ID_LABELS[item.identify_state ?? 'unknown']}>
                    {ID_ICONS[item.identify_state ?? 'unknown']}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 12, color: C.text }}>
                      {item.name}
                    </span>
                    {(item.value_gp ?? 0) > 0 && item.identify_state === 'identified' && (
                      <span style={{ fontSize: 10, color: C.amber, marginLeft: 8 }}>
                        {item.value_gp.toLocaleString()} gp
                      </span>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: 10, color: C.textDim }}>{item.notes}</div>
                    )}
                  </div>

                  {isDM && (
                    <button onClick={() => cycleIdentify(item)} title="Cycle identification"
                      style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                        background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, color: C.textDim }}>
                      ID
                    </button>
                  )}

                  {isDM && characters.length > 0 && (
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <select
                        value={assignTo[item.id] ?? ''}
                        onChange={e => setAssignTo(m => ({ ...m, [item.id]: e.target.value }))}
                        style={{ ...inpSt, fontSize: 10, padding: '2px 6px' }}
                      >
                        <option value="">Give to...</option>
                        {characters.map(c => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      {assignTo[item.id] && (
                        <button onClick={() => handleAssign(item.id)} disabled={assigning[item.id]}
                          style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4,
                            cursor: assigning[item.id] ? 'not-allowed' : 'pointer',
                            background: 'rgba(109,190,136,.1)', border: '1px solid rgba(109,190,136,.35)',
                            color: '#6dbe88', fontFamily: ff, opacity: assigning[item.id] ? 0.5 : 1 }}>
                          {assigning[item.id] ? '...' : 'Give'}
                        </button>
                      )}
                    </div>
                  )}

                  {isDM && (
                    <button onClick={() => handleRemove(item.id)} title="Remove from pool"
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                        background: 'rgba(200,50,50,.08)', border: '1px solid rgba(200,50,50,.25)',
                        color: '#c47070', fontFamily: ff }}>
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
"""

with open(r'C:/DnD_manager_app/Version_1/src/components/partyhub/PartyHub.jsx', 'a', encoding='utf-8') as f:
    f.write(code)
print("Done - appended PartyLootTab")
