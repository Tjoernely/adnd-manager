import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { getArmorProfile, describeHitLogic, computeGeneratedHp, applyGraceDamage } from '../../rules-engine/monsterEngine.js';

const DAMAGE_TYPES = ['slashing','piercing','bludgeoning','fire','cold','lightning','acid','poison'];

export function MonsterDetail({ monsterId, onClose }) {
  const [monster, setMonster] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const [dmgType, setDmgType] = useState('slashing');
  const [rawDmg,  setRawDmg]  = useState(8);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getMonster(monsterId)
      .then(m => { setMonster(m); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [monsterId]);

  if (loading) return (
    <div style={{
      background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
      borderRadius: 8, padding: 20, color: C.textDim, fontSize: 13,
    }}>
      Loading…
    </div>
  );

  if (error) return (
    <div style={{
      background: 'rgba(200,50,50,.1)', border: `1px solid rgba(200,50,50,.4)`,
      borderRadius: 8, padding: 20, color: '#e08080', fontSize: 13,
    }}>
      ⚠ {error}
    </div>
  );

  if (!monster) return null;

  const profile   = getArmorProfile(monster.armor_profile_id);
  const genHp     = computeGeneratedHp(monster);
  const graceSim  = applyGraceDamage(rawDmg, monster.armor_profile_id, dmgType);
  const hitDesc   = describeHitLogic(monster, dmgType);

  const sectionHdr = (label) => (
    <div style={{
      fontSize: 10, letterSpacing: 3, color: C.textDim, textTransform: 'uppercase',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 4, marginBottom: 8, marginTop: 14,
    }}>
      {label}
    </div>
  );

  const statRow = (label, value, color) => value != null && value !== '' ? (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: color ?? C.text, fontWeight: 'bold' }}>{value}</span>
    </div>
  ) : null;

  const btnStyle = (active) => ({
    padding: '3px 9px', fontSize: 10, borderRadius: 10, cursor: 'pointer',
    border: `1px solid ${active ? C.gold : C.border}`,
    background: active ? 'rgba(212,160,53,.15)' : 'rgba(0,0,0,.3)',
    color: active ? C.gold : C.textDim, fontFamily: 'inherit',
    transition: 'all .1s',
  });

  return (
    <div style={{
      background: 'rgba(10,8,4,.95)',
      border: `1px solid ${C.borderHi}`,
      borderRadius: 10,
      padding: '16px 18px',
      overflowY: 'auto',
      maxHeight: 'calc(100vh - 200px)',
      position: 'sticky',
      top: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, color: C.gold, fontWeight: 'bold', lineHeight: 1.2 }}>
            {monster.name}
          </div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {[monster.size, monster.type, monster.alignment].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: 5,
          padding: '3px 8px', cursor: 'pointer', color: C.textDim, fontSize: 13,
        }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {monster.source && (
          <span style={{
            fontSize: 9, letterSpacing: 2, color: C.textDim,
            background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '1px 8px', textTransform: 'uppercase',
          }}>
            {monster.source}
          </span>
        )}
        {monster.wiki_url && (
          <a
            href={monster.wiki_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 9, letterSpacing: 1, color: C.blue,
              background: 'rgba(0,0,0,.4)', border: `1px solid rgba(104,168,208,.3)`,
              borderRadius: 10, padding: '1px 8px', textDecoration: 'none',
            }}
          >
            ↗ Wiki
          </a>
        )}
      </div>

      {sectionHdr('Combat Stats')}
      {statRow('Armor Class', monster.armor_class, monster.armor_class <= 2 ? C.green : monster.armor_class >= 7 ? C.amber : C.text)}
      {statRow('Hit Dice', monster.hit_dice)}
      {statRow('HP (raw)', monster.hit_points)}
      {statRow('HP (generated)', `~${genHp}`, C.textDim)}
      {statRow('THAC0', monster.thac0)}
      {statRow('Movement', monster.movement)}
      {statRow('Morale', monster.morale)}
      {statRow('XP Value', monster.xp_value?.toLocaleString(), C.gold)}

      {sectionHdr('Attacks')}
      {statRow('Attacks', monster.attacks)}
      {statRow('Damage', monster.damage)}
      {monster.special_attacks && (
        <div style={{ fontSize: 11, color: C.amber, marginTop: 4, lineHeight: 1.5 }}>
          <span style={{ color: C.textDim }}>Special Attacks: </span>{monster.special_attacks}
        </div>
      )}
      {monster.special_defenses && (
        <div style={{ fontSize: 11, color: C.purple, marginTop: 4, lineHeight: 1.5 }}>
          <span style={{ color: C.textDim }}>Special Defenses: </span>{monster.special_defenses}
        </div>
      )}
      {monster.magic_resistance && (
        <div style={{ fontSize: 11, color: C.purple, marginTop: 4, lineHeight: 1.5 }}>
          <span style={{ color: C.textDim }}>Magic Resistance: </span>{monster.magic_resistance}
        </div>
      )}
      {monster.save_as && statRow('Save As', monster.save_as)}

      {/* Armor Profile */}
      {sectionHdr('Armor Profile')}
      <div style={{
        background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
        borderRadius: 7, padding: '10px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 18 }}>{profile.icon}</span>
          <div>
            <div style={{ fontSize: 13, color: C.gold, fontWeight: 'bold' }}>{profile.name}</div>
            <div style={{ fontSize: 11, color: C.textDim }}>{profile.desc}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textDim, fontStyle: 'italic', marginBottom: 8 }}>
          {profile.notes}
        </div>

        {/* Damage reduction table */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 4,
        }}>
          {DAMAGE_TYPES.map(dt => {
            const r = profile.reductionByType[dt] ?? 0;
            const col = r > 0 ? C.green : r < 0 ? C.red : C.textDim;
            return (
              <div key={dt} style={{
                textAlign: 'center', background: 'rgba(0,0,0,.3)',
                borderRadius: 4, padding: '3px 4px',
              }}>
                <div style={{ fontSize: 11, color: col, fontWeight: 'bold' }}>
                  {r > 0 ? `-${r}` : r < 0 ? `+${Math.abs(r)}` : '0'}
                </div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: 'capitalize' }}>{dt.slice(0,5)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
          Grace floor: {Math.round(profile.gracePct * 100)}% of raw damage always passes through
        </div>
      </div>

      {/* Grace Damage Simulator */}
      {sectionHdr('Damage Simulator')}
      <div style={{
        background: 'rgba(0,0,0,.25)', border: `1px solid ${C.border}`,
        borderRadius: 7, padding: '10px 12px',
      }}>
        <div style={{ fontSize: 11, color: C.textDim, marginBottom: 8 }}>
          Simulate damage against this armor profile:
        </div>

        {/* Damage type selector */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
          {DAMAGE_TYPES.map(dt => (
            <button key={dt} style={btnStyle(dmgType === dt)} onClick={() => setDmgType(dt)}>
              {dt}
            </button>
          ))}
        </div>

        {/* Raw damage input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>Raw damage:</span>
          <input
            type="number" min={1} max={200} value={rawDmg}
            onChange={e => setRawDmg(Math.max(1, +e.target.value))}
            style={{
              width: 60, background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
              borderRadius: 4, padding: '3px 8px', color: C.text, fontFamily: 'inherit', fontSize: 12,
              outline: 'none', textAlign: 'center',
            }}
          />
        </div>

        {/* Result */}
        <div style={{
          background: 'rgba(0,0,0,.4)', borderRadius: 6, padding: '10px 12px',
          display: 'flex', gap: 16, flexWrap: 'wrap',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 20, color: C.red, fontWeight: 'bold' }}>{graceSim.effective}</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>EFFECTIVE DMG</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, color: C.green }}>{graceSim.reduced}</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>ABSORBED</div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16, color: C.amber }}>{graceSim.graceFloor}</div>
            <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>GRACE FLOOR</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, lineHeight: 1.5 }}>
          {hitDesc}
        </div>
      </div>

      {/* Description */}
      {monster.description && (
        <>
          {sectionHdr('Description')}
          <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>
            {monster.description}
          </div>
        </>
      )}

      {/* Habitat / tags */}
      {(monster.habitat || monster.frequency || (monster.tags?.length > 0)) && (
        <>
          {sectionHdr('Ecology')}
          {monster.habitat   && statRow('Habitat',   monster.habitat)}
          {monster.frequency && statRow('Frequency', monster.frequency)}
          {monster.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {monster.tags.map(t => (
                <span key={t} style={{
                  fontSize: 10, background: 'rgba(0,0,0,.4)',
                  border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '1px 8px', color: C.textDim,
                }}>
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
