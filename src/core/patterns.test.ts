import { describe, expect, it } from 'vitest';
import { ibanValid, luhnValid } from './checksums';
import { detectPatterns } from './patterns';

describe('checksums', () => {
  it.each(['4111111111111111', '5555555555554444', '4222222222222', '4000000000000000006'])('accepts published Luhn test card %s', card => expect(luhnValid(card)).toBe(true));
  it.each(['', '123', '0000000000000000', '4111111111111112', '4111 1111 1111 1111'])('rejects invalid digit input %s', card => expect(luhnValid(card)).toBe(false));
  it.each(['GB82 WEST 1234 5698 7654 32', 'DE89 3704 0044 0532 0130 00', 'FR14 2004 1010 0505 0001 3M02 606', 'NL91 ABNA 0417 1643 00', 'IE29 AIBK 9311 5212 3456 78'])('validates example IBAN %s', iban => expect(ibanValid(iban)).toBe(true));
  it.each(['GB82 WEST 1234 5698 7654 33', 'ZZ82 WEST 1234 5698 7654 32', 'DE8937040044053201300', '', 'GB00WEST12345698765432'])('rejects invalid IBAN %s', iban => expect(ibanValid(iban)).toBe(false));
});
describe('patterns', () => {
  it.each([
    ['EMAIL', 'alice+test@example.com'], ['EMAIL', 'x@example.org'],
    ['PHONE', '(202) 555-0100'], ['PHONE', '+1 202-555-0101'], ['PHONE', '1 202 555 0102'],
    ['PHONE', '2025550103'], ['PHONE', '(555) 010-0142'], ['PHONE', '555-010-0142'], ['PHONE', '555.010.0142'],
    ['PHONE', '+44 20 7946 0958'], ['PHONE', '+12345678'], ['PHONE', '+123456789012345'],
    ['CARD', '4111 1111 1111 1111'], ['CARD', '4111.1111.1111.1111'], ['CARD', '5555-5555-5555-4444'],
    ['EMAIL', 'josé@example.com'],
    ['IBAN', 'GB82 WEST 1234 5698 7654 32'], ['IBAN', 'DE89370400440532013000'],
    ['SSN', '078-05-1120'], ['SSN', '078 05 1120'], ['IP', '192.0.2.1'], ['IP', '255.255.255.255'],
  ])('finds %s in %s', (type, value) => {
    const text = `Contact: ${value}; thanks.`;
    const hits = detectPatterns(text);
    expect(hits).toEqual([{ type, value, start: 9, end: 9 + value.length }]);
  });
  it.each([
    'year 2026', '$1234.56', '2026-11-17', '11/17/2026', 'v1.2.3', '1.2.3',
    'ZIP 90210', '256.0.0.1', '1.2.3.4.5', 'hello@example', '+1234567',
  ])('ignores %s', text => expect(detectPatterns(text)).toEqual([]));
  // Values that fail a specific validator (Luhn, SSN ranges, mod-97, phone rules) are not given that
  // type, but 9 or more digits are still masked by the generic ID run (round-2 review).
  it.each([
    '$2025550100', '€2025550100', '4111 1111 1111 1112', 'GB82 WEST 1234 5698 7654 33',
    '000-05-1120', '666-05-1120', '900-05-1120', '078-00-1120', '078-05-0000',
    '+1234567890123456', '123-456-7890',
  ])('does not classify %s as a specific type but masks its digits as ID', text => {
    const hits = detectPatterns(text);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(h => h.type === 'ID')).toBe(true);
  });
  it('scans user-typed placeholder lookalikes unless this run generated them', () => {
    expect(detectPatterns('[PHONE_2025550100]').map(h => h.type)).toEqual(['ID']);
    expect(detectPatterns('[EMAIL_1] [PHONE_12] [ EMAIL 1 ]')).toEqual([]);
    const allowed = new Set(['[PHONE_2025550100]']);
    expect(detectPatterns('[PHONE_2025550100]', { allowedPlaceholders: allowed })).toEqual([]);
  });
  it('accepts a checksum-valid IBAN from a country missing from the length table', () => {
    expect(detectPatterns('IBAN SA0380000000608010167519.').map(h => h.type)).toEqual(['IBAN']);
  });
  it.each(['202-555-0100', '192.0.2.1'])('detects %s before a sentence-ending period', value => {
    expect(detectPatterns(`Contact ${value}.`)[0]?.value).toBe(value);
  });
  it('keeps non-overlapping hits in source order, preferring the longer IBAN over embedded digits', () => {
    const hits = detectPatterns('alice@example.com GB82 WEST 1234 5698 7654 32 192.0.2.1');
    expect(hits.map(h => h.type)).toEqual(['EMAIL', 'IBAN', 'IP']);
    expect(hits.every((h, i) => i === 0 || h.start >= (hits[i - 1]?.end ?? 0))).toBe(true);
  });
});

it.each(['Phone:555-0142', 'Office:555.0177', 'Call:555 0163'])('detects a local phone immediately after a label colon: %s', text => {
  expect(detectPatterns(text)).toEqual([{ type: 'PHONE', value: text.slice(text.indexOf(':') + 1), start: text.indexOf(':') + 1, end: text.length }]);
});
it.each(['12:555-0142', '12:555.0177', '12:555 0163', 'v:555-0142/8'])('does not classify a numeric colon fragment as a phone: %s', text => {
  expect(detectPatterns(text).some(hit => hit.type === 'PHONE')).toBe(false);
});
