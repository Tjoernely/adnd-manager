/**
 * RoundControls — drop-in replacement for your existing Round controls
 * (the bar with "◀ Prev / Round N / Next Round ▶").
 *
 * Adds:
 *  - Per-round initiative re-roll on Next Round (2E RAW)
 *  - End-of-round condition tick (decrements all roundsRemaining)
 *  - Optional "Lock initiative" toggle to disable re-roll (house rule)
 */
import { useState } from "react";
import { rollInitiative, type InitInput, type InitResult } from "../../rules-engine/combat/initiative";
import { tickConditions } from "../../rules-engine/combat/conditions";
import type { AppliedCondition } from "../../rules-engine/combat/types";

export interface RoundCombatant {
  id: string | number;
  name: string;
  initModifier?: number;
  conditions?: AppliedCondition[];
}

interface Props {
  round: number;
  combatants: RoundCombatant[];
  onPrev: () => void;
  /**
   * Called with the new round number, the rolled initiatives (one per combatant),
   * and the new conditions arrays (already ticked).
   * Wire this to update your encounter state in one go.
   */
  onNext: (
    nextRound: number,
    payload: {
      initiatives: InitResult[];
      tickedConditions: Record<string | number, AppliedCondition[]>;
    }
  ) => void;
  /** External lock state — pass through if you want it persisted with the encounter. */
  initLocked?: boolean;
  onToggleLock?: (locked: boolean) => void;
}

const btnBase: React.CSSProperties = {
  background: "rgba(60,40,20,0.4)",
  border: "1px solid var(--color-border, #4a3a1a)",
  color: "var(--color-text, #d8c89a)",
  padding: "0.35rem 0.8rem",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "inherit",
};

export function RoundControls({
  round,
  combatants,
  onPrev,
  onNext,
  initLocked: initLockedProp,
  onToggleLock,
}: Props) {
  const [internalLocked, setInternalLocked] = useState(false);
  const initLocked = initLockedProp ?? internalLocked;

  const handleNext = () => {
    const nextRound = round + 1;

    // Re-roll initiative for every combatant unless locked
    const initiatives: InitResult[] = initLocked
      ? combatants.map((c) => ({
          id: c.id,
          name: c.name,
          roll: 0,
          modifier: c.initModifier ?? 0,
          total: 0, // caller can ignore when locked
        }))
      : rollInitiative(
          combatants.map<InitInput>((c) => ({
            id: c.id,
            name: c.name,
            modifier: c.initModifier ?? 0,
          }))
        );

    // Tick conditions per combatant
    const tickedConditions: Record<string | number, AppliedCondition[]> = {};
    for (const c of combatants) {
      tickedConditions[c.id] = tickConditions(c.conditions);
    }

    onNext(nextRound, { initiatives, tickedConditions });
  };

  const toggleLock = () => {
    const next = !initLocked;
    if (onToggleLock) onToggleLock(next);
    else setInternalLocked(next);
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        flexWrap: "wrap",
      }}
    >
      <button
        type="button"
        onClick={onPrev}
        disabled={round <= 1}
        style={{ ...btnBase, opacity: round <= 1 ? 0.4 : 1 }}
      >
        ◀ Prev
      </button>
      <span style={{ fontSize: "1.1rem", fontWeight: 600, padding: "0 0.4rem" }}>
        Round {round}
      </span>
      <button type="button" onClick={handleNext} style={{ ...btnBase, fontWeight: 600 }}>
        Next Round ▶
      </button>

      <label
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          fontSize: "0.75rem",
          color: "var(--color-muted, #888)",
          marginLeft: "0.5rem",
          cursor: "pointer",
        }}
        title="When unlocked, every combatant rolls 1d10 + modifier each round (2E RAW). When locked, initiative carries over (common house rule)."
      >
        <input
          type="checkbox"
          checked={initLocked}
          onChange={toggleLock}
          style={{ accentColor: "var(--color-accent, #c89030)" }}
        />
        Lock init
      </label>
    </div>
  );
}
