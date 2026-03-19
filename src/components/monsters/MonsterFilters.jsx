import { C } from '../../data/constants.js';

const MONSTER_TYPES = [
  'humanoid','undead','giant','dragon','animal','monstrous','ooze',
  'construct','lycanthrope','fey','elemental','outsider','plant',
];

const MONSTER_SIZES = ['tiny','small','medium','large','huge','gargantuan'];

const FREQUENCIES = ['Common','Uncommon','Rare','Very Rare'];

export function MonsterFilters({ filters, onChange, meta }) {
  const types = meta?.types?.map(t => t.type) ?? MONSTER_TYPES;

  function set(key, value) {
    onChange({ ...filters, [key]: value });
  }

  const inputStyle = {
    background: 'rgba(0,0,0,.4)',
    border: `1px solid ${C.border}`,
    borderRadius: 5,
    padding: '5px 10px',
    color: C.text,
    fontFamily: 'inherit',
    fontSize: 12,
    outline: 'none',
    width: '100%',
  };

  const chipBase = {
    display: 'inline-block',
    padding: '3px 10px',
    borderRadius: 12,
    fontSize: 11,
    cursor: 'pointer',
    border: `1px solid ${C.border}`,
    background: 'rgba(0,0,0,.3)',
    color: C.textDim,
    transition: 'all .12s',
    userSelect: 'none',
  };

  const chipActive = {
    ...chipBase,
    border: `1px solid ${C.gold}`,
    background: 'rgba(212,160,53,.15)',
    color: C.gold,
  };

  return (
    <div style={{
      background: 'rgba(0,0,0,.3)',
      border: `1px solid ${C.border}`,
      borderRadius: 8,
      padding: '14px 16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
    }}>
      {/* Search */}
      <div>
        <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
          Search
        </label>
        <input
          type="text"
          placeholder="Monster name…"
          value={filters.search ?? ''}
          onChange={e => set('search', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Type */}
      <div>
        <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
          Type
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {types.map(t => (
            <span
              key={t}
              style={filters.type === t ? chipActive : chipBase}
              onClick={() => set('type', filters.type === t ? '' : t)}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
          Size
        </label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {MONSTER_SIZES.map(s => (
            <span
              key={s}
              style={filters.size === s ? chipActive : chipBase}
              onClick={() => set('size', filters.size === s ? '' : s)}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      {/* HD range */}
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            Min HD
          </label>
          <input
            type="number" min={0} max={30}
            placeholder="—"
            value={filters.hd_min ?? ''}
            onChange={e => set('hd_min', e.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: 1 }}>
          <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
            Max HD
          </label>
          <input
            type="number" min={0} max={30}
            placeholder="—"
            value={filters.hd_max ?? ''}
            onChange={e => set('hd_max', e.target.value)}
            style={inputStyle}
          />
        </div>
      </div>

      {/* Habitat */}
      <div>
        <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
          Habitat
        </label>
        <input
          type="text"
          placeholder="Forest, Underground…"
          value={filters.habitat ?? ''}
          onChange={e => set('habitat', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Clear */}
      {(filters.search || filters.type || filters.size || filters.hd_min || filters.hd_max || filters.habitat) && (
        <button
          onClick={() => onChange({ search: '', type: '', size: '', hd_min: '', hd_max: '', habitat: '' })}
          style={{
            background: 'rgba(200,50,50,.15)', border: `1px solid rgba(200,50,50,.4)`,
            borderRadius: 5, padding: '6px 12px', cursor: 'pointer',
            color: '#e08080', fontFamily: 'inherit', fontSize: 11,
          }}
        >
          ✕ Clear Filters
        </button>
      )}
    </div>
  );
}
