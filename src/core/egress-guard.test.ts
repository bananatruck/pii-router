import { expect, it } from 'vitest';
import { checkEgress } from './egress-guard';
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
