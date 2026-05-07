import { useState } from "react";
import { SpellModal } from "./SpellModal";

interface Props {
  /** Display text — usually the same as the spell name but allows variants like "Cone of Cold*" */
  children: React.ReactNode;
  /** Canonical spell name to look up. */
  spellName: string;
  /** Visual style — "pill" stands out, "underline" is subtle inline. Default: "underline". */
  variant?: "pill" | "underline";
}

export function SpellLink({ children, spellName, variant = "underline" }: Props) {
  const [open, setOpen] = useState(false);

  const baseStyle: React.CSSProperties =
    variant === "pill"
      ? {
          display: "inline-block",
          padding: "0.05rem 0.45rem",
          background: "rgba(150, 110, 220, 0.15)",
          border: "1px solid rgba(150, 110, 220, 0.5)",
          borderRadius: "10px",
          color: "#c8a8f0",
          fontSize: "0.85em",
          cursor: "pointer",
          margin: "0 0.1rem",
        }
      : {
          color: "#c8a8f0",
          textDecoration: "underline",
          textDecorationStyle: "dotted",
          textUnderlineOffset: "2px",
          cursor: "pointer",
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
        };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`View ${spellName}`}
        style={baseStyle}
      >
        {children ?? spellName}
      </button>
      <SpellModal
        open={open}
        spellName={spellName}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
