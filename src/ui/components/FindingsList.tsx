import type { Finding } from '@/core';
import { aggregateFindingsByPlaceholder, formatFindingSource } from '../ui-format';
import { SimulatedTag } from './SimulatedTag';

export interface FindingsListProps {
  findings: readonly Finding[];
  onHoverPlaceholder: (placeholder: string | null) => void;
  showSimulatedTag?: boolean;
}

export function FindingsList({
  findings,
  onHoverPlaceholder,
  showSimulatedTag,
}: FindingsListProps) {
  const rows = aggregateFindingsByPlaceholder(findings);

  return (
    <div className="mt-4 border-t border-ink/30 pt-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-ink">Findings</h3>
        {showSimulatedTag && <SimulatedTag />}
      </div>
      {rows.length > 0 ? (
        <ul data-testid="findings-list" className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {rows.map(row => (
            <li
              key={row.placeholder}
              onMouseEnter={() => onHoverPlaceholder(row.placeholder)}
              onMouseLeave={() => onHoverPlaceholder(null)}
              className="flex items-center justify-between gap-2 border border-ink/40 bg-fog px-2.5 py-1 text-xs"
            >
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-ink">{row.type}</span>
                <span className="border border-ink/40 bg-device-sage px-1.5 py-0.2 text-[11px] font-medium text-ink">
                  {formatFindingSource(row.source)}
                </span>
              </div>
              <span className="font-mono font-medium text-boundary-blue">
                {row.placeholder}
                {row.count > 1 ? ` x${row.count}` : ''}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-xs text-ink/70">No findings detected.</p>
      )}
    </div>
  );
}