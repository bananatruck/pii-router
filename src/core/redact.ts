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
  // Local parts are case-sensitive (RFC 5321), so only the domain is folded (CodeRabbit review).
  if (type === 'EMAIL') return value.replace(/@[^@]*$/, domain => domain.toLowerCase());
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

/** Name particles that would over-redact ordinary words if treated as names on their own. */
const NAME_PARTICLES = new Set(['de', 'da', 'di', 'du', 'del', 'der', 'den', 'la', 'le', 'van', 'von', 'bin', 'al']);

/**
 * Each part of a reported full name, so a later "Dana" or "Li" alone is redacted too. Any case and
 * any length from 2 letters (round-2 review: "Li Wu" then "Li", and lowercase "dana").
 */
function personNameParts(entity: { text: string; type: PiiType }): Array<{ text: string; type: PiiType }> {
  const words = entity.text.trim().split(/\s+/).map(word => word.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, ''));
  if (entity.type !== 'PERSON' || words.length < 2) return [];
  return words
    .filter(word => word.length >= 2 && !NAME_PARTICLES.has(word.toLowerCase()))
    .map(word => ({ text: word, type: 'PERSON' as const }));
}

/**
 * The detector reads pattern-redacted text, so it may report "48 Larkspur Lane [EMAIL_1]". The
 * placeholder is not in the original text; locate the parts around it instead (round-2 review).
 */
function entityPieces(entity: { text: string; type: PiiType }): Array<{ text: string; type: PiiType }> {
  if (!new RegExp(PLACEHOLDER_SOURCE, 'i').test(entity.text)) return [entity];
  return entity.text
    .split(new RegExp(PLACEHOLDER_SOURCE.replace(/\((?!\?)/g, '(?:'), 'gi'))
    .map(piece => piece.trim().replace(/^[,;:.\s]+|[,;:.\s]+$/g, ''))
    .filter(piece => piece.length >= 2)
    .map(piece => ({ text: piece, type: entity.type }));
}

function compareCandidates(a: Candidate, b: Candidate): number {
  const patternDelta = Number(b.source === 'pattern') - Number(a.source === 'pattern');
  if (patternDelta !== 0) return patternDelta;
  const lengthDelta = (b.end - b.start) - (a.end - a.start);
  if (lengthDelta !== 0) return lengthDelta;
  return a.start - b.start;
}

function overlaps(candidate: Candidate, selected: Candidate[]): boolean {
  return selected.some(
    other =>
      other.segment === candidate.segment
      && other.start < candidate.end
      && candidate.start < other.end,
  );
}

function uncoveredSlices(candidate: Candidate, selected: Candidate[]): Array<{ start: number; end: number }> {
  const blocks = selected
    .filter(
      other =>
        other.segment === candidate.segment
        && other.start < candidate.end
        && candidate.start < other.end,
    )
    .sort((a, b) => a.start - b.start);
  if (!blocks.length) return [{ start: candidate.start, end: candidate.end }];
  const slices: Array<{ start: number; end: number }> = [];
  let cursor = candidate.start;
  for (const block of blocks) {
    if (cursor < block.start) slices.push({ start: cursor, end: block.start });
    cursor = Math.max(cursor, block.end);
  }
  if (cursor < candidate.end) slices.push({ start: cursor, end: candidate.end });
  return slices;
}

const PART_TRIM = /[\s,;:.]/;

function trimSlice(text: string, start: number, end: number): { start: number; end: number } | null {
  let s = start;
  let e = end;
  while (s < e && PART_TRIM.test(text[s] ?? '')) s += 1;
  while (e > s && PART_TRIM.test(text[e - 1] ?? '')) e -= 1;
  return e - s >= 2 ? { start: s, end: e } : null;
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
    const pending = [...sorted];
    for (let i = 0; i < pending.length; i += 1) {
      const candidate = pending[i]!;
      const slice = segments[segment].slice(candidate.start, candidate.end);
      if (candidate.start < 0 || candidate.end <= candidate.start || slice !== candidate.value) continue;
      if (!overlaps(candidate, selected)) {
        selected.push(candidate);
        continue;
      }
      for (const part of uncoveredSlices(candidate, selected)) {
        const trimmed = trimSlice(segments[segment], part.start, part.end);
        if (!trimmed) continue;
        pending.push({
          ...candidate,
          start: trimmed.start,
          end: trimmed.end,
          value: segments[segment].slice(trimmed.start, trimmed.end),
        });
      }
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

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleEntityPattern(entityText: string): RegExp {
  const parts = entityText.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return /$^/;
  const body = parts.map(escapeRegExp).join('\\s+');
  return new RegExp(body, 'giu');
}

export function locateEntities(text: string, entities: Array<{ text: string; type: PiiType }>): LocatedEntity[] {
  const hits: LocatedEntity[] = [];
  const pieces = entities.flatMap(entityPieces);
  const expanded = [...pieces, ...pieces.flatMap(personNameParts)];
  for (const entity of expanded) {
    if (entity.text.length < 2 || onlyPlaceholder.test(entity.text)) continue;
    const regex = flexibleEntityPattern(entity.text);
    for (const match of text.matchAll(regex)) {
      const start = match.index;
      if (start === undefined) continue;
      const value = text.slice(start, start + match[0].length);
      const end = start + value.length;
      if (hasAlphanumericWordBoundary(text, start, end)) {
        hits.push({ type: entity.type, value, start, end });
      }
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
