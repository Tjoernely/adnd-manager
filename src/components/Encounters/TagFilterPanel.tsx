import { useMemo, useState } from "react";
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

export function TagFilterPanel({ storageKey, monsters, onFilteredChange }: Props) {
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

  // === Compute filtered list ===
  // (Was `require()` in the shipped component — replaced with ES import at the
  // top of the file; CJS require isn't available in Vite's browser bundle.)
  const filtered = useMemo(() => filterMonsters(state, monsters), [state, monsters]);

  // Propagate up
  useMemo(() => {
    onFilteredChange(filtered);
  }, [filtered, onFilteredChange]);

  const habitats = useMemo(() => extractHabitats(monsters), [monsters]);

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

    // Sort by projected count desc, but keep selected at top
    const sorted = [...tags].sort((a, b) => {
      const aSel = state.selectedTags[cat].has(a);
      const bSel = state.selectedTags[cat].has(b);
      if (aSel !== bSel) return aSel ? -1 : 1;
      const aCount = projectedCount(state, monsters, `tag-${cat}` as const, a);
      const bCount = projectedCount(state, monsters, `tag-${cat}` as const, b);
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
                const count = projectedCount(state, monsters, `tag-${cat}` as const, tag);
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
                const count = projectedCount(state, monsters, projectionKind, v);
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
                    const count = projectedCount(state, monsters, `tag-${cat}` as const, tag);
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
