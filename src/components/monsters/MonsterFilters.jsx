import { C } from '../../data/constants.js';

const MONSTER_TYPES = [
  'Humanoid', 'Undead', 'Beast/Animal', 'Dragon', 'Giant',
  'Construct/Golem', 'Elemental', 'Monstrous', 'Aberration',
  'Lycanthrope', 'Planar', 'Demi-human',
];

const SIZE_OPTIONS = [
  { label: 'T', value: 'tiny',        title: 'Tiny' },
  { label: 'S', value: 'small',       title: 'Small' },
  { label: 'M', value: 'medium',      title: 'Medium' },
  { label: 'L', value: 'large',       title: 'Large' },
  { label: 'H', value: 'huge',        title: 'Huge' },
  { label: 'G', value: 'gargantuan',  title: 'Gargantuan' },
];

const FREQUENCIES = ['Common', 'Uncommon', 'Rare', 'Very Rare', 'Unique'];

const ALIGNMENTS = ['Good', 'Neutral', 'Evil', 'Lawful', 'Chaotic', 'Any'];

const SORT_OPTIONS = [
  { value: 'name_asc',  label: 'Name (A–Z)' },
  { value: 'name_desc', label: 'Name (Z–A)' },
  { value: 'hd_asc',   label: 'Hit Dice (low–high)' },
  { value: 'hd_desc',  label: 'Hit Dice (high–low)' },
  { value: 'ac_asc',   label: 'AC (best–worst)' },
  { value: 'xp_asc',   label: 'XP (low–high)' },
  { value: 'xp_desc',  label: 'XP (high–low)' },
];

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
    boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 10, letterSpacing: 2, color: C.textDim,
    textTransform: 'uppercase', display: 'block', marginBottom: 5,
  };

  const chipStyle = (active) => ({
    display: 'inline-block', padding: '3px 9px', borderRadius: 10,
    fontSize: 11, cursor: 'pointer', userSelect: 'none', transition: 'all .1s',
    border: `1px solid ${active ? C.gold : C.border}`,
    background: active ? 'rgba(212,160,53,.15)' : 'rgba(0,0,0,.3)',
    color: active ? C.gold : C.textDim,
  });

  const btnStyle = (active) => ({
    padding: '4px 10px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
    border: `1px solid ${active ? C.gold : C.border}`,
    background: active ? 'rgba(212,160,53,.15)' : 'rgba(0,0,0,.3)',
    color: active ? C.gold : C.textDim,
    fontFamily: 'inherit', transition: 'all .1s',
  });

  const hasFilters = filters.search || filters.type || filters.size || filters.frequency
    || filters.hd_min || filters.hd_max || filters.alignment || filters.min_ac || filters.max_ac;

  return (
    <div style={{
      background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '14px 14px',
      display: 'flex', flexDirection: 'column', gap: 14,
    }}>

      {/* Search */}
      <div>
        <label style={labelStyle}>Search</label>
        <input
          type="text"
          placeholder="Monster name…"
          value={filters.search ?? ''}
          onChange={e => set('search', e.target.value)}
          style={inputStyle}
        />
      </div>

      {/* Sort */}
      <div>
        <label style={labelStyle}>Sort By</label>
        <select
          value={filters.sort ?? 'name_asc'}
          onChange={e => set('sort', e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          {SORT_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Type */}
      <div>
        <label style={labelStyle}>Type</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {types.map(t => (
            <span
              key={t}
              style={chipStyle(filters.type === t)}
              onClick={() => set('type', filters.type === t ? '' : t)}
            >
              {t}
            </span>
          ))}
        </div>
      </div>

      {/* Size */}
      <div>
        <label style={labelStyle}>Size</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {SIZE_OPTIONS.map(s => (
            <button
              key={s.value}
              title={s.title}
              style={btnStyle(filters.size === s.value)}
              onClick={() => set('size', filters.size === s.value ? '' : s.value)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Frequency */}
      <div>
        <label style={labelStyle}>Frequency</label>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {FREQUENCIES.map(f => (
            <button
              key={f}
              style={btnStyle(filters.frequency === f)}
              onClick={() => set('frequency', filters.frequency === f ? '' : f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* HD Range */}
      <div>
        <label style={labelStyle}>Hit Dice Range</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              type="number" min={0} max={30}
              placeholder="Min"
              value={filters.hd_min ?? ''}
              onChange={e => set('hd_min', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <input
              type="number" min={0} max={30}
              placeholder="Max"
              value={filters.hd_max ?? ''}
              onChange={e => set('hd_max', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Alignment */}
      <div>
        <label style={labelStyle}>Alignment</label>
        <select
          value={filters.alignment ?? ''}
          onChange={e => set('alignment', e.target.value)}
          style={{ ...inputStyle, cursor: 'pointer' }}
        >
          <option value="">All</option>
          {ALIGNMENTS.map(a => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
      </div>

      {/* AC Range */}
      <div>
        <label style={labelStyle}>Armor Class Range</label>
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <input
              type="number" min={-10} max={20}
              placeholder="Min AC"
              value={filters.min_ac ?? ''}
              onChange={e => set('min_ac', e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ flex: 1 }}>
            <input
              type="number" min={-10} max={20}
              placeholder="Max AC"
              value={filters.max_ac ?? ''}
              onChange={e => set('max_ac', e.target.value)}
              style={inputStyle}
            />
          </div>
        </div>
      </div>

      {/* Clear */}
      {hasFilters && (
        <button
          onClick={() => onChange({
            search: '', type: '', size: '', frequency: '',
            hd_min: '', hd_max: '', alignment: '', min_ac: '', max_ac: '',
            sort: filters.sort ?? 'name_asc',
          })}
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
