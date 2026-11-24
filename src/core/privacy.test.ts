import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENTITY_SCHEMA } from './device-detector';
import { FakeModel, RecordingModel } from './fake-model';
import type { FakeBehaviour } from './fake-model';
import { SYNTHETIC_INPUTS } from './fixtures/synthetic';
import { runPipeline } from './router';
import type { BlockReason, ModelClient, RunInput, TaskId } from './types';
const tasks: TaskId[] = ['summarize', 'rewrite', 'reply', 'custom'];
const base: RunInput = { text: 'Alice Example at alice@example.com calls 202-555-0100.', task: 'rewrite', preference: 'cloud' };
function cloud() { return new RecordingModel(new FakeModel({ location: 'cloud' })); }
function device(overrides: Partial<ModelClient> = {}): ModelClient {
  const model = new FakeModel({ location: 'device' });
  return { location: model.location, simulated: model.simulated, label: model.label, status: () => model.status(), prepare: p => model.prepare(p), generate: r => model.generate(r), ...overrides };
}
afterEach(() => vi.unstubAllGlobals());
describe('exact outbound privacy guarantee', () => {
  for (const [index, { text, sensitiveValues }] of SYNTHETIC_INPUTS.entries()) {
    it.each(tasks)(`corpus ${index + 1}, %s`, async task => {
      const recorder = cloud();
      const local = new RecordingModel(new FakeModel({ location: 'device' }));
      const outcome = await runPipeline({ text, task, preference: 'cloud', customInstruction: 'Ask Mary Invented at custom@example.org or 202-555-0199 about 99 Juniper Street.' }, { device: local, cloud: recorder });
      expect(outcome.kind).toBe('answered');
      expect(recorder.requests).toHaveLength(1);
      const prompt = recorder.requests[0]?.prompt ?? '';
      expect(prompt).toBe(outcome.trace.outboundPayload);
      expect(outcome.trace.findings.length).toBeGreaterThan(0);
      const expected = task === 'custom'
        ? [...sensitiveValues, 'Mary Invented', 'custom@example.org', '202-555-0199', '99 Juniper Street']
        : sensitiveValues;
      for (const value of expected) {
        expect(prompt.toLowerCase(), value).not.toContain(value.toLowerCase());
        const digits = value.replace(/\D/g, '');
        if (digits.length >= 7) expect(prompt.replace(/\D/g, ''), value).not.toContain(digits);
      }
      for (const finding of outcome.trace.findings) {
        expect(prompt.toLowerCase()).not.toContain(finding.value.toLowerCase());
        const digits = finding.value.replace(/\D/g, '');
        if (digits.length >= 7) expect(prompt.replace(/\D/g, '')).not.toContain(digits);
        if (outcome.kind === 'answered') expect(outcome.answer.toLowerCase()).toContain(finding.value.toLowerCase());
      }
      if (task === 'custom') {
        expect(outcome.trace.findings.some(f => f.segment === 'instruction' && f.type === 'PERSON')).toBe(true);
        expect(outcome.trace.findings.some(f => f.segment === 'instruction' && f.type === 'ADDRESS')).toBe(true);
      }
      expect(local.requests.every(r => r.responseSchema === undefined || JSON.stringify(r.responseSchema) === JSON.stringify(ENTITY_SCHEMA))).toBe(true);
    });
  }
});
describe('fail closed', () => {
  const failures: Array<[FakeBehaviour, BlockReason]> = [
    ['unavailable', 'detector-unavailable'], ['needs-download', 'detector-unavailable'],
    ['throws', 'detector-failed'], ['bad-json', 'detector-bad-output'], ['wrong-source', 'detector-wrong-source'],
  ];
  it.each(failures)('%s blocks cloud', async (behaviour, reason) => {
    const recorder = cloud();
    const result = await runPipeline(base, { device: new FakeModel({ location: 'device', behaviour }), cloud: recorder });
    expect(result).toMatchObject({ kind: 'blocked', reason });
    expect(recorder.requests).toHaveLength(0);
    expect(result.trace.outboundPayload).toBeNull();
    if (result.kind !== 'answered') for (const f of result.trace.findings) expect(result.message).not.toContain(f.value);
  });
  it('blocks status errors without echoing raw error details', async () => {
    const recorder = cloud();
    const result = await runPipeline(base, { device: device({ status: async () => { throw new Error(base.text); } }), cloud: recorder });
    expect(result).toMatchObject({ kind: 'blocked', reason: 'detector-failed' });
    expect(recorder.requests).toHaveLength(0);
  });
  it('stops every route, including device-only, when the detector reports a cloud run', async () => {
    const recorder = cloud();
    const fake = new FakeModel({ location: 'device', behaviour: 'wrong-source' });
    const answers: string[] = [];
    const local = device({
      generate: r => {
        if (r.responseSchema) return fake.generate(r);
        answers.push(r.prompt);
        return Promise.resolve({ text: 'Local answer', ranOn: 'device' });
      },
    });
    const result = await runPipeline({ ...base, preference: 'device' }, { device: local, cloud: recorder });
    expect(result).toMatchObject({ kind: 'blocked', reason: 'detector-wrong-source' });
    expect(answers).toHaveLength(0);
    expect(recorder.requests).toHaveLength(0);
    if (result.kind === 'blocked') expect(result.message).not.toContain('Nothing was sent');
  });
  it.each(['bad-json'] satisfies FakeBehaviour[])('allows device-only answering after detector %s', async behaviour => {
    const recorder = cloud();
    const fake = new FakeModel({ location: 'device', behaviour });
    const local = device({ generate: r => r.responseSchema ? fake.generate(r) : Promise.resolve({ text: 'Local answer', ranOn: 'device' }) });
    const result = await runPipeline({ ...base, preference: 'device' }, { device: local, cloud: recorder });
    expect(result).toMatchObject({ kind: 'answered', route: 'device-only', answer: 'Local answer' });
    expect(recorder.requests).toHaveLength(0);
  });
  it('blocks a simulated inference source from a live client', async () => {
    expect(await runPipeline(base, { device: device({ simulated: false }), cloud: cloud() })).toMatchObject({ kind: 'blocked', reason: 'detector-wrong-source' });
  });
  it('keeps pattern values safe even if the local model misses everything', async () => {
    const recorder = cloud();
    const result = await runPipeline(base, { device: device({ generate: async () => ({ text: '{"entities":[]}', ranOn: 'device' }) }), cloud: recorder });
    expect(result.kind).toBe('answered');
    expect(recorder.requests[0]?.prompt).not.toContain('alice@example.com');
    expect(recorder.requests[0]?.prompt).not.toContain('202-555-0100');
  });
  it('blocks when a detected value also occurs in the fixed prompt template', async () => {
    const recorder = cloud();
    const result = await runPipeline({ ...base, text: 'Task for Alice Example' }, { device: device({ generate: async () => ({ text: '{"entities":[{"text":"Task","type":"OTHER"}]}', ranOn: 'device' }) }), cloud: recorder });
    expect(result).toMatchObject({ kind: 'blocked', reason: 'egress-guard' });
    expect(recorder.requests).toHaveLength(0);
  });
  it('returns safe errors when cloud is unconfigured or throws', async () => {
    expect(await runPipeline(base, { device: device(), cloud: null })).toMatchObject({ kind: 'error', message: 'The cloud model is not configured.' });
    for (const code of ['quota-exceeded', 'alice@example.com', 'Alice', base.text]) {
      const result = await runPipeline(base, { device: device(), cloud: device({ location: 'cloud', generate: async () => { throw { message: base.text, code }; } }) });
      expect(result.kind).toBe('error');
      if (result.kind === 'error') {
        expect(result.message).not.toContain(base.text);
        for (const f of result.trace.findings) expect(result.message).not.toContain(f.value);
        if (code === 'quota-exceeded') expect(result.message).toContain(code);
        else expect(result.message).not.toContain(code);
      }
    }
  });
  it('catches local answer throws and source violations', async () => {
    for (const wrongSource of [true, false]) {
      const local = device({ generate: async r => {
        if (r.responseSchema) return { text: '{"entities":[]}', ranOn: 'device' };
        if (wrongSource) return { text: base.text, ranOn: 'cloud' };
        throw new Error(base.text);
      } });
      expect(await runPipeline({ ...base, preference: 'device' }, { device: local, cloud: cloud() })).toMatchObject({ kind: 'blocked', reason: wrongSource ? 'device-answer-wrong-source' : 'device-answer-failed' });
    }
  });
  it('does not log or access browser persistence during full cloud and device runs', async () => {
    const calls = Object.getOwnPropertyNames(console).filter(key => typeof Reflect.get(console, key) === 'function').map(key => [key, vi.fn()] as const);
    vi.stubGlobal('console', Object.fromEntries(calls));
    const storage = { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn(), clear: vi.fn(), key: vi.fn() };
    vi.stubGlobal('localStorage', storage);
    vi.stubGlobal('sessionStorage', storage);
    const indexedDB = vi.fn();
    const cookie = vi.fn();
    vi.stubGlobal('indexedDB', indexedDB);
    vi.stubGlobal('document', Object.defineProperty({}, 'cookie', { get: cookie, set: cookie }));
    for (const preference of ['cloud', 'device'] as const) expect((await runPipeline({ ...base, preference }, { device: device(), cloud: cloud() })).kind).toBe('answered');
    for (const [, spy] of calls) expect(spy).not.toHaveBeenCalled();
    for (const spy of Object.values(storage)) expect(spy).not.toHaveBeenCalled();
    expect(indexedDB).not.toHaveBeenCalled();
    expect(cookie).not.toHaveBeenCalled();
  });
});
