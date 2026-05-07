import { useState } from "react";
import { AddToEncounterModal } from "./AddToEncounterModal";

interface Props {
  monster: Record<string, any>;
  campaignId: number;
  /** Visual variant: "card" is small for monster cards; "detail" is large for modals. */
  variant?: "card" | "detail";
  onSuccess?: (msg: string) => void;
}

export function AddToEncounterButton({
  monster,
  campaignId,
  variant = "card",
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const handleSuccess = (msg: string) => {
    setToast(msg);
    onSuccess?.(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const isCard = variant === "card";

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        title={`Add ${monster.name} to an encounter`}
        style={
          isCard
            ? {
                background: "rgba(212, 168, 80, 0.12)",
                border: "1px solid var(--color-accent, #d4a850)",
                color: "var(--color-accent, #d4a850)",
                padding: "0.2rem 0.55rem",
                borderRadius: "10px",
                fontSize: "0.7rem",
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }
            : {
                background: "var(--color-accent, #c89030)",
                border: "1px solid var(--color-accent, #c89030)",
                color: "#1a1408",
                padding: "0.45rem 0.9rem",
                borderRadius: "4px",
                fontSize: "0.85rem",
                fontWeight: 600,
                cursor: "pointer",
                fontFamily: "inherit",
              }
        }
      >
        ⚔ Add to Encounter
      </button>

      <AddToEncounterModal
        open={open}
        monster={monster}
        campaignId={campaignId}
        onClose={() => setOpen(false)}
        onSuccess={handleSuccess}
      />

      {/* Light-weight toast — just a status line near the button. The page
          can override with its own toast system if it has one. */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: "1.5rem",
            right: "1.5rem",
            padding: "0.6rem 1rem",
            background: "rgba(40,80,40,0.95)",
            border: "1px solid #5be080",
            borderRadius: "6px",
            color: "#dfffe0",
            fontSize: "0.85rem",
            zIndex: 1300,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
          }}
        >
          ✓ {toast}
        </div>
      )}
    </>
  );
}
