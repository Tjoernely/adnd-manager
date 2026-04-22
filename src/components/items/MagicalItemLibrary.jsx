import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client.js';
import ItemCard       from './ItemCard.jsx';
import ItemDetail     from './ItemDetail.jsx';
import DrillDown from './DrillDown.jsx';
import './Items.css';

const PAGE_SIZE = 50;

const ITEM_CATEGORIES = [
  'Potion', 'Scroll', 'Ring', 'Rod', 'Staff', 'Wand',
  'Armor', 'Weapon', 'Misc', 'Artifact',
];

const RARITIES = [
  { id: 'common',    label: 'Common' },
  { id: 'uncommon',  label: 'Uncommon' },
  { id: 'rare',      label: 'Rare' },
  { id: 'very rare', label: 'Very Rare' },
  { id: 'legendary', label: 'Legendary' },
];

const TABLE_LETTERS = 'ABCDEFGHIJKLMNOPQRST'.split('');

// ── Loot helpers ──────────────────────────────────────────────────────────────

function mapCategory(category, name) {
  const c = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (c === 'weapon' || n.includes('sword') || n.includes('axe') ||
      n.includes('bow') || n.includes('dagger') || n.includes('spear') ||
      n.includes('mace') || n.includes('hammer') || n.includes('staff') ||
      n.includes('wand')) return 'weapon';
  if (c === 'armor' || n.includes('armor') || n.includes('mail') ||
      n.includes('shield') || n.includes('plate') || n.includes('leather'))
    return (c.includes('shield') || n.includes('shield')) ? 'shield' : 'armor';
  if (c === 'potion') return 'potion';
  if (c === 'scroll') return 'scroll';
  if (c === 'ring')   return 'ring';
  if (c === 'wand')   return 'wand';
  if (c === 'rod' || c === 'staff') return 'staff';
  return 'misc';
}

function buildItemNotes(item) {
  const desc = (item.description_preview || '').toLowerCase();
  const weaponTypes = [
    'short sword', 'long sword', 'broad sword', 'two-handed sword',
    'bastard sword', 'dagger', 'battle axe', 'hand axe', 'war hammer',
    'mace', 'flail', 'spear', 'quarterstaff', 'bow', 'crossbow', 'sling',
    'scimitar', 'rapier', 'katana',
  ];
  const foundType  = weaponTypes.find(t => desc.includes(t));
  const bonusMatch = desc.match(/\+(\d+)\s*(to hit|hit|sword|weapon|attack|damage)?/i);
  const bonus      = bonusMatch ? `+${bonusMatch[1]}` : null;
  return [
    foundType ? `Type: ${foundType}` : null,
    bonus     ? `Bonus: ${bonus}`    : null,
    item.xp_value ? `XP: ${item.xp_value}` : null,
  ].filter(Boolean).join(' | ');
}

/**
 * MagicalItemLibrary — full-screen magical item browser.
 * Props:
 *   onBack — () => void
 */
export default function MagicalItemLibrary({ onBack, campaignId }) {
  // ── Meta ──────────────────────────────────────────────────────────────────
  const [meta, setMeta] = useState(null);

  // ── Filters ───────────────────────────────────────────────────────────────
  const [categories, setCategories] = useState([]);
  const [rarities,   setRarities]   = useState([]);
  const [tables,     setTables]     = useState([]);
  const [cursedOnly, setCursedOnly] = useState(false);
  const [search,     setSearch]     = useState('');
  const [sort,       setSort]       = useState('name');

  // ── UI state ──────────────────────────────────────────────────────────────
  const [filterOpen, setFilterOpen] = useState(false);
  const [tab,        setTab]        = useState('roller');  // default to Drill-Down Tables

  // ── Results ───────────────────────────────────────────────────────────────
  const [items,   setItems]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [offset,  setOffset]  = useState(0);

  // ── Detail ────────────────────────────────────────────────────────────────
  const [selected,   setSelected]   = useState(null);
  const [detailLoad, setDetailLoad] = useState(false);

  // ── Add to Party Loot ─────────────────────────────────────────────────────
  const [addingToLoot, setAddingToLoot] = useState(null); // item.id while in-flight
  const [lootSuccess,  setLootSuccess]  = useState({});   // item.id → true (clears after timeout)
  const [lootError,    setLootError]    = useState(null);  // missing campaignId etc.

  async function handleAddToLoot(item) {
    if (!campaignId) { setLootError('No active campaign — open a campaign first.'); return; }
    if (addingToLoot === item.id) return;
    setLootError(null);
    setAddingToLoot(item.id);
    try {
      await api.createPartyEquipment({
        campaign_id:     campaignId,
        name:            item.name,
        description:     (item.description_preview || '').substring(0, 300),
        is_magical:      true,
        identify_state:  'unknown',
        item_type:       mapCategory(item.category, item.name),
        magical_item_id: item.id,
        value_gp:        item.value_gp ?? null,
        source:          'found',
        notes:           buildItemNotes(item),
      });
      setLootSuccess(prev => ({ ...prev, [item.id]: true }));
      setTimeout(() => setLootSuccess(prev => { const n = { ...prev }; delete n[item.id]; return n; }), 3000);
    } catch (e) {
      console.error('Add to party loot failed:', e);
      setLootError(e.message ?? 'Failed to add to party loot');
    } finally { setAddingToLoot(null); }
  }

  const searchDebounce = useRef(null);

  // Load meta once
  useEffect(() => {
    api.getMagicalItemsMeta().then(setMeta).catch(() => {});
  }, []);

  // Build filter params
  const filterParams = {
    category:   categories.length > 0 ? categories.join(',') : undefined,
    rarity:     rarities.length   > 0 ? rarities.join(',')   : undefined,
    table:      tables.length     > 0 ? tables.join(',')     : undefined,
    cursed:     cursedOnly ? 'true' : undefined,
  };

  // Fetch items
  const fetchItems = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.searchMagicalItems({
        ...filterParams,
        search: search.trim() || undefined,
        sort,
        limit:  PAGE_SIZE,
        offset: off,
      });
      setItems(res.items ?? []);
      setTotal(res.total ?? 0);
      setOffset(off);
    } catch (e) {
      setError(e.message ?? 'Failed to load items');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, rarities, tables, cursedOnly, search, sort]);

  // Re-fetch on filter change (debounce text)
  useEffect(() => {
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => fetchItems(0), search ? 300 : 0);
    return () => clearTimeout(searchDebounce.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, rarities, tables, cursedOnly, search, sort]);

  // Select item → load full detail
  const selectItem = useCallback(async (item) => {
    if (selected?.id === item.id) { setSelected(null); return; }
    setDetailLoad(true);
    setSelected(item);
    try {
      const full = await api.getMagicalItem(item.id);
      setSelected(full);
    } catch { /* keep preview data */ }
    finally { setDetailLoad(false); }
  }, [selected]);

  // ── Toggle helpers ────────────────────────────────────────────────────────
  const toggleCategory = c => setCategories(p => p.includes(c) ? p.filter(x => x !== c) : [...p, c]);
  const toggleRarity   = r => setRarities(p   => p.includes(r) ? p.filter(x => x !== r) : [...p, r]);
  const toggleTable    = t => setTables(p     => p.includes(t) ? p.filter(x => x !== t) : [...p, t]);

  // ── Reset filters ─────────────────────────────────────────────────────────
  const resetFilters = () => {
    setCategories([]);
    setRarities([]);
    setTables([]);
    setCursedOnly(false);
    setSearch('');
    setSort('name');
  };

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages  = Math.ceil(total / PAGE_SIZE);
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const hasFilters  = !!(categories.length || rarities.length || tables.length || cursedOnly || search);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mi-screen">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mi-header">
        <button className="mi-back-btn" onClick={onBack} aria-label="Back">← Dashboard</button>
        <h1 className="mi-title">⚗️ Magical Items</h1>

        {meta && (
          <div className="mi-meta-badges">
            <span className="mi-meta-badge">{(meta.total ?? 0).toLocaleString()} items</span>
          </div>
        )}

        <div className="mi-tabs">
          <button
            className={`mi-tab${tab === 'library' ? ' mi-tab--active' : ''}`}
            onClick={() => setTab('library')}
          >📚 Library</button>
          <button
            className={`mi-tab${tab === 'roller' ? ' mi-tab--active' : ''}`}
            onClick={() => setTab('roller')}
          >🎲 Drill-Down Tables</button>
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="mi-body">

        {/* ── Library Tab ──────────────────────────────────────────────────── */}
        {tab === 'library' && (
          <>
            {/* Sticky toolbar */}
            <div className="mi-toolbar">
              <input
                className="mi-search-input"
                type="text"
                placeholder="Search items…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />

              <button
                className={`mi-toolbar-btn${filterOpen ? ' mi-toolbar-btn--active' : ''}`}
                onClick={() => setFilterOpen(o => !o)}
              >
                ⚙ Filters{hasFilters ? ' •' : ''}
              </button>

              <span className="mi-result-count">
                {loading ? 'Loading…' : `${total.toLocaleString()} item${total !== 1 ? 's' : ''}`}
              </span>
            </div>

            {/* Content area */}
            <div className="mi-content">

              {/* Backdrop */}
              {filterOpen && (
                <div className="mi-backdrop" onClick={() => setFilterOpen(false)} />
              )}

              {/* ── Filter panel — slides from LEFT ──────────────────────── */}
              <div className={`mi-filter-panel${filterOpen ? ' mi-filter-panel--open' : ''}`}>
                <div className="mi-fp-header">
                  <span className="mi-fp-title">Filters</span>
                  <button className="mi-fp-close" onClick={() => setFilterOpen(false)} aria-label="Close filters">✕</button>
                </div>

                <div className="mi-fp-scroll">

                  {/* Category */}
                  <div className="mi-fp-section">
                    <div className="mi-fp-label">Category</div>
                    {ITEM_CATEGORIES.map(cat => (
                      <label key={cat} className="mi-check-row">
                        <input
                          type="checkbox"
                          checked={categories.includes(cat)}
                          onChange={() => toggleCategory(cat)}
                        />
                        {cat}
                      </label>
                    ))}
                  </div>

                  {/* Rarity */}
                  <div className="mi-fp-section">
                    <div className="mi-fp-label">Rarity</div>
                    {RARITIES.map(r => (
                      <label key={r.id} className="mi-check-row">
                        <input
                          type="checkbox"
                          checked={rarities.includes(r.id)}
                          onChange={() => toggleRarity(r.id)}
                        />
                        {r.label}
                      </label>
                    ))}
                  </div>

                  {/* Treasure Table */}
                  <div className="mi-fp-section">
                    <div className="mi-fp-label">Treasure Table</div>
                    <div className="mi-table-grid">
                      {TABLE_LETTERS.map(letter => (
                        <button
                          key={letter}
                          className={`mi-table-btn${tables.includes(letter) ? ' mi-table-btn--active' : ''}`}
                          onClick={() => toggleTable(letter)}
                        >
                          {letter}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Options */}
                  <div className="mi-fp-section">
                    <div className="mi-fp-label">Options</div>
                    <label className="mi-check-row">
                      <input
                        type="checkbox"
                        checked={cursedOnly}
                        onChange={e => setCursedOnly(e.target.checked)}
                      />
                      Cursed items only
                    </label>
                    <div className="mi-fp-label" style={{ marginTop: 10 }}>Sort by</div>
                    <div className="mi-sort-row">
                      {['name', 'rarity', 'category'].map(s => (
                        <button
                          key={s}
                          className={`mi-sort-btn${sort === s ? ' mi-sort-btn--active' : ''}`}
                          onClick={() => setSort(s)}
                        >
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Clear all */}
                  {hasFilters && (
                    <button className="mi-clear-btn" onClick={resetFilters}>🗑 Clear All Filters</button>
                  )}
                </div>
              </div>

              {/* ── Item list ───────────────────────────────────────────────── */}
              <div className="mi-list-area">
                {error && <div className="mi-error-bar">{error}</div>}

                {loading ? (
                  <div className="mi-loading">
                    <div className="mi-spinner" />
                    Loading items…
                  </div>
                ) : items.length === 0 ? (
                  <div className="mi-empty">
                    <div className="mi-empty-icon">⚗️</div>
                    <p className="mi-empty-msg">
                      {hasFilters
                        ? 'No items match your filters.'
                        : 'No magical items in the database yet. Run the import script to populate.'}
                    </p>
                    {hasFilters && (
                      <button className="mi-clear-btn" onClick={resetFilters}>Clear filters</button>
                    )}
                  </div>
                ) : (
                  <>
                    {lootError && (
                      <div style={{
                        fontSize: 11, color: '#e08080', background: 'rgba(200,50,50,.1)',
                        border: '1px solid rgba(200,50,50,.3)', borderRadius: 5,
                        padding: '6px 10px', marginBottom: 8,
                      }}>⚠ {lootError}</div>
                    )}
                    <div className="mi-item-list">
                      {items.map(item => (
                        <div key={item.id} style={{ position: 'relative' }}>
                          <ItemCard
                            item={item}
                            selected={selected?.id === item.id}
                            onClick={() => selectItem(item)}
                          />
                          {campaignId && (
                            <button
                              onClick={e => { e.stopPropagation(); handleAddToLoot(item); }}
                              disabled={addingToLoot === item.id}
                              title="Add to Party Loot"
                              style={{
                                position: 'absolute', top: 6, right: 6,
                                fontSize: 10, padding: '2px 6px', borderRadius: 4,
                                cursor: addingToLoot === item.id ? 'not-allowed' : 'pointer',
                                background: lootSuccess[item.id]
                                  ? 'rgba(109,190,136,.2)' : 'rgba(0,0,0,.55)',
                                border: `1px solid ${lootSuccess[item.id] ? 'rgba(109,190,136,.5)' : 'rgba(212,160,53,.3)'}`,
                                color: lootSuccess[item.id] ? '#6dbe88' : '#c8a040',
                                opacity: addingToLoot === item.id ? 0.5 : 1,
                                zIndex: 2, whiteSpace: 'nowrap',
                              }}
                            >
                              {addingToLoot === item.id ? '⏳' : lootSuccess[item.id] ? '✓' : '📦'}
                            </button>
                          )}
                        </div>
                      ))}
                    </div>

                    {totalPages > 1 && (
                      <div className="mi-pagination">
                        <button
                          className="mi-page-btn"
                          disabled={currentPage <= 1}
                          onClick={() => fetchItems(offset - PAGE_SIZE)}
                        >← Prev</button>
                        <span className="mi-page-info">Page {currentPage} of {totalPages}</span>
                        <button
                          className="mi-page-btn"
                          disabled={currentPage >= totalPages}
                          onClick={() => fetchItems(offset + PAGE_SIZE)}
                        >Next →</button>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* ── Detail panel — slides from RIGHT ──────────────────────── */}
              <div className={`mi-detail-panel${selected ? ' mi-detail-panel--open' : ''}`}
                style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                  <ItemDetail
                    item={selected}
                    loading={detailLoad}
                    onClose={() => setSelected(null)}
                  />
                </div>
                {selected && campaignId && (
                  <div style={{
                    padding: '10px 14px', borderTop: '1px solid rgba(200,168,75,0.2)',
                    flexShrink: 0, background: 'rgba(0,0,0,.25)',
                  }}>
                    <button
                      onClick={() => handleAddToLoot(selected)}
                      disabled={addingToLoot === selected.id}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: 5, cursor: addingToLoot === selected.id ? 'not-allowed' : 'pointer',
                        background: lootSuccess[selected.id] ? 'rgba(109,190,136,.18)' : 'rgba(212,160,53,.1)',
                        border: `1px solid ${lootSuccess[selected.id] ? 'rgba(109,190,136,.5)' : 'rgba(212,160,53,.35)'}`,
                        color: lootSuccess[selected.id] ? '#6dbe88' : '#c8a040',
                        fontSize: 12, fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
                        fontVariant: 'small-caps', letterSpacing: '0.08em',
                        opacity: addingToLoot === selected.id ? 0.6 : 1,
                      }}
                    >
                      {addingToLoot === selected.id ? '⏳ Adding…' : lootSuccess[selected.id] ? '✓ Added to Party Loot' : '📦 Add to Party Loot'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </>
        )}

        {/* ── Drill-Down Tables Tab ────────────────────────────────────────────── */}
        {tab === 'roller' && <DrillDown />}

      </div>
    </div>
  );
}
