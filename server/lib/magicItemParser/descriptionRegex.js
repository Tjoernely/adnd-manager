/**
 * descriptionRegex.js
 *
 * Pure regex helpers for extracting combat-relevant data from a
 * magical-item description string. No DB access, no side effects.
 *
 * Exports:
 *   extractBasePlusBonus(desc)      → { baseType, magicBonus } | null
 *   extractSplitBonus(desc)         → { hitBonus, dmgBonus } | null
 *   extractConditionalBonuses(desc) → Array<{ bonus, vs }>
 *   extractSpecialProperties(desc)  → Array<string>
 */

// ── 1. Base type + primary magic bonus ────────────────────────────────────────
// Captures 1–3 lowercase words immediately before "+N"
//   "footman's mace +3"    → baseType: "footman's mace", magicBonus: 3
//   "sword +3 frost brand" → baseType: "sword",           magicBonus: 3
//   "long sword +5"        → baseType: "long sword",      magicBonus: 5
// Leading stop-words to strip from a captured baseType.
// Covers articles, demonstratives, and common copulas so the regex
// can still win on sentences like "This footman's mace +3 is cursed".
const STOPWORDS = new Set([
  'a', 'an', 'the',
  'this', 'that', 'these', 'those',
  'is', 'was', 'are', 'were',
  'has', 'have', 'had',
  'my', 'your', 'his', 'her', 'their', 'our',
]);

function extractBasePlusBonus(desc) {
  if (!desc) return null;
  // Allow 1–3 words of qualifier (including apostrophes and hyphens) before the +N
  const re = /\b([a-z][a-z'\-]*(?:\s+[a-z'\-]+){0,2})\s+\+(\d+)\b/i;
  const m  = desc.match(re);
  if (!m) return null;
  // Strip leading stop-words: "this footman's mace" → "footman's mace",
  // "a long sword" → "long sword".
  let baseType = m[1].toLowerCase().trim();
  const toks = baseType.split(/\s+/)
    // Scrub wiki-italic markup: "''footman's" → "footman's", but preserve
    // the internal possessive apostrophe. Also drop tokens that become empty.
    .map(t => t.replace(/^'+|'+$/g, '').replace(/'{2,}/g, "'"))
    .filter(Boolean);
  while (toks.length > 1 && STOPWORDS.has(toks[0])) toks.shift();
  baseType = toks.join(' ');
  if (!baseType) return null;
  return {
    baseType,
    magicBonus: parseInt(m[2], 10),
  };
}

// ── 2. Split bonus "+X / +Y" (to-hit / damage) ────────────────────────────────
// Rare but exists. Defaults identical-bonus weapons to magicBonus for both.
//   "sword +1/+3"  → { hitBonus: 1, dmgBonus: 3 }
function extractSplitBonus(desc) {
  if (!desc) return null;
  const m = desc.match(/\+(\d+)\s*\/\s*\+(\d+)/);
  if (!m) return null;
  return {
    hitBonus: parseInt(m[1], 10),
    dmgBonus: parseInt(m[2], 10),
  };
}

// ── 3. Conditional bonuses ("+2, +4 vs. undead") ──────────────────────────────
// Returns an array of { bonus, vs } — DM-facing info, not used for auto-math.
//   "+3 frost brand, +6 vs. fire using/dwelling creatures"
//   → [{ bonus: 6, vs: "fire using/dwelling creatures" }]
function extractConditionalBonuses(desc) {
  if (!desc) return [];
  const results = [];
  const re = /\+(\d+)\s+vs\.?\s+([a-z\s\-\/]+?)(?:[.,;:]|$)/gi;
  let m;
  while ((m = re.exec(desc)) !== null) {
    results.push({
      bonus: parseInt(m[1], 10),
      vs:    m[2].trim(),
    });
  }
  return results;
}

// ── 4. Special properties (captured as verbatim sentences, DM-facing) ─────────
// Looks for sentences matching common "magical effect" triggers. Not
// exhaustive — meant to surface the highlights, not structure them.
const SPECIAL_TRIGGERS = [
  /saving throw(?:\s+vs\.?\s+\w+)?/i,
  /command word/i,
  /on\s+(?:a\s+)?hit/i,
  /once per (?:day|turn|round)/i,
  /charges?/i,
  /silent(?:\s+movement)?/i,
  /displacement/i,
  /invisib(?:le|ility)/i,
  /teleport/i,
  /fire resistance/i,
  /cold resistance/i,
  /protection from/i,
  /cure blindness/i,
  /blind(?:ed|ness)?/i,
];

function extractSpecialProperties(desc) {
  if (!desc) return [];
  // Split into sentences, keep those that match any trigger.
  // Simple split — good enough for DM-facing notes.
  const sentences = desc
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 300);

  const hits = [];
  for (const s of sentences) {
    for (const trig of SPECIAL_TRIGGERS) {
      if (trig.test(s)) {
        hits.push(s);
        break;
      }
    }
  }
  return hits;
}

module.exports = {
  extractBasePlusBonus,
  extractSplitBonus,
  extractConditionalBonuses,
  extractSpecialProperties,
};
