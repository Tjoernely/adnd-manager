/**
 * Tiny API helper for the "Add to Encounter" feature.
 *
 * Wraps two endpoints:
 *   - GET  /api/saved-encounters?campaign_id=X
 *   - POST /api/saved-encounters/:id/creatures   (NEW backend endpoint)
 *   - POST /api/saved-encounters                 (for "create new" flow)
 *
 * If your project already has an api-client module (axios wrapper or similar),
 * replace these raw fetch calls with calls into that module.
 */

function getToken(): string {
  return localStorage.getItem("dnd_token") ?? "";
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

export interface SavedEncounterSummary {
  id: number;
  campaign_id: number;
  title: string;
  difficulty?: string | null;
  status?: string | null;
  current_round?: number | null;
  creatures?: Array<{ id: number; monster_name: string; current_hp: number; max_hp: number }>;
}

export interface NewCreaturePayload {
  monster_id: number;
  monster_name: string;
  max_hp: number;
  current_hp: number;
  initiative?: number;
  ac?: number | null;
  thac0?: number | null;
  attacks?: string | null;
  damage?: string | null;
  xp_value?: number | string | null;
  status?: "alive" | "dead" | "unconscious";
  notes?: string | null;
}

export async function listSavedEncounters(
  campaignId: number
): Promise<SavedEncounterSummary[]> {
  const r = await fetch(`/api/saved-encounters?campaign_id=${campaignId}`, {
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(`Failed to load encounters (${r.status})`);
  const data = await r.json();
  return Array.isArray(data) ? data : data.encounters || [];
}

export async function addCreatureToEncounter(
  encounterId: number,
  creature: NewCreaturePayload
): Promise<{ id: number } & NewCreaturePayload> {
  const r = await fetch(`/api/saved-encounters/${encounterId}/creatures`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(creature),
  });
  if (!r.ok) {
    let msg = `Failed to add creature (${r.status})`;
    try {
      const j = await r.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json();
}

export interface NewEncounterPayload {
  campaign_id: number;
  title: string;
  terrain?: string;
  difficulty?: string;
  party_level?: number;
  party_size?: number;
  total_xp?: number;
  creatures: NewCreaturePayload[];
}

export async function createEncounter(
  payload: NewEncounterPayload
): Promise<SavedEncounterSummary> {
  const r = await fetch("/api/saved-encounters", {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!r.ok) {
    let msg = `Failed to create encounter (${r.status})`;
    try {
      const j = await r.json();
      if (j.error) msg = j.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return r.json();
}

/**
 * Convert a full monster object (from /api/monsters/:id) into a creature
 * payload suitable for adding to an encounter. Uses generated_hp when present.
 */
export function monsterToCreaturePayload(
  monster: Record<string, any>
): NewCreaturePayload {
  const hp =
    Number(monster.generated_hp) ||
    Number(monster.hit_points) ||
    1;
  return {
    monster_id: Number(monster.id),
    monster_name: String(monster.name ?? "Unknown"),
    max_hp: hp,
    current_hp: hp,
    initiative: 0,
    ac: monster.armor_class ?? null,
    thac0: monster.thac0 ?? null,
    attacks: monster.attacks ?? null,
    damage: monster.damage ?? null,
    xp_value: monster.xp_value ?? 0,
    status: "alive",
  };
}
