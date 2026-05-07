/**
 * Parse monster description / special_attacks / special_defenses for spell mentions.
 *
 * Strategy:
 *  1. Use the curated knownSpells list — match longest first so "Mass Charm"
 *     wins over "Charm".
 *  2. Return tokens with start/end offsets so the renderer can slice the text
 *     and replace matches with <SpellLink/> components.
 *
 * This is purely lexical — the renderer is responsible for actually fetching
 * the spell from /api/spells.
 */
import knownSpellsData from "../../rulesets/knownSpells.json";

export interface SpellMatch {
  spellName: string;
  start: number;
  end: number;
}

export interface TextToken {
  type: "text" | "spell";
  value: string;
  /** Only present on spell tokens */
  spellName?: string;
}

const SPELL_NAMES: string[] = [...(knownSpellsData.spellNames as string[])].sort(
  (a, b) => b.length - a.length
);

/**
 * Escape a string for use in a regex.
 */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Find all spell mentions in `text`. Non-overlapping; longer matches win.
 */
export function findSpellMentions(text: string | null | undefined): SpellMatch[] {
  if (!text) return [];

  const matches: SpellMatch[] = [];
  const claimed = new Array(text.length).fill(false);

  for (const name of SPELL_NAMES) {
    // Word-boundary, case-insensitive
    const re = new RegExp(`\\b${escapeRegex(name)}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const start = m.index;
      const end = start + m[0].length;

      // Skip if any character in this range is already claimed
      let collision = false;
      for (let i = start; i < end; i++) {
        if (claimed[i]) {
          collision = true;
          break;
        }
      }
      if (collision) continue;

      for (let i = start; i < end; i++) claimed[i] = true;
      matches.push({ spellName: name, start, end });
    }
  }

  matches.sort((a, b) => a.start - b.start);
  return matches;
}

/**
 * Tokenize text into alternating text/spell tokens for rendering.
 */
export function tokenizeAbilityText(text: string | null | undefined): TextToken[] {
  if (!text) return [];
  const matches = findSpellMentions(text);
  if (matches.length === 0) return [{ type: "text", value: text }];

  const tokens: TextToken[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      tokens.push({ type: "text", value: text.slice(cursor, m.start) });
    }
    tokens.push({
      type: "spell",
      value: text.slice(m.start, m.end),
      spellName: m.spellName,
    });
    cursor = m.end;
  }
  if (cursor < text.length) {
    tokens.push({ type: "text", value: text.slice(cursor) });
  }
  return tokens;
}

/**
 * Detect the wiki-style key/value blob used in the imported descriptions and strip it,
 * returning the natural-language portion. Wiki blobs look like:
 *   __NOTOC__Spelljammer: Adventures (1049)
 *   |xp=14,000|moral=Fanatic|...|thac0=...}}
 *
 * We trim leading metadata up to and including the closing `}}` if present.
 */
export function stripWikiMetadata(desc: string | null | undefined): string {
  if (!desc) return "";
  let s = desc;

  // Drop leading __NOTOC__ etc.
  s = s.replace(/^_{2,}\w+_{2,}/, "");

  // If a leading `|key=value|...}}` or `|key=value|...` block exists at the top,
  // keep only the part AFTER the closing }} (or after the last leading | line).
  const closeIdx = s.indexOf("}}");
  if (closeIdx >= 0 && closeIdx < 1500) {
    // Only treat as metadata block if `}}` appears early
    const afterClose = s.slice(closeIdx + 2).trim();
    if (afterClose.length > 50) return afterClose;
  }

  // Also strip leading lines that start with `|`
  const lines = s.split(/\r?\n/);
  let i = 0;
  while (i < lines.length && (lines[i].trimStart().startsWith("|") || lines[i].trim() === "")) {
    i++;
  }
  return lines.slice(i).join("\n").trim();
}
