import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  detectPatterns,
  redactSegments,
  normalizeInput,
  runPipeline,
  type Finding,
  type RoutePreference,
  type RunOutcome,
  type TaskId,
} from '@/core';
import type { SampleItem } from './samples';
import { SAMPLES } from './samples';
import { useModels, type AppMode, type LiveModelSet } from './useModels';
import { CoverageNote } from './components/CoverageNote';
import { Controls } from './components/Controls';
import { Header } from './components/Header';
import { OutcomeAlerts } from './components/OutcomeAlerts';
import { SimulatedBanner } from './components/SimulatedBanner';
import { StepStrip } from './components/StepStrip';
import { Workspace } from './components/Workspace';

export interface AppProps {
  liveModels?: LiveModelSet;
}

function runStatusText(isRunning: boolean, outcome: RunOutcome | null): string {
  if (isRunning) return 'Running.';
  if (!outcome) return '';
  if (outcome.kind === 'answered') {
    if (outcome.route === 'device-only') return 'Answered on this device.';
    return 'Answered through the cloud with personal details withheld.';
  }
  if (outcome.kind === 'blocked') return `Blocked: ${outcome.message}`;
  return `Error: ${outcome.message}`;
}

export function App({ liveModels }: AppProps = {}) {
  const [isRunning, setIsRunning] = useState<boolean>(false);

  const {
    mode,
    setMode,
    device,
    cloud,
    liveReason,
    deviceStatus,
    prepareDevice,
    refreshStatus,
    simulateNanoUnavailable,
    setSimulateNanoUnavailable,
  } = useModels({ liveModels, running: isRunning });

  const [text, setText] = useState<string>(SAMPLES[0]?.text ?? '');
  const [debouncedText, setDebouncedText] = useState<string>(SAMPLES[0]?.text ?? '');
  const [task, setTask] = useState<TaskId>('rewrite');
  const [customInstruction, setCustomInstruction] = useState<string>('');
  const [preference, setPreference] = useState<RoutePreference>('auto');
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [sampleMenuOpen, setSampleMenuOpen] = useState<boolean>(false);
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 150);
    return () => clearTimeout(timer);
  }, [text]);

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

  const handleSetTask = (next: TaskId) => {
    setTask(next);
    setOutcome(null);
  };

  const handleSetPreference = (next: RoutePreference) => {
    setPreference(next);
    setOutcome(null);
  };

  const handleSetMode = (next: AppMode) => {
    setMode(next);
    setOutcome(null);
  };

  // A ref, not state: two clicks in the same frame both see isRunning === false (review finding 5).
  const runLock = useRef(false);

  const handleRun = async () => {
    if (runLock.current) return;
    runLock.current = true;
    setIsRunning(true);
    setSampleMenuOpen(false);
    setIsEditing(false);
    setCopied(false);
    // The pipeline scans normalized text (no invisible characters, NFKC); show that same text so
    // the marks line up with the findings' offsets.
    const scannedText = normalizeInput(text);
    const scannedInstruction = normalizeInput(customInstruction);
    if (scannedText !== text) setText(scannedText);
    if (scannedInstruction !== customInstruction) setCustomInstruction(scannedInstruction);
    try {
      const result = await runPipeline(
        {
          text: scannedText,
          task,
          customInstruction: task === 'custom' ? scannedInstruction : undefined,
          preference,
        },
        { device, cloud },
      );
      setOutcome(result);
      await refreshStatus();
    } finally {
      runLock.current = false;
      setIsRunning(false);
    }
  };

  // The confirmation belongs to the answer that was copied: a late write for an older answer must
  // not mark a newer one as copied, and its reset timer must not clear the newer one (CodeRabbit).
  const outcomeRef = useRef(outcome);
  useEffect(() => {
    outcomeRef.current = outcome;
  }, [outcome]);

  const handleCopyAnswer = async () => {
    const copiedOutcome = outcome;
    if (copiedOutcome?.kind !== 'answered') return;
    const writeText = navigator.clipboard?.writeText;
    if (typeof writeText !== 'function') return;
    try {
      await writeText.call(navigator.clipboard, copiedOutcome.answer);
      if (outcomeRef.current !== copiedOutcome) return;
      setCopied(true);
      setTimeout(() => {
        if (outcomeRef.current === copiedOutcome) setCopied(false);
      }, 1800);
    } catch {
      if (outcomeRef.current === copiedOutcome) setCopied(false);
    }
  };

  const payloadCrossed =
    outcome?.kind === 'answered' &&
    outcome.route !== 'device-only' &&
    outcome.trace.outboundPayload != null;
  const payloadCrossedSimulated = mode === 'simulated';
  const egressStep = outcome?.trace.steps.find(s => s.id === 'egress-guard');

  return (
    <div className="min-h-screen bg-fog text-ink">
      {mode === 'simulated' && <SimulatedBanner />}

      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        <div
          role="status"
          aria-live="polite"
          data-testid="run-status"
          className="sr-only"
        >
          {runStatusText(isRunning, outcome)}
        </div>

        <Header
          mode={mode}
          setMode={handleSetMode}
          deviceStatus={deviceStatus}
          liveReason={liveReason}
          locked={isRunning}
        />

        <Controls
          mode={mode}
          task={task}
          setTask={handleSetTask}
          preference={preference}
          setPreference={handleSetPreference}
          taskSelectId={taskSelectId}
          sampleMenuOpen={sampleMenuOpen}
          setSampleMenuOpen={setSampleMenuOpen}
          sampleMenuRef={sampleMenuRef}
          onSelectSample={handleSelectSample}
          deviceStatus={deviceStatus}
          prepareDevice={prepareDevice}
          isRunning={isRunning}
          onRun={handleRun}
          simulateNanoUnavailable={simulateNanoUnavailable}
          setSimulateNanoUnavailable={next => {
            setSimulateNanoUnavailable(next);
            setOutcome(null);
          }}
        />

        {task === 'custom' && (
          <div className="border-b border-ink bg-device-sage/50 px-3 py-3">
            <label htmlFor={customInstructionId} className="block text-xs font-semibold text-ink">
              Custom instruction (redacted on device before any cloud call)
            </label>
            <input
              id={customInstructionId}
              type="text"
              disabled={isRunning}
              value={customInstruction}
              onChange={e => {
                setCustomInstruction(e.target.value);
                setOutcome(null);
              }}
              placeholder="For example: Extract action items for Dana Whitfield"
              className="mt-1.5 w-full border border-ink bg-fog px-3 py-1.5 font-mono text-sm text-ink disabled:cursor-wait disabled:opacity-60"
            />
          </div>
        )}

        <div className="mt-4">
          <OutcomeAlerts outcome={outcome} />

          <Workspace
            workspaceRef={workspaceRef}
            deviceAnchorRef={deviceAnchorRef}
            cloudAnchorRef={cloudAnchorRef}
            payloadCrossed={payloadCrossed}
            payloadCrossedSimulated={payloadCrossedSimulated}
            device={{
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
              outcome,
              vaultEntries,
              copied,
              onCopyAnswer: handleCopyAnswer,
            }}
            cloud={{
              outcome,
              egressStep,
              activePlaceholder,
              setActivePlaceholder,
            }}
          />
        </div>

        <StepStrip outcome={outcome} />
        <CoverageNote />
      </div>
    </div>
  );
}

export default App;