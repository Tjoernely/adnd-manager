/**
 * GenerateButton — reusable AI content-generation button + preview modal.
 *
 * Props:
 *   type        "npc" | "quest" | "encounter" | "rumors"
 *   campaignId  string
 *   context     object   — optional hints passed to the AI (race, setting, partyLevel…)
 *   onAccept    fn(result) — called when the DM accepts the generated content
 *   label       string   — button label (default: "✨ Generate")
 *   className   string   — extra class on the trigger button
 *   disabled    bool
 */
import { useState, useCallback } from 'react';
import { api } from '../../api/client.js';
import './GenerateButton.css';

// ── Field renderers per type ──────────────────────────────────────────────────
function NpcPreview({ r }) {
  return (
    <div className="gb-preview">
      <div className="gb-preview__row gb-preview__row--big">
        <span className="gb-tag">Name</span>
        <span>{r.name}</span>
        <span className="gb-tag gb-tag--dim">{r.race}</span>
        <span className="gb-tag gb-tag--dim">{r.charClass}</span>
      </div>

      <Section title="Personality">{r.personality}</Section>
      <Section title="Backstory">{r.backstory}</Section>

      <TwoCol>
        <ListSection title="Dialog hooks"  items={r.dialogHooks} />
        <ListSection title="Quest hooks"   items={r.questHooks}  />
      </TwoCol>

      <TwoCol>
        <ListSection title="🔒 Secrets (DM)"  items={r.secrets}  dim />
        <ListSection title="💬 Rumors (party)" items={r.rumors} />
      </TwoCol>
    </div>
  );
}

function QuestPreview({ r }) {
  return (
    <div className="gb-preview">
      <div className="gb-preview__row gb-preview__row--big">
        <span className="gb-tag">Quest</span>
        <strong>{r.title}</strong>
      </div>

      <Section title="Description">{r.description}</Section>

      <TwoCol>
        <ListSection title="Plot hooks"     items={r.plotHooks}      />
        <ListSection title="Objectives"     items={r.objectives}     />
      </TwoCol>

      <TwoCol>
        <ListSection title="Rewards"        items={r.rewards}        />
        <ListSection title="Complications"  items={r.complications}  />
      </TwoCol>

      {r.notes && <Section title="DM Notes">{r.notes}</Section>}
    </div>
  );
}

function EncounterPreview({ r }) {
  return (
    <div className="gb-preview">
      <div className="gb-preview__row gb-preview__row--big">
        <span className="gb-tag">Encounter</span>
        <strong>{r.title}</strong>
        {r.xp && <span className="gb-tag gb-tag--gold">{r.xp}</span>}
      </div>

      <Section title="Terrain">{r.terrain}</Section>

      <div className="gb-section">
        <div className="gb-section__title">Monsters</div>
        <table className="gb-table">
          <thead>
            <tr><th>Monster</th><th>#</th><th>Notes</th></tr>
          </thead>
          <tbody>
            {(r.monsters ?? []).map((m, i) => (
              <tr key={i}>
                <td>{m.name}</td>
                <td>{m.count}</td>
                <td className="gb-table__notes">{m.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Section title="Tactics">{r.tactics}</Section>

      <TwoCol>
        <ListSection title="Loot" items={r.loot} />
        {r.notes && <Section title="DM Notes">{r.notes}</Section>}
      </TwoCol>
    </div>
  );
}

function RumorsPreview({ r }) {
  return (
    <div className="gb-preview">
      <div className="gb-section">
        <div className="gb-section__title">Rumors</div>
        <table className="gb-table gb-table--rumors">
          <thead>
            <tr><th>Rumor</th><th>Truth</th><th>Source</th></tr>
          </thead>
          <tbody>
            {(r.rumors ?? []).map((rm, i) => (
              <tr key={i}>
                <td>{rm.text}</td>
                <td>
                  <span className={`gb-badge gb-badge--${truthClass(rm.truth)}`}>
                    {rm.truth}
                  </span>
                </td>
                <td className="gb-table__notes">{rm.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function truthClass(t = '') {
  const l = t.toLowerCase();
  if (l.includes('true') && !l.includes('partially')) return 'true';
  if (l.includes('false'))                              return 'false';
  return 'partial';
}

// ── Small layout helpers ───────────────────────────────────────────────────────
function Section({ title, children }) {
  if (!children) return null;
  return (
    <div className="gb-section">
      <div className="gb-section__title">{title}</div>
      <div className="gb-section__body">{children}</div>
    </div>
  );
}

function ListSection({ title, items = [], dim }) {
  if (!items?.length) return null;
  return (
    <div className="gb-section">
      <div className="gb-section__title">{title}</div>
      <ul className={`gb-list${dim ? ' gb-list--dim' : ''}`}>
        {items.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    </div>
  );
}

function TwoCol({ children }) {
  return <div className="gb-two-col">{children}</div>;
}

// ── Preview router ─────────────────────────────────────────────────────────────
const PREVIEWS = { npc: NpcPreview, quest: QuestPreview, encounter: EncounterPreview, rumors: RumorsPreview };

const TYPE_LABELS = {
  npc:       'NPC',
  quest:     'Quest',
  encounter: 'Encounter',
  rumors:    'Rumors',
};

// ── Context form ──────────────────────────────────────────────────────────────
const CONTEXT_FIELDS = {
  npc: [
    { key: 'race',       label: 'Race hint',      placeholder: 'e.g. Half-orc' },
    { key: 'charClass',  label: 'Class hint',     placeholder: 'e.g. Fighter' },
    { key: 'setting',    label: 'Setting',        placeholder: 'e.g. port city' },
    { key: 'tone',       label: 'Tone',           placeholder: 'e.g. sinister merchant' },
    { key: 'notes',      label: 'Extra notes',    placeholder: 'Any extra detail…' },
  ],
  quest: [
    { key: 'setting',    label: 'Setting',        placeholder: 'e.g. haunted forest' },
    { key: 'partyLevel', label: 'Party level',    placeholder: 'e.g. 4-6' },
    { key: 'tone',       label: 'Tone',           placeholder: 'e.g. mystery, political' },
    { key: 'notes',      label: 'Extra notes',    placeholder: 'Any extra detail…' },
  ],
  encounter: [
    { key: 'setting',    label: 'Terrain/setting', placeholder: 'e.g. dungeon corridor' },
    { key: 'partyLevel', label: 'Party level',     placeholder: 'e.g. 4-6' },
    { key: 'partySize',  label: 'Party size',      placeholder: 'e.g. 5 characters' },
    { key: 'tone',       label: 'Theme',           placeholder: 'e.g. undead, traps' },
    { key: 'notes',      label: 'Extra notes',     placeholder: 'Any extra detail…' },
  ],
  rumors: [
    { key: 'location',   label: 'Location',       placeholder: 'e.g. The Broken Barrel tavern' },
    { key: 'setting',    label: 'Setting',        placeholder: 'e.g. border town near war zone' },
    { key: 'notes',      label: 'Extra notes',    placeholder: 'Any extra detail…' },
  ],
};

// ── Main component ─────────────────────────────────────────────────────────────
export function GenerateButton({
  type,
  campaignId,
  context: propContext = {},
  onAccept,
  label,
  className = '',
  disabled = false,
}) {
  const [phase, setPhase]         = useState('idle'); // idle | ctx | loading | preview | error
  const [ctxValues, setCtxValues] = useState({});
  const [result, setResult]       = useState(null);
  const [errorMsg, setErrorMsg]   = useState('');

  const fields = CONTEXT_FIELDS[type] ?? [];
  const PreviewComp = PREVIEWS[type] ?? (() => <pre>{JSON.stringify(result, null, 2)}</pre>);

  // ── Trigger: open context form (or skip straight to loading if no fields)
  const handleTrigger = useCallback(() => {
    setCtxValues({});
    setResult(null);
    setErrorMsg('');
    setPhase(fields.length ? 'ctx' : 'loading');
    if (!fields.length) runGenerate({});
  }, [fields.length]);

  // ── Run generation ─────────────────────────────────────────────────────────
  const runGenerate = useCallback(async (extra = {}) => {
    setPhase('loading');
    try {
      const mergedCtx = { ...propContext, ...ctxValues, ...extra };
      const resp = await api.generateContent(type, campaignId, mergedCtx);
      setResult(resp.result);
      setPhase('preview');
    } catch (e) {
      setErrorMsg(e.message ?? 'Unknown error');
      setPhase('error');
    }
  }, [type, campaignId, propContext, ctxValues]);

  const handleCtxSubmit = (e) => {
    e.preventDefault();
    runGenerate();
  };

  const handleAccept = () => {
    onAccept?.(result);
    setPhase('idle');
  };

  const handleRegenerate = () => runGenerate();

  const handleClose = () => setPhase('idle');

  // ── Render ─────────────────────────────────────────────────────────────────
  const showModal = phase !== 'idle';

  return (
    <>
      {/* Trigger button */}
      <button
        type="button"
        className={`gb-trigger ${className}`}
        onClick={handleTrigger}
        disabled={disabled || phase === 'loading'}
        title={`Generate ${TYPE_LABELS[type] ?? type} with AI`}
      >
        <span className="gb-trigger__icon">✨</span>
        {label ?? `Generate ${TYPE_LABELS[type] ?? type}`}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="gb-backdrop" onClick={handleClose}>
          <div className="gb-modal" onClick={e => e.stopPropagation()}>

            {/* Header */}
            <div className="gb-modal__header">
              <span className="gb-modal__title">
                ✨ AI {TYPE_LABELS[type] ?? type} Generator
              </span>
              <button className="gb-modal__close" onClick={handleClose}>✕</button>
            </div>

            {/* Context form */}
            {phase === 'ctx' && (
              <form className="gb-modal__body" onSubmit={handleCtxSubmit}>
                <p className="gb-hint">Optional — add hints to guide the AI, or leave blank for a random result.</p>
                {fields.map(f => (
                  <div className="gb-field" key={f.key}>
                    <label className="gb-field__label">{f.label}</label>
                    <input
                      className="gb-field__input"
                      type="text"
                      placeholder={f.placeholder}
                      value={ctxValues[f.key] ?? ''}
                      onChange={e => setCtxValues(v => ({ ...v, [f.key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="gb-modal__footer">
                  <button type="button" className="gb-btn gb-btn--ghost" onClick={handleClose}>Cancel</button>
                  <button type="submit" className="gb-btn gb-btn--primary">Generate ✨</button>
                </div>
              </form>
            )}

            {/* Loading */}
            {phase === 'loading' && (
              <div className="gb-modal__body gb-modal__body--center">
                <div className="gb-spinner" />
                <p className="gb-hint">Summoning the oracle…</p>
              </div>
            )}

            {/* Error */}
            {phase === 'error' && (
              <div className="gb-modal__body">
                <p className="gb-error">⚠ {errorMsg}</p>
                <div className="gb-modal__footer">
                  <button type="button" className="gb-btn gb-btn--ghost" onClick={handleClose}>Close</button>
                  <button type="button" className="gb-btn gb-btn--primary" onClick={() => runGenerate()}>Retry</button>
                </div>
              </div>
            )}

            {/* Preview */}
            {phase === 'preview' && result && (
              <>
                <div className="gb-modal__body gb-modal__body--scroll">
                  <PreviewComp r={result} />
                </div>
                <div className="gb-modal__footer">
                  <button type="button" className="gb-btn gb-btn--ghost" onClick={handleClose}>Discard</button>
                  <button type="button" className="gb-btn gb-btn--secondary" onClick={handleRegenerate}>
                    ↺ Regenerate
                  </button>
                  <button type="button" className="gb-btn gb-btn--primary" onClick={handleAccept}>
                    ✓ Use this
                  </button>
                </div>
              </>
            )}

          </div>
        </div>
      )}
    </>
  );
}

export default GenerateButton;
