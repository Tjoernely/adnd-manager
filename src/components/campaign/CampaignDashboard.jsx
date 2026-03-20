/**
 * CampaignDashboard — home screen shown immediately after selecting a campaign.
 * Displays all campaign modules as large clickable cards.
 *
 * Props:
 *   campaign   object  — active campaign ({ id, name, dm_user_id })
 *   user       object  — current auth user
 *   onNavigate fn(modId) — called for modules that have full pages
 *   onOpenMaps fn()    — opens the MapManager overlay
 *   onBack     fn()    — returns to campaign selector
 *   onLogout   fn()    — signs out the user
 */
import { useState, useEffect } from 'react';
import { api } from '../../api/client.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';
import './CampaignDashboard.css';

// ── Module definitions ─────────────────────────────────────────────────────────
const MODULES = [
  {
    id:    'characters',
    icon:  '🧙',
    label: 'Characters',
    desc:  "Forge and manage your party\u2019s heroes",
    color: '#c8a84b',
    unit:  'character',
    fetch: (id) => api.getCharacters(id).then(r => safeLen(r)),
  },
  {
    id:    'monsters',
    icon:  '🐉',
    label: 'Monsters & Encounters',
    desc:  'Browse the monster manual & plan encounters',
    color: '#c84444',
    unit:  'monster',
    fetch: () => api.getMonstersMeta().then(r => r.total),
  },
  {
    id:    'quests',
    icon:  '📜',
    label: 'Quests',
    desc:  'Track adventures, plot hooks and rewards',
    color: '#7ab040',
    unit:  'quest',
    fetch: (id) => api.getQuests(id).then(r => safeLen(r)),
  },
  {
    id:    'magical-items',
    icon:  '⚗️',
    label: 'Magical Items',
    desc:  'Browse items, roll random treasure',
    color: '#9060c0',
    unit:  'item',
    fetch: () => api.getMagicalItemsMeta().then(r => r.total),
  },
  {
    id:    'maps',
    icon:  '🗺️',
    label: 'Maps',
    desc:  'Dungeons, regions and world maps',
    color: '#4890c0',
    unit:  'map',
    fetch: (id) => api.getMaps(id).then(r => safeLen(r)),
  },
  {
    id:    'npcs',
    icon:  '🎭',
    label: 'NPCs',
    desc:  "Villains, allies and world inhabitants",
    color: '#a044c0',
    unit:  'NPC',
    fetch: (id) => api.getNpcs(id).then(r => safeLen(r)),
  },
  {
    id:    'spells',
    icon:  '✨',
    label: 'Spells',
    desc:  'Browse the arcane & divine spellbook',
    color: '#6070e0',
    unit:  'spell',
    fetch: () => api.getSpellsMeta().then(r => r.total),
  },
  {
    id:    'knowledge',
    icon:  '📖',
    label: 'Party Knowledge',
    desc:  'Lore, rumors and shared discoveries',
    color: '#44a080',
    unit:  'entry',
    fetch: (id) => api.getKnowledge(id).then(r => safeLen(r)),
  },
];

function safeLen(r) {
  return Array.isArray(r) ? r.length : 0;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CampaignDashboard({ campaign, user, onNavigate, onOpenMaps, onBack, onLogout }) {
  const [counts,      setCounts]      = useState({});
  const [comingSoon,  setComingSoon]  = useState(null); // label of unimplemented module
  const [showApiKeys, setShowApiKeys] = useState(false);
  const isDM = campaign.dm_user_id === user.id;

  // Load counts for all modules
  useEffect(() => {
    let cancelled = false;
    MODULES.forEach(mod => {
      mod.fetch(campaign.id)
        .then(count => {
          if (!cancelled && count !== null) {
            setCounts(prev => ({ ...prev, [mod.id]: count }));
          }
        })
        .catch(() => {}); // silently ignore count errors
    });
    return () => { cancelled = true; };
  }, [campaign.id]);

  const handleCardClick = (mod) => {
    if (mod.id === 'maps') {
      onOpenMaps();
    } else if (mod.id === 'characters') {
      onNavigate('characters');
    } else if (mod.id === 'npcs') {
      onNavigate('npcs');
    } else if (mod.id === 'spells') {
      onNavigate('spells');
    } else if (mod.id === 'magical-items') {
      onNavigate('magical-items');
    } else if (mod.id === 'monsters') {
      onNavigate('monsters');
    } else if (mod.id === 'knowledge') {
      onNavigate('party-hub');
    } else {
      // Module exists in backend but has no dedicated UI page yet
      setComingSoon(mod);
    }
  };

  return (
    <div className="cd-screen">

      {/* ── Decorative background ── */}
      <div className="cd-bg-diamonds" aria-hidden="true" />
      <div className="cd-bg-emblem"   aria-hidden="true" />

      {/* ── Header ── */}
      <header className="cd-header">
        <div className="cd-header-left">
          <button className="cd-back-btn" onClick={onBack} title="Back to campaigns">
            ‹ Campaigns
          </button>
        </div>

        <div className="cd-header-center">
          <div className="cd-edition-label">
            AD&amp;D 2nd Edition &ensp;✦&ensp; Skills &amp; Powers
          </div>
          <h1 className="cd-campaign-name">{campaign.name}</h1>
          {isDM && <span className="cd-dm-badge">⚔ Dungeon Master</span>}
        </div>

        <div className="cd-header-right">
          <span className="cd-user-chip">{user.email}</span>
          <button className="cd-settings-btn" onClick={() => setShowApiKeys(true)} title="API Key Settings">
            ⚙ Settings
          </button>
          <button className="cd-signout-btn" onClick={onLogout}>sign out</button>
        </div>
      </header>

      {/* ── Main grid ── */}
      <main className="cd-main">
        <div className="cd-section-divider" aria-hidden="true">
          <span className="cd-divider-line" />
          <span className="cd-divider-gem">◆</span>
          <span className="cd-divider-line" />
        </div>
        <p className="cd-intro">Choose a module to continue your adventure</p>

        <div className="cd-grid">
          {MODULES.map(mod => {
            const count = counts[mod.id];
            return (
              <button
                key={mod.id}
                className="cd-card"
                style={{ '--accent': mod.color }}
                onClick={() => handleCardClick(mod)}
              >
                {/* Ornate corner decorations */}
                <span className="cd-corner cd-corner--tl" aria-hidden="true" />
                <span className="cd-corner cd-corner--tr" aria-hidden="true" />
                <span className="cd-corner cd-corner--bl" aria-hidden="true" />
                <span className="cd-corner cd-corner--br" aria-hidden="true" />

                <div className="cd-card-icon">{mod.icon}</div>
                <div className="cd-card-label">{mod.label}</div>
                <div className="cd-card-desc">{mod.desc}</div>

                {count != null && mod.unit && (
                  <div className="cd-card-count">
                    {count}&ensp;{count === 1 ? mod.unit : mod.unit + 's'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </main>

      {/* ── API Key Settings ── */}
      {showApiKeys && <ApiKeySettings onClose={() => setShowApiKeys(false)} />}

      {/* ── "Coming soon" overlay ── */}
      {comingSoon && (
        <div className="cd-soon-backdrop" onClick={() => setComingSoon(null)}>
          <div className="cd-soon-box" onClick={e => e.stopPropagation()}>
            <span className="cd-corner cd-corner--tl" aria-hidden="true" />
            <span className="cd-corner cd-corner--tr" aria-hidden="true" />
            <span className="cd-corner cd-corner--bl" aria-hidden="true" />
            <span className="cd-corner cd-corner--br" aria-hidden="true" />
            <div className="cd-soon-icon">{comingSoon.icon}</div>
            <div className="cd-soon-title">{comingSoon.label}</div>
            <div className="cd-soon-msg">
              This module is forged in the backend but its UI page is still being crafted.
              <br />Stay tuned, adventurer!
            </div>
            <button className="cd-soon-close" onClick={() => setComingSoon(null)}>
              ✕&ensp;Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default CampaignDashboard;
