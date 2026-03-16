import { useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import DiceRoller from './DiceRoller.jsx';
import './Items.css';

// ── Overview table (d100 master) ───────────────────────────────────────────
const TABLE_1 = [
  { rollMin:  1, rollMax: 20, label: '01–20', category: 'Magical Liquids',             table: 'A', dice: 'd20'   },
  { rollMin: 21, rollMax: 35, label: '21–35', category: 'Scrolls',                     table: 'B', dice: 'd20'   },
  { rollMin: 36, rollMax: 40, label: '36–40', category: 'Rings',                       table: 'C', dice: 'd20'   },
  { rollMin: 41, rollMax: 45, label: '41–45', category: 'Rods',                        table: 'D', dice: 'd20'   },
  { rollMin: 46, rollMax: 50, label: '46–50', category: 'Staves',                      table: 'E', dice: 'd20'   },
  { rollMin: 51, rollMax: 55, label: '51–55', category: 'Wands',                       table: 'F', dice: 'd20'   },
  { rollMin: 56, rollMax: 60, label: '56–60', category: 'Books & Tomes',               table: 'G', dice: 'd20'   },
  { rollMin: 61, rollMax: 65, label: '61–65', category: 'Gems & Jewelry',              table: 'H', dice: 'd20'   },
  { rollMin: 66, rollMax: 68, label: '66–68', category: 'Clothing',                    table: 'I', dice: 'd20'   },
  { rollMin: 69, rollMax: 72, label: '69–72', category: 'Boots, Gloves & Accessories', table: 'J', dice: 'd20'   },
  { rollMin: 73, rollMax: 74, label: '73–74', category: 'Girdles & Helmets',           table: 'K', dice: 'd20'   },
  { rollMin: 75, rollMax: 77, label: '75–77', category: 'Bags, Bands & Bottles',       table: 'L', dice: 'd20'   },
  { rollMin: 78, rollMax: 80, label: '78–80', category: 'Dusts & Stones',              table: 'M', dice: 'd20'   },
  { rollMin: 81, rollMax: 83, label: '81–83', category: 'Household Items',             table: 'N', dice: 'd20'   },
  { rollMin: 84, rollMax: 85, label: '84–85', category: 'Musical Instruments',         table: 'O', dice: 'd20'   },
  { rollMin: 86, rollMax: 87, label: '86–87', category: 'Weird Stuff',                 table: 'P', dice: 'd20'   },
  { rollMin: 88, rollMax: 89, label: '88–89', category: 'Humorous Items',              table: 'Q', dice: 'd20'   },
  { rollMin: 90, rollMax: 95, label: '90–95', category: 'Armor & Shields',             table: 'R', dice: 'd100'  },
  { rollMin: 96, rollMax: 99, label: '96–99', category: 'Weapons',                     table: 'S', dice: 'd1000' },
  { rollMin:100, rollMax:100, label: '00',    category: 'Artifacts & Relics',          table: 'T', dice: 'd20'   },
];

const COMPLEX_TABLES    = ['R', 'S'];
const SPECIAL_THRESHOLD = 975;
const SPECIAL_ROW       = { id: '__special__', roll_min: 975, roll_max: 1000, item_name: '✦ Special', isSpecialRow: true };

const COMPLEX_CFG = {
  S: { col1: 'Attack Adj.', col2: 'Damage Adj.', specialTitle: 'S3 — Special Weapons', bonus2Title: 'S2 — Weapon Bonus' },
  R: { col1: 'AC Bonus',    col2: 'vs Missiles',  specialTitle: 'R3 — Special Armor',   bonus2Title: 'R2 — Armor Bonus'  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function rollDie(sides) { return Math.floor(Math.random() * sides) + 1; }
function parseSides(d)  { const m = String(d ?? 'd20').match(/d(\d+)/i); return m ? +m[1] : 20; }

function padRoll(n, sides) {
  if (sides >= 1000) return String(n).padStart(3, '0');
  if (sides >= 100)  return n === 100 ? '00' : String(n).padStart(2, '0');
  return String(n).padStart(2, '0');
}

function fmtRange(min, max, dice) {
  if (min >= SPECIAL_THRESHOLD) return '975–000';
  const s = parseSides(dice);
  const p = n => padRoll(n, s);
  return min === max ? p(min) : `${p(min)}–${p(max)}`;
}

function findRow(entries, n) {
  return entries.find(e => n >= e.roll_min && n <= e.roll_max) ?? null;
}

// ── Sub-components ─────────────────────────────────────────────────────────

function PaneHeader({ title, subtitle, extra }) {
  return (
    <div className="mi-pane-header">
      <div className="mi-pane-title">{title}</div>
      {subtitle && <div className="mi-pane-subtitle">{subtitle}</div>}
      {extra && <div className="mi-pane-dice-row">{extra}</div>}
    </div>
  );
}

function TableRow({ entry, selected, dice, onClick }) {
  const isSpecial = entry.isSpecialRow || entry.roll_min >= SPECIAL_THRESHOLD;
  const isCursed  = !entry.isSpecialRow && (entry.cursed || entry.bonus < 0);
  const range     = entry.isSpecialRow ? '975–000' : fmtRange(entry.roll_min, entry.roll_max, dice);
  const hasDesc   = !entry.isSpecialRow && !!(entry.notes || entry.description);

  const cls = [
    'mi-table-row',
    selected  ? 'mi-table-row--selected' : '',
    isSpecial ? 'mi-table-row--special'  : '',
    isCursed  ? 'mi-table-row--cursed'   : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      <span className="mi-row-range">{range}</span>
      <span className="mi-row-name">{entry.item_name}</span>
      {hasDesc && <span className="mi-row-dot" title="Has description">●</span>}
      {(isSpecial || entry.has_children) && <span className="mi-row-arrow">›</span>}
    </div>
  );
}

function BonusRow({ entry, selected, onClick }) {
  const isCursed = entry.bonus < 0 || entry.cursed;
  const cls = [
    'mi-bonus-row',
    selected ? 'mi-bonus-row--selected' : '',
    isCursed ? 'mi-bonus-row--cursed'   : '',
  ].filter(Boolean).join(' ');
  return (
    <div className={cls} onClick={onClick} role="button" tabIndex={0}
         onKeyDown={e => e.key === 'Enter' && onClick?.()}>
      <span className="mi-bonus-row-range">{entry.roll_min}–{entry.roll_max}</span>
      <span className="mi-bonus-row-name">{entry.item_name}</span>
    </div>
  );
}

function ItemDetailBody({ item, compositeName, compositeAtk, compositeDmg, tableLetter, onRollAgain }) {
  if (!item && !compositeName) return null;

  const isCursed    = (compositeAtk?.bonus ?? 0) < 0 || (compositeDmg?.bonus ?? 0) < 0 || !!item?.cursed;
  const displayName = compositeName ?? item?.name ?? '—';
  const description = item?.description || item?.fallback_description || null;

  return (
    <>
      <div className="mi-detail-body">
        <h2 className={`mi-result-name${isCursed ? ' mi-result-name--cursed' : ''}`}>
          {displayName}
        </h2>

        {compositeName && (compositeAtk || compositeDmg) && (
          <div className="mi-result-subtitle">
            {compositeAtk && `${compositeAtk.item_name}`}
            {compositeAtk && compositeDmg && '  ·  '}
            {compositeDmg && `${compositeDmg.item_name}`}
          </div>
        )}

        {isCursed && (
          <div className="mi-result-cursed-warning">☠ Cursed — handle with care!</div>
        )}

        <div className="mi-detail-badges">
          {tableLetter && <span className="mi-meta-badge">Table {tableLetter}</span>}
          {item?.category && <span className="ic-cat-badge">{item.category}</span>}
          {item?.rarity && (
            <span className={`ic-rarity-badge ic-rarity-badge--${item.rarity.toLowerCase().replace(/\s+/g, '-')}`}>
              {item.rarity}
            </span>
          )}
          {item?.cursed && !compositeName && (
            <span className="mi-meta-badge mi-meta-badge--cursed">☠ Cursed</span>
          )}
        </div>

        {item && (item.charges || item.value_gp || item.alignment || item.intelligence) && (
          <div className="mi-detail-stat-grid">
            {item.charges      && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Charges:</span> <span className="mi-detail-stat-value">{item.charges}</span></div>}
            {item.value_gp     && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Value:</span> <span className="mi-detail-stat-value">{item.value_gp.toLocaleString()} gp</span></div>}
            {item.alignment    && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Alignment:</span> <span className="mi-detail-stat-value">{item.alignment}</span></div>}
            {item.intelligence && <div className="mi-detail-stat"><span className="mi-detail-stat-label">Intelligence:</span> <span className="mi-detail-stat-value">{item.intelligence}</span></div>}
          </div>
        )}

        {description ? (
          <>
            <div className="mi-detail-divider"><span className="mi-detail-divider-label">Description</span></div>
            <div className="mi-detail-text">
              {description.split('\n').map((para, i) =>
                para.trim() ? <p key={i}>{para.trim()}</p> : null
              )}
            </div>
          </>
        ) : (
          <div className="mi-detail-text" style={{ marginTop: 12, fontStyle: 'italic', opacity: 0.45 }}>
            No wiki description available for this item.
          </div>
        )}

        {item?.powers && (
          <>
            <div className="mi-detail-divider"><span className="mi-detail-divider-label">Powers</span></div>
            <div className="mi-detail-text">
              {item.powers.split('\n').map((para, i) =>
                para.trim() ? <p key={i}>{para.trim()}</p> : null
              )}
            </div>
          </>
        )}

        {item?.source_url && (
          <a className="mi-detail-source-link" href={item.source_url} target="_blank" rel="noopener noreferrer">
            📖 View on Fandom Wiki ↗
          </a>
        )}
      </div>

      {onRollAgain && (
        <div className="mi-detail-roll-again">
          <button className="mi-dice-btn" onClick={onRollAgain}>🎲 Roll Again in Category</button>
        </div>
      )}
    </>
  );
}

// ── DrillDown (main) ────────────────────────────────────────────────────────
export default function DrillDown() {

  // Pane 1
  const [p1Sel,      setP1Sel]      = useState(null);   // TABLE_1 row

  // Pane 2
  const [p2Data,     setP2Data]     = useState(null);   // { entries, table_name, dice, isComplex }
  const [p2Loading,  setP2Loading]  = useState(false);
  const [p2Sel,      setP2Sel]      = useState(null);   // selected entry

  // Pane 3
  const [p3Mode,     setP3Mode]     = useState(null);   // 'detail' | 'bonus' | 'special'
  const [p3Data,     setP3Data]     = useState(null);   // varies by mode
  const [p3Loading,  setP3Loading]  = useState(false);
  const [p3AtkSel,   setP3AtkSel]  = useState(null);   // bonus mode: attack bonus entry
  const [p3DmgSel,   setP3DmgSel]  = useState(null);   // bonus mode: damage bonus entry
  const [p3SpecSel,  setP3SpecSel] = useState(null);   // special mode: selected entry

  // Pane 4
  const [p4State,    setP4State]    = useState(null);   // { item, compositeName, compositeAtk, compositeDmg, loading, error }

  // Dual-roll animation
  const [dualRolling, setDualRolling] = useState(false);
  const [dualResult,  setDualResult]  = useState(null); // [atkN, dmgN]

  // ── Fetch item by entry ────────────────────────────────────────────────────
  const fetchItem = useCallback(async (entry) => {
    if (!entry) return null;
    if (entry.item_id) {
      try { return await api.getMagicalItem(entry.item_id); } catch { /* fall through */ }
    }
    try {
      const res = await api.searchMagicalItems({ search: entry.item_name, limit: 1 });
      return res?.items?.[0] ?? null;
    } catch { return null; }
  }, []);

  // ── Clear downstream state ─────────────────────────────────────────────────
  function clearFrom(level) {
    if (level <= 2) { setP2Data(null); setP2Sel(null); }
    if (level <= 3) { setP3Mode(null); setP3Data(null); setP3AtkSel(null); setP3DmgSel(null); setP3SpecSel(null); setDualResult(null); }
    if (level <= 4) { setP4State(null); }
  }

  // ── Pane 1 select ──────────────────────────────────────────────────────────
  async function selectP1(row) {
    clearFrom(2);
    setP1Sel(row);
    setP2Loading(true);
    try {
      const isComplex = COMPLEX_TABLES.includes(row.table);
      const opts      = isComplex ? { subtable: '1' } : {};
      const data      = await api.getTableEntries(row.table, opts);
      setP2Data({ ...data, isComplex });
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

  // ── Pane 2 select ──────────────────────────────────────────────────────────
  async function selectP2(entry) {
    clearFrom(3);
    setP2Sel(entry);

    const isComplex = !!(p1Sel && COMPLEX_TABLES.includes(p1Sel.table));

    if (!isComplex) {
      // Simple category: Pane 3 = full item detail
      setP3Mode('detail');
      setP3Loading(true);
      try {
        const item = await fetchItem(entry);
        setP3Data({ item: item ?? { name: entry.item_name, description: entry.notes ?? null } });
      } catch (e) {
        setP3Data({ item: null, error: e.message });
      } finally {
        setP3Loading(false);
      }
      return;
    }

    if (entry.isSpecialRow) {
      // Special synthetic row: Pane 3 = S3/R3 list
      setP3Mode('special');
      setP3Loading(true);
      try {
        const data = await api.getTableEntries(p1Sel.table, { subtable: '3' });
        setP3Data(data);
      } catch (e) {
        setP3Data({ entries: [], dice: 'd100', table_name: 'Special Items', error: e.message });
      } finally {
        setP3Loading(false);
      }
      return;
    }

    // Generic weapon/armor: Pane 3 = two bonus columns (S2/R2)
    setP3Mode('bonus');
    setP3Loading(true);
    try {
      const data = await api.getTableEntries(p1Sel.table, { subtable: '2' });
      setP3Data({ bonusEntries: data.entries ?? [], dice: data.dice ?? 'd20', table_name: data.table_name });
    } catch (e) {
      setP3Data({ bonusEntries: [], dice: 'd20', table_name: 'Bonus', error: e.message });
    } finally {
      setP3Loading(false);
    }
  }

  function handleP2Roll(n) {
    if (!p2Data) return;
    // For complex tables: entries < 975 = generic, 975+ = special
    const generic = (p2Data.entries ?? []).filter(e => e.roll_min < SPECIAL_THRESHOLD);
    const entry   = findRow(generic, n) ?? (n >= SPECIAL_THRESHOLD ? SPECIAL_ROW : null);
    if (entry) selectP2(entry);
  }

  // ── Open Pane 4 composite (weapon + atk + dmg bonuses) ────────────────────
  async function openP4Composite(baseEntry, atkEntry, dmgEntry) {
    const atkStr    = atkEntry?.item_name ?? '?';
    const dmgStr    = dmgEntry?.item_name ?? '?';
    const composite = `${baseEntry?.item_name ?? 'Weapon'} ${atkStr} / ${dmgStr}`;
    setP4State({ item: null, compositeName: composite, compositeAtk: atkEntry, compositeDmg: dmgEntry, loading: true, error: null });
    const item = await fetchItem(baseEntry);
    setP4State(prev => ({
      ...prev,
      item:    item ?? { name: baseEntry?.item_name, cursed: (atkEntry?.bonus < 0 || dmgEntry?.bonus < 0) },
      loading: false,
    }));
  }

  // ── Bonus column selections ────────────────────────────────────────────────
  function selectBonusAtk(entry) {
    setP3AtkSel(entry);
    if (p3DmgSel) openP4Composite(p2Sel, entry, p3DmgSel);
  }

  function selectBonusDmg(entry) {
    setP3DmgSel(entry);
    if (p3AtkSel) openP4Composite(p2Sel, p3AtkSel, entry);
  }

  // ── Both-d20 roll ─────────────────────────────────────────────────────────
  function handleBothRoll() {
    if (dualRolling || !p3Data?.bonusEntries?.length) return;
    setDualRolling(true);
    setDualResult(null);
    setTimeout(() => {
      const atkN     = rollDie(20);
      const dmgN     = rollDie(20);
      const atkEntry = findRow(p3Data.bonusEntries, atkN);
      const dmgEntry = findRow(p3Data.bonusEntries, dmgN);
      setP3AtkSel(atkEntry);
      setP3DmgSel(dmgEntry);
      setDualResult([atkN, dmgN]);
      setDualRolling(false);
      if (atkEntry && dmgEntry) openP4Composite(p2Sel, atkEntry, dmgEntry);
    }, 340);
  }

  // ── Pane 3 special select → Pane 4 ───────────────────────────────────────
  async function selectP3Special(entry) {
    setP3SpecSel(entry);
    setP4State({ item: null, compositeName: null, compositeAtk: null, compositeDmg: null, loading: true, error: null });
    try {
      const item = await fetchItem(entry);
      setP4State({
        item:          item ?? { name: entry.item_name, description: entry.notes ?? null },
        compositeName: null, compositeAtk: null, compositeDmg: null,
        loading: false, error: null,
      });
    } catch (e) {
      setP4State(prev => ({ ...prev, loading: false, error: e.message }));
    }
  }

  function handleP3SpecRoll(n) {
    if (!p3Data?.entries?.length) return;
    const entry = findRow(p3Data.entries, n);
    if (entry) selectP3Special(entry);
  }

  // ── Roll again ────────────────────────────────────────────────────────────
  function handleRollAgain() {
    if (!p1Sel || !p2Data?.entries?.length) return;
    const generic = (p2Data.entries ?? []).filter(e => e.roll_min < SPECIAL_THRESHOLD);
    const sides   = parseSides(p1Sel.dice);
    const n       = rollDie(sides);
    const entry   = findRow(generic, n) ?? (n >= SPECIAL_THRESHOLD ? SPECIAL_ROW : null);
    if (entry) selectP2(entry);
  }

  // ── Derived visibility ────────────────────────────────────────────────────
  const isComplex = !!(p1Sel && COMPLEX_TABLES.includes(p1Sel.table));
  const showP2    = !!p1Sel;
  const showP3    = showP2 && (isComplex || p3Mode !== null);
  const showP4    = isComplex && (p3Mode === 'bonus' || p3Mode === 'special');
  const rightmost = (showP4 && p4State) ? 4 : (showP3 && p3Mode) ? 3 : showP2 ? 2 : 1;

  // P2 entries — for complex: generic only + synthetic special row at bottom
  const p2Entries = p2Data
    ? [...(p2Data.entries ?? []).filter(e => e.roll_min < SPECIAL_THRESHOLD), ...(isComplex ? [SPECIAL_ROW] : [])]
    : [];

  const cfg = p1Sel ? COMPLEX_CFG[p1Sel.table] : null;

  // ── Pane class helper ─────────────────────────────────────────────────────
  function paneClass(num) {
    const visible    = num === 1 ? true : num === 2 ? showP2 : num === 3 ? showP3 : num === 4 ? showP4 : false;
    const detailMode = p3Mode === 'detail' && num === 3;
    const isFixed    = visible && num <= 3 && !detailMode;
    const isExpand   = visible && (detailMode || num === 4);
    const mobileVis  = rightmost === num;
    return [
      'mi-pane',
      !visible  ? 'mi-pane--empty'         : '',
      isFixed   ? 'mi-pane--dd-fixed'      : '',
      isExpand  ? 'mi-pane--dd-expand'     : '',
      mobileVis ? 'mi-pane--mobile-visible': '',
    ].filter(Boolean).join(' ');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="mi-drilldown mi-drilldown--warm">

      {/* ── PANE 1: Overview ─────────────────────────────────────────────── */}
      <div className={paneClass(1)}>
        <PaneHeader
          title="Table 1 — Overview"
          subtitle="Roll d100"
          extra={<DiceRoller sides={100} label="d100" onRoll={handleP1Roll} />}
        />
        <div className="mi-pane-body">
          {TABLE_1.map(row => (
            <div
              key={row.table}
              className={['mi-table-row', p1Sel?.table === row.table ? 'mi-table-row--selected' : ''].filter(Boolean).join(' ')}
              onClick={() => selectP1(row)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && selectP1(row)}
            >
              <span className="mi-row-range">{row.label}</span>
              <span className="mi-row-name">{row.category}</span>
              <span className="mi-row-arrow" style={{ fontSize: 9 }}>Tbl {row.table}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── PANE 2: Category Table ───────────────────────────────────────── */}
      <div className={paneClass(2)}>
        {!showP2 ? (
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">📜</div>
            <div className="mi-pane-placeholder-text">Select a category<br />from Table 1</div>
          </div>
        ) : (
          <>
            <PaneHeader
              title={`Table ${p1Sel.table} — ${p2Data?.table_name ?? p1Sel.category}`}
              subtitle={p1Sel.dice}
              extra={!p2Loading && p2Data && (
                <DiceRoller
                  sides={parseSides(p1Sel.dice)}
                  label={p1Sel.dice}
                  onRoll={handleP2Roll}
                />
              )}
            />
            <div className="mi-pane-body">
              {p2Loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
              ) : p2Entries.length === 0 ? (
                <div className="mi-pane-empty">{p2Data?.error ?? 'No entries found.'}</div>
              ) : (
                p2Entries.map((entry, i) => (
                  <TableRow
                    key={entry.id ?? `row-${i}`}
                    entry={entry}
                    selected={
                      entry.isSpecialRow
                        ? !!p2Sel?.isSpecialRow
                        : p2Sel?.id === entry.id && p2Sel?.roll_min === entry.roll_min
                    }
                    dice={p1Sel.dice}
                    onClick={() => selectP2(entry)}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* ── PANE 3: Bonus Columns / Special List / Item Detail ──────────── */}
      <div className={paneClass(3)}>
        {!p3Mode ? (
          /* Placeholder — visible for complex tables before p2 click */
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">{isComplex ? '⚔️' : '📖'}</div>
            <div className="mi-pane-placeholder-text">
              {isComplex ? 'Select an item\nto roll for its bonus' : 'Select an item\nfor its description'}
            </div>
          </div>
        ) : p3Mode === 'detail' ? (
          /* Simple category — full item detail fills this pane */
          <>
            <PaneHeader
              title={p2Sel?.item_name ?? 'Item Detail'}
              subtitle="Description"
              extra={<button className="mi-dice-btn" onClick={handleRollAgain}>🎲 Roll Again</button>}
            />
            {p3Loading ? (
              <div className="mi-pane-loading" style={{ flex: 1 }}><div className="mi-spinner" />Loading…</div>
            ) : p3Data?.error ? (
              <div className="mi-pane-empty" style={{ flex: 1 }}>{p3Data.error}</div>
            ) : (
              <ItemDetailBody item={p3Data?.item} tableLetter={p1Sel?.table} />
            )}
          </>
        ) : p3Mode === 'bonus' ? (
          /* Complex — two side-by-side bonus columns */
          <>
            <PaneHeader
              title={cfg?.bonus2Title ?? `${p1Sel?.table}2 — Bonus Table`}
              subtitle={p3Data?.dice ?? 'd20'}
              extra={
                <button
                  className={`mi-dice-btn${dualRolling ? ' mi-dice-btn--rolling' : ''}`}
                  onClick={handleBothRoll}
                  disabled={dualRolling || !p3Data?.bonusEntries?.length}
                >
                  {dualRolling ? '⏳' : '🎲'} Both d20
                  {dualResult && !dualRolling && (
                    <span className="mi-roll-result" style={{ fontSize: 11, marginLeft: 4 }}>
                      {dualResult[0]}/{dualResult[1]}
                    </span>
                  )}
                </button>
              }
            />
            {p3Loading ? (
              <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
            ) : p3Data?.error ? (
              <div className="mi-pane-empty">{p3Data.error}</div>
            ) : (
              <div className="mi-bonus-cols">
                {/* Attack / Bonus 1 column */}
                <div className="mi-bonus-col">
                  <div className="mi-bonus-col-head">{cfg?.col1 ?? 'Bonus 1'}</div>
                  <div className="mi-bonus-col-body">
                    {(p3Data?.bonusEntries ?? []).map((entry, i) => (
                      <BonusRow
                        key={entry.id ?? `atk-${i}`}
                        entry={entry}
                        selected={p3AtkSel?.roll_min === entry.roll_min && p3AtkSel?.item_name === entry.item_name}
                        onClick={() => selectBonusAtk(entry)}
                      />
                    ))}
                  </div>
                </div>
                {/* Damage / Bonus 2 column */}
                <div className="mi-bonus-col">
                  <div className="mi-bonus-col-head">{cfg?.col2 ?? 'Bonus 2'}</div>
                  <div className="mi-bonus-col-body">
                    {(p3Data?.bonusEntries ?? []).map((entry, i) => (
                      <BonusRow
                        key={entry.id ?? `dmg-${i}`}
                        entry={entry}
                        selected={p3DmgSel?.roll_min === entry.roll_min && p3DmgSel?.item_name === entry.item_name}
                        onClick={() => selectBonusDmg(entry)}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        ) : p3Mode === 'special' ? (
          /* Complex — special items list (S3/R3) */
          <>
            <PaneHeader
              title={cfg?.specialTitle ?? `${p1Sel?.table}3 — Special Items`}
              subtitle={p3Data?.dice ?? 'd100'}
              extra={!p3Loading && p3Data?.entries?.length > 0 && (
                <DiceRoller
                  sides={parseSides(p3Data.dice ?? 'd100')}
                  label={p3Data.dice ?? 'd100'}
                  onRoll={handleP3SpecRoll}
                />
              )}
            />
            <div className="mi-pane-body">
              {p3Loading ? (
                <div className="mi-pane-loading"><div className="mi-spinner" />Loading…</div>
              ) : !p3Data?.entries?.length ? (
                <div className="mi-pane-empty">{p3Data?.error ?? 'No special entries found.'}</div>
              ) : (
                (p3Data.entries ?? []).map((entry, i) => (
                  <TableRow
                    key={entry.id ?? `spec-${i}`}
                    entry={entry}
                    selected={p3SpecSel?.id === entry.id && p3SpecSel?.roll_min === entry.roll_min}
                    dice={p3Data.dice ?? 'd100'}
                    onClick={() => selectP3Special(entry)}
                  />
                ))
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* ── PANE 4: Result (complex R/S only) ───────────────────────────── */}
      <div className={paneClass(4)}>
        {!p4State ? (
          /* Placeholder shown while waiting for selections */
          <div className="mi-pane-placeholder">
            <div className="mi-pane-placeholder-icon">⚗️</div>
            <div className="mi-pane-placeholder-text">
              {p3Mode === 'bonus'
                ? (!p3AtkSel ? 'Select an attack bonus\nto begin' : 'Select a damage bonus\nto see the result')
                : 'Select a special item\nfor its full description'}
            </div>
          </div>
        ) : (
          <>
            <PaneHeader
              title="Result"
              extra={<button className="mi-dice-btn" onClick={handleRollAgain} style={{ fontSize: 10 }}>🎲 Roll Again</button>}
            />
            {p4State.loading ? (
              <div className="mi-pane-loading" style={{ flex: 1 }}><div className="mi-spinner" />Loading…</div>
            ) : p4State.error ? (
              <div className="mi-pane-empty" style={{ flex: 1 }}>{p4State.error}</div>
            ) : (
              <ItemDetailBody
                item={p4State.item}
                compositeName={p4State.compositeName}
                compositeAtk={p4State.compositeAtk}
                compositeDmg={p4State.compositeDmg}
                tableLetter={p1Sel?.table}
                onRollAgain={handleRollAgain}
              />
            )}
          </>
        )}
      </div>

    </div>
  );
}
