import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../../api/client.js';
import DiceRoller from './DiceRoller.jsx';
import './Items.css';

// ── Table 1 Overview (d100 master table) ──────────────────────────────────────
const TABLE_1 = [
  { rollMin:  1, rollMax: 20, label: '01–20', category: 'Magical Liquids',              table: 'A', dice: 'd20'  },
  { rollMin: 21, rollMax: 35, label: '21–35', category: 'Scrolls',                      table: 'B', dice: 'd20'  },
  { rollMin: 36, rollMax: 40, label: '36–40', category: 'Rings',                        table: 'C', dice: 'd20'  },
  { rollMin: 41, rollMax: 45, label: '41–45', category: 'Rods',                         table: 'D', dice: 'd20'  },
  { rollMin: 46, rollMax: 50, label: '46–50', category: 'Staves',                       table: 'E', dice: 'd20'  },
  { rollMin: 51, rollMax: 55, label: '51–55', category: 'Wands',                        table: 'F', dice: 'd20'  },
  { rollMin: 56, rollMax: 60, label: '56–60', category: 'Books & Tomes',                table: 'G', dice: 'd20'  },
  { rollMin: 61, rollMax: 65, label: '61–65', category: 'Gems & Jewelry',               table: 'H', dice: 'd20'  },
  { rollMin: 66, rollMax: 68, label: '66–68', category: 'Clothing',                     table: 'I', dice: 'd20'  },
  { rollMin: 69, rollMax: 72, label: '69–72', category: 'Boots, Gloves & Accessories',  table: 'J', dice: 'd20'  },
  { rollMin: 73, rollMax: 74, label: '73–74', category: 'Girdles & Helmets',            table: 'K', dice: 'd20'  },
  { rollMin: 75, rollMax: 77, label: '75–77', category: 'Bags, Bands & Bottles',        table: 'L', dice: 'd20'  },
  { rollMin: 78, rollMax: 80, label: '78–80', category: 'Dusts & Stones',               table: 'M', dice: 'd20'  },
  { rollMin: 81, rollMax: 83, label: '81–83', category: 'Household Items',              table: 'N', dice: 'd20'  },
  { rollMin: 84, rollMax: 85, label: '84–85', category: 'Musical Instruments',          table: 'O', dice: 'd20'  },
  { rollMin: 86, rollMax: 87, label: '86–87', category: 'Weird Stuff',                  table: 'P', dice: 'd20'  },
  { rollMin: 88, rollMax: 89, label: '88–89', category: 'Humorous Items',               table: 'Q', dice: 'd20'  },
  { rollMin: 90, rollMax: 95, label: '90–95', category: 'Armor & Shields',              table: 'R', dice: 'd100' },
  { rollMin: 96, rollMax: 99, label: '96–99', category: 'Weapons',                      table: 'S', dice: 'd100' },
  { rollMin: 100,rollMax: 100,label: '00',    category: 'Artifacts & Relics',           table: 'T', dice: 'd20'  },
];

const COMPLEX_TABLES = ['R', 'S'];

const SUBTAB_LABELS = {
  S: [
    { id: '1', label: 'S1 Generic' },
    { id: '2', label: 'S2 Attack Adj.' },
    { id: '3', label: 'S3 Special' },
  ],
  R: [
    { id: '1', label: 'R1 Generic' },
    { id: '2', label: 'R2 Armor Bonus' },
    { id: '3', label: 'R3 Special' },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1;
}

function padRoll(n, sides) {
  if (sides >= 1000) return String(n).padStart(3, '0');
  if (sides >= 100)  return n === 100 ? '00' : String(n).padStart(2, '0');
  return String(n).padStart(2, '0');
}

function formatRange(min, max, dice) {
  const sides = parseSides(dice);
  const p = n => padRoll(n, sides);
  return min === max ? p(min) : `${p(min)}–${p(max)}`;
}

function parseSides(dice) {
  const m = String(dice ?? 'd20').match(/d(\d+)/i);
  return m ? parseInt(m[1]) : 20;
}

function findTableRow(entries, roll) {
  return entries.find(e => roll >= e.roll_min && roll <= e.roll_max) ?? null;
}

// ── PaneHeader ────────────────────────────────────────────────────────────────
function PaneHeader({ title, subtitle, dice, onRoll, children }) {
  return (
    <div className="mi-pane-header">
      <div className="mi-pane-title">{title}</div>
      {subtitle && <div className="mi-pane-subtitle">{subtitle}</div>}
      {(dice || children) && (
        <div className="mi-pane-dice-row">
          {dice && <DiceRoller sides={parseSides(dice)} label={dice} onRoll={onRoll} />}
          {children}
        </div>
      )}
    </div>
  );
}

// ── EntryRow ──────────────────────────────────────────────────────────────────
function EntryRow({ entry, selected, dice, onClick }) {
  const range     = formatRange(entry.roll_min, entry.roll_max, dice);
  const isSpecial = entry.roll_min >= 975;
  const isCursed  = entry.cursed || entry.bonus < 0;
  const hasDesc   = !!(entry.notes || entry.description);
  const hasChild  = isSpecial || entry.has_children;

  const cls = [
    'mi-table-row',
    selected      ? 'mi-table-row--selected' : '',
    isSpecial     ? 'mi-table-row--special'  : '',
    isCursed      ? 'mi-table-row--cursed'   : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={cls}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onClick?.()}
    >
      <span className="mi-row-range">{range}</span>
      <span className="mi-row-name">{entry.item_name}</span>
      {hasDesc   && <span className="mi-row-dot"   title="Has description">●</span>}
      {hasChild  && <span className="mi-row-arrow" title="Opens sub-table">›</span>}
    </div>
  );
}

// ── ItemDetailPane ─────────────────────────────────────────────────────────────
function ItemDetailPane({ state, onRollAgain }) {
  if (!state) return null;

  const { item, compositeName, compositeBonus, tableName, error, loading } = state;

  const displayName = compositeName ?? item?.name ?? '—';
  const isCursed    = compositeBonus < 0 || item?.cursed;
  const description = item?.description || item?.fallback_description || null;

  return (
    <>
      <div className="mi-pane-header">
        <div className="mi-pane-title">Pane 4 — Item Detail</div>
      </div>

      <div className="mi-detail-body">
        {loading && <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>}
        {error   && <div className="mi-pane-loading" style={{ color: 'var(--mi-cursed)' }}>{error}</div>}

        {!loading && (
          <>
            <h2 className="mi-detail-title">{displayName}</h2>

            <div className="mi-detail-badges">
              {compositeName && (
                <span className={`mi-composite-badge${isCursed ? ' mi-composite-badge--cursed' : ''}`}>
                  {isCursed ? '☠ Cursed ' : ''}
                  {compositeBonus != null && compositeBonus > 0 ? `+${compositeBonus}` : ''}
                  {compositeBonus != null && compositeBonus < 0 ? compositeBonus : ''}
                </span>
              )}
              {item?.category && (
                <span className="ic-cat-badge">{item.category}</span>
              )}
              {item?.cursed && !compositeName && (
                <span style={{ color: 'var(--mi-cursed)', fontSize: 12 }}>☠ Cursed</span>
              )}
              {item?.rarity && (
                <span className={`ic-rarity-badge ic-rarity-badge--${(item.rarity).toLowerCase().replace(/\s+/g,'-')}`}>
                  {item.rarity}
                </span>
              )}
              {tableName && (
                <span className="mi-meta-badge">Table {tableName}</span>
              )}
            </div>

            {/* Stats */}
            {item && (item.charges || item.value_gp || item.alignment || item.intelligence) && (
              <div className="mi-detail-stat-grid">
                {item.charges        && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Charges:</span><span className="mi-detail-stat-value">{item.charges}</span></div>}
                {item.value_gp       && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Value:</span><span className="mi-detail-stat-value">{item.value_gp.toLocaleString()} gp</span></div>}
                {item.alignment      && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Alignment:</span><span className="mi-detail-stat-value">{item.alignment}</span></div>}
                {item.intelligence   && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Intelligence:</span><span className="mi-detail-stat-value">{item.intelligence}</span></div>}
              </div>
            )}

            {/* Description */}
            {description ? (
              <>
                <div className="mi-detail-divider">
                  <span className="mi-detail-divider-label">Description</span>
                </div>
                <div className="mi-detail-text">
                  {description.split('\n').map((para, i) =>
                    para.trim() ? <p key={i}>{para.trim()}</p> : null
                  )}
                </div>
              </>
            ) : (
              !loading && (
                <div className="mi-detail-text" style={{ marginTop: 12, fontStyle: 'italic', opacity: 0.5 }}>
                  No wiki description available for this item.
                </div>
              )
            )}

            {/* Powers */}
            {item?.powers && (
              <>
                <div className="mi-detail-divider">
                  <span className="mi-detail-divider-label">Powers</span>
                </div>
                <div className="mi-detail-text">
                  {item.powers.split('\n').map((para, i) =>
                    para.trim() ? <p key={i}>{para.trim()}</p> : null
                  )}
                </div>
              </>
            )}

            {/* Source link */}
            {item?.source_url && (
              <a
                className="mi-detail-source-link"
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                📖 View on Fandom Wiki ↗
              </a>
            )}
          </>
        )}
      </div>

      {/* Roll-again footer */}
      <div className="mi-detail-roll-again">
        <button className="mi-dice-btn" onClick={onRollAgain}>
          🎲 Roll Again in this Category
        </button>
      </div>
    </>
  );
}

// ── DrillDown (main component) ─────────────────────────────────────────────────
export default function DrillDown() {
  // ── Pane 1 ─────────────────────────────────────────────────────────────────
  const [p1Selected, setP1Selected] = useState(null);   // TABLE_1 row
  const [p1RollKey,  setP1RollKey]  = useState(0);      // force DiceRoller anim replay

  // ── Pane 2 ─────────────────────────────────────────────────────────────────
  const [p2Data,     setP2Data]     = useState(null);   // { entries, table_name, dice, has_subtables }
  const [p2Loading,  setP2Loading]  = useState(false);
  const [p2Selected, setP2Selected] = useState(null);   // entry obj
  const [p2Subtab,   setP2Subtab]   = useState('1');    // '1'|'2'|'3' for R/S

  // ── Pane 3 ─────────────────────────────────────────────────────────────────
  const [p3Data,     setP3Data]     = useState(null);   // { entries, dice, mode:'bonus'|'special' }
  const [p3Loading,  setP3Loading]  = useState(false);
  const [p3Selected, setP3Selected] = useState(null);

  // ── Pane 4 ─────────────────────────────────────────────────────────────────
  const [p4State, setP4State]  = useState(null);  // { item, compositeName, compositeBonus, tableName, loading, error }
  const [p4Load,  setP4Load]   = useState(false);

  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 700;

  // ── Determine which pane is the "most right active" for mobile ──────────────
  const rightmostPane = p4State ? 4 : p3Data ? 3 : p2Data ? 2 : 1;

  // ── Fetch full item by id (if linked) or by name search ─────────────────────
  const fetchItem = useCallback(async (entry) => {
    if (!entry) return null;
    // Try by item_id first
    if (entry.item_id) {
      try {
        const full = await api.getMagicalItem(entry.item_id);
        return full;
      } catch { /* fall through */ }
    }
    // Fall back to name search
    try {
      const res = await api.searchMagicalItems({ search: entry.item_name, limit: 1 });
      return res?.items?.[0] ?? null;
    } catch { return null; }
  }, []);

  // ── Clear downstream panes when p1 changes ──────────────────────────────────
  function clearFrom(level) {
    if (level <= 2) { setP2Data(null); setP2Selected(null); setP2Subtab('1'); }
    if (level <= 3) { setP3Data(null); setP3Selected(null); }
    if (level <= 4) { setP4State(null); }
  }

  // ── Pane 1 click / roll ────────────────────────────────────────────────────
  async function selectP1(row) {
    clearFrom(2);
    setP1Selected(row);
    setP2Loading(true);

    try {
      const isComplex = COMPLEX_TABLES.includes(row.table);
      // For complex tables, load subtab 1 (generic) by default
      const opts = isComplex ? { subtable: '1' } : {};
      const data = await api.getTableEntries(row.table, opts);
      setP2Data({ ...data, isComplex });
      setP2Subtab('1');
    } catch (e) {
      setP2Data({ entries: [], table_name: row.category, dice: row.dice, isComplex: false, error: e.message });
    } finally {
      setP2Loading(false);
    }
  }

  function handleP1Roll(n) {
    const row = TABLE_1.find(r => n >= r.rollMin && n <= r.rollMax);
    if (row) selectP1(row);
  }

  // ── Pane 2 subtab change (R/S only) ───────────────────────────────────────
  async function changeP2Subtab(tab) {
    if (!p1Selected) return;
    setP2Subtab(tab);
    clearFrom(3);
    setP2Loading(true);
    try {
      const data = await api.getTableEntries(p1Selected.table, { subtable: tab });
      setP2Data(prev => ({ ...prev, ...data }));
    } catch { /* keep existing */ }
    finally { setP2Loading(false); }
  }

  // ── Pane 2 click ──────────────────────────────────────────────────────────
  async function selectP2(entry) {
    clearFrom(3);
    setP2Selected(entry);

    const isComplex = p1Selected && COMPLEX_TABLES.includes(p1Selected.table);

    if (!isComplex || p2Subtab === '3') {
      // Simple table or S3/R3 special: go straight to Pane 4
      openP4FromEntry(entry, p1Selected?.table);
      return;
    }

    if (p2Subtab === '2') {
      // Clicked a bonus row directly in the subtab — just show as detail
      setP4State({
        item:          null,
        compositeName: `${entry.item_name} bonus`,
        compositeBonus: entry.bonus,
        tableName:     `${p1Selected.table}2`,
        loading:       false,
        error:         null,
      });
      return;
    }

    // p2Subtab === '1': generic weapon/armor selected
    if (entry.roll_min >= 975) {
      // Special entry in S1 (975+): load S3
      setP3Loading(true);
      try {
        const data = await api.getTableEntries(p1Selected.table, { subtable: '3' });
        setP3Data({ ...data, mode: 'special' });
      } catch (e) {
        setP3Data({ entries: [], mode: 'special', dice: 'd100', table_name: 'Special', error: e.message });
      } finally {
        setP3Loading(false);
      }
    } else {
      // Generic weapon: load S2 bonus table for Pane 3
      setP3Loading(true);
      try {
        const data = await api.getTableEntries(p1Selected.table, { subtable: '2' });
        setP3Data({ ...data, mode: 'bonus', weaponEntry: entry });
      } catch (e) {
        setP3Data({ entries: [], mode: 'bonus', dice: 'd20', table_name: 'Bonus', weaponEntry: entry, error: e.message });
      } finally {
        setP3Loading(false);
      }
    }
  }

  function handleP2Roll(n) {
    if (!p2Data?.entries?.length) return;
    const entry = findTableRow(p2Data.entries, n);
    if (entry) selectP2(entry);
  }

  // ── Pane 3 click ──────────────────────────────────────────────────────────
  async function selectP3(entry) {
    setP3Selected(entry);

    if (p3Data?.mode === 'bonus') {
      // Composite: generic weapon + bonus
      const weaponEntry = p3Data.weaponEntry ?? p2Selected;
      const isCursed    = entry.bonus < 0;
      const sign        = entry.bonus > 0 ? '+' : '';
      const composite   = `${weaponEntry?.item_name ?? 'Weapon'} ${sign}${entry.bonus}`;

      setP4State({
        item:           null,
        compositeName:  composite,
        compositeBonus: entry.bonus,
        tableName:      p1Selected?.table,
        loading:        true,
        error:          null,
      });
      // Try to fetch the base weapon's description
      const baseItem = await fetchItem(weaponEntry);
      setP4State(prev => ({
        ...prev,
        item:    baseItem ?? { name: weaponEntry?.item_name, cursed: isCursed },
        loading: false,
      }));
    } else {
      // Special item: fetch full detail
      openP4FromEntry(entry, p1Selected?.table);
    }
  }

  function handleP3Roll(n) {
    if (!p3Data?.entries?.length) return;
    const entry = findTableRow(p3Data.entries, n);
    if (entry) selectP3(entry);
  }

  // ── Open Pane 4 with a specific entry ─────────────────────────────────────
  async function openP4FromEntry(entry, tableLetter) {
    setP4Load(true);
    setP4State({ item: null, compositeName: null, compositeBonus: null, tableName: tableLetter, loading: true, error: null });
    try {
      const item = await fetchItem(entry);
      setP4State({
        item:           item ?? { name: entry.item_name, description: entry.notes ?? null },
        compositeName:  null,
        compositeBonus: null,
        tableName:      tableLetter,
        loading:        false,
        error:          null,
      });
    } catch (e) {
      setP4State(prev => ({ ...prev, loading: false, error: e.message }));
    } finally {
      setP4Load(false);
    }
  }

  // ── Roll again in current category ────────────────────────────────────────
  function handleRollAgain() {
    if (!p1Selected || !p2Data?.entries?.length) return;
    const sides = parseSides(p2Data.dice ?? p1Selected.dice);
    const n     = rollDie(sides);
    const entry = findTableRow(p2Data.entries, n);
    if (entry) {
      selectP2(entry);
    }
  }

  // ── Derived visibility ─────────────────────────────────────────────────────
  const showP2 = !!p1Selected;
  const showP3 = showP2 && p3Data != null;
  const showP4 = p4State != null;

  // ── Pane 2 entries: may come from data or be loading ──────────────────────
  const p2Entries = p2Data?.entries ?? [];
  const p3Entries = p3Data?.entries ?? [];

  // ── Mobile: only show rightmost pane ───────────────────────────────────────
  function paneClass(num) {
    const base = num === 1 ? '' : num === 4 ? ' mi-pane--detail' : '';
    const visible = rightmostPane >= num;
    const isMobileVisible = rightmostPane === num;
    return `mi-pane${base}${!visible ? ' mi-pane--empty' : ''}${isMobileVisible ? ' mi-pane--mobile-visible' : ''}`;
  }

  return (
    <div className="mi-drilldown">

      {/* ── PANE 1: Table 1 Overview ──────────────────────────────────────── */}
      <div className={`mi-pane${rightmostPane === 1 ? ' mi-pane--mobile-visible' : ''}`}>
        <PaneHeader
          title="Table 1 — Overview"
          subtitle="Roll d100"
          dice="d100"
          onRoll={handleP1Roll}
        />
        <div className="mi-pane-body">
          {TABLE_1.map(row => (
            <div
              key={row.table}
              className={[
                'mi-table-row',
                p1Selected?.table === row.table ? 'mi-table-row--selected' : '',
              ].filter(Boolean).join(' ')}
              onClick={() => selectP1(row)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && selectP1(row)}
            >
              <span className="mi-row-range">{row.label}</span>
              <span className="mi-row-name">{row.category}</span>
              <span className="mi-row-arrow">Table {row.table} ›</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── PANE 2: Category Table ────────────────────────────────────────── */}
      <div className={`${paneClass(2)} mi-pane--wide`}>
        {!showP2 ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">📜</div>
            <div className="mi-pane-placeholder-text">Select a category<br />from Table 1</div>
          </div>
        ) : (
          <>
            <PaneHeader
              title={`Table ${p1Selected.table} — ${p2Data?.table_name ?? p1Selected.category}`}
              subtitle={p2Data?.dice}
              dice={!p2Loading && p2Data ? p2Data.dice : null}
              onRoll={handleP2Roll}
            />

            {/* Subtabs for R/S */}
            {p2Data?.isComplex && !p2Loading && (
              <div className="mi-subtab-bar">
                {(SUBTAB_LABELS[p1Selected.table] ?? []).map(tab => (
                  <button
                    key={tab.id}
                    className={`mi-subtab${p2Subtab === tab.id ? ' mi-subtab--active' : ''}`}
                    onClick={() => changeP2Subtab(tab.id)}
                  >{tab.label}</button>
                ))}
              </div>
            )}

            <div className="mi-pane-body">
              {p2Loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading table…</div>
              ) : p2Entries.length === 0 ? (
                <div className="mi-pane-empty">
                  {p2Data?.error ?? 'No entries. Run the import script to populate table data.'}
                </div>
              ) : (
                p2Entries.map((entry, i) => (
                  <EntryRow
                    key={entry.id ?? i}
                    entry={entry}
                    selected={p2Selected?.id === entry.id && p2Selected?.roll_min === entry.roll_min}
                    dice={p2Data.dice}
                    onClick={() => selectP2(entry)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PANE 3: Subtable ─────────────────────────────────────────────── */}
      <div className={paneClass(3)}>
        {!showP3 ? (
          showP2 && p2Data?.isComplex ? (
            <div className="mi-pane-placeholder">
              <div className="mi-pane-placeholder-icon">⚔️</div>
              <div className="mi-pane-placeholder-text">Select a generic item<br />to roll for its bonus</div>
            </div>
          ) : null
        ) : (
          <>
            <PaneHeader
              title={p3Data.mode === 'bonus'
                ? `${p1Selected?.table}2 — ${p3Data.table_name ?? 'Bonus Table'}`
                : `${p1Selected?.table}3 — ${p3Data.table_name ?? 'Special Items'}`
              }
              subtitle={p3Data.dice}
              dice={p3Data.dice}
              onRoll={handleP3Roll}
            />
            <div className="mi-pane-body">
              {p3Loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
              ) : p3Entries.length === 0 ? (
                <div className="mi-pane-empty">{p3Data?.error ?? 'No entries.'}</div>
              ) : (
                p3Entries.map((entry, i) => (
                  <EntryRow
                    key={entry.id ?? i}
                    entry={entry}
                    selected={p3Selected?.id === entry.id && p3Selected?.roll_min === entry.roll_min}
                    dice={p3Data.dice}
                    onClick={() => selectP3(entry)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PANE 4: Item Detail ───────────────────────────────────────────── */}
      <div className={`${paneClass(4)} mi-pane--detail`}>
        {!showP4 ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">📖</div>
            <div className="mi-pane-placeholder-text">Select an item to view<br />its full description</div>
          </div>
        ) : (
          <ItemDetailPane
            state={p4State}
            onRollAgain={handleRollAgain}
          />
        )}
      </div>

    </div>
  );
}
