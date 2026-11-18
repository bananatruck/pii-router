import { describe, expect, it } from 'vitest';
import { checkConfig, checkNoDebugToken, findVerifyMarkers, parseFirebaseConfig } from './check-setup';

// A made-up config in the right shape. These are not real credentials.
const FAKE_KEY = `AIza${'x'.repeat(35)}`;
const filled = `
export const firebaseConfig = {
  apiKey: '${FAKE_KEY}',
  authDomain: 'demo-pii-router.firebaseapp.com',
  projectId: 'demo-pii-router',
  storageBucket: 'demo-pii-router.firebasestorage.app',
  messagingSenderId: '123456789012',
  appId: '1:123456789012:web:abcdef0123456789',
};
export const recaptchaEnterpriseSiteKey = 'PLACEHOLDER_RECAPTCHA_ENTERPRISE_SITE_KEY';
`;

describe('verify:setup checks', () => {
  it('fails on the shipped placeholder config and names the missing fields', () => {
    const results = checkConfig(parseFirebaseConfig(`
export const firebaseConfig = {
  apiKey: 'PLACEHOLDER_API_KEY',
  authDomain: 'PLACEHOLDER_PROJECT_ID.firebaseapp.com',
  projectId: 'PLACEHOLDER_PROJECT_ID',
  storageBucket: 'PLACEHOLDER_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PLACEHOLDER_SENDER_ID',
  appId: 'PLACEHOLDER_APP_ID',
};`));
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ level: 'fail', item: 'firebaseConfig' });
    expect(results[0]?.message).toContain('apiKey');
  });

  it('passes a well-formed config and never prints the API key', () => {
    const results = checkConfig(parseFirebaseConfig(filled));
    expect(results.filter(r => r.level === 'fail' || r.level === 'warn')).toEqual([]);
    expect(JSON.stringify(results)).not.toContain(FAKE_KEY);
    expect(results.find(r => r.item === 'apiKey')?.message).toBe('set (39 characters)');
  });

  it('warns when the pasted values come from different projects', () => {
    const mixed = filled
      .replace("authDomain: 'demo-pii-router.firebaseapp.com'", "authDomain: 'other-project.firebaseapp.com'")
      .replace("appId: '1:123456789012:web:", "appId: '1:999999999999:web:");
    const warned = checkConfig(parseFirebaseConfig(mixed)).filter(r => r.level === 'warn').map(r => r.item);
    expect(warned).toEqual(['authDomain', 'appId']);
  });

  it('fails when a debug token string is assigned in a tracked file', () => {
    const files = [
      { path: 'src/models/firebase-app.ts', text: 'self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;' },
      { path: 'src/leak.ts', text: "self.FIREBASE_APPCHECK_DEBUG_TOKEN = '00000000-0000-4000-8000-000000000000';" },
    ];
    expect(checkNoDebugToken(files)).toEqual([expect.objectContaining({ level: 'fail', message: expect.stringContaining('src/leak.ts') })]);
    expect(checkNoDebugToken(files.slice(0, 1))[0]?.level).toBe('pass');
  });

  it('lists each marker with its line and the setup step that settles it, skipping the legend', () => {
    const doc = [
      '- `[VERIFY AFTER REAL RUN]`: explains the marker.',
      'Intro.',
      '[VERIFY AFTER REAL RUN] Status when this was drafted: these calls have not yet run.',
      '[VERIFY AFTER REAL RUN] In my real run, the request in the Network tab contained only placeholders.',
    ].join('\n');
    expect(findVerifyMarkers(doc)).toEqual([
      expect.objectContaining({ line: 3, settledBy: expect.stringContaining('step 6 as a whole') }),
      expect.objectContaining({ line: 4, settledBy: expect.stringContaining('Network tab') }),
    ]);
  });
});
