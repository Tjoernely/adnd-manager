/**
 * src/hooks/useKits.js
 * Fetches kits from /api/kits, normalizes DB shape → static kits.js shape,
 * falls back to bundle data if API is unavailable.
 */
import { useState, useEffect } from "react";
import { SP_KITS, CLASS_KITS } from "../data/kits.js";

/**
 * Normalize a DB kit row → same shape as static kits.js objects so that
 * KitsTab, useCharacter etc. can use either source interchangeably.
 *
 * proficiency_links (added to list endpoint) is an array of
 * { relation_type: 'required'|'recommended', prof_name_raw: string }.
 */
export function normalizeDbKit(k) {
  const profLinks = Array.isArray(k.proficiency_links) ? k.proficiency_links : [];
  return {
    id:             k.canonical_id,          // string — matches static kit ids
    name:           k.name,
    desc:           k.description     ?? "",
    benefits:       k.benefits_text   ?? "",
    hindrances:     k.hindrances_text ?? "",
    reqText:        k.requirements_text ?? "",
    reqAlign:       k.req_alignment   ?? null,
    reqStats:       k.req_min_stats   ?? {},  // { sub_id: minScore, ... }
    barredClasses:  k.prohibited_races ?? [],
    is_universal:   k.is_universal,
    is_racial:      k.is_racial,
    kit_class:      k.kit_class,
    kit_race:       k.kit_race,
    nwpRequired:    profLinks
      .filter(l => l.relation_type === 'required')
      .map(l => l.prof_name_raw),
    nwpRecommended: profLinks
      .filter(l => l.relation_type === 'recommended')
      .map(l => l.prof_name_raw),
  };
}

/** Flatten static SP_KITS + CLASS_KITS into a single array. */
export function staticKitsFlat() {
  const classArr = Object.values(CLASS_KITS).flat().filter(Boolean);
  return [...SP_KITS, ...classArr];
}

/**
 * Fetch all kits (no class filter) and normalize.
 * Returns { kits: normalizedArray | null } — null means use static fallback.
 * Call once at app level; kit list is global reference data.
 */
export function useKits() {
  const [kits, setKits] = useState(null); // null = use static fallback

  useEffect(() => {
    fetch("/api/kits")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setKits(data.kits.map(normalizeDbKit));
      })
      .catch(() => {
        setKits(null); // triggers static fallback in callers
      });
  }, []);

  return { kits };
}

/**
 * Fetch kits filtered by class (for display in KitsTab).
 * Returns normalized kits or falls back to static bundle on error.
 */
// App class IDs that differ from the API's CLASS_FILTER_MAP keys
const CLASS_ID_TO_API = { mage: 'wizard', specialist: 'wizard' };

export function useKitsByClass(kitClass) {
  const [kits,    setKits]    = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!kitClass) { setKits(null); return; }
    setKits(null);   // clear stale data immediately on class change
    setLoading(true);
    const apiClass = CLASS_ID_TO_API[kitClass] ?? kitClass;
    fetch(`/api/kits?class=${apiClass}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setKits(data.kits.map(normalizeDbKit));
        setLoading(false);
      })
      .catch(() => {
        // Fallback to static bundle filtered by class
        const classKits = CLASS_KITS[kitClass] ?? [];
        setKits([...SP_KITS, ...classKits]);
        setLoading(false);
      });
  }, [kitClass]);

  return { kits, loading };
}

/** Fetch a single kit by canonical_id (detailed, includes prof + weapon links). */
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
