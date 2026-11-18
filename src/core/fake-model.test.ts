import { expect, it } from 'vitest';
import { ENTITY_SCHEMA, parseDetectorOutput } from './device-detector';
import { FakeModel, RecordingModel } from './fake-model';
import { buildCloudPrompt, buildDeviceAnswerPrompt } from './tasks';
it('finds demo names and street addresses deterministically', async () => {
  const fake = new FakeModel({ location: 'device' });
  const request = { prompt: 'Text:\nAlice Example at 14 Maple Street with Unknown Person.', responseSchema: ENTITY_SCHEMA };
  const first = await fake.generate(request);
  expect(await fake.generate(request)).toEqual(first);
  expect(parseDetectorOutput(first.text)).toEqual({ ok: true, entities: [{ text: 'Alice Example', type: 'PERSON' }, { text: '14 Maple Street', type: 'ADDRESS' }] });
});
it('summarizes the first two sentences on device', async () => {
  const fake = new FakeModel({ location: 'device' });
  expect((await fake.generate({ prompt: buildDeviceAnswerPrompt('summarize', 'First sentence. Second sentence! Third sentence.') })).text).toBe('First sentence. Second sentence!');
});
it('cloud fake reuses every distinct placeholder and changes reply versus rewrite', async () => {
  const fake = new FakeModel({ location: 'cloud', latencyMs: 1 });
  for (const task of ['rewrite', 'reply'] as const) {
    const result = await fake.generate({ prompt: buildCloudPrompt(task, '[EMAIL_1] [PERSON_1] [EMAIL_1]') });
    expect(result.text).toContain('[EMAIL_1]');
    expect(result.text).toContain('[PERSON_1]');
    expect(result.ranOn).toBe('simulated');
    expect(result.text).toContain(task === 'reply' ? 'Thank you' : 'Please review');
  }
});
it('recording wrapper forwards readiness, preparation, results and records snapshots', async () => {
  const fake = new FakeModel({ location: 'device' });
  const recorder = new RecordingModel(fake);
  expect(recorder.label).toBe('Simulated on-device model');
  expect(recorder.location).toBe('device');
  expect(recorder.simulated).toBe(true);
  expect(await recorder.status()).toEqual({ state: 'ready' });
  let fraction = 0;
  await recorder.prepare(value => { fraction = value; });
  expect(fraction).toBe(1);
  const request = { prompt: 'Text:\nA sentence.' };
  expect(await recorder.generate(request)).toEqual(await fake.generate(request));
  request.prompt = 'Changed';
  expect(recorder.requests[0]?.prompt).toBe('Text:\nA sentence.');
});
it('provides wrong-source behavior for cloud and records rejected calls', async () => {
  expect((await new FakeModel({ location: 'cloud', behaviour: 'wrong-source' }).generate({ prompt: '' })).ranOn).toBe('device');
  const recorder = new RecordingModel(new FakeModel({ location: 'device', behaviour: 'throws' }));
  await expect(recorder.generate({ prompt: '' })).rejects.toThrow('Simulated model failure.');
  expect(recorder.requests).toHaveLength(1);
});
