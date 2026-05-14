import { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  extractHabitats,
  filterMonsters,
  projectedCount,
} from "../../rules-engine/monsters/filterEngine";
import filterConfig from "../../rulesets/filterConfig.json";
// Frontend-local copy of the vocabulary (Option B from INTEGRATION-v6.md).
// Vite bundles this directly; no runtime fetch. If the canonical vocab in
// server/data/tag-vocabulary.json changes, re-copy and rebuild.
import tagVocab from "../../rulesets/tag-vocabulary.json";
import { useFilterState } from "./useFilterState";
import type {
  FilterConfig,
  FilterableMonster,
  TagCategory,
} from "./filterTypes";
import styles from "./TagFilterPanel.module.css";

/**
 * Main filter panel — sidebar UI for both Monster Library and Encounter Generator.
 *
 * USAGE:
 *   const { state, filtered } = useTagFilter("library", allMonsters);
 *   return (
 *     <div className="layout">
 *       <TagFilterPanel
 *         storageKey="library"
 *         monsters={allMonsters}
 *         onFilteredChange={setFiltered}
 *       />
 *       <MonsterGrid monsters={filtered} />
 *     </div>
 *   );
 */

const CONFIG = filterConfig as FilterConfig;

const PRIMARY_TAGS = (tagVocab as any).primary.map((t: any) => t.slug) as string[];
const SUBTYPE_TAGS = (tagVocab as any).subtype.map((t: any) => t.slug) as string[];
const MODIFIER_TAGS = (tagVocab as any).modifier.map((t: any) => t.slug) as string[];

const ALL_TAGS_BY_CAT: Record<TagCategory, string[]> = {
  primary: PRIMARY_TAGS,
  modifier: MODIFIER_TAGS,
  subtype: SUBTYPE_TAGS,
};

interface Props {
  /** Unique key per panel instance — used for sessionStorage isolation. */
  storageKey: string;
  /** Full monster list. Filter operates against this. */
  monsters: FilterableMonster[];
  /** Called with the filtered subset whenever it changes. */
  onFilteredChange: (filtered: FilterableMonster[]) => void;
}

function TagFilterPanelInner({ storageKey, monsters, onFilteredChange }: Props) {
  const filter = useFilterState(
    `adnd_filter_${storageKey}`,
    CONFIG.defaultLogic
  );
  const { state } = filter;

  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(CONFIG.defaultOpenSections)
  );
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSearch, setModalSearch] = useState("");

  // === Stabilize the `monsters` prop reference ===
  // Defensive against parents that pass a freshly-built array on every render
  // (e.g. `monsters={allMonsters.filter(...)}` inline). If the underlying data
  // is the same (same length + same first/last id), keep the previous ref so
  // downstream useMemos don't recompute on reference-only changes.
  const monstersStableRef = useRef<FilterableMonster[]>(monsters);
  const monstersStable = useMemo(() => {
    const prev = monstersStableRef.current;
    if (prev.length === monsters.length &&
        prev[0]?.id === monsters[0]?.id &&
        prev[prev.length - 1]?.id === monsters[monsters.length - 1]?.id) {
      return prev;
    }
    monstersStableRef.current = monsters;
    return monsters;
  }, [monsters]);

  // === Stabilize the onFilteredChange callback via ref ===
  // The propagate-up useEffect must not depend on `onFilteredChange` directly —
  // if the parent passes a new arrow on every render, that dep flickers and the
  // effect re-fires in a loop. Stash the latest callback in a ref and only
  // depend on `filtered` content below.
  const onFilteredChangeRef = useRef(onFilteredChange);
  useEffect(() => { onFilteredChangeRef.current = onFilteredChange; });

  // === Compute filtered list ===
  // (Was `require()` in the shipped component — replaced with ES import at the
  // top of the file; CJS require isn't available in Vite's browser bundle.)
  const filtered = useMemo(
    () => filterMonsters(state, monstersStable),
    [state, monstersStable],
  );

  // === Propagate filtered list up — content-equality gated ===
  // Only notify the parent when the filtered result actually changed (not just
  // a reference change). Breaks the React #520 render-loop the user reported
  // even when parent props are unstable.
  const lastFilteredRef = useRef<FilterableMonster[] | null>(null);
  useEffect(() => {
    const prev = lastFilteredRef.current;
    const curr = filtered;
    if (prev &&
        prev.length === curr.length &&
        prev[0]?.id === curr[0]?.id &&
        prev[prev.length - 1]?.id === curr[curr.length - 1]?.id) {
      return; // content effectively unchanged → skip the upstream notification
    }
    lastFilteredRef.current = curr;
    onFilteredChangeRef.current(curr);
  }, [filtered]);

  const habitats = useMemo(() => extractHabitats(monstersStable), [monstersStable]);

  // === Helpers ===
  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const isQuickActive = (cat: TagCategory, tag: string) =>
    state.selectedTags[cat].has(tag);

  const handleQuickClick = (cat: TagCategory, tag: string) => {
    filter.toggleTag(cat, tag);
  };

  // === Precompute all chip counts once per (state, monsters) change ===
  // Without this, each render does ~500 projectedCount calls (per-chip + sort
  // comparator). At 3781 monsters that's ~2M ops per render and freezes the
  // browser in EncounterBuilder where many independent state hooks force
  // frequent re-renders. With this memo, expensive recomputation only fires
  // when the filter state or the monster list actually changes.
  const projectedCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const cat of ["primary", "modifier", "subtype"] as const) {
      for (const tag of ALL_TAGS_BY_CAT[cat]) {
        m.set(`tag-${cat}:${tag}`, projectedCount(state, monstersStable, `tag-${cat}` as const, tag));
      }
    }
    for (const sz of ["tiny","small","medium","large","huge","gargantuan"]) {
      m.set(`size:${sz}`, projectedCount(state, monstersStable, "size", sz));
    }
    for (const fq of ["very rare","rare","uncommon","common"]) {
      m.set(`freq:${fq}`, projectedCount(state, monstersStable, "freq", fq));
    }
    for (const h of habitats) {
      m.set(`habitat:${h}`, projectedCount(state, monstersStable, "habitat", h));
    }
    return m;
  }, [state, monstersStable, habitats]);

  // === Selected filter chips for the "active filters" summary ===
  const selectedList: Array<{ kind: string; value: string }> = [];
  for (const cat of ["primary", "modifier", "subtype"] as const)
    for (const t of state.selectedTags[cat]) selectedList.push({ kind: cat, value: t });
  for (const s of state.selectedSizes) selectedList.push({ kind: "size", value: s });
  for (const f of state.selectedFreqs) selectedList.push({ kind: "freq", value: f });
  for (const h of state.selectedHabitats) selectedList.push({ kind: "habitat", value: h });

  // === Render section helper ===
  function renderTagSection(label: string, cat: TagCategory) {
    const tags = ALL_TAGS_BY_CAT[cat];
    const isOpen = openSections.has(label);
    const logic = state.logic[cat];

    // Sort by precomputed projected count (O(1) Map lookups instead of running
    // filterMonsters inside every comparator pair).
    const sorted = [...tags].sort((a, b) => {
      const aSel = state.selectedTags[cat].has(a);
      const bSel = state.selectedTags[cat].has(b);
      if (aSel !== bSel) return aSel ? -1 : 1;
      const aCount = projectedCounts.get(`tag-${cat}:${a}`) ?? 0;
      const bCount = projectedCounts.get(`tag-${cat}:${b}`) ?? 0;
      return bCount - aCount;
    });

    return (
      <div className={`${styles.section} ${isOpen ? styles.open : ""}`} key={label}>
        <div className={styles.sectionHead}>
          <span
            className={styles.caret}
            onClick={() => toggleSection(label)}
            role="button"
            aria-label={`Toggle ${label}`}
          >
            ▸
          </span>
          <span className={styles.sectionName} onClick={() => toggleSection(label)}>
            {label}
          </span>
          <div className={styles.miniLogic}>
            <button
              className={logic === "and" ? styles.active : ""}
              onClick={() => filter.setLogic(cat, "and")}
            >
              AND
            </button>
            <button
              className={logic === "or" ? styles.active : ""}
              onClick={() => filter.setLogic(cat, "or")}
            >
              OR
            </button>
          </div>
        </div>
        {isOpen && (
          <div className={styles.sectionBody}>
            <div className={styles.tagGrid}>
              {sorted.map((tag) => {
                const count = projectedCounts.get(`tag-${cat}:${tag}`) ?? 0;
                const selected = state.selectedTags[cat].has(tag);
                const zero = count === 0 && !selected;
                return (
                  <button
                    key={tag}
                    className={`${styles.tagChip} ${selected ? styles.selected : ""} ${zero ? styles.zero : ""}`}
                    onClick={() => filter.toggleTag(cat, tag)}
                    disabled={zero}
                  >
                    {tag} <span className={styles.count}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderStructuredSection(
    label: string,
    values: string[],
    selected: Set<string>,
    toggle: (v: string) => void,
    projectionKind: "size" | "freq" | "habitat",
    normalize?: (v: string) => string
  ) {
    const isOpen = openSections.has(label);
    return (
      <div className={`${styles.section} ${isOpen ? styles.open : ""}`} key={label}>
        <div className={styles.sectionHead}>
          <span
            className={styles.caret}
            onClick={() => toggleSection(label)}
            role="button"
            aria-label={`Toggle ${label}`}
          >
            ▸
          </span>
          <span className={styles.sectionName} onClick={() => toggleSection(label)}>
            {label}
          </span>
        </div>
        {isOpen && (
          <div className={styles.sectionBody}>
            <div className={styles.tagGrid}>
              {values.map((v) => {
                const count = projectedCounts.get(`${projectionKind}:${normalize ? normalize(v) : v}`)
                  ?? projectedCounts.get(`${projectionKind}:${v}`)
                  ?? 0;
                const isSelected = selected.has(v);
                const zero = count === 0 && !isSelected;
                return (
                  <button
                    key={v}
                    className={`${styles.tagChip} ${isSelected ? styles.selected : ""} ${zero ? styles.zero : ""}`}
                    onClick={() => toggle(v)}
                    disabled={zero}
                  >
                    {normalize ? normalize(v) : v} <span className={styles.count}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // === Modal cloud ===
  const modalTagList = useMemo(() => {
    const all: Array<{ cat: TagCategory; tag: string }> = [];
    for (const cat of ["primary", "modifier", "subtype"] as const) {
      for (const t of ALL_TAGS_BY_CAT[cat]) {
        if (!state.selectedTags[cat].has(t)) all.push({ cat, tag: t });
      }
    }
    const q = modalSearch.toLowerCase().trim();
    return q ? all.filter((x) => x.tag.includes(q)) : all;
  }, [state.selectedTags, modalSearch]);

  return (
    <aside className={styles.panel}>
      {/* === Selected summary === */}
      <div className={styles.selectedBar}>
        {selectedList.length === 0 ? (
          <span className={styles.emptyHint}>No filters selected</span>
        ) : (
          <>
            <span className={styles.label}>Active:</span>
            {selectedList.map(({ kind, value }) => (
              <button
                key={`${kind}-${value}`}
                className={`${styles.tagChip} ${styles.selected}`}
                onClick={() => filter.removeFilter(kind as any, value)}
                title={`Remove ${value}`}
              >
                {value} <span className={styles.count}>×</span>
              </button>
            ))}
            <button className={styles.clearAll} onClick={filter.clearAll}>
              clear all
            </button>
          </>
        )}
      </div>

      {/* === Search === */}
      <div className={styles.searchRow}>
        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search name, tag, alignment…"
          value={state.search}
          onChange={(e) => filter.setSearch(e.target.value)}
        />
        {state.search && (
          <button
            className={styles.clearSearch}
            onClick={() => filter.setSearch("")}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {/* === Quick filters === */}
      <div className={styles.panelTitle}>Quick filters</div>
      <div className={styles.quickRow}>
        {CONFIG.quickFilters.map((qf) => (
          <button
            key={qf.tag}
            className={`${styles.quickFilter} ${isQuickActive(qf.category, qf.tag) ? styles.active : ""}`}
            onClick={() => handleQuickClick(qf.category, qf.tag)}
          >
            {qf.label}
          </button>
        ))}
      </div>

      {/* === Tag sections === */}
      <div className={styles.panelTitle}>Tag filters</div>
      {renderTagSection("Primary Type", "primary")}
      {renderTagSection("Modifiers", "modifier")}
      {renderTagSection("Subtype", "subtype")}

      <button className={styles.customBtn} onClick={() => setModalOpen(true)}>
        🔍 Custom / search all tags…
      </button>

      {/* === Structured filters === */}
      <div className={styles.panelTitle}>Other filters</div>
      {renderStructuredSection("Size", CONFIG.structuredFilters.sizes, state.selectedSizes, filter.toggleSize, "size")}
      {renderStructuredSection("Frequency", CONFIG.structuredFilters.frequencies, state.selectedFreqs, filter.toggleFreq, "freq")}
      {renderStructuredSection("Habitat", habitats, state.selectedHabitats, filter.toggleHabitat, "habitat")}

      {/* === Custom-search modal === */}
      {modalOpen && (
        <div className={styles.modalOverlay} onClick={() => setModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h3>Search all tags</h3>
              <button onClick={() => setModalOpen(false)} aria-label="Close">✕</button>
            </div>
            <div className={styles.modalBody}>
              <input
                type="text"
                placeholder="Type to filter…"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                autoFocus
              />
              <div className={styles.modalCloud}>
                {modalTagList.length === 0 ? (
                  <div className={styles.empty}>No matching tags</div>
                ) : (
                  modalTagList.map(({ cat, tag }) => {
                    const count = projectedCounts.get(`tag-${cat}:${tag}`) ?? 0;
                    const zero = count === 0;
                    return (
                      <button
                        key={`${cat}-${tag}`}
                        className={`${styles.tagChip} ${zero ? styles.zero : ""}`}
                        onClick={() => {
                          filter.toggleTag(cat, tag);
                        }}
                        disabled={zero}
                      >
                        {tag} <span className={styles.count}>{count}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

// Re-export wrapped in React.memo. EncounterBuilder has many independent state
// hooks (party size, level, difficulty, terrain, encType, encName input typing,
// generation state). Without memo, each unrelated re-render cascaded into the
// panel and re-triggered the expensive projectedCounts computation. With memo,
// the panel only re-renders when monsters / onFilteredChange / storageKey change
// references — which is what we want.
export const TagFilterPanel = memo(TagFilterPanelInner);
