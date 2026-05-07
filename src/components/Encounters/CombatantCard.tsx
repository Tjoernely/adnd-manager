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
import {
  computeSaveTargets,
  hdToFighterLevel,
} from "../../rules-engine/combat/savingThrows";
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

/**
 * Derive saving-throw targets from a monster's hit_dice when no stored saves
 * exist on the combatant. This is the standard 2E rule (PHB Ch.9):
 * monsters without class levels save as a fighter of level = HD.
 *
 * Returns null when there's no usable HD signal at all — in which case
 * SaveButtons stays hidden as before. Tagged so the UI can show a "generic"
 * hint distinguishing derived-from-HD targets from authoritative stored ones.
 */
function deriveGenericSaves(monster: MonsterLikeStats | null | undefined):
  | { targets: SaveTargets; hdLabel: string }
  | null
{
  const hd = monster?.hit_dice;
  if (hd === undefined || hd === null || hd === "") return null;
  const level = hdToFighterLevel(hd);
  return {
    targets: computeSaveTargets("monster", level),
    hdLabel: String(hd),
  };
}

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

  // Save-target resolution: stored on the combatant takes precedence
  // (server-computed at encounter creation). When missing — common for
  // creatures spawned before v1, or where the DB lacked enough info —
  // derive from the fetched monster's HD using the standard 2E rule.
  // We expose `derivedSaves` so the UI can flag the result as "generic".
  const derivedSaves =
    !combatant.saveTargets && fetched ? deriveGenericSaves(fetched) : null;
  const saveTargetsToShow: SaveTargets | undefined =
    combatant.saveTargets ?? derivedSaves?.targets;

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

      {/* Saves row — uses stored saveTargets when present, falls back to
          HD-derived "generic" saves on the fetched monster. */}
      {saveTargetsToShow && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
          {derivedSaves && (
            <span
              title="No save data stored for this combatant. Targets are derived from the monster's HD using the standard 2E rule (save as fighter of level = HD)."
              style={{
                fontSize: "0.65rem",
                fontStyle: "italic",
                color: "var(--color-muted, #b8a070)",
                opacity: 0.85,
              }}
            >
              ⓘ Generic — derived from HD {derivedSaves.hdLabel}
            </span>
          )}
          <SaveButtons
            targets={saveTargetsToShow}
            modifier={combatant.saveModifier ?? 0}
            onRoll={onLogSave}
          />
        </div>
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
