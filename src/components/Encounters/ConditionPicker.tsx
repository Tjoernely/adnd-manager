import { useMemo, useState } from "react";
import { getAllConditions } from "../../rules-engine/combat/conditions";
import type { ConditionDefinition } from "../../rules-engine/combat/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onApply: (conditionId: string, durationOverride: number | null) => void;
}

export function ConditionPicker({ open, onClose, onApply }: Props) {
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<ConditionDefinition | null>(null);
  const [duration, setDuration] = useState<string>("");

  const conditions = useMemo(() => {
    const all = getAllConditions();
    if (!filter) return all;
    const f = filter.toLowerCase();
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(f) ||
        c.id.toLowerCase().includes(f) ||
        c.description.toLowerCase().includes(f)
    );
  }, [filter]);

  if (!open) return null;

  const handleApply = () => {
    if (!selected) return;
    let dur: number | null = null;
    if (duration.trim() !== "") {
      const n = parseInt(duration, 10);
      if (!isNaN(n)) dur = n;
    } else {
      dur = selected.defaultDuration;
    }
    onApply(selected.id, dur);
    setSelected(null);
    setDuration("");
    setFilter("");
    onClose();
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(560px, 92vw)",
          maxHeight: "80vh",
          background: "var(--color-bg, #1a1408)",
          border: "1px solid var(--color-border, #5a4520)",
          borderRadius: "8px",
          padding: "1.25rem",
          color: "var(--color-text, #d8c89a)",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <h3 style={{ margin: 0, fontSize: "1.05rem" }}>Apply Condition</h3>

        <input
          autoFocus
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter conditions…"
          style={{
            background: "rgba(0,0,0,0.4)",
            border: "1px solid var(--color-border, #4a3a1a)",
            color: "inherit",
            padding: "0.4rem 0.6rem",
            borderRadius: "4px",
            fontFamily: "inherit",
            fontSize: "0.9rem",
          }}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
            gap: "0.4rem",
            overflow: "auto",
            maxHeight: "40vh",
            padding: "0.25rem",
          }}
        >
          {conditions.map((c) => {
            const isSel = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelected(c)}
                title={c.description}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: "0.2rem",
                  padding: "0.5rem 0.6rem",
                  background: isSel ? `${c.color}33` : "rgba(0,0,0,0.3)",
                  border: `1px solid ${isSel ? c.color : "var(--color-border, #3a2a0a)"}`,
                  color: c.color,
                  borderRadius: "4px",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: "0.8rem",
                  textAlign: "left",
                }}
              >
                <span>
                  <span style={{ marginRight: "0.3rem" }}>{c.icon}</span>
                  {c.name}
                </span>
                <span style={{ fontSize: "0.65rem", opacity: 0.7 }}>
                  {c.defaultDuration === null ? "indefinite" : `~${c.defaultDuration}r`}
                </span>
              </button>
            );
          })}
        </div>

        {selected && (
          <div
            style={{
              padding: "0.6rem 0.8rem",
              background: `${selected.color}11`,
              border: `1px solid ${selected.color}55`,
              borderRadius: "4px",
              fontSize: "0.8rem",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: "0.3rem" }}>
              {selected.icon} {selected.name}
            </div>
            <div style={{ opacity: 0.85, marginBottom: "0.5rem" }}>
              {selected.description}
            </div>
            <label style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
              Duration (rounds):
              <input
                type="number"
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder={
                  selected.defaultDuration === null
                    ? "indefinite"
                    : String(selected.defaultDuration)
                }
                style={{
                  width: "5rem",
                  background: "rgba(0,0,0,0.4)",
                  border: "1px solid var(--color-border, #4a3a1a)",
                  color: "inherit",
                  padding: "0.2rem 0.4rem",
                  borderRadius: "3px",
                }}
              />
              <span style={{ opacity: 0.6, fontSize: "0.75rem" }}>
                blank = default · clear = indefinite
              </span>
            </label>
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "1px solid var(--color-border, #4a3a1a)",
              color: "inherit",
              padding: "0.35rem 0.8rem",
              borderRadius: "4px",
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={!selected}
            style={{
              background: selected ? "var(--color-accent, #c89030)" : "rgba(100,80,40,0.3)",
              border: "1px solid var(--color-accent, #c89030)",
              color: selected ? "#1a1408" : "rgba(255,255,255,0.4)",
              padding: "0.35rem 0.8rem",
              borderRadius: "4px",
              cursor: selected ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
