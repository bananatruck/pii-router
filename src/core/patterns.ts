import { ibanValid, luhnValid } from './checksums';
import type { PiiType } from './types';

export interface PatternHit { type: PiiType; value: string; start: number; end: number }

const PLACEHOLDER_IN_BRACKETS = /^\[\s*[A-Z]+[ _-]+\d+(?:[ _-]+[A-Z]+)?\s*\]$/i;
const EMAIL_PATTERN =
  /(?<![\w.+$€£-])[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?/gi;
const EMAIL_DOMAIN = /(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi;
const NA_PHONE_SEPARATED =
  /(?<![\w.+$€£-])(?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)[ .-]?|[2-9]\d{2}[ .-])\d{3}[ .-]?\d{4}(?![\w]|\.\d)/g;
const NA_PHONE_COMPACT =
  /(?<![\w.+$€£-])(?:\+?1)?[2-9]\d{2}[2-9]\d{2}\d{4}(?![\w]|\.\d)/g;

function insidePlaceholder(
  placeholders: Array<{ start: number; end: number }>,
  text: string,
  start: number,
  end: number,
): boolean {
  return placeholders.some(
    p =>
      p.start <= start
      && end <= p.end
      && PLACEHOLDER_IN_BRACKETS.test(text.slice(p.start, p.end)),
  );
}

function cardPattern(length: number): RegExp {
  return new RegExp(String.raw`(?<![\w-])\d(?:[ -]?\d){${length - 1}}(?![\w-])`, 'g');
}

export function detectPatterns(text: string): PatternHit[] {
  const hits: PatternHit[] = [];
  const placeholders = [...text.matchAll(/\[[^\]\r\n]*\]/g)].map(m => ({
    start: m.index,
    end: m.index + m[0].length,
  }));
  function scan(type: PiiType, regex: RegExp, valid: (s: string) => boolean = () => true) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (insidePlaceholder(placeholders, text, start, end)) continue;
      if (valid(value)) hits.push({ type, value, start, end });
    }
  }
  const emailRegex = new RegExp(`${EMAIL_PATTERN.source}${EMAIL_DOMAIN.source}`, EMAIL_PATTERN.flags);
  scan('EMAIL', emailRegex);
  scan('IBAN', /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/gi, ibanValid);
  // Try country-length prefixes as prose following a spaced IBAN can be alphanumeric.
  for (const m of text.matchAll(/\b[A-Z]{2}\d{2}/gi)) {
    for (let end = m.index + 15; end <= Math.min(text.length, m.index + 42); end++) {
      const value = text.slice(m.index, end);
      if (/[A-Z0-9]/i.test(text[end] ?? '') && !/\s/.test(text[end - 1] ?? '')) continue;
      if (ibanValid(value) && !/\s$/.test(value)) hits.push({ type: 'IBAN', value, start: m.index, end });
    }
  }
  for (let length = 19; length >= 13; length--) {
    scan('CARD', cardPattern(length), s => luhnValid(s.replace(/\D/g, '')));
  }
  scan('SSN', /(?<![\w\d-])\d{3}[- ]\d{2}[- ]\d{4}(?![\w\d-])/g, s => {
    const digits = s.replace(/\D/g, '');
    const area = Number(digits.slice(0, 3));
    return area > 0 && area !== 666 && area < 900 && digits.slice(3, 5) !== '00' && digits.slice(5) !== '0000';
  });
  scan('IP', /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?![\w]|\.\d)/g, s => s.split('.').every(o => Number(o) <= 255));
  scan('PHONE', NA_PHONE_SEPARATED);
  scan('PHONE', NA_PHONE_COMPACT);
  scan('PHONE', /(?<![\w+$€£])\+[1-9]\d(?:[ ()-]?\d){6,13}(?![\w]|[ ()-]\d)/g, s => {
    const count = s.replace(/\D/g, '').length;
    return count >= 8 && count <= 15;
  });
  const selected: PatternHit[] = [];
  for (const hit of hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start)) {
    if (!selected.some(h => hit.start < h.end && h.start < hit.end)) selected.push(hit);
  }
  return selected.sort((a, b) => a.start - b.start);
}
