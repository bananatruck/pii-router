import type { DetectorSource, Finding, PiiType, SegmentId } from './types';

export interface Vault { readonly entries: ReadonlyMap<string, { type: PiiType; value: string }> }
type Candidate = { segment: SegmentId; type: PiiType; value: string; start: number; end: number; source: DetectorSource };
export const PLACEHOLDER_SOURCE = String.raw`\[\s*([A-Z]+)[ _-]+(\d+)(?:[ _-]+([A-Z]+))?\s*\]`;
const onlyPlaceholder = new RegExp(`^${PLACEHOLDER_SOURCE}$`, 'i');
function canonical(type: PiiType, value: string): string {
  if (type === 'EMAIL') return value.toLowerCase();
  if (type === 'PHONE' || type === 'CARD' || type === 'SSN') return value.replace(/\D/g, '');
  if (type === 'IBAN') return value.replace(/\s/g, '');
  return value;
}
function tokenKey(token: string): string { return token.toUpperCase().replace(/[\s_-]/g, ''); }

export function redactSegments(segments: Record<SegmentId, string>, candidates: Candidate[]): { redacted: Record<SegmentId, string>; findings: Finding[]; vault: Vault } {
  const entries = new Map<string, { type: PiiType; value: string }>();
  const findings: Finding[] = [];
  const shared = new Map<string, string>();
  const counts = new Map<PiiType, number>();
  const reserved = new Set([...`${segments.instruction}\n${segments.text}`.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'gi'))].map(m => tokenKey(m[0])));
  const redacted = { ...segments };
  for (const segment of ['instruction', 'text'] satisfies SegmentId[]) {
    const selected: Candidate[] = [];
    const sorted = candidates.filter(c => c.segment === segment).sort((a, b) => Number(b.source === 'pattern') - Number(a.source === 'pattern') || (b.end - b.start) - (a.end - a.start) || a.start - b.start);
    for (const candidate of sorted) {
      if (candidate.start < 0 || candidate.end <= candidate.start || segments[segment].slice(candidate.start, candidate.end) !== candidate.value) continue;
      if (!selected.some(c => c.start < candidate.end && candidate.start < c.end)) selected.push(candidate);
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

export function locateEntities(text: string, entities: Array<{ text: string; type: PiiType }>): Array<{ type: PiiType; value: string; start: number; end: number }> {
  const hits: Array<{ type: PiiType; value: string; start: number; end: number }> = [];
  for (const entity of entities) {
    if (entity.text.length < 2 || onlyPlaceholder.test(entity.text)) continue;
    let start = text.indexOf(entity.text);
    while (start !== -1) {
      hits.push({ type: entity.type, value: entity.text, start, end: start + entity.text.length });
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
