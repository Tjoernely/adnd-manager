/**
 * UPDATED CombatantCardExtensions — adds customAbilities pass-through.
 *
 * The combatant slice now has an optional `customAbilities` field that gets
 * persisted with the encounter so DM-added Eye Stalk powers etc. survive saves.
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
import {
  InlineStatblock,
  type MonsterLikeStats,
  type CustomAbility,
} from "./InlineStatblock";
import { SaveButtons } from "./SaveButtons";

interface CombatantSlice {
  conditions?: AppliedCondition[];
  saveTargets?: SaveTargets;
  saveModifier?: number;
  customAbilities?: CustomAbility[];
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
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          flexWrap: "wrap",
        }}
      >
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

      {/* Statblock toggle (now richer + with custom-abilities editor) */}
      <InlineStatblock
        monster={monster}
        saveTargets={combatant.saveTargets}
        customAbilities={combatant.customAbilities}
        onCustomAbilitiesChange={(next) => onUpdate({ customAbilities: next })}
      />

      <ConditionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onApply={handleApply}
      />
    </div>
  );
}
