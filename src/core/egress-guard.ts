import { foldPayloadForScan } from './normalize';
import { detectPatterns } from './patterns';
import type { Vault } from './redact';

function vaultValueLeaks(payload: string, value: string): boolean {
  const lower = payload.toLowerCase();
  const valueDigits = value.replace(/\D/g, '');
  const digits = payload.replace(/\D/g, '');
  if (lower.includes(value.toLowerCase())) return true;
  return valueDigits.length >= 7 && digits.includes(valueDigits);
}

export function checkEgress(payload: string, vault: Vault): { ok: true } | { ok: false; reason: string } {
  const hit = detectPatterns(payload)[0] ?? detectPatterns(foldPayloadForScan(payload))[0];
  if (hit) return { ok: false, reason: `Remaining ${hit.type} pattern.` };
  for (const { type, value } of vault.entries.values()) {
    if (vaultValueLeaks(payload, value)) return { ok: false, reason: `Remaining ${type} value.` };
  }
  return { ok: true };
}
