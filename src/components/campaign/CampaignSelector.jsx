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

  // Delete-confirmation modal state
  const [deletePreview, setDeletePreview] = useState(null);  // { campaign, cascade, set_null, other, characters }
  const [deleteChars,   setDeleteChars]   = useState(false); // checkbox: also hard-delete chars?
  const [deleteBusy,    setDeleteBusy]    = useState(false);

  // Unassigned (orphan) characters — campaign_id IS NULL
  const [unassigned, setUnassigned] = useState([]);

  const loadCampaigns = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      setCampaigns(await api.getCampaigns());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Orphan characters use the same endpoint with campaign_id=null
  const loadUnassigned = useCallback(async () => {
    try {
      const rows = await api.getCharacters('null');
      setUnassigned(Array.isArray(rows) ? rows : []);
    } catch {
      // Non-fatal — if endpoint doesn't support null, just show nothing.
      setUnassigned([]);
    }
  }, []);

  useEffect(() => { loadCampaigns(); loadUnassigned(); }, [loadCampaigns, loadUnassigned]);

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

  async function openDeletePreview(id) {
    setError(null);
    setDeleteChars(false);
    try {
      const preview = await api.getCampaignDeletePreview(id);
      setDeletePreview(preview);
    } catch (e) {
      setError(e.message);
    }
  }

  async function confirmDelete() {
    if (!deletePreview) return;
    setDeleteBusy(true);
    try {
      await api.deleteCampaign(deletePreview.campaign.id, { deleteCharacters: deleteChars });
      setCampaigns(prev => prev.filter(c => c.id !== deletePreview.campaign.id));
      setDeletePreview(null);
      setDeleteChars(false);
      // If we kept characters, they now show up in the Unassigned section.
      loadUnassigned();
    } catch (e) {
      setError(e.message);
    } finally {
      setDeleteBusy(false);
    }
  }

  // ── Unassigned character actions ──────────────────────────────────────
  async function reassignCharacter(charId, campaignId) {
    if (!campaignId) return;
    try {
      await api.saveCharacter(charId, { campaign_id: Number(campaignId) });
      setUnassigned(prev => prev.filter(c => c.id !== charId));
      loadCampaigns(); // refresh character counts
    } catch (e) {
      setError(e.message);
    }
  }

  async function deleteUnassigned(charId, charName) {
    if (!window.confirm(`Permanently delete "${charName}"? This cannot be undone.`)) return;
    try {
      await api.deleteCharacter(charId);
      setUnassigned(prev => prev.filter(c => c.id !== charId));
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
              <button onClick={() => openDeletePreview(camp.id)} style={{
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
            </div>
          </div>
        ))}

        {/* ── Unassigned Characters ─────────────────────────────────────── */}
        {unassigned.length > 0 && (
          <section style={{
            marginTop: 32,
            background: 'linear-gradient(145deg,#1a1308,#100c04)',
            border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '18px 20px',
          }}>
            <div style={{ fontSize: 12, color: C.goldDim, letterSpacing: 2,
              textTransform: 'uppercase', marginBottom: 4 }}>
              ⚠ Unassigned Characters
            </div>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 14 }}>
              These characters aren't linked to any campaign. Reassign them or delete.
            </div>
            {unassigned.map(ch => (
              <div key={ch.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 10px', marginBottom: 6,
                background: 'rgba(0,0,0,.25)', border: `1px solid ${C.border}`,
                borderRadius: 6,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: C.text }}>{ch.name}</div>
                  <div style={{ fontSize: 10, color: C.textDim }}>
                    {ch.race ?? '—'} {ch.class ?? ''}{ch.level ? ` · L${ch.level}` : ''}
                  </div>
                </div>
                <select
                  defaultValue=""
                  onChange={e => reassignCharacter(ch.id, e.target.value)}
                  style={{
                    ...inputStyle, width: 180, padding: '6px 8px', fontSize: 11,
                  }}
                >
                  <option value="" disabled>Assign to campaign…</option>
                  {campaigns.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  onClick={() => deleteUnassigned(ch.id, ch.name)}
                  style={{
                    padding: '6px 10px', border: '1px solid rgba(200,50,50,.4)',
                    borderRadius: 6, background: 'rgba(200,50,50,.08)',
                    color: C.red, cursor: 'pointer', fontFamily: 'inherit', fontSize: 11,
                  }}
                  title="Delete character permanently"
                >
                  Delete
                </button>
              </div>
            ))}
          </section>
        )}
      </main>

      {/* ── Delete-preview modal ─────────────────────────────────────────── */}
      {deletePreview && (
        <DeletePreviewModal
          preview={deletePreview}
          deleteChars={deleteChars}
          setDeleteChars={setDeleteChars}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => { setDeletePreview(null); setDeleteChars(false); }}
        />
      )}
    </div>
  );
}

// ── Delete-preview modal ────────────────────────────────────────────────────
function DeletePreviewModal({ preview, deleteChars, setDeleteChars, busy, onConfirm, onCancel }) {
  const { campaign, cascade, set_null, characters } = preview;
  const cascadeRows = Object.entries(cascade ?? {});
  const setnullRows = Object.entries(set_null ?? {});
  const hasChars    = (characters ?? []).length > 0;

  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 20,
        background: 'rgba(0,0,0,.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          maxWidth: 560, width: '100%',
          background: 'linear-gradient(145deg,#1c1408,#100a04)',
          border: `2px solid ${C.borderHi}`, borderRadius: 12,
          padding: '22px 26px',
          fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
          color: C.text, boxShadow: '0 8px 40px rgba(0,0,0,.6)',
        }}
      >
        <div style={{ fontSize: 12, color: C.red, letterSpacing: 3,
          textTransform: 'uppercase', marginBottom: 6 }}>
          ⚠ Delete Campaign
        </div>
        <div style={{ fontSize: 18, fontWeight: 'bold', color: C.gold, marginBottom: 16 }}>
          {campaign.name}
        </div>

        {cascadeRows.length === 0 && setnullRows.length === 0 ? (
          <div style={{ fontSize: 13, color: C.textDim, marginBottom: 18 }}>
            This campaign has no associated data. Deletion will only remove the campaign record.
          </div>
        ) : (
          <>
            {cascadeRows.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: C.red, letterSpacing: 1.5,
                  textTransform: 'uppercase', marginBottom: 8 }}>
                  Will be permanently deleted:
                </div>
                <ul style={{ margin: '0 0 14px 16px', padding: 0, fontSize: 13, color: C.text }}>
                  {cascadeRows.map(([tbl, n]) => (
                    <li key={tbl} style={{ marginBottom: 3 }}>
                      <strong style={{ color: C.red }}>{n}</strong>{' '}
                      <span style={{ color: C.textDim }}>{prettyTableName(tbl)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {setnullRows.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: C.goldDim, letterSpacing: 1.5,
                  textTransform: 'uppercase', marginBottom: 8 }}>
                  Will survive (unlinked from this campaign):
                </div>
                <ul style={{ margin: '0 0 6px 16px', padding: 0, fontSize: 13, color: C.text }}>
                  {setnullRows.map(([tbl, n]) => (
                    <li key={tbl} style={{ marginBottom: 3 }}>
                      <strong style={{ color: C.gold }}>{n}</strong>{' '}
                      <span style={{ color: C.textDim }}>{prettyTableName(tbl)}</span>
                    </li>
                  ))}
                </ul>
                {hasChars && (
                  <div style={{
                    fontSize: 11, color: C.textDim, marginBottom: 14, marginLeft: 16,
                    fontStyle: 'italic',
                  }}>
                    {characters.map(c => c.name).join(', ')}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {hasChars && (
          <label style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '10px 12px', marginBottom: 14,
            background: 'rgba(200,50,50,.06)',
            border: '1px solid rgba(200,50,50,.25)',
            borderRadius: 6, cursor: 'pointer',
          }}>
            <input
              type="checkbox"
              checked={deleteChars}
              onChange={e => setDeleteChars(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span style={{ fontSize: 12, color: C.text }}>
              <strong style={{ color: C.red }}>Also delete these {characters.length} character{characters.length !== 1 ? 's' : ''}</strong>
              <br />
              <span style={{ color: C.textDim, fontSize: 11 }}>
                Leave unchecked to keep them as Unassigned Characters — you can reassign them later.
              </span>
            </span>
          </label>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onCancel}
            disabled={busy}
            style={{
              padding: '8px 18px', border: `1px solid ${C.border}`, borderRadius: 6,
              background: 'transparent', color: C.textDim,
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 12,
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            style={{
              padding: '8px 20px', border: '1px solid rgba(200,50,50,.5)', borderRadius: 6,
              background: 'rgba(200,50,50,.2)', color: C.red, fontWeight: 'bold',
              cursor: busy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', fontSize: 12,
              opacity: busy ? 0.7 : 1,
            }}
          >
            {busy ? 'Deleting…' : 'Delete campaign'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Humanize table names: "party_equipment" → "party equipment"
function prettyTableName(tbl) {
  return tbl.replace(/_/g, ' ');
}
