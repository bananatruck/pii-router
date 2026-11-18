import { Sparkles } from 'lucide-react';

export function SimulatedBanner() {
  return (
    <div
      role="status"
      data-testid="simulated-banner"
      className="border-b border-ink bg-marker-amber px-4 py-2.5 text-sm font-medium text-ink"
    >
      <div className="mx-auto flex max-w-[1400px] items-center gap-2">
        <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
        <p>
          Simulated demo. No model is running: a deterministic stand-in plays both Gemini Nano and the cloud model so you can see the flow. Results are not model output.
        </p>
      </div>
    </div>
  );
}