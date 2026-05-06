import { useState } from "react";
import {
  rollSave,
  SAVE_CATEGORIES,
} from "../../rules-engine/combat/savingThrows";
import type {
  SaveCategoryId,
  SaveRollResult,
  SaveTargets,
} from "../../rules-engine/combat/types";

interface Props {
  targets: SaveTargets;
  /** Optional flat modifier — racial, magic items, spells. Default 0. */
  modifier?: number;
  /** Called after a roll if you want to log it. */
  onRoll?: (result: SaveRollResult) => void;
}

const buttonBase: React.CSSProperties = {
  background: "rgba(60,40,20,0.4)",
  border: "1px solid var(--color-border, #4a3a1a)",
  color: "var(--color-text, #d8c89a)",
  padding: "0.2rem 0.4rem",
  borderRadius: "3px",
  cursor: "pointer",
  fontFamily: "inherit",
  fontSize: "0.7rem",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: "0.05rem",
  minWidth: "2.4rem",
};

export function SaveButtons({ targets, modifier = 0, onRoll }: Props) {
  const [last, setLast] = useState<SaveRollResult | null>(null);

  const handle = (cat: SaveCategoryId) => {
    const result = rollSave(targets, cat, { modifier });
    setLast(result);
    onRoll?.(result);
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "0.3rem",
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <span
        style={{
          fontSize: "0.65rem",
          color: "var(--color-muted, #888)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        Save:
      </span>
      {SAVE_CATEGORIES.map((cat) => (
        <button
          key={cat.id}
          type="button"
          onClick={() => handle(cat.id)}
          title={`${cat.label} — target ${targets[cat.id]}`}
          style={buttonBase}
        >
          <span style={{ fontWeight: 600 }}>{cat.short}</span>
          <span style={{ fontFamily: "monospace", fontSize: "0.65rem", opacity: 0.7 }}>
            {targets[cat.id]}
          </span>
        </button>
      ))}
      {last && (
        <span
          style={{
            marginLeft: "0.4rem",
            padding: "0.15rem 0.5rem",
            borderRadius: "3px",
            fontSize: "0.7rem",
            fontFamily: "monospace",
            background: last.success ? "rgba(50,180,80,0.18)" : "rgba(220,80,60,0.18)",
            border: `1px solid ${last.success ? "#5be080" : "#e07060"}`,
            color: last.success ? "#9fe8a0" : "#f0a090",
          }}
          title={`d20=${last.roll}${last.modifier ? ` ${last.modifier >= 0 ? "+" : ""}${last.modifier}` : ""} vs ${last.target}`}
        >
          {SAVE_CATEGORIES.find((c) => c.id === last.category)?.short}: {last.total}{" "}
          {last.natural20 ? "★" : last.natural1 ? "✗" : ""}{" "}
          {last.success ? "✓ pass" : "✗ fail"}
        </span>
      )}
    </div>
  );
}
