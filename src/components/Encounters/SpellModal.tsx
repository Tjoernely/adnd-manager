import { useEffect, useState } from "react";

/**
 * SpellModal — fetches a spell by name from /api/spells and renders full detail.
 *
 * If multiple spells match the name (priest+wizard variants), shows them all.
 */

interface SpellSummary {
  id: number;
  name: string;
  spell_group: string;
  level: number;
  school?: string | null;
  sphere?: string | null;
  source?: string | null;
  description_preview?: string | null;
}

interface SpellDetail extends SpellSummary {
  description: string;
  casting_time?: string | null;
  duration?: string | null;
  range?: string | null;
  area_of_effect?: string | null;
  saving_throw?: string | null;
  components?: string | null;
  reversible?: boolean;
}

interface Props {
  open: boolean;
  spellName: string | null;
  onClose: () => void;
  /** Override if your auth token lives elsewhere */
  authToken?: string;
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.7)",
  zIndex: 1100,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "1rem",
};

const modalStyle: React.CSSProperties = {
  width: "min(640px, 100%)",
  maxHeight: "85vh",
  background: "var(--color-bg, #1a1408)",
  border: "1px solid var(--color-border, #5a4520)",
  borderRadius: "8px",
  display: "flex",
  flexDirection: "column",
  color: "var(--color-text, #d8c89a)",
};

const headerStyle: React.CSSProperties = {
  padding: "1rem 1.25rem 0.5rem",
  borderBottom: "1px solid var(--color-border, #3a2a0a)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const bodyStyle: React.CSSProperties = {
  padding: "1rem 1.25rem",
  overflow: "auto",
};

const fieldRow: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "auto 1fr",
  gap: "0.25rem 0.75rem",
  fontSize: "0.85rem",
  marginBottom: "0.75rem",
};

const labelStyle: React.CSSProperties = {
  color: "var(--color-muted, #888)",
  whiteSpace: "nowrap",
};

export function SpellModal({ open, spellName, onClose, authToken }: Props) {
  const [results, setResults] = useState<SpellDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !spellName) return;
    let cancelled = false;
    const token = authToken ?? localStorage.getItem("dnd_token") ?? "";
    const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};

    setLoading(true);
    setError(null);
    setResults([]);

    fetch(`/api/spells?search=${encodeURIComponent(spellName)}&limit=10`, { headers })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(async (data: { spells: SpellSummary[] }) => {
        // Filter to exact-name (case-insensitive) matches, ignoring the "(Wizard Spell)" suffix
        const cleanName = spellName.toLowerCase().trim();
        const exact = (data.spells ?? []).filter((s) => {
          const n = s.name.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
          return n === cleanName;
        });

        const list = exact.length > 0 ? exact : (data.spells ?? []).slice(0, 3);

        // Fetch full detail for each
        const details = await Promise.all(
          list.map((s) =>
            fetch(`/api/spells/${s.id}`, { headers }).then((r) => r.json()).catch(() => null)
          )
        );
        if (!cancelled) {
          setResults(details.filter(Boolean) as SpellDetail[]);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, spellName, authToken]);

  if (!open || !spellName) return null;

  return (
    <div onClick={onClose} style={overlayStyle}>
      <div onClick={(e) => e.stopPropagation()} style={modalStyle}>
        <div style={headerStyle}>
          <div>
            <div style={{ fontSize: "0.65rem", color: "var(--color-muted, #888)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Spell
            </div>
            <h3 style={{ margin: "0.1rem 0 0", fontSize: "1.2rem", color: "var(--color-accent, #d4a850)" }}>
              {spellName}
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
              padding: "0 0.4rem",
            }}
          >
            ✕
          </button>
        </div>

        <div style={bodyStyle}>
          {loading && <div style={{ opacity: 0.7 }}>Loading spell…</div>}
          {error && <div style={{ color: "#e07060" }}>Couldn't load spell: {error}</div>}
          {!loading && !error && results.length === 0 && (
            <div style={{ opacity: 0.7 }}>
              No spell found matching "{spellName}". It may be referenced in lore but
              not in the spell database.
            </div>
          )}

          {results.map((s, idx) => (
            <div
              key={s.id}
              style={{
                marginBottom: idx < results.length - 1 ? "1.5rem" : 0,
                paddingBottom: idx < results.length - 1 ? "1.5rem" : 0,
                borderBottom:
                  idx < results.length - 1
                    ? "1px dashed var(--color-border, #3a2a0a)"
                    : "none",
              }}
            >
              <div
                style={{
                  display: "inline-block",
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.5rem",
                  background: "rgba(212, 168, 80, 0.15)",
                  border: "1px solid var(--color-accent, #d4a850)",
                  borderRadius: "10px",
                  marginBottom: "0.5rem",
                  textTransform: "capitalize",
                }}
              >
                {s.spell_group} · Level {s.level}
                {s.school ? ` · ${s.school}` : ""}
                {s.sphere ? ` · ${s.sphere}` : ""}
              </div>

              <div style={fieldRow}>
                {s.range && (
                  <>
                    <span style={labelStyle}>Range</span>
                    <span>{s.range}</span>
                  </>
                )}
                {s.casting_time && (
                  <>
                    <span style={labelStyle}>Casting Time</span>
                    <span>{s.casting_time}</span>
                  </>
                )}
                {s.duration && (
                  <>
                    <span style={labelStyle}>Duration</span>
                    <span>{s.duration}</span>
                  </>
                )}
                {s.area_of_effect && (
                  <>
                    <span style={labelStyle}>Area</span>
                    <span>{s.area_of_effect}</span>
                  </>
                )}
                {s.saving_throw && (
                  <>
                    <span style={labelStyle}>Save</span>
                    <span>{s.saving_throw}</span>
                  </>
                )}
                {s.components && (
                  <>
                    <span style={labelStyle}>Components</span>
                    <span>{s.components}</span>
                  </>
                )}
                {s.source && (
                  <>
                    <span style={labelStyle}>Source</span>
                    <span style={{ opacity: 0.7 }}>{s.source}</span>
                  </>
                )}
              </div>

              {s.description && (
                <div
                  style={{
                    fontSize: "0.85rem",
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    color: "var(--color-text, #d8c89a)",
                  }}
                >
                  {s.description}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
