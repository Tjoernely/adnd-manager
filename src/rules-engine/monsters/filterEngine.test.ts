/**
 * Unit tests for filterEngine.
 *
 * Designed to work with both Vitest and Jest. If your project uses a different
 * test runner, adjust the imports of `describe`, `it`, `expect`.
 *
 * Run with:
 *   npx vitest run src/rules-engine/monsters/filterEngine.test.ts
 *   or:
 *   npx jest src/rules-engine/monsters/filterEngine.test.ts
 */
import { describe, it, expect } from "vitest"; // change to "@jest/globals" if using Jest
import {
  emptyState,
  filterMonsters,
  projectedCount,
  serializeState,
  deserializeState,
  hasAnyFilter,
  normalizeSize,
  normalizeFreq,
  extractHabitats,
} from "./filterEngine";
import type {
  FilterableMonster,
  FilterState,
} from "../../components/Encounters/filterTypes";

// ----- Test fixtures -----
const DEFAULT_LOGIC = { primary: "or" as const, modifier: "and" as const, subtype: "or" as const };

const MONSTERS: FilterableMonster[] = [
  { id: 1, name: "Lich", tags: ["undead", "lich", "spellcaster", "intelligent", "evil", "magic-resistant"], size: "medium", frequency: "Very Rare", habitat: "Any" },
  { id: 2, name: "Skeleton", tags: ["undead", "skeleton", "mindless"], size: "medium", frequency: "Common", habitat: "Any" },
  { id: 3, name: "Zombie", tags: ["undead", "zombie", "mindless"], size: "medium", frequency: "Common", habitat: "Any" },
  { id: 4, name: "Vampire", tags: ["undead", "vampire", "shapechanger", "intelligent", "evil"], size: "medium", frequency: "Rare", habitat: "Any" },
  { id: 5, name: "Banshee", tags: ["undead", "banshee", "incorporeal", "spellcaster", "intelligent", "evil"], size: "medium", frequency: "Very Rare", habitat: "Forest" },
  { id: 6, name: "Dragon, Red", tags: ["dragon", "flying", "spellcaster", "intelligent", "evil", "chaotic"], size: "huge", frequency: "Very Rare", habitat: "Mountains" },
  { id: 7, name: "Goblin", tags: ["humanoid", "goblinoid", "goblin", "intelligent", "evil"], size: "small", frequency: "Common", habitat: "Any" },
  { id: 8, name: "Ogre", tags: ["giant", "ogre", "intelligent", "evil"], size: "large", frequency: "Uncommon", habitat: "Mountains, Forest" },
  { id: 9, name: "Wolf", tags: ["beast", "wolf", "mindless"], size: "medium", frequency: "Common", habitat: "Forest" },
  { id: 10, name: "Treant", tags: ["plant", "intelligent", "good"], size: "huge", frequency: "Very Rare", habitat: "Forest" },
];

function withTags(state: FilterState, cat: "primary" | "modifier" | "subtype", ...tags: string[]): FilterState {
  for (const t of tags) state.selectedTags[cat].add(t);
  return state;
}

// ============================================================
describe("filterMonsters — empty state returns everything", () => {
  it("with no filters, returns all monsters", () => {
    const state = emptyState(DEFAULT_LOGIC);
    expect(filterMonsters(state, MONSTERS)).toHaveLength(MONSTERS.length);
  });
});

// ============================================================
describe("filterMonsters — primary tag filter", () => {
  it("OR mode: undead returns 5 monsters", () => {
    const state = withTags(emptyState(DEFAULT_LOGIC), "primary", "undead");
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Lich", "Skeleton", "Vampire", "Zombie"]);
  });

  it("OR mode: undead OR dragon returns 6", () => {
    const state = withTags(emptyState(DEFAULT_LOGIC), "primary", "undead", "dragon");
    expect(filterMonsters(state, MONSTERS)).toHaveLength(6);
  });

  it("AND mode: undead AND dragon returns 0 (no overlap)", () => {
    const state = withTags(emptyState(DEFAULT_LOGIC), "primary", "undead", "dragon");
    state.logic.primary = "and";
    expect(filterMonsters(state, MONSTERS)).toHaveLength(0);
  });
});

// ============================================================
describe("filterMonsters — modifier tag filter", () => {
  it("AND mode (default): spellcaster + intelligent narrows correctly", () => {
    const state = withTags(emptyState(DEFAULT_LOGIC), "modifier", "spellcaster", "intelligent");
    // Logic AND means both must be present
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Dragon, Red", "Lich"]);
  });

  it("OR mode: spellcaster OR mindless widens", () => {
    const state = withTags(emptyState(DEFAULT_LOGIC), "modifier", "spellcaster", "mindless");
    state.logic.modifier = "or";
    expect(filterMonsters(state, MONSTERS)).toHaveLength(6); // 3 casters + 3 mindless (no overlap)
  });
});

// ============================================================
describe("filterMonsters — cross-category interaction", () => {
  it("primary undead AND modifier spellcaster → just lich + banshee", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedTags.primary.add("undead");
    state.selectedTags.modifier.add("spellcaster");
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Lich"]);
  });

  it("primary (undead OR dragon) AND modifier (spellcaster AND intelligent)", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedTags.primary.add("undead");
    state.selectedTags.primary.add("dragon");
    state.selectedTags.modifier.add("spellcaster");
    state.selectedTags.modifier.add("intelligent");
    // primary OR, modifier AND
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Dragon, Red", "Lich"]);
  });
});

// ============================================================
describe("filterMonsters — structured filters", () => {
  it("size: medium returns 6 monsters", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedSizes.add("medium");
    expect(filterMonsters(state, MONSTERS)).toHaveLength(6);
  });

  it("size: huge OR large returns 3 monsters", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedSizes.add("huge");
    state.selectedSizes.add("large");
    expect(filterMonsters(state, MONSTERS)).toHaveLength(3);
  });

  it("frequency: Common returns 4 monsters", () => {
    // Fixture has 4 Common: Skeleton, Zombie, Goblin, Wolf
    // (the shipped expectation of 3 was a test-data inconsistency in the v6 zip)
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedFreqs.add("Common");
    expect(filterMonsters(state, MONSTERS)).toHaveLength(4);
  });

  it("habitat: Forest matches substring (Ogre has 'Mountains, Forest')", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedHabitats.add("Forest");
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Ogre", "Treant", "Wolf"]);
  });
});

// ============================================================
describe("filterMonsters — search", () => {
  it("name match: 'dragon' finds Dragon, Red", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.search = "dragon";
    expect(filterMonsters(state, MONSTERS).map((m) => m.name)).toContain("Dragon, Red");
  });

  it("tag match: 'flying' finds Dragon, Red (via tag)", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.search = "flying";
    expect(filterMonsters(state, MONSTERS).map((m) => m.name)).toContain("Dragon, Red");
  });

  it("multi-word search: 'undead caster' AND-matches both tokens", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.search = "undead spellcaster";
    const result = filterMonsters(state, MONSTERS);
    expect(result.map((m) => m.name).sort()).toEqual(["Banshee", "Lich"]);
  });

  it("case-insensitive", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.search = "LICH";
    expect(filterMonsters(state, MONSTERS).map((m) => m.name)).toContain("Lich");
  });

  it("empty/whitespace-only search returns everything", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.search = "   ";
    expect(filterMonsters(state, MONSTERS)).toHaveLength(MONSTERS.length);
  });
});

// ============================================================
describe("projectedCount", () => {
  it("projects adding a primary tag", () => {
    const state = emptyState(DEFAULT_LOGIC);
    const count = projectedCount(state, MONSTERS, "tag-primary", "undead");
    expect(count).toBe(5);
  });

  it("respects current filters when projecting", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedTags.primary.add("undead");
    // What if we add modifier:spellcaster?
    const count = projectedCount(state, MONSTERS, "tag-modifier", "spellcaster");
    expect(count).toBe(2); // Lich + Banshee
  });

  it("projects adding a size filter", () => {
    const state = emptyState(DEFAULT_LOGIC);
    state.selectedTags.primary.add("undead");
    const count = projectedCount(state, MONSTERS, "size", "medium");
    expect(count).toBe(5); // all 5 undead are medium
  });
});

// ============================================================
describe("normalizeSize", () => {
  it("handles plain strings", () => {
    expect(normalizeSize("medium")).toBe("medium");
    expect(normalizeSize("Huge")).toBe("huge");
  });
  it("handles ID&D 2E size codes like 'M (5\\' tall)'", () => {
    expect(normalizeSize("M (5' tall)")).toBe("medium");
    expect(normalizeSize("L (8' long)")).toBe("large");
    expect(normalizeSize("T (1' diameter)")).toBe("tiny");
  });
  it("handles null/empty", () => {
    expect(normalizeSize(null)).toBe("");
    expect(normalizeSize("")).toBe("");
  });
});

// ============================================================
describe("normalizeFreq", () => {
  it("normalizes casing", () => {
    expect(normalizeFreq("very rare")).toBe("Very Rare");
    expect(normalizeFreq("VERY RARE")).toBe("Very Rare");
    expect(normalizeFreq("Very Rare")).toBe("Very Rare");
  });
});

// ============================================================
describe("extractHabitats", () => {
  it("extracts unique habitat tokens sorted by frequency", () => {
    const habs = extractHabitats(MONSTERS);
    expect(habs).toContain("Any");
    expect(habs).toContain("Forest");
    expect(habs).toContain("Mountains");
  });

  it("respects maxCount", () => {
    const habs = extractHabitats(MONSTERS, 2);
    expect(habs).toHaveLength(2);
  });
});

// ============================================================
describe("serializeState / deserializeState round-trip", () => {
  it("preserves all selections", () => {
    const original = emptyState(DEFAULT_LOGIC);
    original.search = "undead caster";
    original.selectedTags.primary.add("undead");
    original.selectedTags.modifier.add("spellcaster");
    original.selectedTags.modifier.add("intelligent");
    original.selectedSizes.add("medium");
    original.selectedFreqs.add("Common");
    original.selectedHabitats.add("Forest");
    original.logic.primary = "and";

    const ser = serializeState(original);
    const restored = deserializeState(ser, DEFAULT_LOGIC);

    expect(restored.search).toBe(original.search);
    expect([...restored.selectedTags.primary]).toEqual(["undead"]);
    expect([...restored.selectedTags.modifier].sort()).toEqual(["intelligent", "spellcaster"]);
    expect([...restored.selectedSizes]).toEqual(["medium"]);
    expect([...restored.selectedFreqs]).toEqual(["Common"]);
    expect([...restored.selectedHabitats]).toEqual(["Forest"]);
    expect(restored.logic.primary).toBe("and");
  });

  it("handles null input gracefully", () => {
    const restored = deserializeState(null, DEFAULT_LOGIC);
    expect(restored.search).toBe("");
    expect(restored.logic.primary).toBe("or");
  });
});

// ============================================================
describe("hasAnyFilter", () => {
  it("returns false for fresh state", () => {
    expect(hasAnyFilter(emptyState(DEFAULT_LOGIC))).toBe(false);
  });
  it("returns true when search is set", () => {
    const s = emptyState(DEFAULT_LOGIC);
    s.search = "x";
    expect(hasAnyFilter(s)).toBe(true);
  });
  it("returns true when any tag is selected", () => {
    const s = emptyState(DEFAULT_LOGIC);
    s.selectedTags.primary.add("undead");
    expect(hasAnyFilter(s)).toBe(true);
  });
});

// ============================================================
describe("performance smoke test", () => {
  it("filters 4000-monster array under 50ms", () => {
    const big: FilterableMonster[] = [];
    for (let i = 0; i < 400; i++) {
      for (const m of MONSTERS) {
        big.push({ ...m, id: m.id * 1000 + i });
      }
    }
    expect(big.length).toBe(4000);

    const state = emptyState(DEFAULT_LOGIC);
    state.selectedTags.primary.add("undead");
    state.selectedTags.modifier.add("spellcaster");
    state.search = "lich";

    const t0 = performance.now();
    filterMonsters(state, big);
    const t1 = performance.now();
    expect(t1 - t0).toBeLessThan(50);
  });
});
