import React from 'react';
import './Spells.css';

/**
 * SpellCard — compact list item for a spell.
 * Props:
 *   spell       — spell object from the API
 *   selected    — bool, highlights the card
 *   onClick     — () => void
 *   actions     — optional ReactNode rendered at the bottom (used by SpellGenerator)
 */
export default function SpellCard({ spell, selected, onClick, actions }) {
  const isWizard  = spell.spell_group === 'wizard';
  const isPriest  = spell.spell_group === 'priest';
  const groupLabel = isWizard ? 'Wizard' : isPriest ? 'Priest' : spell.spell_group ?? '—';
  const badgeCls   = isWizard ? 'sc-badge sc-badge--wizard'
                   : isPriest ? 'sc-badge sc-badge--priest'
                   : 'sc-badge';

  const schoolOrSphere = isWizard
    ? (spell.school  ?? '')
    : (spell.sphere  ?? '');

  return (
    <div
      className={`sc-card${selected ? ' sc-card--selected' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onClick?.()}
    >
      <div className="sc-name-row">
        <span className="sc-name">{spell.name}</span>
        <span className={badgeCls}>{groupLabel}</span>
      </div>

      <div className="sc-info">
        <span className="sc-level">Lvl {spell.level ?? '—'}</span>
        {schoolOrSphere && (
          <span className="sc-school">{schoolOrSphere}</span>
        )}
        {spell.reversible && (
          <span className="sc-reversible" title="Reversible">⇄</span>
        )}
      </div>

      {actions && <div className="sc-actions">{actions}</div>}
    </div>
  );
}
