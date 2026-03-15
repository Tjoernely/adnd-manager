import React from 'react';
import './Items.css';

/**
 * ItemCard — compact list item for a magical item.
 * Props:
 *   item      — item object from the API
 *   selected  — bool, highlights the card
 *   onClick   — () => void
 */
export default function ItemCard({ item, selected, onClick }) {
  // List endpoint returns description_preview (300 chars); detail endpoint returns full description.
  // fallback_description comes from random_item_tables.notes when description is null.
  const rawDesc = item.fallback_description || item.description_preview || item.description;
  const preview = rawDesc ? rawDesc.replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  const isInlineDesc = !item.description && !item.description_preview && !!item.fallback_description;

  const rarity = (item.rarity ?? 'common').toLowerCase().replace(/\s+/g, '-');

  return (
    <div
      className={`ic-card${selected ? ' ic-card--selected' : ''}${item.cursed ? ' ic-card--cursed' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      {/* Top row: name + cursed + table badge */}
      <div className="ic-top-row">
        <span className="ic-name">{item.name}</span>
        <div className="ic-badges">
          {item.cursed && <span className="ic-cursed-icon" title="Cursed">☠</span>}
          {item.table_letter && (
            <span className="ic-table-badge" title={`Table ${item.table_letter}`}>
              {item.table_letter}
            </span>
          )}
        </div>
      </div>

      {/* Meta row: category + rarity + charges */}
      <div className="ic-meta-row">
        {item.category && <span className="ic-cat-badge">{item.category}</span>}
        <span className={`ic-rarity-badge ic-rarity-badge--${rarity}`}>{item.rarity ?? 'Common'}</span>
        {item.charges != null && item.charges > 0 && (
          <span className="ic-charges">{item.charges} charges</span>
        )}
      </div>

      {/* Description preview */}
      {preview && (
        <div className={`ic-preview${isInlineDesc ? ' ic-preview--inline' : ''}`}>
          {preview}{preview.length >= 120 ? '…' : ''}
        </div>
      )}
    </div>
  );
}
