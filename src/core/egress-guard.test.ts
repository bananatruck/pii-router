import { expect, it } from 'vitest';
import { checkEgress, checkSplitAcrossSegments } from './egress-guard';
import type { Vault } from './redact';
const vault: Vault = { entries: new Map([
  ['[PERSON_1]', { type: 'PERSON', value: 'Alice Example' }],
  ['[PHONE_1]', { type: 'PHONE', value: '(202) 555-0100' }],
]) };
it.each(['alice example', '202.555.0100', 'new@example.net', '4111 1111 1111 1111', 'GB82 WEST 1234 5698 7654 32', '078-05-1120', '192.0.2.1'])('blocks leaked value %s without echoing it', value => {
  const result = checkEgress(`Text: ${value}`, vault);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).not.toContain(value);
});
it('detects reformatted digits even when separated across payload fields', () => expect(checkEgress('202 / 555 / 0100', vault).ok).toBe(false));
it('allows clean placeholders', () => expect(checkEgress('Hello [PERSON_1] [PHONE_1]', vault)).toEqual({ ok: true }));
it('blocks a phone split across a newline in the folded scan', () => {
  const result = checkEgress('Call (312) 555-\n0142 today.', vault);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toBe('Remaining PHONE pattern.');
});

it('does not block a clean payload because a value appears inside a generated placeholder (CodeRabbit)', () => {
  const vault = { entries: new Map([['[PERSON_1]', { type: 'PERSON' as const, value: 'Son' }]]) };
  expect(checkEgress('Write to [PERSON_1] today.', vault)).toEqual({ ok: true });
  expect(checkEgress('Write to Son today.', vault).ok).toBe(false);
});

it.each([
  ['Contact alice@', 'example.com', 'EMAIL'],
  ['Contact al', 'ice@example.com', 'EMAIL'],
  ['Call 202-        ', '5550100 about the refund.', 'PHONE'],
  ['Call 202-55', '5-0100 about the refund.', 'PHONE'],
  ['Call ２０２-        ', '５５５０１００ about the refund.', 'PHONE'],
  ['Call 202-', '        5550100 about the refund.', 'PHONE'],
  ['Call 202-  55', '5-0100 about the refund.', 'PHONE'],
])('blocks a %s / %s split at the segment boundary', (instruction, text, type) => {
  const result = checkSplitAcrossSegments(instruction, text, { entries: new Map() });
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.reason).toMatch(type === 'EMAIL' ? /EMAIL/ : /PHONE|ID/);
});

it.each([
  ['', 'alice@example.com'],
  ['Contact alice@example.com;', 'today'],
  ['Contact: ', 'alice@example.com'],
  ['List the top 3', '12 items'],
  ['Call 202-555-0100        ', 'about the refund.'],
])('does not count a value wholly within one segment as split: %s / %s', (instruction, text) => {
  expect(checkSplitAcrossSegments(instruction, text, { entries: new Map() })).toEqual({ ok: true });
});
