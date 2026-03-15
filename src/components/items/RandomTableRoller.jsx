import { useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import ItemDetail from './ItemDetail.jsx';
import './Items.css';

const TABLE_META = {
  A: { name: 'Map or Magic Item',        dice: '1d20' },
  B: { name: 'Minor Magic Items',        dice: '1d20' },
  C: { name: 'Major Magic Items',        dice: '1d20' },
  D: { name: 'Map or Magic Item (Adv)',  dice: '1d20' },
  E: { name: 'Trinkets',                 dice: '1d20' },
  F: { name: 'Greater Trinkets',         dice: '1d20' },
  G: { name: 'Treasure (low)',           dice: '1d20' },
  H: { name: 'Treasure (med)',           dice: '1d20' },
  I: { name: 'Treasure (high)',          dice: '1d20' },
  J: { name: 'Coins & Gems',            dice: '1d20' },
  K: { name: 'Maps',                     dice: '1d20' },
  L: { name: 'Individual Minor (low)',   dice: '1d20' },
  M: { name: 'Individual Minor (med)',   dice: '1d20' },
  N: { name: 'Individual Minor (high)',  dice: '1d20' },
  O: { name: 'Individual Major (low)',   dice: '1d20' },
  P: { name: 'Individual Major (med)',   dice: '1d20' },
  Q: { name: 'Individual Major (high)',  dice: '1d20' },
  R: { name: 'Potions & Scrolls',       dice: '1d20' },
  S: { name: 'Weapons & Armor',         dice: '1d20' },
  T: { name: 'Misc Magic Items',        dice: '1d20' },
};
const TABLE_LETTERS = Object.keys(TABLE_META);

const DUNGEON_LEVELS = Array.from({ length: 20 }, (_, i) => i + 1);
const HOARD_TYPES    = ['dungeon', 'treasure', 'monster'];

export default function RandomTableRoller() {
  const [rolling,      setRolling]      = useState({});     // letter → bool
  const [results,      setResults]      = useState([]);     // { letter, roll, item }[]
  const [hoardLevel,   setHoardLevel]   = useState(3);
  const [hoardType,    setHoardType]    = useState('dungeon');
  const [hoardLoading, setHoardLoading] = useState(false);
  const [hoardItems,   setHoardItems]   = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detailLoad,   setDetailLoad]   = useState(false);

  const rollTable = useCallback(async (letter) => {
    setRolling(prev => ({ ...prev, [letter]: true }));
    try {
      const res = await api.rollMagicalTable(letter);
      if (res?.item) {
        setResults(prev => [{ letter, roll: res.roll, item: res.item }, ...prev].slice(0, 40));
      }
    } catch (err) {
      setResults(prev => [{ letter, roll: null, item: null, error: err.message }, ...prev].slice(0, 40));
    } finally {
      setRolling(prev => ({ ...prev, [letter]: false }));
    }
  }, []);

  const openDetail = useCallback(async (item) => {
    if (!item?.id) return;
    setDetailLoad(true);
    setSelectedItem(null);
    try {
      const full = await api.getMagicalItem(item.id);
      setSelectedItem(full);
    } catch {
      setSelectedItem(item);
    } finally {
      setDetailLoad(false);
    }
  }, []);

  const rollHoard = useCallback(async () => {
    setHoardLoading(true);
    setHoardItems(null);
    try {
      const res = await api.randomMagicalHoard(hoardLevel, hoardType);
      setHoardItems(res.items ?? []);
    } catch (err) {
      setHoardItems({ error: err.message });
    } finally {
      setHoardLoading(false);
    }
  }, [hoardLevel, hoardType]);

  return (
    <div className="ir-layout">
      <p className="ir-title">AD&amp;D 2E Random Treasure Tables</p>

      {/* ── Hoard Generator ── */}
      <div className="ir-hoard-section">
        <div className="ir-hoard-title">⚄ Generate a Hoard</div>
        <div className="ir-hoard-controls">
          <label className="ir-hoard-label">
            Dungeon Level&ensp;
            <select
              className="ir-hoard-select"
              value={hoardLevel}
              onChange={e => setHoardLevel(Number(e.target.value))}
            >
              {DUNGEON_LEVELS.map(l => (
                <option key={l} value={l}>Level {l}</option>
              ))}
            </select>
          </label>
          <label className="ir-hoard-label">
            Type&ensp;
            <select
              className="ir-hoard-select"
              value={hoardType}
              onChange={e => setHoardType(e.target.value)}
            >
              {HOARD_TYPES.map(t => (
                <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
              ))}
            </select>
          </label>
          <button
            className="ir-roll-btn"
            onClick={rollHoard}
            disabled={hoardLoading}
          >
            {hoardLoading ? 'Rolling…' : 'Generate Hoard'}
          </button>
        </div>

        {hoardItems && (
          <div style={{ marginTop: 10 }}>
            {hoardItems.error ? (
              <p style={{ color: 'var(--mi-cursed)', fontSize: 12 }}>{hoardItems.error}</p>
            ) : hoardItems.length === 0 ? (
              <p style={{ color: 'var(--mi-purple-muted)', fontSize: 12, fontStyle: 'italic' }}>No items generated.</p>
            ) : (
              <div className="ir-results-scroll" style={{ maxHeight: 180 }}>
                {hoardItems.map((item, i) => (
                  <div key={i} className="ir-result-row">
                    <span className="ir-result-name">{item.name}</span>
                    {item.rarity && (
                      <span className="ir-result-roll">{item.rarity}</span>
                    )}
                    <button className="ir-result-view-btn" onClick={() => openDetail(item)}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Single Table Rolls — two-column layout ── */}
      <div className="ir-tables-section">
        <div className="ir-tables-title">Roll on Individual Tables</div>
        <div className="ir-tables-grid">
          {TABLE_LETTERS.map(letter => {
            const meta = TABLE_META[letter];
            return (
              <button
                key={letter}
                className="ir-table-btn"
                onClick={() => rollTable(letter)}
                disabled={rolling[letter]}
              >
                <span className="ir-table-letter">{letter}</span>
                <span className="ir-table-name">{meta.name}</span>
                <span className="ir-table-dice">{rolling[letter] ? 'Rolling…' : meta.dice}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Roll history ── */}
      {results.length > 0 && (
        <div className="ir-results">
          <div className="ir-results-title">Roll History</div>
          <div className="ir-results-scroll">
            {results.map((r, i) => (
              <div key={i} className="ir-result-row">
                <span className="ir-result-table">{r.letter}</span>
                {r.roll != null && <span className="ir-result-roll">({r.roll})</span>}
                {r.error ? (
                  <span className="ir-result-name" style={{ color: 'var(--mi-cursed)' }}>{r.error}</span>
                ) : r.item ? (
                  <span className="ir-result-name">{r.item.name}</span>
                ) : (
                  <span className="ir-result-name" style={{ fontStyle: 'italic', opacity: 0.5 }}>No result</span>
                )}
                {r.item && (
                  <button className="ir-result-view-btn" onClick={() => openDetail(r.item)}>
                    View
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {results.length === 0 && !hoardItems && (
        <div className="ir-empty-state">
          <div className="ir-empty-icon">🎲</div>
          <p>Click a table button above to roll, or generate a full hoard.</p>
        </div>
      )}

      {/* ── Item detail overlay ── */}
      {(selectedItem || detailLoad) && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 300,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={() => { setSelectedItem(null); setDetailLoad(false); }}
        >
          <div
            style={{ width: 420, maxHeight: '80vh', borderRadius: 8, overflow: 'hidden' }}
            onClick={e => e.stopPropagation()}
          >
            <ItemDetail
              item={selectedItem}
              loading={detailLoad}
              onClose={() => { setSelectedItem(null); setDetailLoad(false); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
