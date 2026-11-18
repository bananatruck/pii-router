import type { RefObject } from 'react';
import { ShieldCheck } from 'lucide-react';
import type { RunOutcome, TraceStep } from '@/core';
import { TextGenerateEffect } from '@/components/vendor/text-generate-effect';
import { cn } from '@/lib/utils';
import { renderWithPlaceholderChips } from './PlaceholderChips';
import { SimulatedTag } from './SimulatedTag';

export interface CloudPaneProps {
  cloudAnchorRef: RefObject<HTMLDivElement | null>;
  outcome: RunOutcome | null;
  egressStep: TraceStep | undefined;
  activePlaceholder: string | null;
  setActivePlaceholder: (placeholder: string | null) => void;
}

export function CloudPane({
  cloudAnchorRef,
  outcome,
  egressStep,
  activePlaceholder,
  setActivePlaceholder,
}: CloudPaneProps) {
  return (
    <section
      aria-labelledby="heading-sent-cloud"
      className="relative border border-ink bg-cloud-slate p-4 sm:p-5"
    >
      <div
        ref={cloudAnchorRef}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1 h-2 w-2"
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-ink/30 pb-3">
        <div className="flex items-center gap-2">
          <h2 id="heading-sent-cloud" className="text-lg font-bold tracking-tight text-ink">
            Sent to the cloud
          </h2>
          {outcome && outcome.simulated && <SimulatedTag data-testid="cloud-simulated-tag" />}
        </div>
        <span className="font-mono text-xs text-ink/75">InferenceMode.ONLY_IN_CLOUD</span>
      </div>

      {outcome?.kind === 'blocked' ? (
        <div data-testid="cloud-blocked-panel" className="mt-4 border border-stop-red bg-fog p-4">
          <p className="text-sm font-bold text-stop-red">
            {outcome.reason === 'detector-wrong-source'
              ? 'The text may have left this device.'
              : 'Nothing was sent.'}
          </p>
          <p className="mt-1 text-xs text-ink/80">{outcome.message}</p>
          {egressStep && !egressStep.ok && (
            <p className="mt-2 font-mono text-xs text-stop-red">
              Egress guard failed: {egressStep.note}
            </p>
          )}
        </div>
      ) : outcome?.kind === 'answered' && outcome.route === 'device-only' ? (
        <div data-testid="cloud-device-only-panel" className="mt-4 border border-ink bg-fog p-4">
          <p className="text-sm font-bold text-ink">Nothing left this device.</p>
          <p className="mt-1 text-xs text-ink/80">
            The whole task ran on Gemini Nano on this device without calling the cloud model.
          </p>
        </div>
      ) : outcome && outcome.trace.outboundPayload !== null ? (
        <div className="mt-4 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-ink">2. Outbound redacted payload</h3>
              <span className="text-xs text-ink/75">Exact string passed to cloud generate()</span>
            </div>
            <div
              data-testid="outbound-payload"
              className="mt-2 border border-ink bg-fog p-3 font-mono text-sm leading-relaxed text-ink whitespace-pre-wrap"
            >
              {renderWithPlaceholderChips(
                outcome.trace.outboundPayload,
                activePlaceholder,
                setActivePlaceholder,
              )}
            </div>
          </div>

          <div
            data-testid="egress-guard-status"
            className={cn(
              'flex flex-wrap items-center justify-between gap-2 border px-3 py-2 text-xs font-semibold',
              egressStep?.ok !== false
                ? 'border-boundary-blue bg-fog text-ink'
                : 'border-stop-red bg-fog text-stop-red',
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-boundary-blue" aria-hidden="true" />
              {egressStep?.ok !== false
                ? 'Egress guard passed'
                : `Egress guard failed: ${egressStep.note}`}
            </span>
            <span className="font-mono text-[11px] text-boundary-blue">
              {egressStep?.note ?? '0 personal values in outbound payload'}
            </span>
          </div>

          {outcome.trace.cloudReply !== null && (
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-semibold text-ink">3. Cloud reply with placeholders intact</h3>
                <span className="text-xs text-ink/75">Returned across boundary</span>
              </div>
              <div data-testid="cloud-reply" className="mt-2 border border-ink bg-fog p-3">
                <TextGenerateEffect
                  words={outcome.trace.cloudReply}
                  renderWord={(word, idx) =>
                    renderWithPlaceholderChips(word, activePlaceholder, setActivePlaceholder).map(
                      (node, subIdx) => (
                        <span key={`${idx}-${subIdx}`}>{node}</span>
                      ),
                    )
                  }
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-4 border border-ink/40 bg-fog/70 p-4 text-xs leading-relaxed text-ink/75">
          Press Run to inspect the exact outbound payload. Raw personal values stay in page memory on the left; only bracketed placeholders like{' '}
          <span className="border border-boundary-blue bg-fog px-1 py-0.5 font-mono text-boundary-blue">
            [PERSON_1]
          </span>{' '}
          may cross the trust boundary.
        </div>
      )}
    </section>
  );
}