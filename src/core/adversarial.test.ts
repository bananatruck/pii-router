// Adversarial inputs from the round-2 outside review (GPT 6.1 Sol through Codex, 2026-11-18).
// Each case declares, independently of the detectors, the values that must never reach the cloud.
// The oracle is the exact recorded payload: either the run is blocked and nothing was sent, or the
// payload contains none of the declared values, in plain or digit-only form.
// All values are synthetic (published test cards and IBAN examples, reserved phone ranges,
// example.com addresses, the voided specimen SSN 078-05-1120).
import { describe, expect, it } from 'vitest';
import { FakeModel, RecordingModel } from './fake-model';
import { runPipeline } from './router';
import type { ModelClient, RunInput } from './types';

type Entity = { text: string; type: 'PERSON' | 'ADDRESS' | 'ID' | 'OTHER' };

/** A ready on-device detector that reports those of `entities` that appear in the text it was given. */
function nano(entities: Entity[] = []): ModelClient {
  const fake = new FakeModel({ location: 'device' });
  return {
    location: 'device',
    simulated: true,
    label: fake.label,
    status: () => fake.status(),
    prepare: () => fake.prepare(),
    generate: async request =>
      request.responseSchema
        ? {
            text: JSON.stringify({
              entities: entities.filter(e => request.prompt.toLowerCase().includes(e.text.toLowerCase())),
            }),
            ranOn: 'simulated',
          }
        : { text: 'Local answer.', ranOn: 'simulated' },
  };
}

async function sentToCloud(input: Partial<RunInput> & { text: string }, entities: Entity[] = []) {
  const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
  const outcome = await runPipeline({ task: 'rewrite', preference: 'cloud', ...input }, { device: nano(entities), cloud });
  if (outcome.kind === 'blocked') {
    expect(cloud.requests).toHaveLength(0);
    return '';
  }
  expect(cloud.requests).toHaveLength(1);
  return cloud.requests[0]?.prompt ?? '';
}

function expectAbsent(payload: string, values: string[]) {
  const digits = payload.replace(/\D/g, '');
  for (const value of values) {
    expect(payload.toLowerCase(), value).not.toContain(value.toLowerCase());
    const valueDigits = value.replace(/\D/g, '');
    if (valueDigits.length >= 7) expect(digits, value).not.toContain(valueDigits);
  }
}

describe('round-2 review: values the patterns claim to catch, in hostile surroundings', () => {
  it.each([
    ['phone with an extension', 'Phone 202-555-0100x1234', ['202-555-0100']],
    ['two phones joined by a hyphen', '202-555-0100-202-555-0101', ['202-555-0100', '202-555-0101']],
    ['card after a placeholder-like prefix', '[ID_1]-4111111111111111', ['4111111111111111']],
    ['card inside a URL path', 'https://example.com/cards/x4111111111111111', ['4111111111111111']],
    ['card written as a fake placeholder', '[CARD_4111 1111 1111 1111]', ['4111 1111 1111 1111']],
    ['phone written as a fake placeholder', '[PHONE_2025550100]', ['2025550100']],
    ['phone digits hidden by folding', 'Ref 7\n202\n555\n0100', ['202 555 0100']],
    ['card followed by more digits on the next line', '4111\n1111\n1111\n1111\n12345678', ['4111 1111 1111 1111']],
    ['IBAN from a country missing from the length table', 'IBAN SA0380000000608010167519.', ['SA0380000000608010167519']],
    ['quoted email local part', 'Email "john doe"@example.com.', ['"john doe"@example.com']],
    ['quoted email local part containing @', 'Email "john@doe"@example.com.', ['"john@doe"@example.com']],
    ['SSN without separators', 'SSN 078051120.', ['078051120']],
    ['SSN with dots', 'SSN 078.05.1120.', ['078.05.1120']],
    ['SSN on three lines', 'SSN 078\n05\n1120.', ['078 05 1120']],
    ['phone with slashes', 'Call 202/555/0100.', ['202/555/0100']],
    ['card with doubled separators', 'Card 4111--1111--1111--1111.', ['4111--1111--1111--1111']],
    ['international phone with spaced parentheses (CodeRabbit)', 'Call +49 (30) 12345678 today.', ['12345678']],
    ['7-digit local phone after a label colon', 'Phone:555-0142', ['555-0142']],
    ['7-digit local phone with a dash', 'Call me on 555-0142 tonight.', ['555-0142']],
    ['7-digit local phone with dots', 'Office: 555.0177.', ['555.0177']],
    ['7-digit local phone with a space', 'Ring 555 0163 after six.', ['555 0163']],
  ])('%s', async (_name, text, values) => {
    expectAbsent(await sentToCloud({ text }), values);
  });
});

describe('round-2 review: what Gemini Nano reported must be applied everywhere', () => {
  it('a model entity that includes a generated placeholder still redacts its other part', async () => {
    const payload = await sentToCloud(
      { text: '48 Larkspur Lane alice@example.com' },
      [{ text: '48 Larkspur Lane [EMAIL_1]', type: 'ADDRESS' }],
    );
    expectAbsent(payload, ['Larkspur', 'alice@example.com']);
  });

  it('a name reported in the instruction is also redacted in the text, and vice versa', async () => {
    const payload = await sentToCloud(
      { text: 'Dana', task: 'custom', customInstruction: 'Write to Dana Whitfield.' },
      [{ text: 'Dana Whitfield', type: 'PERSON' }],
    );
    expectAbsent(payload, ['Dana', 'Whitfield']);
  });

  it('two-letter and lowercase name parts are redacted', async () => {
    expectAbsent(await sentToCloud({ text: 'Li Wu. Li called.' }, [{ text: 'Li Wu', type: 'PERSON' }]), ['Li ', 'Wu']);
    expectAbsent(
      await sentToCloud({ text: 'Dana Whitfield. dana called.' }, [{ text: 'dana whitfield', type: 'PERSON' }]),
      ['dana'],
    );
  });

  it('keeps dates, short order numbers and prices readable', async () => {
    const payload = await sentToCloud({ text: 'Order #A-20931 shipped on 2026-11-18 for $1,250.00.' });
    expect(payload).toContain('#A-20931');
    expect(payload).toContain('2026-11-18');
    expect(payload).toContain('$1,250.00');
  });
});

describe('round-4: a value split between the custom instruction and the text', () => {
  it('never sends a phone number whose halves sit in the instruction and the text', async () => {
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    const outcome = await runPipeline(
      { task: 'custom', preference: 'cloud', customInstruction: 'Call 202-55', text: '5-0100 about the refund.' },
      { device: nano(), cloud },
    );
    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') expect(outcome.reason).toBe('egress-guard');
    expect(cloud.requests).toHaveLength(0);
  });

  it.each([
    ['Contact alice@', 'example.com'],
    ['Call 202-        ', '5550100 about the refund.'],
  ])('blocks a split value before any cloud call: %s / %s', async (customInstruction, text) => {
    const cloud = new RecordingModel(new FakeModel({ location: 'cloud' }));
    const outcome = await runPipeline(
      { task: 'custom', preference: 'cloud', customInstruction, text },
      { device: nano(), cloud },
    );
    expect(outcome.kind).toBe('blocked');
    if (outcome.kind === 'blocked') expect(outcome.reason).toBe('egress-guard');
    expect(cloud.requests).toHaveLength(0);
  });

  it('still answers when the instruction ends and the text starts with unrelated short numbers', async () => {
    const payload = await sentToCloud({ task: 'custom', customInstruction: 'List the top 3', text: '12 items shipped on 2026-11-18.' });
    expect(payload).toContain('2026-11-18');
  });
});
