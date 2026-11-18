import { describe, expect, it } from 'vitest';
import { foldPayloadForScan, normalizeInput, normalizeInputDetail } from './normalize';

describe('normalizeInput', () => {
  it('applies NFKC and strips format characters while keeping newlines', () => {
    const raw = '4111\u200b1111\n555';
    expect(normalizeInput(raw)).toBe('41111111\n555');
  });
  it('maps Unicode space separators to a plain space', () => {
    expect(normalizeInput('a\u00a0b')).toBe('a b');
  });
  it('counts look-alike and invisible changes', () => {
    const raw = 'Card 4111\u200b1111, also \uFF11\uFF11\uFF11\uFF11';
    const detail = normalizeInputDetail(raw);
    expect(detail.changeCount).toBeGreaterThan(0);
    expect(detail.text).toContain('41111111');
    expect(detail.text).toContain('1111');
  });
  it('folds digit groups split across whitespace for egress scanning', () => {
    expect(foldPayloadForScan('(312) 555-\n0142')).toBe('(312) 555-0142');
  });
});