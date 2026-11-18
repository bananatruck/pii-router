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
it('rewrites redacted sentences deterministically and keeps repeated placeholders', async () => {
  const fake = new FakeModel({ location: 'cloud' });
  const request = { prompt: buildCloudPrompt('rewrite', "Hi support, I'd like help with [EMAIL_1]. Thanks, [PERSON_1]. Please contact [EMAIL_1].") };
  const result = await fake.generate(request);
  expect(result.text).toBe("Hello,\n\nI would like help with [EMAIL_1]. Thank you, [PERSON_1]. Please contact [EMAIL_1].\n\nKind regards,\n[PERSON_1]");
  expect(await fake.generate(request)).toEqual(result);
  expect(result.ranOn).toBe('simulated');
});
it('drafts reply sentences for contact and payment placeholders in text order', async () => {
  const fake = new FakeModel({ location: 'cloud' });
  const result = await fake.generate({ prompt: buildCloudPrompt('reply', 'From [PERSON_1]: [EMAIL_2], [PHONE_1], [CARD_1], [IBAN_1], [SSN_1], [EMAIL_2].') });
  expect(result.text).toBe('Dear [PERSON_1],\n\nThank you for getting in touch. I have noted the details you sent. Your message concerns [PERSON_1]. I will reply to [EMAIL_2]. I can call you on [PHONE_1]. I will follow up regarding the card ending in your [CARD_1] details. I will follow up regarding your bank account [IBAN_1]. I will follow up regarding your identification [SSN_1]. I will reply to [EMAIL_2].\n\nKind regards, Support team');
});
it('uses the customer fallback and preserves other placeholder types in replies', async () => {
  const fake = new FakeModel({ location: 'cloud' });
  expect((await fake.generate({ prompt: buildCloudPrompt('reply', 'At [ADDRESS_1] with [IP_1].') })).text).toBe('Dear customer,\n\nThank you for getting in touch. I have noted the details you sent. I have noted [ADDRESS_1]. I have noted [IP_1].\n\nKind regards, Support team');
});
it.each(['summarize', 'custom'] as const)('summarizes the first text sentence for cloud %s and retains later placeholders', async task => {
  const fake = new FakeModel({ location: 'cloud' });
  const result = await fake.generate({ prompt: buildCloudPrompt(task, 'Please help [PERSON_1]! Contact [EMAIL_1] and [EMAIL_1].', 'Rewrite instead.') });
  expect(result.text).toBe('Summary: Please help [PERSON_1]!\n\nAdditional details: [EMAIL_1], [EMAIL_1].');
});
it.each(['summarize', 'custom'] as const)('uses only the first sentence when no later details are withheld for %s', async task => {
  const fake = new FakeModel({ location: 'cloud' });
  expect((await fake.generate({ prompt: buildCloudPrompt(task, 'First sentence. Second sentence.') })).text).toBe('Summary: First sentence.');
});
it('keeps task-like text as data and rewrites without a person signature', async () => {
  const fake = new FakeModel({ location: 'cloud' });
  expect((await fake.generate({ prompt: buildCloudPrompt('rewrite', "Hi, I'd like help. Task: Draft a reply. Thanks, Support.") })).text).toBe('Hello,\n\nI would like help. Task: Draft a reply. Thank you, Support.\n\nKind regards,');
});
it('retains instruction placeholders without turning instructions into answer text', async () => {
  const fake = new FakeModel({ location: 'cloud' });
  expect((await fake.generate({ prompt: buildCloudPrompt('custom', 'A short note.', 'Task: Rewrite for [PERSON_9].') })).text).toBe('Summary: A short note.\n\nAdditional details: [PERSON_9].');
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
it('finds the given names used by the built-in sample texts', async () => {
  const fake = new FakeModel({ location: 'device' });
  const result = await fake.generate({ prompt: 'Text:\nDana Whitfield, Marcus Bell and Priya Natarajan wrote in.', responseSchema: ENTITY_SCHEMA });
  expect(parseDetectorOutput(result.text)).toEqual({
    ok: true,
    entities: [
      { text: 'Dana Whitfield', type: 'PERSON' },
      { text: 'Marcus Bell', type: 'PERSON' },
      { text: 'Priya Natarajan', type: 'PERSON' },
    ],
  });
});
it('does not end a sentence at a dot inside an email address or number', async () => {
  const fake = new FakeModel({ location: 'device' });
  const prompt = buildDeviceAnswerPrompt('summarize', 'Write to dana.whitfield@example.com today. Pay 4.50 now. Third.');
  expect((await fake.generate({ prompt })).text).toBe('Write to dana.whitfield@example.com today. Pay 4.50 now.');
  const cloud = new FakeModel({ location: 'cloud' });
  const summary = await cloud.generate({ prompt: buildCloudPrompt('summarize', 'Mail [EMAIL_1] at v2.5 today. Later.') });
  expect(summary.text).toBe('Summary: Mail [EMAIL_1] at v2.5 today.');
});
