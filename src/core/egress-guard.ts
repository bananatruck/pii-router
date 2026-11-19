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

/**
 * Detection runs on the custom instruction and the text separately, so a value whose halves sit at
 * the end of one and the start of the other ("Call 202-" + "555-0100") is found in neither. Scan the
 * two redacted segments joined, and block if any value spans the join (round-4 review). A value
 * entirely inside one segment was already handled, so it does not count here.
 */
export function checkSplitAcrossSegments(
  redactedInstruction: string,
  redactedText: string,
  vault: Vault,
): { ok: true } | { ok: false; reason: string } {
  if (!redactedInstruction) return { ok: true };
  const joined = `${redactedInstruction} ${redactedText}`;
  const boundary = redactedInstruction.length;
  const options = { allowedPlaceholders: new Set(vault.entries.keys()) };
  const spans = [...detectPatterns(joined, options), ...detectPatterns(foldPayloadForScan(joined), options)];
  const split = spans.find(hit => hit.start < boundary && hit.end > boundary + 1);
  return split ? { ok: false, reason: `A ${split.type} value may be split between the instruction and the text.` } : { ok: true };
}

