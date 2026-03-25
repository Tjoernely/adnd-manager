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
    // 401 — clear stored credentials and notify useAuth to update React state
    if (res.status === 401) {
      localStorage.removeItem('dnd_token');
      localStorage.removeItem('dnd_user');
      window.dispatchEvent(new Event('auth:expired'));
    }
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
  // All entries for a table. opts: { subtable: '1'|'2'|'3', limit }
  getTableEntries: (table, opts = {}) => {
    const p = new URLSearchParams({ table });
    if (opts.subtable != null) p.set('subtable', opts.subtable);
    if (opts.limit    != null) p.set('limit',    opts.limit);
    return apiFetch(`/magical-items/table-entries?${p}`);
  },
  // params: { level, type }
  randomMagicalHoard:   (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/magical-items/random-hoard${qs ? `?${qs}` : ''}`);
  },

  // ── Monsters ──────────────────────────────────────────────────────
  // params: { search, type, size, alignment, habitat, campaign_id, hd_min, hd_max, limit, page }
  searchMonsters: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/monsters${qs ? `?${qs}` : ''}`);
  },
  getMonstersMeta:   ()          => apiFetch('/monsters/meta'),
  getMonster:        (id)        => apiFetch(`/monsters/${id}`),
  createMonster:     (data)      => apiFetch('/monsters',       { method: 'POST',   body: JSON.stringify(data) }),
  updateMonster:     (id, data)  => apiFetch(`/monsters/${id}`,  { method: 'PUT',   body: JSON.stringify(data) }),
  deleteMonster:     (id)        => apiFetch(`/monsters/${id}`,  { method: 'DELETE' }),

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

  // ── Party Hub ─────────────────────────────────────────────────────
  getPartyHub: (campaignId) => apiFetch(`/party-hub?campaign_id=${campaignId}`),

  // ── Party Inventory ───────────────────────────────────────────────
  getPartyInventory:   (campaignId) => apiFetch(`/party-inventory?campaign_id=${campaignId}`),
  createInventoryItem: (data)       => apiFetch('/party-inventory',        { method: 'POST',   body: JSON.stringify(data) }),
  updateInventoryItem: (id, data)   => apiFetch(`/party-inventory/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
  deleteInventoryItem: (id)         => apiFetch(`/party-inventory/${id}`,   { method: 'DELETE' }),

  // ── Saved Encounters (fight-tracked) ──────────────────────────────
  getSavedEncounters:   async (campaignId) => {
    const data = await apiFetch(`/saved-encounters?campaign_id=${campaignId}`);
    return Array.isArray(data) ? data : (data?.encounters ?? []);
  },
  createSavedEncounter: (data)       => apiFetch('/saved-encounters', { method: 'POST', body: JSON.stringify(data) }),
  updateSavedEncounter: (id, data)   => apiFetch(`/saved-encounters/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSavedEncounter: (id)         => apiFetch(`/saved-encounters/${id}`, { method: 'DELETE' }),
  getEncounterCreatures:(encId)      => apiFetch(`/saved-encounters/${encId}/creatures`),
  updateCreatureHp:     (encId, cId, current_hp) =>
    apiFetch(`/saved-encounters/${encId}/creatures/${cId}`, { method: 'PUT', body: JSON.stringify({ current_hp }) }),
  updateCreature: (encId, cId, data) =>
    apiFetch(`/saved-encounters/${encId}/creatures/${cId}`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── AI Loot ───────────────────────────────────────────────────────
  generateAiLoot: (data) => apiFetch('/ai/loot', { method: 'POST', body: JSON.stringify(data) }),

  // ── Party Equipment (campaign-level pool) ────────────────────────────────────
  getPartyEquipment:    (campaignId)       => apiFetch(`/party-equipment?campaign_id=${campaignId}`),
  createPartyEquipment: (data)             => apiFetch('/party-equipment',        { method: 'POST',   body: JSON.stringify(data) }),
  updatePartyEquipment: (id, data)         => apiFetch(`/party-equipment/${id}`,   { method: 'PUT',    body: JSON.stringify(data) }),
  deletePartyEquipment: (id)               => apiFetch(`/party-equipment/${id}`,   { method: 'DELETE' }),
  assignPartyEquipment: (id, character_id) => apiFetch(`/party-equipment/${id}/assign`, { method: 'POST', body: JSON.stringify({ character_id }) }),

  // ── Character Equipment ───────────────────────────────────────────────────────
  getCharacterEquipment:    (characterId)  => apiFetch(`/character-equipment?character_id=${characterId}`),
  createCharacterEquipment: (data)         => apiFetch('/character-equipment',       { method: 'POST',   body: JSON.stringify(data) }),
  updateCharacterEquipment: (id, data)     => apiFetch(`/character-equipment/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
  deleteCharacterEquipment: (id)           => apiFetch(`/character-equipment/${id}`, { method: 'DELETE' }),
  equipCharacterItem:       (id, data)     => apiFetch(`/character-equipment/${id}/equip`, { method: 'PUT', body: JSON.stringify(data) }),

  // ── Character Spells ──────────────────────────────────────────────────────────
  getCharacterSpells:    (characterId)     => apiFetch(`/character-spells?character_id=${characterId}`),
  createCharacterSpell:  (data)            => apiFetch('/character-spells',       { method: 'POST',   body: JSON.stringify(data) }),
  updateCharacterSpell:  (id, data)        => apiFetch(`/character-spells/${id}`, { method: 'PUT',    body: JSON.stringify(data) }),
  deleteCharacterSpell:  (id)              => apiFetch(`/character-spells/${id}`, { method: 'DELETE' }),

  // ── Catalog (reference data, no auth) ────────────────────────────────────────
  getWeaponsCatalog: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/weapons-catalog${qs ? `?${qs}` : ''}`);
  },
  getArmorCatalog: (params = {}) => {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== ''))
    ).toString();
    return apiFetch(`/armor-catalog${qs ? `?${qs}` : ''}`);
  },
  // Ammo catalog — optionally filtered by equipped ranged weapon name
  getCompatibleAmmo: (rangedWeaponName) => {
    const qs = rangedWeaponName
      ? `?ranged_weapon_name=${encodeURIComponent(rangedWeaponName)}`
      : '';
    return apiFetch(`/weapons-catalog/ammo${qs}`);
  },

  // ── Visibility toggles (DM only) ──────────────────────────────────
  setQuestVisibility:     (id, v) => apiFetch(`/quests/${id}`,          { method: 'PUT', body: JSON.stringify({ visibility: v }) }),
  setEncounterVisibility: (id, v) => apiFetch(`/encounters/${id}`,      { method: 'PUT', body: JSON.stringify({ visibility: v }) }),
  setCharacterVisibility: (id, v) => apiFetch(`/characters/${id}`,      { method: 'PUT', body: JSON.stringify({ visibility: v }) }),
  setCharacterDmNotes:    (id, n) => apiFetch(`/characters/${id}`,      { method: 'PUT', body: JSON.stringify({ dm_notes: n }) }),
  setKnowledgeVisibility: (id, vt)=> apiFetch(`/party-knowledge/${id}`, { method: 'PUT', body: JSON.stringify({ visible_to: vt }) }),
};
