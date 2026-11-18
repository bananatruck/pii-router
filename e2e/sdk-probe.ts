// Runs in a real Chromium page for e2e/sdk-probe.mjs. Playwright intercepts and aborts every
// request to Google hosts, so nothing leaves the machine; it records what the SDK tried to send.
// The prompt is synthetic.
import { initializeApp } from 'firebase/app';
import { getAI, getGenerativeModel, GoogleAIBackend, InferenceMode } from 'firebase/ai';
import { FirebaseOnDeviceModel } from '../src/models/firebase-on-device';

const PROMPT = 'SYNTHETIC-PROBE jane.doe@example.com 202-555-0100';

async function probe(): Promise<Record<string, unknown>> {
  const app = initializeApp(
    { apiKey: 'probe-not-a-real-key', projectId: 'probe-project', appId: '1:000000000000:web:0000000000000000' },
    'sdk-probe',
  );
  const ai = getAI(app, { backend: new GoogleAIBackend() });
  const result: Record<string, unknown> = { languageModelPresent: 'LanguageModel' in globalThis };

  const sdkModel = getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE });
  try {
    await sdkModel.generateContent(PROMPT);
    result.sdk = 'resolved';
  } catch (err) {
    result.sdk = `threw ${(err as { code?: string }).code ?? 'error'}`;
  }
  result.afterSdk = Date.now();

  const guarded = new FirebaseOnDeviceModel(ai);
  try {
    await guarded.generate({ prompt: PROMPT });
    result.guarded = 'resolved';
  } catch (err) {
    result.guarded = `threw ${(err as { code?: string }).code ?? 'error'}`;
  }
  return result;
}

const done = probe();
(window as unknown as { __probe: Promise<Record<string, unknown>> }).__probe = done;
