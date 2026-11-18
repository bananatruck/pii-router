import { describe, expect, it } from 'vitest';
import { detectPatterns } from './patterns';
import { locateEntities, redactSegments, restore } from './redact';
import type { DetectorSource, SegmentId } from './types';
function redact(text: string, instruction = '') {
  const segments = { text, instruction };
  return redactSegments(segments, (['instruction', 'text'] satisfies SegmentId[]).flatMap(segment => detectPatterns(segments[segment]).map(h => ({ ...h, segment, source: 'pattern' satisfies DetectorSource }))));
}
describe('redaction', () => {
  it('round trips and numbers instruction before text', () => {
    const result = redact('b@example.org calls 202-555-0100', 'Send to a@example.com');
    expect(result.redacted.instruction).toBe('Send to [EMAIL_1]');
    expect(result.redacted.text).toBe('[EMAIL_2] calls [PHONE_1]');
    expect(restore(result.redacted.text + result.redacted.instruction, result.vault)).toEqual({ text: 'b@example.org calls 202-555-0100Send to a@example.com', unresolved: [] });
  });
  it('shares placeholders for equivalent values', () => {
    const result = redact('alice@example.com alice@EXAMPLE.com 202-555-0100 (202) 555-0100 4111-1111-1111-1111 4111111111111111 078-05-1120 078 05 1120 GB82 WEST 1234 5698 7654 32 GB82WEST12345698765432');
    expect(result.vault.entries.size).toBe(5);
    expect(result.findings.map(f => f.placeholder)).toEqual(['[EMAIL_1]', '[EMAIL_1]', '[PHONE_1]', '[PHONE_1]', '[CARD_1]', '[CARD_1]', '[SSN_1]', '[SSN_1]', '[IBAN_1]', '[IBAN_1]']);
  });
  it('avoids both literal and tolerant placeholder collisions across segments', () => {
    const result = redact('alice@example.com [EMAIL_1] [email 1 a]', '[EMAIL_1_AA]');
    expect(result.findings[0]?.placeholder).toBe('[EMAIL_1_AAA]');
    const answer = restore(result.redacted.text, result.vault);
    expect(answer.text).toBe('alice@example.com [EMAIL_1] [email 1 a]');
    expect(answer.unresolved).toContain('[EMAIL_1]');
  });
  it('prefers patterns over longer model entities, then longer same-source spans', () => {
    const text = 'Alice Example alice@example.com';
    const result = redactSegments({ text, instruction: '' }, [
      { segment: 'text', type: 'PERSON', value: text, start: 0, end: text.length, source: 'device-model' },
      { segment: 'text', type: 'EMAIL', value: 'alice@example.com', start: 14, end: text.length, source: 'pattern' },
      { segment: 'text', type: 'PERSON', value: 'Alice', start: 0, end: 5, source: 'device-model' },
      { segment: 'text', type: 'PERSON', value: 'Alice Example', start: 0, end: 13, source: 'device-model' },
    ]);
    expect(result.redacted.text).toBe('[PERSON_1] [EMAIL_1]');
    expect(result.findings.some(f => f.value === 'Alice')).toBe(false);
  });
  it('keeps non-overlapping slices when a model span loses to a pattern hit', () => {
    const text = '48 Larkspur Lane, card 4111-1111-1111-1111';
    const whole = text;
    const cardStart = text.indexOf('4111');
    const result = redactSegments({ text, instruction: '' }, [
      { segment: 'text', type: 'ADDRESS', value: whole, start: 0, end: whole.length, source: 'device-model' },
      {
        segment: 'text',
        type: 'CARD',
        value: '4111-1111-1111-1111',
        start: cardStart,
        end: cardStart + '4111-1111-1111-1111'.length,
        source: 'pattern',
      },
    ]);
    expect(result.redacted.text.toLowerCase()).not.toContain('larkspur');
    expect(result.redacted.text).not.toContain('4111');
    expect(result.redacted.text).toMatch(/\[ADDRESS_\d+\].*\[CARD_\d+\]/);
  });
  it('locates entities case-insensitively with flexible internal whitespace', () => {
    const text = 'Patient Dana Whitfield';
    // The full name, plus each part on its own (round-2 review: parts in any case are redacted too).
    expect(locateEntities(text, [{ text: 'dana  whitfield', type: 'PERSON' }])).toEqual([
      { type: 'PERSON', value: 'Dana Whitfield', start: 8, end: 22 },
      { type: 'PERSON', value: 'Dana', start: 8, end: 12 },
      { type: 'PERSON', value: 'Whitfield', start: 13, end: 22 },
    ]);
  });
  it('locates case-insensitive matches and ignores absent, short, or placeholder entities', () => {
    expect(locateEntities('Alice Alice alice', [
      { text: 'Alice', type: 'PERSON' }, { text: 'a', type: 'OTHER' },
      { text: '[EMAIL_1]', type: 'OTHER' }, { text: 'Absent', type: 'PERSON' },
    ])).toEqual([
      { type: 'PERSON', value: 'Alice', start: 0, end: 5 },
      { type: 'PERSON', value: 'Alice', start: 6, end: 11 },
      { type: 'PERSON', value: 'alice', start: 12, end: 17 },
    ]);
  });
  it('respects word boundaries for alphanumeric entity edges', () => {
    expect(locateEntities('Edited by Ed today. Ed, please help.', [{ text: 'Ed', type: 'PERSON' }])).toEqual([
      { type: 'PERSON', value: 'Ed', start: 10, end: 12 },
      { type: 'PERSON', value: 'Ed', start: 20, end: 22 },
    ]);
  });
  it('locates name parts from multi-word PERSON entities', () => {
    const text = 'Dana Whitfield wrote. Later, Dana called again about Whitfield\'s order.';
    const hits = locateEntities(text, [{ text: 'Dana Whitfield', type: 'PERSON' }]);
    expect(hits.filter(h => h.value === 'Dana').map(h => h.start)).toEqual([0, 29]);
    expect(hits.filter(h => h.value === 'Whitfield').map(h => h.start)).toEqual([5, 53]);
    expect(hits.some(h => h.value === 'Dana Whitfield')).toBe(true);
  });
  it('restores tolerant spellings once without recursively restoring values', () => {
    const result = redact('alice@example.com 202-555-0100');
    for (const token of ['[email_1]', '[ EMAIL_1 ]', '[EMAIL 1]', '[EMAIL-1]']) {
      expect(restore(`${token} [phone 1] [ID_99]`, result.vault)).toEqual({ text: 'alice@example.com 202-555-0100 [ID_99]', unresolved: ['[ID_99]'] });
    }
    expect(restore('No tokens', result.vault).unresolved).toEqual(['[EMAIL_1]', '[PHONE_1]']);
    const vault = { entries: new Map([['[OTHER_1]', { type: 'OTHER' as const, value: '[EMAIL_1]' }]]) };
    expect(restore('[OTHER_1]', vault).text).toBe('[EMAIL_1]');
  });
  it('keeps email addresses that differ only in local-part case apart (CodeRabbit)', () => {
    const result = redact('Smith@example.com and smith@EXAMPLE.com');
    expect(result.vault.entries.size).toBe(2);
    expect(restore(result.redacted.text, result.vault).text).toBe('Smith@example.com and smith@EXAMPLE.com');
  });
});
