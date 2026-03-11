import { useState, useEffect, useCallback } from 'react';
import { C } from '../../data/constants.js';
import { api } from '../../api/client.js';

/**
 * Full-screen campaign picker.
 * Props:
 *  user              – { id, email }
 *  onSelect(campaign) – called when user picks / enters a campaign
 *  onLogout()         – called when user clicks Sign Out
 */
export function CampaignSelector({ user, onSelect, onLogout }) {
  const [campaigns,   setCampaigns]   = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState(null);
  const [creating,    setCreating]    = useState(false);
  const [newName,     setNewName]     = useState('');
  const [newDesc,     setNewDesc]     = useState('');
  const [saving,      setSaving]      = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // campaign id

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setCampaigns(await api.getCampaigns());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createCampaign(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const camp = await api.createCampaign({ name: newName.trim(), description: newDesc.trim() });
      setCampaigns(prev => [camp, ...prev]);
      setNewName(''); setNewDesc(''); setCreating(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteCampaign(id) {
    try {
      await api.deleteCampaign(id);
      setCampaigns(prev => prev.filter(c => c.id !== id));
      setDeleteConfirm(null);
    } catch (e) {
      setError(e.message);
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0d0903', border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '8px 12px', color: C.text, fontFamily: 'inherit', fontSize: 13,
    outline: 'none',
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, color: C.text,
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    }}>
      {/* Noise grain */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.028'/%3E%3C/svg%3E")`,
        backgroundSize: '300px',
      }} />

      {/* Header */}
      <header style={{
        position: 'relative', zIndex: 2,
        background: 'linear-gradient(180deg,#1c1408,#130f05)',
        borderBottom: `2px solid ${C.borderHi}`,
        padding: '18px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 6, color: C.goldDim,
            textTransform: 'uppercase', marginBottom: 3 }}>
            AD&amp;D 2nd Edition ✦ Campaign Manager
          </div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: C.gold }}>
            Choose a Campaign
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 11, color: C.textDim }}>{user.email}</span>
          <button onClick={onLogout} style={{
            background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`,
            borderRadius: 5, padding: '5px 14px', cursor: 'pointer',
            fontFamily: 'inherit', fontSize: 11, color: C.textDim,
          }}>
            Sign Out
          </button>
        </div>
      </header>

      <main style={{ position: 'relative', zIndex: 1, maxWidth: 760, margin: '0 auto', padding: '32px 22px' }}>

        {error && (
          <div style={{
            background: 'rgba(200,50,50,.1)', border: `1px solid rgba(200,50,50,.4)`,
            borderRadius: 7, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: C.red,
          }}>
            {error}
          </div>
        )}

        {/* Create campaign button / form */}
        {!creating ? (
          <button onClick={() => setCreating(true)} style={{
            width: '100%', padding: '16px', marginBottom: 20,
            background: 'rgba(212,160,53,.06)', border: `2px dashed ${C.border}`,
            borderRadius: 10, cursor: 'pointer', color: C.gold,
            fontFamily: 'inherit', fontSize: 13, letterSpacing: 0.5,
            transition: 'border-color .15s',
          }}
            onMouseEnter={e => e.target.style.borderColor = C.gold}
            onMouseLeave={e => e.target.style.borderColor = C.border}
          >
            + New Campaign
          </button>
        ) : (
          <form onSubmit={createCampaign} style={{
            background: 'linear-gradient(145deg,#1c1408,#140f05)',
            border: `2px solid ${C.borderHi}`, borderRadius: 10,
            padding: '18px 20px', marginBottom: 20,
          }}>
            <div style={{ fontSize: 12, color: C.gold, letterSpacing: 2,
              textTransform: 'uppercase', marginBottom: 14 }}>
              New Campaign
            </div>
            <input
              autoFocus required value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="Campaign name (e.g. Forgotten Realms, Greyhawk…)"
              style={{ ...inputStyle, marginBottom: 10 }}
            />
            <textarea
              value={newDesc} onChange={e => setNewDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 14 }}
            />
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="submit" disabled={saving} style={{
                padding: '8px 20px', border: 'none', borderRadius: 6,
                background: `linear-gradient(135deg,#7a5a10,${C.gold})`,
                color: '#1a0f00', fontWeight: 'bold', cursor: saving ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit', fontSize: 12, opacity: saving ? 0.7 : 1,
              }}>
                {saving ? 'Creating…' : 'Create Campaign'}
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName(''); setNewDesc(''); }}
                style={{
                  padding: '8px 16px', border: `1px solid ${C.border}`, borderRadius: 6,
                  background: 'transparent', color: C.textDim, cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 12,
                }}>
                Cancel
              </button>
            </div>
          </form>
        )}

        {/* Campaign list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: C.textDim }}>Loading…</div>
        ) : campaigns.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '48px 24px',
            color: C.textDim, fontSize: 13, fontStyle: 'italic',
          }}>
            No campaigns yet — create one above to get started.
          </div>
        ) : campaigns.map(camp => (
          <div key={camp.id} style={{
            background: 'linear-gradient(145deg,#191208,#110d04)',
            border: `1px solid ${C.border}`, borderRadius: 10,
            marginBottom: 12, padding: '16px 20px',
            display: 'flex', alignItems: 'center', gap: 16,
            transition: 'border-color .15s',
          }}
            onMouseEnter={e => e.currentTarget.style.borderColor = C.borderHi}
            onMouseLeave={e => e.currentTarget.style.borderColor = C.border}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 16, fontWeight: 'bold', color: C.gold, marginBottom: 3 }}>
                🗡️ {camp.name}
              </div>
              {camp.description && (
                <div style={{ fontSize: 12, color: C.textDim,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {camp.description}
                </div>
              )}
              <div style={{ fontSize: 10, color: '#5a4a30', marginTop: 4 }}>
                {camp.character_count ?? 0} character{camp.character_count !== 1 ? 's' : ''}
                {' · '}Created {new Date(camp.created_at).toLocaleDateString()}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => onSelect(camp)} style={{
                padding: '8px 18px', border: `1px solid ${C.borderHi}`,
                borderRadius: 6, background: 'rgba(212,160,53,.1)',
                color: C.gold, cursor: 'pointer',
                fontFamily: 'inherit', fontSize: 12, fontWeight: 'bold',
              }}>
                Enter →
              </button>
              {deleteConfirm === camp.id ? (
                <>
                  <button onClick={() => deleteCampaign(camp.id)} style={{
                    padding: '8px 12px', border: '1px solid rgba(200,50,50,.5)',
                    borderRadius: 6, background: 'rgba(200,50,50,.15)',
                    color: C.red, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  }}>
                    Confirm delete
                  </button>
                  <button onClick={() => setDeleteConfirm(null)} style={{
                    padding: '8px 10px', border: `1px solid ${C.border}`,
                    borderRadius: 6, background: 'transparent',
                    color: C.textDim, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  }}>
                    Cancel
                  </button>
                </>
              ) : (
                <button onClick={() => setDeleteConfirm(camp.id)} style={{
                  padding: '8px 10px', border: `1px solid ${C.border}`,
                  borderRadius: 6, background: 'transparent',
                  color: '#6a4a30', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                  transition: 'color .12s',
                }}
                  onMouseEnter={e => e.target.style.color = C.red}
                  onMouseLeave={e => e.target.style.color = '#6a4a30'}
                  title="Delete campaign"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
}
