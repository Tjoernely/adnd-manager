/**
 * Sprint 3+6 — Settlement Composition (Advanced) panel.
 *
 * Collapsible UI under the city/village form fields. Each feature has an
 * Auto / 0 / 1-5 dropdown so the DM can pin an exact count (Sprint 6 rewrite
 * of the old Auto / Required / Excluded scheme). Unavailable features (wrong
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
  normalizeFeaturePresence,
  MAX_FEATURE_COUNT,
} from '../../rulesets/settlementFeatures.ts';

// Sprint 6: Auto + 0..MAX_FEATURE_COUNT. "0" labelled as "None (0)" so
// the dropdown reads naturally; counts 1..5 are bare numbers.
const PRESENCE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '0',    label: 'None (0)' },
  ...Array.from({ length: MAX_FEATURE_COUNT }, (_, i) => {
    const n = i + 1;
    return { value: String(n), label: String(n) };
  }),
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

  // Sprint 6 — override count counts any non-Auto entry (including 0/None).
  const overrideCount = Object.values(presences ?? {}).filter(v => {
    const n = normalizeFeaturePresence(v);
    return n !== 'auto';
  }).length;

  // Total POIs explicitly requested via numeric counts — surfaced in the
  // header so the DM knows how much they're piling onto the map.
  const explicitPoiTotal = Object.values(presences ?? {}).reduce((sum, v) => {
    const n = normalizeFeaturePresence(v);
    return typeof n === 'number' && n > 0 ? sum + n : sum;
  }, 0);

  const setPresence = (featureKey, valueStr) => {
    const next = { ...(presences ?? {}) };
    if (valueStr === 'auto') {
      delete next[featureKey];
    } else {
      // Persist as a number so consumers (autoSelectFeatures) get the new
      // shape directly without re-normalising. Legacy strings remain
      // tolerated on read via normalizeFeaturePresence.
      next[featureKey] = Number(valueStr);
    }
    onChange(next);
  };
  const resetAll = () => onChange({});

  // Translate stored value (number | 'auto' | legacy string) back to a
  // dropdown option value.
  const presenceToOption = (v) => {
    const n = normalizeFeaturePresence(v);
    return n === 'auto' ? 'auto' : String(n);
  };

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
            {explicitPoiTotal > 0 && (
              <span style={{ marginLeft: 6, color: '#9a875a' }}>
                · {explicitPoiTotal} forced POI{explicitPoiTotal === 1 ? '' : 's'}
              </span>
            )}
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
            Pick a number (1-5) to pin an exact count of that building type, or
            <strong> None (0)</strong> to exclude it entirely. Greyed-out features aren't
            available for the current population size or settlement role.
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
                const avail = isFeatureAvailable(def, popSlug, roleSlug);
                const sel   = presenceToOption(presences?.[key]);
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
                      value={sel}
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
