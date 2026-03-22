import { useState, useCallback, useEffect } from 'react';
import { api } from '../api/client.js';

function readStoredUser() {
  try {
    const raw = localStorage.getItem('dnd_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function useAuth() {
  // Start null — we verify the token before trusting the stored user
  const [user,    setUser]    = useState(null);
  // loading:true while we verify; keeps the login screen from flashing
  const [loading, setLoading] = useState(!!localStorage.getItem('dnd_token'));
  const [error,   setError]   = useState(null);

  // ── Verify stored token on every mount ────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('dnd_token');
    if (!token) {
      setLoading(false);
      return;
    }
    api.me()
      .then(({ user: u }) => {
        localStorage.setItem('dnd_user', JSON.stringify(u));
        setUser(u);
      })
      .catch(() => {
        // Token invalid or expired — force login
        localStorage.removeItem('dnd_token');
        localStorage.removeItem('dnd_user');
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Listen for 401s fired by apiFetch mid-session ─────────────────
  useEffect(() => {
    const handleExpired = () => {
      setUser(null);
      setError('Session expired — please log in again.');
    };
    window.addEventListener('auth:expired', handleExpired);
    return () => window.removeEventListener('auth:expired', handleExpired);
  }, []);

  const _persist = (token, u) => {
    localStorage.setItem('dnd_token', token);
    localStorage.setItem('dnd_user',  JSON.stringify(u));
    setUser(u);
  };

  const login = useCallback(async (email, password) => {
    setLoading(true); setError(null);
    try {
      const { token, user: u } = await api.login(email, password);
      _persist(token, u);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email, password) => {
    setLoading(true); setError(null);
    try {
      const { token, user: u } = await api.register(email, password);
      _persist(token, u);
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('dnd_token');
    localStorage.removeItem('dnd_user');
    setUser(null);
    setError(null);
  }, []);

  return { user, loading, error, login, register, logout };
}
