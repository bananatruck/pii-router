export type NormalizeResult = { text: string; changeCount: number };

export function normalizeInput(text: string): string {
  return normalizeInputDetail(text).text;
}

export function normalizeInputDetail(text: string): NormalizeResult {
  // Remove format characters and map spaces first, then apply NFKC, so characters that a removed
  // format character kept apart are composed now rather than on a second pass (CodeRabbit review).
  let changeCount = 0;
  let result = '';
  for (const char of text) {
    if (/\p{Cf}/u.test(char)) {
      changeCount += 1;
      continue;
    }
    if (/\p{Zs}/u.test(char)) {
      if (char !== ' ') changeCount += 1;
      result += ' ';
      continue;
    }
    result += char;
  }
  const nfkc = result.normalize('NFKC');
  if (nfkc !== result) changeCount += 1;
  return { text: nfkc, changeCount };
}

/** Collapse whitespace and newlines between digit runs and common phone/card separators for egress scanning. */
export function foldPayloadForScan(text: string): string {
  const normalized = normalizeInput(text);
  return normalized.replace(/(?<=[\d.\-\s])[\s\n]+(?=[\d.\-\s])/g, '');
}