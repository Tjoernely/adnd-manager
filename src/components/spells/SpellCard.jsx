import React from 'react';
import './Spells.css';

/**
 * SpellCard — compact list item for a spell.
 * Props:
 *   spell       — spell object from the API (may include description_preview)
 *   selected    — bool, highlights the card
 *   onClick     — () => void
 *   actions     — optional ReactNode rendered at the bottom (used by SpellGenerator)
 */
export default function SpellCard({ spell, selected, onClick, actions }) {
  const isWizard = spell.spell_group === 'wizard';
  const isPriest = spell.spell_group === 'priest';

  const groupLabel = isWizard ? 'Wizard' : isPriest ? 'Priest' : (spell.spell_group ?? '—');
  const badgeCls   = isWizard ? 'sc-badge sc-badge--wizard'
                   : isPriest ? 'sc-badge sc-badge--priest'
                   : 'sc-badge';

  const schoolOrSphere = isWizard ? (spell.school ?? '') : (spell.sphere ?? '');

  // One-line description preview (strip newlines, truncate)
  const preview = spell.description_preview
    ? spell.description_preview.replace(/\s+/g, ' ').trim().slice(0, 130)
    : null;

  return (
    <div
      className={`sc-card${selected ? ' sc-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      {/* Top row: name + group badge + reversible */}
      <div className="sc-top-row">
        <span className="sc-name">{spell.name}</span>
        <div className="sc-top-badges">
          {spell.reversible && (
            <span className="sc-reversible" title="Reversible">⇄</span>
          )}
          <span className={badgeCls}>{groupLabel}</span>
        </div>
      </div>

      {/* Meta row: level + school/sphere */}
      <div className="sc-meta-row">
        <span className="sc-level-badge">Lvl {spell.level ?? '—'}</span>
        {schoolOrSphere && (
          <span className="sc-school-badge">{schoolOrSphere}</span>
        )}
      </div>

      {/* Description preview */}
      {preview && (
        <div className="sc-preview">
          {preview}{preview.length >= 130 ? '…' : ''}
        </div>
      )}

      {actions && <div className="sc-actions">{actions}</div>}
    </div>
  );
}
