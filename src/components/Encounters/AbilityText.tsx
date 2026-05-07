import { Fragment } from "react";
import { tokenizeAbilityText } from "../../rules-engine/monsters/parseAbilities";
import { SpellLink } from "./SpellLink";

interface Props {
  text: string | null | undefined;
  /** Falls back to this when text is empty */
  fallback?: React.ReactNode;
  variant?: "pill" | "underline";
}

/**
 * Display free-text (description, special_attacks, special_defenses, etc.)
 * with any recognized spell names converted to clickable SpellLink components.
 */
export function AbilityText({ text, fallback, variant = "underline" }: Props) {
  if (!text || text.trim() === "" || text === "Nil") {
    return fallback ? <>{fallback}</> : null;
  }

  const tokens = tokenizeAbilityText(text);

  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {tokens.map((tok, i) => {
        if (tok.type === "spell" && tok.spellName) {
          return (
            <SpellLink key={i} spellName={tok.spellName} variant={variant}>
              {tok.value}
            </SpellLink>
          );
        }
        return <Fragment key={i}>{tok.value}</Fragment>;
      })}
    </span>
  );
}
