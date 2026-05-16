/**
 * GenerateQuestDialog — modal that gathers AI generation parameters.
 *
 * Always rendered as a modal regardless of editor view mode — this is the
 * "before I open the editor" step.
 */

import { useState } from 'react';
import type { PartyInfo } from '../../rules-engine/quests/defaultQuest';
import type { FullQuestPromptParams } from '../../rules-engine/quests/questPrompts';
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

const DIFFICULTY_LABELS: Record<DifficultyTier, string> = {
  easy: 'Let',
  standard: 'Standard',
  tough: 'Hård',
  deadly: 'Dødelig',
};

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

  const [scope, setScope] = useState<QuestScope>('side_quest');
  const [questTypes, setQuestTypes] = useState<QuestType[]>([]);
  const [tones, setTones] = useState<QuestTone[]>([]);
  const [environments, setEnvironments] = useState<QuestEnvironment[]>([]);
  const [primaryChallenges, setPrimaryChallenges] = useState<QuestPrimaryChallenge[]>([]);
  const [antagonistTypes, setAntagonistTypes] = useState<QuestAntagonistType[]>([]);
  const [includeMoralDilemma, setIncludeMoralDilemma] = useState(false);
  const [includeComplications, setIncludeComplications] = useState(0);
  const [partySize, setPartySize] = useState(defaultSize);
  const [partyLevel, setPartyLevel] = useState(defaultLevel);
  const [difficulty, setDifficulty] = useState<DifficultyTier>('standard');
  const [customPrompt, setCustomPrompt] = useState('');

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

  return (
    <div className="quest-modal-backdrop" onClick={onClose}>
      <div className="quest-modal quest-modal--generate" onClick={e => e.stopPropagation()}>
        <div className="quest-modal__header">
          <h2>Generér quest med AI</h2>
          <button className="quest-modal__close" onClick={onClose} aria-label="Luk">×</button>
        </div>

        <div className="quest-modal__body">
          {!party && (
            <div className="quest-banner quest-banner--info">
              Ingen party-data fundet. Indtast manuelt nedenfor.
            </div>
          )}

          <div className="quest-gen__grid">
            <Section title="Scope">
              <select value={scope} onChange={e => setScope(e.target.value as QuestScope)}>
                {QUEST_VOCABULARY.scopes.map(s => (
                  <option key={s.slug} value={s.slug}>{s.label}</option>
                ))}
              </select>
            </Section>

            <Section title="Party">
              <div className="quest-gen__row">
                <label>
                  Antal:
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

            <Section title="Sværhedsgrad">
              <select value={difficulty} onChange={e => setDifficulty(e.target.value as DifficultyTier)}>
                {ALL_DIFFICULTY_TIERS.map(t => (
                  <option key={t} value={t}>{DIFFICULTY_LABELS[t]}</option>
                ))}
              </select>
            </Section>
          </div>

          <TagSection
            title="Quest typer"
            help="Vælg op til 3 — AI vælger selv hvis tomt"
            options={QUEST_VOCABULARY.quest_types}
            selected={questTypes}
            onToggle={v => toggle(questTypes, setQuestTypes, v as QuestType, 3)}
          />

          <TagSection
            title="Toner / stemning"
            help="Vælg op til 2"
            options={QUEST_VOCABULARY.tones}
            selected={tones}
            onToggle={v => toggle(tones, setTones, v as QuestTone, 2)}
          />

          <TagSection
            title="Miljø"
            help="Vælg op til 3"
            options={QUEST_VOCABULARY.environments}
            selected={environments}
            onToggle={v => toggle(environments, setEnvironments, v as QuestEnvironment, 3)}
          />

          <TagSection
            title="Primær udfordring"
            help="Vælg op til 3"
            options={QUEST_VOCABULARY.primary_challenges}
            selected={primaryChallenges}
            onToggle={v => toggle(primaryChallenges, setPrimaryChallenges, v as QuestPrimaryChallenge, 3)}
          />

          <TagSection
            title="Antagonist"
            help="Vælg op til 2"
            options={QUEST_VOCABULARY.antagonist_types}
            selected={antagonistTypes}
            onToggle={v => toggle(antagonistTypes, setAntagonistTypes, v as QuestAntagonistType, 2)}
          />

          <Section title="Komplikationer & dilemma">
            <div className="quest-gen__row">
              <label>
                Antal komplikationer:
                <input
                  type="number" min={0} max={5}
                  value={includeComplications}
                  onChange={e => setIncludeComplications(Math.max(0, Math.min(5, parseInt(e.target.value) || 0)))}
                />
              </label>
              <label className="quest-gen__checkbox">
                <input
                  type="checkbox"
                  checked={includeMoralDilemma}
                  onChange={e => setIncludeMoralDilemma(e.target.checked)}
                />
                Inkluder moralsk dilemma
              </label>
            </div>
          </Section>

          <Section title="Ekstra DM-instruktioner (valgfrit)">
            <textarea
              rows={4}
              value={customPrompt}
              onChange={e => setCustomPrompt(e.target.value)}
              placeholder="F.eks. 'Quest skal udspille sig i kysten ved Mistholm', 'inkluder Borgmester Aldric som quest-giver', 'antagonisten skal være tragisk sympatisk'..."
            />
          </Section>
        </div>

        <div className="quest-modal__footer">
          <button className="quest-btn" onClick={onClose} disabled={generating}>
            Annullér
          </button>
          <button
            className="quest-btn quest-btn--primary"
            onClick={handleSubmit}
            disabled={generating}
          >
            {generating ? '⏳ Genererer...' : '✨ Generér quest'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

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
