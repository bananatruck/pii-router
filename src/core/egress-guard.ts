import { detectPatterns } from './patterns';
import type { Vault } from './redact';

export function checkEgress(payload: string, vault: Vault): { ok: true } | { ok: false; reason: string } {
  const hit = detectPatterns(payload)[0];
  if (hit) return { ok: false, reason: `Remaining ${hit.type} pattern.` };
  const lower = payload.toLowerCase();
  const digits = payload.replace(/\D/g, '');
  for (const { type, value } of vault.entries.values()) {
    const valueDigits = value.replace(/\D/g, '');
    if (lower.includes(value.toLowerCase()) || (valueDigits.length >= 7 && digits.includes(valueDigits))) return { ok: false, reason: `Remaining ${type} value.` };
  }
  return { ok: true };
}
