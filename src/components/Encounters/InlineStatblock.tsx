import { useState } from "react";
import { stripWikiMetadata } from "../../rules-engine/monsters/parseAbilities";
import { AbilityText } from "./AbilityText";
import {
  CustomAbilityEditor,
  type CustomAbility,
} from "./CustomAbilityEditor";

/**
 * Inline statblock for combat. Click "▾ stats" to expand.
 *
 * REPLACES the v1 InlineStatblock. Key changes:
 *  - special_attacks / special_defenses / magic_resistance ALWAYS show when present,
 *    even when the value is short ("Magic"). Empty/null/Nil still hides.
 *  - Spell names in any text field auto-link to the spell modal.
 *  - Wiki link button when wiki_url is set.
 *  - Description excerpt with "show full" toggle.
 *  - Custom-abilities section so DM can add the bits the database doesn't have
 *    (e.g. Beholder eye-stalk powers).
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
  special_attacks?: string | null;
  special_defenses?: string | null;
  magic_resistance?: string | null;
  save_as?: string | null;
  organization?: string;
  diet?: string;
  activity_cycle?: string;
  treasure?: string;
  treasure_type?: string;
  description?: string | null;
  wiki_url?: string | null;
  source?: string | null;
}

interface Props {
  monster: MonsterLikeStats;
  saveTargets?: { death: number; wand: number; petrify: number; breath: number; spell: number };
  customAbilities?: CustomAbility[];
  onCustomAbilitiesChange?: (next: CustomAbility[]) => void;
  defaultOpen?: boolean;
}

const fieldStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0.3rem 0.75rem",
  fontSize: "0.78rem",
  alignItems: "baseline",
};
const labelStyle: React.CSSProperties = {
  color: "var(--color-muted, #888)",
  whiteSpace: "nowrap",
};
const valStyle: React.CSSProperties = {
  color: "var(--color-text, #d8c89a)",
  fontWeight: 500,
};

const has = (v: unknown) =>
  v !== null && v !== undefined && v !== "" && v !== "Nil" && v !== "nil";

export function InlineStatblock({
  monster,
  saveTargets,
  customAbilities,
  onCustomAbilitiesChange,
  defaultOpen = false,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const [showFullDesc, setShowFullDesc] = useState(false);

  const desc = stripWikiMetadata(monster.description);
  const descExcerpt =
    desc.length > 400 ? desc.slice(0, 400).trim() + "…" : desc;

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
            padding: "0.7rem 0.9rem",
            background: "rgba(40, 30, 15, 0.4)",
            border: "1px solid var(--color-border, #3a2a0a)",
            borderRadius: "4px",
          }}
        >
          {/* Combat stats grid */}
          <div style={fieldStyle}>
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

            {/* Special abilities — show ALWAYS when set, even short values */}
            {has(monster.special_attacks) && (
              <>
                <span style={labelStyle}>Sp. Atk</span>
                <span style={{ ...valStyle, color: "#e89060" }}>
                  <AbilityText text={monster.special_attacks} variant="pill" />
                </span>
              </>
            )}
            {has(monster.special_defenses) && (
              <>
                <span style={labelStyle}>Sp. Def</span>
                <span style={{ ...valStyle, color: "#80c0e8" }}>
                  <AbilityText text={monster.special_defenses} variant="pill" />
                </span>
              </>
            )}
            {has(monster.magic_resistance) && (
              <>
                <span style={labelStyle}>MR</span>
                <span style={{ ...valStyle, color: "#a080e8" }}>
                  {monster.magic_resistance}
                </span>
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
            {has(monster.save_as) && (
              <>
                <span style={labelStyle}>Saves as</span>
                <span style={valStyle}>{monster.save_as}</span>
              </>
            )}
            {saveTargets && (
              <>
                <span style={labelStyle}>Saves</span>
                <span style={{ ...valStyle, fontFamily: "monospace" }}>
                  DPP {saveTargets.death} · RSW {saveTargets.wand} · PP{" "}
                  {saveTargets.petrify} · BW {saveTargets.breath} · Sp{" "}
                  {saveTargets.spell}
                </span>
              </>
            )}
          </div>

          {/* Hint banner when special abilities exist but lack detail */}
          {(monster.special_attacks === "Magic" ||
            monster.special_defenses === "Magic" ||
            monster.special_attacks === "See below" ||
            monster.special_defenses === "See below") && (
            <div
              style={{
                marginTop: "0.75rem",
                padding: "0.5rem 0.7rem",
                background: "rgba(232, 144, 96, 0.08)",
                border: "1px solid rgba(232, 144, 96, 0.4)",
                borderRadius: "4px",
                fontSize: "0.75rem",
                color: "#e8b890",
              }}
            >
              ⚠ This monster has special abilities that aren't fully detailed in
              the database.{" "}
              {monster.wiki_url && (
                <a
                  href={monster.wiki_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#e8d0a8", textDecoration: "underline" }}
                >
                  Open the wiki page →
                </a>
              )}{" "}
              You can also add custom abilities below.
            </div>
          )}

          {/* Description excerpt */}
          {desc && (
            <div
              style={{
                marginTop: "0.75rem",
                paddingTop: "0.75rem",
                borderTop: "1px dashed var(--color-border, #3a2a0a)",
                fontSize: "0.78rem",
                lineHeight: 1.5,
              }}
            >
              <div
                style={{
                  fontSize: "0.65rem",
                  color: "var(--color-muted, #b8a070)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  marginBottom: "0.3rem",
                }}
              >
                Description
              </div>
              <AbilityText text={showFullDesc ? desc : descExcerpt} variant="underline" />
              {desc.length > 400 && (
                <button
                  type="button"
                  onClick={() => setShowFullDesc((v) => !v)}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--color-accent, #d4a850)",
                    cursor: "pointer",
                    fontSize: "0.75rem",
                    marginLeft: "0.3rem",
                    padding: 0,
                    fontFamily: "inherit",
                    textDecoration: "underline",
                  }}
                >
                  {showFullDesc ? "show less" : "show full"}
                </button>
              )}
            </div>
          )}

          {/* External wiki + source links */}
          {(monster.wiki_url || monster.source) && (
            <div
              style={{
                marginTop: "0.75rem",
                display: "flex",
                gap: "0.5rem",
                flexWrap: "wrap",
                fontSize: "0.7rem",
                color: "var(--color-muted, #888)",
              }}
            >
              {monster.source && <span>Source: {monster.source}</span>}
              {monster.wiki_url && (
                <a
                  href={monster.wiki_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    color: "var(--color-accent, #d4a850)",
                    textDecoration: "underline",
                  }}
                >
                  Open wiki ↗
                </a>
              )}
            </div>
          )}

          {/* Custom abilities (DM-managed) */}
          {onCustomAbilitiesChange && (
            <CustomAbilityEditor
              abilities={customAbilities ?? []}
              onChange={onCustomAbilitiesChange}
            />
          )}
        </div>
      )}
    </div>
  );
}

export type { CustomAbility };
