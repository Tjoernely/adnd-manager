/**
 * Type declarations for src/api/client.js
 *
 * This shim types the API methods the quest module uses. Other methods
 * exported by client.js remain available via the index signature fallback
 * (typed as `any`) — that way this shim doesn't break any existing imports
 * elsewhere in the codebase that use yet-to-be-typed methods.
 *
 * If you add more typed methods over time, the IDE will help catch mistakes
 * earlier. Keep the index signature fallback so partial typing is non-breaking.
 */

import type { QuestData, QuestRecord } from '../rules-engine/quests/questSchema';

// ── Record shapes returned from the API ──────────────────────────────────────

export interface CampaignCharacterRecord {
  id: number;
  data?: {
    name?: string;
    level?: number;
    class?: string;
    [k: string]: unknown;
  };
}

export interface NpcRecord {
  id: number;
  /** Name lives at row top level (DB column). */
  name?: string;
  is_hidden?: boolean;
  /** JSONB blob — race/class/affiliations/motivation/etc. */
  data: {
    /** Legacy: may be present on old rows. Top-level name is the primary source. */
    name?: string;
    affiliations?: Array<{
      type: string;
      ref_id: number | null;
      name: string;
      role: string;
    }>;
    [k: string]: unknown;
  };
}

// ── Request body shapes ──────────────────────────────────────────────────────

export interface CreateQuestBody {
  campaign_id: number;
  title: string;
  data: QuestData;
}

/**
 * NOTE: Update body shape is not 100% verified against server route.
 * Verified that create uses { title, data }; update is assumed to follow
 * the same shape but may differ. If update fails at runtime, check
 * server/routes/quests.js PATCH/PUT handler.
 */
export interface UpdateQuestBody {
  title?: string;
  data: QuestData;
}

export interface CreateNpcBody {
  campaign_id: number;
  name: string;
  is_hidden?: boolean;
  data: object;
}

/**
 * NOTE: Same caveat as UpdateQuestBody — update shape inferred from create,
 * not verified against server route. If it fails, check server/routes/npcs.js.
 */
export interface UpdateNpcBody {
  name?: string;
  is_hidden?: boolean;
  data?: object;
}

// ── Api surface ──────────────────────────────────────────────────────────────

export interface Api {
  /** Fallback for methods not yet explicitly typed in this shim. */
  [method: string]: any;

  // Quest API
  getQuests(campaignId: number): Promise<QuestRecord[]>;
  createQuest(body: CreateQuestBody): Promise<QuestRecord>;
  updateQuest(id: number, body: UpdateQuestBody): Promise<QuestRecord>;
  deleteQuest(id: number): Promise<void>;

  // Character API
  getCharacters(campaignId: number): Promise<CampaignCharacterRecord[]>;

  // NPC API
  getNpcs(campaignId: number): Promise<NpcRecord[]>;
  createNpc(body: CreateNpcBody): Promise<NpcRecord>;
  updateNpc(id: number, body: UpdateNpcBody): Promise<NpcRecord>;
}

export const api: Api;
