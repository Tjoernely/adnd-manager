/**
 * QuestModule — top-level container for quest management.
 *
 * Responsibilities:
 *   - Fetch quests + characters (for party info) from the API
 *   - Manage view mode (modal vs fullpage editor, persisted in localStorage)
 *   - Coordinate between list, editor, and generation dialog
 *   - Wire AI generation → save → finalize NPC affiliations pipeline
 *
 * ACTUAL API (verified against src/api/client.js + server/routes/quests.js):
 *   api.getQuests(campaignId): Promise<QuestRecord[]>
 *   api.createQuest({ campaign_id, title, data }): Promise<QuestRecord>
 *   api.updateQuest(id, { title?, data }): Promise<QuestRecord>
 *   api.deleteQuest(id): Promise<void>
 *   api.getCharacters(campaignId): Promise<Array<{id, data: {name, class, level, ...}}>>
 */

import { useEffect, useMemo, useState, useCallback } from 'react';
import { api } from '../../api/client';
import type { QuestData, QuestRecord, QuestStatus } from '../../rules-engine/quests/questSchema';
import { defaultQuest, type PartyInfo } from '../../rules-engine/quests/defaultQuest';
import {
  generateFullQuest,
  finalizeAffiliationsForCampaign,
  type GenerateFullQuestResult,
} from '../../rules-engine/quests/questAI';
import type { FullQuestPromptParams } from '../../rules-engine/quests/questPrompts';
import { QuestList } from './QuestList';
import { QuestEditor } from './QuestEditor';
import { GenerateQuestDialog } from './GenerateQuestDialog';
import './quests.css';

// ── View mode persistence ────────────────────────────────────────────────────

const VIEW_MODE_KEY = 'quest-editor-view-mode';
type ViewMode = 'modal' | 'fullpage';

function loadViewMode(): ViewMode {
  try {
    const v = localStorage.getItem(VIEW_MODE_KEY);
    return v === 'fullpage' ? 'fullpage' : 'modal';
  } catch {
    return 'modal';
  }
}

function saveViewMode(mode: ViewMode): void {
  try {
    localStorage.setItem(VIEW_MODE_KEY, mode);
  } catch {
    // localStorage may be disabled; that's fine
  }
}

// ── Party info derivation ────────────────────────────────────────────────────

interface CharacterLike {
  id: number;
  data?: { name?: string; level?: number; class?: string; [k: string]: unknown };
}

function deriveParty(characters: CharacterLike[]): PartyInfo | undefined {
  const withLevels = characters.filter(c => typeof c.data?.level === 'number');
  if (withLevels.length === 0) return undefined;
  const total = withLevels.reduce((sum, c) => sum + (c.data?.level as number), 0);
  return { size: withLevels.length, avg_level: total / withLevels.length };
}

// ── Component ────────────────────────────────────────────────────────────────

interface QuestModuleProps {
  campaignId: number;
}

export function QuestModule({ campaignId }: QuestModuleProps) {
  // — Data —
  const [quests, setQuests] = useState<QuestRecord[]>([]);
  const [characters, setCharacters] = useState<CharacterLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // — Editor state —
  const [editingQuestId, setEditingQuestId] = useState<number | null>(null);
  const [draftQuest, setDraftQuest] = useState<QuestData | null>(null);
  const [pendingResolution, setPendingResolution] = useState<GenerateFullQuestResult | null>(null);

  // — UI state —
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>(loadViewMode);
  const [generating, setGenerating] = useState(false);

  // — Banner messages —
  const [banner, setBanner] = useState<{ kind: 'info' | 'error' | 'success'; text: string } | null>(null);

  const party = useMemo(() => deriveParty(characters), [characters]);

  // ── Data load ──────────────────────────────────────────────────────────────

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [q, c] = await Promise.all([
        api.getQuests(campaignId),
        api.getCharacters(campaignId),
      ]);
      setQuests(q ?? []);
      setCharacters(c ?? []);
    } catch (err) {
      setError(`Could not load data: ${(err as Error).message ?? err}`);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  // ── View mode toggle ───────────────────────────────────────────────────────

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next: ViewMode = prev === 'modal' ? 'fullpage' : 'modal';
      saveViewMode(next);
      return next;
    });
  }, []);

  // ── Editor open/close ──────────────────────────────────────────────────────

  const openEditor = useCallback((questId: number | null, draft?: QuestData) => {
    setEditingQuestId(questId);
    if (draft) setDraftQuest(draft);
    else if (questId) {
      const found = quests.find(q => q.id === questId);
      setDraftQuest(found ? { ...found.data } : null);
    } else {
      setDraftQuest(defaultQuest(party));
    }
  }, [quests, party]);

  const closeEditor = useCallback(() => {
    setEditingQuestId(null);
    setDraftQuest(null);
    setPendingResolution(null);
  }, []);

  // ── New blank quest ────────────────────────────────────────────────────────

  const handleNewQuest = useCallback(() => {
    setEditingQuestId(null);
    setDraftQuest(defaultQuest(party));
  }, [party]);

  // ── Save quest (create or update) ──────────────────────────────────────────

  const handleSave = useCallback(async (data: QuestData) => {
    try {
      let savedId: number;
      let savedRecord: QuestRecord;

      if (editingQuestId == null) {
        // Server expects { campaign_id, title, data } — title is hoisted out of data
        savedRecord = await api.createQuest({
          campaign_id: campaignId,
          title: data.title,
          data,
        });
        savedId = savedRecord.id;
      } else {
        // Update follows same shape — title hoisted alongside data
        savedRecord = await api.updateQuest(editingQuestId, {
          title: data.title,
          data,
        });
        savedId = savedRecord.id;
      }

      // If this save came from AI generation, finalize NPC affiliations
      if (pendingResolution && pendingResolution.resolvedNPCs.entries.length > 0) {
        try {
          await finalizeAffiliationsForCampaign(
            savedId,
            data.title,
            campaignId,
            pendingResolution.resolvedNPCs,
          );
        } catch (err) {
          console.warn('NPC affiliations finalization failed:', err);
          // Non-fatal — quest is saved
        }
      }

      setBanner({ kind: 'success', text: 'Quest saved.' });
      await refetch();
      closeEditor();
    } catch (err) {
      setBanner({ kind: 'error', text: `Save failed: ${(err as Error).message ?? err}` });
    }
  }, [campaignId, editingQuestId, pendingResolution, refetch, closeEditor]);

  // ── Delete quest ───────────────────────────────────────────────────────────

  const handleDelete = useCallback(async (questId: number) => {
    if (!confirm('Permanently delete this quest?')) return;
    try {
      await api.deleteQuest(questId);
      setBanner({ kind: 'success', text: 'Quest deleted.' });
      await refetch();
      if (editingQuestId === questId) closeEditor();
    } catch (err) {
      setBanner({ kind: 'error', text: `Delete failed: ${(err as Error).message ?? err}` });
    }
  }, [editingQuestId, refetch, closeEditor]);

  // ── Status change (kanban quick-action) ────────────────────────────────────

  const handleStatusChange = useCallback(async (questId: number, newStatus: QuestStatus) => {
    const quest = quests.find(q => q.id === questId);
    if (!quest) return;
    const updatedData: QuestData = { ...quest.data, status: newStatus };
    try {
      await api.updateQuest(questId, { title: updatedData.title, data: updatedData });
      await refetch();
    } catch (err) {
      setBanner({ kind: 'error', text: `Status change failed: ${(err as Error).message ?? err}` });
    }
  }, [quests, refetch]);

  // ── AI generation ──────────────────────────────────────────────────────────

  const handleGenerate = useCallback(async (params: FullQuestPromptParams) => {
    setGenerating(true);
    setBanner({ kind: 'info', text: 'Generating quest with AI...' });
    try {
      const result = await generateFullQuest(params, party, campaignId);
      setPendingResolution(result);
      setDraftQuest(result.quest);
      setEditingQuestId(null);
      setShowGenerateDialog(false);
      const createdCount = result.resolvedNPCs.created.length;
      const linkedCount = result.resolvedNPCs.linked.length;
      const npcMsg = createdCount + linkedCount > 0
        ? ` (${createdCount} new NPCs created, ${linkedCount} existing NPCs linked)`
        : '';
      setBanner({
        kind: 'info',
        text: `Quest generated${npcMsg}. Review and save to finalize.`,
      });
    } catch (err) {
      setBanner({ kind: 'error', text: `Generation failed: ${(err as Error).message ?? err}` });
    } finally {
      setGenerating(false);
    }
  }, [campaignId, party]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const isEditorOpen = draftQuest !== null;
  const isFullpage = isEditorOpen && viewMode === 'fullpage';

  return (
    <div className={`quest-module ${isFullpage ? 'quest-module--fullpage-active' : ''}`}>
      {banner && (
        <div className={`quest-banner quest-banner--${banner.kind}`}>
          <span>{banner.text}</span>
          <button className="quest-banner__close" onClick={() => setBanner(null)}>×</button>
        </div>
      )}

      {error && <div className="quest-banner quest-banner--error">{error}</div>}

      {!isFullpage && (
        <QuestList
          quests={quests}
          loading={loading}
          onNew={handleNewQuest}
          onGenerate={() => setShowGenerateDialog(true)}
          onOpen={(id) => openEditor(id)}
          onDelete={handleDelete}
          onStatusChange={handleStatusChange}
        />
      )}

      {isEditorOpen && draftQuest && (
        <QuestEditor
          questId={editingQuestId}
          initialData={draftQuest}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          onSave={handleSave}
          onClose={closeEditor}
          campaignId={campaignId}
          party={party}
        />
      )}

      {showGenerateDialog && (
        <GenerateQuestDialog
          party={party}
          generating={generating}
          onGenerate={handleGenerate}
          onClose={() => setShowGenerateDialog(false)}
        />
      )}
    </div>
  );
}

export default QuestModule;
