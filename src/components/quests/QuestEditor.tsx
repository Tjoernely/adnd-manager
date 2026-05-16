/**
 * QuestEditor — quest editing UI with 7 tabs.
 *
 * View modes:
 *   - 'modal': renders as overlay over the kanban
 *   - 'fullpage': replaces the kanban entirely
 *
 * Toggle button in the header switches between them, persisted via parent.
 *
 * Tabs:
 *   Overview | Hooks | Objectives | Plot | Clues | Complications | Notes
 *
 * Other tabs (Rumors, Cast, Rewards, Moral Dilemma editor) come in Stage 3.
 * For now, moral dilemma and rumors are displayed read-only in Notes.
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import type {
  QuestData,
  QuestStatus,
  QuestScope,
  Hook,
  Objective,
  PlotBeat,
  Clue,
  Complication,
  HookDelivery,
  ObjectiveType,
  ClueClarity,
  PlotBeatTier,
  DifficultyTier,
  QuestTimePressure,
} from '../../rules-engine/quests/questSchema';
import {
  ALL_STATUSES,
  ALL_HOOK_DELIVERIES,
  ALL_OBJECTIVE_TYPES,
  ALL_CLUE_CLARITIES,
  ALL_PLOT_BEAT_TIERS,
  ALL_DIFFICULTY_TIERS,
  ALL_TIME_PRESSURES,
} from '../../rules-engine/quests/questSchema';
import {
  defaultHook,
  defaultObjective,
  defaultPlotBeat,
  defaultClue,
  defaultComplication,
} from '../../rules-engine/quests/defaultQuest';
import {
  QUEST_VOCABULARY,
  COMPLICATION_PRESETS,
} from '../../rules-engine/quests/questPrompts';
import type { PartyInfo } from '../../rules-engine/quests/defaultQuest';

// ── Labels ──────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<QuestStatus, string> = {
  concept: 'Koncept', draft: 'Udkast', ready: 'Klar', running: 'Aktiv',
  completed: 'Afsluttet', failed: 'Fiasko', abandoned: 'Droppet',
};
const HOOK_DELIVERY_LABELS: Record<HookDelivery, string> = {
  encounter: 'Møde', rumor: 'Rygte', letter: 'Brev/opslag',
  vision: 'Syn/drøm', discovery: 'Opdagelse', environmental: 'Miljø',
};
const OBJECTIVE_TYPE_LABELS: Record<ObjectiveType, string> = {
  main: 'Hoved', side: 'Bi', hidden: 'Skjult (DM)',
};
const CLUE_CLARITY_LABELS: Record<ClueClarity, string> = {
  obvious: 'Tydelig', moderate: 'Moderat', subtle: 'Subtil', cryptic: 'Kryptisk',
};
const PLOT_TIER_LABELS: Record<PlotBeatTier, string> = {
  intro: 'Intro', rising_action: 'Optrapning', midpoint: 'Midtpunkt',
  climax: 'Klimaks', resolution: 'Afslutning',
};
const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  easy: 'Let', standard: 'Standard', tough: 'Hård', deadly: 'Dødelig',
};
const TIME_PRESSURE_LABELS: Record<QuestTimePressure, string> = {
  none: 'Ingen', soft: 'Blød', hard: 'Hård deadline',
};

type TabId = 'overview' | 'hooks' | 'objectives' | 'plot' | 'clues' | 'complications' | 'notes';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Oversigt' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'objectives', label: 'Mål' },
  { id: 'plot', label: 'Plot' },
  { id: 'clues', label: 'Clues' },
  { id: 'complications', label: 'Komplikationer' },
  { id: 'notes', label: 'Noter' },
];

// ── Component ────────────────────────────────────────────────────────────────

interface QuestEditorProps {
  questId: number | null;  // null = new quest not yet saved
  initialData: QuestData;
  viewMode: 'modal' | 'fullpage';
  onToggleViewMode: () => void;
  onSave: (data: QuestData) => void;
  onClose: () => void;
  campaignId: number;
  party: PartyInfo | undefined;
}

export function QuestEditor({
  questId,
  initialData,
  viewMode,
  onToggleViewMode,
  onSave,
  onClose,
  party,
}: QuestEditorProps) {
  const [data, setData] = useState<QuestData>(initialData);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [dirty, setDirty] = useState(false);

  // When initialData changes (e.g. AI generated a new quest into draft), reset
  useEffect(() => {
    setData(initialData);
    setDirty(false);
    setActiveTab('overview');
  }, [initialData]);

  const update = useCallback((patch: Partial<QuestData>) => {
    setData(prev => ({ ...prev, ...patch }));
    setDirty(true);
  }, []);

  // Warn about party-level mismatch
  const levelWarning = useMemo(() => {
    if (!party) return null;
    const { min, max } = data.difficulty.level_range;
    const avg = party.avg_level;
    if (avg < min - 1) return `Partyen er level ${avg.toFixed(1)} — quest er tunet til ${min}-${max}. For svært?`;
    if (avg > max + 1) return `Partyen er level ${avg.toFixed(1)} — quest er tunet til ${min}-${max}. For let?`;
    return null;
  }, [party, data.difficulty.level_range]);

  const handleClose = () => {
    if (dirty && !confirm('Du har ugemte ændringer. Luk alligevel?')) return;
    onClose();
  };

  const handleSave = () => {
    if (!data.title.trim()) {
      alert('Quest mangler en titel.');
      setActiveTab('overview');
      return;
    }
    onSave(data);
  };

  // ── Render container based on view mode ────────────────────────────────────

  const editorBody = (
    <>
      <div className="quest-editor__header">
        <div className="quest-editor__header-left">
          <h2 className="quest-editor__title">
            {questId == null ? '✨ Ny quest' : 'Rediger quest'}
          </h2>
          {dirty && <span className="quest-editor__dirty-dot" title="Ugemte ændringer">●</span>}
        </div>
        <div className="quest-editor__header-actions">
          <button
            className="quest-btn quest-btn--ghost"
            onClick={onToggleViewMode}
            title={viewMode === 'modal' ? 'Skift til fuld side' : 'Skift til modal'}
          >
            {viewMode === 'modal' ? '⛶ Fuld side' : '⊟ Modal'}
          </button>
          <button className="quest-btn" onClick={handleClose}>Luk</button>
          <button className="quest-btn quest-btn--primary" onClick={handleSave}>
            💾 Gem
          </button>
        </div>
      </div>

      {levelWarning && (
        <div className="quest-banner quest-banner--info">⚠ {levelWarning}</div>
      )}

      <div className="quest-editor__tabs">
        {TABS.map(t => (
          <button
            key={t.id}
            className={`quest-editor__tab ${activeTab === t.id ? 'is-active' : ''}`}
            onClick={() => setActiveTab(t.id)}
          >
            {t.label}
            {countForTab(t.id, data) > 0 && (
              <span className="quest-editor__tab-count">{countForTab(t.id, data)}</span>
            )}
          </button>
        ))}
      </div>

      <div className="quest-editor__body">
        {activeTab === 'overview' && <OverviewTab data={data} update={update} />}
        {activeTab === 'hooks' && <HooksTab data={data} update={update} />}
        {activeTab === 'objectives' && <ObjectivesTab data={data} update={update} />}
        {activeTab === 'plot' && <PlotTab data={data} update={update} />}
        {activeTab === 'clues' && <CluesTab data={data} update={update} />}
        {activeTab === 'complications' && <ComplicationsTab data={data} update={update} />}
        {activeTab === 'notes' && <NotesTab data={data} update={update} />}
      </div>
    </>
  );

  if (viewMode === 'fullpage') {
    return <div className="quest-editor quest-editor--fullpage">{editorBody}</div>;
  }
  return (
    <div className="quest-modal-backdrop" onClick={handleClose}>
      <div
        className="quest-editor quest-editor--modal"
        onClick={e => e.stopPropagation()}
      >
        {editorBody}
      </div>
    </div>
  );
}

function countForTab(tab: TabId, d: QuestData): number {
  switch (tab) {
    case 'hooks': return d.hooks.length;
    case 'objectives': return d.objectives.length;
    case 'plot': return d.plot_beats.length;
    case 'clues': return d.clues.length;
    case 'complications': return d.complications.length;
    default: return 0;
  }
}

// ── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  return (
    <div className="quest-tab">
      <div className="quest-field">
        <label>Titel</label>
        <input
          type="text"
          value={data.title}
          onChange={e => update({ title: e.target.value })}
          placeholder="Quest-titel..."
        />
      </div>

      <div className="quest-field">
        <label>Pitch (én sætning)</label>
        <input
          type="text"
          value={data.pitch}
          onChange={e => update({ pitch: e.target.value })}
          placeholder="En kort beskrivelse..."
        />
      </div>

      <div className="quest-row">
        <div className="quest-field">
          <label>Scope</label>
          <select value={data.scope} onChange={e => update({ scope: e.target.value as QuestScope })}>
            {QUEST_VOCABULARY.scopes.map(s => (
              <option key={s.slug} value={s.slug}>{s.label}</option>
            ))}
          </select>
        </div>
        <div className="quest-field">
          <label>Status</label>
          <select value={data.status} onChange={e => update({ status: e.target.value as QuestStatus })}>
            {ALL_STATUSES.map(s => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
        <div className="quest-field">
          <label>Tidspres</label>
          <select
            value={data.time_pressure}
            onChange={e => update({ time_pressure: e.target.value as QuestTimePressure })}
          >
            {ALL_TIME_PRESSURES.map(p => (
              <option key={p} value={p}>{TIME_PRESSURE_LABELS[p]}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="quest-field">
        <label>Sværhedsgrad & party</label>
        <div className="quest-row">
          <label className="quest-field__inline">
            Anbefalede party-størrelse
            <input
              type="number" min={1} max={10}
              value={data.difficulty.recommended_party_size}
              onChange={e => update({
                difficulty: {
                  ...data.difficulty,
                  recommended_party_size: Math.max(1, parseInt(e.target.value) || 1),
                },
              })}
            />
          </label>
          <label className="quest-field__inline">
            Level min
            <input
              type="number" min={1} max={30}
              value={data.difficulty.level_range.min}
              onChange={e => update({
                difficulty: {
                  ...data.difficulty,
                  level_range: { ...data.difficulty.level_range, min: parseInt(e.target.value) || 1 },
                },
              })}
            />
          </label>
          <label className="quest-field__inline">
            Level max
            <input
              type="number" min={1} max={30}
              value={data.difficulty.level_range.max}
              onChange={e => update({
                difficulty: {
                  ...data.difficulty,
                  level_range: { ...data.difficulty.level_range, max: parseInt(e.target.value) || 1 },
                },
              })}
            />
          </label>
          <label className="quest-field__inline">
            Sværhedsgrad
            <select
              value={data.difficulty.overall_difficulty}
              onChange={e => update({
                difficulty: { ...data.difficulty, overall_difficulty: e.target.value as DifficultyTier },
              })}
            >
              {ALL_DIFFICULTY_TIERS.map(t => (
                <option key={t} value={t}>{DIFFICULTY_LABELS[t]}</option>
              ))}
            </select>
          </label>
        </div>
        <small className="quest-field__hint">
          Kilde: {data.difficulty.party_level_source === 'auto' ? 'auto fra party' : 'manuel'}
          {data.difficulty.captured_party_level != null && (
            <> · captured at level {data.difficulty.captured_party_level.toFixed(1)}</>
          )}
        </small>
      </div>

      <div className="quest-row">
        <div className="quest-field">
          <label>Forventet antal sessioner</label>
          <input
            type="number" min={1} max={30}
            value={data.difficulty.expected_sessions ?? ''}
            onChange={e => {
              const v = e.target.value === '' ? null : Math.max(1, parseInt(e.target.value) || 1);
              update({ difficulty: { ...data.difficulty, expected_sessions: v } });
            }}
          />
        </div>
        <div className="quest-field">
          <label>Quest completion XP</label>
          <input
            type="number" min={0}
            value={data.difficulty.quest_completion_xp ?? ''}
            onChange={e => {
              const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
              update({ difficulty: { ...data.difficulty, quest_completion_xp: v } });
            }}
          />
        </div>
        <div className="quest-field">
          <label>Total XP-budget (estimat)</label>
          <input
            type="number" min={0}
            value={data.difficulty.total_xp_budget ?? ''}
            onChange={e => {
              const v = e.target.value === '' ? null : Math.max(0, parseInt(e.target.value) || 0);
              update({ difficulty: { ...data.difficulty, total_xp_budget: v } });
            }}
          />
        </div>
      </div>

      <div className="quest-field">
        <label>Scaling-noter (hvordan op/nedjustere)</label>
        <textarea
          rows={2}
          value={data.difficulty.scaling_notes}
          onChange={e => update({
            difficulty: { ...data.difficulty, scaling_notes: e.target.value },
          })}
        />
      </div>

      <TaxonomyMultiSelect
        label="Quest typer"
        category="quest_types"
        selected={data.quest_types}
        onChange={vals => update({ quest_types: vals as QuestData['quest_types'] })}
      />
      <TaxonomyMultiSelect
        label="Toner"
        category="tones"
        selected={data.tones}
        onChange={vals => update({ tones: vals as QuestData['tones'] })}
      />
      <TaxonomyMultiSelect
        label="Miljø"
        category="environments"
        selected={data.environments}
        onChange={vals => update({ environments: vals as QuestData['environments'] })}
      />
      <TaxonomyMultiSelect
        label="Primær udfordring"
        category="primary_challenges"
        selected={data.primary_challenges}
        onChange={vals => update({ primary_challenges: vals as QuestData['primary_challenges'] })}
      />
      <TaxonomyMultiSelect
        label="Antagonist"
        category="antagonist_types"
        selected={data.antagonist_types}
        onChange={vals => update({ antagonist_types: vals as QuestData['antagonist_types'] })}
      />

      <div className="quest-field">
        <label>Belønning (basis)</label>
        <div className="quest-row">
          <label className="quest-field__inline">
            XP
            <input
              type="number" min={0}
              value={data.rewards.xp}
              onChange={e => update({ rewards: { ...data.rewards, xp: Math.max(0, parseInt(e.target.value) || 0) } })}
            />
          </label>
          <label className="quest-field__inline">
            Guld (gp)
            <input
              type="number" min={0}
              value={data.rewards.gold}
              onChange={e => update({ rewards: { ...data.rewards, gold: Math.max(0, parseInt(e.target.value) || 0) } })}
            />
          </label>
        </div>
        {data.rewards.items.length > 0 && (
          <div className="quest-readonly-list">
            <strong>Items:</strong>
            <ul>{data.rewards.items.map((it, i) => (
              <li key={i}>{it.name}{it.description ? ` — ${it.description}` : ''}</li>
            ))}</ul>
            <small>(Items kan redigeres i Stage 3)</small>
          </div>
        )}
        {data.rewards.story.length > 0 && (
          <div className="quest-readonly-list">
            <strong>Story-belønninger:</strong>
            <ul>{data.rewards.story.map((s, i) => <li key={i}>{s}</li>)}</ul>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Multi-select taxonomy widget ─────────────────────────────────────────────

interface TaxonomyMultiSelectProps {
  label: string;
  category: keyof typeof QUEST_VOCABULARY;
  selected: string[];
  onChange: (vals: string[]) => void;
}

function TaxonomyMultiSelect({ label, category, selected, onChange }: TaxonomyMultiSelectProps) {
  type VocabEntry = { slug: string; label: string; description: string };
  const options = ((QUEST_VOCABULARY as unknown) as Record<string, VocabEntry[]>)[category] ?? [];
  const toggle = (slug: string) => {
    if (selected.includes(slug)) onChange(selected.filter(s => s !== slug));
    else onChange([...selected, slug]);
  };
  return (
    <div className="quest-field">
      <label>{label}</label>
      <div className="quest-gen__tags">
        {options.map(opt => (
          <button
            key={opt.slug}
            type="button"
            title={opt.description}
            className={`quest-tag ${selected.includes(opt.slug) ? 'quest-tag--selected' : ''}`}
            onClick={() => toggle(opt.slug)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Hooks tab ────────────────────────────────────────────────────────────────

function HooksTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  const add = () => update({ hooks: [...data.hooks, defaultHook()] });
  const remove = (id: string) => update({ hooks: data.hooks.filter(h => h.id !== id) });
  const patch = (id: string, fn: (h: Hook) => Hook) =>
    update({ hooks: data.hooks.map(h => h.id === id ? fn(h) : h) });

  return (
    <div className="quest-tab">
      <div className="quest-tab__header">
        <button className="quest-btn" onClick={add}>+ Tilføj hook</button>
      </div>
      {data.hooks.length === 0 && <p className="quest-empty">Ingen hooks endnu.</p>}
      {data.hooks.map(h => (
        <div key={h.id} className="quest-item">
          <div className="quest-item__header">
            <select
              value={h.delivery}
              onChange={e => patch(h.id, x => ({ ...x, delivery: e.target.value as HookDelivery }))}
              className="quest-item__select"
            >
              {ALL_HOOK_DELIVERIES.map(d => (
                <option key={d} value={d}>{HOOK_DELIVERY_LABELS[d]}</option>
              ))}
            </select>
            <button className="quest-btn quest-btn--ghost" onClick={() => remove(h.id)}>×</button>
          </div>
          <textarea
            rows={2}
            value={h.text}
            placeholder="Hvordan møder partyen denne hook?"
            onChange={e => patch(h.id, x => ({ ...x, text: e.target.value }))}
          />
          {h.source_npc_id != null && (
            <small className="quest-field__hint">Knyttet til NPC #{h.source_npc_id}</small>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Objectives tab ───────────────────────────────────────────────────────────

function ObjectivesTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  const add = (type: ObjectiveType) => update({ objectives: [...data.objectives, defaultObjective(type)] });
  const remove = (id: string) => update({ objectives: data.objectives.filter(o => o.id !== id) });
  const patch = (id: string, fn: (o: Objective) => Objective) =>
    update({ objectives: data.objectives.map(o => o.id === id ? fn(o) : o) });

  return (
    <div className="quest-tab">
      <div className="quest-tab__header">
        <button className="quest-btn" onClick={() => add('main')}>+ Hovedmål</button>
        <button className="quest-btn" onClick={() => add('side')}>+ Bimål</button>
        <button className="quest-btn" onClick={() => add('hidden')}>+ Skjult mål</button>
      </div>
      {data.objectives.length === 0 && <p className="quest-empty">Ingen mål endnu.</p>}
      {data.objectives.map(o => (
        <div key={o.id} className="quest-item">
          <div className="quest-item__header">
            <label className="quest-item__checkbox">
              <input
                type="checkbox"
                checked={o.done}
                onChange={e => patch(o.id, x => ({ ...x, done: e.target.checked }))}
              />
              Fuldført
            </label>
            <select
              value={o.type}
              onChange={e => patch(o.id, x => ({ ...x, type: e.target.value as ObjectiveType }))}
            >
              {ALL_OBJECTIVE_TYPES.map(t => (
                <option key={t} value={t}>{OBJECTIVE_TYPE_LABELS[t]}</option>
              ))}
            </select>
            <button className="quest-btn quest-btn--ghost" onClick={() => remove(o.id)}>×</button>
          </div>
          <input
            type="text"
            value={o.text}
            placeholder="Mål-beskrivelse..."
            onChange={e => patch(o.id, x => ({ ...x, text: e.target.value }))}
          />
          <textarea
            rows={2}
            value={o.dm_notes}
            placeholder="DM-noter: hvordan opfyldes målet?"
            onChange={e => patch(o.id, x => ({ ...x, dm_notes: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

// ── Plot tab ─────────────────────────────────────────────────────────────────

function PlotTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  const add = () => update({ plot_beats: [...data.plot_beats, defaultPlotBeat()] });
  const remove = (id: string) => update({ plot_beats: data.plot_beats.filter(b => b.id !== id) });
  const patch = (id: string, fn: (b: PlotBeat) => PlotBeat) =>
    update({ plot_beats: data.plot_beats.map(b => b.id === id ? fn(b) : b) });
  const moveUp = (id: string) => {
    const i = data.plot_beats.findIndex(b => b.id === id);
    if (i <= 0) return;
    const next = [...data.plot_beats];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    update({ plot_beats: next });
  };
  const moveDown = (id: string) => {
    const i = data.plot_beats.findIndex(b => b.id === id);
    if (i < 0 || i >= data.plot_beats.length - 1) return;
    const next = [...data.plot_beats];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    update({ plot_beats: next });
  };

  return (
    <div className="quest-tab">
      <div className="quest-tab__header">
        <button className="quest-btn" onClick={add}>+ Tilføj beat</button>
      </div>
      {data.plot_beats.length === 0 && <p className="quest-empty">Ingen plot beats endnu.</p>}
      {data.plot_beats.map((b, i) => (
        <div key={b.id} className="quest-item">
          <div className="quest-item__header">
            <strong>Beat {i + 1}</strong>
            <div className="quest-item__header-right">
              <button className="quest-btn quest-btn--ghost" onClick={() => moveUp(b.id)} title="Op">↑</button>
              <button className="quest-btn quest-btn--ghost" onClick={() => moveDown(b.id)} title="Ned">↓</button>
              <button className="quest-btn quest-btn--ghost" onClick={() => remove(b.id)}>×</button>
            </div>
          </div>
          <input
            type="text"
            value={b.title}
            placeholder="Beat-titel..."
            onChange={e => patch(b.id, x => ({ ...x, title: e.target.value }))}
          />
          <textarea
            rows={3}
            value={b.description}
            placeholder="Hvad sker der i denne scene?"
            onChange={e => patch(b.id, x => ({ ...x, description: e.target.value }))}
          />
          <div className="quest-row">
            <label className="quest-field__inline">
              Akt
              <select
                value={b.act ?? ''}
                onChange={e => patch(b.id, x => ({
                  ...x,
                  act: e.target.value === '' ? null : Number(e.target.value) as 1 | 2 | 3,
                }))}
              >
                <option value="">—</option>
                <option value="1">1</option><option value="2">2</option><option value="3">3</option>
              </select>
            </label>
            <label className="quest-field__inline">
              Tier
              <select
                value={b.tier ?? ''}
                onChange={e => patch(b.id, x => ({
                  ...x,
                  tier: e.target.value === '' ? null : e.target.value as PlotBeatTier,
                }))}
              >
                <option value="">—</option>
                {ALL_PLOT_BEAT_TIERS.map(t => (
                  <option key={t} value={t}>{PLOT_TIER_LABELS[t]}</option>
                ))}
              </select>
            </label>
            <label className="quest-field__inline">
              Forventet level
              <input
                type="number" min={1} max={30}
                value={b.expected_level ?? ''}
                onChange={e => patch(b.id, x => ({
                  ...x,
                  expected_level: e.target.value === '' ? null : parseInt(e.target.value) || null,
                }))}
              />
            </label>
          </div>
          {b.npc_ids.length > 0 && (
            <small className="quest-field__hint">{b.npc_ids.length} NPCs i denne scene</small>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Clues tab ────────────────────────────────────────────────────────────────

function CluesTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  const add = () => update({ clues: [...data.clues, defaultClue()] });
  const remove = (id: string) => update({ clues: data.clues.filter(c => c.id !== id) });
  const patch = (id: string, fn: (c: Clue) => Clue) =>
    update({ clues: data.clues.map(c => c.id === id ? fn(c) : c) });

  return (
    <div className="quest-tab">
      <div className="quest-tab__header">
        <button className="quest-btn" onClick={add}>+ Tilføj clue</button>
        <small className="quest-tab__hint">
          Hver vigtig clue bør have en backup — så partyen ikke sidder fast hvis de misser én.
        </small>
      </div>
      {data.clues.length === 0 && <p className="quest-empty">Ingen clues endnu.</p>}
      {data.clues.map(c => (
        <div key={c.id} className="quest-item">
          <div className="quest-item__header">
            <select
              value={c.clarity}
              onChange={e => patch(c.id, x => ({ ...x, clarity: e.target.value as ClueClarity }))}
            >
              {ALL_CLUE_CLARITIES.map(cl => (
                <option key={cl} value={cl}>{CLUE_CLARITY_LABELS[cl]}</option>
              ))}
            </select>
            <button className="quest-btn quest-btn--ghost" onClick={() => remove(c.id)}>×</button>
          </div>
          <textarea
            rows={2}
            value={c.text}
            placeholder="Hvad er clue'en?"
            onChange={e => patch(c.id, x => ({ ...x, text: e.target.value }))}
          />
          <div className="quest-row">
            <label className="quest-field__inline">
              Hvor findes den?
              <input
                type="text"
                value={c.location}
                onChange={e => patch(c.id, x => ({ ...x, location: e.target.value }))}
              />
            </label>
            <label className="quest-field__inline">
              Backup-clue
              <select
                value={c.backup_clue_id ?? ''}
                onChange={e => patch(c.id, x => ({ ...x, backup_clue_id: e.target.value || null }))}
              >
                <option value="">— ingen —</option>
                {data.clues.filter(other => other.id !== c.id).map(other => (
                  <option key={other.id} value={other.id}>
                    Clue {data.clues.findIndex(cc => cc.id === other.id) + 1}: {other.text.slice(0, 30)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <textarea
            rows={2}
            value={c.reveals}
            placeholder="Hvilken sandhed peger den mod?"
            onChange={e => patch(c.id, x => ({ ...x, reveals: e.target.value }))}
          />
          <textarea
            rows={2}
            value={c.if_misunderstood}
            placeholder="Hvad kan spillerne fejlagtigt konkludere?"
            onChange={e => patch(c.id, x => ({ ...x, if_misunderstood: e.target.value }))}
          />
        </div>
      ))}
    </div>
  );
}

// ── Complications tab ────────────────────────────────────────────────────────

function ComplicationsTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  const [presetSlug, setPresetSlug] = useState('');

  const addBlank = () => update({ complications: [...data.complications, defaultComplication()] });
  const addPreset = () => {
    if (!presetSlug) return;
    const preset = COMPLICATION_PRESETS.complications.find(p => p.slug === presetSlug);
    if (!preset) return;
    const c = defaultComplication();
    c.preset_slug = preset.slug;
    c.text = preset.description;
    update({ complications: [...data.complications, c] });
    setPresetSlug('');
  };
  const remove = (id: string) => update({ complications: data.complications.filter(c => c.id !== id) });
  const patch = (id: string, fn: (c: Complication) => Complication) =>
    update({ complications: data.complications.map(c => c.id === id ? fn(c) : c) });

  // Group presets by category
  const presetsByCategory = useMemo(() => {
    const m = new Map<string, typeof COMPLICATION_PRESETS.complications>();
    for (const p of COMPLICATION_PRESETS.complications) {
      const list = m.get(p.category) ?? [];
      list.push(p);
      m.set(p.category, list);
    }
    return m;
  }, []);

  return (
    <div className="quest-tab">
      <div className="quest-tab__header">
        <button className="quest-btn" onClick={addBlank}>+ Tom komplikation</button>
        <span className="quest-tab__divider">eller fra preset:</span>
        <select value={presetSlug} onChange={e => setPresetSlug(e.target.value)}>
          <option value="">— vælg preset —</option>
          {COMPLICATION_PRESETS.categories.map(cat => (
            <optgroup key={cat.slug} label={cat.label}>
              {(presetsByCategory.get(cat.slug) ?? []).map(p => (
                <option key={p.slug} value={p.slug} title={p.description}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="quest-btn quest-btn--primary" onClick={addPreset} disabled={!presetSlug}>
          Tilføj
        </button>
      </div>
      {data.complications.length === 0 && <p className="quest-empty">Ingen komplikationer endnu.</p>}
      {data.complications.map(c => (
        <div key={c.id} className="quest-item">
          <div className="quest-item__header">
            {c.preset_slug && <span className="quest-item__tag">preset</span>}
            <button className="quest-btn quest-btn--ghost" onClick={() => remove(c.id)}>×</button>
          </div>
          <textarea
            rows={2}
            value={c.text}
            placeholder="Hvad er komplikationen?"
            onChange={e => patch(c.id, x => ({ ...x, text: e.target.value }))}
          />
          <textarea
            rows={2}
            value={c.trigger}
            placeholder="Hvornår/hvordan udløses den?"
            onChange={e => patch(c.id, x => ({ ...x, trigger: e.target.value }))}
          />
          {c.npc_ids.length > 0 && (
            <small className="quest-field__hint">{c.npc_ids.length} NPCs involveret</small>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Notes tab ────────────────────────────────────────────────────────────────

function NotesTab({ data, update }: { data: QuestData; update: (p: Partial<QuestData>) => void }) {
  return (
    <div className="quest-tab">
      <div className="quest-field">
        <label>DM-noter (kun DM ser)</label>
        <textarea
          rows={8}
          value={data.dm_notes}
          onChange={e => update({ dm_notes: e.target.value })}
          placeholder="Hele historien: sandheden, twist, hvad der skal telegrafereres..."
        />
      </div>

      <div className="quest-field">
        <label>Player summary (det spillerne ser)</label>
        <textarea
          rows={4}
          value={data.player_summary}
          onChange={e => update({ player_summary: e.target.value })}
          placeholder="Kort beskrivelse spillerne får i deres party hub..."
        />
      </div>

      {data.moral_dilemma && (
        <div className="quest-field">
          <label>Moralsk dilemma <small>(read-only — editor i Stage 3)</small></label>
          <div className="quest-readonly-block">
            <strong>{data.moral_dilemma.setup}</strong>
            <ul>
              {data.moral_dilemma.options.map((o, i) => (
                <li key={i}>
                  <strong>{o.label}:</strong> {o.consequence}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data.rumors.length > 0 && (
        <div className="quest-field">
          <label>Rygter <small>(read-only — editor i Stage 3)</small></label>
          <div className="quest-readonly-block">
            <ul>
              {data.rumors.map(r => (
                <li key={r.id}>
                  <span className={r.is_true ? 'quest-tag--true' : 'quest-tag--false'}>
                    {r.is_true ? 'sand' : 'falsk'}
                  </span>
                  {' '}{r.text}
                  {!r.is_true && r.actual_truth && (
                    <div className="quest-readonly-block__sub">
                      Faktisk sandhed: {r.actual_truth}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {data.npc_ids.length > 0 && (
        <div className="quest-field">
          <label>Tilknyttede NPCs <small>(Cast tab i Stage 3 vil vise navne + links)</small></label>
          <div className="quest-readonly-block">
            {data.npc_ids.length} NPCs tilknyttet: {data.npc_ids.join(', ')}
          </div>
        </div>
      )}

      {data.ai_generated && data.ai_generation_params && (
        <div className="quest-field">
          <label>AI-generering metadata</label>
          <small className="quest-field__hint">
            Genereret med party {data.ai_generation_params.party_size}×lvl{data.ai_generation_params.party_level},
            difficulty: {data.ai_generation_params.difficulty}
            {data.ai_generation_params.custom_prompt && (
              <><br/>Custom prompt: "{data.ai_generation_params.custom_prompt}"</>
            )}
          </small>
        </div>
      )}
    </div>
  );
}
