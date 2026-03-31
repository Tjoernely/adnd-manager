/**
 * src/hooks/useProficiencies.js
 * Fetches proficiencies from /api/proficiencies, falls back to bundle
 */
import { useState, useEffect } from "react";
import { PROFICIENCY_GROUPS } from "../data/proficiencies.js";

export function useProficiencies(kitClass = null) {
  const [profs,   setProfs]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const url = kitClass ? `/api/proficiencies?class=${kitClass}` : '/api/proficiencies';
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setProfs(data.proficiencies); setLoading(false); })
      .catch(() => {
        // Fallback to bundle data
        const all = PROFICIENCY_GROUPS.flatMap(g => g.profs);
        setProfs(all);
        setLoading(false);
      });
  }, [kitClass]);

  return { profs, loading };
}
