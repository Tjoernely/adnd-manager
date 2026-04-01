/**
 * src/hooks/useProficiencies.js
 * Fetches all nonweapon proficiencies from /api/proficiencies.
 * Returns DB data normalized to component shape, or null on failure
 * (caller falls back to static bundle data).
 */
import { useState, useEffect } from "react";

// Convert a DB proficiency row → component-compatible shape
function normalizeDbProf(p) {
  const stats = [p.sp_stat_1, p.sp_stat_2].filter(Boolean);
  return {
    id:        p.canonical_id,
    name:      p.name,
    cp:        p.sp_cp_cost  ?? 2,
    rank:      p.sp_rank     ?? 7,
    stats:     stats.length  ? stats : ["knowledge"],
    desc:      p.description ?? "",
    profGroup: p.prof_group,
    source:    p.source_book ?? "",
    aliases:   Array.isArray(p.aliases) ? p.aliases : [],
  };
}

const GROUP_ORDER = [
  "general","warrior","priest","rogue","wizard",
  "psionicist","chronomancer","avariel","other",
];
const GROUP_META = {
  general:     { label:"General",     sub:"Available to all classes at listed cost" },
  warrior:     { label:"Warrior",     sub:"Warriors pay listed cost; others pay +2 CP" },
  priest:      { label:"Priest",      sub:"Priests pay listed cost; others pay +2 CP" },
  rogue:       { label:"Rogue",       sub:"Rogues pay listed cost; others pay +2 CP" },
  wizard:      { label:"Wizard",      sub:"Wizards pay listed cost; others pay +2 CP" },
  psionicist:  { label:"Psionicist",  sub:"Psionicist proficiencies" },
  chronomancer:{ label:"Chronomancer",sub:"Chronomancer proficiencies" },
  avariel:     { label:"Avariel",     sub:"Avariel proficiencies" },
  other:       { label:"Other",       sub:"Other proficiencies" },
};

export function buildProfGroups(flatProfs) {
  const byGroup = {};
  for (const p of flatProfs) {
    if (!byGroup[p.profGroup]) byGroup[p.profGroup] = [];
    byGroup[p.profGroup].push(p);
  }
  const result = [];
  for (const tag of GROUP_ORDER) {
    if (!byGroup[tag]) continue;
    const meta = GROUP_META[tag] ?? { label: tag, sub: "" };
    result.push({
      group:    meta.label,
      groupTag: tag,
      sub:      meta.sub,
      profs:    byGroup[tag].sort((a, b) => a.name.localeCompare(b.name)),
    });
    delete byGroup[tag];
  }
  // Any groups not in ORDER (future-proof)
  for (const [tag, profs] of Object.entries(byGroup)) {
    result.push({ group: tag, groupTag: tag, sub: "", profs });
  }
  return result;
}

export function useProficiencies() {
  const [profs, setProfs] = useState(null); // null = use static fallback

  useEffect(() => {
    fetch("/api/proficiencies")
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => {
        setProfs(data.proficiencies.map(normalizeDbProf));
      })
      .catch(() => {
        setProfs(null); // triggers static fallback in callers
      });
  }, []); // fetch once — profs are global reference data

  return { profs };
}
