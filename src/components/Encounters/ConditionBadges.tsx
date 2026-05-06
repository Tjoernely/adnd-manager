import type { AppliedCondition } from "../../rules-engine/combat/types";
import { describeCondition, getConditionDef } from "../../rules-engine/combat/conditions";

interface Props {
  conditions: AppliedCondition[];
  onRemove?: (conditionId: string) => void;
}

export function ConditionBadges({ conditions, onRemove }: Props) {
  if (!conditions || conditions.length === 0) return null;

  return (
    <div
      style={{
        display: "flex",
        gap: "0.3rem",
        flexWrap: "wrap",
        marginTop: "0.25rem",
      }}
    >
      {conditions.map((c) => {
        const def = getConditionDef(c.conditionId);
        if (!def) return null;
        return (
          <button
            key={c.conditionId}
            type="button"
            title={`${describeCondition(c)} — ${def.description}${onRemove ? "\n\n(click to remove)" : ""}`}
            onClick={() => onRemove?.(c.conditionId)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.2rem",
              padding: "0.1rem 0.4rem",
              fontSize: "0.7rem",
              background: `${def.color}22`,
              border: `1px solid ${def.color}66`,
              borderRadius: "10px",
              color: def.color,
              cursor: onRemove ? "pointer" : "default",
              fontFamily: "inherit",
            }}
          >
            <span style={{ fontSize: "0.85em" }}>{def.icon}</span>
            <span>{def.name}</span>
            {c.roundsRemaining !== null && (
              <span style={{ opacity: 0.8, fontFamily: "monospace" }}>
                {c.roundsRemaining}r
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
