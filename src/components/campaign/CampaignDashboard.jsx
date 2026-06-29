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
import { useState, useEffect, useCallback } from 'react';
import { api } from '../../api/client.js';
import { ApiKeySettings } from '../ui/ApiKeySettings.jsx';
import { AdminScreen } from '../admin/AdminScreen.jsx';
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

// ── DM-only: party characters — ownership + rule-breaker approvals ───────────────
// Lists every character in the campaign with its current owner. The DM can
// reassign a character to any campaign member (PUT /characters/:id/owner) and,
// for rule-breaking characters, approve/revoke the house-rule (PUT .../approval).
// Renders nothing when the campaign has no characters. DM-only (gated by caller).
function CampaignCharacters({ campaignId, currentUserId }) {
  const [chars,   setChars]   = useState(null); // null = loading
  const [members, setMembers] = useState([]);
  const [busyId,  setBusyId]  = useState(null);
  const [pickFor, setPickFor] = useState(null); // character id whose member-picker is open
  const [confirm, setConfirm] = useState(null); // { char, member } awaiting confirmation
  const [err,     setErr]     = useState(null);

  const load = useCallback(() => {
    setErr(null);
    Promise.all([
      api.getPartyView(campaignId),
      api.getCampaignMembers(campaignId).catch(() => []),
    ]).then(([cs, ms]) => {
      setChars(Array.isArray(cs) ? cs : []);
      setMembers(Array.isArray(ms) ? ms : []);
    }).catch(e => { console.error('[characters]', e); setErr('Could not load characters'); setChars([]); });
  }, [campaignId]);
  useEffect(() => { load(); }, [load]);

  const setApproval = async (id, approved) => {
    setBusyId(id); setErr(null);
    try {
      const updated = await api.approveCharacter(id, approved);
      setChars(prev => (prev ?? []).map(c => (c.id === id ? { ...c, ...updated } : c)));
    } catch (e) {
      console.error('[characters]', e);
      setErr(e.message || 'Approval failed');
    } finally { setBusyId(null); }
  };

  const doAssign = async () => {
    if (!confirm) return;
    const { char, member } = confirm;
    setBusyId(char.id); setErr(null); setConfirm(null); setPickFor(null);
    try {
      await api.assignCharacterOwner(char.id, member.id);
      await load(); // refetch so the owner column reflects the transfer
    } catch (e) {
      console.error('[characters]', e);
      setErr(e.message || 'Assignment failed');
    } finally { setBusyId(null); }
  };

  if (chars === null) return null;     // stay quiet until loaded
  if (chars.length === 0) return null; // nothing to manage
  const pendingCount = chars.filter(c => c.status === 'pending').length;

  return (
    <div style={{
      maxWidth: 1180, margin: '0 auto 22px', padding: '16px 20px',
      background: 'rgba(60,35,90,.30)', border: '1px solid rgba(160,127,208,.42)',
      borderRadius: 12, boxShadow: '0 6px 24px rgba(0,0,0,.4)',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12,
        fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', color: '#c8a8f0', fontWeight: 'bold',
      }}>
        👥 Party Characters
        {pendingCount > 0 && (
          <span style={{
            fontSize: 10, letterSpacing: .5, color: '#ff6b6b', background: 'rgba(200,50,50,.16)',
            border: '1px solid rgba(220,70,70,.5)', borderRadius: 10, padding: '2px 9px',
          }}>
            {pendingCount} pending approval
          </span>
        )}
      </div>

      {err && <div style={{ fontSize: 11, color: '#ff8888', marginBottom: 10 }}>{err}</div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {chars.map(c => {
          const violations = Array.isArray(c.character_data?.rule_violations) ? c.character_data.rule_violations : [];
          const pending  = c.status === 'pending';
          const approved = c.status === 'approved';
          const accent   = pending ? '#d65b5b' : approved ? '#82c85a' : '#8a7a55';
          const owner    = c.owner_username || c.owner_email || `user #${c.player_user_id}`;
          const assignable = members.filter(m => m.id !== c.player_user_id);
          const busy     = busyId === c.id;
          return (
            <div key={c.id} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14,
              padding: '10px 14px', borderRadius: 8,
              background: pending ? 'rgba(200,50,50,.10)' : 'rgba(0,0,0,.28)',
              border: `1px solid ${pending ? 'rgba(220,70,70,.45)' : 'rgba(255,255,255,.10)'}`,
            }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 14, color: '#e8dcc0', fontWeight: 'bold' }}>{c.name}</span>
                  {(pending || approved) && (
                    <span style={{
                      fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 'bold',
                      color: accent, border: `1px solid ${accent}`, borderRadius: 9, padding: '1px 8px',
                    }}>
                      {pending ? 'Pending' : 'Approved'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#a99', marginTop: 3, fontStyle: 'italic' }}>
                  👤 {owner}
                </div>
                {violations.length > 0 && (
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18, color: '#bfa980', fontSize: 11, lineHeight: 1.5 }}>
                    {violations.map((v, i) => <li key={i}>{v}</li>)}
                  </ul>
                )}
              </div>

              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                {pending && (
                  <button onClick={() => setApproval(c.id, true)} disabled={busy} style={{
                    fontSize: 11, fontWeight: 'bold', fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
                    padding: '6px 14px', borderRadius: 6, color: '#0f1a0a',
                    background: 'linear-gradient(135deg,#5a8a2a,#82c85a)', border: 'none', opacity: busy ? .6 : 1,
                  }}>
                    {busy ? '…' : '✓ Approve'}
                  </button>
                )}
                {approved && (
                  <button onClick={() => setApproval(c.id, false)} disabled={busy} style={{
                    fontSize: 11, fontWeight: 'bold', fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
                    padding: '6px 14px', borderRadius: 6, color: '#e0b070',
                    background: 'rgba(0,0,0,.35)', border: '1px solid rgba(200,150,80,.5)', opacity: busy ? .6 : 1,
                  }}>
                    {busy ? '…' : '↺ Revoke'}
                  </button>
                )}

                {/* Reassign owner */}
                <button onClick={() => setPickFor(pickFor === c.id ? null : c.id)} disabled={busy} style={{
                  fontSize: 11, fontFamily: 'inherit', cursor: busy ? 'default' : 'pointer',
                  padding: '6px 12px', borderRadius: 6, color: '#c8a8f0',
                  background: pickFor === c.id ? 'rgba(160,127,208,.2)' : 'rgba(0,0,0,.35)',
                  border: '1px solid rgba(160,127,208,.5)', opacity: busy ? .6 : 1,
                }}>
                  Assign to player {pickFor === c.id ? '▴' : '▾'}
                </button>

                {pickFor === c.id && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 4, padding: 6, borderRadius: 6,
                    background: 'rgba(0,0,0,.5)', border: '1px solid rgba(160,127,208,.35)', minWidth: 150,
                  }}>
                    {assignable.length === 0 && (
                      <div style={{ fontSize: 10, color: '#998', fontStyle: 'italic', padding: '3px 6px' }}>
                        No other members to assign to
                      </div>
                    )}
                    {assignable.map(m => (
                      <button key={m.id} onClick={() => setConfirm({ char: c, member: m })} style={{
                        fontSize: 11, fontFamily: 'inherit', cursor: 'pointer', textAlign: 'left',
                        padding: '5px 9px', borderRadius: 5, color: '#e8dcc0',
                        background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)',
                      }}>
                        {m.username || m.email}{m.role === 'dm' ? ' · DM' : ''}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation before transfer */}
      {confirm && (
        <div onClick={() => setConfirm(null)} style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            maxWidth: 420, margin: 20, padding: '20px 22px', borderRadius: 12,
            background: '#1a1228', border: '1px solid rgba(160,127,208,.5)', boxShadow: '0 10px 40px rgba(0,0,0,.8)',
          }}>
            <div style={{ fontSize: 15, color: '#c8a8f0', fontWeight: 'bold', marginBottom: 10 }}>Reassign character?</div>
            <div style={{ fontSize: 13, color: '#d8ccb0', lineHeight: 1.6, marginBottom: 8 }}>
              Assign <b>{confirm.char.name}</b> to <b>{confirm.member.username || confirm.member.email}</b>?
              The new owner will be able to edit this character.
            </div>
            {confirm.char.player_user_id === currentUserId && (
              <div style={{
                fontSize: 12, color: '#ffb37a', lineHeight: 1.5, marginBottom: 14,
                background: 'rgba(200,120,40,.12)', border: '1px solid rgba(200,120,40,.4)',
                borderRadius: 6, padding: '8px 11px',
              }}>
                ⚠ You currently own this character — you will lose edit access after the transfer.
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 6 }}>
              <button onClick={() => setConfirm(null)} style={{
                fontSize: 12, fontFamily: 'inherit', cursor: 'pointer', padding: '7px 16px', borderRadius: 6,
                color: '#bbb', background: 'transparent', border: '1px solid rgba(255,255,255,.2)',
              }}>Cancel</button>
              <button onClick={doAssign} style={{
                fontSize: 12, fontWeight: 'bold', fontFamily: 'inherit', cursor: 'pointer', padding: '7px 18px', borderRadius: 6,
                color: '#0f1a0a', background: 'linear-gradient(135deg,#8a6ec0,#c8a8f0)', border: 'none',
              }}>Confirm transfer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────
export function CampaignDashboard({ campaign, user, onNavigate, onOpenMaps, onBack, onLogout }) {
  const [counts,      setCounts]      = useState({});
  const [comingSoon,  setComingSoon]  = useState(null); // label of unimplemented module
  const [showApiKeys, setShowApiKeys] = useState(false);
  const [showAdmin,   setShowAdmin]   = useState(false);
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
    } else if (mod.id === 'quests') {
      onNavigate('quests');
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
          {user.is_admin && (
            <button className="cd-settings-btn" onClick={() => setShowAdmin(true)} title="User administration"
              style={{ borderColor: 'rgba(160,127,208,.5)', color: '#c8a8f0' }}>
              ⚙ Admin
            </button>
          )}
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

        {isDM && <CampaignCharacters campaignId={campaign.id} currentUserId={user.id} />}

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

      {/* ── Admin overlay (is_admin only) ── */}
      {showAdmin && user.is_admin && (
        <AdminScreen user={user} onClose={() => setShowAdmin(false)} />
      )}

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
