/**
 * GenerateQuestDialog — modal that gathers AI generation parameters.
 *
 * Stage 3: adds an AI model picker (Opus / Sonnet / GPT), a length + detail
 * two-axis picker with scope-dependent labels, and a live token + USD/EUR
 * cost estimate. Always rendered as a modal — the "before I open the editor"
 * step.
 */

import { useMemo, useState } from 'react';
import type { PartyInfo } from '../../rules-engine/quests/defaultQuest';
import type { FullQuestPromptParams, QuestAIModel } from '../../rules-engine/quests/questPrompts';
import { QUEST_VOCABULARY } from '../../rules-engine/quests/questPrompts';
import type {
  DifficultyTier,
  QuestScope,
  QuestType,
  QuestTone,
  QuestEnvironment,
  QuestPrimaryChallenge,
  QuestAntagonistType,
} from '../../rules-engine/quests/questSchema';
import { ALL_DIFFICULTY_TIERS } from '../../rules-engine/quests/questSchema';
import {
  type Tier,
  MODEL_OPTIONS,
  DETAIL_TIER_NAMES,
  LENGTH_LABELS_BY_SCOPE,
  SCOPES_WITHOUT_LENGTH,
  SCOPE_DEFAULTS,
  LARGE_GENERATION_THRESHOLD,
  calculateMaxTokens,
  applyTokenCap,
  estimateMaxCostUSD,
  formatPrice,
  readDefaultModel,
} from './aiGenConfig';

const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  easy: 'Easy',
  standard: 'Standard',
  tough: 'Hard',
  deadly: 'Deadly',
};

const TIERS: Tier[] = [0, 1, 2, 3, 4];
const INITIAL_SCOPE: QuestScope = 'side_quest';

// ── Component ────────────────────────────────────────────────────────────────

interface GenerateQuestDialogProps {
  party: PartyInfo | undefined;
  generating: boolean;
  onGenerate: (params: FullQuestPromptParams) => void;
  onClose: () => void;
}

export function GenerateQuestDialog({ party, generating, onGenerate, onClose }: GenerateQuestDialogProps) {
  // Pre-fill from party if available
  const defaultLevel = party ? Math.max(1, Math.round(party.avg_level)) : 3;
  const defaultSize = party?.size ?? 4;

  // — Quest setup —
  const [scope, setScope] = useState<QuestScope>(INITIAL_SCOPE);
  const [partySize, setPartySize] = useState(defaultSize);
  const [partyLevel, setPartyLevel] = useState(defaultLevel);
  const [difficulty, setDifficulty] = useState<DifficultyTier>('standard');

  // — AI settings —
  const [model, setModel] = useState<QuestAIModel>(() => readDefaultModel());
  const [lengthIdx, setLengthIdx] = useState<Tier>(() => SCOPE_DEFAULTS[INITIAL_SCOPE].length);
  const [detailIdx, setDetailIdx] = useState<Tier>(() => SCOPE_DEFAULTS[INITIAL_SCOPE].detail);
  // Once the user picks length/detail themselves, scope changes stop overriding it.
  const [lengthDetailTouched, setLengthDetailTouched] = useState(false);

  // — Quest vibe —
  const [questTypes, setQuestTypes] = useState<QuestType[]>([]);
  const [tones, setTones] = useState<QuestTone[]>([]);
  const [environments, setEnvironments] = useState<QuestEnvironment[]>([]);
  const [primaryChallenges, setPrimaryChallenges] = useState<QuestPrimaryChallenge[]>([]);
  const [antagonistTypes, setAntagonistTypes] = useState<QuestAntagonistType[]>([]);

  // — Complications & dilemma —
  const [includeMoralDilemma, setIncludeMoralDilemma] = useState(false);
  const [includeComplications, setIncludeComplications] = useState(0);

  const [customPrompt, setCustomPrompt] = useState('');

  // ── Derived: token + cost estimate ─────────────────────────────────────────

  const hideLength = SCOPES_WITHOUT_LENGTH.has(scope);
  const effectiveLengthIdx: Tier = hideLength ? 0 : lengthIdx;

  const { capped, warning, isLarge, maxCost } = useMemo(() => {
    const raw = calculateMaxTokens(scope, effectiveLengthIdx, detailIdx);
    const cap = applyTokenCap(raw, model);
    return {
      capped: cap.capped,
      warning: cap.warning,
      isLarge: cap.warning !== null || cap.capped > LARGE_GENERATION_THRESHOLD,
      maxCost: estimateMaxCostUSD(model, cap.capped),
    };
  }, [scope, effectiveLengthIdx, detailIdx, model]);

  // ── Handlers ───────────────────────────────────────────────────────────────

  const handleScopeChange = (next: QuestScope) => {
    setScope(next);
    if (!lengthDetailTouched) {
      setLengthIdx(SCOPE_DEFAULTS[next].length);
      setDetailIdx(SCOPE_DEFAULTS[next].detail);
    }
  };

  const pickLength = (idx: Tier) => {
    setLengthIdx(idx);
    setLengthDetailTouched(true);
  };
  const pickDetail = (idx: Tier) => {
    setDetailIdx(idx);
    setLengthDetailTouched(true);
  };

  const handleSubmit = () => {
    const params: FullQuestPromptParams = {
      scope,
      quest_types: questTypes,
      tones,
      environments,
      primary_challenges: primaryChallenges,
      antagonist_types: antagonistTypes,
      include_moral_dilemma: includeMoralDilemma,
      include_complications: includeComplications,
      party_size: partySize,
      party_level: partyLevel,
      difficulty,
      custom_prompt: customPrompt,
      model,
      max_tokens: capped,
    };
    onGenerate(params);
  };

  // Toggle helper
  function toggle<T extends string>(list: T[], setList: (l: T[]) => void, value: T, max: number) {
    if (list.includes(value)) {
      setList(list.filter(v => v !== value));
    } else if (list.length < max) {
      setList([...list, value]);
    }
  }

  const lengthLabels = LENGTH_LABELS_BY_SCOPE[scope];

  return (
    <div className="quest-modal-backdrop" onClick={onClose}>
      <div className="quest-modal quest-modal--generate" onClick={e => e.stopPropagation()}>
        <div className="quest-modal__header">
          <h2>Generate Quest with AI</h2>
          <button className="quest-modal__close" onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className="quest-modal__body">
          {!party && (
            <div className="quest-banner quest-banner--info">
              No party data found. Enter values manually below.
            </div>
          )}

          {/* ─── Quest Setup ─── */}
          <SectionDivider title="Quest Setup" />
          <div className="quest-gen__grid">
            <Section title="Scope">
              <select value={scope} onChange={e => handleScopeChange(e.target.value as QuestScope)}>
                {QUEST_VOCABULARY.scopes.map(s => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </select>
            </Section>

            <Section title="Difficulty">
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyTier)}>
                {ALL_DIFFICULTY_TIERS.map(t => (
                  <option key={t} value={t}>{DIFFICULTY_LABELS[t]}</option>
                ))}
              </select>
            </Section>

            <Section title="Party">
              <div className="quest-gen__row">
                <label>
                  Size:
                  <input
                    type="number" min={1} max={10}
                    value={partySize}
                    onChange={e => setPartySize(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </label>
                <label>
                  Level:
                  <input
                    type="number" min={1} max={30}
                    value={partyLevel}
                    onChange={e => setPartyLevel(Math.max(1, parseInt(e.target.value) || 1))}
                  />
                </label>
              </div>
            </Section>
          </div>

          {/* ─── AI Settings ─── */}
          <SectionDivider title="AI Settings" />

          <div className="quest-gen__section">
            <label className="quest-gen__label">Model</label>
            <div className="quest-ai__models">
              {MODEL_OPTIONS.map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  className={`quest-ai__model ${model === opt.id ? 'is-selected' : ''}`}
                  onClick={() => setModel(opt.id)}
                >
                  <span className="quest-ai__model-radio">{model === opt.id ? '●' : '○'}</span>
                  <span className="quest-ai__model-text">
                    <span className="quest-ai__model-name">
                      {opt.label}
                      {opt.isDefault && <span className="quest-ai__default-chip">DEFAULT</span>}
                    </span>
                    <span className="quest-ai__model-desc">{opt.description}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {!hideLength && (
            <div className="quest-gen__section">
              <label className="quest-gen__label">Length</label>
              <div className="quest-ai__pills">
                {TIERS.map(idx => (
                  <button
                    key={idx}
                    type="button"
                    className={`quest-tag ${lengthIdx === idx ? 'quest-tag--selected' : ''}`}
                    onClick={() => pickLength(idx)}
                  >
                    {lengthLabels[idx]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="quest-gen__section">
            <label className="quest-gen__label">Detail</label>
            <div className="quest-ai__pills">
              {TIERS.map(idx => (
                <button
                  key={idx}
                  type="button"
                  className={`quest-tag ${detailIdx === idx ? 'quest-tag--selected' : ''}`}
                  onClick={() => pickDetail(idx)}
                >
                  {DETAIL_TIER_NAMES[idx]}
                </button>
              ))}
            </div>
          </div>

          <div className="quest-ai__estimate">
            ▸ Estimated tokens: <strong>~{capped.toLocaleString()}</strong>
            &ensp;·&ensp; Max cost: <strong>{formatPrice(maxCost)}</strong>
          </div>

          {isLarge && (
            <div className="quest-banner quest-banner--info quest-ai__warning">
              ⚠ {warning ??
                `Large generation (~${capped.toLocaleString()} tokens). This will be slow and ` +
                `relatively expensive. Consider a lower detail level or shorter length.`}
            </div>
          )}

          {/* ─── Quest Vibe ─── */}
          <SectionDivider title="Quest Vibe" />

          <TagSection
            title="Quest types"
            help="Pick up to 3 — AI chooses if empty"
            options={QUEST_VOCABULARY.quest_types}
            selected={questTypes}
            onToggle={v => toggle(questTypes, setQuestTypes, v as QuestType, 3)}
          />
          <TagSection
            title="Tones"
            help="Pick up to 2"
            options={QUEST_VOCABULARY.tones}
            selected={tones}
            onToggle={v => toggle(tones, setTones, v as QuestTone, 2)}
          />
          <TagSection
            title="Environments"
            help="Pick up to 3"
            options={QUEST_VOCABULARY.environments}
            selected={environments}
            onToggle={v => toggle(environments, setEnvironments, v as QuestEnvironment, 3)}
          />
          <TagSection
            title="Challenges"
            help="Pick up to 3"
            options={QUEST_VOCABULARY.primary_challenges}
            selected={primaryChallenges}
            onToggle={v => toggle(primaryChallenges, setPrimaryChallenges, v as QuestPrimaryChallenge, 3)}
          />
          <TagSection
            title="Antagonists"
            help="Pick up to 2"
            options={QUEST_VOCABULARY.antagonist_types}
            selected={antagonistTypes}
            onToggle={v => toggle(antagonistTypes, setAntagonistTypes, v as QuestAntagonistType, 2)}
          />

          {/* ─── Complications & dilemma ─── */}
          <SectionDivider title="Complications & dilemma" />
          <div className="quest-gen__section">
            <div className="quest-gen__row">
              <label className="quest-gen__label" style={{ margin: 0 }}>Complications:</label>
              <div className="quest-ai__pills">
                {[0, 1, 2, 3].map(n => (
                  <button
                    key={n}
                    type="button"
                    className={`quest-tag ${includeComplications === n ? 'quest-tag--selected' : ''}`}
                    onClick={() => setIncludeComplications(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="quest-gen__checkbox">
              <input
                type="checkbox"
                checked={includeMoralDilemma}
                onChange={e => setIncludeMoralDilemma(e.target.checked)}
              />
              Include moral dilemma
            </label>
          </div>

          <Section title="Custom instructions (optional)">
            <textarea
              rows={4}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="E.g. 'Set the quest on the coast near Mistholm', 'include Mayor Aldric as the quest-giver', 'the antagonist should be tragically sympathetic'..."
            />
          </Section>
        </div>

        <div className="quest-modal__footer">
          <button className="quest-btn" onClick={onClose} disabled={generating}>
            Cancel
          </button>
          {isLarge && (
            <button
              className="quest-btn"
              disabled
              title="Stage 4 feature — splits long generations across multiple AI calls."
            >
              Generate in chunks (coming soon)
            </button>
          )}
          <button
            className="quest-btn quest-btn--primary"
            onClick={handleSubmit}
            disabled={generating}
          >
            {generating ? '⏳ Generating...' : '✨ Generate Quest'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function SectionDivider({ title }: { title: string }) {
  return <div className="quest-ai__divider"><span>{title}</span></div>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="quest-gen__section">
      <label className="quest-gen__label">{title}</label>
      {children}
    </div>
  );
}

interface TagSectionProps {
  title: string;
  help?: string;
  options: ReadonlyArray<{ slug: string; label: string; description: string }>;
  selected: string[];
  onToggle: (slug: string) => void;
}

function TagSection({ title, help, options, selected, onToggle }: TagSectionProps) {
  return (
    <div className="quest-gen__section">
      <label className="quest-gen__label">
        {title}
        {help && <span className="quest-gen__help"> — {help}</span>}
      </label>
      <div className="quest-gen__tags">
        {options.map(opt => (
          <button
            key={opt.slug}
            type="button"
            title={opt.description}
            className={`quest-tag ${selected.includes(opt.slug) ? 'quest-tag--selected' : ''}`}
            onClick={() => onToggle(opt.slug)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
