/**
 * Tiny in-memory cache for full monster details (`/api/monsters/:id`).
 *
 * Combatants in saved encounters only carry a small subset of stats (ac, thac0,
 * attacks, damage, hp). The full statblock — special_attacks, magic_resistance,
 * description, wiki_url, etc. — has to be fetched separately by monster_id.
 *
 * This module dedupes concurrent requests, so 7 Beholder-kin Overseers in one
 * encounter only trigger ONE network call.
 */

type AnyMonster = Record<string, unknown> & { id: number; name: string };

const cache = new Map<number, AnyMonster>();
const inflight = new Map<number, Promise<AnyMonster | null>>();

function getToken(): string {
  return localStorage.getItem("dnd_token") ?? "";
}

export async function fetchMonster(id: number): Promise<AnyMonster | null> {
  if (cache.has(id)) return cache.get(id)!;
  if (inflight.has(id)) return inflight.get(id)!;

  const token = getToken();
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

  const promise = fetch(`/api/monsters/${id}`, { headers })
    .then((r) => (r.ok ? r.json() : null))
    .then((m: AnyMonster | null) => {
      if (m) cache.set(id, m);
      inflight.delete(id);
      return m;
    })
    .catch((e) => {
      console.warn(`Failed to load monster ${id}:`, e);
      inflight.delete(id);
      return null;
    });

  inflight.set(id, promise);
  return promise;
}

/** Synchronous read — returns cached monster if present, otherwise null. */
export function getCachedMonster(id: number): AnyMonster | null {
  return cache.get(id) ?? null;
}

/** Wipe the cache (e.g. after a backfill that changed server-side data). */
export function clearMonsterCache(): void {
  cache.clear();
}
