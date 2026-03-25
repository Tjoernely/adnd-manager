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

// Map a class name to its spell group using substring matching
function getSpellGroup(cls) {
  const c = (cls || '').toLowerCase();
  if (['mage','wizard','illusionist','conjurer','invoker',
       'diviner','enchanter','necromancer','transmuter',
       'abjurer','wild mage'].some(k => c.includes(k))) return 'wizard';
  if (['cleric','druid','priest','shaman','crusader',
       'specialty priest'].some(k => c.includes(k))) return 'priest';
  if (c.includes('bard'))    return 'wizard'; // bard draws from wizard list
  if (c.includes('ranger'))  return 'priest';
  if (c.includes('paladin')) return 'priest';
  return null;
}

// Return specialist school info for wizard subclasses (null = generalist)
const SPECIALIST_SCHOOLS = {
  illusionist: { allowed: ['Illusion','Phantasm'],                    opposition: ['Necromancy','Invocation','Evocation','Abjuration'] },
  conjurer:    { allowed: ['Conjuration','Summoning'],                 opposition: ['Divination','Invocation','Evocation'] },
  invoker:     { allowed: ['Invocation','Evocation'],                  opposition: ['Conjuration','Summoning','Enchantment','Charm'] },
  diviner:     { allowed: ['Divination'],                              opposition: ['Conjuration','Summoning','Enchantment','Charm'] },
  enchanter:   { allowed: ['Enchantment','Charm'],                     opposition: ['Invocation','Evocation','Necromancy'] },
  necromancer: { allowed: ['Necromancy'],                              opposition: ['Enchantment','Charm','Illusion','Phantasm'] },
  transmuter:  { allowed: ['Alteration','Transmutation'],              opposition: ['Abjuration','Necromancy'] },
  abjurer:     { allowed: ['Abjuration'],                              opposition: ['Alteration','Transmutation','Illusion','Phantasm'] },
};
function getSpecialistSchools(cls) {
  const c = (cls || '').toLowerCase();
  for (const [key, val] of Object.entries(SPECIALIST_SCHOOLS)) {
    if (c.includes(key)) return val;
  }
  return null;
}

// Bard-accessible wizard schools (by keyword match against spell.school)
const BARD_ALLOWED_SCHOOL_KEYWORDS = ['alteration','transmutation','enchantment','charm','illusion','phantasm','conjuration','summoning'];

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
  const [filterOpen,       setFilterOpen]       = useState(false);
  const [charMenuOpen,     setCharMenuOpen]     = useState(false);
  const [charFilter,       setCharFilter]       = useState(null);  // selected character obj
  const [charMaxLevel,     setCharMaxLevel]     = useState(null);  // visual-only cap when char selected
  const [charSpecialist,   setCharSpecialist]   = useState(null);  // { allowed, opposition } | null
  const [tab,              setTab]              = useState('library');

  // ── Add-to-spellbook / make-scroll loading state ──────────────────────────
  const [addingSpell,  setAddingSpell]  = useState(null); // { id, action:'book'|'scroll' }
  const [spellbookIds, setSpellbookIds] = useState(new Set()); // spell_db_id already in spellbook
  const [spellSuccess, setSpellSuccess] = useState({}); // spellId → 'book'|'scroll' (clears after timeout)

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

  // Build filter params object (spell_group is the canonical API param name)
  const filterParams = {
    spell_group: group      || undefined,
    minLevel:    minLevel   || undefined,
    maxLevel:    maxLevel   || undefined,
    school:      schools.length    > 0 ? schools.join(',')    : undefined,
    sphere:      spheres.length    > 0 ? spheres.join(',')    : undefined,
    category:    categories.length > 0 ? categories.join(',') : undefined,
    reversible:  reversible ? 'true' : undefined,
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

  // Fetch spellbook when character filter changes
  useEffect(() => {
    if (!charFilter) { setSpellbookIds(new Set()); return; }
    api.getCharacterSpells(charFilter.id).then(spells => {
      const ids = new Set((Array.isArray(spells) ? spells : []).map(s => s.spell_db_id).filter(Boolean));
      setSpellbookIds(ids);
    }).catch(() => {});
  }, [charFilter?.id]);

  // ── Apply character filter ────────────────────────────────────────────────
  const applyCharFilter = char => {
    setCharFilter(char);
    setCharMenuOpen(false);
    const d   = char.character_data || {};
    const cls = (d.selectedClass || '').toLowerCase();
    const lvl = d.charLevel || 1;

    const spellGroup     = getSpellGroup(cls);
    const specialistInfo = getSpecialistSchools(cls);

    // API-level group filter
    setGroup(spellGroup || '');
    // No school pre-filter — specialist opposition handled client-side visually
    setSchools([]);
    setCharSpecialist(specialistInfo);

    // Sphere restrictions passed to API for ranger/paladin
    if (cls.includes('ranger')) {
      setSpheres(['animal', 'plant', 'elemental']);
    } else if (cls.includes('paladin')) {
      setSpheres(['combat', 'divination', 'healing', 'protection']);
    } else {
      setSpheres([]);
    }

    // Max castable level
    let maxCastable;
    if (cls.includes('bard')) {
      maxCastable = Math.floor(lvl / 3);                   // floor(level/3)
    } else if (cls.includes('ranger')) {
      maxCastable = lvl >= 8 ? 3 : 0;
    } else if (cls.includes('paladin')) {
      maxCastable = lvl >= 9 ? 4 : 0;
    } else if (spellGroup === 'wizard') {
      maxCastable = Math.min(9, Math.ceil(lvl / 2));
    } else if (spellGroup === 'priest') {
      maxCastable = Math.min(7, Math.ceil(lvl / 2));
    } else {
      maxCastable = Math.min(9, Math.ceil(lvl / 2));
    }

    setCharMaxLevel(Math.max(0, maxCastable));
    setMaxLevel('');
    setMinLevel('');
  };

  const clearCharFilter = () => {
    setCharFilter(null);
    setCharMaxLevel(null);
    setCharSpecialist(null);
    setGroup('');
    setSchools([]);
    setSpheres([]);
    setMaxLevel('');
  };

  // ── Add to spellbook ──────────────────────────────────────────────────────
  async function handleAddToSpellbook(spell) {
    if (!charFilter || addingSpell || spellbookIds.has(spell.id)) return;
    setAddingSpell({ id: spell.id, action: 'book' });
    try {
      await api.createCharacterSpell({
        character_id: charFilter.id,
        campaign_id:  campaignId,
        name:         spell.name,
        spell_level:  spell.spell_level,
        spell_type:   spell.spell_group,
        status:       'known',
        is_special:   false,
        spell_db_id:  spell.id,
      });
      setSpellbookIds(prev => new Set([...prev, spell.id]));
      setSpellSuccess(prev => ({ ...prev, [spell.id]: 'book' }));
      setTimeout(() => setSpellSuccess(prev => { const n = { ...prev }; delete n[spell.id]; return n; }), 3000);
    } catch (e) { console.error('Add to spellbook failed:', e); }
    finally { setAddingSpell(null); }
  }

  // ── Make scroll ───────────────────────────────────────────────────────────
  async function handleMakeScroll(spell) {
    if (!charFilter || addingSpell || !campaignId) return;
    setAddingSpell({ id: spell.id, action: 'scroll' });
    try {
      await api.createPartyEquipment({
        campaign_id:       campaignId,
        name:              `Scroll of ${spell.name}`,
        description:       `Level ${spell.spell_level} ${spell.spell_group} spell scroll`,
        is_magical:        true,
        identify_state:    'unknown',
        item_type:         'scroll',
        source:            'crafted',
        notes:             `spell_id:${spell.id}`,
      });
      setSpellSuccess(prev => ({ ...prev, [spell.id]: 'scroll' }));
      setTimeout(() => setSpellSuccess(prev => { const n = { ...prev }; delete n[spell.id]; return n; }), 3000);
    } catch (e) { console.error('Make scroll failed:', e); }
    finally { setAddingSpell(null); }
  }

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
        <button className="sl-back-btn" onClick={onBack} aria-label="Back">← Dashboard</button>
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
                      {spells.map(spell => {
                        const overCap  = charMaxLevel !== null && spell.spell_level > charMaxLevel;
                        const isAdding = addingSpell?.id === spell.id;
                        const school   = (spell.school || '').toLowerCase();

                        // Specialist opposition school check
                        const isOpposition = charSpecialist
                          ? charSpecialist.opposition.some(s => school.includes(s.toLowerCase()))
                          : false;

                        // Bard school restriction (wizard spells, limited schools)
                        const charCls = charFilter ? (charFilter.character_data?.selectedClass || '').toLowerCase() : '';
                        const isBard  = charCls.includes('bard');
                        const isBardForbidden = isBard && spell.school
                          ? !BARD_ALLOWED_SCHOOL_KEYWORDS.some(k => school.includes(k))
                          : false;

                        if (isBardForbidden) return null; // hide non-bard schools entirely

                        return (
                          <div key={spell.id} style={{
                            display: 'flex', alignItems: 'stretch',
                            opacity: overCap ? 0.35 : isOpposition ? 0.5 : 1,
                          }}>
                            <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
                              <SpellCard
                                spell={spell}
                                selected={selected?.id === spell.id}
                                onClick={() => selectSpell(spell)}
                              />
                              {isOpposition && (
                                <div style={{
                                  position: 'absolute', top: '50%', left: 8, transform: 'translateY(-50%)',
                                  fontSize: 10, color: '#c47070', background: 'rgba(180,50,50,.15)',
                                  border: '1px solid rgba(180,50,50,.35)', borderRadius: 4,
                                  padding: '1px 6px', pointerEvents: 'none',
                                }}>
                                  ⊗ Opposition
                                </div>
                              )}
                            </div>
                            {charFilter && !overCap && !isOpposition && (() => {
                              const inBook     = spellbookIds.has(spell.id);
                              const bookAdding = addingSpell?.id === spell.id && addingSpell.action === 'book';
                              const bookDone   = spellSuccess[spell.id] === 'book';
                              const scrollAdding = addingSpell?.id === spell.id && addingSpell.action === 'scroll';
                              const scrollDone   = spellSuccess[spell.id] === 'scroll';
                              return (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 6px', justifyContent: 'center', flexShrink: 0 }}>
                                  <button
                                    onClick={e => { e.stopPropagation(); handleAddToSpellbook(spell); }}
                                    disabled={isAdding || inBook}
                                    title={inBook ? 'Already in spellbook' : `Add ${spell.name} to ${charFilter.name}'s spellbook`}
                                    style={{
                                      fontSize: 11, padding: '3px 7px', borderRadius: 4,
                                      cursor: (isAdding || inBook) ? 'not-allowed' : 'pointer',
                                      background: inBook ? 'rgba(109,190,136,.06)' : bookDone ? 'rgba(109,190,136,.18)' : 'rgba(109,190,136,.1)',
                                      border: `1px solid ${inBook ? 'rgba(109,190,136,.2)' : 'rgba(109,190,136,.35)'}`,
                                      color: inBook ? '#5a9a6a' : '#6dbe88',
                                      fontFamily: 'inherit', opacity: (isAdding && !bookAdding) ? 0.4 : 1, whiteSpace: 'nowrap',
                                    }}
                                  >{bookAdding ? '…' : inBook ? '✓ In Spellbook' : bookDone ? '✓ Added!' : '📖'}</button>
                                  {campaignId && (
                                    <button
                                      onClick={e => { e.stopPropagation(); handleMakeScroll(spell); }}
                                      disabled={isAdding}
                                      title={`Add ${spell.name} scroll to party loot`}
                                      style={{
                                        fontSize: 11, padding: '3px 7px', borderRadius: 4,
                                        cursor: isAdding ? 'not-allowed' : 'pointer',
                                        background: scrollDone ? 'rgba(212,160,53,.18)' : 'rgba(212,160,53,.08)',
                                        border: '1px solid rgba(212,160,53,.3)',
                                        color: '#c8a040', fontFamily: 'inherit',
                                        opacity: (isAdding && !scrollAdding) ? 0.4 : 1, whiteSpace: 'nowrap',
                                      }}
                                    >{scrollAdding ? '…' : scrollDone ? '✓ Added to Loot!' : '📜'}</button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        );
                      })}
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
          <>
            {campaignId && (
              <div className="sl-toolbar" style={{ borderBottom: '1px solid var(--sl-border)', marginBottom: 0 }}>
                <div className="sl-char-wrap" ref={charMenuRef}>
                  <button
                    className={`sl-toolbar-btn${charFilter ? ' sl-toolbar-btn--char' : ''}`}
                    onClick={() => setCharMenuOpen(o => !o)}
                  >
                    🧙 {charFilter ? charFilter.name : 'Character'}
                  </button>
                  {charFilter && (
                    <button className="sl-char-clear" onClick={clearCharFilter} title="Clear character filter">✕</button>
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
                {charFilter && charMaxLevel !== null && (
                  <span style={{ fontSize: 11, color: '#c8a040', fontFamily: 'inherit' }}>
                    Max castable: level {charMaxLevel}
                  </span>
                )}
              </div>
            )}
            <SpellGenerator
              filters={filterParams}
              charFilter={charFilter}
              charMaxLevel={charMaxLevel}
            />
          </>
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
