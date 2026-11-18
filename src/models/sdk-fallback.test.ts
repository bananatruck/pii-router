// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
} from 'firebase/ai';
import { FirebaseOnDeviceModel } from './firebase-on-device';

describe('SDK fallback behaviour in ONLY_ON_DEVICE mode when LanguageModel is missing (SPEC 2.2)', () => {
  const originalFetch = globalThis.fetch;
  let testApp: FirebaseApp | null = null;

  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).LanguageModel;
    if (typeof window !== 'undefined') {
      delete (window as unknown as Record<string, unknown>).LanguageModel;
    }
  });

  afterEach(async () => {
    globalThis.fetch = originalFetch;
    if (testApp) {
      await deleteApp(testApp);
      testApp = null;
    }
  });

  it('documents that the real @firebase/ai SDK calls fetch with the prompt in ONLY_ON_DEVICE mode when LanguageModel is absent, while FirebaseOnDeviceModel blocks before fetch', async () => {
    const fetchCalls: Array<{ url: string; body: string }> = [];
    const fetchStub = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = typeof input === 'string' ? input : input.toString();
        const body = typeof init?.body === 'string' ? init.body : '';
        fetchCalls.push({ url, body });
        throw new Error('Network disabled in test');
      },
    );
    globalThis.fetch = fetchStub as unknown as typeof fetch;

    // 1. Direct call to the real Firebase AI SDK with ONLY_ON_DEVICE and no LanguageModel on window/globalThis.
    testApp = initializeApp(
      {
        apiKey: 'fake-api-key-for-sdk-fallback-test',
        projectId: 'fake-project-id',
        appId: '1:000000000000:web:0000000000000000',
      },
      'sdk-fallback-test-app',
    );
    const ai = getAI(testApp, { backend: new GoogleAIBackend() });

    // Confirm we loaded the browser ESM build that has chromeAdapterFactory on the AI service.
    expect(typeof (ai as unknown as { chromeAdapterFactory?: unknown }).chromeAdapterFactory).toBe(
      'function',
    );

    const sdkModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
    });

    const syntheticPrompt = 'SYNTHETIC-TEXT jane.doe@example.com';
    await expect(sdkModel.generateContent(syntheticPrompt)).rejects.toThrow();

    // The SDK called fetch to firebasevertexai.googleapis.com and sent the prompt in the body.
    expect(fetchStub).toHaveBeenCalledTimes(1);
    expect(fetchCalls[0]?.url).toContain('firebasevertexai.googleapis.com');
    expect(fetchCalls[0]?.body).toContain(syntheticPrompt);

    // 2. Now reset the fetch stub and run the exact same prompt through FirebaseOnDeviceModel.generate.
    fetchStub.mockClear();
    fetchCalls.length = 0;

    const guardedModel = new FirebaseOnDeviceModel(ai);
    let caught: (Error & { code?: string }) | undefined;
    try {
      await guardedModel.generate({ prompt: syntheticPrompt });
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.code).toBe('device-unavailable');
    expect(fetchStub).not.toHaveBeenCalled();
    expect(fetchCalls).toHaveLength(0);
  });
});
