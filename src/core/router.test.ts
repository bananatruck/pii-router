import { describe, expect, it } from 'vitest';
import { FakeModel, RecordingModel } from './fake-model';
import { chooseRoute, runPipeline } from './router';
import { buildCloudPrompt, buildDeviceAnswerPrompt, DEVICE_CHAR_BUDGET, TASKS } from './tasks';
import type { ModelClient, RunInput, TaskId } from './types';
const base: RunInput = { text: 'A short note.', task: 'summarize', preference: 'auto' };
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
