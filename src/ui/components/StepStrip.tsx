import type { RunOutcome } from '@/core';
import { cn } from '@/lib/utils';
import { STEP_LABELS } from '../ui-constants';
import { formatStepRanOn } from '../ui-format';
import { SimulatedTag } from './SimulatedTag';

export interface StepStripProps {
  outcome: RunOutcome | null;
}

export function StepStrip({ outcome }: StepStripProps) {
  return (
    <section aria-label="Execution steps" className="mt-4 border border-ink bg-fog p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xs font-bold text-ink">Pipeline trace steps</h2>
        {outcome?.simulated && <SimulatedTag />}
      </div>

      {outcome && outcome.trace.steps.length > 0 ? (
        <ol
          data-testid="step-strip"
          className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:auto-cols-fr xl:grid-flow-col xl:grid-cols-none"
        >
          {outcome.trace.steps.map((step, index) => (
            <li
              key={`${step.id}-${index}`}
              className={cn(
                'flex flex-col justify-between border p-2.5 text-xs',
                step.ok
                  ? step.ranOn.includes('cloud')
                    ? 'border-boundary-blue bg-cloud-slate text-ink'
                    : 'border-ink bg-device-sage text-ink'
                  : 'border-2 border-stop-red bg-stop-red/10 text-stop-red',
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-1.5">
                <span className="font-bold">
                  {index + 1}. {STEP_LABELS[step.id]}
                </span>
                <span
                  className={cn(
                    'border px-1.5 py-0.5 font-mono text-[10px] font-medium',
                    step.ok
                      ? 'border-ink/50 bg-fog text-ink'
                      : 'border-stop-red bg-stop-red text-fog',
                  )}
                >
                  {formatStepRanOn(step.ranOn)}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug opacity-90">{step.note}</p>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-xs text-ink/70">
          No steps recorded yet. Press Run to trace local detection, redaction, egress verification, and restoration.
        </p>
      )}
    </section>
  );
}