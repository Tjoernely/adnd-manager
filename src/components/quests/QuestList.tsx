/**
 * QuestList — kanban view of all quests in a campaign.
 *
 * Columns: Concept | Draft | Ready | Running | Done (collapsible)
 * Each card shows: title, scope badge, level range, status quick-change.
 * Top toolbar: "New quest", "Generate with AI", and filters.
 */

import { useMemo, useState } from 'react';
import type { QuestRecord, QuestStatus } from '../../rules-engine/quests/questSchema';
import {
  KANBAN_COLUMNS,
  ARCHIVE_STATUSES,
  ALL_STATUSES,
} from '../../rules-engine/quests/questSchema';
import { QUEST_VOCABULARY } from '../../rules-engine/quests/questPrompts';

// ── Label helpers ────────────────────────────────────────────────────────────

type VocabEntry = { slug: string; label: string; description: string };

function labelFor(category: keyof typeof QUEST_VOCABULARY, slug: string): string {
  const list = ((QUEST_VOCABULARY as unknown) as Record<string, VocabEntry[]>)[category] ?? [];
  return list.find(e => e.slug === slug)?.label ?? slug;
}

const STATUS_LABELS: Record<QuestStatus, string> = {
  concept: 'Concept',
  draft: 'Draft',
  ready: 'Ready',
  running: 'Active',
  completed: 'Completed',
  failed: 'Failed',
  abandoned: 'Abandoned',
};

const STATUS_DOT: Record<QuestStatus, string> = {
  concept: '#94a3b8',     // slate-400
  draft: '#facc15',       // yellow-400
  ready: '#60a5fa',       // blue-400
  running: '#34d399',     // emerald-400
  completed: '#22c55e',   // green-500
  failed: '#ef4444',      // red-500
  abandoned: '#64748b',   // slate-500
};

// ── Filter state ─────────────────────────────────────────────────────────────

interface Filters {
  search: string;
  scope: string;       // '' = all
  questType: string;
  tone: string;
  showArchived: boolean;
}

const emptyFilters: Filters = {
  search: '',
  scope: '',
  questType: '',
  tone: '',
  showArchived: false,
};

// ── Component ────────────────────────────────────────────────────────────────

interface QuestListProps {
  quests: QuestRecord[];
  loading: boolean;
  onNew: () => void;
  onGenerate: () => void;
  onOpen: (questId: number) => void;
  onDelete: (questId: number) => void;
  onStatusChange: (questId: number, newStatus: QuestStatus) => void;
}

export function QuestList({
  quests,
  loading,
  onNew,
  onGenerate,
  onOpen,
  onDelete,
  onStatusChange,
}: QuestListProps) {
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  // — Apply filters —
  const filtered = useMemo(() => {
    return quests.filter(q => {
      const d = q.data;
      if (filters.search) {
        const needle = filters.search.toLowerCase();
        const hay = `${d.title} ${d.pitch}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      if (filters.scope && d.scope !== filters.scope) return false;
      if (filters.questType && !d.quest_types.includes(filters.questType as never)) return false;
      if (filters.tone && !d.tones.includes(filters.tone as never)) return false;
      if (!filters.showArchived && (ARCHIVE_STATUSES as readonly QuestStatus[]).includes(d.status)) return false;
      return true;
    });
  }, [quests, filters]);

  // — Group by column —
  const byStatus = useMemo(() => {
    const m = new Map<QuestStatus, QuestRecord[]>();
    for (const s of ALL_STATUSES) m.set(s, []);
    for (const q of filtered) {
      const list = m.get(q.data.status) ?? [];
      list.push(q);
      m.set(q.data.status, list);
    }
    return m;
  }, [filtered]);

  const archivedCount = (ARCHIVE_STATUSES as readonly QuestStatus[]).reduce(
    (sum, s) => sum + (byStatus.get(s)?.length ?? 0),
    0
  );

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="quest-list">
      <div className="quest-list__toolbar">
        <h2 className="quest-list__title">Quests</h2>
        <div className="quest-list__actions">
          <button className="quest-btn quest-btn--primary" onClick={onGenerate}>
            ✨ Generate with AI
          </button>
          <button className="quest-btn" onClick={onNew}>
            + New quest
          </button>
        </div>
      </div>

      <div className="quest-list__filters">
        <input
          type="text"
          placeholder="Search title/pitch..."
          value={filters.search}
          onChange={e => setFilters({ ...filters, search: e.target.value })}
          className="quest-filter__input"
        />
        <select
          value={filters.scope}
          onChange={e => setFilters({ ...filters, scope: e.target.value })}
          className="quest-filter__select"
        >
          <option value="">All scopes</option>
          {QUEST_VOCABULARY.scopes.map(s => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <select
          value={filters.questType}
          onChange={e => setFilters({ ...filters, questType: e.target.value })}
          className="quest-filter__select"
        >
          <option value="">All types</option>
          {QUEST_VOCABULARY.quest_types.map(s => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <select
          value={filters.tone}
          onChange={e => setFilters({ ...filters, tone: e.target.value })}
          className="quest-filter__select"
        >
          <option value="">All tones</option>
          {QUEST_VOCABULARY.tones.map(s => (
            <option key={s.slug} value={s.slug}>{s.label}</option>
          ))}
        </select>
        <label className="quest-filter__checkbox">
          <input
            type="checkbox"
            checked={filters.showArchived}
            onChange={e => setFilters({ ...filters, showArchived: e.target.checked })}
          />
          Show archived ({archivedCount})
        </label>
      </div>

      {loading ? (
        <div className="quest-list__loading">Loading quests...</div>
      ) : (
        <>
          <div className="quest-kanban">
            {KANBAN_COLUMNS.map(status => (
              <KanbanColumn
                key={status}
                status={status}
                quests={byStatus.get(status) ?? []}
                onOpen={onOpen}
                onDelete={onDelete}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>

          {filters.showArchived && (
            <div className="quest-archive">
              <h3 className="quest-archive__heading">Archive</h3>
              <div className="quest-kanban quest-kanban--archive">
                {ARCHIVE_STATUSES.map(status => (
                  <KanbanColumn
                    key={status}
                    status={status}
                    quests={byStatus.get(status) ?? []}
                    onOpen={onOpen}
                    onDelete={onDelete}
                    onStatusChange={onStatusChange}
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Kanban column ────────────────────────────────────────────────────────────

interface KanbanColumnProps {
  status: QuestStatus;
  quests: QuestRecord[];
  onOpen: (id: number) => void;
  onDelete: (id: number) => void;
  onStatusChange: (id: number, status: QuestStatus) => void;
}

function KanbanColumn({ status, quests, onOpen, onDelete, onStatusChange }: KanbanColumnProps) {
  return (
    <div className="quest-column">
      <div className="quest-column__header">
        <span className="quest-column__dot" style={{ background: STATUS_DOT[status] }} />
        <span className="quest-column__title">{STATUS_LABELS[status]}</span>
        <span className="quest-column__count">{quests.length}</span>
      </div>
      <div className="quest-column__cards">
        {quests.length === 0 && (
          <div className="quest-column__empty">No quests</div>
        )}
        {quests.map(q => (
          <QuestCard
            key={q.id}
            quest={q}
            onOpen={() => onOpen(q.id)}
            onDelete={() => onDelete(q.id)}
            onStatusChange={(s) => onStatusChange(q.id, s)}
          />
        ))}
      </div>
    </div>
  );
}

// ── Quest card ───────────────────────────────────────────────────────────────

interface QuestCardProps {
  quest: QuestRecord;
  onOpen: () => void;
  onDelete: () => void;
  onStatusChange: (status: QuestStatus) => void;
}

function QuestCard({ quest, onOpen, onDelete, onStatusChange }: QuestCardProps) {
  const d = quest.data;
  const { min, max } = d.difficulty.level_range;
  const levelTxt = min === max ? `Lvl ${min}` : `Lvl ${min}-${max}`;

  return (
    <div className="quest-card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="quest-card__title-row">
        <span className="quest-card__title">{d.title || '(untitled)'}</span>
        {d.ai_generated && <span className="quest-card__ai-badge" title="AI-generated">✨</span>}
      </div>
      {d.pitch && <div className="quest-card__pitch">{d.pitch}</div>}
      <div className="quest-card__meta">
        <span className="quest-card__chip">{labelFor('scopes', d.scope)}</span>
        <span className="quest-card__chip quest-card__chip--diff">{levelTxt}</span>
        {d.tones[0] && (
          <span className="quest-card__chip quest-card__chip--tone">
            {labelFor('tones', d.tones[0])}
          </span>
        )}
      </div>
      <div className="quest-card__footer" onClick={e => e.stopPropagation()}>
        <select
          className="quest-card__status-select"
          value={d.status}
          onChange={e => onStatusChange(e.target.value as QuestStatus)}
          title="Change status"
        >
          {ALL_STATUSES.map(s => (
            <option key={s} value={s}>{STATUS_LABELS[s]}</option>
          ))}
        </select>
        <button
          className="quest-card__delete"
          onClick={onDelete}
          title="Delete"
          aria-label="Delete quest"
        >
          🗑
        </button>
      </div>
    </div>
  );
}
