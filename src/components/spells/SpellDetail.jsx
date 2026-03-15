import React from 'react';
import './Spells.css';

/**
 * SpellDetail — full right-side detail panel for a selected spell.
 * Props:
 *   spell       — full spell object (from GET /spells/:id)
 *   loading     — bool
 *   onClose     — optional callback (mobile close button)
 *   extraHeader — optional ReactNode appended after the title row (e.g. keep/discard)
 */
export default function SpellDetail({ spell, loading, onClose, extraHeader }) {
  if (loading) {
    return (
      <div className="sd-panel sd-panel--loading">
        <div className="sl-spinner" />
      </div>
    );
  }

  if (!spell) {
    return (
      <div className="sd-panel sd-panel--empty">
        <p className="sd-empty-hint">Select a spell to see its details</p>
      </div>
    );
  }

  const isWizard = spell.spell_group === 'wizard';
  const isPriest = spell.spell_group === 'priest';

  const groupLabel = isWizard ? 'Wizard' : isPriest ? 'Priest' : (spell.spell_group ?? '—');
  const badgeCls   = isWizard ? 'sc-badge sc-badge--wizard'
                   : isPriest ? 'sc-badge sc-badge--priest'
                   : 'sc-badge';

  const stats = [
    { label: 'Level',          value: spell.level       ?? '—' },
    { label: 'Group',          value: groupLabel },
    { label: 'School',         value: spell.school       || '—' },
    { label: 'Sphere',         value: spell.sphere       || '—' },
    { label: 'Casting Time',   value: spell.casting_time || '—' },
    { label: 'Duration',       value: spell.duration     || '—' },
    { label: 'Range',          value: spell.range        || '—' },
    { label: 'Area of Effect', value: spell.area_of_effect || '—' },
    { label: 'Saving Throw',   value: spell.saving_throw || '—' },
    { label: 'Components',     value: spell.components   || '—' },
    { label: 'Reversible',     value: spell.reversible   ? 'Yes' : 'No' },
    { label: 'Source',         value: spell.source       || '—' },
  ].filter(s => s.value !== '—');

  return (
    <div className="sd-panel">
      {/* Header */}
      <div className="sd-header">
        <div className="sd-title-row">
          <h2 className="sd-title">{spell.name}</h2>
          <span className={badgeCls}>{groupLabel}</span>
          {onClose && (
            <button className="sd-close-btn" onClick={onClose} aria-label="Close detail">✕</button>
          )}
        </div>
        {extraHeader && <div className="sd-extra-header">{extraHeader}</div>}
      </div>

      <div className="sd-section-divider" />

      {/* Stats grid */}
      <div className="sd-stats-grid">
        {stats.map(s => (
          <React.Fragment key={s.label}>
            <span className="sd-stat-label">{s.label}</span>
            <span className="sd-stat-value">{s.value}</span>
          </React.Fragment>
        ))}
      </div>

      {/* Tags */}
      {spell.tags && spell.tags.length > 0 && (
        <>
          <div className="sd-section-divider" />
          <div className="sd-tags">
            {spell.tags.map(t => (
              <span key={t} className="sd-tag">{t}</span>
            ))}
          </div>
        </>
      )}

      {/* Description */}
      {spell.description && (
        <>
          <div className="sd-section-divider" />
          <div className="sd-description">
            {spell.description.split('\n').map((para, i) =>
              para.trim() ? <p key={i}>{para.trim()}</p> : null
            )}
          </div>
        </>
      )}
    </div>
  );
}
