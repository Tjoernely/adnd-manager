import {
  formatXp,
  getXpBudget,
  type Difficulty,
} from "./xpThresholds";
import { useXpRangeState } from "./useXpRangeState";

interface Props {
  /** Current difficulty selection (used for default values + showing target XP). */
  difficulty: Difficulty;
  partySize: number;
  partyLevel: number;
  /**
   * Called whenever effective range changes. The generator uses this to decide
   * which XP target to aim for.
   *
   * - When custom is ON  → returns the custom min/max
   * - When custom is OFF → returns the difficulty's computed range
   */
  onRangeChange?: (effective: { min: number; max: number; source: "custom" | "difficulty" }) => void;
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    marginTop: "0.5rem",
  },
  toggleRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.5rem",
  },
  toggleBtn: {
    background: "transparent",
    border: "1px solid var(--color-border, #4a3a1a)",
    color: "var(--color-muted, #b8a070)",
    padding: "0.3rem 0.6rem",
    borderRadius: "4px",
    cursor: "pointer",
    fontFamily: "inherit",
    fontSize: "0.78rem",
    display: "inline-flex",
    alignItems: "center",
    gap: "0.3rem",
  },
  toggleBtnActive: {
    background: "rgba(212,168,80,0.18)",
    border: "1px solid var(--color-accent, #d4a850)",
    color: "var(--color-accent, #d4a850)",
  },
  caret: {
    display: "inline-block",
    transition: "transform 0.15s",
    fontSize: "0.7em",
  },
  caretOpen: {
    transform: "rotate(90deg)",
  },
  target: {
    fontSize: "0.78rem",
    color: "var(--color-muted, #b8a070)",
    marginLeft: "auto",
  },
  targetValue: {
    color: "var(--color-accent, #d4a850)",
    fontFamily: "monospace",
  },
  panel: {
    marginTop: "0.5rem",
    padding: "0.7rem 0.9rem",
    background: "rgba(0,0,0,0.25)",
    border: "1px solid var(--color-border-2, #3a2a0a)",
    borderRadius: "4px",
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: "0.7rem",
    flexWrap: "wrap",
  },
  field: {
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  label: {
    fontSize: "0.65rem",
    color: "var(--color-muted, #b8a070)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
  input: {
    background: "rgba(0,0,0,0.4)",
    border: "1px solid var(--color-border, #4a3a1a)",
    color: "inherit",
    padding: "0.35rem 0.6rem",
    borderRadius: "4px",
    fontFamily: "monospace",
    fontSize: "0.9rem",
    width: "100px",
  },
  hint: {
    marginTop: "0.5rem",
    fontSize: "0.72rem",
    color: "var(--color-muted-2, #888)",
    fontStyle: "italic",
  },
  warning: {
    marginTop: "0.5rem",
    fontSize: "0.72rem",
    color: "#e07060",
  },
};

export function XpRangePanel({
  difficulty,
  partySize,
  partyLevel,
  onRangeChange,
}: Props) {
  const { range, setEnabled, setMin, setMax, isValid } = useXpRangeState();

  // Compute the Difficulty-based range
  const diffBudget = getXpBudget(difficulty, partySize, partyLevel);

  // The effective range that the generator should use
  const effective = range.enabled && isValid
    ? { min: range.min, max: range.max, source: "custom" as const }
    : { min: diffBudget.min, max: diffBudget.max, source: "difficulty" as const };

  // Notify parent on any change
  // Note: this is fine to call on every render — parent should memoize handling
  if (onRangeChange) {
    // Call inside an effect-like guard by using a stable comparison via JSON
    // (parent is expected to be cheap; the alternative is useEffect, but that
    // delays the notification by one render which makes "Generate" race-prone).
    onRangeChange(effective);
  }

  return (
    <div style={styles.wrapper}>
      <div style={styles.toggleRow}>
        <button
          type="button"
          style={range.enabled ? { ...styles.toggleBtn, ...styles.toggleBtnActive } : styles.toggleBtn}
          onClick={() => setEnabled(!range.enabled)}
          aria-expanded={range.enabled}
        >
          <span style={range.enabled ? { ...styles.caret, ...styles.caretOpen } : styles.caret}>▸</span>
          Custom XP range
        </button>
        <div style={styles.target}>
          Target:{" "}
          <span style={styles.targetValue}>
            {formatXp(effective.min)}–{formatXp(effective.max)} XP
          </span>{" "}
          <span style={{ opacity: 0.7 }}>
            ({effective.source === "custom" ? "custom" : difficulty})
          </span>
        </div>
      </div>

      {range.enabled && (
        <div style={styles.panel}>
          <div style={styles.inputRow}>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="xp-min">Min XP</label>
              <input
                id="xp-min"
                type="number"
                min={0}
                step={100}
                value={range.min}
                onChange={(e) => setMin(parseInt(e.target.value, 10) || 0)}
                style={styles.input}
              />
            </div>
            <div style={styles.field}>
              <label style={styles.label} htmlFor="xp-max">Max XP</label>
              <input
                id="xp-max"
                type="number"
                min={0}
                step={100}
                value={range.max}
                onChange={(e) => setMax(parseInt(e.target.value, 10) || 0)}
                style={styles.input}
              />
            </div>
          </div>
          {!isValid && (
            <div style={styles.warning}>
              ⚠ Min must be greater than 0 and Max must be ≥ Min. Falling back to Difficulty.
            </div>
          )}
          <div style={styles.hint}>
            Custom range overrides Difficulty. The generator will aim to hit this XP window;
            if it can't be matched, you'll see "Couldn't reach target — closest was X XP".
          </div>
        </div>
      )}
    </div>
  );
}
