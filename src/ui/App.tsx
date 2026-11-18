import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Check,
  Copy,
  FileText,
  Lock,
  Play,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  detectPatterns,
  PLACEHOLDER_SOURCE,
  redactSegments,
  runPipeline,
  TASKS,
  type Finding,
  type ModelStatus,
  type RoutePreference,
  type RunOutcome,
  type TaskId,
  type TraceStep,
} from '@/core';
import { AnimatedBeam } from '@/components/vendor/animated-beam';
import { BorderBeam } from '@/components/vendor/border-beam';
import DecryptedText from '@/components/vendor/decrypted-text';
import { TextGenerateEffect } from '@/components/vendor/text-generate-effect';
import { cn } from '@/lib/utils';
import { SAMPLES, type SampleItem } from './samples';
import { useModels, type LiveModelSet } from './useModels';

export interface AppProps {
  liveModels?: LiveModelSet;
}

const TASK_IDS: readonly TaskId[] = ['summarize', 'rewrite', 'reply', 'custom'];

const ROUTE_OPTIONS: ReadonlyArray<{ value: RoutePreference; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'device', label: 'Keep on this device' },
  { value: 'cloud', label: 'Use the cloud (redacted)' },
];

const STEP_LABELS: Record<TraceStep['id'], string> = {
  patterns: 'Patterns',
  'device-detector': 'Gemini Nano',
  redact: 'Redact',
  route: 'Route',
  'egress-guard': 'Egress guard',
  'cloud-call': 'Cloud',
  'device-answer': 'Device answer',
  restore: 'Restore',
};

function formatDeviceStatusPill(status: ModelStatus): string {
  switch (status.state) {
    case 'ready':
      return 'Gemini Nano: ready';
    case 'needs-download':
      return 'Gemini Nano: needs download';
    case 'downloading':
      return 'Gemini Nano: downloading';
    case 'unavailable':
      return 'Gemini Nano: unavailable';
  }
}

function formatStepRanOn(
  ranOn: TraceStep['ranOn'],
): 'device' | 'cloud' | 'simulated device' | 'simulated cloud' {
  switch (ranOn) {
    case 'device':
      return 'device';
    case 'cloud':
      return 'cloud';
    case 'simulated-device':
      return 'simulated device';
    case 'simulated-cloud':
      return 'simulated cloud';
  }
}

function formatFindingSource(source: Finding['source']): 'Pattern' | 'Gemini Nano' {
  return source === 'pattern' ? 'Pattern' : 'Gemini Nano';
}

function normalizePlaceholderKey(token: string): string {
  return token.toUpperCase().replace(/[\s_-]/g, '');
}

/**
 * Splits a string on bracketed placeholders like [PERSON_1] while keeping every character intact.
 */
function renderWithPlaceholderChips(
  rawText: string,
  activePlaceholder: string | null,
  onHoverPlaceholder: (placeholder: string | null) => void,
): ReactNode[] {
  const regex = new RegExp(PLACEHOLDER_SOURCE, 'gi');
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;

  for (const match of rawText.matchAll(regex)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (start > cursor) {
      nodes.push(<span key={`txt-${idx}`}>{rawText.slice(cursor, start)}</span>);
    }
    const normalized = normalizePlaceholderKey(matched);
    const isActive =
      activePlaceholder !== null && normalizePlaceholderKey(activePlaceholder) === normalized;
    nodes.push(
      <span
        key={`chip-${idx}`}
        tabIndex={0}
        onMouseEnter={() => onHoverPlaceholder(matched)}
        onMouseLeave={() => onHoverPlaceholder(null)}
        onFocus={() => onHoverPlaceholder(matched)}
        onBlur={() => onHoverPlaceholder(null)}
        className={cn(
          'inline-block rounded-none border border-boundary-blue bg-fog px-1 py-0.5 font-mono text-xs font-medium text-boundary-blue transition-colors',
          isActive && 'bg-boundary-blue text-fog',
        )}
      >
        {matched}
      </span>,
    );
    cursor = start + matched.length;
    idx += 1;
  }

  if (cursor < rawText.length) {
    nodes.push(<span key="txt-tail">{rawText.slice(cursor)}</span>);
  }
  return nodes;
}

/**
 * Renders original text with non-overlapping amber <mark> highlights and hover/focus placeholder tags.
 */
function renderMarkedInputText(
  text: string,
  findings: readonly Finding[],
  activePlaceholder: string | null,
  onHoverPlaceholder: (placeholder: string | null) => void,
): ReactNode {
  const textFindings = findings
    .filter(f => f.segment === 'text' && f.start >= 0 && f.end > f.start && f.end <= text.length)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (textFindings.length === 0) {
    return <span>{text}</span>;
  }

  const elements: ReactNode[] = [];
  let cursor = 0;

  textFindings.forEach((finding, idx) => {
    if (finding.start < cursor) {
      return;
    }
    if (finding.start > cursor) {
      elements.push(
        <span key={`plain-${idx}`}>{text.slice(cursor, finding.start)}</span>,
      );
    }
    const slice = text.slice(finding.start, finding.end);
    const isActive =
      activePlaceholder !== null &&
      normalizePlaceholderKey(activePlaceholder) === normalizePlaceholderKey(finding.placeholder);

    elements.push(
      <mark
        key={`mark-${idx}-${finding.start}`}
        tabIndex={0}
        onMouseEnter={() => onHoverPlaceholder(finding.placeholder)}
        onMouseLeave={() => onHoverPlaceholder(null)}
        onFocus={() => onHoverPlaceholder(finding.placeholder)}
        onBlur={() => onHoverPlaceholder(null)}
        className={cn(
          'group relative inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink underline decoration-ink/40 decoration-1 underline-offset-2 transition-colors',
          isActive && 'ring-2 ring-boundary-blue',
        )}
      >
        <span>{slice}</span>
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute -top-6 left-0 z-20 whitespace-nowrap border border-ink bg-ink px-1.5 py-0.5 font-mono text-[11px] font-medium text-fog opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
            isActive && 'opacity-100',
          )}
        >
          {finding.placeholder}
        </span>
      </mark>,
    );
    cursor = finding.end;
  });

  if (cursor < text.length) {
    elements.push(<span key="plain-tail">{text.slice(cursor)}</span>);
  }

  return elements;
}

/**
 * Segments the restored answer so that each restored personal value is highlighted in amber
 * and animated from its placeholder with DecryptedText.
 */
function renderRestoredAnswer(
  outcome: Extract<RunOutcome, { kind: 'answered' }>,
  vaultEntries: ReadonlyArray<{ placeholder: string; value: string; type: Finding['type'] }>,
): ReactNode {
  const cloudReply = outcome.trace.cloudReply;
  if (cloudReply !== null && vaultEntries.length > 0) {
    const lookup = new Map(
      vaultEntries.map(entry => [normalizePlaceholderKey(entry.placeholder), entry]),
    );
    const regex = new RegExp(PLACEHOLDER_SOURCE, 'gi');
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let idx = 0;

    for (const match of cloudReply.matchAll(regex)) {
      const start = match.index ?? 0;
      const token = match[0];
      if (start > cursor) {
        nodes.push(<span key={`ans-txt-${idx}`}>{cloudReply.slice(cursor, start)}</span>);
      }
      const entry = lookup.get(normalizePlaceholderKey(token));
      if (entry) {
        nodes.push(
          <mark
            key={`ans-restored-${idx}`}
            className="inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink"
          >
            <DecryptedText
              text={entry.value}
              characters={entry.placeholder}
              animateOn="view"
              sequential
              speed={32}
              maxIterations={8}
            />
          </mark>,
        );
      } else {
        nodes.push(<span key={`ans-unres-${idx}`}>{token}</span>);
      }
      cursor = start + token.length;
      idx += 1;
    }

    if (cursor < cloudReply.length) {
      nodes.push(<span key="ans-tail">{cloudReply.slice(cursor)}</span>);
    }
    return nodes;
  }

  // Device-only route: highlight any finding values that appear in outcome.answer.
  const answer = outcome.answer;
  if (vaultEntries.length === 0) {
    return <span>{answer}</span>;
  }

  const hits: Array<{ start: number; end: number; value: string; placeholder: string }> = [];
  for (const entry of vaultEntries) {
    if (!entry.value) continue;
    let idx = answer.indexOf(entry.value);
    while (idx !== -1) {
      hits.push({
        start: idx,
        end: idx + entry.value.length,
        value: entry.value,
        placeholder: entry.placeholder,
      });
      idx = answer.indexOf(entry.value, idx + entry.value.length);
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping: typeof hits = [];
  for (const hit of hits) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || hit.start >= last.end) {
      nonOverlapping.push(hit);
    }
  }

  if (nonOverlapping.length === 0) {
    return <span>{answer}</span>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  nonOverlapping.forEach((hit, i) => {
    if (hit.start > cursor) {
      nodes.push(<span key={`dev-txt-${i}`}>{answer.slice(cursor, hit.start)}</span>);
    }
    nodes.push(
      <mark
        key={`dev-mark-${i}`}
        className="inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink"
      >
        <DecryptedText
          text={hit.value}
          characters={hit.placeholder}
          animateOn="view"
          sequential
          speed={32}
          maxIterations={8}
        />
      </mark>,
    );
    cursor = hit.end;
  });
  if (cursor < answer.length) {
    nodes.push(<span key="dev-tail">{answer.slice(cursor)}</span>);
  }
  return nodes;
}

export function App({ liveModels }: AppProps = {}) {
  const {
    mode,
    setMode,
    device,
    cloud,
    liveReason,
    deviceStatus,
    prepareDevice,
    refreshStatus,
  } = useModels({ liveModels });

  const [text, setText] = useState<string>(SAMPLES[0]?.text ?? '');
  const [debouncedText, setDebouncedText] = useState<string>(SAMPLES[0]?.text ?? '');
  const [task, setTask] = useState<TaskId>('rewrite');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [preference, setPreference] = useState<RoutePreference>('auto');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [sampleMenuOpen, setSampleMenuOpen] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);
  const [activePlaceholder, setActivePlaceholder] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const taskSelectId = useId();
  const customInstructionId = useId();
  const inputTextareaId = useId();

  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const deviceAnchorRef = useRef<HTMLDivElement | null>(null);
  const cloudAnchorRef = useRef<HTMLDivElement | null>(null);
  const sampleMenuRef = useRef<HTMLDivElement | null>(null);

  // Debounce pattern detection by ~150 ms while the user types.
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 150);
    return () => clearTimeout(timer);
  }, [text]);

  // Close sample menu on outside click or Escape.
  useEffect(() => {
    if (!sampleMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSampleMenuOpen(false);
      }
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (sampleMenuRef.current && !sampleMenuRef.current.contains(event.target as Node)) {
        setSampleMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('mousedown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mousedown', handlePointerDown);
    };
  }, [sampleMenuOpen]);

  const livePatternFindings = useMemo<Finding[]>(() => {
    const hits = detectPatterns(debouncedText);
    const { findings } = redactSegments(
      { instruction: '', text: debouncedText },
      hits.map(hit => ({ ...hit, segment: 'text' as const, source: 'pattern' as const })),
    );
    return findings;
  }, [debouncedText]);

  const displayedFindings = outcome ? outcome.trace.findings : livePatternFindings;

  const vaultEntries = useMemo(() => {
    if (!outcome) return [];
    const seen = new Set<string>();
    const list: Array<{ placeholder: string; value: string; type: Finding['type'] }> = [];
    for (const finding of outcome.trace.findings) {
      if (!seen.has(finding.placeholder)) {
        seen.add(finding.placeholder);
        list.push({
          placeholder: finding.placeholder,
          value: finding.value,
          type: finding.type,
        });
      }
    }
    return list;
  }, [outcome]);

  const handleSelectSample = (sample: SampleItem) => {
    setText(sample.text);
    setDebouncedText(sample.text);
    setOutcome(null);
    setIsEditing(false);
    setSampleMenuOpen(false);
  };

  const handleRun = async () => {
    if (isRunning) return;
    setIsRunning(true);
    setIsEditing(false);
    setCopied(false);
    try {
      const result = await runPipeline(
        {
          text,
          task,
          customInstruction: task === 'custom' ? customInstruction : undefined,
          preference,
        },
        { device, cloud },
      );
      setOutcome(result);
      await refreshStatus();
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyAnswer = async () => {
    if (outcome?.kind !== 'answered') return;
    try {
      await navigator.clipboard?.writeText(outcome.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const payloadCrossed = outcome?.trace.outboundPayload !== null && outcome?.trace.outboundPayload !== undefined;
  const egressStep = outcome?.trace.steps.find(s => s.id === 'egress-guard');

  return (
    <div className="min-h-screen bg-fog text-ink">
      {/* Simulated mode banner */}
      {mode === 'simulated' && (
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
      )}

      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        {/* Top Header */}
        <header className="flex flex-col gap-3 border-b border-ink pb-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">PII Router</h1>
            <p className="text-sm text-ink/80 sm:text-base">
              Privacy-gated hybrid inference with Firebase AI Logic
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Status pills */}
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

            {/* Mode switch */}
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

        {/* Controls Bar */}
        <section
          aria-label="Pipeline controls"
          className="flex flex-col gap-3 border-b border-ink py-3.5 lg:flex-row lg:items-center lg:justify-between"
        >
          <div className="flex flex-wrap items-center gap-3">
            {/* Task selector */}
            <div className="flex items-center gap-2">
              <label htmlFor={taskSelectId} className="text-sm font-semibold text-ink">
                Task
              </label>
              <select
                id={taskSelectId}
                aria-label="Task"
                value={task}
                onChange={e => setTask(e.target.value as TaskId)}
                className="border border-ink bg-fog px-3 py-1.5 text-sm font-medium text-ink"
              >
                {TASK_IDS.map(id => (
                  <option key={id} value={id}>
                    {TASKS[id].description}
                  </option>
                ))}
              </select>
            </div>

            {/* Route preference */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-ink">Route</span>
              <div
                role="group"
                aria-label="Route"
                className="inline-flex flex-wrap border border-ink bg-fog"
              >
                {ROUTE_OPTIONS.map((opt, idx) => {
                  const selected = preference === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setPreference(opt.value)}
                      className={cn(
                        'px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm',
                        idx > 0 && 'border-l border-ink',
                        selected ? 'bg-ink text-fog' : 'bg-fog text-ink hover:bg-ink/10',
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Sample menu */}
            <div ref={sampleMenuRef} className="relative">
              <button
                type="button"
                aria-expanded={sampleMenuOpen}
                aria-haspopup="menu"
                onClick={() => setSampleMenuOpen(prev => !prev)}
                className="inline-flex items-center gap-1.5 border border-ink bg-fog px-3 py-1.5 text-xs font-semibold text-ink hover:bg-ink/10 sm:text-sm"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Use sample
              </button>

              {sampleMenuOpen && (
                <div
                  role="menu"
                  aria-label="Sample texts"
                  className="absolute left-0 z-30 mt-1 w-48 border border-ink bg-fog py-1 shadow-none"
                >
                  {SAMPLES.map(sample => (
                    <button
                      key={sample.id}
                      type="button"
                      role="menuitem"
                      onClick={() => handleSelectSample(sample)}
                      className="block w-full px-3 py-1.5 text-left text-sm font-medium text-ink hover:bg-device-sage"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Prepare Gemini Nano button (only when needs-download) */}
            {deviceStatus.state === 'needs-download' && (
              <button
                type="button"
                onClick={() => prepareDevice()}
                className="border border-ink bg-marker-amber px-3 py-1.5 text-xs font-semibold text-ink hover:bg-marker-amber/80 sm:text-sm"
              >
                Prepare Gemini Nano
              </button>
            )}
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              disabled={isRunning}
              onClick={() => void handleRun()}
              className="relative inline-flex items-center justify-center gap-2 overflow-hidden border border-boundary-blue bg-boundary-blue px-5 py-2 text-sm font-semibold text-fog hover:bg-boundary-blue/90 disabled:cursor-wait disabled:opacity-80"
            >
              <Play className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>Run</span>
              {isRunning && <BorderBeam size={48} duration={2.5} colorFrom="#F4C04E" colorTo="#EDF0F3" />}
            </button>
          </div>
        </section>

        {/* Optional Custom Instruction Field */}
        {task === 'custom' && (
          <div className="border-b border-ink bg-device-sage/50 px-3 py-3">
            <label
              htmlFor={customInstructionId}
              className="block text-xs font-semibold text-ink"
            >
              Custom instruction (redacted on device before any cloud call)
            </label>
            <input
              id={customInstructionId}
              type="text"
              value={customInstruction}
              onChange={e => {
                setCustomInstruction(e.target.value);
                setOutcome(null);
              }}
              placeholder="For example: Extract action items for Dana Whitfield"
              className="mt-1.5 w-full border border-ink bg-fog px-3 py-1.5 font-mono text-sm text-ink"
            />
          </div>
        )}

        {/* Polite live region for outcome status */}
        <div aria-live="polite" className="mt-4">
          {outcome?.kind === 'blocked' && (
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
          )}

          {outcome?.kind === 'error' && (
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
          )}

          {/* Main Split Workspace: On this device | Trust boundary | Sent to the cloud */}
          <div ref={workspaceRef} className="relative">
            {/* Desktop Trust Boundary Top Cap - positioned in its own row so it never overlaps column headings */}
            <div className="hidden md:flex md:items-center md:justify-center">
              <div className="flex w-full items-center">
                <div className="h-px flex-1 bg-ink/30" />
                <span className="border border-boundary-blue bg-boundary-blue px-3 py-0.5 text-xs font-semibold text-fog">
                  Trust boundary
                </span>
                <div className="h-px flex-1 bg-ink/30" />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_3px_minmax(0,1fr)]">
              {/* LEFT COLUMN: ON THIS DEVICE */}
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
                  <span className="font-mono text-xs text-ink/75">
                    InferenceMode.ONLY_ON_DEVICE
                  </span>
                </div>

                {/* 1. Input Text / Marked View */}
                <div className="mt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label
                      htmlFor={inputTextareaId}
                      className="text-xs font-semibold text-ink"
                    >
                      1. Original text with personal values marked
                    </label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-ink/75">
                        {displayedFindings.length}{' '}
                        {displayedFindings.length === 1 ? 'finding' : 'findings'}
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
                        <span className="text-ink/50">
                          Click to enter text or choose a sample above.
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Anchor for AnimatedBeam source */}
                <div
                  ref={deviceAnchorRef}
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 right-1 h-2 w-2"
                />

                {/* In-memory vault (never sent) */}
                <div className="mt-4 border-t border-ink/30 pt-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
                      <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>In-memory vault (never sent)</span>
                    </h3>
                    {outcome?.simulated && (
                      <span className="border border-ink bg-marker-amber px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                        Simulated
                      </span>
                    )}
                  </div>

                  {vaultEntries.length > 0 ? (
                    <ul
                      data-testid="vault-list"
                      className="mt-2 flex flex-wrap gap-1.5"
                    >
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

                {/* Findings list: type, source ("Pattern" or "Gemini Nano"), placeholder */}
                <div className="mt-4 border-t border-ink/30 pt-3">
                  <h3 className="text-xs font-semibold text-ink">Findings</h3>
                  {displayedFindings.length > 0 ? (
                    <ul
                      data-testid="findings-list"
                      className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2"
                    >
                      {displayedFindings.map((finding, idx) => (
                        <li
                          key={`${finding.placeholder}-${finding.start}-${idx}`}
                          onMouseEnter={() => setActivePlaceholder(finding.placeholder)}
                          onMouseLeave={() => setActivePlaceholder(null)}
                          className="flex items-center justify-between gap-2 border border-ink/40 bg-fog px-2.5 py-1 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-ink">{finding.type}</span>
                            <span className="border border-ink/40 bg-device-sage px-1.5 py-0.2 text-[11px] font-medium text-ink">
                              {formatFindingSource(finding.source)}
                            </span>
                          </div>
                          <span className="font-mono font-medium text-boundary-blue">
                            {finding.placeholder}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1.5 text-xs text-ink/70">No findings detected.</p>
                  )}
                </div>

                {/* Restored answer on this device */}
                <div className="mt-4 border-t border-ink/30 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-xs font-semibold text-ink">
                        Restored answer on this device
                      </h3>
                      {outcome?.kind === 'answered' && outcome.simulated && (
                        <span
                          data-testid="answer-simulated-tag"
                          className="border border-ink bg-marker-amber px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                        >
                          Simulated
                        </span>
                      )}
                    </div>

                    {outcome?.kind === 'answered' && (
                      <button
                        type="button"
                        onClick={() => void handleCopyAnswer()}
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

              {/* TRUST BOUNDARY DIVIDER: vertical on >=768px, horizontal bar on <768px */}
              <div className="relative flex items-center justify-center bg-boundary-blue py-1.5 md:py-0">
                <span className="border border-fog bg-boundary-blue px-2.5 py-0.5 text-xs font-semibold text-fog md:hidden">
                  Trust boundary
                </span>
                {payloadCrossed && (
                  <span className="z-10 border border-fog bg-boundary-blue px-2 py-0.5 font-mono text-[11px] font-semibold text-fog md:absolute md:top-1/2 md:-translate-y-1/2 md:whitespace-nowrap">
                    redacted payload -&gt;
                  </span>
                )}
              </div>

              {/* RIGHT COLUMN: SENT TO THE CLOUD */}
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
                    <h2
                      id="heading-sent-cloud"
                      className="text-lg font-bold tracking-tight text-ink"
                    >
                      Sent to the cloud
                    </h2>
                    {outcome && outcome.simulated && (
                      <span
                        data-testid="cloud-simulated-tag"
                        className="border border-ink bg-marker-amber px-1.5 py-0.5 text-[11px] font-semibold text-ink"
                      >
                        Simulated
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-xs text-ink/75">
                    InferenceMode.ONLY_IN_CLOUD
                  </span>
                </div>

                {/* Right column content based on outcome */}
                {outcome?.kind === 'blocked' ? (
                  <div
                    data-testid="cloud-blocked-panel"
                    className="mt-4 border border-stop-red bg-fog p-4"
                  >
                    <p className="text-sm font-bold text-stop-red">Nothing was sent.</p>
                    <p className="mt-1 text-xs text-ink/80">{outcome.message}</p>
                    {egressStep && !egressStep.ok && (
                      <p className="mt-2 font-mono text-xs text-stop-red">
                        Egress guard failed: {egressStep.note}
                      </p>
                    )}
                  </div>
                ) : outcome?.kind === 'answered' && outcome.route === 'device-only' ? (
                  <div
                    data-testid="cloud-device-only-panel"
                    className="mt-4 border border-ink bg-fog p-4"
                  >
                    <p className="text-sm font-bold text-ink">Nothing left this device.</p>
                    <p className="mt-1 text-xs text-ink/80">
                      The whole task ran on Gemini Nano on this device without calling the cloud model.
                    </p>
                  </div>
                ) : outcome && outcome.trace.outboundPayload !== null ? (
                  <div className="mt-4 space-y-4">
                    {/* 2. Outbound Redacted Payload */}
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <h3 className="text-xs font-semibold text-ink">
                          2. Outbound redacted payload
                        </h3>
                        <span className="text-xs text-ink/75">
                          Exact string passed to cloud generate()
                        </span>
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

                    {/* Egress guard status line */}
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

                    {/* 3. Cloud reply with placeholders as chips */}
                    {outcome.trace.cloudReply !== null && (
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <h3 className="text-xs font-semibold text-ink">
                            3. Cloud reply with placeholders intact
                          </h3>
                          <span className="text-xs text-ink/75">Returned across boundary</span>
                        </div>
                        <div
                          data-testid="cloud-reply"
                          className="mt-2 border border-ink bg-fog p-3"
                        >
                          <TextGenerateEffect
                            words={outcome.trace.cloudReply}
                            renderWord={(word, idx) =>
                              renderWithPlaceholderChips(
                                word,
                                activePlaceholder,
                                setActivePlaceholder,
                              ).map((node, subIdx) => (
                                <span key={`${idx}-${subIdx}`}>{node}</span>
                              ))
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
            </div>

            {/* AnimatedBeam shown only when a payload actually crossed the trust boundary */}
            {payloadCrossed && (
              <AnimatedBeam
                containerRef={workspaceRef}
                fromRef={deviceAnchorRef}
                toRef={cloudAnchorRef}
                pathColor="#2B59E8"
                gradientStartColor="#2B59E8"
                gradientStopColor="#18202B"
                pathWidth={3}
              />
            )}
          </div>
        </div>

        {/* Step strip under both columns */}
        <section
          aria-label="Execution steps"
          className="mt-4 border border-ink bg-fog p-3 sm:p-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-xs font-bold text-ink">Pipeline trace steps</h2>
            {outcome?.simulated && (
              <span className="border border-ink bg-marker-amber px-1.5 py-0.5 text-[11px] font-semibold text-ink">
                Simulated
              </span>
            )}
          </div>

          {outcome && outcome.trace.steps.length > 0 ? (
            <ol
              data-testid="step-strip"
              className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6"
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
                  <div className="flex items-center justify-between gap-1.5">
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

        {/* Bottom two-column note from SPEC section 7 */}
        <footer className="mt-6 grid grid-cols-1 gap-4 border-t border-ink pt-4 text-xs leading-relaxed text-ink/85 md:grid-cols-2">
          <div>
            <h2 className="font-bold text-ink">What it catches</h2>
            <p className="mt-1">
              Caught by the deterministic patterns: email addresses, phone numbers in common North American and international formats, payment card numbers that pass the Luhn check, IBANs that pass the mod-97 check, US Social Security numbers in AAA-GG-SSSS form with invalid ranges excluded, IPv4 addresses. Caught by Gemini Nano, best effort: personal names, street addresses, and other identifiers the model recognises.
            </p>
          </div>
          <div>
            <h2 className="font-bold text-ink">What it can miss</h2>
            <p className="mt-1">
              Not guaranteed: names and addresses the on-device model misses, identifiers in formats the patterns do not cover, personal data implied by context (for example &quot;my neighbour, the only dentist in town&quot;), and anything inside images or attachments, which are not accepted.
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;
