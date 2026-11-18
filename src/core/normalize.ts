export type NormalizeResult = { text: string; changeCount: number };

export function normalizeInput(text: string): string {
  return normalizeInputDetail(text).text;
}

export function normalizeInputDetail(text: string): NormalizeResult {
  const nfkc = text.normalize('NFKC');
  let changeCount = 0;
  if (nfkc !== text) changeCount += 1;
  let result = '';
  for (const char of nfkc) {
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
  return { text: result, changeCount };
}

/** Collapse whitespace and newlines between digit runs and common phone/card separators for egress scanning. */
export function foldPayloadForScan(text: string): string {
  const normalized = normalizeInput(text);
  return normalized.replace(/(?<=[\d.\-\s])[\s\n]+(?=[\d.\-\s])/g, '');
}