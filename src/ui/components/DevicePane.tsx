import type { RefObject } from 'react';
import { Check, Copy, Lock } from 'lucide-react';
import type { Finding, RunOutcome } from '@/core';
import { BorderBeam } from '@/components/vendor/border-beam';
import { cn } from '@/lib/utils';
import { normalizePlaceholderKey, uniqueFindingCount } from '../ui-format';
import { FindingsList } from './FindingsList';
import { renderMarkedInputText, renderRestoredAnswer } from './MarkedText';
import { SimulatedTag } from './SimulatedTag';

export interface DevicePaneProps {
  isRunning: boolean;
  inputTextareaId: string;
  text: string;
  setText: (text: string) => void;
  setOutcome: (outcome: RunOutcome | null) => void;
  isEditing: boolean;
  setIsEditing: (editing: boolean | ((prev: boolean) => boolean)) => void;
  displayedFindings: readonly Finding[];
  activePlaceholder: string | null;
  setActivePlaceholder: (placeholder: string | null) => void;
  deviceAnchorRef?: RefObject<HTMLDivElement | null>;
  outcome: RunOutcome | null;
  vaultEntries: ReadonlyArray<{ placeholder: string; value: string; type: Finding['type'] }>;
  copied: boolean;
  onCopyAnswer: () => void;
}

export function DevicePane({
  isRunning,
  inputTextareaId,
  text,
  setText,
  setOutcome,
  isEditing,
  setIsEditing,
  displayedFindings,
  activePlaceholder,
  setActivePlaceholder,
  deviceAnchorRef,
  outcome,
  vaultEntries,
  copied,
  onCopyAnswer,
}: DevicePaneProps) {
  const findingCount = uniqueFindingCount(displayedFindings);

  return (
    <section
      aria-labelledby="heading-on-device"
      className="relative border border-ink bg-device-sage p-4 sm:p-5"
    >
      {isRunning && (
        <BorderBeam size={110} duration={4} colorFrom="#2B59E8" colorTo="#F4C04E" />
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/30 pb-3">
        <h2 id="heading-on-device" className="text-lg font-bold tracking-tight text-ink">
          On this device
        </h2>
        <span className="font-mono text-xs text-ink/75">InferenceMode.ONLY_ON_DEVICE</span>
      </div>

      <div className="mt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label htmlFor={inputTextareaId} className="text-xs font-semibold text-ink">
            1. Original text with personal values marked
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-ink/75">
              {findingCount} {findingCount === 1 ? 'finding' : 'findings'}
            </span>
            <button
              type="button"
              onClick={() => setIsEditing(prev => !prev)}
              className="border border-ink bg-fog px-2 py-0.5 text-xs font-semibold text-ink hover:bg-ink hover:text-fog"
            >
              {isEditing ? 'Done editing' : 'Edit text'}
            </button>
          </div>
        </div>

        {isEditing ? (
          <div className="mt-2 space-y-2">
            <textarea
              id={inputTextareaId}
              aria-label="Input text"
              rows={5}
              value={text}
              onChange={e => {
                setText(e.target.value);
                setOutcome(null);
              }}
              className="w-full border border-ink bg-fog p-3 font-mono text-sm leading-relaxed text-ink"
            />
            <div
              data-testid="live-marked-preview"
              className="border border-ink/40 bg-fog/80 p-3 font-mono text-xs leading-relaxed text-ink whitespace-pre-wrap"
            >
              {renderMarkedInputText(
                text,
                displayedFindings,
                activePlaceholder,
                setActivePlaceholder,
              )}
            </div>
          </div>
        ) : (
          <div
            data-testid="marked-input"
            onClick={() => setIsEditing(true)}
            className="mt-2 min-h-[124px] cursor-text border border-ink bg-fog p-3 font-mono text-sm leading-relaxed text-ink whitespace-pre-wrap"
          >
            {text ? (
              renderMarkedInputText(
                text,
                displayedFindings,
                activePlaceholder,
                setActivePlaceholder,
              )
            ) : (
              <span className="text-ink/50">Click to enter text or choose a sample above.</span>
            )}
          </div>
        )}
      </div>

      <div
        ref={deviceAnchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 right-1 h-2 w-2"
      />

      <div className="mt-4 border-t border-ink/30 pt-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
            <span>In-memory vault (never sent)</span>
          </h3>
          {outcome?.simulated && <SimulatedTag />}
        </div>

        {vaultEntries.length > 0 ? (
          <ul data-testid="vault-list" className="mt-2 flex flex-wrap gap-1.5">
            {vaultEntries.map(entry => {
              const isActive =
                activePlaceholder !== null &&
                normalizePlaceholderKey(activePlaceholder) ===
                  normalizePlaceholderKey(entry.placeholder);
              return (
                <li
                  key={entry.placeholder}
                  tabIndex={0}
                  onMouseEnter={() => setActivePlaceholder(entry.placeholder)}
                  onMouseLeave={() => setActivePlaceholder(null)}
                  onFocus={() => setActivePlaceholder(entry.placeholder)}
                  onBlur={() => setActivePlaceholder(null)}
                  className={cn(
                    'border border-ink bg-marker-amber px-2 py-0.5 font-mono text-xs text-ink',
                    isActive && 'ring-2 ring-boundary-blue',
                  )}
                >
                  {entry.placeholder} = {entry.value}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-1.5 font-mono text-xs text-ink/70">
            {outcome
              ? 'No personal values stored for this run.'
              : 'Populated in page memory when you press Run.'}
          </p>
        )}
      </div>

      <FindingsList
        findings={displayedFindings}
        onHoverPlaceholder={setActivePlaceholder}
        showSimulatedTag={outcome?.simulated === true}
      />

      <div className="mt-4 border-t border-ink/30 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h3 className="text-xs font-semibold text-ink">Restored answer on this device</h3>
            {outcome?.kind === 'answered' && outcome.simulated && (
              <SimulatedTag data-testid="answer-simulated-tag" />
            )}
          </div>

          {outcome?.kind === 'answered' && (
            <button
              type="button"
              onClick={() => void onCopyAnswer()}
              className="inline-flex items-center gap-1 border border-ink bg-fog px-2.5 py-1 text-xs font-semibold text-ink hover:bg-ink hover:text-fog"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Copy</span>
                </>
              )}
            </button>
          )}
        </div>

        {outcome?.kind === 'answered' ? (
          <div
            data-testid="restored-answer"
            className="mt-2 border border-ink bg-fog p-3 font-mono text-sm leading-relaxed text-ink whitespace-pre-wrap"
          >
            {renderRestoredAnswer(outcome, vaultEntries)}
          </div>
        ) : (
          <div className="mt-2 border border-ink/40 bg-fog/60 p-3 text-xs text-ink/70">
            {outcome?.kind === 'blocked'
              ? 'Run was blocked before generating an answer.'
              : 'Press Run to redact locally and restore the final answer on this device.'}
          </div>
        )}
      </div>
    </section>
  );
}