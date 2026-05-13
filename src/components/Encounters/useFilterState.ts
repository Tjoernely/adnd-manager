import { useCallback, useEffect, useRef, useState } from "react";
import {
  deserializeState,
  emptyState,
  serializeState,
} from "../../rules-engine/monsters/filterEngine";
import type {
  FilterState,
  LogicMode,
  SerializedFilterState,
  TagCategory,
} from "./filterTypes";

/**
 * React hook managing the filter state for a single instance of the filter
 * panel. State is persisted to sessionStorage under the given key so it
 * survives page navigation within the same tab.
 *
 * Two separate panels (Library, Generator) get two separate storage keys and
 * therefore independent state.
 */
export function useFilterState(
  storageKey: string,
  defaultLogic: { primary: LogicMode; modifier: LogicMode; subtype: LogicMode }
) {
  const [state, setState] = useState<FilterState>(() => {
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SerializedFilterState;
        return deserializeState(parsed, defaultLogic);
      }
    } catch {
      /* ignore corrupt storage */
    }
    return emptyState(defaultLogic);
  });

  // Persist on change (debounced one tick)
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(serializeState(state)));
      } catch {
        /* ignore quota / disabled storage */
      }
    }, 50);
    return () => {
      if (persistTimer.current) clearTimeout(persistTimer.current);
    };
  }, [state, storageKey]);

  // === Mutators ===

  const setSearch = useCallback((q: string) => {
    setState((s) => ({ ...s, search: q }));
  }, []);

  const toggleTag = useCallback((category: TagCategory, tag: string) => {
    setState((s) => {
      const next = new Set(s.selectedTags[category]);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return {
        ...s,
        selectedTags: { ...s.selectedTags, [category]: next },
      };
    });
  }, []);

  const setLogic = useCallback((category: TagCategory, logic: LogicMode) => {
    setState((s) => ({ ...s, logic: { ...s.logic, [category]: logic } }));
  }, []);

  const toggleSize = useCallback((size: string) => {
    setState((s) => {
      const next = new Set(s.selectedSizes);
      if (next.has(size)) next.delete(size);
      else next.add(size);
      return { ...s, selectedSizes: next };
    });
  }, []);

  const toggleFreq = useCallback((freq: string) => {
    setState((s) => {
      const next = new Set(s.selectedFreqs);
      if (next.has(freq)) next.delete(freq);
      else next.add(freq);
      return { ...s, selectedFreqs: next };
    });
  }, []);

  const toggleHabitat = useCallback((habitat: string) => {
    setState((s) => {
      const next = new Set(s.selectedHabitats);
      if (next.has(habitat)) next.delete(habitat);
      else next.add(habitat);
      return { ...s, selectedHabitats: next };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState(emptyState(defaultLogic));
  }, [defaultLogic]);

  const removeFilter = useCallback(
    (kind: "primary" | "modifier" | "subtype" | "size" | "freq" | "habitat", value: string) => {
      setState((s) => {
        if (kind === "primary" || kind === "modifier" || kind === "subtype") {
          const next = new Set(s.selectedTags[kind]);
          next.delete(value);
          return { ...s, selectedTags: { ...s.selectedTags, [kind]: next } };
        }
        if (kind === "size") {
          const next = new Set(s.selectedSizes); next.delete(value);
          return { ...s, selectedSizes: next };
        }
        if (kind === "freq") {
          const next = new Set(s.selectedFreqs); next.delete(value);
          return { ...s, selectedFreqs: next };
        }
        if (kind === "habitat") {
          const next = new Set(s.selectedHabitats); next.delete(value);
          return { ...s, selectedHabitats: next };
        }
        return s;
      });
    },
    []
  );

  return {
    state,
    setSearch,
    toggleTag,
    setLogic,
    toggleSize,
    toggleFreq,
    toggleHabitat,
    clearAll,
    removeFilter,
  };
}
