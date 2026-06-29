import { useState, useEffect, useCallback } from 'react';
import { C } from '../../data/constants.js';
import { api } from '../../api/client.js';

/**
 * AdminScreen — minimal user-management overlay. Renders only for is_admin
 * users (callers gate the entry button on user.is_admin; this also guards
 * defensively, and the server enforces requireAdmin regardless).
 *
 * Props:
 *   user      – current auth user (needs id + is_admin)
 *   onClose() – close the overlay
 */
export function AdminScreen({ user, onClose }) {
  const [users,  setUsers]  = useState(null);  // null = loading
  const [busyId, setBusyId] = useState(null);
  const [error,  setError]  = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await api.getAdminUsers();
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(e.message || 'Could not load users');
      setUsers([]);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Defensive: a non-admin should never reach this; render nothing if they do.
  if (!user?.is_admin) return null;

  // Apply an action and reconcile the row from the authoritative server response.
  const act = async (id, fn) => {
    setBusyId(id); setError(null);
    try {
      const updated = await fn();
      setUsers(prev => (prev ?? []).map(u => (u.id === id ? { ...u, ...updated } : u)));
    } catch (e) {
      setError(e.message || 'Action failed');
    } finally {
      setBusyId(null);
    }
  };
  const setApproval = (id, approved)  => act(id, () => api.setUserApproval(id, approved));
  const setSuspend  = (id, suspended) => act(id, () => api.setUserSuspend(id, suspended));

  const list    = users ?? [];
  const pending = list.filter(u => !u.ai_approved && !u.suspended);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 4000, overflowY: 'auto',
      background: C.bg, color: C.text,
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    }}>
      {/* Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 2,
        background: 'linear-gradient(180deg,#1c1408,#130f05)',
        borderBottom: `2px solid ${C.borderHi}`, padding: '16px 26px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 6, color: C.goldDim, textTransform: 'uppercase', marginBottom: 3 }}>
            RealmKeep ✦ Administration
          </div>
          <div style={{ fontSize: 20, fontWeight: 'bold', color: C.gold }}>⚙ User Management</div>
        </div>
        <button onClick={onClose} style={{
          background: 'rgba(0,0,0,.4)', border: `1px solid ${C.border}`, borderRadius: 5,
          padding: '6px 16px', cursor: 'pointer', fontFamily: 'inherit', fontSize: 12, color: C.textDim,
        }}>✕ Close</button>
      </header>

      <main style={{ maxWidth: 1000, margin: '0 auto', padding: '26px 22px' }}>
        {error && (
          <div style={{
            background: 'rgba(200,50,50,.1)', border: '1px solid rgba(200,50,50,.4)',
            borderRadius: 7, padding: '10px 16px', marginBottom: 20, fontSize: 12, color: C.red,
          }}>{error}</div>
        )}

        {users === null ? (
          <div style={{ textAlign: 'center', padding: 48, color: C.textDim }}>Loading users…</div>
        ) : (
          <>
            {/* ── Pending approval — primary "who's waiting?" view ── */}
            <section style={{
              marginBottom: 26, padding: '16px 20px', borderRadius: 12,
              background: pending.length ? 'rgba(212,160,53,.10)' : 'rgba(0,0,0,.25)',
              border: `1px solid ${pending.length ? 'rgba(212,160,53,.5)' : C.border}`,
            }}>
              <div style={{
                fontSize: 12, letterSpacing: 2.5, textTransform: 'uppercase', fontWeight: 'bold',
                color: pending.length ? C.gold : C.textDim, marginBottom: pending.length ? 12 : 0,
                display: 'flex', alignItems: 'center', gap: 10,
              }}>
                ⏳ Awaiting Approval
                <span style={{
                  fontSize: 10, color: pending.length ? '#1a0f00' : C.textDim,
                  background: pending.length ? C.gold : 'transparent',
                  border: pending.length ? 'none' : `1px solid ${C.border}`,
                  borderRadius: 10, padding: '2px 9px',
                }}>{pending.length}</span>
              </div>
              {pending.length === 0 ? (
                <span style={{ fontSize: 11, color: C.textDim, fontStyle: 'italic' }}>
                  &nbsp;— no one is waiting for approval.
                </span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {pending.map(u => (
                    <div key={u.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
                      padding: '8px 12px', borderRadius: 7,
                      background: 'rgba(0,0,0,.3)', border: `1px solid ${C.border}`,
                    }}>
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontSize: 13, color: C.text, fontWeight: 'bold' }}>{u.username}</span>
                        <span style={{ fontSize: 11, color: C.textDim, marginLeft: 8 }}>{u.email}</span>
                      </div>
                      <button onClick={() => setApproval(u.id, true)} disabled={busyId === u.id} style={approveBtn(busyId === u.id)}>
                        {busyId === u.id ? '…' : '✓ Approve'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* ── Full users table ── */}
            <div style={{ overflowX: 'auto', border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'rgba(0,0,0,.4)', color: C.goldDim }}>
                    {['User', 'Email', 'Created', 'Status', 'Actions'].map(h => (
                      <th key={h} style={{
                        textAlign: 'left', padding: '10px 12px', fontSize: 10, letterSpacing: 1.5,
                        textTransform: 'uppercase', borderBottom: `1px solid ${C.border}`, whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.map(u => {
                    const isSelf = u.id === user.id;
                    const busy   = busyId === u.id;
                    return (
                      <tr key={u.id} style={{
                        borderBottom: `1px solid rgba(255,255,255,.06)`,
                        background: u.suspended ? 'rgba(200,50,50,.06)' : 'transparent',
                      }}>
                        <td style={td}>
                          <span style={{ color: C.text, fontWeight: 'bold' }}>{u.username}</span>
                          {isSelf && <span style={{ fontSize: 9, color: C.textDim, marginLeft: 6 }}>(you)</span>}
                          {u.is_admin && (
                            <span style={{
                              fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 'bold',
                              color: '#c8a8f0', border: '1px solid rgba(160,127,208,.6)', borderRadius: 8,
                              padding: '1px 7px', marginLeft: 8,
                            }}>Admin</span>
                          )}
                        </td>
                        <td style={{ ...td, color: C.textDim }}>{u.email}</td>
                        <td style={{ ...td, color: C.textDim, whiteSpace: 'nowrap' }}>
                          {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                        </td>
                        <td style={td}>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <Pill ok={u.ai_approved} on="Approved" off="Pending" />
                            {u.suspended && (
                              <span style={{ ...pillBase, color: C.red, borderColor: 'rgba(220,70,70,.6)', background: 'rgba(200,50,50,.12)' }}>
                                Suspended
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            {/* Approve / Revoke — Revoke disabled on your own row */}
                            {u.ai_approved ? (
                              <button onClick={() => setApproval(u.id, false)}
                                disabled={busy || isSelf}
                                title={isSelf ? "You can't revoke your own approval" : undefined}
                                style={neutralBtn(busy || isSelf)}>
                                Revoke
                              </button>
                            ) : (
                              <button onClick={() => setApproval(u.id, true)} disabled={busy} style={approveBtn(busy)}>
                                Approve
                              </button>
                            )}
                            {/* Suspend / Reactivate — Suspend disabled on your own row */}
                            {u.suspended ? (
                              <button onClick={() => setSuspend(u.id, false)} disabled={busy} style={reactivateBtn(busy)}>
                                Reactivate
                              </button>
                            ) : (
                              <button onClick={() => setSuspend(u.id, true)}
                                disabled={busy || isSelf}
                                title={isSelf ? "You can't suspend yourself" : undefined}
                                style={dangerBtn(busy || isSelf)}>
                                Suspend
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

// ── Small style helpers ─────────────────────────────────────────────────────
const td = { padding: '10px 12px', verticalAlign: 'middle' };
const pillBase = {
  fontSize: 9, letterSpacing: 1, textTransform: 'uppercase', fontWeight: 'bold',
  borderRadius: 8, padding: '2px 8px', border: '1px solid',
};
function Pill({ ok, on, off }) {
  return ok
    ? <span style={{ ...pillBase, color: '#9bd86a', borderColor: 'rgba(130,200,90,.5)', background: 'rgba(110,180,70,.12)' }}>{on}</span>
    : <span style={{ ...pillBase, color: C.amber ?? '#e0a83a', borderColor: 'rgba(224,168,58,.5)', background: 'rgba(224,168,58,.12)' }}>{off}</span>;
}
const btnBase = (disabled) => ({
  fontSize: 11, fontFamily: 'inherit', fontWeight: 'bold', borderRadius: 6, padding: '5px 12px',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1,
});
const approveBtn    = (d) => ({ ...btnBase(d), color: '#0f1a0a', background: 'linear-gradient(135deg,#5a8a2a,#82c85a)', border: 'none' });
const reactivateBtn = (d) => ({ ...btnBase(d), color: '#9bd86a', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(130,200,90,.5)' });
const neutralBtn    = (d) => ({ ...btnBase(d), color: '#e0b070', background: 'rgba(0,0,0,.35)', border: '1px solid rgba(200,150,80,.5)' });
const dangerBtn     = (d) => ({ ...btnBase(d), color: '#ff8a8a', background: 'rgba(200,50,50,.12)', border: '1px solid rgba(220,70,70,.55)' });

export default AdminScreen;
