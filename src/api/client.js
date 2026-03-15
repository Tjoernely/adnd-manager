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
  login:    (email, password, username, role) =>
    apiFetch('/auth/login',    { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email, password, username, role) =>
    apiFetch('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, username, role }) }),
  me: () => apiFetch('/auth/me'),

  // Invite flow
  createInvite:  (campaign_id, email)  =>
    apiFetch('/auth/invite', { method: 'POST', body: JSON.stringify({ campaign_id, email }) }),
  previewInvite: (token)               => apiFetch(`/auth/invite/${token}`),
  acceptInvite:  (token)               =>
    apiFetch(`/auth/invite/${token}/accept`, { method: 'POST' }),

  // ── Campaigns ─────────────────────────────────────────────────────
  getCampaigns:      ()             => apiFetch('/campaigns'),
  getCampaign:       (id)           => apiFetch(`/campaigns/${id}`),
  createCampaign:    (data)         => apiFetch('/campaigns',      { method: 'POST',   body: JSON.stringify(data) }),
  updateCampaign:    (id, data)     => apiFetch(`/campaigns/${id}`, { method: 'PUT',   body: JSON.stringify(data) }),
  deleteCampaign:    (id)           => apiFetch(`/campaigns/${id}`, { method: 'DELETE' }),
  getCampaignMembers:(id)           => apiFetch(`/campaigns/${id}/members`),
  kickMember:        (id, userId)   => apiFetch(`/campaigns/${id}/members/${userId}`, { method: 'DELETE' }),
  getCampaignInvites:(id)           => apiFetch(`/campaigns/${id}/invites`),

  // ── Characters ────────────────────────────────────────────────────
  getCharacters:    (campaignId) => apiFetch(`/characters?campaign_id=${campaignId}`),
  getPartyView:     (campaignId) => apiFetch(`/characters/party/${campaignId}`),
  getCharacter:     (id)         => apiFetch(`/characters/${id}`),
  createCharacter:  (data)       => apiFetch('/characters',       { method: 'POST',   body: JSON.stringify(data) }),
  saveCharacter:    (id, data)   => apiFetch(`/characters/${id}`,  { method: 'PUT',   body: JSON.stringify(data) }),
  deleteCharacter:  (id)         => apiFetch(`/characters/${id}`,  { method: 'DELETE' }),

  // ── NPCs ──────────────────────────────────────────────────────────
  getNpcs:     (campaignId)  => apiFetch(`/npcs?campaign_id=${campaignId}`),
  getNpc:      (id)          => apiFetch(`/npcs/${id}`),
  createNpc:   (data)        => apiFetch('/npcs',        { method: 'POST',   body: JSON.stringify(data) }),
  updateNpc:   (id, data)    => apiFetch(`/npcs/${id}`,   { method: 'PUT',   body: JSON.stringify(data) }),
  revealNpc:   (id)          => apiFetch(`/npcs/${id}/reveal`, { method: 'PUT' }),
  hideNpc:     (id)          => apiFetch(`/npcs/${id}/hide`,   { method: 'PUT' }),
  deleteNpc:   (id)          => apiFetch(`/npcs/${id}`,   { method: 'DELETE' }),

  // ── Spells ────────────────────────────────────────────────────────
  // params: { q/search, group, level, minLevel, maxLevel, school,
  //           sphere, source, reversible, sort, limit, offset }
  searchSpells: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/spells${qs ? `?${qs}` : ''}`);
  },
  randomSpell:  (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/spells/random${qs ? `?${qs}` : ''}`);
  },
  // params: same as randomSpell + count (1-20)
  randomSpellBatch: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/spells/random/batch${qs ? `?${qs}` : ''}`);
  },
  getSpell:       (id) => apiFetch(`/spells/${id}`),
  // Returns { total, wizard, priest, schools, spheres, levels }
  getSpellsMeta:  ()   => apiFetch('/spells/meta'),

  // ── Quests ────────────────────────────────────────────────────────
  getQuests:    (campaignId) => apiFetch(`/quests?campaign_id=${campaignId}`),
  getQuest:     (id)         => apiFetch(`/quests/${id}`),
  createQuest:  (data)       => apiFetch('/quests',       { method: 'POST',   body: JSON.stringify(data) }),
  updateQuest:  (id, data)   => apiFetch(`/quests/${id}`,  { method: 'PUT',   body: JSON.stringify(data) }),
  deleteQuest:  (id)         => apiFetch(`/quests/${id}`,  { method: 'DELETE' }),

  // ── Encounters ────────────────────────────────────────────────────
  getEncounters:   (campaignId) => apiFetch(`/encounters?campaign_id=${campaignId}`),
  getEncounter:    (id)         => apiFetch(`/encounters/${id}`),
  createEncounter: (data)       => apiFetch('/encounters',        { method: 'POST',   body: JSON.stringify(data) }),
  updateEncounter: (id, data)   => apiFetch(`/encounters/${id}`,   { method: 'PUT',   body: JSON.stringify(data) }),
  deleteEncounter: (id)         => apiFetch(`/encounters/${id}`,   { method: 'DELETE' }),

  // ── Loot ──────────────────────────────────────────────────────────
  getLootList:  (campaignId) => apiFetch(`/loot?campaign_id=${campaignId}`),
  getLoot:      (id)         => apiFetch(`/loot/${id}`),
  createLoot:   (data)       => apiFetch('/loot',        { method: 'POST',   body: JSON.stringify(data) }),
  updateLoot:   (id, data)   => apiFetch(`/loot/${id}`,   { method: 'PUT',   body: JSON.stringify(data) }),
  deleteLoot:   (id)         => apiFetch(`/loot/${id}`,   { method: 'DELETE' }),

  // ── Magical Items ─────────────────────────────────────────────────
  // params: { search/q, category, rarity, table_letter, cursed, sort, limit, offset }
  searchMagicalItems: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/magical-items${qs ? `?${qs}` : ''}`);
  },
  getMagicalItemsMeta:  ()         => apiFetch('/magical-items/meta'),
  getMagicalItem:       (id)       => apiFetch(`/magical-items/${id}`),
  // params: { category, table_letter, cursed, count }
  randomMagicalItems:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/magical-items/random${qs ? `?${qs}` : ''}`);
  },
  // Roll on a specific table: table = 'A'–'T'
  rollMagicalTable:     (table)    => apiFetch(`/magical-items/roll-table?table=${table}`),
  // All entries for a table (for display in ItemDetail)
  getTableEntries:      (table, limit = 200) => apiFetch(`/magical-items/table-entries?table=${table}&limit=${limit}`),
  // params: { level, type }
  randomMagicalHoard:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/magical-items/random-hoard${qs ? `?${qs}` : ''}`);
  },

  // ── Maps ──────────────────────────────────────────────────────────
  getMaps:     (campaignId) => apiFetch(`/maps?campaign_id=${campaignId}`),
  getMap:      (id)         => apiFetch(`/maps/${id}`),
  createMap:   (data)       => apiFetch('/maps',        { method: 'POST',   body: JSON.stringify(data) }),
  updateMap:   (id, data)   => apiFetch(`/maps/${id}`,   { method: 'PUT',   body: JSON.stringify(data) }),
  deleteMap:   (id)         => apiFetch(`/maps/${id}`,   { method: 'DELETE' }),

  /**
   * Upload / replace the image for an existing map.
   * `file` is a File / Blob from an <input type="file">.
   * Uses multipart/form-data — do NOT set Content-Type manually.
   */
  uploadMapImage: (id, file) => {
    const fd = new FormData();
    fd.append('image', file);
    const token = getToken();
    return fetch(`${BASE}/maps/${id}/image`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: fd,
    }).then(async res => {
      if (res.status === 204) return null;
      const body = await res.json().catch(() => ({ error: res.statusText }));
      if (!res.ok) {
        const err = new Error(body?.error ?? `HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return body;
    });
  },

  // ── AI Generation ─────────────────────────────────────────────────
  // type: "npc" | "quest" | "encounter" | "rumors"
  // context: free-form hints (race, setting, partyLevel, etc.)
  generateContent: (type, campaignId, context = {}) =>
    apiFetch('/ai/generate', {
      method: 'POST',
      body: JSON.stringify({ type, campaign_id: campaignId, context }),
    }),

  // ── Party Knowledge ───────────────────────────────────────────────
  // visible_to: string[] — user IDs or ["all"]
  getKnowledge:    (campaignId)      => apiFetch(`/party-knowledge?campaign_id=${campaignId}`),
  getKnowledgeEntry:(id)             => apiFetch(`/party-knowledge/${id}`),
  createKnowledge: (data)            => apiFetch('/party-knowledge',       { method: 'POST',   body: JSON.stringify(data) }),
  updateKnowledge: (id, data)        => apiFetch(`/party-knowledge/${id}`,  { method: 'PUT',   body: JSON.stringify(data) }),
  deleteKnowledge: (id)              => apiFetch(`/party-knowledge/${id}`,  { method: 'DELETE' }),
};
