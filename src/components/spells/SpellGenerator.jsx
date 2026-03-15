import React, { useState, useCallback } from 'react';
import { api } from '../../api/client';
import SpellCard from './SpellCard';
import SpellDetail from './SpellDetail';
import './Spells.css';

/**
 * SpellGenerator — random spell generator tab.
 * Props:
 *   filters   — { group, minLevel, maxLevel, school, sphere, source, reversible }
 *               shared filter state from SpellLibrary
 */
export default function SpellGenerator({ filters }) {
  const [count,       setCount]       = useState(5);
  const [results,     setResults]     = useState([]);      // { spell, kept: bool|null }[]
  const [selected,    setSelected]    = useState(null);    // spell object (full)
  const [detailLoad,  setDetailLoad]  = useState(false);
  const [generating,  setGenerating]  = useState(false);
  const [error,       setError]       = useState(null);

  // ── Generate ───────────────────────────────────────────────────────────────
  const generate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setResults([]);
    setSelected(null);
    try {
      const params = { ...filters, count };
      const spells = await api.randomSpellBatch(params);
      setResults(Array.isArray(spells) ? spells.map(s => ({ spell: s, kept: null })) : []);
    } catch (e) {
      setError(e.message ?? 'Failed to generate spells');
    } finally {
      setGenerating(false);
    }
  }, [filters, count]);

  // ── Keep / Discard ─────────────────────────────────────────────────────────
  const markKept    = id => setResults(r => r.map(x => x.spell.id === id ? { ...x, kept: true  } : x));
  const markDiscard = id => setResults(r => r.map(x => x.spell.id === id ? { ...x, kept: false } : x));
  const resetAll    = ()  => setResults(r => r.map(x => ({ ...x, kept: null })));

  // ── Select spell (load full detail) ────────────────────────────────────────
  const selectSpell = useCallback(async (spell) => {
    if (selected?.id === spell.id) { setSelected(null); return; }
    setDetailLoad(true);
    setSelected(spell);
    try {
      const full = await api.getSpell(spell.id);
      setSelected(full);
    } catch { /* keep preview data */ }
    finally { setDetailLoad(false); }
  }, [selected]);

  const keptList     = results.filter(x => x.kept === true);
  const pendingCount = results.filter(x => x.kept === null).length;

  return (
    <div className="sg-root">
      {/* Controls bar */}
      <div className="sg-controls">
        <label className="sg-count-label">
          Generate
          <input
            className="sg-count-input"
            type="number"
            min={1}
            max={20}
            value={count}
            onChange={e => setCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
          />
          spells
        </label>

        <button
          className="sg-generate-btn"
          onClick={generate}
          disabled={generating}
        >
          {generating ? <span className="sl-spinner sl-spinner--sm" /> : '⚄ Roll'}
        </button>

        {results.length > 0 && (
          <button className="sg-reset-btn" onClick={resetAll}>
            Reset choices
          </button>
        )}

        {keptList.length > 0 && (
          <span className="sg-kept-count">{keptList.length} kept</span>
        )}
      </div>

      {error && <p className="sl-error">{error}</p>}

      {/* Results + detail split */}
      {results.length > 0 ? (
        <div className="sg-split">
          <div className="sg-list">
            {results.map(({ spell, kept }) => (
              <div
                key={spell.id}
                className={`sg-result-row${kept === true ? ' sg-result-row--kept' : kept === false ? ' sg-result-row--discarded' : ''}`}
              >
                <SpellCard
                  spell={spell}
                  selected={selected?.id === spell.id}
                  onClick={() => selectSpell(spell)}
                />
                <div className="sg-row-actions">
                  <button
                    className={`sg-keep-btn${kept === true ? ' sg-keep-btn--active' : ''}`}
                    onClick={e => { e.stopPropagation(); markKept(spell.id); }}
                    title="Keep this spell"
                  >✓</button>
                  <button
                    className={`sg-discard-btn${kept === false ? ' sg-discard-btn--active' : ''}`}
                    onClick={e => { e.stopPropagation(); markDiscard(spell.id); }}
                    title="Discard this spell"
                  >✕</button>
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="sg-detail">
              <SpellDetail
                spell={selected}
                loading={detailLoad}
                onClose={() => setSelected(null)}
              />
            </div>
          )}
        </div>
      ) : !generating && (
        <div className="sg-empty">
          <p className="sg-empty-hint">
            Set your filters, choose a count, and click <strong>Roll</strong> to generate random spells.
          </p>
        </div>
      )}

      {/* Summary of kept spells */}
      {keptList.length > 0 && pendingCount === 0 && (
        <div className="sg-summary">
          <h4 className="sg-summary-title">Kept Spells ({keptList.length})</h4>
          <ul className="sg-summary-list">
            {keptList.map(({ spell }) => (
              <li key={spell.id} className="sg-summary-item">
                <span>{spell.name}</span>
                <span className="sg-summary-level">Lvl {spell.level}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
