/**
 * Sprint 3 — Settlement Composition (Advanced) panel.
 *
 * Collapsible UI under the city/village form fields. Each feature has an
 * Auto / Required / Excluded dropdown. Unavailable features (wrong
 * population size or wrong settlement role) are greyed out with a tooltip.
 *
 * Default closed so DMs aren't overwhelmed. Reset-all is a one-click escape
 * hatch back to pure Auto.
 */

import { useState, useMemo } from 'react';
import {
  getFeaturesByCategory,
  normalizePopulation,
  normalizeSettlementRole,
  isFeatureAvailable,
} from '../../rulesets/settlementFeatures.ts';

const PRESENCE_OPTIONS = [
  { value: 'auto',     label: 'Auto' },
  { value: 'required', label: '★ Required' },
  { value: 'excluded', label: '✗ Excluded' },
];

const SELECT_STYLE = {
  width:        118,
  fontSize:     '0.78rem',
  background:   'rgba(0, 0, 0, 0.35)',
  border:       '1px solid rgba(200, 168, 75, 0.25)',
  borderRadius: 4,
  color:        '#d4c090',
  padding:      '3px 6px',
  fontFamily:   'inherit',
  cursor:       'pointer',
};

function ChevronCaret({ open }) {
  return <span style={{ display: 'inline-block', width: 14, color: '#c8a84b' }}>{open ? '▼' : '▶'}</span>;
}

export function SettlementCompositionPanel({ population, settlement_role, presences, onChange }) {
  const [open, setOpen] = useState(false);
  const popSlug  = normalizePopulation(population);
  const roleSlug = normalizeSettlementRole(settlement_role);
  const cats     = useMemo(() => getFeaturesByCategory(), []);

  const overrideCount = Object.keys(presences ?? {}).length;

  const setPresence = (featureKey, value) => {
    const next = { ...(presences ?? {}) };
    if (value === 'auto') {
      delete next[featureKey];
    } else {
      next[featureKey] = value;
    }
    onChange(next);
  };
  const resetAll = () => onChange({});

  return (
    <div className="mgn-field" style={{ gridColumn: '1 / -1' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        style={{
          display:      'flex',
          alignItems:   'center',
          gap:          10,
          width:        '100%',
          padding:      '8px 12px',
          background:   'rgba(0, 0, 0, 0.35)',
          border:       '1px solid rgba(200, 168, 75, 0.22)',
          borderRadius: 6,
          color:        '#c8a84b',
          fontFamily:   'inherit',
          fontSize:     '0.85rem',
          letterSpacing:'0.5px',
          cursor:       'pointer',
          textAlign:    'left',
        }}
        title="Override which buildings appear in this settlement"
      >
        <ChevronCaret open={open} />
        <span style={{ flex: 1 }}>Settlement Composition (Advanced)</span>
        {overrideCount > 0 && (
          <span style={{ fontSize: '0.72rem', color: '#f5d97a' }}>
            {overrideCount} override{overrideCount === 1 ? '' : 's'}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          marginTop:    6,
          padding:      '10px 14px',
          background:   'rgba(0, 0, 0, 0.25)',
          border:       '1px solid rgba(200, 168, 75, 0.15)',
          borderRadius: 6,
        }}>
          <div style={{ fontSize: '0.74rem', color: '#9a875a', marginBottom: 12, lineHeight: 1.45 }}>
            Auto-defaults are rolled from Population + Settlement Role + per-feature rarity.
            Override individual buildings to <strong>Require</strong> them (always include) or{' '}
            <strong>Exclude</strong> them (never include). Greyed-out features aren't available
            for the current population size or settlement role.
          </div>

          {cats.map(cat => (
            <div key={cat.key} style={{ marginTop: 10 }}>
              <div style={{
                fontSize:     '0.7rem',
                letterSpacing:'0.12em',
                textTransform:'uppercase',
                color:        '#c8a84b',
                marginBottom: 4,
                opacity:      0.85,
              }}>
                {cat.label}
              </div>
              {cat.features.map(({ key, def }) => {
                const avail    = isFeatureAvailable(def, popSlug, roleSlug);
                const presence = presences?.[key] ?? 'auto';
                return (
                  <div key={key} style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        10,
                    padding:    '4px 0',
                    opacity:    avail.ok ? 1 : 0.45,
                  }}>
                    <span
                      title={avail.reason ?? def.description}
                      style={{ flex: 1, fontSize: '0.83rem', color: '#d4c090' }}
                    >
                      {def.label}
                      {def.dm_only_default && (
                        <span style={{ marginLeft: 6, fontSize: '0.66rem', color: '#9a875a' }}>(DM-only)</span>
                      )}
                    </span>
                    <select
                      value={presence}
                      disabled={!avail.ok}
                      title={avail.reason ?? def.description}
                      onChange={e => setPresence(key, e.target.value)}
                      style={SELECT_STYLE}
                    >
                      {PRESENCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          ))}

          <button
            type="button"
            onClick={resetAll}
            disabled={overrideCount === 0}
            style={{
              marginTop:    14,
              padding:      '5px 14px',
              background:   'rgba(0, 0, 0, 0.4)',
              border:       '1px solid rgba(200, 168, 75, 0.3)',
              borderRadius: 4,
              color:        overrideCount === 0 ? '#5a4a30' : '#c8a84b',
              fontFamily:   'inherit',
              fontSize:     '0.78rem',
              cursor:       overrideCount === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            ↺ Reset all to Auto
          </button>
        </div>
      )}
    </div>
  );
}
