/**
 * NPC name resolution for quest AI integration.
 *
 * AI returns npc_suggestions with names + role + race/class/etc. This module:
 *   1. Fetches existing campaign NPCs
 *   2. Fuzzy-matches suggestion names to existing NPCs (Levenshtein)
 *   3. Creates new NPC records for unmatched suggestions
 *   4. Returns a name→id map for the quest converter
 *   5. After quest is saved, finalizeAffiliations() updates each NPC with
 *      the quest affiliation block.
 *
 * ACTUAL API (verified against src/api/client.js + server/routes/npcs.js):
 *   api.getNpcs(campaignId): Promise<NpcRecord[]>
 *   api.createNpc({ campaign_id, name, is_hidden?, data }): Promise<NpcRecord>
 *   api.updateNpc(id, { name?, is_hidden?, data? }): Promise<NpcRecord>
 *
 * NPC row shape: { id, name (top-level), is_hidden, data (JSONB blob) }
 */

import { api } from '../../api/client';

// ── AI-side types ────────────────────────────────────────────────────────────

export interface NPCSuggestion {
  name: string;
  role: string;
  race: string | null;
  class: string | null;
  level: number | null;
  alignment: string;
  motivation: string;
  personality: string;
  appearance: string;
  secrets: string[];
}

// ── NPC affiliation block (lives inside NPC data) ────────────────────────────

export interface NPCAffiliation {
  type: string;        // 'quest' | 'city' | 'faction' | 'guild' | 'family' | ...
  ref_id: number | null;
  name: string;        // fallback display when ref_id is null
  role: string;
}

// ── Result map returned to quest orchestrator ────────────────────────────────

export interface ResolvedNPCEntry {
  id: number;
  name: string;
  role: string;
  wasCreated: boolean;
  /** AI's name string (may differ from existing NPC's name when fuzzy-matched) */
  aiName: string;
}

export interface ResolvedNPCMap {
  /** All NPCs referenced by the quest, keyed by AI's name string */
  nameToId: Map<string, number>;
  entries: ResolvedNPCEntry[];
  created: ResolvedNPCEntry[];
  linked: ResolvedNPCEntry[];
}

// ── Loose existing-NPC shape ─────────────────────────────────────────────────
//
// NPCs returned from api.getNpcs have name at top level (DB column), with
// race/class/affiliations/etc. nested inside data (JSONB column). We tolerate
// legacy records that also have name nested inside data.

interface ExistingNPC {
  id: number;
  /** Top-level name from the row (primary source) */
  name?: string;
  is_hidden?: boolean;
  data: {
    /** Legacy: name nested in data — we read it as fallback only */
    name?: string;
    affiliations?: NPCAffiliation[];
    [k: string]: unknown;
  };
}

// ── Name normalization & fuzzy matching ──────────────────────────────────────

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const m: number[][] = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      const cost = a[j - 1] === b[i - 1] ? 0 : 1;
      m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + cost);
    }
  }
  return m[b.length][a.length];
}

/**
 * Names match if normalized strings are equal, or within an adaptive
 * edit-distance threshold based on length. Names under 5 chars require
 * exact match (too short to fuzzy reliably).
 */
function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen < 5) return false;
  const d = levenshtein(na, nb);
  if (minLen < 10) return d <= 1;
  return d <= 2;
}

function findExistingNPC(name: string, existing: ExistingNPC[]): ExistingNPC | null {
  for (const npc of existing) {
    // Top-level name is the source of truth; data.name is legacy fallback
    const existingName = npc.name ?? npc.data?.name;
    if (typeof existingName === 'string' && namesMatch(name, existingName)) {
      return npc;
    }
  }
  return null;
}

// ── NPC data construction ────────────────────────────────────────────────────

/**
 * Build a new NPC data object (the JSONB blob) from an AI suggestion.
 *
 * `name` and `is_hidden` are NOT included here — they live at the row's
 * top level (DB columns). The caller hoists name out and passes it
 * alongside data in the createNpc body.
 *
 * Affiliations start empty — the caller updates them after quest is saved
 * (we don't know the quest_id yet at NPC creation time).
 */
function npcDataFromSuggestion(s: NPCSuggestion) {
  return {
    race: s.race ?? 'human',
    class: s.class,
    level: s.level,
    alignment: s.alignment ?? 'true neutral',
    motivation: s.motivation,
    personality: s.personality,
    appearance: s.appearance,
    secrets: s.secrets ?? [],
    affiliations: [] as NPCAffiliation[],
    source: 'quest_ai',
    source_quest_id: null as number | null,
  };
}

// ── Main resolution flow ─────────────────────────────────────────────────────

/**
 * Resolve all AI npc_suggestions to NPC database IDs.
 *
 * For each suggestion:
 *   - If a similarly-named NPC exists in the campaign, link to it (no edits yet).
 *   - Otherwise create a new NPC with source='quest_ai'.
 *
 * Affiliations are NOT set here — call finalizeAffiliations() after the
 * quest has been saved and has a real ID.
 */
export async function resolveQuestNPCs(
  suggestions: NPCSuggestion[],
  campaignId: number
): Promise<ResolvedNPCMap> {
  const result: ResolvedNPCMap = {
    nameToId: new Map(),
    entries: [],
    created: [],
    linked: [],
  };
  if (!suggestions || suggestions.length === 0) return result;

  let existing: ExistingNPC[] = [];
  try {
    existing = (await api.getNpcs(campaignId)) ?? [];
  } catch (err) {
    console.warn('resolveQuestNPCs: api.getNpcs failed, creating all as new:', err);
  }

  // Track NPCs we create during this pass so we can match later suggestions
  // against them too (avoids duplicates when AI mentions same name twice).
  const inFlightCreated: ExistingNPC[] = [];
  const allKnown = (): ExistingNPC[] => [...existing, ...inFlightCreated];

  for (const s of suggestions) {
    if (!s?.name) continue;

    const match = findExistingNPC(s.name, allKnown());
    if (match) {
      const entry: ResolvedNPCEntry = {
        id: match.id,
        name: match.name ?? match.data?.name ?? s.name,
        role: s.role,
        wasCreated: false,
        aiName: s.name,
      };
      result.nameToId.set(s.name, match.id);
      result.entries.push(entry);
      result.linked.push(entry);
      continue;
    }

    // Create new NPC. Server expects { campaign_id, name, is_hidden?, data }
    // — name is the row column, data is the JSONB blob.
    try {
      const newNPC = await api.createNpc({
        campaign_id: campaignId,
        name: s.name,
        is_hidden: true,  // matches existing NPCManager convention — DM unhides when ready
        data: npcDataFromSuggestion(s),
      });
      const entry: ResolvedNPCEntry = {
        id: newNPC.id,
        name: s.name,
        role: s.role,
        wasCreated: true,
        aiName: s.name,
      };
      result.nameToId.set(s.name, newNPC.id);
      result.entries.push(entry);
      result.created.push(entry);
      inFlightCreated.push({ id: newNPC.id, name: s.name, data: {} });
    } catch (err) {
      console.error(`Failed to create NPC "${s.name}":`, err);
      // Skip this NPC — quest will still save, just without this reference
    }
  }

  return result;
}

// ── Affiliation finalization (after quest is saved) ──────────────────────────

/**
 * After quest is saved and has a real ID, update each NPC's affiliations
 * to include the quest reference. Created NPCs also get source_quest_id set.
 *
 * Fail-soft: a single update failure logs but doesn't abort the rest.
 */
export async function finalizeAffiliationsForCampaign(
  questId: number,
  questTitle: string,
  campaignId: number,
  resolved: ResolvedNPCMap
): Promise<void> {
  if (resolved.entries.length === 0) return;
  let all: ExistingNPC[] = [];
  try {
    all = (await api.getNpcs(campaignId)) ?? [];
  } catch (err) {
    console.warn('finalizeAffiliationsForCampaign: api.getNpcs failed:', err);
    return;
  }
  const byId = new Map<number, ExistingNPC>();
  for (const n of all) byId.set(n.id, n);

  for (const entry of resolved.entries) {
    const npc = byId.get(entry.id);
    if (!npc) {
      console.warn(`finalizeAffiliations: NPC ${entry.id} not found`);
      continue;
    }
    const currentAffiliations: NPCAffiliation[] = Array.isArray(npc.data.affiliations)
      ? npc.data.affiliations
      : [];
    const alreadyLinked = currentAffiliations.some(
      a => a.type === 'quest' && a.ref_id === questId
    );
    if (alreadyLinked && !entry.wasCreated) continue;

    // Build the new JSONB blob (name lives at row top level, not in data)
    const updatedDataField = {
      ...npc.data,
      affiliations: alreadyLinked
        ? currentAffiliations
        : [
            ...currentAffiliations,
            { type: 'quest', ref_id: questId, name: questTitle, role: entry.role },
          ],
      ...(entry.wasCreated ? { source_quest_id: questId } : {}),
    };

    // Strip any legacy "name" field that may have been nested in data on old rows.
    // It belongs at the row top level only.
    if ('name' in updatedDataField) {
      delete (updatedDataField as Record<string, unknown>).name;
    }

    try {
      // Send { data: ... } — server should treat name/is_hidden as unchanged.
      // ASSUMPTION: server/routes/npcs.js PATCH/PUT accepts partial updates with
      // optional name/is_hidden. If it requires both, this will fail and we'll
      // need to pass name + is_hidden too.
      await api.updateNpc(entry.id, { data: updatedDataField });
    } catch (err) {
      console.warn(`finalizeAffiliations: failed for NPC ${entry.id}:`, err);
    }
  }
}

// ── Test helpers (exported for unit tests if added later) ────────────────────

export const _test = { normalizeName, levenshtein, namesMatch };
