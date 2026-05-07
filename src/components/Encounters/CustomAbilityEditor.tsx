import { useState } from "react";
import { findSpellMentions } from "../../rules-engine/monsters/parseAbilities";
import { SpellLink } from "./SpellLink";

/**
 * Some monsters (like Beholder-kin Overseer) don't have full spell lists in their
 * `description` field. The DM can add custom abilities here — they're stored on
 * the combatant and persisted with the encounter.
 */

export interface CustomAbility {
  id: string;
  /** Free-text label (e.g. "Eye Stalk: Cone of Cold (14th level)") */
  label: string;
  /** Spell name for one-click lookup, optional */
  spellName?: string;
  /** Recharge / per-day / at-will, optional */
  uses?: string;
}

interface Props {
  abilities: CustomAbility[];
  onChange: (next: CustomAbility[]) => void;
}

const newId = () => Math.random().toString(36).slice(2, 9);

export function CustomAbilityEditor({ abilities, onChange }: Props) {
  const [newLabel, setNewLabel] = useState("");
  const [newUses, setNewUses] = useState("");

  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    // Auto-detect a spell name if mentioned
    const matches = findSpellMentions(label);
    const ability: CustomAbility = {
      id: newId(),
      label,
      uses: newUses.trim() || undefined,
      spellName: matches[0]?.spellName,
    };
    onChange([...abilities, ability]);
    setNewLabel("");
    setNewUses("");
  };

  const remove = (id: string) => {
    onChange(abilities.filter((a) => a.id !== id));
  };

  return (
    <div
      style={{
        marginTop: "0.6rem",
        padding: "0.6rem 0.8rem",
        background: "rgba(40, 30, 15, 0.4)",
        border: "1px dashed var(--color-border, #4a3a1a)",
        borderRadius: "4px",
      }}
    >
      <div
        style={{
          fontSize: "0.7rem",
          color: "var(--color-muted, #b8a070)",
          letterSpacing: "0.05em",
          textTransform: "uppercase",
          marginBottom: "0.4rem",
        }}
      >
        Custom abilities
      </div>

      {abilities.length > 0 && (
        <ul
          style={{
            margin: "0 0 0.5rem 0",
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: "0.25rem",
          }}
        >
          {abilities.map((a) => (
            <li
              key={a.id}
              style={{
                display: "flex",
                gap: "0.5rem",
                alignItems: "baseline",
                fontSize: "0.8rem",
              }}
            >
              <span style={{ flex: 1 }}>
                {a.spellName ? (
                  <SpellLink spellName={a.spellName} variant="underline">
                    {a.label}
                  </SpellLink>
                ) : (
                  a.label
                )}
                {a.uses && (
                  <span style={{ marginLeft: "0.4rem", opacity: 0.6, fontSize: "0.85em" }}>
                    ({a.uses})
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={() => remove(a.id)}
                title="Remove"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-muted, #888)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: "0 0.2rem",
                }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="e.g. Eye Stalk: Cone of Cold"
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{
            flex: 1,
            minWidth: "12rem",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid var(--color-border, #4a3a1a)",
            color: "inherit",
            padding: "0.25rem 0.5rem",
            borderRadius: "3px",
            fontSize: "0.8rem",
          }}
        />
        <input
          value={newUses}
          onChange={(e) => setNewUses(e.target.value)}
          placeholder="uses (opt.)"
          onKeyDown={(e) => e.key === "Enter" && add()}
          style={{
            width: "7rem",
            background: "rgba(0,0,0,0.4)",
            border: "1px solid var(--color-border, #4a3a1a)",
            color: "inherit",
            padding: "0.25rem 0.5rem",
            borderRadius: "3px",
            fontSize: "0.8rem",
          }}
        />
        <button
          type="button"
          onClick={add}
          disabled={!newLabel.trim()}
          style={{
            background: newLabel.trim() ? "var(--color-accent, #c89030)" : "rgba(100,80,40,0.3)",
            border: "1px solid var(--color-accent, #c89030)",
            color: newLabel.trim() ? "#1a1408" : "rgba(255,255,255,0.4)",
            padding: "0.25rem 0.7rem",
            borderRadius: "3px",
            cursor: newLabel.trim() ? "pointer" : "not-allowed",
            fontSize: "0.8rem",
            fontWeight: 600,
          }}
        >
          + add
        </button>
      </div>
    </div>
  );
}
