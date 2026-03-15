import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client';
import SpellCard      from './SpellCard';
import SpellDetail    from './SpellDetail';
import SpellGenerator from './SpellGenerator';
import './Spells.css';

const PAGE_SIZE = 50;

const WIZARD_SCHOOLS = [
  'Abjuration', 'Alteration', 'Conjuration', 'Divination', 'Enchantment',
  'Evocation', 'Illusion', 'Invocation', 'Necromancy', 'Transmutation',
  'Wild Magic', 'Shadow',
];

const SPELL_CATEGORIES = [
  { id: 'offensive',   label: 'Offensive' },
  { id: 'healing',     label: 'Healing' },
  { id: 'support',     label: 'Support' },
  { id: 'utility',     label: 'Utility' },
  { id: 'enchantment', label: 'Enchantment/Charm' },
  { id: 'summoning',   label: 'Summoning' },
];

// Class IDs that map to wizard / priest spell groups
const WIZARD_CLASS_IDS = new Set(['mage', 'illusionist', 'specialist', 'bard']);
const PRIEST_CLASS_IDS = new Set(['cleric', 'druid', 'shaman']);

/**
 * SpellLibrary — full-screen spell browser.
 * Props:
 *   onBack      — () => void
 *   campaignId  — number | undefined
 *   characters  — character[] (list from current campaign)
 */
export default function SpellLibrary({ onBack, campaignId, characters = [] }) {
  // ── Meta ──────────────────────────────────────────────────────────────────
  const [meta, setMeta] = useState(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [group,      setGroup]      = useState('');
  const [minLevel,   setMinLevel]   = useState('');
  const [maxLevel,   setMaxLevel]   = useState('');
  const [schools,    setSchools]    = useState([]);      // string[] multi-select
  const [spheres,    setSpheres]    = useState([]);      // string[] multi-select
  const [categories, setCategories] = useState([]);      // string[] multi-select
  const [reversible, setReversible] = useState(false);
  const [search,     setSearch]     = useState('');
  const [sort,       setSort]       = useState('name');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [charMenuOpen, setCharMenuOpen] = useState(false);
  const [charFilter,   setCharFilter]   = useState(null);  // selected character obj
  const [tab,          setTab]          = useState('library');

  // ── Results ───────────────────────────────────────────────────────────────
  const [spells,    setSpells]    = useState([]);
  const [total,     setTotal]     = useState(0);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState(null);
  const [offset,    setOffset]    = useState(0);

  // ── Detail ────────────────────────────────────────────────────────────────
  const [selected,   setSelected]   = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);

  const searchDebounce = useRef(null);
  const charMenuRef    = useRef(null);

  // Load meta once
  useEffect(() => {
    api.getSpellsMeta().then(setMeta).catch(() => {});
  }, []);

  // Close character dropdown on outside click
  useEffect(() => {
    const handler = e => {
      if (charMenuRef.current && !charMenuRef.current.contains(e.target)) {
        setCharMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Build filter params object
  const filterParams = {
    group:      group      || undefined,
    minLevel:   minLevel   || undefined,
    maxLevel:   maxLevel   || undefined,
    school:     schools.length    > 0 ? schools.join(',')    : undefined,
    sphere:     spheres.length    > 0 ? spheres.join(',')    : undefined,
    category:   categories.length > 0 ? categories.join(',') : undefined,
    reversible: reversible ? 'true' : undefined,
  };

  // Fetch spell list
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
  }, [group, minLevel, maxLevel, schools, spheres, categories, reversible, search, sort]);

  // Re-fetch when filters change (debounce text search)
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => fetchSpells(0), search ? 300 : 0);
    return () => clearTimeout(searchDebounce.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group, minLevel, maxLevel, schools, spheres, categories, reversible, search, sort]);

  // Select spell → load full detail
  const selectSpell = useCallback(async (spell) => {
    if (selected?.id === spell.id) { setSelected(null); return; }
    setDetailLoad(true);
    setSelected(spell);
    try {
      const full = await api.getSpell(spell.id);
      setSelected(full);
    } catch { /* keep preview data */ }
    finally { setDetailLoad(false); }
  }, [selected]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleSchool   = s => setSchools(p   => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleSphere   = s => setSpheres(p   => p.includes(s) ? p.filter(x => x !== s) : [...p, s]);
  const toggleCategory = c => setCategories(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);

  // ── Reset filters ─────────────────────────────────────────────────────────
  const resetFilters = () => {
    setGroup('');
    setMinLevel('');
    setMaxLevel('');
    setSchools([]);
    setSpheres([]);
    setCategories([]);
    setReversible(false);
    setSearch('');
    setSort('name');
    setCharFilter(null);
  };

  // ── Apply character filter ────────────────────────────────────────────────
  const applyCharFilter = char => {
    setCharFilter(char);
    setCharMenuOpen(false);
    const d   = char.data || {};
    const cls = (d.selectedClass || '').toLowerCase();
    const lvl = d.charLevel || 1;

    if (WIZARD_CLASS_IDS.has(cls)) {
      setGroup('wizard');
      // Specialist school → pre-select it
      const school = (d.specialistSchool || '').toLowerCase();
      setSchools(school ? [school] : []);
      setSpheres([]);
    } else if (PRIEST_CLASS_IDS.has(cls)) {
      setGroup('priest');
      setSchools([]);
      setSpheres([]);
    } else {
      setGroup('');
      setSchools([]);
      setSpheres([]);
    }

    // Simplified spell level cap: ceil(charLevel / 2), capped at 9
    const spellLvlMax = Math.max(1, Math.min(9, Math.ceil(lvl / 2)));
    setMaxLevel(String(spellLvlMax));
    setMinLevel('');
  };

  const clearCharFilter = () => {
    setCharFilter(null);
    setGroup('');
    setSchools([]);
    setSpheres([]);
    setMaxLevel('');
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters  = !!(group || minLevel || maxLevel || schools.length || spheres.length ||
                         categories.length || reversible || search);

  const sphereOptions = meta?.spheres ?? [];

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="sl-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="sl-header">
        <button className="sl-back-btn" onClick={onBack} aria-label="Back">← Back</button>
        <h1 className="sl-title">Spell Library</h1>

        {meta && (
          <div className="sl-meta-badges">
            <span className="sl-meta-badge">{meta.total.toLocaleString()} spells</span>
            <span className="sl-meta-badge sl-meta-badge--wizard">{meta.wizard.toLocaleString()} wizard</span>
            <span className="sl-meta-badge sl-meta-badge--priest">{meta.priest.toLocaleString()} priest</span>
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

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="sl-body">

        {/* ── Library Tab ──────────────────────────────────────────────────── */}
        {tab === 'library' && (
          <>
            {/* Sticky toolbar */}
            <div className="sl-toolbar">
              <input
                className="sl-search-input"
                type="text"
                placeholder="Search spells…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <button
                className={`sl-toolbar-btn${filterOpen ? ' sl-toolbar-btn--active' : ''}`}
                onClick={() => setFilterOpen(o => !o)}
              >
                ⚙ Filters{hasFilters ? ' •' : ''}
              </button>

              {campaignId && (
                <div className="sl-char-wrap" ref={charMenuRef}>
                  <button
                    className={`sl-toolbar-btn${charFilter ? ' sl-toolbar-btn--char' : ''}`}
                    onClick={() => setCharMenuOpen(o => !o)}
                  >
                    🧙 {charFilter ? charFilter.name : 'Character'}
                  </button>
                  {charFilter && (
                    <button
                      className="sl-char-clear"
                      onClick={clearCharFilter}
                      title="Clear character filter"
                    >✕</button>
                  )}

                  {charMenuOpen && (
                    <div className="sl-char-dropdown">
                      <div className="sl-char-dropdown-title">Filter by character</div>
                      {characters.length === 0 ? (
                        <div className="sl-char-dropdown-empty">No characters in campaign</div>
                      ) : characters.map(ch => (
                        <button
                          key={ch.id}
                          className={`sl-char-dropdown-item${charFilter?.id === ch.id ? ' sl-char-dropdown-item--active' : ''}`}
                          onClick={() => applyCharFilter(ch)}
                        >
                          {ch.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <span className="sl-result-count">
                {loading ? 'Loading…' : `${total.toLocaleString()} spell${total !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Content area: filter panel + list + detail */}
            <div className="sl-content">

              {/* Backdrop (closes filter panel on click) */}
              {filterOpen && (
                <div className="sl-backdrop" onClick={() => setFilterOpen(false)} />
              )}

              {/* ── Filter panel — slides in from LEFT ─────────────────────── */}
              <div className={`sl-filter-panel${filterOpen ? ' sl-filter-panel--open' : ''}`}>
                <div className="sl-fp-header">
                  <span className="sl-fp-title">Filters</span>
                  <button className="sl-fp-close" onClick={() => setFilterOpen(false)} aria-label="Close filters">✕</button>
                </div>

                <div className="sl-fp-scroll">

                  {/* Spell Group */}
                  <div className="sl-fp-section">
                    <div className="sl-fp-label">Spell Group</div>
                    <div className="sl-group-btns">
                      {[['', 'all', 'All'], ['wizard', 'wizard', 'Wizard'], ['priest', 'priest', 'Priest']].map(([val, mod, lbl]) => (
                        <button
                          key={val}
                          className={`sl-group-btn sl-group-btn--${mod}${group === val ? ' sl-group-btn--active' : ''}`}
                          onClick={() => setGroup(val)}
                        >{lbl}</button>
                      ))}
                    </div>
                  </div>

                  {/* Level range */}
                  <div className="sl-fp-section">
                    <div className="sl-fp-label">Level</div>
                    <div className="sl-level-row">
                      <select className="sl-filter-select" value={minLevel} onChange={e => setMinLevel(e.target.value)}>
                        <option value="">Min</option>
                        {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                      <span className="sl-level-sep">–</span>
                      <select className="sl-filter-select" value={maxLevel} onChange={e => setMaxLevel(e.target.value)}>
                        <option value="">Max</option>
                        {[1,2,3,4,5,6,7,8,9].map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* School (wizard) — multi-select checkboxes */}
                  {(group === '' || group === 'wizard') && (
                    <div className="sl-fp-section">
                      <div className="sl-fp-label">School (Wizard)</div>
                      {WIZARD_SCHOOLS.map(s => {
                        const key = s.toLowerCase();
                        return (
                          <label key={s} className="sl-check-row">
                            <input type="checkbox" checked={schools.includes(key)} onChange={() => toggleSchool(key)} />
                            {s}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Sphere (priest) — multi-select checkboxes */}
                  {(group === '' || group === 'priest') && sphereOptions.length > 0 && (
                    <div className="sl-fp-section">
                      <div className="sl-fp-label">Sphere (Priest)</div>
                      {sphereOptions.slice(0, 12).map(s => (
                        <label key={s} className="sl-check-row">
                          <input type="checkbox" checked={spheres.includes(s)} onChange={() => toggleSphere(s)} />
                          {capitalize(s)}
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Category */}
                  <div className="sl-fp-section">
                    <div className="sl-fp-label">Category</div>
                    {SPELL_CATEGORIES.map(cat => (
                      <label key={cat.id} className="sl-check-row">
                        <input type="checkbox" checked={categories.includes(cat.id)} onChange={() => toggleCategory(cat.id)} />
                        {cat.label}
                      </label>
                    ))}
                  </div>

                  {/* Options */}
                  <div className="sl-fp-section">
                    <div className="sl-fp-label">Options</div>
                    <label className="sl-check-row">
                      <input type="checkbox" checked={reversible} onChange={e => setReversible(e.target.checked)} />
                      Reversible only
                    </label>
                    <div className="sl-fp-label" style={{ marginTop: 10 }}>Sort by</div>
                    <div className="sl-sort-row">
                      {['name', 'level'].map(s => (
                        <button
                          key={s}
                          className={`sl-sort-btn${sort === s ? ' sl-sort-btn--active' : ''}`}
                          onClick={() => setSort(s)}
                        >{capitalize(s)}</button>
                      ))}
                    </div>
                  </div>

                  {/* Clear all */}
                  {hasFilters && (
                    <button className="sl-clear-btn" onClick={resetFilters}>🗑 Clear All Filters</button>
                  )}
                </div>
              </div>

              {/* ── Spell list ───────────────────────────────────────────────── */}
              <div className="sl-list-area">
                {error && <div className="sl-error-bar">{error}</div>}

                {loading ? (
                  <div className="sl-loading">
                    <div className="sl-spinner" />
                    Loading spells…
                  </div>
                ) : spells.length === 0 ? (
                  <div className="sl-empty">
                    <div className="sl-empty-icon">📜</div>
                    <p className="sl-empty-msg">No spells match your filters.</p>
                    {hasFilters && (
                      <button className="sl-clear-btn" onClick={resetFilters}>Clear filters</button>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="sl-spell-list">
                      {spells.map(spell => (
                        <SpellCard
                          key={spell.id}
                          spell={spell}
                          selected={selected?.id === spell.id}
                          onClick={() => selectSpell(spell)}
                        />
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="sl-pagination">
                        <button
                          className="sl-page-btn"
                          disabled={currentPage <= 1}
                          onClick={() => fetchSpells(offset - PAGE_SIZE)}
                        >← Prev</button>
                        <span className="sl-page-info">Page {currentPage} of {totalPages}</span>
                        <button
                          className="sl-page-btn"
                          disabled={currentPage >= totalPages}
                          onClick={() => fetchSpells(offset + PAGE_SIZE)}
                        >Next →</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Detail panel — slides in from RIGHT ──────────────────────── */}
              <div className={`sl-detail-panel${selected ? ' sl-detail-panel--open' : ''}`}>
                <SpellDetail
                  spell={selected}
                  loading={detailLoad}
                  onClose={() => setSelected(null)}
                />
              </div>

            </div>
          </>
        )}

        {/* ── Generator Tab ──────────────────────────────────────────────────── */}
        {tab === 'generator' && (
          <SpellGenerator filters={filterParams} />
        )}

      </div>
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
