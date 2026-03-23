/**
 * LootDebugPanel.jsx
 * Phase 7 — DM debug panel for the loot XP engine.
 * Lives as a tab in MagicalItemLibrary.
 */
import { useState } from 'react';
import { rollLoot }         from '../../rules-engine/lootRollEngine.js';
import { budgetBreakdown }  from '../../rules-engine/lootXpEngine.js';
import { fetchLootPool, }   from '../../rules-engine/lootRollEngine.js';
import { summarisePool }    from '../../rules-engine/lootFilterEngine.js';

const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Deadly'];
const TERRAINS     = ['', 'dungeon', 'cave', 'forest', 'sea', 'city', 'ruins', 'mountain', 'swamp', 'desert', 'underdark', 'temple', 'volcano'];

const CAT_ICON = {
  potion:                  '🧪',
  scroll:                  '📜',
  ring:                    '💍',
  rod:                     '🪄',
  staff:                   '🪄',
  wand:                    '✨',
  gem:                     '💎',
  jewelry:                 '📿',
  boots_gloves_accessories:'🧤',
  armor_shield:            '🛡',
  weapon:                  '⚔️',
  artifact_relic:          '🏺',
  misc:                    '🎁',
};

export default function LootDebugPanel() {
  // ── inputs ────────────────────────────────────────────────────────────────
  const [partyLevel,    setPartyLevel]    = useState(5);
  const [difficulty,    setDifficulty]    = useState('Medium');
  const [terrain,       setTerrain]       = useState('');
  const [partySize,     setPartySize]     = useState(4);
  const [maxItems,      setMaxItems]      = useState(4);
  const [includeCursed, setIncludeCursed] = useState(false);

  // ── output ────────────────────────────────────────────────────────────────
  const [result,      setResult]      = useState(null);
  const [poolStats,   setPoolStats]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState(null);
  const [showLog,     setShowLog]     = useState(false);
  const [showPool,    setShowPool]    = useState(false);

  // ── live budget breakdown ─────────────────────────────────────────────────
  const bd = budgetBreakdown({ partyLevel, difficulty, partySize });

  async function runRoll() {
    setLoading(true);
    setError(null);
    setResult(null);
    setPoolStats(null);
    try {
      const res = await rollLoot({
        partyLevel,
        difficulty,
        terrain:      terrain || undefined,
        partySize,
        maxItems,
        includeCursed,
      });
      setResult(res);

      // Fetch pool stats separately for the summary
      try {
        const pool = await fetchLootPool({ minXp: 1, maxXp: Math.max(bd.total * 2, 500), limit: 300 });
        setPoolStats(summarisePool(pool));
      } catch { /* non-critical */ }
    } catch (e) {
      setError(e.message ?? 'Roll failed');
    } finally {
      setLoading(false);
    }
  }

  const inputSt = {
    background: '#0d0903', border: '1px solid rgba(212,160,53,.3)', borderRadius: 5,
    color: '#e8d8b0', padding: '5px 9px', fontSize: 12, fontFamily: 'inherit',
    width: '100%', boxSizing: 'border-box',
  };

  const labelSt = { fontSize: 11, color: '#a0906a', marginBottom: 3, display: 'block' };

  const fieldSt = { display: 'flex', flexDirection: 'column', gap: 3 };

  const btnSt = (color = '#d4a035') => ({
    padding: '8px 20px', borderRadius: 6, cursor: loading ? 'not-allowed' : 'pointer',
    background: `rgba(${color === '#d4a035' ? '212,160,53' : '109,190,136'},.14)`,
    border: `1px solid ${color}44`, color, fontSize: 12,
    fontFamily: 'inherit', fontWeight: 'bold', opacity: loading ? 0.5 : 1,
  });

  return (
    <div style={{ padding: '20px 24px', maxWidth: 860, margin: '0 auto', fontFamily: "'Palatino Linotype',Georgia,serif" }}>
      <h2 style={{ fontSize: 18, color: '#d4a035', marginBottom: 4 }}>🔧 Loot Debug Panel</h2>
      <p style={{ fontSize: 11, color: '#6a5a3a', marginBottom: 20 }}>
        Test the XP-budget loot engine without running a full encounter.
      </p>

      {/* ── Controls ── */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: 14, marginBottom: 20,
        background: 'rgba(0,0,0,.3)', border: '1px solid rgba(212,160,53,.2)',
        borderRadius: 8, padding: 16,
      }}>

        <div style={fieldSt}>
          <label style={labelSt}>Party Level (1–20)</label>
          <input
            type="number" min={1} max={20} value={partyLevel}
            onChange={e => setPartyLevel(Math.max(1, Math.min(20, +e.target.value || 1)))}
            style={inputSt}
          />
        </div>

        <div style={fieldSt}>
          <label style={labelSt}>Difficulty</label>
          <select value={difficulty} onChange={e => setDifficulty(e.target.value)} style={inputSt}>
            {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
          </select>
        </div>

        <div style={fieldSt}>
          <label style={labelSt}>Party Size (1–8)</label>
          <input
            type="number" min={1} max={8} value={partySize}
            onChange={e => setPartySize(Math.max(1, Math.min(8, +e.target.value || 4)))}
            style={inputSt}
          />
        </div>

        <div style={fieldSt}>
          <label style={labelSt}>Max Items</label>
          <input
            type="number" min={1} max={12} value={maxItems}
            onChange={e => setMaxItems(Math.max(1, Math.min(12, +e.target.value || 4)))}
            style={inputSt}
          />
        </div>

        <div style={fieldSt}>
          <label style={labelSt}>Terrain</label>
          <select value={terrain} onChange={e => setTerrain(e.target.value)} style={inputSt}>
            {TERRAINS.map(t => <option key={t} value={t}>{t || '(any)'}</option>)}
          </select>
        </div>

        <div style={{ ...fieldSt, justifyContent: 'flex-end' }}>
          <label style={{ ...labelSt, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="checkbox" checked={includeCursed}
              onChange={e => setIncludeCursed(e.target.checked)}
            />
            Include Cursed
          </label>
        </div>
      </div>

      {/* ── Live budget breakdown ── */}
      <div style={{
        display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center',
        padding: '10px 16px', marginBottom: 16,
        background: 'rgba(212,160,53,.07)', border: '1px solid rgba(212,160,53,.25)',
        borderRadius: 7, fontSize: 12,
      }}>
        <span style={{ color: '#a0906a' }}>XP Budget:</span>
        <span style={{ color: '#d4a035', fontWeight: 'bold', fontSize: 15 }}>
          {bd.total.toLocaleString()} XP
        </span>
        <span style={{ color: '#6a5a3a' }}>
          base {bd.base.toLocaleString()} × {bd.diffMult}× diff × {bd.sizeMult}× size
        </span>
      </div>

      {/* ── Roll button ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        <button onClick={runRoll} disabled={loading} style={btnSt()}>
          {loading ? '⏳ Rolling…' : '🎲 Roll Smart Loot'}
        </button>
      </div>

      {/* ── Error ── */}
      {error && (
        <div style={{
          background: 'rgba(200,50,50,.15)', border: '1px solid rgba(200,50,50,.4)',
          borderRadius: 7, padding: '10px 14px', color: '#e08080', fontSize: 12, marginBottom: 16,
        }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Summary row */}
          <div style={{
            display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'center',
            padding: '10px 16px',
            background: 'rgba(109,190,136,.08)', border: '1px solid rgba(109,190,136,.3)',
            borderRadius: 7, fontSize: 12,
          }}>
            <span style={{ color: '#6dbe88', fontWeight: 'bold' }}>
              ✅ {result.items.length} item{result.items.length !== 1 ? 's' : ''}
            </span>
            <span style={{ color: '#d4a035' }}>{result.totalXp.toLocaleString()} XP</span>
            <span style={{ color: '#a0906a' }}>{result.totalGp.toLocaleString()} gp</span>
            <span style={{ color: '#6a5a3a' }}>
              budget used: {result.budget > 0 ? Math.round(result.totalXp / result.budget * 100) : 0}%
            </span>
          </div>

          {/* Item cards */}
          {result.items.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {result.items.map((item, i) => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '9px 14px',
                  background: 'rgba(0,0,0,.3)', border: '1px solid rgba(212,160,53,.2)',
                  borderRadius: 7,
                }}>
                  <span style={{ fontSize: 18 }}>{CAT_ICON[item.category] ?? '🎁'}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, color: '#e8d8b0', fontWeight: 'bold' }}>
                      {item.name}
                    </div>
                    <div style={{ fontSize: 10, color: '#6a5a3a', textTransform: 'uppercase', letterSpacing: 1 }}>
                      {item.category}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 11 }}>
                    <div style={{ color: '#d4a035' }}>{item.listedXp.toLocaleString()} XP</div>
                    <div style={{ color: '#a0906a' }}>{item.gpValue.toLocaleString()} gp</div>
                  </div>
                  <div style={{
                    fontSize: 10, color: '#6a5a3a', background: 'rgba(0,0,0,.3)',
                    borderRadius: 4, padding: '2px 8px', minWidth: 20, textAlign: 'center',
                  }}>#{i + 1}</div>
                </div>
              ))}
            </div>
          )}

          {result.items.length === 0 && (
            <div style={{ fontSize: 12, color: '#6a5a3a', fontStyle: 'italic', padding: '10px 0' }}>
              No items fit the budget / filters.
            </div>
          )}

          {/* Debug log toggle */}
          <div>
            <button
              onClick={() => setShowLog(v => !v)}
              style={{
                fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                background: 'rgba(0,0,0,.25)', border: '1px solid rgba(212,160,53,.2)',
                color: '#a0906a', fontFamily: 'inherit',
              }}
            >
              {showLog ? '▲ Hide' : '▼ Show'} debug log ({result.log.length} lines)
            </button>

            {showLog && (
              <pre style={{
                marginTop: 8, padding: '10px 14px',
                background: 'rgba(0,0,0,.35)', border: '1px solid rgba(212,160,53,.15)',
                borderRadius: 6, fontSize: 11, color: '#8a7a5a', lineHeight: 1.7,
                overflowX: 'auto', whiteSpace: 'pre-wrap', fontFamily: 'monospace',
              }}>
                {result.log.join('\n')}
              </pre>
            )}
          </div>

          {/* Pool stats toggle */}
          {poolStats && (
            <div>
              <button
                onClick={() => setShowPool(v => !v)}
                style={{
                  fontSize: 11, padding: '4px 12px', borderRadius: 5, cursor: 'pointer',
                  background: 'rgba(0,0,0,.25)', border: '1px solid rgba(212,160,53,.2)',
                  color: '#a0906a', fontFamily: 'inherit',
                }}
              >
                {showPool ? '▲ Hide' : '▼ Show'} pool summary
              </button>

              {showPool && (
                <div style={{
                  marginTop: 8, padding: '10px 14px',
                  background: 'rgba(0,0,0,.35)', border: '1px solid rgba(212,160,53,.15)',
                  borderRadius: 6,
                  display: 'flex', flexWrap: 'wrap', gap: '6px 16px',
                }}>
                  {Object.entries(poolStats).sort(([, a], [, b]) => b - a).map(([cat, count]) => (
                    <span key={cat} style={{ fontSize: 11, color: '#a0906a' }}>
                      {CAT_ICON[cat] ?? '🎁'} {cat}: <strong style={{ color: '#d4a035' }}>{count}</strong>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
