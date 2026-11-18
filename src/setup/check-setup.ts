/**
 * Offline checks behind `pnpm verify:setup`. Pure functions, no imports, no network: the CLI in
 * scripts/verify-setup.mjs reads the files and prints the results.
 *
 * Nothing here returns a key value. The Firebase web API key and the reCAPTCHA site key are
 * described only by length and whether they look right.
 */

export type Level = 'pass' | 'warn' | 'fail' | 'info';

export interface CheckResult {
  level: Level;
  item: string;
  message: string;
}

export const CONFIG_FIELDS = [
  'apiKey',
  'authDomain',
  'projectId',
  'storageBucket',
  'messagingSenderId',
  'appId',
] as const;

export type ConfigField = (typeof CONFIG_FIELDS)[number];

export interface ParsedConfig {
  fields: Partial<Record<ConfigField, string>>;
  recaptchaSiteKey: string | undefined;
}

/** Reads the string literals out of src/firebase-config.ts without executing it. */
export function parseFirebaseConfig(source: string): ParsedConfig {
  const objectStart = source.indexOf('firebaseConfig');
  const objectEnd = objectStart === -1 ? -1 : source.indexOf('};', objectStart);
  const body = objectStart === -1 || objectEnd === -1 ? '' : source.slice(objectStart, objectEnd);
  const fields: Partial<Record<ConfigField, string>> = {};
  for (const field of CONFIG_FIELDS) {
    const match = new RegExp(`\\b${field}\\s*:\\s*(['"\`])([^'"\`]*)\\1`).exec(body);
    if (match?.[2] !== undefined) fields[field] = match[2];
  }
  const recaptcha = /\brecaptchaEnterpriseSiteKey\s*=\s*(['"`])([^'"`]*)\1/.exec(source);
  return { fields, recaptchaSiteKey: recaptcha?.[2] };
}

function isPlaceholder(value: string | undefined): boolean {
  return value === undefined || value.length === 0 || value.includes('PLACEHOLDER');
}

/** Describes a secret-looking value without revealing it. */
function describeKey(value: string): string {
  return `set (${value.length} characters)`;
}

export function checkConfig(config: ParsedConfig): CheckResult[] {
  const results: CheckResult[] = [];
  const f = config.fields;
  const missing = CONFIG_FIELDS.filter(field => isPlaceholder(f[field]));
  if (missing.length > 0) {
    results.push({
      level: 'fail',
      item: 'firebaseConfig',
      message: `still a placeholder or missing: ${missing.join(', ')}. Paste the web config from Project settings > General > Your apps.`,
    });
    return results;
  }
  const apiKey = f.apiKey ?? '';
  const projectId = f.projectId ?? '';
  const senderId = f.messagingSenderId ?? '';
  const appId = f.appId ?? '';

  results.push(
    /^AIza[0-9A-Za-z_-]{35}$/.test(apiKey)
      ? { level: 'pass', item: 'apiKey', message: describeKey(apiKey) }
      : { level: 'warn', item: 'apiKey', message: `${describeKey(apiKey)}, but Firebase web keys are usually 39 characters starting with "AIza"; check the paste.` },
  );
  results.push(
    /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId)
      ? { level: 'pass', item: 'projectId', message: projectId }
      : { level: 'warn', item: 'projectId', message: `"${projectId}" does not look like a Firebase project ID (6 to 30 lowercase letters, digits, hyphens).` },
  );
  results.push(
    f.authDomain === `${projectId}.firebaseapp.com`
      ? { level: 'pass', item: 'authDomain', message: f.authDomain }
      : { level: 'warn', item: 'authDomain', message: `expected ${projectId}.firebaseapp.com, found "${f.authDomain}".` },
  );
  const bucketOk = [`${projectId}.firebasestorage.app`, `${projectId}.appspot.com`].includes(f.storageBucket ?? '');
  results.push(
    bucketOk
      ? { level: 'pass', item: 'storageBucket', message: f.storageBucket ?? '' }
      : { level: 'warn', item: 'storageBucket', message: `expected ${projectId}.firebasestorage.app, found "${f.storageBucket}". The app does not use Storage, so this only hints at a mixed-up paste.` },
  );
  const appIdMatch = /^1:(\d+):web:[0-9a-f]+$/.exec(appId);
  if (!/^\d+$/.test(senderId)) {
    results.push({ level: 'warn', item: 'messagingSenderId', message: 'should be digits only.' });
  } else {
    results.push({ level: 'pass', item: 'messagingSenderId', message: senderId });
  }
  if (!appIdMatch) {
    results.push({ level: 'fail', item: 'appId', message: 'should look like 1:<project number>:web:<hex>; this one is a web app ID only if it contains ":web:".' });
  } else if (appIdMatch[1] !== senderId) {
    results.push({ level: 'warn', item: 'appId', message: 'the project number inside appId differs from messagingSenderId; both should come from the same project.' });
  } else {
    results.push({ level: 'pass', item: 'appId', message: 'web app ID, same project number as messagingSenderId' });
  }

  results.push(
    isPlaceholder(config.recaptchaSiteKey)
      ? { level: 'info', item: 'recaptchaEnterpriseSiteKey', message: 'placeholder: fine for localhost with the App Check debug token; the hosted site stays in simulated mode.' }
      : { level: 'info', item: 'recaptchaEnterpriseSiteKey', message: `${describeKey(config.recaptchaSiteKey ?? '')}: the hosted build can run live once the key allows the site's domain.` },
  );
  return results;
}

/** The debug token must never be committed (https://firebase.google.com/docs/app-check/web/debug-provider). */
export function checkNoDebugToken(files: ReadonlyArray<{ path: string; text: string }>): CheckResult[] {
  const offenders = files.filter(({ text }) => /FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*['"`][^'"`]+['"`]/.test(text));
  return offenders.length === 0
    ? [{ level: 'pass', item: 'App Check debug token', message: 'not written into any tracked file' }]
    : [{ level: 'fail', item: 'App Check debug token', message: `a token string is assigned in: ${offenders.map(o => o.path).join(', ')}. Remove it; register the token in the console only.` }];
}

export interface VerifyMarker {
  line: number;
  text: string;
  settledBy: string;
}

/** Which step of submission/SETUP_FOR_KESH.md settles a marked sentence. */
function settlingStep(sentence: string): string {
  const s = sentence.toLowerCase();
  if (s.includes('network tab') || s.includes('generatecontent') || s.includes('ran on gemini nano')) {
    return 'SETUP step 6, checks 2 to 5 (real rewrite and summary, read the Network tab)';
  }
  if (s.includes('status when this was drafted') || s.includes('have not yet run')) {
    return 'SETUP step 6 as a whole: replace with one sentence on what the real run showed';
  }
  return 'SETUP step 6';
}

/** Finds every `[VERIFY AFTER REAL RUN]` marker in a document, skipping the line that explains the marker. */
export function findVerifyMarkers(text: string): VerifyMarker[] {
  const markers: VerifyMarker[] = [];
  text.split('\n').forEach((line, index) => {
    if (!line.includes('[VERIFY AFTER REAL RUN]')) return;
    if (line.trimStart().startsWith('- `[VERIFY AFTER REAL RUN]`')) return;
    const sentence = line.replace('[VERIFY AFTER REAL RUN]', '').trim();
    markers.push({ line: index + 1, text: sentence, settledBy: settlingStep(sentence) });
  });
  return markers;
}
