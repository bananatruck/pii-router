import type { RoutePreference, TaskId, TraceStep } from '@/core';

export const TASK_IDS: readonly TaskId[] = ['summarize', 'rewrite', 'reply', 'custom'];

export const ROUTE_OPTIONS: ReadonlyArray<{ value: RoutePreference; label: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'device', label: 'Keep on this device' },
  { value: 'cloud', label: 'Use the cloud (redacted)' },
];

export const STEP_LABELS: Record<TraceStep['id'], string> = {
  patterns: 'Patterns',
  'device-detector': 'Gemini Nano',
  redact: 'Redact',
  route: 'Route',
  'egress-guard': 'Egress guard',
  'cloud-call': 'Cloud',
  'device-answer': 'Device answer',
  restore: 'Restore',
};

export const SIMULATED_DETECTOR_HINT =
  'Names come from the simulated detector; patterns are real';