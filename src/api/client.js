/**
 * Thin fetch wrapper for the DnD Manager REST API.
 * In development, Vite proxies /api → localhost:3000.
 * In production, /api is served from the same Express origin.
 */

const BASE = '/api';

function getToken() {
  return localStorage.getItem('dnd_token') ?? null;
}

async function apiFetch(path, options = {}) {
  const token = getToken();
  const res = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  // 204 No Content — nothing to parse
  if (res.status === 204) return null;

  const body = await res.json().catch(() => ({ error: res.statusText }));

  if (!res.ok) {
    const err = new Error(body?.error ?? `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }

  return body;
}

export const api = {
  // ── Auth ──────────────────────────────────────────────────────────
  login:    (email, password) =>
    apiFetch('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, password) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => apiFetch('/auth/me'),

  // ── Campaigns ─────────────────────────────────────────────────────
  getCampaigns:    ()           => apiFetch('/campaigns'),
  createCampaign:  (data)       => apiFetch('/campaigns',      { method: 'POST',   body: JSON.stringify(data) }),
  updateCampaign:  (id, data)   => apiFetch(`/campaigns/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  deleteCampaign:  (id)         => apiFetch(`/campaigns/${id}`, { method: 'DELETE' }),

  // ── Characters ────────────────────────────────────────────────────
  getCharacters:   (campaignId) => apiFetch(`/characters?campaign_id=${campaignId}`),
  getCharacter:    (id)         => apiFetch(`/characters/${id}`),
  createCharacter: (data)       => apiFetch('/characters',      { method: 'POST',   body: JSON.stringify(data) }),
  saveCharacter:   (id, data)   => apiFetch(`/characters/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  deleteCharacter: (id)         => apiFetch(`/characters/${id}`, { method: 'DELETE' }),
};
