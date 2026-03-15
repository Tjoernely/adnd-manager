import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import SpellCard     from './SpellCard';
import SpellDetail   from './SpellDetail';
import SpellGenerator from './SpellGenerator';
import './Spells.css';

const PAGE_SIZE = 50;

/**
 * SpellLibrary — full-screen spell browser.
 * Props:
 *   onBack — () => void — returns to campaign dashboard
 */
export default function SpellLibrary({ onBack }) {
  // ── Meta ──────────────────────────────────────────────────────────────────
  const [meta, setMeta]           = useState(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [group,       setGroup]       = useState('');      // '' | 'wizard' | 'priest'
  const [minLevel,    setMinLevel]    = useState('');
  const [maxLevel,    setMaxLevel]    = useState('');
  const [school,      setSchool]      = useState('');
  const [sphere,      setSphere]      = useState('');
  const [source,      setSource]      = useState('');
  const [reversible,  setReversible]  = useState(false);
  const [search,      setSearch]      = useState('');
  const [sort,        setSort]        = useState('name');  // 'name' | 'level'

  // ── Pagination ────────────────────────────────────────────────────────────
  const [offset,      setOffset]      = useState(0);

  // ── Results ───────────────────────────────────────────────────────────────
  const [spells,      setSpells]      = useState([]);
  const [total,       setTotal]       = useState(0);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);

  // ── Detail ────────────────────────────────────────────────────────────────
  const [selected,    setSelected]    = useState(null);    // full spell object
  const [detailLoad,  setDetailLoad]  = useState(false);

  // ── Tab ───────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState('library'); // 'library' | 'generator'

  // ── Sidebar collapse (mobile) ─────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const searchDebounce = useRef(null);

  // ── Load meta once ────────────────────────────────────────────────────────
  useEffect(() => {
    api.getSpellsMeta().then(setMeta).catch(() => {});
  }, []);

  // ── Build filter params ───────────────────────────────────────────────────
  const filterParams = {
    group:      group      || undefined,
    minLevel:   minLevel   || undefined,
    maxLevel:   maxLevel   || undefined,
    school:     school     || undefined,
    sphere:     sphere     || undefined,
    source:     source     || undefined,
    reversible: reversible ? 'true' : undefined,
  };

  // ── Fetch spell list ───────────────────────────────────────────────────────
  const fetchSpells = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchSpells({
        ...filterParams,
        search: search.trim() || undefined,
        sort,
        limit:  PAGE_SIZE,
        offset: off,
      });
      setSpells(res.spells ?? []);
      setTotal(res.total  ?? 0);
      setOffset(off);
    } catch (e) {
      setError(e.message ?? 'Failed to load spells');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, minLevel, maxLevel, school, sphere, source, reversible, search, sort]);

  // Re-fetch when filters/sort change (debounce search)
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => fetchSpells(0), search ? 300 : 0);
    return () => clearTimeout(searchDebounce.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, minLevel, maxLevel, school, sphere, source, reversible, search, sort]);

  // ── Select spell ──────────────────────────────────────────────────────────
  const selectSpell = useCallback(async (spell) => {
    if (selected?.id === spell.id) { setSelected(null); return; }
    setDetailLoad(true);
    setSelected(spell);
    try {
      const full = await api.getSpell(spell.id);
      setSelected(full);
    } catch { /* keep preview */ }
    finally { setDetailLoad(false); }
  }, [selected]);

  // ── Reset filters ─────────────────────────────────────────────────────────
  const resetFilters = () => {
    setGroup('');
    setMinLevel('');
    setMaxLevel('');
    setSchool('');
    setSphere('');
    setSource('');
    setReversible(false);
    setSearch('');
    setSort('name');
  };

  const totalPages    = Math.ceil(total / PAGE_SIZE);
  const currentPage   = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters    = !!(group || minLevel || maxLevel || school || sphere || source || reversible || search);

  const schoolOptions  = meta?.schools  ?? [];
  const sphereOptions  = meta?.spheres  ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sl-screen">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <header className="sl-header">
        <button className="sl-back-btn" onClick={onBack} aria-label="Back">
          ← Back
        </button>
        <h1 className="sl-title">Spell Library</h1>

        {meta && (
          <div className="sl-meta-badges">
            <span className="sl-meta-badge">
              {meta.total.toLocaleString()} spells
            </span>
            <span className="sl-meta-badge sl-meta-badge--wizard">
              {meta.wizard.toLocaleString()} wizard
            </span>
            <span className="sl-meta-badge sl-meta-badge--priest">
              {meta.priest.toLocaleString()} priest
            </span>
          </div>
        )}

        <div className="sl-tabs">
          <button
            className={`sl-tab${tab === 'library'   ? ' sl-tab--active' : ''}`}
            onClick={() => setTab('library')}
          >📚 Library</button>
          <button
            className={`sl-tab${tab === 'generator' ? ' sl-tab--active' : ''}`}
            onClick={() => setTab('generator')}
          >⚄ Generator</button>
        </div>
      </header>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="sl-body">

        {/* ── Filter Sidebar ────────────────────────────────────────────── */}
        <aside className={`sl-sidebar${sidebarOpen ? ' sl-sidebar--open' : ''}`}>
          <div className="sl-sidebar-header">
            <span className="sl-sidebar-title">Filters</span>
            {hasFilters && (
              <button className="sl-clear-btn" onClick={resetFilters}>Clear all</button>
            )}
            <button
              className="sl-sidebar-close"
              onClick={() => setSidebarOpen(false)}
              aria-label="Close filters"
            >✕</button>
          </div>

          {/* Search */}
          <div className="sl-filter-group">
            <label className="sl-filter-label">Search</label>
            <input
              className="sl-filter-input"
              type="text"
              placeholder="Name or description…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Group toggle */}
          <div className="sl-filter-group">
            <label className="sl-filter-label">Group</label>
            <div className="sl-group-btns">
              <button
                className={`sl-group-btn sl-group-btn--all${group === '' ? ' sl-group-btn--active' : ''}`}
                onClick={() => setGroup('')}
              >All</button>
              <button
                className={`sl-group-btn sl-group-btn--wizard${group === 'wizard' ? ' sl-group-btn--active' : ''}`}
                onClick={() => setGroup(g => g === 'wizard' ? '' : 'wizard')}
              >Wizard</button>
              <button
                className={`sl-group-btn sl-group-btn--priest${group === 'priest' ? ' sl-group-btn--active' : ''}`}
                onClick={() => setGroup(g => g === 'priest' ? '' : 'priest')}
              >Priest</button>
            </div>
          </div>

          {/* Level range */}
          <div className="sl-filter-group">
            <label className="sl-filter-label">Level</label>
            <div className="sl-level-range">
              <input
                className="sl-filter-input sl-filter-input--sm"
                type="number"
                min={1} max={9}
                placeholder="Min"
                value={minLevel}
                onChange={e => setMinLevel(e.target.value)}
              />
              <span className="sl-range-sep">–</span>
              <input
                className="sl-filter-input sl-filter-input--sm"
                type="number"
                min={1} max={9}
                placeholder="Max"
                value={maxLevel}
                onChange={e => setMaxLevel(e.target.value)}
              />
            </div>
          </div>

          {/* School (wizard) */}
          {(group === '' || group === 'wizard') && (
            <div className="sl-filter-group">
              <label className="sl-filter-label">School</label>
              {schoolOptions.length > 0 ? (
                <select
                  className="sl-filter-select"
                  value={school}
                  onChange={e => setSchool(e.target.value)}
                >
                  <option value="">Any school</option>
                  {schoolOptions.map(s => (
                    <option key={s} value={s}>{capitalize(s)}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="sl-filter-input"
                  type="text"
                  placeholder="e.g. Evocation"
                  value={school}
                  onChange={e => setSchool(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Sphere (priest) */}
          {(group === '' || group === 'priest') && (
            <div className="sl-filter-group">
              <label className="sl-filter-label">Sphere</label>
              {sphereOptions.length > 0 ? (
                <select
                  className="sl-filter-select"
                  value={sphere}
                  onChange={e => setSphere(e.target.value)}
                >
                  <option value="">Any sphere</option>
                  {sphereOptions.map(s => (
                    <option key={s} value={s}>{capitalize(s)}</option>
                  ))}
                </select>
              ) : (
                <input
                  className="sl-filter-input"
                  type="text"
                  placeholder="e.g. Healing"
                  value={sphere}
                  onChange={e => setSphere(e.target.value)}
                />
              )}
            </div>
          )}

          {/* Source */}
          <div className="sl-filter-group">
            <label className="sl-filter-label">Source</label>
            <input
              className="sl-filter-input"
              type="text"
              placeholder="e.g. PHB, Tome of Magic"
              value={source}
              onChange={e => setSource(e.target.value)}
            />
          </div>

          {/* Reversible */}
          <div className="sl-filter-group sl-filter-group--check">
            <label className="sl-check-label">
              <input
                type="checkbox"
                checked={reversible}
                onChange={e => setReversible(e.target.checked)}
              />
              Reversible only
            </label>
          </div>

          {/* Sort */}
          <div className="sl-filter-group">
            <label className="sl-filter-label">Sort by</label>
            <select
              className="sl-filter-select"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="name">Name</option>
              <option value="level">Level</option>
            </select>
          </div>
        </aside>

        {/* Mobile filter toggle */}
        <button
          className="sl-filter-toggle"
          onClick={() => setSidebarOpen(o => !o)}
          aria-label="Toggle filters"
        >
          ⚙ Filters{hasFilters ? ' •' : ''}
        </button>

        {/* ── Main content ─────────────────────────────────────────────── */}
        <main className="sl-main">

          {/* ── Library Tab ──────────────────────────────────────────────── */}
          {tab === 'library' && (
            <div className="sl-library">
              {/* List panel */}
              <div className="sl-list-panel">
                <div className="sl-list-header">
                  <span className="sl-result-count">
                    {loading ? 'Loading…' : `${total.toLocaleString()} spell${total !== 1 ? 's' : ''}`}
                  </span>
                  {totalPages > 1 && (
                    <div className="sl-pagination">
                      <button
                        className="sl-page-btn"
                        disabled={currentPage <= 1}
                        onClick={() => fetchSpells(offset - PAGE_SIZE)}
                      >‹</button>
                      <span className="sl-page-info">{currentPage} / {totalPages}</span>
                      <button
                        className="sl-page-btn"
                        disabled={currentPage >= totalPages}
                        onClick={() => fetchSpells(offset + PAGE_SIZE)}
                      >›</button>
                    </div>
                  )}
                </div>

                {error && <p className="sl-error">{error}</p>}

                {loading ? (
                  <div className="sl-loading"><div className="sl-spinner" /></div>
                ) : spells.length === 0 ? (
                  <div className="sl-no-results">
                    <p>No spells match your filters.</p>
                    {hasFilters && (
                      <button className="sl-clear-btn" onClick={resetFilters}>Clear filters</button>
                    )}
                  </div>
                ) : (
                  <div className="sl-list">
                    {spells.map(spell => (
                      <SpellCard
                        key={spell.id}
                        spell={spell}
                        selected={selected?.id === spell.id}
                        onClick={() => selectSpell(spell)}
                      />
                    ))}
                  </div>
                )}

                {/* Bottom pagination */}
                {totalPages > 1 && !loading && (
                  <div className="sl-pagination sl-pagination--bottom">
                    <button
                      className="sl-page-btn"
                      disabled={currentPage <= 1}
                      onClick={() => fetchSpells(offset - PAGE_SIZE)}
                    >‹ Prev</button>
                    <span className="sl-page-info">{currentPage} / {totalPages}</span>
                    <button
                      className="sl-page-btn"
                      disabled={currentPage >= totalPages}
                      onClick={() => fetchSpells(offset + PAGE_SIZE)}
                    >Next ›</button>
                  </div>
                )}
              </div>

              {/* Detail panel */}
              <div className="sl-detail-panel">
                <SpellDetail
                  spell={selected}
                  loading={detailLoad}
                  onClose={() => setSelected(null)}
                />
              </div>
            </div>
          )}

          {/* ── Generator Tab ────────────────────────────────────────────── */}
          {tab === 'generator' && (
            <SpellGenerator filters={filterParams} />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
