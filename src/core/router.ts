import { buildDetectorPrompt, ENTITY_SCHEMA, parseDetectorOutput } from './device-detector';
import { checkEgress } from './egress-guard';
import { detectPatterns } from './patterns';
import { locateEntities, redactSegments, restore } from './redact';
import { buildCloudPrompt, buildDeviceAnswerPrompt, DEVICE_CHAR_BUDGET, TASKS } from './tasks';
import type { BlockReason, GenerateResult, Route, RouterDeps, RunInput, RunOutcome, SegmentId, Trace, TraceStep } from './types';

export function chooseRoute(input: RunInput, deviceReady: boolean): Route | null {
  if (input.preference === 'device') return deviceReady ? 'device-only' : null;
  if (input.preference === 'cloud') return 'cloud-redacted';
  const size = input.text.length + (input.task === 'custom' ? input.customInstruction?.length ?? 0 : 0);
  return deviceReady && TASKS[input.task].weight === 'light' && size <= DEVICE_CHAR_BUDGET ? 'device-only' : 'cloud-redacted';
}

export async function runPipeline(input: RunInput, deps: RouterDeps): Promise<RunOutcome> {
  const now = deps.now ?? (() => performance.now());
  const trace: Trace = { steps: [], findings: [], redactedText: input.text, outboundPayload: null, cloudReply: null };
  const simulated = deps.device.simulated || (deps.cloud?.simulated ?? false);
  const deviceSource = deps.device.simulated ? 'simulated-device' : 'device';
  function step(id: TraceStep['id'], ok: boolean, note: string, start: number, ranOn: TraceStep['ranOn'] = deviceSource) {
    trace.steps.push({ id, ok, note, ms: Math.max(0, now() - start), ranOn });
  }
  function blocked(reason: BlockReason): RunOutcome {
    const messages: Record<BlockReason, string> = {
      'empty-input': 'Enter some text to process.',
      'detector-unavailable': 'Local detection is unavailable. Names and addresses cannot be checked. Nothing was sent.',
      'detector-failed': 'Local detection failed. Nothing was sent.',
      'detector-bad-output': 'Local detection returned invalid data. Nothing was sent.',
      'detector-wrong-source': 'The detector reported an unexpected inference source. Nothing was sent by the router.',
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
  const segments = { instruction: input.task === 'custom' ? input.customInstruction ?? '' : '', text: input.text };
  let start = now();
  const candidates: Parameters<typeof redactSegments>[1] = (['instruction', 'text'] satisfies SegmentId[]).flatMap(segment => detectPatterns(segments[segment]).map(hit => ({ ...hit, segment, source: 'pattern' })));
  let redaction = redactSegments(segments, candidates);
  trace.findings = redaction.findings;
  trace.redactedText = redaction.redacted.text;
  step('patterns', true, `${candidates.length} pattern findings.`, start);
  let ready = false;
  let detectorFailure: BlockReason | null = null;
  start = now();
  try {
    ready = deps.device.location === 'device' && (await deps.device.status()).state === 'ready';
    if (!ready) detectorFailure = 'detector-unavailable';
    else {
      for (const segment of ['instruction', 'text'] satisfies SegmentId[]) {
        if (!segments[segment]) continue;
        const result = await deps.device.generate({ prompt: buildDetectorPrompt(redaction.redacted[segment]), responseSchema: ENTITY_SCHEMA });
        if (!localResult(result)) { detectorFailure = 'detector-wrong-source'; break; }
        const parsed = parseDetectorOutput(result.text);
        if (!parsed.ok) { detectorFailure = 'detector-bad-output'; break; }
        for (const entity of locateEntities(segments[segment], parsed.entities)) candidates.push({ ...entity, segment, source: 'device-model' });
      }
    }
  } catch { detectorFailure = 'detector-failed'; }
  step('device-detector', detectorFailure === null, detectorFailure ? 'Local detection could not be verified.' : `${candidates.filter(c => c.source === 'device-model').length} model findings.`, start);
  start = now();
  redaction = redactSegments(segments, candidates);
  trace.findings = redaction.findings;
  trace.redactedText = redaction.redacted.text;
  step('redact', true, `${trace.findings.length} findings replaced.`, start);
  start = now();
  const route = chooseRoute(input, ready);
  step('route', route !== null, route ?? 'Requested local route unavailable.', start);
  if (route === null) return blocked('device-answer-unavailable');
  if (route === 'device-only') {
    start = now();
    try {
      if ((await deps.device.status()).state !== 'ready') {
        step('device-answer', false, 'Local model unavailable.', start);
        return blocked('device-answer-unavailable');
      }
      const result = await deps.device.generate({ prompt: buildDeviceAnswerPrompt(input.task, input.text, segments.instruction) });
      if (!localResult(result)) {
        step('device-answer', false, 'Unexpected inference source.', start);
        return blocked('device-answer-wrong-source');
      }
      step('device-answer', true, 'Local answer completed.', start);
      return { kind: 'answered', route, answer: result.text, unresolvedPlaceholders: [], simulated: deps.device.simulated, trace };
    } catch {
      step('device-answer', false, 'Local answer failed.', start);
      return blocked('device-answer-failed');
    }
  }
  if (detectorFailure) return blocked(detectorFailure);
  if (!deps.cloud || deps.cloud.location !== 'cloud') return { kind: 'error', message: 'The cloud model is not configured.', simulated, trace };
  const payload = buildCloudPrompt(input.task, redaction.redacted.text, redaction.redacted.instruction);
  start = now();
  const guard = checkEgress(payload, redaction.vault);
  step('egress-guard', guard.ok, guard.ok ? 'Payload passed privacy checks.' : guard.reason, start);
  if (!guard.ok) return blocked('egress-guard');
  start = now();
  try {
    trace.outboundPayload = payload;
    const result = await deps.cloud.generate({ prompt: payload });
    trace.cloudReply = result.text;
    step('cloud-call', true, 'Redacted request completed.', start, deps.cloud.simulated ? 'simulated-cloud' : 'cloud');
    start = now();
    const restored = restore(result.text, redaction.vault);
    step('restore', true, `${restored.unresolved.length} unresolved placeholders.`, start);
    return { kind: 'answered', route, answer: restored.text, unresolvedPlaceholders: restored.unresolved, simulated, trace };
  } catch (error: unknown) {
    step('cloud-call', false, 'Cloud request failed.', start, deps.cloud.simulated ? 'simulated-cloud' : 'cloud');
    // Codes are untrusted too. Never include codes that echo any part of the input.
    const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    const safeCode = typeof code === 'string' && /^[a-z][a-z0-9/-]{0,39}$/i.test(code) && !`${segments.text}\n${segments.instruction}`.toLowerCase().includes(code.toLowerCase()) && !trace.findings.some(f => code.toLowerCase().includes(f.value.toLowerCase())) && detectPatterns(code).length === 0 ? ` (${code})` : '';
    return { kind: 'error', message: `The cloud request failed${safeCode}. Please try again.`, simulated, trace };
  }
}
