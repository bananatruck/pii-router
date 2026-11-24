import { buildDetectorPrompt, ENTITY_SCHEMA, parseDetectorOutput } from './device-detector';
import { checkEgress, checkSplitAcrossSegments } from './egress-guard';
import { normalizeInputDetail } from './normalize';
import { detectPatterns } from './patterns';
import { locateEntities, redactSegments, restore } from './redact';
import { buildCloudPrompt, buildDeviceAnswerPrompt, DEVICE_CHAR_BUDGET, TASKS } from './tasks';
import type {
  BlockReason,
  PiiType,
  Finding,
  GenerateResult,
  Route,
  RouterDeps,
  RunInput,
  RunOutcome,
  SegmentId,
  Trace,
  TraceStep,
} from './types';

export function chooseRoute(input: RunInput, deviceReady: boolean): Route | null {
  if (input.preference === 'device') return deviceReady ? 'device-only' : null;
  if (input.preference === 'cloud') return 'cloud-redacted';
  const size = input.text.length + (input.task === 'custom' ? input.customInstruction?.length ?? 0 : 0);
  const fitsDevice = deviceReady && TASKS[input.task].weight === 'light' && size <= DEVICE_CHAR_BUDGET;
  return fitsDevice ? 'device-only' : 'cloud-redacted';
}

function patternCandidates(
  segments: Record<SegmentId, string>,
): Parameters<typeof redactSegments>[1] {
  return (['instruction', 'text'] satisfies SegmentId[]).flatMap(segment =>
    detectPatterns(segments[segment]).map(hit => ({ ...hit, segment, source: 'pattern' as const })),
  );
}

function safeCloudErrorSuffix(
  error: unknown,
  segments: Record<SegmentId, string>,
  findings: Finding[],
): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
  if (typeof code !== 'string' || !/^[a-z][a-z0-9/-]{0,39}$/i.test(code)) return '';
  const haystack = `${segments.text}\n${segments.instruction}`.toLowerCase();
  if (haystack.includes(code.toLowerCase())) return '';
  if (findings.some(f => code.toLowerCase().includes(f.value.toLowerCase()))) return '';
  if (detectPatterns(code).length > 0) return '';
  return ` (${code})`;
}

export async function runPipeline(input: RunInput, deps: RouterDeps): Promise<RunOutcome> {
  const now = deps.now ?? (() => performance.now());
  const trace: Trace = { steps: [], findings: [], redactedText: input.text, outboundPayload: null, cloudReply: null };
  const simulated = deps.device.simulated || (deps.cloud?.simulated ?? false);
  const deviceSource = deps.device.simulated ? 'simulated-device' : 'device';
  function step(
    id: TraceStep['id'],
    ok: boolean,
    note: string,
    start: number,
    // Deterministic steps always run on the device for real, even when the models are simulated.
    ranOn: TraceStep['ranOn'] = 'device',
  ) {
    trace.steps.push({ id, ok, note, ms: Math.max(0, now() - start), ranOn });
  }
  function blocked(reason: BlockReason): RunOutcome {
    const messages: Record<BlockReason, string> = {
      'empty-input': 'Enter some text to process.',
      'detector-unavailable':
        'Local detection is unavailable. Names and addresses cannot be checked. Nothing was sent.',
      'detector-failed': 'Local detection failed. Nothing was sent.',
      'detector-bad-output': 'Local detection returned invalid data. Nothing was sent.',
      'detector-wrong-source':
        'The on-device step reported that it ran in the cloud, so the text may already have left this device. Stopped; nothing more was sent.',
      'device-answer-unavailable': 'The on-device answer model is unavailable.',
      'device-answer-failed': 'The on-device answer failed.',
      'device-answer-wrong-source': 'The answer model reported an unexpected inference source.',
      'egress-guard': 'The privacy check blocked the cloud request. Nothing was sent.',
    };
    return { kind: 'blocked', reason, message: messages[reason], simulated, trace };
  }
  function localResult(result: GenerateResult): boolean {
    return result.ranOn === 'device' || (deps.device.simulated && result.ranOn === 'simulated');
  }
  if (!input.text.trim()) return blocked('empty-input');
  const normText = normalizeInputDetail(input.text);
  const normInstruction = normalizeInputDetail(
    input.task === 'custom' ? input.customInstruction ?? '' : '',
  );
  const segments = { instruction: normInstruction.text, text: normText.text };
  const normChanges = normText.changeCount + normInstruction.changeCount;
  let start = now();
  const candidates = patternCandidates(segments);
  let redaction = redactSegments(segments, candidates);
  trace.findings = redaction.findings;
  trace.redactedText = redaction.redacted.text;
  const patternNote =
    normChanges > 0
      ? `Normalized invisible or look-alike characters first. ${candidates.length} pattern findings.`
      : `${candidates.length} pattern findings.`;
  step('patterns', true, patternNote, start);
  let ready = false;
  let detectorFailure: BlockReason | null = null;
  const reportedByDevice = new Set<string>();
  const reported: Array<{ text: string; type: PiiType }> = [];
  start = now();
  try {
    ready = deps.device.location === 'device' && (await deps.device.status()).state === 'ready';
    if (!ready) detectorFailure = 'detector-unavailable';
    else {
      for (const segment of ['instruction', 'text'] satisfies SegmentId[]) {
        if (!segments[segment]) continue;
        const result = await deps.device.generate({
          prompt: buildDetectorPrompt(redaction.redacted[segment]),
          responseSchema: ENTITY_SCHEMA,
        });
        if (!localResult(result)) { detectorFailure = 'detector-wrong-source'; break; }
        const parsed = parseDetectorOutput(result.text);
        if (!parsed.ok) { detectorFailure = 'detector-bad-output'; break; }
        for (const entity of parsed.entities) reportedByDevice.add(entity.text);
        reported.push(...parsed.entities);
      }
      // Apply everything Gemini Nano reported to both segments: a name it saw in the instruction
      // must also be redacted in the text, and vice versa (round-2 review).
      for (const segment of ['instruction', 'text'] satisfies SegmentId[]) {
        for (const entity of locateEntities(segments[segment], reported)) {
          candidates.push({ ...entity, segment, source: 'device-model' });
        }
      }
    }
  } catch { detectorFailure = 'detector-failed'; }
  const detectorStart = start;
  start = now();
  redaction = redactSegments(segments, candidates);
  trace.findings = redaction.findings;
  // Count values the device model itself reported that became findings: not repeats, not name
  // parts we derived, and not strings that lost to a pattern match or were absent from the text.
  const kept = new Set(trace.findings.filter(f => f.source === 'device-model').map(f => f.value));
  const deviceValues = [...reportedByDevice].filter(value => kept.has(value)).length;
  const detectorNote = detectorFailure
    ? 'Local detection could not be verified.'
    : `${deviceValues} ${deviceValues === 1 ? 'value' : 'values'} found on the device.`;
  step('device-detector', detectorFailure === null, detectorNote, detectorStart, deviceSource);
  trace.redactedText = redaction.redacted.text;
  step('redact', true, `${trace.findings.length} findings replaced.`, start);
  start = now();
  const route = chooseRoute(input, ready);
  step('route', route !== null, route ?? 'Requested local route unavailable.', start);
  if (route === null) return blocked('device-answer-unavailable');
  // A detector call that reports a cloud run means the SDK may already have sent the text: stop every
  // route, including device-only, rather than make another model call (review finding 3).
  if (detectorFailure === 'detector-wrong-source') return blocked(detectorFailure);
  if (route === 'device-only') {
    start = now();
    try {
      if ((await deps.device.status()).state !== 'ready') {
        step('device-answer', false, 'Local model unavailable.', start, deviceSource);
        return blocked('device-answer-unavailable');
      }
      const result = await deps.device.generate({
        prompt: buildDeviceAnswerPrompt(input.task, input.text, segments.instruction),
      });
      if (!localResult(result)) {
        step('device-answer', false, 'Unexpected inference source.', start, deviceSource);
        return blocked('device-answer-wrong-source');
      }
      step('device-answer', true, 'Local answer completed.', start, deviceSource);
      return {
        kind: 'answered',
        route,
        answer: result.text,
        unresolvedPlaceholders: [],
        simulated: deps.device.simulated,
        trace,
      };
    } catch {
      step('device-answer', false, 'Local answer failed.', start, deviceSource);
      return blocked('device-answer-failed');
    }
  }
  if (detectorFailure) return blocked(detectorFailure);
  if (!deps.cloud || deps.cloud.location !== 'cloud') {
    return { kind: 'error', message: 'The cloud model is not configured.', simulated, trace };
  }
  const payload = buildCloudPrompt(input.task, redaction.redacted.text, redaction.redacted.instruction);
  start = now();
  const egress = checkEgress(payload, redaction.vault);
  const guard = egress.ok
    ? checkSplitAcrossSegments(redaction.redacted.instruction, redaction.redacted.text, redaction.vault)
    : egress;
  step('egress-guard', guard.ok, guard.ok ? 'Payload passed privacy checks.' : guard.reason, start);
  if (!guard.ok) return blocked('egress-guard');
  start = now();
  try {
    trace.outboundPayload = payload;
    const result = await deps.cloud.generate({ prompt: payload });
    trace.cloudReply = result.text;
    const cloudRanOn = deps.cloud.simulated ? 'simulated-cloud' : 'cloud';
    step('cloud-call', true, 'Redacted request completed.', start, cloudRanOn);
    start = now();
    const restored = restore(result.text, redaction.vault);
    step('restore', true, `${restored.unresolved.length} unresolved placeholders.`, start);
    return {
      kind: 'answered',
      route,
      answer: restored.text,
      unresolvedPlaceholders: restored.unresolved,
      simulated,
      trace,
    };
  } catch (error: unknown) {
    const cloudRanOn = deps.cloud.simulated ? 'simulated-cloud' : 'cloud';
    step('cloud-call', false, 'Cloud request failed.', start, cloudRanOn);
  // Codes are untrusted too. Never include codes that echo any part of the input.
    const safeCode = safeCloudErrorSuffix(error, segments, trace.findings);
    return { kind: 'error', message: `The cloud request failed${safeCode}. Please try again.`, simulated, trace };
  }
}
