// Runs in a real Chromium page for e2e/sdk-probe.mjs. Playwright intercepts and aborts every
// request to Google hosts, so nothing leaves the machine; it records what the SDK tried to send.
// The prompt is synthetic.
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { FirebaseOnDeviceModel } from '../src/models/firebase-on-device';

const PROMPT = 'SYNTHETIC-PROBE jane.doe@example.com 202-555-0100';

function setUp() {
  const app = initializeApp(
    { apiKey: 'probe-not-a-real-key', projectId: 'probe-project', appId: '1:000000000000:web:0000000000000000' },
    'sdk-probe',
  );
  return getAI(app, { backend: new GoogleAIBackend() });
}

const ai = setUp();

async function outcome(call: () => Promise<unknown>): Promise<string> {
  try {
    await call();
    return 'resolved';
  } catch (err) {
    return `threw ${(err as { code?: string }).code ?? 'error'}`;
  }
}

// Two separate entry points, so the driver can switch its request phase between them instead of
// relying on timestamps (CodeRabbit review).
const probe = {
  languageModelPresent: () => 'LanguageModel' in globalThis,
  runSdk: () => outcome(() => getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE }).generateContent(PROMPT)),
  runGuarded: () => outcome(() => new FirebaseOnDeviceModel(ai).generate({ prompt: PROMPT })),
};
(window as unknown as { __probe: typeof probe }).__probe = probe;
