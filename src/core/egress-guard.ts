import { foldPayloadForScan, foldSegmentsForScan } from './normalize';
import { detectPatterns } from './patterns';
import type { Vault } from './redact';

function vaultValueLeaks(payload: string, value: string): boolean {
  const lower = payload.toLowerCase();
  const valueDigits = value.replace(/\D/g, '');
  const digits = payload.replace(/\D/g, '');
  if (lower.includes(value.toLowerCase())) return true;
  return valueDigits.length >= 7 && digits.includes(valueDigits);
}

/**
 * `payload` is the exact cloud request; it is scanned for patterns in full. Vault values are
 * looked for in `userControlled`, the redacted instruction and text, because the fixed prompt
 * prose can contain a short value as text ("personal details" contains "son"). It defaults to the
 * whole payload.
 */
export function checkEgress(
  payload: string,
  vault: Vault,
  userControlled: string = payload,
): { ok: true } | { ok: false; reason: string } {
  // Only placeholders this run generated are exempt; a lookalike typed by the user is scanned.
  const options = { allowedPlaceholders: new Set(vault.entries.keys()) };
  const hit = detectPatterns(payload, options)[0] ?? detectPatterns(foldPayloadForScan(payload), options)[0];
  if (hit) return { ok: false, reason: `Remaining ${hit.type} pattern.` };
  // Generated placeholders can contain a short value as text ("[PERSON_1]" contains "son"); check
  // the payload with them taken out, so a clean payload is not blocked (CodeRabbit review).
  let withoutPlaceholders = userControlled;
  for (const placeholder of vault.entries.keys()) withoutPlaceholders = withoutPlaceholders.split(placeholder).join(' ');
  for (const { type, value } of vault.entries.values()) {
    if (vaultValueLeaks(withoutPlaceholders, value)) return { ok: false, reason: `Remaining ${type} value.` };
  }
  return { ok: true };
}

/**
 * Detection runs on the custom instruction and the text separately, so a value whose halves sit at
 * the end of one and the start of the other ("Call 202-55" + "5-0100") is found in neither. Scan the
 * two redacted segments joined, and block if any value spans the join (round-4 review). A value
 * entirely inside one segment was already handled, so it does not count here.
 */
export function checkSplitAcrossSegments(
  redactedInstruction: string,
  redactedText: string,
  vault: Vault,
): { ok: true } | { ok: false; reason: string } {
  if (!redactedInstruction) return { ok: true };
  const options = { allowedPlaceholders: new Set(vault.entries.keys()) };
  // A space can complete a separated phone, but break an email. Check both representations.
  for (const separator of [' ', '']) {
    const joined = redactedInstruction + separator + redactedText;
    const scans = [
      { text: joined, boundaryStart: redactedInstruction.length, boundaryEnd: redactedInstruction.length + separator.length },
      foldSegmentsForScan(redactedInstruction, redactedText, separator),
    ];
    for (const { text, boundaryStart, boundaryEnd } of scans) {
      const split = detectPatterns(text, options).find(hit => hit.start < boundaryStart && hit.end > boundaryEnd);
      if (split) return { ok: false, reason: `A ${split.type} value may be split between the instruction and the text.` };
    }
  }
  return { ok: true };
}
