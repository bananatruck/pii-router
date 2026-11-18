import type { DetectorSource, Finding, PiiType, SegmentId } from './types';

export interface Vault { readonly entries: ReadonlyMap<string, { type: PiiType; value: string }> }

type Candidate = {
  segment: SegmentId;
  type: PiiType;
  value: string;
  start: number;
  end: number;
  source: DetectorSource;
};

type LocatedEntity = { type: PiiType; value: string; start: number; end: number };
export const PLACEHOLDER_SOURCE = String.raw`\[\s*([A-Z]+)[ _-]+(\d+)(?:[ _-]+([A-Z]+))?\s*\]`;
const onlyPlaceholder = new RegExp(`^${PLACEHOLDER_SOURCE}$`, 'i');

function canonical(type: PiiType, value: string): string {
  if (type === 'EMAIL') return value.toLowerCase();
  if (type === 'PHONE' || type === 'CARD' || type === 'SSN') return value.replace(/\D/g, '');
  if (type === 'IBAN') return value.replace(/\s/g, '');
  return value;
}

function tokenKey(token: string): string { return token.toUpperCase().replace(/[\s_-]/g, ''); }

function isAlphaNumeric(char: string | undefined): boolean {
  return char !== undefined && /[a-zA-Z0-9]/.test(char);
}

function hasAlphanumericWordBoundary(text: string, start: number, end: number): boolean {
  const value = text.slice(start, end);
  const before = start > 0 ? text[start - 1] : undefined;
  const after = text[end];
  if (isAlphaNumeric(value[0]) && isAlphaNumeric(before)) return false;
  if (isAlphaNumeric(value[value.length - 1]) && isAlphaNumeric(after)) return false;
  return true;
}

function personNameParts(entity: { text: string; type: PiiType }): Array<{ text: string; type: PiiType }> {
  const words = entity.text.trim().split(/\s+/);
  if (entity.type !== 'PERSON' || words.length < 2) return [];
  return words
    .filter(word => word.length >= 3 && /^[A-Z]/.test(word))
    .map(word => ({ text: word, type: 'PERSON' as const }));
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const patternDelta = Number(b.source === 'pattern') - Number(a.source === 'pattern');
  if (patternDelta !== 0) return patternDelta;
  const lengthDelta = (b.end - b.start) - (a.end - a.start);
  if (lengthDelta !== 0) return lengthDelta;
  return a.start - b.start;
}

function overlaps(candidate: Candidate, selected: Candidate[]): boolean {
  return selected.some(other => other.start < candidate.end && candidate.start < other.end);
}

type RedactResult = { redacted: Record<SegmentId, string>; findings: Finding[]; vault: Vault };

export function redactSegments(segments: Record<SegmentId, string>, candidates: Candidate[]): RedactResult {
  const entries = new Map<string, { type: PiiType; value: string }>();
  const findings: Finding[] = [];
  const shared = new Map<string, string>();
  const counts = new Map<PiiType, number>();
  const segmentText = `${segments.instruction}\n${segments.text}`;
  const reserved = new Set(
    [...segmentText.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'gi'))].map(m => tokenKey(m[0])),
  );
  const redacted = { ...segments };
  for (const segment of ['instruction', 'text'] satisfies SegmentId[]) {
    const selected: Candidate[] = [];
    const sorted = candidates.filter(c => c.segment === segment).sort(compareCandidates);
    for (const candidate of sorted) {
      const slice = segments[segment].slice(candidate.start, candidate.end);
      if (candidate.start < 0 || candidate.end <= candidate.start || slice !== candidate.value) continue;
      if (!overlaps(candidate, selected)) selected.push(candidate);
    }
    let cursor = 0;
    let result = '';
    for (const candidate of selected.sort((a, b) => a.start - b.start)) {
      const key = `${candidate.type}:${canonical(candidate.type, candidate.value)}`;
      let placeholder = shared.get(key);
      if (!placeholder) {
        const number = (counts.get(candidate.type) ?? 0) + 1;
        counts.set(candidate.type, number);
        placeholder = `[${candidate.type}_${number}]`;
        let suffix = '';
        while (reserved.has(tokenKey(placeholder))) {
          suffix += 'A';
          placeholder = `[${candidate.type}_${number}_${suffix}]`;
        }
        reserved.add(tokenKey(placeholder));
        shared.set(key, placeholder);
        entries.set(placeholder, { type: candidate.type, value: candidate.value });
      }
      findings.push({ ...candidate, placeholder });
      result += segments[segment].slice(cursor, candidate.start) + placeholder;
      cursor = candidate.end;
    }
    redacted[segment] = result + segments[segment].slice(cursor);
  }
  return { redacted, findings, vault: { entries } };
}

export function locateEntities(text: string, entities: Array<{ text: string; type: PiiType }>): LocatedEntity[] {
  const hits: LocatedEntity[] = [];
  const expanded = [...entities, ...entities.flatMap(personNameParts)];
  for (const entity of expanded) {
    if (entity.text.length < 2 || onlyPlaceholder.test(entity.text)) continue;
    let start = text.indexOf(entity.text);
    while (start !== -1) {
      const end = start + entity.text.length;
      if (hasAlphanumericWordBoundary(text, start, end)) {
        hits.push({ type: entity.type, value: entity.text, start, end });
      }
      start = text.indexOf(entity.text, start + 1);
    }
  }
  return hits;
}

export function restore(answer: string, vault: Vault): { text: string; unresolved: string[] } {
  const lookup = new Map([...vault.entries].map(([token, entry]) => [tokenKey(token), { token, value: entry.value }]));
  const used = new Set<string>();
  const unresolved = new Set<string>();
  const text = answer.replace(new RegExp(PLACEHOLDER_SOURCE, 'gi'), token => {
    const entry = lookup.get(tokenKey(token));
    if (!entry) { unresolved.add(token); return token; }
    used.add(entry.token);
    return entry.value;
  });
  for (const token of vault.entries.keys()) if (!used.has(token)) unresolved.add(token);
  return { text, unresolved: [...unresolved] };
}
