import type { ReactNode } from 'react';
import { PLACEHOLDER_SOURCE, type Finding, type RunOutcome } from '@/core';
import DecryptedText from '@/components/vendor/decrypted-text';
import { cn } from '@/lib/utils';
import { normalizePlaceholderKey } from '../ui-format';

export function renderMarkedInputText(
  text: string,
  findings: readonly Finding[],
  activePlaceholder: string | null,
  onHoverPlaceholder: (placeholder: string | null) => void,
): ReactNode {
  const textFindings = findings
    .filter(f => f.segment === 'text' && f.start >= 0 && f.end > f.start && f.end <= text.length)
    .slice()
    .sort((a, b) => a.start - b.start);

  if (textFindings.length === 0) {
    return <span>{text}</span>;
  }

  const elements: ReactNode[] = [];
  let cursor = 0;

  textFindings.forEach((finding, idx) => {
    if (finding.start < cursor) {
      return;
    }
    if (finding.start > cursor) {
      elements.push(<span key={`plain-${idx}`}>{text.slice(cursor, finding.start)}</span>);
    }
    const slice = text.slice(finding.start, finding.end);
    const isActive =
      activePlaceholder !== null &&
      normalizePlaceholderKey(activePlaceholder) === normalizePlaceholderKey(finding.placeholder);

    elements.push(
      <mark
        key={`mark-${idx}-${finding.start}`}
        tabIndex={0}
        onMouseEnter={() => onHoverPlaceholder(finding.placeholder)}
        onMouseLeave={() => onHoverPlaceholder(null)}
        onFocus={() => onHoverPlaceholder(finding.placeholder)}
        onBlur={() => onHoverPlaceholder(null)}
        className={cn(
          'group relative inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink underline decoration-ink/40 decoration-1 underline-offset-2 transition-colors',
          isActive && 'ring-2 ring-boundary-blue',
        )}
      >
        <span>{slice}</span>
        <span
          role="tooltip"
          className={cn(
            'pointer-events-none absolute -top-6 left-0 z-20 whitespace-nowrap border border-ink bg-ink px-1.5 py-0.5 font-mono text-[11px] font-medium text-fog opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
            isActive && 'opacity-100',
          )}
        >
          {finding.placeholder}
        </span>
      </mark>,
    );
    cursor = finding.end;
  });

  if (cursor < text.length) {
    elements.push(<span key="plain-tail">{text.slice(cursor)}</span>);
  }

  return elements;
}

export function renderRestoredAnswer(
  outcome: Extract<RunOutcome, { kind: 'answered' }>,
  vaultEntries: ReadonlyArray<{ placeholder: string; value: string; type: Finding['type'] }>,
): ReactNode {
  const cloudReply = outcome.trace.cloudReply;
  if (cloudReply !== null && vaultEntries.length > 0) {
    const lookup = new Map(
      vaultEntries.map(entry => [normalizePlaceholderKey(entry.placeholder), entry]),
    );
    const regex = new RegExp(PLACEHOLDER_SOURCE, 'gi');
    const nodes: ReactNode[] = [];
    let cursor = 0;
    let idx = 0;

    for (const match of cloudReply.matchAll(regex)) {
      const start = match.index ?? 0;
      const token = match[0];
      if (start > cursor) {
        nodes.push(<span key={`ans-txt-${idx}`}>{cloudReply.slice(cursor, start)}</span>);
      }
      const entry = lookup.get(normalizePlaceholderKey(token));
      if (entry) {
        nodes.push(
          <mark
            key={`ans-restored-${idx}`}
            className="inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink"
          >
            <DecryptedText
              text={entry.value}
              characters={entry.placeholder}
              animateOn="view"
              sequential
              speed={32}
              maxIterations={8}
            />
          </mark>,
        );
      } else {
        nodes.push(<span key={`ans-unres-${idx}`}>{token}</span>);
      }
      cursor = start + token.length;
      idx += 1;
    }

    if (cursor < cloudReply.length) {
      nodes.push(<span key="ans-tail">{cloudReply.slice(cursor)}</span>);
    }
    return nodes;
  }

  const answer = outcome.answer;
  if (vaultEntries.length === 0) {
    return <span>{answer}</span>;
  }

  const hits: Array<{ start: number; end: number; value: string; placeholder: string }> = [];
  for (const entry of vaultEntries) {
    if (!entry.value) continue;
    let from = answer.indexOf(entry.value);
    while (from !== -1) {
      hits.push({
        start: from,
        end: from + entry.value.length,
        value: entry.value,
        placeholder: entry.placeholder,
      });
      from = answer.indexOf(entry.value, from + entry.value.length);
    }
  }
  hits.sort((a, b) => a.start - b.start || b.end - a.end);

  const nonOverlapping: typeof hits = [];
  for (const hit of hits) {
    const last = nonOverlapping[nonOverlapping.length - 1];
    if (!last || hit.start >= last.end) {
      nonOverlapping.push(hit);
    }
  }

  if (nonOverlapping.length === 0) {
    return <span>{answer}</span>;
  }

  const nodes: ReactNode[] = [];
  let cursor = 0;
  nonOverlapping.forEach((hit, i) => {
    if (hit.start > cursor) {
      nodes.push(<span key={`dev-txt-${i}`}>{answer.slice(cursor, hit.start)}</span>);
    }
    nodes.push(
      <mark
        key={`dev-mark-${i}`}
        className="inline rounded-none bg-marker-amber px-1 py-0.5 font-mono text-ink"
      >
        <DecryptedText
          text={hit.value}
          characters={hit.placeholder}
          animateOn="view"
          sequential
          speed={32}
          maxIterations={8}
        />
      </mark>,
    );
    cursor = hit.end;
  });
  if (cursor < answer.length) {
    nodes.push(<span key="dev-tail">{answer.slice(cursor)}</span>);
  }
  return nodes;
}