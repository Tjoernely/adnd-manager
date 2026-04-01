/**
 * src/rules-engine/profResolver.js
 *
 * Deterministic resolver: raw kit proficiency string → canonical proficiency record.
 *
 * Match layers (tried in order):
 *   exact_name    — case-insensitive match on display name or DB alias
 *   token_key     — alphabetically-sorted token set (word-order / punctuation agnostic)
 *   curated_alias — explicit alias map for abbreviated/garbled variants
 *   fuzzy_candidate — substring search, always requires_review
 *   unresolved    — no match
 *
 * Pure JS — no React, no browser APIs. Safe to import in Node scripts.
 */

// ── Pre-processing ────────────────────────────────────────────────────────────

// Phrases that indicate a kit entry is NOT a proficiency reference
const NON_PROF_STARTS = [
  'none', 'player', 'any of', 'special', 'explorer receives',
  'since these', 'those lower', 'however', 'among those',
  'if the', 'a final', 'another at', 'below', 'but see',
  'numerous', 'one slot', 'cost double', 'double slot',
  'nonweapon proficiencies.', 'anagakok',
  'es :', // garbled extraction artifact
];
const NON_PROF_CONTAINS = ['slot', ' level', 'unless paladin', 'most often'];

/**
 * Clean a raw kit NWP entry into a workable string, or return null if
 * it is clearly not a resolvable proficiency reference.
 */
export function preProcess(raw) {
  if (!raw || typeof raw !== 'string') return null;

  let s = raw.trim();

  // Too long — likely rule text embedded in kit data
  if (s.length > 70) return null;

  const lower = s.toLowerCase();
  for (const p of NON_PROF_STARTS)  { if (lower.startsWith(p)) return null; }
  for (const p of NON_PROF_CONTAINS){ if (lower.includes(p))   return null; }

  // Strip "Proficiencies : " / "Proficiency : " (with optional group sub-tag)
  s = s.replace(/^proficienc(?:y|ies)\s*[:\-]\s*/i, '');

  // Strip "(General)" / "(Warrior)" / "(Priest)" group qualifiers
  s = s.replace(/^\((?:general|warrior|priest|rogue|wizard)\)\s*/i, '');

  // Strip trailing " *" (bonus/special markers)
  s = s.replace(/\s*\*+$/, '');

  // Take only the first part before ". Suggested", ". Forbidden", ". As mentioned"
  s = s.replace(/\.\s+(?:Suggested|Forbidden|As\s|however)/i, '').trim();

  // Strip trailing orphaned open-paren fragments: "Artistic Ability (Painting" → "Artistic Ability"
  s = s.replace(/\s*\([^)]*$/, '').trim();

  // Normalize "or" in compound entries ("Agriculture or Fishing") → take first
  // We handle "or" compounds by returning the first part for resolution
  // (the resolver will handle multi-candidates via slash splitting anyway)
  if (/\bor\b/i.test(s) && !/\(/.test(s)) {
    s = s.split(/\s+or\s+/i)[0].trim();
  }

  return s.trim() || null;
}

// ── Token key ─────────────────────────────────────────────────────────────────

/**
 * Canonical comparison key.
 *   1. lowercase
 *   2. remove brackets / punctuation → space
 *   3. split on whitespace
 *   4. drop empty tokens
 *   5. sort alphabetically
 *   6. join with space
 *
 * Examples:
 *   "Riding (Land-Based)"  → "based land riding"
 *   "land-based riding"    → "based land riding"
 *   "Riding, Land-Based"   → "based land riding"
 *   "Land Based Riding"    → "based land riding"
 *   "Fire-Building"        → "building fire"
 *   "Blind-Fighting"       → "blind fighting"
 *   "Blindfighting"        → "blindfighting"   ← deliberately differs
 */
export function tokenKey(s) {
  return s
    .toLowerCase()
    .replace(/[()[\]{}]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 0)
    .sort()
    .join(' ');
}

// ── Curated alias map ─────────────────────────────────────────────────────────
// Keys: tokenKey(raw variant)  →  canonical display name (exact, case-sensitive)
//
// Only add entries that the token_key layer CANNOT auto-resolve because the
// variant uses genuinely different or abbreviated words.
//
// Do NOT add entries for variants that differ only in case, punctuation, or
// word order — the token_key layer handles those automatically.

export const CURATED_ALIASES = {
  // Blind-Fighting: "Blindfighting" (no hyphen/space) → one token, doesn't match "blind fighting"
  'blindfighting':           'Blind-Fighting',
  'blind fight':             'Blind-Fighting',   // "Blind Fight" variant

  // Cobbling: "Cobbler" is the agent-noun variant used in some kits
  'cobbler':                 'Cobbling',

  // Leatherworking: "Leather working" (with space) splits into two tokens
  'leather working':         'Leatherworking',

  // Riding (Land-Based): "Landbased" as one word — tokenKey differs from "based land"
  'landbased riding':        'Riding (Land-Based)',
  'riding landbased':        'Riding (Land-Based)',

  // Bowyer/Fletcher — slash stripped, "bowyer" alone is unambiguous
  'bowyer':                  'Bowyer/Fletcher',
  'fletcher':                'Bowyer/Fletcher',
  'bowyer crude':            'Bowyer/Fletcher',   // crude variant if present

  // Reading/Writing — "read" ≠ "reading" after token split
  'read write':              'Reading/Writing',
  'read writing':            'Reading/Writing',

  // Tightrope Walking — "tightrope" alone (shortened form used in several kits)
  'tightrope':               'Tightrope Walking',

  // Set Snares — "snare" alone (singular)
  'snare':                   'Set Snares',
  'set snare':               'Set Snares',

  // Escape (rogue prof) — "escape artist" is kit jargon for the Escape proficiency
  'artist escape':           'Escape',

  // Spellcraft — "spell craft" (split spelling)
  'craft spell':             'Spellcraft',

  // Modern Languages — singular "language modern"
  'language modern':         'Modern Languages',
  'modern language':         'Modern Languages',

  // Ancient Languages — singular
  'ancient language':        'Ancient Languages',
  'language ancient':        'Ancient Languages',

  // Animal Lore → Animal Handling (most kits use "Animal Lore" to mean this)
  // NOTE: if DB has a canonical "Animal Lore" prof, this alias may be skipped because
  // the exact_name layer will find it first. Only resolves if "Animal Lore" is missing.
  'animal lore':             'Animal Handling',
  'lore animal':             'Animal Handling',

  // Tracking variants
  'trailing':                'Tracking',    // "Trailing" used as synonym

  // Hunting (may not be in all canon sets)
  // — no alias; left for fuzzy layer

  // Appraising
  'appraise':                'Appraising',

  // Animal Noise → Animal Sounds / Mimicry — left for fuzzy, too ambiguous
};

// ── Index builder ─────────────────────────────────────────────────────────────

/**
 * Build lookup index from a proficiency list (static or DB-normalized).
 * Call once per prof list; pass the result to resolveKitProfEntry.
 *
 * Works with both static ALL_NWP objects { id, name, ... }
 * and DB-normalized objects { id: canonical_id, name, aliases: [] }.
 */
export function buildProfIndex(proficiencies) {
  const byExactLower = new Map();  // name.toLowerCase()  → prof
  const byTokenKey   = new Map();  // tokenKey(name)      → [prof, ...]
  const byAliasTK    = new Map();  // tokenKey from CURATED_ALIASES → prof

  for (const prof of proficiencies) {
    // Layer: exact name + DB aliases
    byExactLower.set(prof.name.toLowerCase(), prof);

    const tk = tokenKey(prof.name);
    if (!byTokenKey.has(tk)) byTokenKey.set(tk, []);
    byTokenKey.get(tk).push(prof);

    // DB aliases (present when using normalizeDbProf)
    const aliases = Array.isArray(prof.aliases) ? prof.aliases : [];
    for (const a of aliases) {
      const aStr = typeof a === 'string' ? a : (a?.alias ?? '');
      if (!aStr) continue;
      const aLow = aStr.toLowerCase();
      if (!byExactLower.has(aLow)) byExactLower.set(aLow, prof);
      const atk = tokenKey(aStr);
      if (!byTokenKey.has(atk)) byTokenKey.set(atk, []);
      const arr = byTokenKey.get(atk);
      if (!arr.includes(prof)) arr.push(prof);
    }
  }

  // Curated aliases → find target prof by exact (case-insensitive) name
  for (const [aliasTK, canonicalName] of Object.entries(CURATED_ALIASES)) {
    const prof = byExactLower.get(canonicalName.toLowerCase());
    if (prof) byAliasTK.set(aliasTK, prof);
    // (If canonicalName not found in this prof list, skip gracefully)
  }

  return { byExactLower, byTokenKey, byAliasTK, proficiencies };
}

// ── Resolver ──────────────────────────────────────────────────────────────────

/**
 * Resolve a raw kit NWP string to a canonical proficiency record.
 *
 * @param {string} rawEntry  — raw string from kit nwpRequired/nwpRecommended
 * @param {object} index     — built by buildProfIndex()
 * @returns {ResolveResult}
 */
export function resolveKitProfEntry(rawEntry, index) {
  // Handle slash-compound entries ("Animal Handling/Training") by resolving
  // each part and returning the first that resolves confidently.
  if (/\//.test(rawEntry) && !rawEntry.match(/^\s*Reading\/Writing/i)) {
    const parts = rawEntry.split('/').map(p => p.trim()).filter(Boolean);
    for (const part of parts) {
      const r = _resolveOne(part, index);
      if (!r.requires_review && r.resolved_canonical_id) return r;
    }
    // All parts failed — return unresolved with note
    return _unresolved(rawEntry, 'Slash-compound: no part resolved confidently');
  }

  return _resolveOne(rawEntry, index);
}

function _resolveOne(rawEntry, index) {
  const cleaned = preProcess(rawEntry);

  if (!cleaned) {
    return _unresolved(rawEntry, 'Non-prof text (filtered by pre-processor)');
  }

  const cleanedLower = cleaned.toLowerCase();
  const tk           = tokenKey(cleaned);

  // ── Layer A: Exact name match (case-insensitive, includes DB aliases) ──────
  const exactMatch = index.byExactLower.get(cleanedLower);
  if (exactMatch) {
    return _make(rawEntry, exactMatch, 'exact_name', 'high', false);
  }

  // ── Layer B: Token key match ───────────────────────────────────────────────
  const tkMatches = index.byTokenKey.get(tk) ?? [];
  if (tkMatches.length === 1) {
    return _make(rawEntry, tkMatches[0], 'token_key', 'high', false);
  }
  if (tkMatches.length > 1) {
    // Multiple profs share this token key — ambiguous
    return {
      raw:                    rawEntry,
      cleaned,
      resolved_canonical_id:  null,
      resolved_display_name:  null,
      match_method:           'token_key',
      confidence:             'low',
      requires_review:        true,
      candidates:             tkMatches.map(_cand),
      note:                   `Ambiguous token key "${tk}" — ${tkMatches.length} matches`,
    };
  }

  // ── Layer C: Curated alias map ─────────────────────────────────────────────
  const aliasMatch = index.byAliasTK.get(tk);
  if (aliasMatch) {
    return _make(rawEntry, aliasMatch, 'curated_alias', 'high', false);
  }

  // ── Layer D: Fuzzy candidates (substring, significant words only) ──────────
  const candidates = _fuzzy(cleanedLower, index.proficiencies);
  if (candidates.length === 0) {
    return _unresolved(rawEntry, 'No match found');
  }
  if (candidates.length === 1) {
    return {
      raw:                    rawEntry,
      cleaned,
      resolved_canonical_id:  candidates[0].id,
      resolved_display_name:  candidates[0].name,
      match_method:           'fuzzy_candidate',
      confidence:             'medium',
      requires_review:        true,
      candidates:             candidates.map(_cand),
      note:                   'Single fuzzy match — verify correctness',
    };
  }
  return {
    raw:                    rawEntry,
    cleaned,
    resolved_canonical_id:  null,
    resolved_display_name:  null,
    match_method:           'fuzzy_candidate',
    confidence:             'low',
    requires_review:        true,
    candidates:             candidates.map(_cand),
    note:                   `${candidates.length} fuzzy candidates`,
  };
}

function _fuzzy(cleanedLower, proficiencies) {
  // Split into significant tokens (length ≥ 4, skip stop words)
  const STOP = new Set(['with', 'from', 'that', 'this', 'have', 'will', 'your', 'they']);
  const tokens = cleanedLower.split(/\s+/).filter(t => t.length >= 4 && !STOP.has(t));
  if (tokens.length === 0) return [];

  return proficiencies.filter(prof => {
    const nameLower = prof.name.toLowerCase();
    return tokens.every(t => nameLower.includes(t));
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _make(raw, prof, method, confidence, requiresReview) {
  return {
    raw,
    cleaned:               preProcess(raw) ?? raw,
    resolved_canonical_id: prof.id,
    resolved_display_name: prof.name,
    match_method:          method,
    confidence,
    requires_review:       requiresReview,
    candidates:            [_cand(prof)],
    note:                  null,
  };
}

function _unresolved(raw, note) {
  return {
    raw,
    cleaned:               preProcess(raw) ?? raw,
    resolved_canonical_id: null,
    resolved_display_name: null,
    match_method:          'unresolved',
    confidence:            'low',
    requires_review:       true,
    candidates:            [],
    note,
  };
}

function _cand(prof) {
  return { canonical_id: prof.id, display_name: prof.name };
}
