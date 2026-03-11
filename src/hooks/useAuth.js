import { useState, useCallback } from 'react';
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
  const [user,    setUser]    = useState(readStoredUser);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);

  const _persist = (token, user) => {
    localStorage.setItem('dnd_token', token);
    localStorage.setItem('dnd_user',  JSON.stringify(user));
    setUser(user);
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
  }, []);

  return { user, loading, error, login, register, logout };
}
