import { FlaskConical } from 'lucide-react';

/** Where the README explains how to connect a real Firebase project and Gemini Nano. */
export const REAL_RUN_URL = 'https://github.com/bananatruck/pii-router#run-it-locally';

export function SimulatedBanner() {
  return (
    <div
      role="status"
      data-testid="simulated-banner"
      className="border-b border-ink bg-marker-amber px-4 py-2.5 text-sm font-medium text-ink"
    >
      <div className="mx-auto flex max-w-[1400px] items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Simulated demo. No model is running: a deterministic stand-in plays both Gemini Nano and the cloud model so you can see the flow. Results are not model output.{' '}
          The real Firebase AI Logic path has not been run against a live Firebase project or Gemini Nano yet.{' '}
          <a href={REAL_RUN_URL} className="font-semibold underline underline-offset-2">
            How to run it for real
          </a>
        </p>
      </div>
    </div>
  );
}
