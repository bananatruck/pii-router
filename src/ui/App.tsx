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
import { useModels, type LiveModelSet } from './useModels';
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
    simulateNanoUnavailable,
    setSimulateNanoUnavailable,
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

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedText(text);
    }, 150);
    return () => clearTimeout(timer);
  }, [text]);

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

  // A ref, not state: two clicks in the same frame both see isRunning === false (review finding 5).
  const runLock = useRef(false);

  const handleRun = async () => {
    if (runLock.current) return;
    runLock.current = true;
    setIsRunning(true);
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

  const payloadCrossed = outcome?.trace.outboundPayload != null;
  const egressStep = outcome?.trace.steps.find(s => s.id === 'egress-guard');

  return (
    <div className="min-h-screen bg-fog text-ink">
      {mode === 'simulated' && <SimulatedBanner />}

      <div className="mx-auto max-w-[1400px] px-3 py-4 sm:px-6 sm:py-6">
        <Header mode={mode} setMode={setMode} deviceStatus={deviceStatus} liveReason={liveReason} locked={isRunning} />

        <Controls
          mode={mode}
          task={task}
          setTask={setTask}
          preference={preference}
          setPreference={setPreference}
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

        <div aria-live="polite" className="mt-4">
          <OutcomeAlerts outcome={outcome} />

          <Workspace
            workspaceRef={workspaceRef}
            deviceAnchorRef={deviceAnchorRef}
            cloudAnchorRef={cloudAnchorRef}
            payloadCrossed={payloadCrossed}
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