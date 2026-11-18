import { ShieldAlert } from 'lucide-react';
import type { RunOutcome } from '@/core';

export interface OutcomeAlertsProps {
  outcome: RunOutcome | null;
}

export function OutcomeAlerts({ outcome }: OutcomeAlertsProps) {
  if (!outcome) return null;

  if (outcome.kind === 'blocked') {
    return (
      <div
        data-testid="outcome-blocked"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 border-2 border-stop-red bg-fog px-4 py-3 text-sm text-ink"
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center gap-1 bg-stop-red px-2 py-0.5 text-xs font-bold text-fog">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Blocked
          </span>
          <span className="font-medium text-ink">{outcome.message}</span>
        </div>
        {outcome.simulated && (
          <span className="border border-ink bg-marker-amber px-2 py-0.5 text-xs font-semibold text-ink">
            Simulated
          </span>
        )}
      </div>
    );
  }

  if (outcome.kind === 'error') {
    return (
      <div
        data-testid="outcome-error"
        className="mb-4 flex flex-wrap items-center justify-between gap-2 border-2 border-stop-red bg-fog px-4 py-3 text-sm text-ink"
      >
        <span className="font-medium text-stop-red">{outcome.message}</span>
        {outcome.simulated && (
          <span className="border border-ink bg-marker-amber px-2 py-0.5 text-xs font-semibold text-ink">
            Simulated
          </span>
        )}
      </div>
    );
  }

  return null;
}