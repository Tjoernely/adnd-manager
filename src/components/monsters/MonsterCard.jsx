import { C } from '../../data/constants.js';
import { getArmorProfile } from '../../rules-engine/monsterEngine.js';

const TYPE_COLORS = {
  humanoid:   '#a07040',
  undead:     '#7050a0',
  giant:      '#906030',
  dragon:     '#c04040',
  animal:     '#508040',
  monstrous:  '#507090',
  ooze:       '#406040',
  construct:  '#607080',
  lycanthrope:'#805060',
  fey:        '#507050',
  elemental:  '#6080a0',
  outsider:   '#804070',
  plant:      '#406030',
};

function typeColor(type) {
  return TYPE_COLORS[type?.toLowerCase()] ?? '#707070';
}

function acLabel(ac) {
  if (ac == null) return '—';
  if (ac <= -5)   return `${ac} ✦✦✦`;
  if (ac <= 0)    return `${ac} ✦✦`;
  if (ac <= 3)    return `${ac} ✦`;
  return String(ac);
}

function hdLabel(hd) {
  if (!hd) return '—';
  return String(hd).replace(/\+/, '+');
}

export function MonsterCard({ monster: m, selected, onClick }) {
  const profile = getArmorProfile(m.armor_profile_id);
  const tc = typeColor(m.type);

  return (
    <div
      onClick={onClick}
      style={{
        background:   selected ? `rgba(212,160,53,.12)` : 'rgba(0,0,0,.3)',
        border:       `1px solid ${selected ? C.gold : C.border}`,
        borderRadius: 8,
        padding:      '10px 14px',
        cursor:       'pointer',
        transition:   'border-color .12s, background .12s',
        position:     'relative',
        overflow:     'hidden',
      }}
      onMouseEnter={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = C.borderHi;
          e.currentTarget.style.background  = 'rgba(212,160,53,.05)';
        }
      }}
      onMouseLeave={e => {
        if (!selected) {
          e.currentTarget.style.borderColor = C.border;
          e.currentTarget.style.background  = 'rgba(0,0,0,.3)';
        }
      }}
    >
      {/* Accent stripe */}
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0, width: 3,
        background: tc, borderRadius: '8px 0 0 8px',
      }} />

      <div style={{ paddingLeft: 8 }}>
        {/* Name + type */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 5 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, color: selected ? C.gold : C.textBri, fontWeight: 'bold', lineHeight: 1.2 }}>
              {m.name}
            </div>
            {m.type && (
              <div style={{ fontSize: 10, color: tc, textTransform: 'capitalize', marginTop: 1, letterSpacing: 0.5 }}>
                {m.size ? `${m.size} ` : ''}{m.type}
              </div>
            )}
          </div>
          {m.frequency && (
            <span style={{
              fontSize: 9, letterSpacing: 1, color: C.textDim,
              background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
              borderRadius: 10, padding: '1px 7px', textTransform: 'uppercase', flexShrink: 0,
            }}>
              {m.frequency}
            </span>
          )}
        </div>

        {/* Stat row */}
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {[
            { l: 'AC',   v: acLabel(m.armor_class) },
            { l: 'HD',   v: hdLabel(m.hit_dice) },
            { l: 'MV',   v: m.movement ?? '—' },
            { l: 'THAC0',v: m.thac0 != null ? String(m.thac0) : '—' },
            { l: 'XP',   v: m.xp_value != null ? m.xp_value.toLocaleString() : '—' },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 12, color: C.gold, fontWeight: 'bold', lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1, textTransform: 'uppercase' }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Attacks */}
        {(m.attacks || m.damage) && (
          <div style={{ marginTop: 6, fontSize: 11, color: C.textDim }}>
            ⚔ {[m.attacks, m.damage].filter(Boolean).join(' → ')}
          </div>
        )}

        {/* Armor profile badge */}
        <div style={{
          marginTop: 7, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
        }}>
          <span style={{
            fontSize: 10, background: 'rgba(0,0,0,.4)',
            border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '1px 8px', color: C.textDim,
          }}>
            {profile.icon} {profile.name}
          </span>
          {m.generated_hp && (
            <span style={{
              fontSize: 10, background: 'rgba(0,0,0,.4)',
              border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '1px 8px', color: C.textDim,
            }}>
              ~{m.generated_hp} est. HP
            </span>
          )}
        </div>

        {/* Special attacks warning */}
        {m.special_attacks && (
          <div style={{ marginTop: 5, fontSize: 10, color: C.amber }}>
            ⚡ {m.special_attacks.length > 60 ? m.special_attacks.slice(0, 60) + '…' : m.special_attacks}
          </div>
        )}
      </div>
    </div>
  );
}
