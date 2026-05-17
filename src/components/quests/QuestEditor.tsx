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
  concept: 'Concept', draft: 'Draft', ready: 'Ready', running: 'Active',
  completed: 'Completed', failed: 'Failed', abandoned: 'Abandoned',
};
const HOOK_DELIVERY_LABELS: Record<HookDelivery, string> = {
  encounter: 'Encounter', rumor: 'Rumor', letter: 'Letter/notice',
  vision: 'Vision/dream', discovery: 'Discovery', environmental: 'Environmental',
};
const OBJECTIVE_TYPE_LABELS: Record<ObjectiveType, string> = {
  main: 'Main', side: 'Side', hidden: 'Hidden (DM)',
};
const CLUE_CLARITY_LABELS: Record<ClueClarity, string> = {
  obvious: 'Obvious', moderate: 'Moderate', subtle: 'Subtle', cryptic: 'Cryptic',
};
const PLOT_TIER_LABELS: Record<PlotBeatTier, string> = {
  intro: 'Intro', rising_action: 'Rising action', midpoint: 'Midpoint',
  climax: 'Climax', resolution: 'Resolution',
};
const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  easy: 'Easy', standard: 'Standard', tough: 'Hard', deadly: 'Deadly',
};
const TIME_PRESSURE_LABELS: Record<QuestTimePressure, string> = {
  none: 'None', soft: 'Soft', hard: 'Hard deadline',
};

type TabId = 'overview' | 'hooks' | 'objectives' | 'plot' | 'clues' | 'complications' | 'notes';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'hooks', label: 'Hooks' },
  { id: 'objectives', label: 'Objectives' },
  { id: 'plot', label: 'Plot' },
  { id: 'clues', label: 'Clues' },
  { id: 'complications', label: 'Complications' },
  { id: 'notes', label: 'Notes' },
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
    if (avg < min - 1) return `Party is level ${avg.toFixed(1)} — quest is tuned for ${min}-${max}. Too hard?`;
    if (avg > max + 1) return `Party is level ${avg.toFixed(1)} — quest is tuned for ${min}-${max}. Too easy?`;
    return null;
  }, [party, data.difficulty.level_range]);

  const handleClose = () => {
    if (dirty && !confirm('You have unsaved changes. Close anyway?')) return;
    onClose();
  };

  const handleSave = () => {
    if (!data.title.trim()) {
      alert('Quest needs a title.');
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
            {questId == null ? '✨ New quest' : 'Edit quest'}
          </h2>
          {dirty && <span className="quest-editor__dirty-dot" title="Unsaved changes">●</span>}
        </div>
        <div className="quest-editor__header-actions">
          <button
            className="quest-btn quest-btn--ghost"
            onClick={onToggleViewMode}
            title={viewMode === 'modal' ? 'Switch to full page' : 'Switch to modal'}
          >
            {viewMode === 'modal' ? '⛶ Full page' : '⊟ Modal'}
          </button>
          <button className="quest-btn" onClick={handleClose}>Close</button>
          <button className="quest-btn quest-btn--primary" onClick={handleSave}>
            💾 Save
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
        <label>Title</label>
        <input
          type="text"
          value={data.title}
          onChange={e => update({ title: e.target.value })}
          placeholder="Quest title..."
        />
      </div>

      <div className="quest-field">
        <label>Pitch (one sentence)</label>
        <input
          type="text"
          value={data.pitch}
          onChange={e => update({ pitch: e.target.value })}
          placeholder="A short description..."
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
          <label>Time pressure</label>
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
        <label>Difficulty & party</label>
        <div className="quest-row">
          <label className="quest-field__inline">
            Recommended party size
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
            Difficulty
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
          Source: {data.difficulty.party_level_source === 'auto' ? 'auto from party' : 'manual'}
          {data.difficulty.captured_party_level != null && (
            <> · captured at level {data.difficulty.captured_party_level.toFixed(1)}</>
          )}
        </small>
      </div>

      <div className="quest-row">
        <div className="quest-field">
          <label>Expected sessions</label>
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
          <label>Total XP budget (estimate)</label>
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
        <label>Scaling notes (how to adjust up/down)</label>
        <textarea
          rows={2}
          value={data.difficulty.scaling_notes}
          onChange={e => update({
            difficulty: { ...data.difficulty, scaling_notes: e.target.value },
          })}
        />
      </div>

      <TaxonomyMultiSelect
        label="Quest types"
        category="quest_types"
        selected={data.quest_types}
        onChange={vals => update({ quest_types: vals as QuestData['quest_types'] })}
      />
      <TaxonomyMultiSelect
        label="Tones"
        category="tones"
        selected={data.tones}
        onChange={vals => update({ tones: vals as QuestData['tones'] })}
      />
      <TaxonomyMultiSelect
        label="Environments"
        category="environments"
        selected={data.environments}
        onChange={vals => update({ environments: vals as QuestData['environments'] })}
      />
      <TaxonomyMultiSelect
        label="Primary challenge"
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
        <label>Rewards (base)</label>
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
            Gold (gp)
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
            <small>(Items editable in a future update)</small>
          </div>
        )}
        {data.rewards.story.length > 0 && (
          <div className="quest-readonly-list">
            <strong>Story rewards:</strong>
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
        <button className="quest-btn" onClick={add}>+ Add hook</button>
      </div>
      {data.hooks.length === 0 && <p className="quest-empty">No hooks yet.</p>}
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
            placeholder="How does the party encounter this hook?"
            onChange={e => patch(h.id, x => ({ ...x, text: e.target.value }))}
          />
          {h.source_npc_id != null && (
            <small className="quest-field__hint">Linked to NPC #{h.source_npc_id}</small>
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
        <button className="quest-btn" onClick={() => add('main')}>+ Main objective</button>
        <button className="quest-btn" onClick={() => add('side')}>+ Side objective</button>
        <button className="quest-btn" onClick={() => add('hidden')}>+ Hidden objective</button>
      </div>
      {data.objectives.length === 0 && <p className="quest-empty">No objectives yet.</p>}
      {data.objectives.map(o => (
        <div key={o.id} className="quest-item">
          <div className="quest-item__header">
            <label className="quest-item__checkbox">
              <input
                type="checkbox"
                checked={o.done}
                onChange={e => patch(o.id, x => ({ ...x, done: e.target.checked }))}
              />
              Completed
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
            placeholder="Objective description..."
            onChange={e => patch(o.id, x => ({ ...x, text: e.target.value }))}
          />
          <textarea
            rows={2}
            value={o.dm_notes}
            placeholder="DM notes: how is this fulfilled?"
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
        <button className="quest-btn" onClick={add}>+ Add beat</button>
      </div>
      {data.plot_beats.length === 0 && <p className="quest-empty">No plot beats yet.</p>}
      {data.plot_beats.map((b, i) => (
        <div key={b.id} className="quest-item">
          <div className="quest-item__header">
            <strong>Beat {i + 1}</strong>
            <div className="quest-item__header-right">
              <button className="quest-btn quest-btn--ghost" onClick={() => moveUp(b.id)} title="Up">↑</button>
              <button className="quest-btn quest-btn--ghost" onClick={() => moveDown(b.id)} title="Down">↓</button>
              <button className="quest-btn quest-btn--ghost" onClick={() => remove(b.id)}>×</button>
            </div>
          </div>
          <input
            type="text"
            value={b.title}
            placeholder="Beat title..."
            onChange={e => patch(b.id, x => ({ ...x, title: e.target.value }))}
          />
          <textarea
            rows={3}
            value={b.description}
            placeholder="What happens in this scene?"
            onChange={e => patch(b.id, x => ({ ...x, description: e.target.value }))}
          />
          <div className="quest-row">
            <label className="quest-field__inline">
              Act
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
              Expected level
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
            <small className="quest-field__hint">{b.npc_ids.length} NPCs in this scene</small>
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
        <button className="quest-btn" onClick={add}>+ Add clue</button>
        <small className="quest-tab__hint">
          Every important clue should have a backup — so the party doesn't get stuck if they miss one.
        </small>
      </div>
      {data.clues.length === 0 && <p className="quest-empty">No clues yet.</p>}
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
            placeholder="What is the clue?"
            onChange={e => patch(c.id, x => ({ ...x, text: e.target.value }))}
          />
          <div className="quest-row">
            <label className="quest-field__inline">
              Where is it found?
              <input
                type="text"
                value={c.location}
                onChange={e => patch(c.id, x => ({ ...x, location: e.target.value }))}
              />
            </label>
            <label className="quest-field__inline">
              Backup clue
              <select
                value={c.backup_clue_id ?? ''}
                onChange={e => patch(c.id, x => ({ ...x, backup_clue_id: e.target.value || null }))}
              >
                <option value="">— none —</option>
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
            placeholder="What truth does it point to?"
            onChange={e => patch(c.id, x => ({ ...x, reveals: e.target.value }))}
          />
          <textarea
            rows={2}
            value={c.if_misunderstood}
            placeholder="What might players wrongly conclude?"
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
        <button className="quest-btn" onClick={addBlank}>+ Empty complication</button>
        <span className="quest-tab__divider">or from preset:</span>
        <select value={presetSlug} onChange={e => setPresetSlug(e.target.value)}>
          <option value="">— choose preset —</option>
          {COMPLICATION_PRESETS.categories.map(cat => (
            <optgroup key={cat.slug} label={cat.label}>
              {(presetsByCategory.get(cat.slug) ?? []).map(p => (
                <option key={p.slug} value={p.slug} title={p.description}>{p.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <button className="quest-btn quest-btn--primary" onClick={addPreset} disabled={!presetSlug}>
          Add
        </button>
      </div>
      {data.complications.length === 0 && <p className="quest-empty">No complications yet.</p>}
      {data.complications.map(c => (
        <div key={c.id} className="quest-item">
          <div className="quest-item__header">
            {c.preset_slug && <span className="quest-item__tag">preset</span>}
            <button className="quest-btn quest-btn--ghost" onClick={() => remove(c.id)}>×</button>
          </div>
          <textarea
            rows={2}
            value={c.text}
            placeholder="What is the complication?"
            onChange={e => patch(c.id, x => ({ ...x, text: e.target.value }))}
          />
          <textarea
            rows={2}
            value={c.trigger}
            placeholder="When/how is it triggered?"
            onChange={e => patch(c.id, x => ({ ...x, trigger: e.target.value }))}
          />
          {c.npc_ids.length > 0 && (
            <small className="quest-field__hint">{c.npc_ids.length} NPCs involved</small>
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
        <label>DM notes (DM only)</label>
        <textarea
          rows={8}
          value={data.dm_notes}
          onChange={e => update({ dm_notes: e.target.value })}
          placeholder="The full story: truth, twist, what to telegraph..."
        />
      </div>

      <div className="quest-field">
        <label>Player summary (what players see)</label>
        <textarea
          rows={4}
          value={data.player_summary}
          onChange={e => update({ player_summary: e.target.value })}
          placeholder="Brief description for the players' hub..."
        />
      </div>

      {data.moral_dilemma && (
        <div className="quest-field">
          <label>Moral dilemma <small>(read-only — editor coming soon)</small></label>
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
          <label>Rumors <small>(read-only — editor coming soon)</small></label>
          <div className="quest-readonly-block">
            <ul>
              {data.rumors.map(r => (
                <li key={r.id}>
                  <span className={r.is_true ? 'quest-tag--true' : 'quest-tag--false'}>
                    {r.is_true ? 'true' : 'false'}
                  </span>
                  {' '}{r.text}
                  {!r.is_true && r.actual_truth && (
                    <div className="quest-readonly-block__sub">
                      Actual truth: {r.actual_truth}
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
          <label>Linked NPCs <small>(Cast tab coming soon will show names + links)</small></label>
          <div className="quest-readonly-block">
            {data.npc_ids.length} NPCs linked: {data.npc_ids.join(', ')}
          </div>
        </div>
      )}

      {data.ai_generated && data.ai_generation_params && (
        <div className="quest-field">
          <label>AI generation metadata</label>
          <small className="quest-field__hint">
            Generated with party {data.ai_generation_params.party_size} × Lvl {data.ai_generation_params.party_level},
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
