import { useEffect, useState } from "react";
import { fetchMonster, getCachedMonster } from "../../rules-engine/monsters/monsterCache";
import type { MonsterLikeStats } from "./InlineStatblock";

/**
 * Hook: return the full monster record by ID, fetching once and caching globally.
 *
 * Use this when a combatant only carries a `monster_id` (and basic stats), but
 * you need the rich statblock (special_attacks, magic_resistance, description, etc.).
 */
export function useFullMonster(
  monsterId: number | null | undefined
): { monster: MonsterLikeStats | null; loading: boolean } {
  const initial = monsterId ? getCachedMonster(monsterId) : null;
  const [monster, setMonster] = useState<MonsterLikeStats | null>(
    initial as MonsterLikeStats | null
  );
  const [loading, setLoading] = useState<boolean>(!!monsterId && !initial);

  useEffect(() => {
    if (!monsterId) {
      setMonster(null);
      setLoading(false);
      return;
    }
    const cached = getCachedMonster(monsterId);
    if (cached) {
      setMonster(cached as MonsterLikeStats);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchMonster(monsterId).then((m) => {
      if (cancelled) return;
      setMonster((m as MonsterLikeStats) ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [monsterId]);

  return { monster, loading };
}
