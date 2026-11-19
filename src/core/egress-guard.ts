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
  // Only placeholders this run generated are exempt; a lookalike typed by the user is scanned.
  const options = { allowedPlaceholders: new Set(vault.entries.keys()) };
  const hit = detectPatterns(payload, options)[0] ?? detectPatterns(foldPayloadForScan(payload), options)[0];
  if (hit) return { ok: false, reason: `Remaining ${hit.type} pattern.` };
  // Generated placeholders can contain a short value as text ("[PERSON_1]" contains "son"); check
  // the payload with them taken out, so a clean payload is not blocked (CodeRabbit review).
  let withoutPlaceholders = payload;
  for (const placeholder of vault.entries.keys()) withoutPlaceholders = withoutPlaceholders.split(placeholder).join(' ');
  for (const { type, value } of vault.entries.values()) {
    if (vaultValueLeaks(withoutPlaceholders, value)) return { ok: false, reason: `Remaining ${type} value.` };
  }
  return { ok: true };
}
