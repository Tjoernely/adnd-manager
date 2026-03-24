/**
 * LootGenerator.jsx
 * Three loot modes:
 *   🎲 Official  — AD&D 2E treasure tables (coins / gems / magic count)
 *   ⚗️  Smart    — lootRollEngine picks real DB items within XP budget
 *   ✨ AI Loot  — direct Anthropic API call using stored API key
 */
import { useState } from 'react';
import { C }        from '../../data/constants.js';
import { rollLoot } from '../../rules-engine/lootRollEngine.js';

// ── Smart Loot helpers ────────────────────────────────────────────────────────

const DEFAULT_XP_BY_TABLE = {
  A:1000, B:300,  C:200,  D:2000, E:2500,
  F:3000, G:4000, H:5000, I:1500, J:50,
  K:100,  L:500,  M:800,  N:200,  O:150,
  P:1000, Q:10000,R:500,  S:2000, T:500,
};

function smartBudget(level) {
  if (level <= 3)  return 500;
  if (level <= 6)  return 1500;
  if (level <= 9)  return 3000;
  if (level <= 12) return 5000;
  return 8000;
}

// ── Dice helpers ──────────────────────────────────────────────────────────────

function d(sides) { return Math.floor(Math.random() * sides) + 1; }
function dN(n, sides) { let s = 0; for (let i = 0; i < n; i++) s += d(sides); return s; }
function pct(chance) { return Math.random() * 100 < chance; }

// ── AD&D 2E Treasure tables ───────────────────────────────────────────────────

const T = {
  A: { coins:[{t:'cp',p:25,n:1,s:6,m:1000},{t:'sp',p:30,n:1,s:6,m:1000},{t:'gp',p:40,n:1,s:10,m:1000}], gems:{p:20,n:1,s:4}, jewelry:{p:20,n:1,s:4}, magic:{p:30,c:3,r:'any'} },
  B: { coins:[{t:'cp',p:50,n:1,s:8,m:1000},{t:'sp',p:25,n:1,s:6,m:1000},{t:'gp',p:25,n:1,s:3,m:1000}], gems:{p:10,n:1,s:4}, magic:{p:10,c:1,r:'weapon/armor'} },
  C: { coins:[{t:'cp',p:20,n:1,s:12,m:1000},{t:'sp',p:30,n:1,s:4,m:1000}], gems:{p:10,n:1,s:4}, magic:{p:15,c:2,r:'any'} },
  D: { coins:[{t:'cp',p:10,n:1,s:8,m:1000},{t:'sp',p:15,n:1,s:12,m:1000},{t:'gp',p:15,n:1,s:6,m:1000}], gems:{p:10,n:1,s:8}, jewelry:{p:5,n:1,s:4}, magic:{p:20,c:2,r:'any',bonus:'+1 potion'} },
  E: { coins:[{t:'cp',p:5,n:1,s:10,m:1000},{t:'sp',p:30,n:1,s:12,m:1000},{t:'ep',p:25,n:1,s:4,m:1000}], gems:{p:10,n:1,s:8}, jewelry:{p:5,n:1,s:4}, magic:{p:30,c:3,r:'any',bonus:'+1 scroll'} },
  F: { coins:[{t:'sp',p:10,n:1,s:10,m:1000},{t:'ep',p:20,n:1,s:10,m:1000},{t:'gp',p:45,n:1,s:10,m:1000}], gems:{p:20,n:1,s:12}, jewelry:{p:10,n:1,s:12}, magic:{p:30,c:3,r:'no weapons',bonus:'+1 potion +1 scroll'} },
  G: { coins:[{t:'gp',p:50,n:1,s:10,m:1000},{t:'gp',p:50,n:1,s:4,m:10000}], gems:{p:25,n:1,s:4}, jewelry:{p:20,n:1,s:4}, magic:{p:35,c:4,r:'any'} },
  H: { coins:[{t:'cp',p:25,n:3,s:8,m:1000},{t:'sp',p:40,n:1,s:100,m:1000},{t:'ep',p:40,n:1,s:4,m:10000},{t:'gp',p:55,n:1,s:10,m:10000}], gems:{p:50,n:1,s:100}, jewelry:{p:50,n:10,s:4}, magic:{p:15,c:4,r:'any'} },
  I: { gems:{p:30,n:1,s:8}, jewelry:{p:20,n:1,s:8}, magic:{p:15,c:1,r:'any'} },
  J: { coins:[{t:'cp',p:25,n:1,s:4,m:1000}] },
  K: { coins:[{t:'cp',p:25,n:1,s:4,m:1000},{t:'sp',p:30,n:1,s:6,m:1000}] },
  L: { gems:{p:50,n:1,s:4} },
  M: { coins:[{t:'gp',p:40,n:2,s:4,m:1000},{t:'pp',p:50,n:5,s:6,m:100}], gems:{p:55,n:1,s:6} },
  N: { magic:{p:45,c:4,r:'potion'} },
  O: { magic:{p:40,c:4,r:'scroll'} },
};

async function rollTable(tableKey) {
  const table = T[tableKey?.toUpperCase()];
  if (!table) return null;
  const lines = [];
  for (const coin of (table.coins ?? [])) {
    if (pct(coin.p)) lines.push(`💰 ${(dN(coin.n, coin.s) * coin.m).toLocaleString()} ${coin.t.toUpperCase()}`);
  }
  if (table.gems    && pct(table.gems.p))    { const c = dN(1, table.gems.s);    lines.push(`💎 ${c} gem${c !== 1 ? 's' : ''}`); }
  if (table.jewelry && pct(table.jewelry.p)) { const c = dN(1, table.jewelry.s); lines.push(`📿 ${c} piece${c !== 1 ? 's' : ''} of jewelry`); }
  if (table.magic   && pct(table.magic.p)) {
    const count = table.magic.c ?? 1;
    const restr = table.magic.r !== 'any' ? ` (${table.magic.r})` : '';
    lines.push(`✨ ${count} magic item${count !== 1 ? 's' : ''}${restr}`);
    if (table.magic.bonus) lines.push(`📜 Bonus: ${table.magic.bonus}`);
  }
  return lines.length ? lines : ['(No treasure rolled — try again)'];
}

const TIER_UP   = { A:'B', B:'C', C:'D', D:'E', E:'F', F:'G', G:'H' };
const FREQ_TABLE = { common:'C', uncommon:'D', rare:'F', very:'G', unique:'H', legendary:'H' };

function levelTable(level) {
  if (level <= 3)  return 'C';
  if (level <= 6)  return 'D';
  if (level <= 9)  return 'F';
  if (level <= 12) return 'G';
  return 'H';
}

function effectiveTable(treasureType, difficulty, partyLevel = 5) {
  let t = (treasureType ?? '').trim().toUpperCase().charAt(0);
  if (!T[t]) {
    const word = (treasureType ?? '').trim().toLowerCase().split(/\s+/)[0];
    t = FREQ_TABLE[word] ?? '';
  }
  if (!T[t]) t = levelTable(partyLevel);
  if (['Hard','Deadly'].includes(difficulty)) t = TIER_UP[t] ?? t;
  return t;
}

// ── Category icons ────────────────────────────────────────────────────────────
const CAT_ICON = {
  potion:'🧪', scroll:'📜', ring:'💍', rod:'🪄', staff:'🔮', wand:'✨',
  gem:'💎', jewelry:'📿', boots_gloves_accessories:'🥾', armor_shield:'🛡️',
  weapon:'⚔️', misc:'⚗️', artifact_relic:'👑',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function LootGenerator({ monster, groups, terrain = 'dungeon', difficulty = 'Medium', partyLevel = 5 }) {
  const [lootLines,    setLootLines]    = useState(null);
  const [aiText,       setAiText]       = useState(null);
  const [smartResult,  setSmartResult]  = useState(null);
  const [rolling,      setRolling]      = useState(false);
  const [aiLoading,    setAiLoading]    = useState(false);
  const [aiError,      setAiError]      = useState(null);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartError,   setSmartError]   = useState(null);
  const [showLog,      setShowLog]      = useState(false);
  const [activeTab,    setActiveTab]    = useState('official');

  const ff = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

  // ── Official treasure roll ──────────────────────────────────────────────────
  async function handleRollOfficial() {
    setRolling(true);
    setLootLines(null);
    try {
      const src   = monster ?? groups?.[0]?.monster;
      const tType = effectiveTable(src?.treasure ?? src?.frequency ?? null, difficulty, partyLevel);
      const lines = await rollTable(tType);
      setLootLines(lines ?? ['(Nothing of value was found)']);
      setActiveTab('official');
    } finally { setRolling(false); }
  }

  // ── Smart Loot (direct API call with auth + XP defaults) ───────────────────
  async function handleSmartLoot() {
    setSmartLoading(true);
    setSmartResult(null);
    setSmartError(null);
    try {
      const token   = localStorage.getItem('dnd_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/magical-items/loot-pool?limit=300', { headers });
      if (!res.ok) throw new Error(`Loot pool fetch failed: HTTP ${res.status}`);
      let pool = await res.json();

      // Apply XP defaults for items whose xp_value is null/0
      pool = pool.map(item => ({
        ...item,
        listedXp: item.listedXp > 0
          ? item.listedXp
          : DEFAULT_XP_BY_TABLE[item.table_letter?.toUpperCase()] ?? 500,
      }));

      // Exclude cursed items
      pool = pool.filter(item => !item.excludedByDefault);

      const budget = smartBudget(partyLevel);
      const log = [
        `Party Lv${partyLevel} → Budget: ${budget.toLocaleString()} XP`,
        `Pool: ${pool.length} items after filtering`,
      ];

      // Greedy random selection within budget
      const results   = [];
      const used      = new Set();
      let   remaining = budget;

      for (let i = 0; i < 4 && remaining > 0; i++) {
        const candidates = pool.filter(it => !used.has(it.id) && it.listedXp <= remaining);
        if (!candidates.length) { log.push(`No items fit remaining budget (${remaining.toLocaleString()} XP)`); break; }
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        results.push(picked);
        used.add(picked.id);
        remaining -= picked.listedXp;
        log.push(`  [${i + 1}] ${picked.name} — ${picked.listedXp.toLocaleString()} XP · ${picked.gpValue.toLocaleString()} gp`);
      }

      const totalXp = results.reduce((s, it) => s + it.listedXp, 0);
      const totalGp = results.reduce((s, it) => s + it.gpValue,  0);
      log.push(`Done: ${results.length} item${results.length !== 1 ? 's' : ''} · ${totalXp.toLocaleString()} XP · ${totalGp.toLocaleString()} gp`);

      setSmartResult({ items: results, totalXp, totalGp, budget, log });
      setActiveTab('smart');
    } catch (e) {
      setSmartError(e.message ?? 'Failed to fetch loot pool — is the server running?');
    } finally { setSmartLoading(false); }
  }

  // ── AI Loot (proxied through /api/ai/loot to avoid CORS) ───────────────────
  async function handleAiLoot() {
    setAiLoading(true);
    setAiError(null);
    setAiText(null);
    try {
      const token = localStorage.getItem('dnd_token');

      const monsters = groups
        ? groups.map(g => ({ name: g.monster?.name ?? 'Monster', count: g.count ?? 1 }))
        : monster
          ? [{ name: monster.name, count: 1 }]
          : [];

      const response = await fetch('/api/ai/loot', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          monsters,
          terrain,
          difficulty,
          party_level: partyLevel,
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(errBody?.error ?? `Server error ${response.status}`);
      }

      const data = await response.json();
      const text = data?.text ?? '';
      if (!text) throw new Error('Empty response from AI');
      setAiText(text);
      setActiveTab('ai');
    } catch (e) {
      setAiError(e.message ?? 'AI request failed — is the server running?');
    } finally { setAiLoading(false); }
  }

  const sectionHdr = () => (
    <div style={{
      fontSize: 10, letterSpacing: 3, color: C.textDim, textTransform: 'uppercase',
      borderBottom: `1px solid ${C.border}`, paddingBottom: 4, marginBottom: 10,
    }}>
      Loot Generator
    </div>
  );

  const btnBase = {
    borderRadius: 5, padding: '7px 14px', cursor: 'pointer',
    fontFamily: ff, fontSize: 11, fontWeight: 'bold',
  };

  return (
    <div style={{ marginTop: 14 }}>
      {sectionHdr()}

      {/* ── Buttons ── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button onClick={handleRollOfficial} disabled={rolling} style={{
          ...btnBase,
          background: rolling ? 'rgba(0,0,0,.3)' : 'rgba(212,160,53,.2)',
          border: `1px solid ${C.borderHi}`, color: rolling ? C.textDim : C.gold,
        }}>
          {rolling ? '⏳ Rolling…' : '🎲 Official'}
        </button>

        <button onClick={handleSmartLoot} disabled={smartLoading} style={{
          ...btnBase,
          background: smartLoading ? 'rgba(0,0,0,.3)' : 'rgba(109,190,136,.12)',
          border: `1px solid rgba(109,190,136,.4)`, color: smartLoading ? C.textDim : C.green,
        }}>
          {smartLoading ? '⏳ Fetching…' : '⚗️ Smart Loot'}
        </button>

        <button onClick={handleAiLoot} disabled={aiLoading} style={{
          ...btnBase,
          background: aiLoading ? 'rgba(0,0,0,.3)' : 'rgba(104,168,208,.15)',
          border: `1px solid rgba(104,168,208,.4)`, color: aiLoading ? C.textDim : C.blue,
        }}>
          {aiLoading ? '⏳ Consulting Oracle…' : '✨ AI Loot'}
        </button>
      </div>

      {/* ── Errors ── */}
      {aiError && (
        <div style={{
          fontSize: 11, color: '#e08080', background: 'rgba(200,50,50,.1)',
          border: `1px solid rgba(200,50,50,.3)`, borderRadius: 6,
          padding: '8px 12px', marginBottom: 10,
        }}>⚠ {aiError}</div>
      )}
      {smartError && (
        <div style={{
          fontSize: 11, color: '#e08080', background: 'rgba(200,50,50,.1)',
          border: `1px solid rgba(200,50,50,.3)`, borderRadius: 6,
          padding: '8px 12px', marginBottom: 10,
        }}>⚗️ {smartError}</div>
      )}

      {/* ── Official result ── */}
      {lootLines && activeTab === 'official' && (
        <div style={{
          background: 'rgba(212,160,53,.06)', border: `1px solid ${C.borderHi}`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 'bold', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>💰 Treasure Found</span>
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 'normal' }}>
              {difficulty} · Table {(() => {
                const src = monster ?? groups?.[0]?.monster;
                return effectiveTable(src?.treasure ?? src?.frequency ?? null, difficulty, partyLevel);
              })()}
            </span>
          </div>
          {lootLines.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 4, lineHeight: 1.6 }}>{line}</div>
          ))}
          <button onClick={handleRollOfficial} disabled={rolling} style={{
            marginTop: 10, background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
            color: C.textDim, fontFamily: ff, fontSize: 10,
          }}>🎲 Re-roll</button>
        </div>
      )}

      {/* ── Smart Loot result ── */}
      {smartResult && activeTab === 'smart' && (
        <div style={{
          background: 'rgba(109,190,136,.05)', border: `1px solid rgba(109,190,136,.3)`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: C.green, fontWeight: 'bold' }}>
              ⚗️ Smart Loot — {smartResult.items.length} item{smartResult.items.length !== 1 ? 's' : ''}
            </span>
            <span style={{ fontSize: 10, color: C.textDim }}>
              Budget: {smartResult.budget.toLocaleString()} XP ·&nbsp;
              Used: {smartResult.totalXp.toLocaleString()} XP ·&nbsp;
              {smartResult.totalGp.toLocaleString()} gp
            </span>
          </div>

          {smartResult.items.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textDim, fontStyle: 'italic' }}>
              No items matched the filters. Try different terrain or difficulty.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {smartResult.items.map(item => (
                <div key={item.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  background: 'rgba(0,0,0,.25)', borderRadius: 6, padding: '8px 10px',
                  border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 16, flexShrink: 0 }}>
                    {CAT_ICON[item.category] ?? '⚗️'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, color: C.text, fontWeight: 'bold' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: C.textDim }}>
                      {item.category} · {item.listedXp.toLocaleString()} XP · {item.gpValue.toLocaleString()} gp
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
            <button onClick={handleSmartLoot} disabled={smartLoading} style={{
              background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
              color: C.textDim, fontFamily: ff, fontSize: 10,
            }}>⚗️ Re-roll</button>
            <button onClick={() => setShowLog(v => !v)} style={{
              background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '3px 10px', cursor: 'pointer',
              color: C.textDim, fontFamily: ff, fontSize: 10,
            }}>{showLog ? 'Hide Log' : 'Debug Log'}</button>
          </div>

          {showLog && (
            <div style={{
              marginTop: 8, background: 'rgba(0,0,0,.4)', borderRadius: 6,
              padding: '8px 10px', fontSize: 10, color: C.textDim,
              fontFamily: 'monospace', lineHeight: 1.7,
            }}>
              {smartResult.log.map((line, i) => <div key={i}>{line}</div>)}
            </div>
          )}
        </div>
      )}

      {/* ── AI Loot result ── */}
      {aiText && activeTab === 'ai' && (
        <div style={{
          background: 'rgba(104,168,208,.06)', border: `1px solid rgba(104,168,208,.3)`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 'bold', marginBottom: 10 }}>✨ Lore-Friendly Treasure</div>
          <div style={{ fontSize: 12, color: C.text, lineHeight: 1.75, whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>
            {aiText}
          </div>
          <button onClick={handleAiLoot} disabled={aiLoading} style={{
            marginTop: 10, background: 'none', border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
            color: C.textDim, fontFamily: ff, fontSize: 10,
          }}>✨ Re-generate</button>
        </div>
      )}
    </div>
  );
}
