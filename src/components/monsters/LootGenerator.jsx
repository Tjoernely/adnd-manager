/**
 * LootGenerator.jsx
 * Roll official AD&D 2E treasure by type, or generate AI lore-friendly loot.
 * Used in MonsterDetail and EncounterBuilder.
 */
import { useState } from 'react';
import { api } from '../../api/client.js';
import { C } from '../../data/constants.js';

// ── Dice helpers ──────────────────────────────────────────────────────────────

function d(sides) { return Math.floor(Math.random() * sides) + 1; }
function dN(n, sides) { let s = 0; for (let i = 0; i < n; i++) s += d(sides); return s; }
function pct(chance) { return Math.random() * 100 < chance; }

// ── Treasure tables (AD&D 2E) ─────────────────────────────────────────────────
// Each entry: { chance%, coins:[{type,n,sides,mult}], gems, jewelry, magic }

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

  // Coins
  for (const coin of (table.coins ?? [])) {
    if (pct(coin.p)) {
      const amount = dN(coin.n, coin.s) * coin.m;
      lines.push(`💰 ${amount.toLocaleString()} ${coin.t.toUpperCase()}`);
    }
  }

  // Gems
  if (table.gems && pct(table.gems.p)) {
    const count = dN(1, table.gems.s);
    lines.push(`💎 ${count} gem${count !== 1 ? 's' : ''}`);
  }

  // Jewelry
  if (table.jewelry && pct(table.jewelry.p)) {
    const count = dN(1, table.jewelry.s);
    lines.push(`📿 ${count} piece${count !== 1 ? 's' : ''} of jewelry`);
  }

  // Magic items
  if (table.magic && pct(table.magic.p)) {
    const count = table.magic.c ?? 1;
    const restr = table.magic.r !== 'any' ? ` (${table.magic.r})` : '';
    try {
      const data = await api.randomMagicalItems({ count });
      const items = Array.isArray(data) ? data : (data?.items ?? []);
      if (items.length) {
        items.forEach(item => lines.push(`✨ ${item.name ?? 'Magic Item'}`));
      } else {
        lines.push(`✨ ${count} magic item${count !== 1 ? 's' : ''}${restr}`);
      }
    } catch {
      lines.push(`✨ ${count} magic item${count !== 1 ? 's' : ''}${restr}`);
    }
    if (table.magic.bonus) {
      lines.push(`📜 Bonus: ${table.magic.bonus}`);
    }
  }

  return lines.length ? lines : ['(No treasure rolled — try again)'];
}

// ── Difficulty tier-up ────────────────────────────────────────────────────────
// Hard / Deadly → bump treasure type one tier up
const TIER_UP = { A:'B', B:'C', C:'D', D:'E', E:'F', F:'G', G:'H' };

// Map monster frequency words → closest AD&D treasure table letter
const FREQ_TABLE = {
  common:    'C',
  uncommon:  'D',
  rare:      'F',
  very:      'G',   // "Very Rare" — first word
  unique:    'H',
  legendary: 'H',
};

// Level-based fallback when no treasure type at all
function levelTable(level) {
  if (level <= 3)  return 'C';
  if (level <= 6)  return 'D';
  if (level <= 9)  return 'F';
  if (level <= 12) return 'G';
  return 'H';
}

function effectiveTable(treasureType, difficulty, partyLevel = 5) {
  // 1. Try explicit treasure column (single letter A-O)
  let t = (treasureType ?? '').trim().toUpperCase().charAt(0);
  if (!T[t]) {
    // 2. Try mapping frequency word to a table
    const word = (treasureType ?? '').trim().toLowerCase().split(/\s+/)[0];
    t = FREQ_TABLE[word] ?? '';
  }
  // 3. Level fallback
  if (!T[t]) t = levelTable(partyLevel);
  if (['Hard','Deadly'].includes(difficulty)) t = TIER_UP[t] ?? t;
  return t;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LootGenerator({ monster, groups, terrain = 'dungeon', difficulty = 'Medium', partyLevel = 5 }) {
  const [lootLines, setLootLines]   = useState(null);
  const [aiText,    setAiText]      = useState(null);
  const [rolling,   setRolling]     = useState(false);
  const [aiLoading, setAiLoading]   = useState(false);
  const [aiError,   setAiError]     = useState(null);
  const [activeTab, setActiveTab]   = useState('official');

  const ff = "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif";

  // Official treasure roll
  async function handleRollOfficial() {
    setRolling(true);
    setLootLines(null);
    try {
      // Determine treasure type from monster or first group monster
      const treasureSource = monster ?? groups?.[0]?.monster;
      const rawType = treasureSource?.treasure ?? treasureSource?.frequency ?? null;
      const tType = effectiveTable(rawType, difficulty, partyLevel);
      const lines = await rollTable(tType);
      setLootLines(lines ?? ['(Nothing of value was found)']);
      setActiveTab('official');
    } finally {
      setRolling(false);
    }
  }

  // AI loot
  async function handleAiLoot() {
    setAiLoading(true);
    setAiError(null);
    setAiText(null);
    try {
      const monsterList = groups
        ? groups.map(g => ({ name: g.monster?.name ?? 'Monster', count: g.count }))
        : monster ? [{ name: monster.name, count: 1 }] : [];

      const data = await api.generateAiLoot({
        monsters:    monsterList,
        terrain,
        difficulty,
        party_level: partyLevel,
      });
      setAiText(data.text ?? '(No response)');
      setActiveTab('ai');
    } catch (e) {
      setAiError(e.message ?? 'AI generation failed');
    } finally {
      setAiLoading(false);
    }
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
    borderRadius: 5, padding: '7px 16px', cursor: 'pointer',
    fontFamily: ff, fontSize: 11, border: 'none', fontWeight: 'bold',
  };

  return (
    <div style={{ marginTop: 14 }}>
      {sectionHdr()}

      {/* Buttons */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
        <button
          onClick={handleRollOfficial}
          disabled={rolling}
          style={{
            ...btnBase,
            background: rolling ? 'rgba(0,0,0,.3)' : 'rgba(212,160,53,.2)',
            border: `1px solid ${C.borderHi}`,
            color: rolling ? C.textDim : C.gold,
          }}
        >
          {rolling ? '⏳ Rolling…' : '🎲 Official Loot (by Treasure Type)'}
        </button>

        <button
          onClick={handleAiLoot}
          disabled={aiLoading}
          style={{
            ...btnBase,
            background: aiLoading ? 'rgba(0,0,0,.3)' : 'rgba(104,168,208,.15)',
            border: `1px solid rgba(104,168,208,.4)`,
            color: aiLoading ? C.textDim : C.blue,
          }}
        >
          {aiLoading ? '⏳ Consulting Oracle…' : '✨ AI Loot (Lore-Friendly)'}
        </button>
      </div>

      {/* AI error */}
      {aiError && (
        <div style={{
          fontSize: 11, color: '#e08080', background: 'rgba(200,50,50,.1)',
          border: `1px solid rgba(200,50,50,.3)`, borderRadius: 6,
          padding: '8px 12px', marginBottom: 10,
        }}>
          ⚠ {aiError}
        </div>
      )}

      {/* Official loot result */}
      {lootLines && activeTab === 'official' && (
        <div style={{
          background: 'rgba(212,160,53,.06)', border: `1px solid ${C.borderHi}`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: C.gold, fontWeight: 'bold', marginBottom: 8, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span>💰 Treasure Found</span>
            <span style={{ fontSize: 9, color: C.textDim, fontWeight: 'normal' }}>
              {difficulty} difficulty · Table: {(() => {
                const src = monster ?? groups?.[0]?.monster;
                return effectiveTable(src?.treasure ?? src?.frequency ?? null, difficulty, partyLevel);
              })()}
            </span>
          </div>
          {lootLines.map((line, i) => (
            <div key={i} style={{ fontSize: 12, color: C.text, marginBottom: 4, lineHeight: 1.6 }}>
              {line}
            </div>
          ))}
          <button
            onClick={handleRollOfficial}
            disabled={rolling}
            style={{
              marginTop: 10, background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
              color: C.textDim, fontFamily: ff, fontSize: 10,
            }}
          >
            🎲 Re-roll
          </button>
        </div>
      )}

      {/* AI loot result */}
      {aiText && activeTab === 'ai' && (
        <div style={{
          background: 'rgba(104,168,208,.06)', border: `1px solid rgba(104,168,208,.3)`,
          borderRadius: 8, padding: '14px 16px',
        }}>
          <div style={{ fontSize: 11, color: C.blue, fontWeight: 'bold', marginBottom: 10 }}>
            ✨ Lore-Friendly Treasure
          </div>
          <div style={{
            fontSize: 12, color: C.text, lineHeight: 1.75, whiteSpace: 'pre-wrap',
            fontStyle: 'italic',
          }}>
            {aiText}
          </div>
          <button
            onClick={handleAiLoot}
            disabled={aiLoading}
            style={{
              marginTop: 10, background: 'none', border: `1px solid ${C.border}`,
              borderRadius: 5, padding: '3px 12px', cursor: 'pointer',
              color: C.textDim, fontFamily: ff, fontSize: 10,
            }}
          >
            ✨ Re-generate
          </button>
        </div>
      )}
    </div>
  );
}
