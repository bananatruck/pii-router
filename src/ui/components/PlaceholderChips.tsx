import type { ReactNode } from 'react';
import { PLACEHOLDER_SOURCE } from '@/core';
import { cn } from '@/lib/utils';
import { normalizePlaceholderKey } from '../ui-format';

export function renderWithPlaceholderChips(
  rawText: string,
  activePlaceholder: string | null,
  onHoverPlaceholder: (placeholder: string | null) => void,
): ReactNode[] {
  const regex = new RegExp(PLACEHOLDER_SOURCE, 'gi');
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let idx = 0;

  for (const match of rawText.matchAll(regex)) {
    const start = match.index ?? 0;
    const matched = match[0];
    if (start > cursor) {
      nodes.push(<span key={`txt-${idx}`}>{rawText.slice(cursor, start)}</span>);
    }
    const normalized = normalizePlaceholderKey(matched);
    const isActive =
      activePlaceholder !== null && normalizePlaceholderKey(activePlaceholder) === normalized;
    nodes.push(
      <span
        key={`chip-${idx}`}
        tabIndex={0}
        onMouseEnter={() => onHoverPlaceholder(matched)}
        onMouseLeave={() => onHoverPlaceholder(null)}
        onFocus={() => onHoverPlaceholder(matched)}
        onBlur={() => onHoverPlaceholder(null)}
        className={cn(
          'inline-block rounded-none border border-boundary-blue bg-fog px-1 py-0.5 font-mono text-xs font-medium text-boundary-blue transition-colors',
          isActive && 'bg-boundary-blue text-fog',
        )}
      >
        {matched}
      </span>,
    );
    cursor = start + matched.length;
    idx += 1;
  }

  if (cursor < rawText.length) {
    nodes.push(<span key="txt-tail">{rawText.slice(cursor)}</span>);
  }
  return nodes;
}