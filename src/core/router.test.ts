import { describe, expect, it } from 'vitest';
import { FakeModel, RecordingModel } from './fake-model';
import { chooseRoute, runPipeline } from './router';
import { buildCloudPrompt, buildDeviceAnswerPrompt, DEVICE_CHAR_BUDGET, TASKS } from './tasks';
import type { ModelClient, RunInput, TaskId } from './types';
const base: RunInput = { text: 'A short note.', task: 'summarize', preference: 'auto' };
function deviceGenerateEmpty(): ModelClient {
  const fake = new FakeModel({ location: 'device' });
  return {
    location: 'device',
    simulated: true,
    label: fake.label,
    status: () => fake.status(),
    prepare: () => fake.prepare(),
    generate: async () => ({ text: '{"entities":[]}', ranOn: 'simulated' }),
  };
}
describe('routing', () => {
  it.each([
    ['device', true, 'device-only'], ['device', false, null],
    ['cloud', true, 'cloud-redacted'], ['cloud', false, 'cloud-redacted'],
    ['auto', true, 'device-only'], ['auto', false, 'cloud-redacted'],
  ] as const)('%s with readiness %s chooses %s', (preference, ready, expected) => expect(chooseRoute({ ...base, preference }, ready)).toBe(expected));
  it.each(['rewrite', 'reply', 'custom'] satisfies TaskId[])('routes heavy task %s to cloud in auto', task => expect(chooseRoute({ ...base, task }, true)).toBe('cloud-redacted'));
  it('routes long input to cloud but preserves explicit local preference', () => {
    const input = { ...base, text: 'x'.repeat(DEVICE_CHAR_BUDGET + 1) };
    expect(chooseRoute(input, true)).toBe('cloud-redacted');
    expect(chooseRoute({ ...input, preference: 'device' }, true)).toBe('device-only');
    expect(chooseRoute({ ...base, text: 'x'.repeat(DEVICE_CHAR_BUDGET) }, true)).toBe('device-only');
  });
  it('redacts every name part before a cloud request', async () => {
    const text = 'Dana Whitfield wrote. Later, Dana called again about Whitfield\'s order.';
    const device = new RecordingModel(new FakeModel({ location: 'device' }));
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    const result = await runPipeline({ ...base, text, task: 'rewrite', preference: 'cloud' }, { device, cloud });
    expect(result.kind).toBe('answered');
    const payload = cloud.requests[0]?.prompt ?? '';
    expect(payload.toLowerCase()).not.toContain('dana');
    expect(payload.toLowerCase()).not.toContain('whitfield');
  });
  it('counts distinct reported device values across repeats, name parts and segments', async () => {
    const result = await runPipeline({
      text: 'Dana Whitfield wrote. Dana Whitfield called Dana at 14 Maple Street.',
      task: 'custom', preference: 'cloud',
      customInstruction: 'Help Dana Whitfield at 14 Maple Street.',
    }, { device: new FakeModel({ location: 'device' }), cloud: new FakeModel({ location: 'cloud' }) });
    expect(result.kind).toBe('answered');
    expect(result.trace.steps.find(step => step.id === 'device-detector')).toMatchObject({ ok: true, note: '2 values found on the device.' });
    expect(result.trace.findings.some(finding => finding.value === 'Dana')).toBe(true);
    for (const step of result.trace.steps) {
      for (const finding of result.trace.findings) expect(step.note).not.toContain(finding.value);
    }
  });
  it('counts only device-reported values that survive finding selection', async () => {
    const fake = new FakeModel({ location: 'device' });
    const device: ModelClient = {
      location: 'device', simulated: true, label: fake.label,
      status: () => fake.status(), prepare: () => fake.prepare(),
      generate: async () => ({ text: JSON.stringify({ entities: [
        { text: 'Dana Whitfield', type: 'PERSON' },
        { text: 'Whitfield', type: 'OTHER' },
        { text: 'Missing Example', type: 'PERSON' },
        { text: 'example.com', type: 'OTHER' },
      ] }), ranOn: 'simulated' }),
    };
    const result = await runPipeline({ ...base, text: 'Dana Whitfield at alice@example.com.', preference: 'cloud' }, { device, cloud: new FakeModel({ location: 'cloud' }) });
    expect(result.kind).toBe('answered');
    expect(result.trace.steps.find(step => step.id === 'device-detector')?.note).toBe('1 value found on the device.');
  });
  it('reports zero device values when only patterns matched', async () => {
    const result = await runPipeline({ ...base, text: 'Email contact@example.com.' }, { device: new FakeModel({ location: 'device' }), cloud: null });
    expect(result.trace.steps.find(step => step.id === 'device-detector')?.note).toBe('0 values found on the device.');
  });
  it('restores synthetic values within the simulated professional rewrite', async () => {
    const result = await runPipeline({ ...base, task: 'rewrite', text: "Hi support, I'd like help. Contact alice@example.com. Thanks, Alice Example." }, {
      device: new FakeModel({ location: 'device' }), cloud: new FakeModel({ location: 'cloud' }),
    });
    expect(result).toMatchObject({
      kind: 'answered', route: 'cloud-redacted', unresolvedPlaceholders: [],
      answer: 'Hello,\n\nI would like help. Contact alice@example.com. Thank you, Alice Example.\n\nKind regards,\nAlice Example',
    });
    expect(result.trace.cloudReply).toBe('Hello,\n\nI would like help. Contact [EMAIL_1]. Thank you, [PERSON_1].\n\nKind regards,\n[PERSON_1]');
  });
  it('passes originals only to local answering, records safe trace, and never calls cloud', async () => {
    const device = new RecordingModel(new FakeModel({ location: 'device' }));
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    let clock = 0;
    const result = await runPipeline({ ...base, text: 'Alice Example wrote alice@example.com.' }, { device, cloud, now: () => clock++ });
    expect(result).toMatchObject({ kind: 'answered', route: 'device-only', simulated: true });
    expect(device.requests).toHaveLength(2);
    expect(device.requests[0]?.prompt).not.toContain('alice@example.com');
    expect(device.requests[1]?.prompt).toContain('alice@example.com');
    expect(cloud.requests).toHaveLength(0);
    expect(result.trace.outboundPayload).toBeNull();
    for (const step of result.trace.steps) {
      expect(step.ms).toBeGreaterThanOrEqual(0);
      for (const f of result.trace.findings) expect(step.note).not.toContain(f.value);
    }
  });
  it('ignores custom instructions for standard tasks', async () => {
    const device = new RecordingModel(new FakeModel({ location: 'device' }));
    const result = await runPipeline({ ...base, customInstruction: 'Ignored alice@example.com' }, { device, cloud: null });
    expect(result.kind).toBe('answered');
    expect(device.requests.every(r => !r.prompt.includes('Ignored'))).toBe(true);
  });
  it('blocks empty input before model calls', async () => {
    const device = new RecordingModel(new FakeModel({ location: 'device' }));
    expect(await runPipeline({ ...base, text: '  ' }, { device, cloud: null })).toMatchObject({ kind: 'blocked', reason: 'empty-input' });
    expect(device.requests).toHaveLength(0);
  });
  it('blocks explicit local when unavailable and cloud auto when detector unavailable', async () => {
    const device = new FakeModel({ location: 'device', behaviour: 'unavailable' });
    expect(await runPipeline({ ...base, preference: 'device' }, { device, cloud: null })).toMatchObject({ kind: 'blocked', reason: 'device-answer-unavailable' });
    expect(await runPipeline(base, { device, cloud: null })).toMatchObject({ kind: 'blocked', reason: 'detector-unavailable' });
  });
  it('checks readiness again before the local answer', async () => {
    const fake = new FakeModel({ location: 'device' });
    let calls = 0;
    const device: ModelClient = {
      location: 'device', simulated: true, label: fake.label,
      status: async () => ++calls === 1 ? { state: 'ready' } : { state: 'needs-download' },
      prepare: () => fake.prepare(), generate: r => fake.generate(r),
    };
    expect(await runPipeline(base, { device, cloud: null })).toMatchObject({ kind: 'blocked', reason: 'device-answer-unavailable' });
  });
});
it('builds fixed task prompts and includes instructions only for custom tasks', () => {
  for (const task of Object.keys(TASKS) as TaskId[]) {
    const prompt = buildCloudPrompt(task, '[EMAIL_1]', '[PERSON_1]');
    expect(prompt).toContain('Keep every placeholder exactly as written');
    expect(prompt).toContain('Never guess the hidden values');
    expect(prompt).toContain(TASKS[task].description);
    expect(prompt.includes('[PERSON_1]')).toBe(task === 'custom');
    expect(buildDeviceAnswerPrompt(task, 'Original', 'Custom').includes('Instruction:\nCustom')).toBe(task === 'custom');
  }
});
  it('redacts or blocks obfuscated pattern values when the device model returns nothing', async () => {
    const text =
      'Card 4111\u200b1111\u200b1111\u200b1111, also '
      + '\uFF14\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11\uFF11, ' // 16 fullwidth digits
      + 'mail ada@ex\u200bample.com and josé@example.com, phone (312) 555-\n0142.';
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    const device = deviceGenerateEmpty();
    const result = await runPipeline(
      { text, task: 'rewrite', preference: 'cloud' },
      { device, cloud },
    );
    // Every value but the phone is redacted after normalization; the phone split by a newline is only
    // visible to the guard's folded re-scan, so the run must stop there with nothing sent.
    expect(result).toMatchObject({ kind: 'blocked', reason: 'egress-guard' });
    expect(cloud.requests).toHaveLength(0);
    expect(result.trace.outboundPayload).toBeNull();
    expect(result.trace.steps.find(s => s.id === 'patterns')?.note).toContain('Normalized');
    expect(result.trace.redactedText).not.toMatch(/4111|1111/);
    expect(result.trace.redactedText).not.toContain('ada@');
    expect(result.trace.redactedText).not.toContain('josé@');
    expect(result.trace.findings.filter(f => f.type === 'CARD')).toHaveLength(2);
  });
  it('labels only model steps as simulated; deterministic steps run on the device for real', async () => {
  const result = await runPipeline(
    { text: 'Dana Whitfield at dana@example.com.', task: 'rewrite', preference: 'cloud' },
    { device: new FakeModel({ location: 'device' }), cloud: new FakeModel({ location: 'cloud' }) },
  );
  const ranOn = Object.fromEntries(result.trace.steps.map(s => [s.id, s.ranOn]));
  expect(ranOn).toEqual({
    patterns: 'device', 'device-detector': 'simulated-device', redact: 'device', route: 'device',
    'egress-guard': 'device', 'cloud-call': 'simulated-cloud', restore: 'device',
  });
});

describe('egress guard and the fixed prompt prose', () => {
  // The cloud prompt's own rules say "personal details", which contains "son". A name "Son"
  // redacted from the user's text must not block that clean request, and must still block when
  // the user's text keeps it.
  function deviceReporting(name: string): ModelClient {
    const fake = new FakeModel({ location: 'device' });
    return {
      location: 'device', simulated: true, label: fake.label,
      status: () => fake.status(), prepare: () => fake.prepare(),
      generate: async request => request.responseSchema
        ? { text: JSON.stringify({ entities: [{ text: name, type: 'PERSON' }] }), ranOn: 'simulated' }
        : fake.generate(request),
    };
  }
  it('sends a clean payload although a vault value occurs in the fixed prompt prose', async () => {
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    const result = await runPipeline(
      { text: 'Please thank Son for the help.', task: 'rewrite', preference: 'cloud' },
      { device: deviceReporting('Son'), cloud },
    );
    expect(result.kind).toBe('answered');
    expect(cloud.requests).toHaveLength(1);
    expect(cloud.requests[0]?.prompt).toContain('personal details');
    expect(cloud.requests[0]?.prompt).not.toMatch(/\bSon\b/);
  });
});
