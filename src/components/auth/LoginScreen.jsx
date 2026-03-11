import { useState } from 'react';
import { C } from '../../data/constants.js';

export function LoginScreen({ onLogin, onRegister, loading, error }) {
  const [mode,     setMode]     = useState('login'); // 'login' | 'register'
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [localErr, setLocalErr] = useState(null);

  const displayErr = localErr || error;

  async function submit(e) {
    e.preventDefault();
    setLocalErr(null);

    if (mode === 'register') {
      if (password !== confirm) { setLocalErr('Passwords do not match'); return; }
      if (password.length < 6)  { setLocalErr('Password must be at least 6 characters'); return; }
      await onRegister(email.trim(), password);
    } else {
      await onLogin(email.trim(), password);
    }
  }

  const inputStyle = {
    width: '100%', boxSizing: 'border-box',
    background: '#0d0903', border: `1px solid ${C.border}`, borderRadius: 6,
    padding: '10px 14px', color: C.text, fontFamily: 'inherit', fontSize: 14,
    outline: 'none', marginBottom: 14, transition: 'border-color .15s',
  };
  const btnStyle = {
    width: '100%', padding: '11px 0', borderRadius: 7, border: 'none',
    background: `linear-gradient(135deg, #7a5a10, ${C.gold})`,
    color: '#1a0f00', fontFamily: 'inherit', fontSize: 14, fontWeight: 'bold',
    cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
    letterSpacing: 0.5, transition: 'opacity .15s',
  };

  return (
    <div style={{
      minHeight: '100vh', background: C.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Palatino Linotype','Book Antiqua',Palatino,Georgia,serif",
    }}>
      {/* Noise grain */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none',
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='.028'/%3E%3C/svg%3E")`,
        backgroundSize: '300px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1,
        width: '100%', maxWidth: 400, padding: '0 20px',
      }}>
        {/* Logo / title */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ fontSize: 36, marginBottom: 6 }}>⚔️</div>
          <div style={{ fontSize: 11, letterSpacing: 6, color: C.goldDim,
            textTransform: 'uppercase', marginBottom: 6 }}>
            AD&amp;D 2nd Edition
          </div>
          <div style={{ fontSize: 22, fontWeight: 'bold', color: C.gold }}>
            Campaign Manager
          </div>
        </div>

        {/* Card */}
        <div style={{
          background: 'linear-gradient(145deg,#1c1408,#140f05)',
          border: `2px solid ${C.borderHi}`, borderRadius: 12,
          padding: '28px 28px 24px',
          boxShadow: '0 12px 50px rgba(0,0,0,.85)',
        }}>
          {/* Mode toggle */}
          <div style={{ display: 'flex', marginBottom: 22,
            background: 'rgba(0,0,0,.4)', borderRadius: 7, padding: 3 }}>
            {['login', 'register'].map(m => (
              <button key={m} onClick={() => { setMode(m); setLocalErr(null); }}
                style={{
                  flex: 1, padding: '7px 0', borderRadius: 5,
                  background: mode === m ? 'rgba(212,160,53,.2)' : 'transparent',
                  color: mode === m ? C.gold : C.textDim,
                  cursor: 'pointer', fontFamily: 'inherit', fontSize: 12,
                  letterSpacing: 1, textTransform: 'uppercase',
                  border: mode === m ? `1px solid ${C.border}` : '1px solid transparent',
                  transition: 'all .15s',
                }}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <form onSubmit={submit}>
            <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim,
              textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Email
            </label>
            <input
              type="email" required value={email} autoComplete="email"
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              onFocus={e  => e.target.style.borderColor = C.gold}
              onBlur={e   => e.target.style.borderColor = C.border}
            />

            <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim,
              textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
              Password
            </label>
            <input
              type="password" required value={password} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              onFocus={e => e.target.style.borderColor = C.gold}
              onBlur={e  => e.target.style.borderColor = C.border}
            />

            {mode === 'register' && (
              <>
                <label style={{ fontSize: 10, letterSpacing: 2, color: C.textDim,
                  textTransform: 'uppercase', display: 'block', marginBottom: 5 }}>
                  Confirm Password
                </label>
                <input
                  type="password" required value={confirm} autoComplete="new-password"
                  onChange={e => setConfirm(e.target.value)}
                  style={inputStyle}
                  onFocus={e => e.target.style.borderColor = C.gold}
                  onBlur={e  => e.target.style.borderColor = C.border}
                />
              </>
            )}

            {displayErr && (
              <div style={{
                background: 'rgba(200,50,50,.12)', border: `1px solid rgba(200,50,50,.4)`,
                borderRadius: 6, padding: '8px 12px', marginBottom: 14,
                fontSize: 12, color: C.red,
              }}>
                {displayErr}
              </div>
            )}

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? '…' : mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>
        </div>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: 10,
          color: C.textDim, letterSpacing: 1 }}>
          Your characters are stored in the cloud and available anywhere.
        </div>
      </div>
    </div>
  );
}
