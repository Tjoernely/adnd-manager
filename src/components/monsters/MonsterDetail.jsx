import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { getArmorProfile, getAllArmorProfiles } from '../../rules-engine/monsterEngine.js';
import { computeGeneratedHp, rerollHp, formatVanillaHp } from '../../rules-engine/monsterHp.js';
import LootGenerator from './LootGenerator.jsx';
import { AddToEncounterButton } from '../Encounters/AddToEncounterButton.tsx';

// Active campaign id from sessionStorage — null when no campaign is selected.
function activeCampaignId() {
  try {
    const raw = sessionStorage.getItem('adnd_campaign');
    return raw ? JSON.parse(raw)?.id ?? null : null;
  } catch { return null; }
}

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

// ── Dragon / variant age-category parser ──────────────────────────────────────
function parseVariants(monster) {
  if (monster.variants) {
    try {
      return typeof monster.variants === 'string'
        ? JSON.parse(monster.variants)
        : monster.variants;
    } catch (_) {}
  }
  // Try to parse age table from description heuristic
  const desc = monster.description ?? '';
  if (!desc.includes('Age Category') && !desc.includes('age category')) return null;
  return null; // parsed by fix-monster-variants.mjs; show nothing if not yet populated
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

  // Variant / age-category selector
  const [variantIdx,  setVariantIdx]  = useState(0); // 0 = base stats

  const allProfiles = getAllArmorProfiles();

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getMonster(monsterId)
      .then(m => {
        setMonster(m);
        setProfileId(m.armor_profile_id ?? 'none');
        // Init HP from DB columns if generated_hp is present, else compute fresh
        if (m.generated_hp != null) {
          setHpData({
            generatedHpBase:  m.generated_hp_base  ?? m.generated_hp,
            randomRoll:       m.random_roll         ?? 10,
            randomModifier:   m.random_modifier     ?? 1.0,
            generatedHpFinal: m.generated_hp,
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

  const variants  = parseVariants(monster);
  const variant   = variants && variantIdx > 0 ? variants[variantIdx - 1] : null;

  // Merge variant overrides onto base stats for display
  const disp = variant ? { ...monster, ...variant } : monster;

  // Age-based HP scaling (dragons only — variants don't have their own hit_dice)
  const ageNum = variant
    ? parseInt((variant.label ?? '').match(/Age\s+(\d+)/i)?.[1] ?? '0')
    : 0;
  const ageScale =
    ageNum >= 10 ? 1.3  :
    ageNum >=  7 ? 1.0  :
    ageNum >=  4 ? 0.75 :
    ageNum >=  1 ? 0.5  : 1.0;
  const displayHp = (variant && ageNum > 0 && hpData?.generatedHpFinal != null)
    ? Math.round(hpData.generatedHpFinal * ageScale)
    : hpData?.generatedHpFinal;

  const sectionHdr = (label) => (
    <div style={{
      fontSize: 10, letterSpacing: 3, color: C.textDim, textTransform: 'uppercase',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 4, marginBottom: 8, marginTop: 14,
    }}>
      {label}
    </div>
  );

  // Always renders — shows "—" when value is null/undefined/empty
  const statRow = (label, value, color) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
      <span style={{ color: C.textDim }}>{label}</span>
      <span style={{ color: color ?? C.text, fontWeight: 'bold' }}>
        {value != null && value !== '' ? value : '—'}
      </span>
    </div>
  );

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
            {[monster.size, monster.type, monster.alignment].filter(Boolean).join(' · ') || '—'}
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
        {/* Add-to-encounter button — hidden when no active campaign */}
        {(() => {
          const campaignId = activeCampaignId();
          if (!campaignId) return null;
          return (
            <AddToEncounterButton
              monster={monster}
              campaignId={campaignId}
              variant="detail"
            />
          );
        })()}
      </div>

      {/* ── Variant / Age-Category Selector ── */}
      {variants && variants.length > 0 && (
        <div style={{ marginBottom: 10, background: 'rgba(212,160,53,.08)', border: `1px solid rgba(212,160,53,.3)`, borderRadius: 7, padding: '8px 10px' }}>
          <div style={{ fontSize: 10, letterSpacing: 2, color: C.gold, textTransform: 'uppercase', marginBottom: 6 }}>
            Age / Variant Category
          </div>
          <select
            value={variantIdx}
            onChange={e => setVariantIdx(Number(e.target.value))}
            style={{ width: '100%', background: 'rgba(0,0,0,.5)', border: `1px solid ${C.border}`, borderRadius: 4, padding: '4px 8px', color: C.text, fontFamily: 'inherit', fontSize: 12, outline: 'none' }}
          >
            <option value={0}>Base Stats</option>
            {variants.map((v, i) => (
              <option key={i} value={i + 1}>
                {v.label ?? `Variant ${i + 1}`}{v.body_length ? ` (${v.body_length})` : ''}
              </option>
            ))}
          </select>
          {variant && (
            <div style={{ fontSize: 10, color: C.amber, marginTop: 4 }}>
              Viewing: {variant.label} stats
            </div>
          )}
        </div>
      )}

      {/* ── Combat Stats ── */}
      {sectionHdr('Combat Stats')}
      {statRow('Armor Class', parseStat(disp.armor_class) != null ? parseStat(disp.armor_class) : disp.armor_class,
        parseStat(disp.armor_class) != null && parseStat(disp.armor_class) <= 2 ? C.green
        : parseStat(disp.armor_class) != null && parseStat(disp.armor_class) >= 7 ? C.amber : C.text)}
      {statRow('Hit Dice', disp.hit_dice)}
      {statRow('THAC0', parseStat(disp.thac0, -5, 20) != null ? parseStat(disp.thac0, -5, 20) : disp.thac0)}
      {statRow('Movement', disp.movement)}
      {statRow('No. Appearing', disp.no_appearing ?? disp.number_appearing)}
      {statRow('Size', disp.size)}
      {statRow('Type', disp.type)}
      {statRow('Alignment', disp.alignment)}
      {statRow('Intelligence', disp.intelligence)}
      {statRow('Morale', disp.morale)}
      {statRow('XP Value', disp.xp_value != null ? Number(disp.xp_value).toLocaleString() : null, C.gold)}
      {statRow('Treasure Type', disp.treasure ?? disp.treasure_type)}

      {/* ── HP Section ── */}
      {sectionHdr('Hit Points')}
      <div style={{ background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`, borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div style={{ textAlign: 'center', padding: '8px 10px', background: 'rgba(0,0,0,.25)', borderRadius: 6, border: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 18, color: C.textDim, fontWeight: 'bold', lineHeight: 1 }}>{formatVanillaHp(monster.hit_dice)}</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, marginTop: 3, textTransform: 'uppercase' }}>Vanilla HP</div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1, fontStyle: 'italic' }}>(range per hit dice)</div>
          </div>
          <div style={{ textAlign: 'center', padding: '8px 10px', background: 'rgba(200,50,50,.08)', borderRadius: 6, border: `1px solid rgba(200,80,50,.3)` }}>
            <div style={{ fontSize: 22, color: C.red, fontWeight: 'bold', lineHeight: 1 }}>{displayHp ?? '…'}</div>
            <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, marginTop: 3, textTransform: 'uppercase' }}>Generated HP</div>
            <div style={{ fontSize: 9, color: C.textDim, marginTop: 1 }}>
              {variant && ageNum > 0 ? `age ×${ageScale} scale` : 'size × type × role × roll'}
            </div>
          </div>
        </div>
        {hpData && (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, color: C.textDim, marginBottom: 10, paddingTop: 8, borderTop: `1px solid ${C.border}` }}>
            <span>Base: <strong style={{ color: C.text }}>{hpData.generatedHpBase}</strong></span>
            <span>·</span>
            <span>Roll: <strong style={{ color: C.gold }}>{hpData.randomRoll}</strong>/20 <span style={{ fontSize: 10, color: pct >= 0 ? C.green : C.red }}>({pctStr})</span></span>
            <span>·</span>
            <span>Final: <strong style={{ color: C.red }}>{hpData.generatedHpFinal}</strong></span>
            {variant && ageNum > 0 && <>
              <span>·</span>
              <span>Age ×<strong style={{ color: C.amber }}>{ageScale}</strong> → <strong style={{ color: C.red }}>{displayHp}</strong></span>
            </>}
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
      {statRow('Attacks', disp.attacks)}
      {statRow('Damage', disp.damage)}
      {disp.breath_weapon != null && statRow('Breath Weapon', disp.breath_weapon, C.amber)}
      {statRow('Special Attacks',  disp.special_attacks,  disp.special_attacks  ? C.amber  : undefined)}
      {statRow('Special Defenses', disp.special_defenses, disp.special_defenses ? C.purple : undefined)}
      {statRow('Magic Resistance', disp.magic_resistance, disp.magic_resistance ? C.purple : undefined)}
      {statRow('Save As', disp.save_as)}

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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 3 }}>
          {['slashing','piercing','bludgeoning','fire','cold','lightning','magic','acid','poison'].map(dt => {
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
      {sectionHdr('Ecology')}
      {statRow('Source',         disp.source)}
      {statRow('Habitat',        disp.habitat)}
      {statRow('Frequency',      disp.frequency)}
      {statRow('Organization',   disp.organization)}
      {statRow('Activity Cycle', disp.activity_cycle)}
      {statRow('Diet',           disp.diet)}
      {(() => {
        const tags = Array.isArray(disp.tags)
          ? disp.tags
          : typeof disp.tags === 'string' && disp.tags
            ? disp.tags.split(',').map(t => t.trim()).filter(Boolean)
            : [];
        return tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
            {tags.map(t => (
              <span key={t} style={{ fontSize: 10, background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 10, padding: '1px 8px', color: C.textDim }}>
                {t}
              </span>
            ))}
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 12 }}>
            <span style={{ color: C.textDim }}>Tags</span>
            <span style={{ color: C.text, fontWeight: 'bold' }}>—</span>
          </div>
        );
      })()}
    </div>
  );
}
