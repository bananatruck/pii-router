import { SIMULATED_DETECTOR_HINT } from '../ui-constants';

export interface SimulatedTagProps {
  className?: string;
  'data-testid'?: string;
}

export function SimulatedTag({ className, 'data-testid': testId }: SimulatedTagProps) {
  return (
    <span
      data-testid={testId}
      title={SIMULATED_DETECTOR_HINT}
      className={
        className ??
        'border border-ink bg-marker-amber px-1.5 py-0.5 text-[11px] font-semibold text-ink'
      }
    >
      Simulated
    </span>
  );
}