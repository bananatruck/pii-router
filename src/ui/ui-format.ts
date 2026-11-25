import type { Finding, ModelStatus, TraceStep } from '@/core';

export function formatDeviceStatusPill(status: ModelStatus): string {
  switch (status.state) {
    case 'ready':
      return 'Gemini Nano: ready';
    case 'needs-download':
      return 'Gemini Nano: needs download';
    case 'downloading':
      return 'Gemini Nano: downloading';
    case 'unavailable':
      return 'Gemini Nano: unavailable';
  }
}

export function formatStepRanOn(
  ranOn: TraceStep['ranOn'],
): 'device' | 'cloud' | 'simulated device' | 'simulated cloud' {
  switch (ranOn) {
    case 'device':
      return 'device';
    case 'cloud':
      return 'cloud';
    case 'simulated-device':
      return 'simulated device';
    case 'simulated-cloud':
      return 'simulated cloud';
  }
}

export function formatFindingSource(source: Finding['source']): 'Pattern' | 'Gemini Nano' {
  return source === 'pattern' ? 'Pattern' : 'Gemini Nano';
}

export function normalizePlaceholderKey(token: string): string {
  return token.toUpperCase().replace(/[\s_-]/g, '');
}

export interface AggregatedFinding {
  type: Finding['type'];
  source: Finding['source'];
  placeholder: string;
  count: number;
}

export function aggregateFindingsByPlaceholder(findings: readonly Finding[]): AggregatedFinding[] {
  const order: string[] = [];
  const counts = new Map<string, AggregatedFinding>();

  for (const finding of findings) {
    const existing = counts.get(finding.placeholder);
    if (existing) {
      existing.count += 1;
    } else {
      order.push(finding.placeholder);
      counts.set(finding.placeholder, {
        type: finding.type,
        source: finding.source,
        placeholder: finding.placeholder,
        count: 1,
      });
    }
  }

  return order.map(placeholder => counts.get(placeholder)!);
}

export function uniqueFindingCount(findings: readonly Finding[]): number {
  return new Set(findings.map(f => f.placeholder)).size;
}