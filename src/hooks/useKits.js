/**
 * src/hooks/useKits.js
 * Fetches kits from /api/kits, falls back to bundle data
 */
import { useState, useEffect } from "react";
import { SP_KITS, CLASS_KITS } from "../data/kits.js";

export function useKits(kitClass = null) {
  const [kits,       setKits]     = useState(null);
  const [loading,    setLoading]  = useState(false);
  const [error,      setError]    = useState(null);

  useEffect(() => {
    setLoading(true);
    const url = kitClass ? `/api/kits?class=${kitClass}` : '/api/kits';
    fetch(url)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => { setKits(data.kits); setLoading(false); })
      .catch(e  => {
        // Fallback to bundle data
        const classKits = kitClass ? (CLASS_KITS[kitClass] ?? []) : [];
        const allKits   = [...SP_KITS, ...classKits];
        setKits(allKits);
        setError(e);
        setLoading(false);
      });
  }, [kitClass]);

  return { kits, loading, error };
}

export function useKit(canonicalId) {
  const [kit,     setKit]     = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!canonicalId) return;
    setLoading(true);
    fetch(`/api/kits/${canonicalId}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setKit(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [canonicalId]);

  return { kit, loading };
}
