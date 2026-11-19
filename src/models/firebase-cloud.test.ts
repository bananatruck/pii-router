import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGenerateContent,
  mockGetGenerativeModel,
  mockGetAI,
  mockInitializeApp,
  mockInitializeAppCheck,
} = vi.hoisted(() => {
  const generateContent = vi.fn();
  const getGenerativeModel = vi.fn(() => ({
    generateContent,
  }));
  const getAI = vi.fn(() => ({ app: {}, backend: {} }));
  const initializeApp = vi.fn(() => ({ name: '[DEFAULT]', options: {} }));
  const initializeAppCheck = vi.fn(() => ({ app: {} }));
  return {
    mockGenerateContent: generateContent,
    mockGetGenerativeModel: getGenerativeModel,
    mockGetAI: getAI,
    mockInitializeApp: initializeApp,
    mockInitializeAppCheck: initializeAppCheck,
  };
});

// Pin the configuration, so these tests do not depend on what is pasted into src/firebase-config.ts
// (CodeRabbit review: a filled-in config made the "not configured" test fail).
vi.mock('../firebase-config', () => ({
  firebaseConfig: { apiKey: 'PLACEHOLDER_API_KEY', projectId: 'PLACEHOLDER_PROJECT_ID', appId: 'PLACEHOLDER_APP_ID' },
  recaptchaEnterpriseSiteKey: 'PLACEHOLDER_RECAPTCHA_ENTERPRISE_SITE_KEY',
  cloudModelName: undefined,
  isFirebaseConfigured: () => false,
  isRecaptchaConfigured: () => false,
}));

vi.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: mockInitializeAppCheck,
  ReCaptchaEnterpriseProvider: class {
    siteKey: string;
    constructor(siteKey: string) {
      this.siteKey = siteKey;
    }
  },
}));

vi.mock('firebase/ai', () => ({
  getAI: mockGetAI,
  getGenerativeModel: mockGetGenerativeModel,
  GoogleAIBackend: class {},
  InferenceMode: {
    PREFER_ON_DEVICE: 'prefer_on_device',
    ONLY_ON_DEVICE: 'only_on_device',
    ONLY_IN_CLOUD: 'only_in_cloud',
    PREFER_IN_CLOUD: 'prefer_in_cloud',
  },
  InferenceSource: {
    ON_DEVICE: 'on_device',
    IN_CLOUD: 'in_cloud',
  },
}));

import type { AI } from 'firebase/ai';
import { FirebaseCloudModel } from './firebase-cloud';

describe('FirebaseCloudModel', () => {
  const fakeAI = { app: {}, backend: {} } as unknown as AI;

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockGetGenerativeModel.mockClear();
  });

  it('calls getGenerativeModel with mode only_in_cloud and passes the exact prompt string once', async () => {
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => 'Redacted summary for [PERSON_1].',
        inferenceSource: 'in_cloud',
      },
    });

    const model = new FirebaseCloudModel(fakeAI);
    const exactPrompt = 'Summarize the message from [PERSON_1] at [EMAIL_1].';

    const result = await model.generate({ prompt: exactPrompt });

    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(fakeAI, {
      mode: 'only_in_cloud',
      inCloudParams: undefined,
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
    expect(mockGenerateContent).toHaveBeenCalledWith(exactPrompt);
    expect(result).toEqual({
      text: 'Redacted summary for [PERSON_1].',
      ranOn: 'cloud',
    });
  });

  it('throws a sanitized error that never includes the prompt or the SDK error message', async () => {
    const secretPrompt = 'SENSITIVE-PAYLOAD jane.doe@example.com 555-0199';
    const sdkErrorMessage =
      'AI: Fetch failed for payload SENSITIVE-PAYLOAD jane.doe@example.com (AI/fetch-error)';
    const sdkError = Object.assign(new Error(sdkErrorMessage), {
      code: 'fetch-error',
    });
    mockGenerateContent.mockRejectedValueOnce(sdkError);

    const model = new FirebaseCloudModel(fakeAI);

    let caught: (Error & { code?: string }) | undefined;
    try {
      await model.generate({ prompt: secretPrompt });
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.message).toBe('The cloud model request failed.');
    expect(caught?.message).not.toContain(secretPrompt);
    expect(caught?.message).not.toContain('jane.doe@example.com');
    expect(caught?.message).not.toContain(sdkErrorMessage);
    expect(caught?.code).toBe('fetch-error');
  });

  it('reports unavailable status when Firebase is not configured and no AI instance is injected', async () => {
    const model = new FirebaseCloudModel();
    const status = await model.status();
    expect(status.state).toBe('unavailable');
  });
});
