import type { ModelStatus } from '@/core';
import { cn } from '@/lib/utils';
import type { AppMode } from '../useModels';
import { formatDeviceStatusPill } from '../ui-format';

export interface HeaderProps {
  mode: AppMode;
  setMode: (next: AppMode) => void;
  deviceStatus: ModelStatus;
  liveReason: string | null;
}

export function Header({ mode, setMode, deviceStatus, liveReason }: HeaderProps) {
  return (
    <header className="flex flex-col gap-3 border-b border-ink pb-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">PII Router</h1>
        <p className="text-sm text-ink/80 sm:text-base">
          Privacy-gated hybrid inference with Firebase AI Logic
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="status-nano"
          className={cn(
            'inline-flex items-center gap-1.5 border border-ink px-2.5 py-1 text-xs font-medium',
            deviceStatus.state === 'ready' ? 'bg-device-sage text-ink' : 'bg-fog text-ink',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              deviceStatus.state === 'ready'
                ? 'bg-ink'
                : deviceStatus.state === 'unavailable'
                  ? 'bg-stop-red'
                  : 'bg-marker-amber',
            )}
            aria-hidden="true"
          />
          {formatDeviceStatusPill(deviceStatus)}
          {deviceStatus.state === 'downloading' && typeof deviceStatus.fraction === 'number' && (
            <span>({Math.round(deviceStatus.fraction * 100)}%)</span>
          )}
          {mode === 'simulated' && <span className="font-normal text-ink/80">(simulated)</span>}
        </span>

        <span
          data-testid="status-firebase"
          className="inline-flex items-center gap-1.5 border border-ink bg-fog px-2.5 py-1 text-xs font-medium text-ink"
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              liveReason === null ? 'bg-boundary-blue' : 'bg-ink/40',
            )}
            aria-hidden="true"
          />
          {liveReason === null ? 'Firebase: connected' : 'Firebase: not set up'}
        </span>

        <span
          data-testid="status-mode"
          className={cn(
            'inline-flex items-center gap-1.5 border px-2.5 py-1 text-xs font-semibold',
            mode === 'live'
              ? 'border-boundary-blue bg-fog text-boundary-blue'
              : 'border-ink bg-marker-amber text-ink',
          )}
        >
          <span
            className={cn(
              'h-2 w-2 rounded-full',
              mode === 'live' ? 'bg-boundary-blue' : 'bg-ink',
            )}
            aria-hidden="true"
          />
          {mode === 'live' ? 'Live' : 'Simulated'}
        </span>

        <div
          role="group"
          aria-label="Execution mode"
          className="inline-flex items-center border border-ink bg-fog"
        >
          <button
            type="button"
            disabled={liveReason !== null}
            aria-pressed={mode === 'live'}
            onClick={() => setMode('live')}
            className={cn(
              'px-2.5 py-1 text-xs font-semibold transition-colors',
              mode === 'live' ? 'bg-ink text-fog' : 'bg-fog text-ink hover:bg-ink/10',
              liveReason !== null && 'cursor-not-allowed opacity-50 hover:bg-fog',
            )}
          >
            Live
          </button>
          <button
            type="button"
            aria-pressed={mode === 'simulated'}
            onClick={() => setMode('simulated')}
            className={cn(
              'border-l border-ink px-2.5 py-1 text-xs font-semibold transition-colors',
              mode === 'simulated' ? 'bg-ink text-fog' : 'bg-fog text-ink hover:bg-ink/10',
            )}
          >
            Simulated
          </button>
        </div>

        {liveReason !== null && (
          <span data-testid="live-disabled-reason" className="text-xs text-ink/75">
            {liveReason}
          </span>
        )}
      </div>
    </header>
  );
}