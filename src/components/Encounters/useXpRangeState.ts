import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "adnd_custom_xp_range";

export interface CustomXpRange {
  /** Is the custom range active (overriding Difficulty)? */
  enabled: boolean;
  /** Minimum target XP for the encounter. */
  min: number;
  /** Maximum target XP for the encounter. */
  max: number;
}

const DEFAULT_RANGE: CustomXpRange = {
  enabled: false,
  min: 2000,
  max: 5000,
};

/**
 * Manages the Custom XP Range state for the Encounter Generator.
 *
 * Persists to sessionStorage so the values are remembered across navigation
 * within the tab. The `enabled` flag is also persisted — if the DM had
 * Custom mode active when they navigated away, it's still active when they
 * return.
 */
export function useXpRangeState() {
  const [range, setRange] = useState<CustomXpRange>(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<CustomXpRange>;
        return {
          enabled: !!parsed.enabled,
          min: typeof parsed.min === "number" ? parsed.min : DEFAULT_RANGE.min,
          max: typeof parsed.max === "number" ? parsed.max : DEFAULT_RANGE.max,
        };
      }
    } catch {
      /* ignore corrupt/disabled storage */
    }
    return DEFAULT_RANGE;
  });

  // Persist on change
  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(range));
    } catch {
      /* ignore quota / disabled */
    }
  }, [range]);

  const setEnabled = useCallback((enabled: boolean) => {
    setRange((r) => ({ ...r, enabled }));
  }, []);

  const setMin = useCallback((min: number) => {
    setRange((r) => ({ ...r, min: Math.max(0, Math.floor(min) || 0) }));
  }, []);

  const setMax = useCallback((max: number) => {
    setRange((r) => ({ ...r, max: Math.max(0, Math.floor(max) || 0) }));
  }, []);

  /** Are the current min/max sane? (min <= max, both positive) */
  const isValid = range.min > 0 && range.max >= range.min;

  return { range, setEnabled, setMin, setMax, isValid };
}
