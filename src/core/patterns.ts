import { ibanValid, luhnValid } from './checksums';
import type { PiiType } from './types';

export interface PatternHit { type: PiiType; value: string; start: number; end: number }

export interface DetectOptions {
  /**
   * Placeholders this run generated (vault keys). Only these exact strings are skipped; anything
   * else that merely looks like a placeholder, for example "[PHONE_2025550100]", is scanned.
   */
  allowedPlaceholders?: ReadonlySet<string>;
}

/** Quoted local part ("john doe"@example.com), valid under RFC 5321. */
const QUOTED_EMAIL =
  /"[^"\r\n]{1,64}"@[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)+/gu;
/**
 * Any run of 9 or more digits joined by up to 3 separator characters, wherever it sits (inside a
 * URL, after an underscore, across lines). A catch-all for numbers the specific patterns miss:
 * phones with extensions, SSNs without dashes, slashed or doubled separators. Dates (8 digits),
 * short order numbers and prices stay readable.
 */
const LONG_DIGIT_RUN = /\d(?:[\s./-]{0,3}\d){8,}/g;
/**
 * A 7-digit local phone number (555-0142, 555.0142, 555 0142): three digits, one separator, four
 * digits, standing alone. Under the 9-digit catch-all, so it needs its own rule (round-4 review).
 */
export const LOCAL_PHONE = /(?:(?<![\w.+$€£/:-])|(?<=\p{L}:))\d{3}[-. ]\d{4}(?![\w/:]|[-.]\d)/gu;
/** On a tie in length, a specific type wins over the generic ID run. */
const GENERIC_TYPES: ReadonlySet<PiiType> = new Set(['ID']);
const EMAIL_PATTERN =
  /(?<![\w.+$€£-])[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]+@[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?/giu;
const EMAIL_DOMAIN = /(?:\.[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?)+/giu;
/** The email pattern. Find matches with `scanEmails`, which gives the same results in linear time. */
export const EMAIL_REGEX = new RegExp(`${EMAIL_PATTERN.source}${EMAIL_DOMAIN.source}`, EMAIL_PATTERN.flags);
const EMAIL_STICKY = new RegExp(EMAIL_REGEX.source, 'iuy');
/** The email pattern's own lookbehind, alone, to test a start position in constant time. */
const EMAIL_START = /(?<![\w.+$€£-])/iuy;
// Same class and flags as the pattern's local part: with `i`, characters that only case-fold
// into the class (U+0345) belong to it too.
const LOCAL_PART_CHAR = /^[\p{L}\p{N}.!#$%&'*+/=?^_`{|}~-]$/iu;

function isPair(text: string, at: number): boolean {
  return /[\uD800-\uDBFF]/.test(text[at] ?? '') && /[\uDC00-\uDFFF]/.test(text[at + 1] ?? '');
}

/**
 * The matches of `EMAIL_REGEX`, as `[index, value]`, found in linear time. A match's local part
 * is a run of local-part characters ending at an `@`, so only such runs can hold a match start.
 * Searching with the global pattern tried every position of every run, and a run with no `@`
 * after it was scanned to its end from each position: quadratic on long pasted input. Here each
 * `@` is tried from the first position of its run that the lookbehind accepts; a later start in
 * the same run reaches the same `@` and domain, so it cannot succeed where that one failed.
 */
export function scanEmails(text: string): Array<readonly [number, string]> {
  const found: Array<readonly [number, string]> = [];
  let consumed = 0;
  for (let at = text.indexOf('@'); at !== -1; at = text.indexOf('@', at + 1)) {
    if (at < consumed) continue;
    // Walk back over the local-part characters before this @, by whole code points.
    let start = at;
    while (start > consumed) {
      const back = start >= 2 && isPair(text, start - 2) ? 2 : 1;
      if (!LOCAL_PART_CHAR.test(text.slice(start - back, start))) break;
      start -= back;
    }
    for (let position = start; position < at; position += isPair(text, position) ? 2 : 1) {
      EMAIL_START.lastIndex = position;
      if (!EMAIL_START.test(text)) continue;
      EMAIL_STICKY.lastIndex = position;
      const match = EMAIL_STICKY.exec(text);
      if (match) {
        found.push([position, match[0]] as const);
        consumed = position + match[0].length;
      }
      break;
    }
  }
  return found;
}
const NA_PHONE_SEPARATED =
  /(?<![\w.+$€£-])(?:\+?1[ .-]?)?(?:\([2-9]\d{2}\)[ .-]?|[2-9]\d{2}[ .-])\d{3}[ .-]?\d{4}(?![\w]|\.\d)/g;
const NA_PHONE_COMPACT =
  /(?<![\w.+$€£-])(?:\+?1)?[2-9]\d{2}[2-9]\d{2}\d{4}(?![\w]|\.\d)/g;

function insidePlaceholder(placeholders: Array<{ start: number; end: number }>, start: number, end: number): boolean {
  return placeholders.some(p => p.start <= start && end <= p.end);
}

function compareHits(a: PatternHit, b: PatternHit): number {
  const lengthDelta = (b.end - b.start) - (a.end - a.start);
  if (lengthDelta !== 0) return lengthDelta;
  const genericDelta = Number(GENERIC_TYPES.has(a.type)) - Number(GENERIC_TYPES.has(b.type));
  if (genericDelta !== 0) return genericDelta;
  return a.start - b.start;
}

function cardPattern(length: number): RegExp {
  return new RegExp(String.raw`(?<![\w-])\d(?:[ .-]?\d){${length - 1}}(?![\w-])`, 'g');
}

export function detectPatterns(text: string, options: DetectOptions = {}): PatternHit[] {
  const hits: PatternHit[] = [];
  const allowed = options.allowedPlaceholders ?? new Set<string>();
  const placeholders = [...text.matchAll(/\[[^\]\r\n]*\]/g)]
    .filter(m => allowed.has(m[0]))
    .map(m => ({ start: m.index, end: m.index + m[0].length }));
  function scan(type: PiiType, regex: RegExp, valid: (s: string) => boolean = () => true) {
    for (const match of text.matchAll(regex)) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (insidePlaceholder(placeholders, start, end)) continue;
      if (valid(value)) hits.push({ type, value, start, end });
    }
  }
  for (const [start, value] of scanEmails(text)) {
    const end = start + value.length;
    if (!insidePlaceholder(placeholders, start, end)) hits.push({ type: 'EMAIL', value, start, end });
  }
  scan('EMAIL', QUOTED_EMAIL);
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
  scan('PHONE', LOCAL_PHONE);
  // Up to two separators between digits, so "+49 (30) 12345678" matches (CodeRabbit review).
  scan('PHONE', /(?<![\w+$€£])\+[1-9]\d(?:[ ()-]{0,2}\d){6,13}(?![\w]|[ ()-]{1,2}\d)/g, s => {
    const count = s.replace(/\D/g, '').length;
    return count >= 8 && count <= 15;
  });
  const selected: PatternHit[] = [];
  for (const hit of hits.sort(compareHits)) {
    if (!selected.some(h => hit.start < h.end && h.start < hit.end)) selected.push(hit);
  }
  // Second phase: long digit runs among whatever the specific patterns left, so the catch-all never
  // swallows neighbouring values that were classified correctly.
  let masked = text;
  for (const span of [...selected, ...placeholders]) {
    masked = masked.slice(0, span.start) + '#'.repeat(span.end - span.start) + masked.slice(span.end);
  }
  for (const match of masked.matchAll(LONG_DIGIT_RUN)) {
    selected.push({ type: 'ID', value: match[0], start: match.index, end: match.index + match[0].length });
  }
  return selected.sort((a, b) => a.start - b.start);
}
