import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { getArmorProfile, getAllArmorProfiles } from '../../rules-engine/monsterEngine.js';
import { computeGeneratedHp, rerollHp } from '../../rules-engine/monsterHp.js';
import LootGenerator from './LootGenerator.jsx';

// ── Stat parsing ──────────────────────────────────────────────────────────────
// Handles concatenated imports like 610 → 6, "6 10" → 6, -1 → -1
function parseStat(v, lo = -10, hi = 30) {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : parseInt(String(v));
  if (isNaN(n)) return null;
  if (n >= lo && n <= hi) return n;
  // Out of range: strip trailing digits until in range
  const s = String(Math.abs(n));
  for (let len = 1; len < s.length; len++) {
    const t = parseInt(s.slice(0, len)) * (n < 0 ? -1 : 1);
    if (t >= lo && t <= hi) return t;
  }
  return null;
}

export function MonsterDetail({ monsterId, onClose }) {
  const [monster,   setMonster]   = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);

  // HP state — initialized from DB data or freshly computed
  const [hpData,      setHpData]      = useState(null);
  const [savingRoll,  setSavingRoll]  = useState(false);
  const [savedRoll,   setSavedRoll]   = useState(false);

  // Armor profile editing
  const [profileId,     setProfileId]     = useState(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savedProfile,  setSavedProfile]  = useState(false);

  const allProfiles = getAllArmorProfiles();

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getMonster(monsterId)
      .then(m => {
        setMonster(m);
        setProfileId(m.armor_profile_id ?? 'none');
        // Init HP from DB columns if present, else compute fresh
        if (m.generated_hp_base != null && m.random_roll != null) {
          setHpData({
            generatedHpBase:  m.generated_hp_base,
            randomRoll:       m.random_roll,
            randomModifier:   m.random_modifier ?? 1.0,
            generatedHpFinal: m.generated_hp ?? m.generated_hp_base,
          });
        } else {
          const c = computeGeneratedHp(m);
          setHpData({ generatedHpBase: c.generatedHpBase, randomRoll: c.randomRoll, randomModifier: c.randomModifier, generatedHpFinal: c.generatedHpFinal });
        }
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [monsterId]);

  function handleReroll() {
    if (!hpData) return;
    setHpData(prev => ({ ...prev, ...rerollHp(prev.generatedHpBase) }));
    setSavedRoll(false);
  }

  async function handleSaveRoll() {
    if (!monster || !hpData) return;
    setSavingRoll(true);
    try {
      await api.updateMonster(monster.id, {
        generated_hp:      hpData.generatedHpFinal,
        generated_hp_base: hpData.generatedHpBase,
        random_roll:       hpData.randomRoll,
        random_modifier:   hpData.randomModifier,
      });
      setSavedRoll(true);
      setTimeout(() => setSavedRoll(false), 2000);
    } catch (e) { console.error('Save roll:', e); }
    finally { setSavingRoll(false); }
  }

  async function handleProfileChange(newId) {
    setProfileId(newId);
    setSavingProfile(true);
    try {
      await api.updateMonster(monster.id, { armor_profile_id: newId });
      setSavedProfile(true);
      setTimeout(() => setSavedProfile(false), 2000);
    } catch (e) { console.error('Save profile:', e); }
    finally { setSavingProfile(false); }
  }

  if (loading) return (
    <div style={{ background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 8, padding: 20, color: C.textDim, fontSize: 13 }}>
      Loading…
    </div>
  );
  if (error) return (
    <div style={{ background: 'rgba(200,50,50,.1)', border: `1px solid rgba(200,50,50,.4)`, borderRadius: 8, padding: 20, color: '#e08080', fontSize: 13 }}>
      ⚠ {error}
    </div>
  );
  if (!monster) return null;

  const profile = getArmorProfile(profileId ?? monster.armor_profile_id);
  const ac      = parseStat(monster.armor_class);
  const thac0   = parseStat(monster.thac0, -5, 20);

  const pct = hpData ? Math.round((hpData.randomModifier - 1) * 100) : 0;
  const pctStr = pct >= 0 ? `+${pct}%` : `${pct}%`;

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

  const inputStyle = {
    background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 4,
    padding: '4px 8px', color: C.text, fontFamily: 'inherit', fontSize: 12, outline: 'none',
  };

  return (
    <div style={{
      background: 'rgba(10,8,4,.95)', border: `1px solid ${C.borderHi}`,
      borderRadius: 10, padding: '16px 18px',
      overflowY: 'auto', maxHeight: 'calc(100vh - 200px)',
      position: 'sticky', top: 20,
    }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 4 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, color: C.gold, fontWeight: 'bold', lineHeight: 1.2 }}>{monster.name}</div>
          <div style={{ fontSize: 11, color: C.textDim, marginTop: 2 }}>
            {[monster.size, monster.type, monster.alignment].filter(Boolean).join(' · ')}
          </div>
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: `1px solid ${C.border}`, borderRadius: 5,
          padding: '3px 8px', cursor: 'pointer', color: C.textDim, fontSize: 13,
        }}>✕</button>
      </div>

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
        {monster.source && (
          <span style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '1px 8px', textTransform: 'uppercase' }}>
            {monster.source}
          </span>
        )}
        {monster.role && monster.role !== 'normal' && (
          <span style={{ fontSize: 9, letterSpacing: 2, color: C.amber, background: 'rgba(0,0,0,.4)', border: `1px solid rgba(200,160,50,.3)`, borderRadius: 10, padding: '1px 8px', textTransform: 'uppercase' }}>
            {monster.role}
          </span>
        )}
        {monster.wiki_url && (
          <a href={monster.wiki_url} target="_blank" rel="noopener noreferrer" style={{
            fontSize: 9, letterSpacing: 1, color: C.blue, background: 'rgba(0,0,0,.4)',
            border: `1px solid rgba(104,168,208,.3)`, borderRadius: 10, padding: '1px 8px', textDecoration: 'none',
          }}>
            ↗ Wiki
          </a>
        )}
      </div>

      {/* ── Combat Stats ── */}
      {sectionHdr('Combat Stats')}
      {statRow('Armor Class', ac != null ? ac : monster.armor_class, ac != null && ac <= 2 ? C.green : ac != null && ac >= 7 ? C.amber : C.text)}
      {statRow('Hit Dice', monster.hit_dice)}
      {statRow('THAC0', thac0 != null ? thac0 : monster.thac0)}
      {statRow('Movement', monster.movement)}
      {statRow('Morale', monster.morale)}
      {statRow('XP Value', monster.xp_value?.toLocaleString(), C.gold)}

      {/* ── HP Section ── */}
      {sectionHdr('Hit Points')}
      <div style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ textAlign: 'center', padding: '8px 10px', background: 'rgba(0,0,0,.25)', borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 22, color: C.textDim, fontWeight: 'bold', lineHeight: 1 }}>{monster.hit_points ?? '—'}</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, marginTop: 3, textTransform: 'uppercase' }}>Vanilla HP</div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1, fontStyle: 'italic' }}>(raw from source)</div>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 10px', background: 'rgba(200,50,50,.08)', borderRadius: 6, border: `1px solid rgba(200,80,50,.3)` }}>
            <div style={{ fontSize: 22, color: C.red, fontWeight: 'bold', lineHeight: 1 }}>{hpData?.generatedHpFinal ?? '…'}</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, marginTop: 3, textTransform: 'uppercase' }}>Generated HP</div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>size × type × role × roll</div>
          </div>
        </div>
        {hpData && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: C.textDim, marginBottom: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <span>Base: <strong style={{ color: C.text }}>{hpData.generatedHpBase}</strong></span>
            <span>·</span>
            <span>Roll: <strong style={{ color: C.gold }}>{hpData.randomRoll}</strong>/20 <span style={{ fontSize: 10, color: pct >= 0 ? C.green : C.red }}>({pctStr})</span></span>
            <span>·</span>
            <span>Final: <strong style={{ color: C.red }}>{hpData.generatedHpFinal}</strong></span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button onClick={handleReroll} style={{ background: 'rgba(212,160,53,.15)', border: `1px solid ${C.gold}`, borderRadius: 5, padding: '5px 14px', cursor: 'pointer', color: C.gold, fontFamily: 'inherit', fontSize: 11 }}>
            🎲 Re-roll HP
          </button>
          <button onClick={handleSaveRoll} disabled={savingRoll} style={{ background: savedRoll ? 'rgba(60,180,60,.2)' : 'rgba(0,0,0,.3)', border: `1px solid ${savedRoll ? C.green : C.border}`, borderRadius: 5, padding: '5px 14px', cursor: savingRoll ? 'not-allowed' : 'pointer', color: savedRoll ? C.green : C.textDim, fontFamily: 'inherit', fontSize: 11 }}>
            {savingRoll ? 'Saving…' : savedRoll ? '✓ Saved' : '💾 Save Roll'}
          </button>
        </div>
      </div>

      {/* ── Attacks ── */}
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

      {/* ── Armor Profile (editable dropdown) ── */}
      {sectionHdr('Armor Profile')}
      <div style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, borderRadius: 7, padding: '10px 12px' }}>
        {/* Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <select
            value={profileId ?? 'none'}
            onChange={e => handleProfileChange(e.target.value)}
            style={{
              flex: 1, ...inputStyle,
              background: 'rgba(0,0,0,.5)', cursor: 'pointer',
            }}
          >
            {allProfiles.map(p => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
          {savingProfile && <span style={{ fontSize: 10, color: C.textDim }}>Saving…</span>}
          {savedProfile  && <span style={{ fontSize: 10, color: C.green }}>✓ Saved</span>}
        </div>

        {/* Profile description */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 18 }}>{profile.icon}</span>
          <div>
            <div style={{ fontSize: 12, color: C.gold, fontWeight: 'bold' }}>{profile.name}</div>
            <div style={{ fontSize: 11, color: C.textDim }}>{profile.desc}</div>
          </div>
        </div>
        <div style={{ fontSize: 10, color: C.textDim, fontStyle: 'italic', marginBottom: 8 }}>{profile.notes}</div>

        {/* Damage reduction mini-grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 3 }}>
          {['slashing','piercing','bludgeoning','fire','cold','lightning','acid','poison'].map(dt => {
            const r = profile.reductionByType[dt] ?? 0;
            const col = r > 0 ? C.green : r < 0 ? C.red : C.textDim;
            return (
              <div key={dt} style={{ textAlign: 'center', background: 'rgba(0,0,0,.3)', borderRadius: 4, padding: '3px 4px' }}>
                <div style={{ fontSize: 11, color: col, fontWeight: 'bold' }}>{r > 0 ? `-${r}` : r < 0 ? `+${Math.abs(r)}` : '0'}</div>
                <div style={{ fontSize: 8, color: C.textDim, textTransform: 'capitalize' }}>{dt.slice(0,5)}</div>
              </div>
            );
          })}
        </div>
        <div style={{ fontSize: 10, color: C.textDim, marginTop: 6 }}>
          Grace floor: {Math.round(profile.gracePct * 100)}% of raw damage always passes through
        </div>
      </div>

      {/* ── Loot Generator ── */}
      <LootGenerator monster={monster} />

      {/* ── Description ── */}
      {monster.description && (
        <>
          {sectionHdr('Description')}
          <div style={{ fontSize: 12, color: C.textDim, lineHeight: 1.7 }}>{monster.description}</div>
        </>
      )}

      {/* ── Ecology ── */}
      {(monster.habitat || monster.frequency || monster.tags?.length > 0) && (
        <>
          {sectionHdr('Ecology')}
          {monster.habitat   && statRow('Habitat',   monster.habitat)}
          {monster.frequency && statRow('Frequency', monster.frequency)}
          {monster.tags?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
              {monster.tags.map(t => (
                <span key={t} style={{ fontSize: 10, background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '1px 8px', color: C.textDim }}>
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
