import React from 'react';
import './Spells.css';

/**
 * SpellDetail — full detail panel for a selected spell.
 * Props:
 *   spell       — full spell object (from GET /spells/:id)
 *   loading     — bool
 *   onClose     — () => void
 *   extraHeader — optional ReactNode after the title row
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

  const isWizard   = spell.spell_group === 'wizard';
  const isPriest   = spell.spell_group === 'priest';
  const groupLabel = isWizard ? 'Wizard' : isPriest ? 'Priest' : (spell.spell_group ?? '—');
  const badgeCls   = isWizard ? 'sc-badge sc-badge--wizard'
                   : isPriest ? 'sc-badge sc-badge--priest'
                   : 'sc-badge';

  const stats = [
    { label: 'Level',          value: spell.level         ?? '—',  full: false },
    { label: 'Group',          value: groupLabel,                   full: false },
    { label: 'School',         value: spell.school         || null, full: false },
    { label: 'Sphere',         value: spell.sphere         || null, full: false },
    { label: 'Casting Time',   value: spell.casting_time   || null, full: false },
    { label: 'Duration',       value: spell.duration       || null, full: false },
    { label: 'Range',          value: spell.range          || null, full: false },
    { label: 'Area of Effect', value: spell.area_of_effect || null, full: true  },
    { label: 'Saving Throw',   value: spell.saving_throw   || null, full: false },
    { label: 'Components',     value: spell.components     || null, full: false },
    { label: 'Reversible',     value: spell.reversible ? 'Yes' : 'No', full: false },
    { label: 'Source',         value: spell.source         || null, full: true  },
  ].filter(s => s.value !== null && s.value !== '—' || s.label === 'Level');

  return (
    <div className="sd-panel">
      {/* Header */}
      <div className="sd-header">
        <div className="sd-header-top">
          <h2 className="sd-name">{spell.name}</h2>
          {onClose && (
            <button className="sd-close" onClick={onClose} aria-label="Close detail">✕</button>
          )}
        </div>
        <div className="sd-badges">
          <span className={badgeCls}>{groupLabel}</span>
          <span className="sd-level-badge">Level {spell.level ?? '—'}</span>
          {spell.reversible && (
            <span className="sd-reversible-badge">⇄ Reversible</span>
          )}
        </div>
        {extraHeader && <div className="sd-extra-header">{extraHeader}</div>}
      </div>

      {/* Scrollable body */}
      <div className="sd-body">
        {/* Stats grid */}
        <div className="sd-stats-grid">
          {stats.map(s => (
            <div key={s.label} className={`sd-stat${s.full ? ' sd-stat--full' : ''}`}>
              <span className="sd-stat-label">{s.label}</span>
              <span className="sd-stat-value">{s.value}</span>
            </div>
          ))}
        </div>

        {/* Tags */}
        {spell.tags && spell.tags.length > 0 && (
          <div className="sd-section">
            <div className="sd-section-divider"><span className="sd-section-title">Tags</span></div>
            <div className="sd-tags">
              {spell.tags.map(t => (
                <span key={t} className="sd-tag">{t}</span>
              ))}
            </div>
          </div>
        )}

        {/* Description */}
        {spell.description && (
          <div className="sd-section">
            <div className="sd-section-divider"><span className="sd-section-title">Description</span></div>
            <div className="sd-description">
              {spell.description.split('\n').map((para, i) =>
                para.trim() ? <p key={i}>{para.trim()}</p> : null
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer — Add to Spellbook */}
      <div className="sd-footer">
        <button
          className="sd-spellbook-btn"
          disabled
          title="Coming soon: add this spell to a character's spellbook"
        >
          + Add to Spellbook
        </button>
      </div>
    </div>
  );
}
