/**
 * V3 CombatantCardExtensions — lazy-loads the FULL monster from /api/monsters/:id
 * the first time the statblock is rendered.
 *
 * Why: combatants in saved encounters only carry a small subset of stats
 * (ac, thac0, attacks, damage). The rich fields — special_attacks, magic_resistance,
 * description, wiki_url — must be fetched by monster_id.
 *
 * Use the new prop `monsterId` instead of (or alongside) `monster`. If both are
 * passed, the fetched monster is preferred for the statblock display while the
 * row stats keep using whatever you already pass.
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
import { useFullMonster } from "./useFullMonster";

interface CombatantSlice {
  conditions?: AppliedCondition[];
  saveTargets?: SaveTargets;
  saveModifier?: number;
  customAbilities?: CustomAbility[];
}

interface Props {
  /** PREFERRED: numeric monster_id from the combatant. Triggers lazy fetch. */
  monsterId?: number | null;
  /** Optional fallback / pre-loaded monster — used while fetch is in flight. */
  monster?: MonsterLikeStats;
  combatant: CombatantSlice;
  currentRound: number;
  onUpdate: (patch: Partial<CombatantSlice>) => void;
  onLogSave?: (result: SaveRollResult) => void;
}

export function CombatantCardExtensions({
  monsterId,
  monster: monsterProp,
  combatant,
  currentRound,
  onUpdate,
  onLogSave,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const { monster: fetched, loading } = useFullMonster(monsterId ?? null);

  // Prefer fetched (rich) over passed-in (sparse), fall back to whatever exists
  const effectiveMonster: MonsterLikeStats = (fetched ?? monsterProp ?? {}) as MonsterLikeStats;

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
          onRemove={(cid) =>
            onUpdate({ conditions: removeCondition(combatant.conditions, cid) })
          }
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

      {/* Statblock — uses lazy-loaded full monster */}
      {loading && !fetched ? (
        <div
          style={{
            fontSize: "0.7rem",
            color: "var(--color-muted, #888)",
            padding: "0.2rem 0",
          }}
        >
          Loading statblock…
        </div>
      ) : (
        <InlineStatblock
          monster={effectiveMonster}
          saveTargets={combatant.saveTargets}
          customAbilities={combatant.customAbilities}
          onCustomAbilitiesChange={(next) => onUpdate({ customAbilities: next })}
        />
      )}

      <ConditionPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onApply={(cid, dur) =>
          onUpdate({
            conditions: applyCondition(combatant.conditions, cid, currentRound, {
              duration: dur,
            }),
          })
        }
      />
    </div>
  );
}
