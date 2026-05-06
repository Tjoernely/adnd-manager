/**
 * CombatantCard — example showing how to wire the 4 new features into your existing
 * combatant row. Your current card already renders name, HP bar, AC, THAC0, Atk, Dmg,
 * and the +/-/skull buttons. Below is a drop-in addition you can paste into the bottom
 * of that card (or merge directly).
 *
 * NOTE: The exact prop names depend on your existing types. The relevant additions:
 *   - props.monster:        the full monster from /api/monsters/:id (for InlineStatblock)
 *   - props.combatant:      your combatant — must include conditions[] and saveTargets
 *   - props.currentRound:   from the encounter state
 *   - props.onUpdate:       a function that updates this combatant in encounter state
 *
 * If you keep encounter state in a parent (likely), pass an updater down the tree.
 */
import { useState } from "react";
import {
  applyCondition,
  removeCondition,
} from "../../rules-engine/combat/conditions";
import type {
  AppliedCondition,
  SaveRollResult,
  SaveTargets,
} from "../../rules-engine/combat/types";
import { ConditionBadges } from "./ConditionBadges";
import { ConditionPicker } from "./ConditionPicker";
import { InlineStatblock, type MonsterLikeStats } from "./InlineStatblock";
import { SaveButtons } from "./SaveButtons";

interface CombatantSlice {
  conditions?: AppliedCondition[];
  saveTargets?: SaveTargets;
  saveModifier?: number;
}

interface Props {
  monster: MonsterLikeStats;
  combatant: CombatantSlice;
  currentRound: number;
  onUpdate: (patch: Partial<CombatantSlice>) => void;
  onLogSave?: (result: SaveRollResult) => void;
}

export function CombatantCardExtensions({
  monster,
  combatant,
  currentRound,
  onUpdate,
  onLogSave,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleApply = (conditionId: string, durationOverride: number | null) => {
    const next = applyCondition(combatant.conditions, conditionId, currentRound, {
      duration: durationOverride,
    });
    onUpdate({ conditions: next });
  };

  const handleRemove = (conditionId: string) => {
    onUpdate({ conditions: removeCondition(combatant.conditions, conditionId) });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
      {/* Conditions row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          style={{
            background: "transparent",
            border: "1px dashed var(--color-border, #4a3a1a)",
            color: "var(--color-muted, #b8a070)",
            padding: "0.15rem 0.5rem",
            fontSize: "0.7rem",
            borderRadius: "10px",
            cursor: "pointer",
          }}
        >
          + condition
        </button>
        <ConditionBadges
          conditions={combatant.conditions ?? []}
          onRemove={handleRemove}
        />
      </div>

      {/* Saves row */}
      {combatant.saveTargets && (
        <SaveButtons
          targets={combatant.saveTargets}
          modifier={combatant.saveModifier ?? 0}
          onRoll={onLogSave}
        />
      )}

      {/* Statblock toggle */}
      <InlineStatblock monster={monster} saveTargets={combatant.saveTargets} />

      <ConditionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onApply={handleApply}
      />
    </div>
  );
}
