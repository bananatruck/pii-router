// Measures the false-positive cost of detection rules on benign text. Skipped unless MEASURE_FP=1:
//   MEASURE_FP=1 pnpm exec vitest run --project unit src/core/false-positives.measure.test.ts
// Corpus: every README/CHANGELOG/HISTORY Markdown file under node_modules/.pnpm, which is real prose
// full of dates, versions, sizes and counts, and essentially free of personal data. Any hit there is
// treated as a false positive. Results are recorded in docs/SPEC.md section 7.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { it } from 'vitest';
import { LOCAL_PHONE } from './patterns';

function corpusFiles(root: string, limit = 4000): string[] {
  const out: string[] = [];
  const walk = (dir: string, depth: number) => {
    if (out.length >= limit || depth > 6) return;
    const entries = (() => {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    })();
    for (const name of entries) {
      const full = path.join(dir, name);
      const isDir = (() => {
        try {
          return statSync(full).isDirectory();
        } catch {
          return false;
        }
      })();
      if (isDir) walk(full, depth + 1);
      else if (/^(README|CHANGELOG|HISTORY)[^/]*\.md$/i.test(name)) out.push(full);
      if (out.length >= limit) return;
    }
  };
  walk(root, 0);
  return out;
}

it.skipIf(!process.env.MEASURE_FP)('false-positive cost of candidate rules', () => {
  const files = corpusFiles(path.resolve('node_modules/.pnpm'));
  const text = files.map(f => readFileSync(f, 'utf8')).join('\n');
  const megabytes = text.length / 1e6;
  const candidates: Record<string, RegExp> = {
    'local phone (3-4 digits with one separator)': new RegExp(LOCAL_PHONE.source, 'g'),
    'local phone, dash or space only': /(?<![\w.+$€£/:-])\d{3}[- ]\d{4}(?![\w/:]|[-.]\d)/g,
    'any run of 8+ digits': /\d(?:[\s./-]{0,3}\d){7,}/g,
    'any run of 7+ digits': /\d(?:[\s./-]{0,3}\d){6,}/g,
    'any run of 9+ digits (current)': /\d(?:[\s./-]{0,3}\d){8,}/g,
  };
  const rows = Object.entries(candidates).map(([name, regex]) => {
    const hits = [...text.matchAll(regex)].map(m => m[0]);
    return { name, hits: hits.length, perMB: (hits.length / megabytes).toFixed(1), examples: [...new Set(hits)].slice(0, 6) };
  });
  process.stdout.write(`corpus: ${files.length} files, ${megabytes.toFixed(1)} MB\n${JSON.stringify(rows, null, 2)}\n`);
});
