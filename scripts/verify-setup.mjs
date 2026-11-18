// `pnpm verify:setup`: offline check of the pasted Firebase config and the repository, then the list
// of `[VERIFY AFTER REAL RUN]` markers the real run settles. Makes no network requests and never
// prints a key value. Exit code 1 if anything fails.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statfsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkConfig, checkNoDebugToken, findVerifyMarkers, parseFirebaseConfig } from '../src/setup/check-setup.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const MARK = { pass: 'PASS', warn: 'WARN', fail: 'FAIL', info: 'INFO' };
const NANO_FREE_BYTES = 22 * 1024 ** 3; // https://developer.chrome.com/docs/ai/prompt-api (hardware requirements)

function print(results) {
  for (const r of results) process.stdout.write(`  ${MARK[r.level]}  ${r.item}: ${r.message}\n`);
}

function trackedTextFiles() {
  const out = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' });
  return out
    .split('\n')
    .filter((p) => /\.(ts|tsx|js|mjs|cjs|json|html|md|ya?ml)$/.test(p) && p !== 'pnpm-lock.yaml')
    .map((p) => ({ path: p, text: read(p) }));
}

function chromeProfileDisk() {
  const candidates = [
    path.join(homedir(), '.var/app/com.google.Chrome/config/google-chrome'), // Flatpak Chrome
    path.join(homedir(), '.config/google-chrome'),
    path.join(homedir(), 'Library/Application Support/Google/Chrome'),
  ];
  const profile = candidates.find((p) => existsSync(p)) ?? homedir();
  const stats = statfsSync(profile);
  const free = stats.bavail * stats.bsize;
  const gb = (free / 1024 ** 3).toFixed(1);
  return free >= NANO_FREE_BYTES
    ? [{ level: 'pass', item: 'Disk for Gemini Nano', message: `${gb} GB free on the volume with ${profile}` }]
    : [{ level: 'fail', item: 'Disk for Gemini Nano', message: `${gb} GB free on the volume with ${profile}; Chrome needs at least 22 GB free before it downloads Gemini Nano. Free about ${Math.ceil(22 - Number(gb))} GB first.` }];
}

const sections = [
  ['Firebase config (src/firebase-config.ts)', checkConfig(parseFirebaseConfig(read('src/firebase-config.ts')))],
  ['Repository', checkNoDebugToken(trackedTextFiles())],
  ['This machine', chromeProfileDisk()],
];

let failed = false;
for (const [title, results] of sections) {
  process.stdout.write(`\n${title}\n`);
  print(results);
  failed ||= results.some((r) => r.level === 'fail');
}

const markers = findVerifyMarkers(read('submission/DEVPOST.md'));
process.stdout.write(`\nWhat the real run settles: ${markers.length} [VERIFY AFTER REAL RUN] marker(s) in submission/DEVPOST.md\n`);
for (const m of markers) {
  process.stdout.write(`  line ${m.line}: ${m.text.slice(0, 110)}${m.text.length > 110 ? '...' : ''}\n    settled by: ${m.settledBy}\n`);
}

process.stdout.write(`
Next (submission/SETUP_FOR_KESH.md step 6): pnpm dev, open http://localhost:5173 in Chrome, then
  1. pills read "Gemini Nano: ready", "Firebase: connected", "Live"
  2. Support email + "Rewrite to sound professional" + Auto + Run: payload shows placeholders only
  3. DevTools > Network > firebasevertexai > generateContent body: placeholders only
  4. "Summarize the text" + Run: no firebasevertexai request at all
  5. flag Disabled, restart, Run the rewrite: Blocked, no generateContent request
`);
process.stdout.write(failed ? '\nResult: FAIL (fix the lines marked FAIL above)\n' : '\nResult: ready for the real run\n');
process.exit(failed ? 1 : 0);
