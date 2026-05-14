import { useState, useEffect, useMemo } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';
import { MonsterDetail } from './MonsterDetail.jsx';
import LootGenerator from './LootGenerator.jsx';
import { TagFilterPanel } from '../Encounters/TagFilterPanel.tsx';
import { XpRangePanel } from '../Encounters/XpRangePanel.tsx';
import { getXpBudget } from '../Encounters/xpThresholds.ts';

// Title-case (existing) → lowercase ids the XpRangePanel expects
const DIFF_KEY = { Easy: 'easy', Medium: 'medium', Hard: 'hard', Deadly: 'deadly' };

// ── Constants ──────────────────────────────────────────────────────────────

const TERRAIN_OPTIONS = [
  'Any', 'Underground/Dungeon', 'Forest', 'Mountains',
  'Urban', 'Aquatic', 'Desert', 'Plains', 'Swamp',
];

const TERRAIN_HABITAT_MAP = {
  'Underground/Dungeon': 'underground',
  'Forest':              'forest',
  'Mountains':           'mountain',
  'Urban':               'urban',
  'Aquatic':             'aquatic',
  'Desert':              'desert',
  'Plains':              'plains',
  'Swamp':               'swamp',
};

const ENCOUNTER_TYPES = ['Random', 'Single Monster', 'Group', 'Mixed', 'Boss + Minions'];
const DIFFICULTIES    = ['Easy', 'Medium', 'Hard', 'Deadly'];
const DIFF_COLOR      = { Easy: C.green, Medium: C.gold, Hard: C.amber, Deadly: C.red };

const HD_RANGES = {
  Easy:   { min: 0.50, max: 0.75 },
  Medium: { min: 0.75, max: 1.25 },
  Hard:   { min: 1.00, max: 1.50 },
  Deadly: { min: 1.50, max: 2.50 },
};

const XP_THRESHOLD = { Easy: 100, Medium: 250, Hard: 500 };

// ── Lore Grouping ──────────────────────────────────────────────────────────
//
// Monsters are assigned to a lore group based on type/name keywords.
// COMPATIBLE_GROUPS maps each group to the set of groups that can
// appear alongside it in the same encounter.

const UNDEAD_NAMES    = ['skeleton','zombie','ghoul','ghast','wight','wraith','spectre','ghost','vampire','lich','mummy','revenant','banshee','shadow','spawn'];
const EVIL_HUM_NAMES  = ['goblin','orc','hobgoblin','gnoll','bugbear','ogre','giant','troll','kobold','lizard man','lizardman','troglodyte','yuan-ti','gnoll','drow'];
const GOOD_HUM_NAMES  = ['elf','dwarf','halfling','gnome','half-elf'];
const BEAST_NAMES     = ['wolf','bear','spider','insect','ant','rat','bat','snake','lizard','hawk','eagle','crocodile','boar','tiger','lion','panther','scorpion','beetle','wasp'];
const CONSTRUCT_NAMES = ['golem','automaton','animated'];
const DEMON_NAMES     = ['demon','balor','nalfeshnee','glabrezu','marilith','vrock','hezrou'];
const DEVIL_NAMES     = ['devil','baatezu','erinyes','cornugon','pit fiend','lemure','barbazu'];

function getMonsterGroup(monster) {
  const type = (monster.type ?? '').toLowerCase();
  const name = (monster.name ?? '').toLowerCase();

  if (type.includes('dragon') || name.includes('dragon'))                 return 'dragon';
  if (type.includes('undead')  || UNDEAD_NAMES.some(n => name.includes(n))) return 'undead';

  if (type.includes('elemental')) {
    if (name.includes('fire'))                          return 'elemental_fire';
    if (name.includes('water') || name.includes('ice')) return 'elemental_water';
    if (name.includes('earth') || name.includes('stone')) return 'elemental_earth';
    if (name.includes('air')   || name.includes('wind')) return 'elemental_air';
    return 'elemental_any';
  }

  if (type.includes('construct') || CONSTRUCT_NAMES.some(n => name.includes(n))) return 'construct';

  if (DEMON_NAMES.some(n => name.includes(n)))  return 'fiend_demon';
  if (DEVIL_NAMES.some(n => name.includes(n)))  return 'fiend_devil';

  if (EVIL_HUM_NAMES.some(n => name.includes(n)))                          return 'humanoid_evil';
  if (GOOD_HUM_NAMES.some(n => name.includes(n)))                          return 'humanoid_good';
  if (type.includes('humanoid'))                                            return 'humanoid_evil'; // default

  if (type.includes('animal') || type.includes('beast') ||
      BEAST_NAMES.some(n => name.includes(n)))                             return 'beast';

  return 'any';
}

// Groups that may appear in the same encounter.
// construct = [] means golems always fight alone.
const COMPATIBLE_GROUPS = {
  dragon:          ['dragon', 'humanoid_evil'],
  undead:          ['undead'],
  humanoid_evil:   ['humanoid_evil'],
  humanoid_good:   ['humanoid_good'],
  beast:           ['beast'],
  elemental_fire:  ['elemental_fire'],
  elemental_water: ['elemental_water'],
  elemental_earth: ['elemental_earth'],
  elemental_air:   ['elemental_air'],
  elemental_any:   ['elemental_any'],
  construct:       [],                 // fights alone
  fiend_demon:     ['fiend_demon'],
  fiend_devil:     ['fiend_devil'],
  any:             ['any', 'humanoid_evil', 'humanoid_good', 'beast'],
};

function isCompatible(g1, g2) {
  if (g1 === g2) return true;
  return (COMPATIBLE_GROUPS[g1] ?? []).includes(g2);
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pickRandom(arr) {
  if (!arr?.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickRandomN(arr, n) {
  return [...arr].sort(() => Math.random() - 0.5).slice(0, Math.min(n, arr.length));
}

function makeGroup(monster, count) {
  return {
    monster,
    count,
    initiative: Math.floor(Math.random() * 10) + 1,
    hpEach:     monster.generated_hp ?? 8,
    xpEach:     monster.xp_value ?? 0,
  };
}

// v7: Find a (monster, count) pair from the pool whose total XP fits the budget.
// Walks the pool, computes the count range that satisfies `[budgetMin, budgetMax]`
// for each monster's xp_value, then picks one of the qualifying monsters at random
// and picks a random count inside its valid window. Returns null when no monster
// in the pool can hit the budget at any allowed count.
function pickMonsterAndCount(pool, budgetMin, budgetMax, minCount = 1, maxCount = 12) {
  const candidates = [];
  for (const m of pool) {
    const xp = Number(m.xp_value) || 0;
    if (xp <= 0) continue;
    const lo = Math.max(minCount, Math.ceil(budgetMin / xp));
    const hi = Math.min(maxCount, Math.floor(budgetMax / xp));
    if (lo <= hi) candidates.push({ monster: m, lo, hi });
  }
  if (!candidates.length) return null;
  const pick  = candidates[Math.floor(Math.random() * candidates.length)];
  const count = pick.lo + Math.floor(Math.random() * (pick.hi - pick.lo + 1));
  return { monster: pick.monster, count };
}

// v7: Type-specific XP-targeted picker. Preserves lore-compatibility (Mixed/Random)
// and the boss-then-minions shape of Boss+Minions. Returns an array of
// { monster, count } pairs or null if no encounter could be assembled.
// 10% overshoot is permitted (matches the integration guide's pseudocode).
function pickEncounterForXp(pool, encType, target) {
  const tMin = target.min;
  const tMax = target.max * 1.10;

  if (encType === 'Single Monster') {
    const pick = pickMonsterAndCount(pool, tMin, tMax, 1, 1);
    return pick ? [pick] : null;
  }

  if (encType === 'Group') {
    const pick = pickMonsterAndCount(pool, tMin, tMax, 2, 12);
    // Fallback to a single monster if no group fits (e.g. very small target)
    return pick ? [pick] : pickMonsterAndCount(pool, tMin, tMax, 1, 12) && [pickMonsterAndCount(pool, tMin, tMax, 1, 12)];
  }

  if (encType === 'Boss + Minions') {
    // Boss = top 30% of the pool by xp_value (preserves "boss is significantly
    // harder than party level" intent without HD math)
    const sorted = pool.filter(m => (Number(m.xp_value) || 0) > 0)
                       .sort((a, b) => (Number(b.xp_value) || 0) - (Number(a.xp_value) || 0));
    if (!sorted.length) return null;
    const topCutoff = Math.max(1, Math.floor(sorted.length * 0.3));
    const boss = sorted[Math.floor(Math.random() * topCutoff)];
    const bossXp = Number(boss.xp_value) || 0;
    const bossGroup = getMonsterGroup(boss);
    const minionPool = pool.filter(m =>
      m.id !== boss.id && isCompatible(bossGroup, getMonsterGroup(m))
      && (Number(m.xp_value) || 0) > 0
      && (Number(m.xp_value) || 0) < bossXp / 2
    );
    const remMin = Math.max(0, tMin - bossXp);
    const remMax = tMax - bossXp;
    if (remMax <= 0) return [{ monster: boss, count: 1 }]; // boss alone already at/over target
    const minions = pickMonsterAndCount(minionPool, remMin, remMax, 2, 6);
    return minions
      ? [{ monster: boss, count: 1 }, minions]
      : [{ monster: boss, count: 1 }];
  }

  // Mixed (2-3 lore-compatible types, 1-3 each) or Random (1-3 types, 1-4 each)
  const isMixed   = encType === 'Mixed';
  const targetGroups = isMixed
    ? 2 + Math.floor(Math.random() * 2) // 2-3
    : 1 + Math.floor(Math.random() * 3); // 1-3
  const perGroupCountMax = isMixed ? 3 : 4;

  const picks = [];
  let totalSoFar = 0;
  let workingPool = pool;
  let primaryGroup = null;

  for (let i = 0; i < targetGroups; i++) {
    const remainingGroups = targetGroups - i;
    const myMin = Math.max(0, (tMin - totalSoFar) / remainingGroups);
    const myMax = (tMax - totalSoFar) / remainingGroups * 1.30; // a bit of slack per slot
    if (myMax < 1) break;

    const pick = pickMonsterAndCount(workingPool, myMin, myMax, 1, perGroupCountMax);
    if (!pick) break;

    picks.push(pick);
    totalSoFar += (Number(pick.monster.xp_value) || 0) * pick.count;

    if (i === 0) {
      // Lock to lore-compatible monsters after the first pick
      primaryGroup = getMonsterGroup(pick.monster);
      workingPool = pool.filter(m =>
        m.id !== pick.monster.id && isCompatible(primaryGroup, getMonsterGroup(m))
      );
    } else {
      workingPool = workingPool.filter(m => m.id !== pick.monster.id);
    }
    if (!workingPool.length) break;
  }
  return picks.length ? picks : null;
}

function rateDifficulty(totalXp, level, partySize) {
  const base = level * partySize;
  if (totalXp < base * XP_THRESHOLD.Easy)   return 'Easy';
  if (totalXp < base * XP_THRESHOLD.Medium)  return 'Medium';
  if (totalXp < base * XP_THRESHOLD.Hard)    return 'Hard';
  return 'Deadly';
}

// ── Component ──────────────────────────────────────────────────────────────

export default function EncounterBuilder({ campaignId }) {
  const [partySize,  setPartySize]  = useState(4);
  const [level,      setLevel]      = useState(5);
  const [difficulty, setDifficulty] = useState('Medium');
  const [terrain,    setTerrain]    = useState('Any');
  const [encType,    setEncType]    = useState('Random');

  const [generating, setGenerating] = useState(false);
  const [groups,     setGroups]     = useState(null);
  const [genError,   setGenError]   = useState(null);
  const [genWarning, setGenWarning] = useState(null);

  // v7: effective XP target range (panel-driven). Defaults to the
  // difficulty-derived budget so generation works before the panel
  // has rendered & emitted its first onRangeChange.
  const [effectiveRange, setEffectiveRange] = useState(() => ({
    ...getXpBudget(DIFF_KEY[difficulty] ?? 'medium', partySize, level),
    source: 'difficulty',
  }));

  // v6: bulk-load all monsters once for the TagFilterPanel sidebar.
  // The panel does live tag filtering in memory; generate() intersects
  // server-side HD/habitat results with this set so the existing
  // Party Size / Difficulty / Terrain controls still apply.
  const [allMonsters,  setAllMonsters]  = useState([]);
  const [filteredPool, setFilteredPool] = useState([]);

  useEffect(() => {
    let cancelled = false;
    api.searchMonsters({
      limit: 5000,
      ...(campaignId ? { campaign_id: campaignId } : {}),
    })
      .then(result => {
        if (cancelled) return;
        const list = result.monsters ?? [];
        setAllMonsters(list);
        setFilteredPool(list);
      })
      .catch(() => { /* non-fatal — generator still works via server fetchPool */ });
    return () => { cancelled = true; };
  }, [campaignId]);

  // Fast id-lookup set for intersecting server pool with tag-filtered pool.
  // When no tag filters are active, filteredPool == allMonsters and the
  // intersection is a no-op (size matches).
  const filteredIds = useMemo(
    () => new Set(filteredPool.map(m => m.id)),
    [filteredPool],
  );
  const filterActive = allMonsters.length > 0 && filteredPool.length !== allMonsters.length;

  const [generatedLoot, setGeneratedLoot] = useState([]);

  const [encName, setEncName] = useState('');
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState(null);

  const [detailId, setDetailId] = useState(null);

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputStyle = {
    background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 5,
    padding: '6px 10px', color: C.text, fontFamily: 'inherit', fontSize: 12,
    outline: 'none', width: '100%', boxSizing: 'border-box',
  };

  const labelStyle = {
    fontSize: 10, letterSpacing: 2, color: C.textDim,
    textTransform: 'uppercase', display: 'block', marginBottom: 5,
  };

  function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? `${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)}` : '212,160,53';
  }

  function btnGroup(options, value, onChange, colorFn) {
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {options.map(o => {
          const active = value === o;
          const col = active && colorFn ? colorFn(o) : null;
          return (
            <button key={o} onClick={() => onChange(o)} style={{
              padding: '5px 11px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
              border: `1px solid ${active ? (col || C.gold) : C.border}`,
              background: active ? `rgba(${hexToRgb(col || C.gold)},.18)` : 'rgba(0,0,0,.3)',
              color: active ? (col || C.gold) : C.textDim,
              fontFamily: 'inherit', transition: 'all .1s',
            }}>
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  // ── API helpers ───────────────────────────────────────────────────────────

  async function fetchPool(hdMin, hdMax, habitatTerm) {
    const params = {
      hd_min: Math.max(0, Math.floor(hdMin)),
      hd_max: Math.ceil(Math.max(hdMin + 0.5, hdMax)),
      limit: 80,
      sort: 'name_asc',
    };
    if (habitatTerm) params.habitat = habitatTerm;
    let result = await api.searchMonsters(params);
    // Fallback: retry without habitat if empty
    if (!result.monsters.length && habitatTerm) {
      result = await api.searchMonsters({ ...params, habitat: undefined });
    }
    let pool = result.monsters ?? [];
    // v6: when the TagFilterPanel has narrowed the pool, intersect server
    // results with the user's selection. No-op when no tag filter is active.
    if (filterActive) {
      pool = pool.filter(m => filteredIds.has(m.id));
    }
    return pool;
  }

  // ── Generate ──────────────────────────────────────────────────────────────

  async function generate() {
    setGenerating(true);
    setGenError(null);
    setGenWarning(null);
    setGroups(null);
    try {
      const habitatTerm = TERRAIN_HABITAT_MAP[terrain] ?? '';

      // v7 rewrite: pool is HD-widened (was difficulty-specific) so we don't
      // pre-exclude monsters whose xp_value can hit the target. The XP-target
      // algorithm filters by xp inside pickMonsterAndCount.
      const pool = await fetchPool(level * 0.25, level * 3.0, habitatTerm);
      if (!pool.length) {
        setGenError('No monsters found for these settings. Try a different terrain or relax tag filters.');
        return;
      }

      // Target range — comes from the panel via setEffectiveRange. Falls back
      // to the difficulty-derived budget if the panel hasn't emitted yet.
      const target = effectiveRange ?? {
        ...getXpBudget(DIFF_KEY[difficulty] ?? 'medium', partySize, level),
        source: 'difficulty',
      };
      const tMin = target.min;
      const tMax = target.max;
      const midpoint = (tMin + tMax) / 2;
      const overshootMax = tMax * 1.10;

      // Try up to 30 times, keep the attempt closest to the midpoint when
      // none falls inside the band. Random + Mixed are stochastic so retries
      // genuinely explore the space; Single Monster / Group converge fast.
      const MAX_ATTEMPTS = 30;
      let best = null;
      let bestDelta = Infinity;

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const picks = pickEncounterForXp(pool, encType, target);
        if (!picks || !picks.length) continue;
        const total = picks.reduce(
          (s, p) => s + (Number(p.monster.xp_value) || 0) * p.count, 0,
        );
        if (total >= tMin && total <= overshootMax) {
          best = { picks, total };
          break;  // hit the band — accept first match
        }
        const delta = Math.abs(total - midpoint);
        if (delta < bestDelta) {
          best = { picks, total };
          bestDelta = delta;
        }
      }

      if (!best) {
        setGenError('Could not assemble an encounter with the current pool. Relax filters or widen the XP range.');
        return;
      }

      const newGroups = best.picks.map(p => makeGroup(p.monster, p.count));
      setGroups(newGroups);

      if (best.total < tMin || best.total > overshootMax) {
        setGenWarning(
          `Couldn't reach target — closest was ${best.total.toLocaleString()} XP ` +
          `(target ${tMin.toLocaleString()}–${tMax.toLocaleString()})`,
        );
      }
    } catch (e) {
      setGenError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  // Saves to saved_encounters with per-creature HP tracking rows

  // Parse first valid integer from a raw stat value (handles "610" → 6, "6 10" → 6)
  function parseStat(v, lo = -10, hi = 30) {
    if (v == null) return null;
    const n = Number(v);
    if (Number.isInteger(n) && n >= lo && n <= hi) return n;
    const m = String(v).match(/-?\d+/);
    return m ? parseInt(m[0], 10) : null;
  }

  async function saveEncounter() {
    if (!campaignId || !encName.trim() || !groups?.length) return;
    setSaving(true);
    try {
      const totalXp = groups.reduce((s, g) => s + g.xpEach * g.count, 0);
      const rated   = rateDifficulty(totalXp, level, partySize);

      // Expand each group into individual creature rows with full combat stats
      const creatures = [];
      for (const g of groups) {
        for (let i = 0; i < g.count; i++) {
          creatures.push({
            monster_id:   g.monster.id,
            monster_name: g.monster.name,
            max_hp:       g.hpEach,
            current_hp:   g.hpEach,
            initiative:   0,
            ac:           parseStat(g.monster.armor_class),
            thac0:        parseStat(g.monster.thac0, -5, 25),
            attacks:      g.monster.attacks ?? null,
            damage:       g.monster.damage  ?? null,
            xp_value:     g.monster.xp_value ?? 0,
          });
        }
      }

      await api.createSavedEncounter({
        campaign_id: campaignId,
        title:       encName.trim(),
        terrain,
        difficulty:  rated,
        party_level: level,
        party_size:  partySize,
        total_xp:    totalXp,
        creatures,
        loot_data:   generatedLoot.length ? generatedLoot : undefined,
      });
      setSaveError(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      setEncName('');
    } catch (e) {
      console.error('Save encounter:', e);
      setSaveError(e.message ?? 'Failed to save encounter');
    } finally {
      setSaving(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const totalXp  = groups ? groups.reduce((s, g) => s + g.xpEach * g.count, 0) : 0;
  const ratedDiff = groups ? rateDifficulty(totalXp, level, partySize) : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={{
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
      display: 'flex', gap: 20, alignItems: 'flex-start',
    }}>

      {/* ── v6 Tag Filter sidebar — narrows the random-pick pool ────── */}
      <div style={{ width: 280, flexShrink: 0 }}>
        <TagFilterPanel
          storageKey="generator"
          monsters={allMonsters}
          onFilteredChange={setFilteredPool}
        />
      </div>

      {/* ── Main column: existing settings + generated encounter ────── */}
      <div style={{ flex: 1, minWidth: 0 }}>

      {/* ── Settings ────────────────────────────────────────────── */}
      <div style={{
        background: 'rgba(0,0,0,.25)', border: `1px solid ${C.borderHi}`,
        borderRadius: 10, padding: '20px 24px', marginBottom: 20,
      }}>
        <div style={{ fontSize: 15, color: C.gold, fontWeight: 'bold', marginBottom: 18 }}>
          ⚔️ Encounter Generator
        </div>

        {/* Party settings */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 18 }}>
          <div>
            <label style={labelStyle}>Party Size</label>
            <input
              type="number" min={1} max={8} value={partySize}
              onChange={e => setPartySize(Math.min(8, Math.max(1, +e.target.value)))}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Avg Party Level</label>
            <input
              type="number" min={1} max={20} value={level}
              onChange={e => setLevel(Math.min(20, Math.max(1, +e.target.value)))}
              style={inputStyle}
            />
          </div>
          <div style={{ gridColumn: 'span 2' }}>
            <label style={labelStyle}>Difficulty</label>
            {btnGroup(DIFFICULTIES, difficulty, setDifficulty, d => DIFF_COLOR[d])}
            {/* v7 Custom XP range — overrides Difficulty's derived budget when active */}
            <XpRangePanel
              difficulty={DIFF_KEY[difficulty] ?? 'medium'}
              partySize={partySize}
              partyLevel={level}
              onRangeChange={setEffectiveRange}
            />
          </div>
        </div>

        {/* Terrain */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Terrain / Environment</label>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {TERRAIN_OPTIONS.map(t => {
              const active = terrain === t;
              return (
                <button key={t} onClick={() => setTerrain(t)} style={{
                  padding: '5px 11px', fontSize: 11, borderRadius: 5, cursor: 'pointer',
                  border: `1px solid ${active ? C.blue : C.border}`,
                  background: active ? 'rgba(104,168,208,.15)' : 'rgba(0,0,0,.3)',
                  color: active ? C.blue : C.textDim,
                  fontFamily: 'inherit', transition: 'all .1s',
                }}>
                  {t}
                </button>
              );
            })}
          </div>
        </div>

        {/* Encounter type */}
        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle}>Encounter Type</label>
          {btnGroup(ENCOUNTER_TYPES, encType, setEncType, null)}
          <div style={{ fontSize: 10, color: C.textDim, marginTop: 6, fontStyle: 'italic' }}>
            {encType === 'Mixed'         && 'Mixes lore-compatible monster types (undead with undead, humanoids with humanoids, etc.)'}
            {encType === 'Boss + Minions'&& 'Boss type determines valid minion groups — no undead + living-animal mixes'}
            {encType === 'Random'        && '1–3 groups of lore-compatible monsters'}
            {encType === 'Group'         && 'Multiple of the same monster type'}
            {encType === 'Single Monster'&& 'One monster — ideal for ambushes or rare encounters'}
          </div>
        </div>

        {/* Generate button */}
        <button
          onClick={generate}
          disabled={generating}
          style={{
            background: generating ? 'rgba(0,0,0,.3)' : 'linear-gradient(135deg,#7a5a10,#c8a84b)',
            border: 'none', borderRadius: 7, padding: '10px 28px',
            color: generating ? C.textDim : '#1a0f00',
            cursor: generating ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold',
          }}
        >
          {generating ? '⏳ Generating…' : '🎲 Generate Encounter'}
        </button>
      </div>

      {/* ── Error ── */}
      {genError && (
        <div style={{
          background: 'rgba(200,50,50,.15)', border: `1px solid rgba(200,50,50,.4)`,
          borderRadius: 7, padding: '10px 16px', color: '#e08080',
          fontSize: 12, marginBottom: 16,
        }}>
          ⚠ {genError}
        </div>
      )}

      {/* ── XP target warning (v7) ── */}
      {genWarning && (
        <div style={{
          background: 'rgba(212,160,53,.12)', border: `1px solid rgba(212,160,53,.4)`,
          borderRadius: 7, padding: '10px 16px', color: C.gold,
          fontSize: 12, marginBottom: 16,
        }}>
          ⓘ {genWarning}
        </div>
      )}

      {/* ── Encounter output ── */}
      {groups && (
        <div style={{
          background: 'rgba(0,0,0,.25)', border: `1px solid ${C.borderHi}`,
          borderRadius: 10, padding: '20px 24px',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            marginBottom: 16, flexWrap: 'wrap',
          }}>
            <div style={{ fontSize: 14, color: C.gold, fontWeight: 'bold' }}>
              Generated Encounter
            </div>
            {/* Lore group labels */}
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {[...new Set(groups.map(g => getMonsterGroup(g.monster)))].map(grp => (
                <span key={grp} style={{
                  fontSize: 9, letterSpacing: 1, padding: '1px 8px', borderRadius: 10,
                  background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
                  color: C.textDim, textTransform: 'uppercase',
                }}>
                  {grp.replace('_', ' ')}
                </span>
              ))}
            </div>
            <button onClick={generate} disabled={generating} style={{
              marginLeft: 'auto',
              background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '4px 14px', cursor: 'pointer',
              color: C.textDim, fontFamily: 'inherit', fontSize: 11,
            }}>
              🎲 Reroll
            </button>
          </div>

          {/* Monster groups */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {groups.map((g, i) => {
              const totalHp  = g.hpEach * g.count;
              const totalXpG = g.xpEach * g.count;
              return (
                <div key={i} style={{
                  background: 'rgba(0,0,0,.35)', border: `1px solid ${C.border}`,
                  borderRadius: 8, padding: '12px 16px',
                  display: 'flex', gap: 16, alignItems: 'flex-start', flexWrap: 'wrap',
                }}>
                  {/* Initiative badge */}
                  <div style={{
                    background: 'rgba(212,160,53,.12)', border: `1px solid ${C.borderHi}`,
                    borderRadius: 6, padding: '6px 10px', textAlign: 'center', minWidth: 44, flexShrink: 0,
                  }}>
                    <div style={{ fontSize: 18, color: C.gold, fontWeight: 'bold', lineHeight: 1 }}>
                      {g.initiative}
                    </div>
                    <div style={{ fontSize: 8, color: C.textDim, letterSpacing: 1 }}>INIT</div>
                  </div>

                  {/* Monster info */}
                  <div style={{ flex: 1, minWidth: 160 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      <button
                        onClick={() => setDetailId(prev => prev === g.monster.id ? null : g.monster.id)}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: C.gold, fontFamily: 'inherit', fontSize: 15,
                          fontWeight: 'bold', padding: 0, textAlign: 'left',
                          textDecoration: 'underline dotted',
                        }}
                      >
                        {g.count > 1 ? `${g.count}× ` : ''}{g.monster.name}
                      </button>
                      <span style={{
                        fontSize: 9, letterSpacing: 1, color: C.textDim,
                        background: 'rgba(0,0,0,.35)', border: `1px solid ${C.border}`,
                        borderRadius: 8, padding: '1px 6px', textTransform: 'uppercase',
                      }}>
                        {getMonsterGroup(g.monster).replace('_', ' ')}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.textDim }}>
                      {[g.monster.size, g.monster.type, g.monster.alignment].filter(Boolean).join(' · ')}
                      {g.monster.hit_dice && ` · HD ${g.monster.hit_dice}`}
                      {g.monster.armor_class != null && ` · AC ${g.monster.armor_class}`}
                    </div>
                    {g.monster.special_attacks && (
                      <div style={{ fontSize: 11, color: C.amber, marginTop: 4 }}>
                        ⚠ Special: {g.monster.special_attacks}
                      </div>
                    )}
                    {g.monster.magic_resistance && (
                      <div style={{ fontSize: 11, color: C.purple, marginTop: 2 }}>
                        ✦ MR: {g.monster.magic_resistance}
                      </div>
                    )}
                  </div>

                  {/* HP / XP stats */}
                  <div style={{ display: 'flex', gap: 20, flexShrink: 0 }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, color: C.red, fontWeight: 'bold' }}>
                        {totalHp}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>TOTAL HP</div>
                      {g.count > 1 && (
                        <div style={{ fontSize: 9, color: C.textDim }}>{g.hpEach} ea.</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 16, color: C.gold, fontWeight: 'bold' }}>
                        {totalXpG.toLocaleString()}
                      </div>
                      <div style={{ fontSize: 9, color: C.textDim, letterSpacing: 1 }}>TOTAL XP</div>
                      {g.count > 1 && (
                        <div style={{ fontSize: 9, color: C.textDim }}>{g.xpEach.toLocaleString()} ea.</div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals + difficulty */}
          <div style={{
            background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
            borderRadius: 8, padding: '12px 16px',
            display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap',
            marginBottom: 20,
          }}>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' }}>Total XP</div>
              <div style={{ fontSize: 22, color: C.gold, fontWeight: 'bold' }}>{totalXp.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: 2, color: C.textDim, textTransform: 'uppercase' }}>Difficulty Rating</div>
              <div style={{ fontSize: 18, fontWeight: 'bold', letterSpacing: 1, color: DIFF_COLOR[ratedDiff] ?? C.text }}>
                {ratedDiff?.toUpperCase()}
              </div>
            </div>
            <div style={{ fontSize: 11, color: C.textDim }}>
              Easy &lt; {(level * partySize * XP_THRESHOLD.Easy).toLocaleString()} XP ·{' '}
              Medium &lt; {(level * partySize * XP_THRESHOLD.Medium).toLocaleString()} XP ·{' '}
              Hard &lt; {(level * partySize * XP_THRESHOLD.Hard).toLocaleString()} XP
            </div>
          </div>

          {/* Loot Generator */}
          <LootGenerator
            groups={groups}
            terrain={terrain}
            difficulty={ratedDiff ?? difficulty}
            partyLevel={level}
            onLootGenerated={items => setGeneratedLoot(items)}
          />

          {/* Save */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 16 }}>
            <input
              value={encName}
              onChange={e => setEncName(e.target.value)}
              placeholder="Encounter name to save…"
              style={{ ...inputStyle, maxWidth: 300 }}
            />
            <button
              onClick={saveEncounter}
              disabled={saving || !encName.trim() || !campaignId}
              style={{
                background: saved ? 'rgba(60,180,60,.2)' : 'linear-gradient(135deg,#7a5a10,#c8a84b)',
                border: 'none', borderRadius: 6, padding: '8px 20px',
                color: saved ? '#80e080' : '#1a0f00',
                cursor: (saving || !encName.trim() || !campaignId) ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: 13, fontWeight: 'bold',
              }}
            >
              {saving ? 'Saving…' : saved ? '✓ Saved!' : '💾 Save Encounter'}
            </button>
            {!campaignId && (
              <span style={{ fontSize: 11, color: C.textDim }}>(campaign required to save)</span>
            )}
            {saveError && (
              <span style={{ fontSize: 12, color: C.red }}>⚠ {saveError}</span>
            )}
          </div>
        </div>
      )}

      {/* ── Monster detail overlay ── */}
      {detailId && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, padding: 20,
          }}
          onClick={e => { if (e.target === e.currentTarget) setDetailId(null); }}
        >
          <div style={{ width: '100%', maxWidth: 480, maxHeight: '90vh' }}>
            <MonsterDetail monsterId={detailId} onClose={() => setDetailId(null)} />
          </div>
        </div>
      )}
      </div>{/* end main column */}
    </div>
  );
}
