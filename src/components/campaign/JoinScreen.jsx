import { useState, useEffect } from 'react';
import { C } from '../../data/constants.js';
import { api } from '../../api/client.js';
import { LoginScreen } from '../auth/LoginScreen.jsx';

/**
 * JoinScreen — handles the invite link /join/<token>.
 *
 * Previews the invite (no auth needed). If the visitor isn't logged in, it shows
 * the login/register screen with an invite banner; once authenticated they can
 * accept. On accept it calls /api/auth/invite/:token/accept and hands the joined
 * campaign back to App.
 *
 * Props: token, user, onLogin, onRegister, authLoading, authError,
 *        onAccepted(campaign|null), onCancel()
 */
export function JoinScreen({ token, user, onLogin, onRegister, authLoading, authError, onAccepted, onCancel }) {
  const [preview,    setPreview]    = useState(null);  // { campaign_name, dm_name, ... }
  const [previewErr, setPreviewErr] = useState(null);
  const [accepting,  setAccepting]  = useState(false);
  const [acceptErr,  setAcceptErr]  = useState(null);

  useEffect(() => {
    let cancelled = false;
    setPreview(null); setPreviewErr(null);
    api.previewInvite(token)
      .then(p => { if (!cancelled) setPreview(p); })
      .catch(e => { if (!cancelled) setPreviewErr(e.message || 'This invite is invalid or has expired.'); });
    return () => { cancelled = true; };
  }, [token]);

  const accept = async () => {
    setAccepting(true); setAcceptErr(null);
    try {
      const res = await api.acceptInvite(token); // { message, campaign }
      onAccepted(res?.campaign ?? null);
    } catch (e) {
      setAcceptErr(e.message || 'Could not accept the invite.');
    } finally {
      setAccepting(false);
    }
  };

  const name = preview?.campaign_name;

  // ── Invalid / expired invite ──
  if (previewErr) {
    return (
      <Centered>
        <Card>
          <div style={{ fontSize: 17, color: C.red, marginBottom: 12 }}>⚠ Invite unavailable</div>
          <div style={{ fontSize: 13, color: C.textDim, lineHeight: 1.6, marginBottom: 20 }}>{previewErr}</div>
          <button onClick={onCancel} style={cancelBtn}>← Continue to RealmKeep</button>
        </Card>
      </Centered>
    );
  }

  // ── Logged out: invite banner + login/register ──
  if (!user) {
    return (
      <div>
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50,
          background: 'linear-gradient(180deg,#241a3a,#1a1330)',
          borderBottom: '1px solid rgba(160,127,208,.5)',
          padding: '12px 20px', textAlign: 'center', fontSize: 13, color: '#d8ccf0',
          fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
        }}>
          {name
            ? <>🗡 You've been invited to <b style={{ color: C.gold }}>{name}</b>{preview?.dm_name ? ` by ${preview.dm_name}` : ''} — sign in or register below to join.</>
            : 'Loading invite…'}
        </div>
        <LoginScreen onLogin={onLogin} onRegister={onRegister} loading={authLoading} error={authError} />
      </div>
    );
  }

  // ── Logged in: accept ──
  return (
    <Centered>
      <Card>
        <div style={{ fontSize: 11, letterSpacing: 6, color: C.goldDim, textTransform: 'uppercase', marginBottom: 8 }}>
          RealmKeep ✦ Invitation
        </div>
        <div style={{ fontSize: 14, color: C.text, lineHeight: 1.65, marginBottom: 6 }}>
          {name
            ? <>You've been invited to join <b style={{ color: C.gold }}>{name}</b>{preview?.dm_name ? ` by ${preview.dm_name}` : ''}.</>
            : 'Loading invite…'}
        </div>
        <div style={{ fontSize: 12, color: C.textDim, marginBottom: 18 }}>Signed in as {user.email}.</div>
        {acceptErr && (
          <div style={{ fontSize: 12, color: C.red, background: 'rgba(200,50,50,.1)',
            border: '1px solid rgba(200,50,50,.4)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            {acceptErr}
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={accept} disabled={accepting || !preview} style={{
            flex: 1, padding: '11px 0', borderRadius: 7, border: 'none',
            background: `linear-gradient(135deg,#7a5a10,${C.gold})`, color: '#1a0f00',
            fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold',
            cursor: (accepting || !preview) ? 'not-allowed' : 'pointer', opacity: (accepting || !preview) ? 0.7 : 1,
          }}>
            {accepting ? 'Joining…' : `✓ Join ${name ?? 'campaign'}`}
          </button>
          <button onClick={onCancel} style={cancelBtn}>Cancel</button>
        </div>
      </Card>
    </Centered>
  );
}

// ── layout helpers ──
function Centered({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif", padding: 20,
    }}>
      {children}
    </div>
  );
}
function Card({ children }) {
  return (
    <div style={{
      width: '100%', maxWidth: 420,
      background: 'linear-gradient(145deg,#1c1408,#140f05)',
      border: `2px solid ${C.borderHi}`, borderRadius: 12, padding: '26px 28px',
      boxShadow: '0 12px 50px rgba(0,0,0,.85)',
    }}>
      {children}
    </div>
  );
}
const cancelBtn = {
  padding: '11px 18px', borderRadius: 7, border: `1px solid ${C.border}`,
  background: 'transparent', color: C.textDim, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: 13,
};

export default JoinScreen;
