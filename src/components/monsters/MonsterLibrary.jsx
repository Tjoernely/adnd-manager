import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { MonsterCard }     from './MonsterCard.jsx';
import { MonsterDetail }   from './MonsterDetail.jsx';
import EncounterBuilder    from './EncounterBuilder.jsx';
import { TagFilterPanel }  from '../Encounters/TagFilterPanel.tsx';

const PAGE_SIZE = 50;

export default function MonsterLibrary({ campaignId, onBack }) {
  const [tab,         setTab]        = useState('library');  // 'library' | 'encounter'
  const [allMonsters, setAllMonsters] = useState([]);          // full 3781-monster set
  const [filtered,    setFiltered]   = useState([]);          // post TagFilterPanel
  const [page,        setPage]       = useState(1);            // client-side now
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState(null);
  const [selected,    setSelected]   = useState(null);
  const [meta,        setMeta]       = useState(null);

  // Bulk-load every monster once on mount. v6 TagFilterPanel does live tag
  // filtering in memory — paged server queries would defeat the design.
  // ~3-5 MB JSON. Server cap raised 200 → 5000 to support this.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getMonstersMeta().then(setMeta).catch(() => {});
    api.searchMonsters({
      limit: 5000,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
      .then(result => {
        if (cancelled) return;
        const list = result.monsters ?? [];
        setAllMonsters(list);
        setFiltered(list);                  // initial: no filters → everything
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Reset to page 1 when the filtered set shrinks/grows
  useEffect(() => { setPage(1); }, [filtered.length]);

  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Client-side page slice from the post-filter list
  const monsters   = useMemo(
    () => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [filtered, page],
  );

  const headerStyle = {
    display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16,
    borderBottom: `2px solid ${C.borderHi}`, paddingBottom: 12,
  };

  const tabStyle = (active) => ({
    background: active ? 'rgba(212,160,53,.15)' : 'transparent',
    border: `1px solid ${active ? C.gold : C.border}`,
    borderRadius: 6, padding: '6px 16px', cursor: 'pointer',
    color: active ? C.gold : C.textDim, fontFamily: 'inherit', fontSize: 12,
    transition: 'all .12s',
  });

  return (
    <div style={{
      minHeight: '100vh',
      background: C.bg,
      color: C.text,
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    }}>
      {/* ── Header ─────────────────────────────────────────── */}
      <header style={{
        background: 'linear-gradient(180deg,#1c1408,#130f05)',
        borderBottom: `2px solid ${C.borderHi}`,
        padding: '16px 28px',
        display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      }}>
        <button onClick={onBack} style={{
          background: 'rgba(0,0,0,.35)', border: `1px solid ${C.border}`,
          borderRadius: 6, padding: '5px 12px', color: C.textDim,
          cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
        }}
          onMouseEnter={e => { e.target.style.color = C.gold; e.target.style.borderColor = C.borderHi; }}
          onMouseLeave={e => { e.target.style.color = C.textDim; e.target.style.borderColor = C.border; }}>
          ‹ Dashboard
        </button>

        <div>
          <div style={{ fontSize: 10, letterSpacing: 4, color: C.textDim, textTransform: 'uppercase' }}>
            AD&amp;D 2E ✦ Skills &amp; Powers
          </div>
          <div style={{ fontSize: 22, color: C.gold, fontWeight: 'bold' }}>
            ⚔️ Monsters &amp; Encounters
          </div>
        </div>

        {meta && (
          <span style={{
            marginLeft: 'auto', fontSize: 11, color: C.textDim,
            background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '3px 12px',
          }}>
            {meta.total.toLocaleString()} monsters
          </span>
        )}
      </header>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(0,0,0,.3)', borderBottom: `1px solid ${C.border}`,
        padding: '8px 28px', display: 'flex', gap: 8,
      }}>
        <button style={tabStyle(tab === 'library')}   onClick={() => setTab('library')}>
          📖 Monster Library
        </button>
        <button style={tabStyle(tab === 'encounter')} onClick={() => setTab('encounter')}>
          ⚔️ Encounter Builder
        </button>
      </div>

      {/* ── Library Tab ────────────────────────────────────── */}
      {tab === 'library' && (
        <div style={{ display: 'flex', maxWidth: 1400, margin: '0 auto', padding: '20px 20px', gap: 20 }}>

          {/* Left: v6 TagFilterPanel — operates over the full monster set in memory.
              Replaces the previous MonsterFilters sidebar (HD/AC ranges + sort
              are not yet ported; tag-based filtering covers the common cases). */}
          <div style={{ width: 280, flexShrink: 0 }}>
            <TagFilterPanel
              storageKey="library"
              monsters={allMonsters}
              onFilteredChange={setFiltered}
            />
          </div>

          {/* Center: monster list */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Toolbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: 12, color: C.textDim }}>
                {loading ? 'Loading…' : `${total.toLocaleString()} result${total !== 1 ? 's' : ''}`}
              </span>
              {total > PAGE_SIZE && (
                <span style={{ fontSize: 11, color: C.textDim, marginLeft: 'auto' }}>
                  Page {page} / {totalPages}
                </span>
              )}
            </div>

            {error && (
              <div style={{
                background: 'rgba(200,50,50,.15)', border: `1px solid rgba(200,50,50,.4)`,
                borderRadius: 6, padding: '10px 14px', color: '#e08080', fontSize: 12, marginBottom: 12,
              }}>
                ⚠ {error}
              </div>
            )}

            {/* Monster grid */}
            {!loading && monsters.length === 0 && !error && (
              <div style={{
                textAlign: 'center', padding: '60px 20px',
                color: C.textDim, fontSize: 13, fontStyle: 'italic',
              }}>
                {allMonsters.length === 0
                  ? 'No monsters in the library yet. Run npm run import:monsters in the server folder to populate.'
                  : 'No monsters match the current filters.'}
              </div>
            )}

            <div style={{
              display: 'grid',
              gridTemplateColumns: selected ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}>
              {monsters.map(m => (
                <MonsterCard
                  key={m.id}
                  monster={m}
                  selected={selected?.id === m.id}
                  onClick={() => setSelected(prev => prev?.id === m.id ? null : m)}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 8,
                marginTop: 24, flexWrap: 'wrap',
              }}>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={{
                    background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: '5px 14px', color: page <= 1 ? C.textDim : C.text,
                    cursor: page <= 1 ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12,
                  }}>
                  ‹ Prev
                </button>
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  const pg = page <= 4 ? i + 1 : page - 3 + i;
                  if (pg < 1 || pg > totalPages) return null;
                  return (
                    <button key={pg} onClick={() => setPage(pg)} style={{
                      background: pg === page ? 'rgba(212,160,53,.2)' : 'rgba(0,0,0,.3)',
                      border: `1px solid ${pg === page ? C.gold : C.border}`,
                      borderRadius: 5, padding: '5px 12px',
                      color: pg === page ? C.gold : C.text,
                      cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                    }}>{pg}</button>
                  );
                })}
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  style={{
                    background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
                    borderRadius: 5, padding: '5px 14px', color: page >= totalPages ? C.textDim : C.text,
                    cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontFamily: 'inherit', fontSize: 12,
                  }}>
                  Next ›
                </button>
              </div>
            )}
          </div>

          {/* Right: monster detail panel */}
          {selected && (
            <div style={{ width: 380, flexShrink: 0 }}>
              <MonsterDetail
                monsterId={selected.id}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      )}

      {/* ── Encounter Builder Tab ───────────────────────────── */}
      {tab === 'encounter' && (
        <div style={{ maxWidth: 1000, margin: '30px auto', padding: '0 20px' }}>
          <EncounterBuilder campaignId={campaignId} />
        </div>
      )}
    </div>
  );
}
