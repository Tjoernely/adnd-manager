import React from 'react';
import './Items.css';

/**
 * ItemDetail — full detail panel for a selected magical item.
 * Props:
 *   item    — full item object (from GET /magical-items/:id)
 *   loading — bool
 *   onClose — () => void
 */
export default function ItemDetail({ item, loading, onClose }) {
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

  // Source table info from random_item_tables LATERAL join (GET /:id)
  const sourceTableLetter = item.source_table_letter ?? item.table_letter ?? null;
  const sourceRollMin     = item.source_roll_min ?? null;
  const sourceRollMax     = item.source_roll_max ?? null;
  const sourceTableValue  = sourceTableLetter
    ? (sourceRollMin != null
        ? `Table ${sourceTableLetter}, roll ${sourceRollMin}${sourceRollMax !== sourceRollMin ? `–${sourceRollMax}` : ''}`
        : `Table ${sourceTableLetter}`)
    : null;

  // Description: prefer wiki page description, fall back to inline table notes
  const effectiveDescription = item.description || item.fallback_description || null;
  const descIsInline = !item.description && !!item.fallback_description;

  const stats = [
    { label: 'Category',     value: item.category       || null, full: false },
    { label: 'Rarity',       value: item.rarity         || null, full: false },
    { label: 'Source Table', value: sourceTableValue,            full: false },
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

        {/* Description (or inline table notes as fallback) */}
        {effectiveDescription && (
          <div className="id-section">
            <div className="id-divider">
              <span className="id-divider-title">
                Description
                {descIsInline && <span className="id-divider-note"> (from table entry)</span>}
              </span>
            </div>
            <div className="id-text">
              {effectiveDescription.split('\n').map((para, i) =>
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

    </div>
  );
}
