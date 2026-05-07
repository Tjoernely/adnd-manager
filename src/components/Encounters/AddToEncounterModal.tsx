import { useEffect, useState } from "react";
import {
  addCreatureToEncounter,
  createEncounter,
  listSavedEncounters,
  monsterToCreaturePayload,
  type SavedEncounterSummary,
} from "./encounterApi";

interface Props {
  open: boolean;
  monster: Record<string, any> | null;
  /** Current campaign id — usually from session/route. */
  campaignId: number;
  onClose: () => void;
  /** Called after successful add with a small status message. */
  onSuccess?: (msg: string) => void;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1200,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: React.CSSProperties = {
  width: "min(520px, 100%)",
  maxHeight: "85vh",
  background: "var(--color-bg, #1a1408)",
  border: "1px solid var(--color-border, #5a4520)",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  color: "var(--color-text, #d8c89a)",
};

const sectionStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  background: "rgba(0,0,0,0.4)",
  border: "1px solid var(--color-border, #4a3a1a)",
  color: "inherit",
  padding: "0.4rem 0.6rem",
  borderRadius: "4px",
  fontFamily: "inherit",
  fontSize: "0.9rem",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.7rem",
  color: "var(--color-muted, #b8a070)",
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  marginBottom: "0.3rem",
  display: "block",
};

const btnPrimary: React.CSSProperties = {
  background: "var(--color-accent, #c89030)",
  border: "1px solid var(--color-accent, #c89030)",
  color: "#1a1408",
  padding: "0.4rem 0.9rem",
  borderRadius: "4px",
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: "inherit",
};

const btnSecondary: React.CSSProperties = {
  background: "transparent",
  border: "1px solid var(--color-border, #4a3a1a)",
  color: "var(--color-text, #d8c89a)",
  padding: "0.4rem 0.9rem",
  borderRadius: "4px",
  cursor: "pointer",
  fontFamily: "inherit",
};

export function AddToEncounterModal({
  open,
  monster,
  campaignId,
  onClose,
  onSuccess,
}: Props) {
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [encounters, setEncounters] = useState<SavedEncounterSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [count, setCount] = useState<number>(1);
  const [newTitle, setNewTitle] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Load encounters when opening
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    listSavedEncounters(campaignId)
      .then((list) => {
        if (cancelled) return;
        setEncounters(list);
        // Default to most recent / first active encounter
        const active = list.find((e) => e.status === "active") ?? list[0];
        setSelectedId(active?.id ?? null);
        // If there are no encounters yet, jump to "new"
        if (list.length === 0) setMode("new");
      })
      .catch((e) => !cancelled && setError(String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, campaignId]);

  // Reset transient state when modal closes
  useEffect(() => {
    if (!open) {
      setError(null);
      setSubmitting(false);
      setCount(1);
      setNewTitle("");
    }
  }, [open]);

  if (!open || !monster) return null;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const basePayload = monsterToCreaturePayload(monster);

      if (mode === "existing") {
        if (!selectedId) {
          setError("Pick an encounter first.");
          setSubmitting(false);
          return;
        }
        // Add `count` copies sequentially. If you'd rather batch, the backend
        // can be extended later.
        for (let i = 0; i < count; i++) {
          await addCreatureToEncounter(selectedId, basePayload);
        }
        const enc = encounters.find((e) => e.id === selectedId);
        onSuccess?.(
          `Added ${count}× ${monster.name} to "${enc?.title ?? "encounter"}".`
        );
      } else {
        const title = newTitle.trim() || `${monster.name} encounter`;
        const creatures = Array.from({ length: count }, () => basePayload);
        await createEncounter({
          campaign_id: campaignId,
          title,
          terrain: "Any",
          difficulty: "Medium",
          party_level: 5,
          party_size: 4,
          total_xp:
            (Number(basePayload.xp_value) || 0) * count,
          creatures,
        });
        onSuccess?.(`Created encounter "${title}" with ${count}× ${monster.name}.`);
      }

      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div
          style={{
            padding: "1rem 1.25rem 0.5rem",
            borderBottom: "1px solid var(--color-border, #3a2a0a)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div>
            <div
              style={{
                fontSize: "0.65rem",
                color: "var(--color-muted, #888)",
                letterSpacing: "0.1em",
                textTransform: "uppercase",
              }}
            >
              Add to Encounter
            </div>
            <h3
              style={{
                margin: "0.1rem 0 0",
                fontSize: "1.1rem",
                color: "var(--color-accent, #d4a850)",
              }}
            >
              {monster.name}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              color: "var(--color-muted, #888)",
              fontSize: "1.4rem",
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        {/* Mode tabs */}
        <div
          style={{
            display: "flex",
            gap: "0.4rem",
            padding: "0.6rem 1.25rem 0",
          }}
        >
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              disabled={m === "existing" && encounters.length === 0}
              style={{
                background: mode === m ? "rgba(212,168,80,0.15)" : "transparent",
                border:
                  mode === m
                    ? "1px solid var(--color-accent, #d4a850)"
                    : "1px solid var(--color-border, #4a3a1a)",
                color: mode === m ? "var(--color-accent, #d4a850)" : "inherit",
                padding: "0.3rem 0.8rem",
                borderRadius: "4px",
                cursor:
                  m === "existing" && encounters.length === 0
                    ? "not-allowed"
                    : "pointer",
                fontFamily: "inherit",
                fontSize: "0.85rem",
                opacity: m === "existing" && encounters.length === 0 ? 0.4 : 1,
              }}
            >
              {m === "existing"
                ? `Existing (${encounters.length})`
                : "New encounter"}
            </button>
          ))}
        </div>

        <div style={sectionStyle}>
          {loading && <div style={{ opacity: 0.7 }}>Loading encounters…</div>}

          {!loading && mode === "existing" && encounters.length > 0 && (
            <div>
              <label style={labelStyle}>Choose encounter</label>
              <select
                value={selectedId ?? ""}
                onChange={(e) => setSelectedId(parseInt(e.target.value, 10))}
                style={inputStyle}
              >
                {encounters.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title || "(untitled)"}{" "}
                    {e.difficulty ? `· ${e.difficulty}` : ""}{" "}
                    · {e.creatures?.length ?? 0} creatures
                    {e.status === "completed" ? " · DONE" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!loading && mode === "new" && (
            <div>
              <label style={labelStyle}>Encounter name</label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`e.g. "${monster.name} ambush"`}
                style={inputStyle}
              />
            </div>
          )}

          {/* Count */}
          <div style={{ marginTop: "0.9rem" }}>
            <label style={labelStyle}>How many?</label>
            <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              {[1, 2, 3, 5, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCount(n)}
                  style={{
                    minWidth: "2.4rem",
                    background: count === n ? "var(--color-accent, #c89030)" : "transparent",
                    border: "1px solid var(--color-border, #4a3a1a)",
                    color: count === n ? "#1a1408" : "inherit",
                    padding: "0.3rem 0.5rem",
                    borderRadius: "4px",
                    cursor: "pointer",
                    fontWeight: count === n ? 600 : 400,
                    fontFamily: "inherit",
                  }}
                >
                  {n}
                </button>
              ))}
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) =>
                  setCount(
                    Math.max(1, Math.min(50, parseInt(e.target.value, 10) || 1))
                  )
                }
                style={{ ...inputStyle, width: "5rem" }}
              />
            </div>
          </div>

          {error && (
            <div
              style={{
                marginTop: "0.8rem",
                padding: "0.5rem 0.7rem",
                background: "rgba(220,80,60,0.12)",
                border: "1px solid rgba(220,80,60,0.5)",
                borderRadius: "4px",
                color: "#f0a090",
                fontSize: "0.8rem",
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "0.75rem 1.25rem 1rem",
            borderTop: "1px solid var(--color-border, #3a2a0a)",
            display: "flex",
            justifyContent: "flex-end",
            gap: "0.5rem",
          }}
        >
          <button type="button" onClick={onClose} style={btnSecondary} disabled={submitting}>
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            style={btnPrimary}
            disabled={
              submitting ||
              (mode === "existing" && !selectedId) ||
              (mode === "new" && encounters.length === 0 && !newTitle.trim() && false)
            }
          >
            {submitting
              ? "Adding…"
              : mode === "existing"
              ? `Add ${count}×`
              : `Create with ${count}×`}
          </button>
        </div>
      </div>
    </div>
  );
}
