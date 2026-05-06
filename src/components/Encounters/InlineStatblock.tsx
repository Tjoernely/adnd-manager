import { useState } from "react";

/**
 * Compact inline statblock for combat. Click "▾ stats" to expand.
 *
 * Pass the monster object (full statblock from /api/monsters/:id) — the component
 * shows what's available and gracefully omits empty fields.
 */
export interface MonsterLikeStats {
  hit_dice?: string | number;
  thac0?: number;
  armor_class?: number;
  movement?: string;
  no_appearing?: string;
  size?: string;
  alignment?: string;
  intelligence?: string;
  morale?: number;
  attacks?: string;
  damage?: string;
  special_attacks?: string;
  special_defenses?: string;
  magic_resistance?: string;
  save_as?: string | null;
  organization?: string;
  diet?: string;
  activity_cycle?: string;
  treasure_type?: string;
}

interface Props {
  monster: MonsterLikeStats;
  /** Pre-computed save targets (DPP / RSW / PP / BW / Sp) */
  saveTargets?: { death: number; wand: number; petrify: number; breath: number; spell: number };
  defaultOpen?: boolean;
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0.25rem 0.75rem",
  fontSize: "0.78rem",
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-muted, #888)",
  whiteSpace: "nowrap",
};

const valStyle: React.CSSProperties = {
  color: "var(--color-text, #d8c89a)",
  fontWeight: 500,
};

export function InlineStatblock({ monster, saveTargets, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  const has = (v: unknown) => v !== null && v !== undefined && v !== "" && v !== "Nil";

  return (
    <div style={{ marginTop: "0.4rem" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        style={{
          background: "transparent",
          border: "1px solid var(--color-border, #4a3a1a)",
          color: "var(--color-muted, #b8a070)",
          fontSize: "0.7rem",
          padding: "0.15rem 0.5rem",
          borderRadius: "4px",
          cursor: "pointer",
          letterSpacing: "0.05em",
        }}
      >
        {open ? "▾" : "▸"} {open ? "Hide" : "Show"} statblock
      </button>

      {open && (
        <div
          style={{
            marginTop: "0.4rem",
            padding: "0.6rem 0.8rem",
            background: "rgba(40, 30, 15, 0.4)",
            border: "1px solid var(--color-border, #3a2a0a)",
            borderRadius: "4px",
            ...fieldStyle,
          }}
        >
          {has(monster.hit_dice) && (
            <>
              <span style={labelStyle}>HD</span>
              <span style={valStyle}>{monster.hit_dice}</span>
            </>
          )}
          {has(monster.thac0) && (
            <>
              <span style={labelStyle}>THAC0</span>
              <span style={valStyle}>{monster.thac0}</span>
            </>
          )}
          {has(monster.armor_class) && (
            <>
              <span style={labelStyle}>AC</span>
              <span style={valStyle}>{monster.armor_class}</span>
            </>
          )}
          {has(monster.movement) && (
            <>
              <span style={labelStyle}>MV</span>
              <span style={valStyle}>{monster.movement}</span>
            </>
          )}
          {has(monster.attacks) && (
            <>
              <span style={labelStyle}>Attacks</span>
              <span style={valStyle}>{monster.attacks}</span>
            </>
          )}
          {has(monster.damage) && (
            <>
              <span style={labelStyle}>Damage</span>
              <span style={valStyle}>{monster.damage}</span>
            </>
          )}
          {has(monster.special_attacks) && (
            <>
              <span style={labelStyle}>Sp. Atk</span>
              <span style={{ ...valStyle, color: "#e89060" }}>{monster.special_attacks}</span>
            </>
          )}
          {has(monster.special_defenses) && (
            <>
              <span style={labelStyle}>Sp. Def</span>
              <span style={{ ...valStyle, color: "#80c0e8" }}>{monster.special_defenses}</span>
            </>
          )}
          {has(monster.magic_resistance) && (
            <>
              <span style={labelStyle}>MR</span>
              <span style={{ ...valStyle, color: "#a080e8" }}>{monster.magic_resistance}</span>
            </>
          )}
          {has(monster.morale) && (
            <>
              <span style={labelStyle}>Morale</span>
              <span style={valStyle}>{monster.morale}</span>
            </>
          )}
          {has(monster.intelligence) && (
            <>
              <span style={labelStyle}>Int</span>
              <span style={valStyle}>{monster.intelligence}</span>
            </>
          )}
          {has(monster.alignment) && (
            <>
              <span style={labelStyle}>Align</span>
              <span style={valStyle}>{monster.alignment}</span>
            </>
          )}
          {saveTargets && (
            <>
              <span style={labelStyle}>Saves</span>
              <span style={{ ...valStyle, fontFamily: "monospace" }}>
                DPP {saveTargets.death} · RSW {saveTargets.wand} · PP {saveTargets.petrify} · BW{" "}
                {saveTargets.breath} · Sp {saveTargets.spell}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
