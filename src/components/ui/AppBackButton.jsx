/**
 * Sprint 0 — global "← Back" button.
 *
 * Floats top-left over whatever screen is active. Self-hides when there's
 * nothing to go back to (i.e. the user is on the dashboard). Pops one entry
 * off App.jsx's screenStack — separate affordance from each module's own
 * "← Dashboard" button (which resets the whole stack to the dashboard).
 *
 * No styling-file dependency: inline styles match the AD&D gold-on-dark
 * palette and the chip lives outside every module's own header.
 */
export function AppBackButton({ canGoBack, onBack }) {
  if (!canGoBack) return null;
  return (
    <button
      type="button"
      onClick={onBack}
      aria-label="Go back one screen"
      title="Back one screen"
      style={{
        position:      'fixed',
        top:           6,
        right:         10,
        zIndex:        2000,
        background:    'rgba(0, 0, 0, 0.55)',
        border:        '1px solid rgba(200, 168, 75, 0.35)',
        borderRadius:  6,
        color:         '#c8a84b',
        fontFamily:    'inherit',
        fontSize:      11,
        letterSpacing: '0.5px',
        padding:       '5px 12px',
        cursor:        'pointer',
        boxShadow:     '0 2px 8px rgba(0, 0, 0, 0.5)',
        transition:    'color 0.15s, border-color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.color       = '#f5d97a';
        e.currentTarget.style.borderColor = 'rgba(200, 168, 75, 0.75)';
        e.currentTarget.style.background  = 'rgba(200, 168, 75, 0.18)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.color       = '#c8a84b';
        e.currentTarget.style.borderColor = 'rgba(200, 168, 75, 0.35)';
        e.currentTarget.style.background  = 'rgba(0, 0, 0, 0.55)';
      }}
    >
      ← Back
    </button>
  );
}
