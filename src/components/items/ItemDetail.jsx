import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import './Items.css';

/**
 * ItemDetail — full detail panel for a selected magical item.
 * Props:
 *   item    — full item object (from GET /magical-items/:id)
 *   loading — bool
 *   onClose — () => void
 */
export default function ItemDetail({ item, loading, onClose }) {
  const [tableData,    setTableData]    = useState(null);
  const [tableLoading, setTableLoading] = useState(false);
  const [rollResult,   setRollResult]   = useState(null);
  const [rolling,      setRolling]      = useState(false);

  // Fetch table entries whenever the item's table_letter changes
  useEffect(() => {
    setRollResult(null);
    if (!item?.table_letter) { setTableData(null); return; }
    setTableLoading(true);
    api.getTableEntries(item.table_letter, 50)
      .then(setTableData)
      .catch(() => setTableData(null))
      .finally(() => setTableLoading(false));
  }, [item?.table_letter]);

  const handleRoll = useCallback(async () => {
    if (!item?.table_letter) return;
    setRolling(true);
    setRollResult(null);
    try {
      const res = await api.rollMagicalTable(item.table_letter);
      setRollResult(res);
    } catch (err) {
      setRollResult({ error: err.message });
    } finally {
      setRolling(false);
    }
  }, [item?.table_letter]);

  if (loading) {
    return (
      <div className="id-panel id-panel--loading">
        <div className="mi-spinner" />
      </div>
    );
  }

  if (!item) {
    return (
      <div className="id-panel id-panel--empty">
        <p className="id-empty-hint">Select an item to see its details</p>
      </div>
    );
  }

  const rarity = (item.rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');

  const stats = [
    { label: 'Category',     value: item.category       || null, full: false },
    { label: 'Rarity',       value: item.rarity         || null, full: false },
    { label: 'Table',        value: item.table_letter ? `Table ${item.table_letter}` : null, full: false },
    { label: 'Charges',      value: item.charges != null ? String(item.charges) : null, full: false },
    { label: 'Value (gp)',   value: item.value_gp != null ? item.value_gp.toLocaleString() : null, full: false },
    { label: 'Weight (lbs)', value: item.weight_lbs != null ? String(item.weight_lbs) : null, full: false },
    { label: 'Alignment',    value: item.alignment      || null, full: false },
    { label: 'Intelligence', value: item.intelligence != null ? String(item.intelligence) : null, full: false },
    { label: 'Ego',          value: item.ego != null ? String(item.ego) : null, full: false },
    { label: 'Classes',      value: Array.isArray(item.classes) && item.classes.length ? item.classes.join(', ') : null, full: true },
  ].filter(s => s.value !== null);

  return (
    <div className="id-panel">
      {/* Header */}
      <div className="id-header">
        <div className="id-header-top">
          <h2 className="id-name">{item.name}</h2>
          {onClose && (
            <button className="id-close" onClick={onClose} aria-label="Close detail">✕</button>
          )}
        </div>
        <div className="id-badges">
          {item.category && <span className="id-cat-badge">{item.category}</span>}
          <span className={`id-rarity-badge id-rarity-badge--${rarity}`}>{item.rarity ?? 'Common'}</span>
          {item.cursed && <span className="id-cursed-badge">☠ Cursed</span>}
        </div>
      </div>

      {/* Scrollable body */}
      <div className="id-body">
        {/* Stats grid */}
        {stats.length > 0 && (
          <div className="id-stats-grid">
            {stats.map(s => (
              <div key={s.label} className={`id-stat${s.full ? ' id-stat--full' : ''}`}>
                <span className="id-stat-label">{s.label}</span>
                <span className="id-stat-value">{s.value}</span>
              </div>
            ))}
          </div>
        )}

        {/* Description */}
        {item.description && (
          <div className="id-section">
            <div className="id-divider">
              <span className="id-divider-title">Description</span>
            </div>
            <div className="id-text">
              {item.description.split('\n').map((para, i) =>
                para.trim() ? <p key={i}>{para.trim()}</p> : null
              )}
            </div>
          </div>
        )}

        {/* Powers */}
        {item.powers && (
          <div className="id-section">
            <div className="id-divider">
              <span className="id-divider-title">Powers</span>
            </div>
            <div className="id-text">
              {item.powers.split('\n').map((para, i) =>
                para.trim() ? <p key={i}>{para.trim()}</p> : null
              )}
            </div>
          </div>
        )}

        {/* ── Subtable section ── */}
        {item.table_letter && (
          <div className="id-section">
            <div className="id-divider">
              <span className="id-divider-title">
                Roll on Table {item.table_letter}
                {tableData ? ` — ${tableData.table_name} (${tableData.dice})` : ''}
              </span>
            </div>

            {/* Roll button */}
            <button
              className="id-roll-table-btn"
              onClick={handleRoll}
              disabled={rolling}
            >
              {rolling ? 'Rolling…' : '🎲 Roll for specific type'}
            </button>

            {/* Roll result */}
            {rollResult && (
              <div className={`id-roll-result${rollResult.error ? ' id-roll-result--error' : ''}`}>
                {rollResult.error ? (
                  <span>{rollResult.error}</span>
                ) : (
                  <>
                    <span className="id-roll-result-die">({rollResult.roll})</span>
                    <span className="id-roll-result-name">
                      {rollResult.item?.name ?? rollResult.item_name}
                    </span>
                    {rollResult.item?.description && (
                      <p className="id-roll-result-desc">
                        {rollResult.item.description.slice(0, 160).trim()}
                        {rollResult.item.description.length > 160 ? '…' : ''}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Table entries list */}
            {tableLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', opacity: 0.6 }}>
                <div className="mi-spinner" style={{ width: 14, height: 14 }} />
                <span style={{ fontSize: 11 }}>Loading table…</span>
              </div>
            )}
            {tableData && tableData.entries.length > 0 && (
              <div className="id-table-entries">
                {tableData.entries.map((e, i) => (
                  <div key={i} className="id-table-entry">
                    <span className="id-table-entry-roll">
                      {e.roll_min === e.roll_max
                        ? e.roll_min
                        : `${e.roll_min}–${e.roll_max}`}
                    </span>
                    <span className="id-table-entry-name">{e.item_name}</span>
                  </div>
                ))}
                {tableData.total >= 50 && (
                  <p className="id-table-entries-more">
                    Showing first 50 entries — use 🎲 Roll above for random results.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import warnings */}
        {Array.isArray(item.import_warnings) && item.import_warnings.length > 0 && (
          <div className="id-section">
            <div className="id-divider">
              <span className="id-divider-title">Notes</span>
            </div>
            <ul className="id-text" style={{ paddingLeft: 18 }}>
              {item.import_warnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Source link */}
        {item.source_url && (
          <div className="id-source-link">
            <a href={item.source_url} target="_blank" rel="noopener noreferrer">
              View source ↗
            </a>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="id-footer">
        <button
          className="id-add-btn"
          disabled
          title="Coming soon: add this item to a campaign hoard"
        >
          + Add to Hoard
        </button>
      </div>
    </div>
  );
}
