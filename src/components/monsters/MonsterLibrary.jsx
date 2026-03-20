import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { MonsterCard }    from './MonsterCard.jsx';
import { MonsterDetail }  from './MonsterDetail.jsx';
import { MonsterFilters } from './MonsterFilters.jsx';
import EncounterBuilder   from './EncounterBuilder.jsx';

const PAGE_SIZE = 50;

const EMPTY_FILTERS = {
  search: '', type: '', size: '', frequency: '',
  hd_min: '', hd_max: '', alignment: '', min_ac: '', max_ac: '',
  sort: 'name_asc',
};

export default function MonsterLibrary({ campaignId, onBack }) {
  const [tab,        setTab]        = useState('library');  // 'library' | 'encounter'
  const [filters,    setFilters]    = useState(EMPTY_FILTERS);
  const [monsters,   setMonsters]   = useState([]);
  const [total,      setTotal]      = useState(0);
  const [page,       setPage]       = useState(1);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [selected,   setSelected]   = useState(null);  // monster for detail panel
  const [meta,       setMeta]       = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  const searchTimer = useRef(null);

  // Load meta on mount
  useEffect(() => {
    api.getMonstersMeta().then(setMeta).catch(() => {});
  }, []);

  // Load monsters whenever filters or page changes (debounce search)
  const loadMonsters = useCallback(async (f, p) => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        ...(f.search    ? { search:    f.search }    : {}),
        ...(f.type      ? { type:      f.type }      : {}),
        ...(f.size      ? { size:      f.size }      : {}),
        ...(f.frequency ? { frequency: f.frequency } : {}),
        ...(f.alignment ? { alignment: f.alignment } : {}),
        ...(f.hd_min    ? { hd_min:    f.hd_min }    : {}),
        ...(f.hd_max    ? { hd_max:    f.hd_max }    : {}),
        ...(f.min_ac    ? { min_ac:    f.min_ac }    : {}),
        ...(f.max_ac    ? { max_ac:    f.max_ac }    : {}),
        ...(f.sort      ? { sort:      f.sort }      : {}),
        ...(campaignId  ? { campaign_id: campaignId } : {}),
        limit: PAGE_SIZE,
        page:  p,
      };
      const result = await api.searchMonsters(params);
      setMonsters(result.monsters ?? []);
      setTotal(result.total ?? 0);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Debounce filter changes
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setPage(1);
      loadMonsters(filters, 1);
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [filters, loadMonsters]);

  // Page change
  useEffect(() => {
    loadMonsters(filters, page);
  }, [page]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

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

          {/* Left: filters (desktop sidebar / mobile collapsible) */}
          <div style={{ width: 220, flexShrink: 0 }}>
            <button
              onClick={() => setShowFilters(v => !v)}
              style={{
                display: 'none', // hidden on desktop, shown on mobile via media — we'll just always show it
                marginBottom: 8, background: 'transparent',
                border: `1px solid ${C.border}`, borderRadius: 5, padding: '5px 12px',
                color: C.textDim, fontFamily: 'inherit', fontSize: 11, cursor: 'pointer',
              }}>
              {showFilters ? '▲ Hide Filters' : '▼ Show Filters'}
            </button>
            <MonsterFilters filters={filters} onChange={f => { setFilters(f); setPage(1); }} meta={meta} />
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
                {total === 0 && !filters.search && !filters.type && !filters.size && !filters.frequency
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
