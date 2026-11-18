import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockGenerateContent,
  mockInitializeDeviceModel,
  mockGetGenerativeModel,
  mockGetAI,
  mockInitializeApp,
} = vi.hoisted(() => {
  const generateContent = vi.fn();
  const initializeDeviceModel = vi.fn();
  const getGenerativeModel = vi.fn(() => ({
    generateContent,
    initializeDeviceModel,
  }));
  const getAI = vi.fn(() => ({ app: {}, backend: {} }));
  const initializeApp = vi.fn(() => ({ name: 'pii-router-local-device', options: {} }));
  return {
    mockGenerateContent: generateContent,
    mockInitializeDeviceModel: initializeDeviceModel,
    mockGetGenerativeModel: getGenerativeModel,
    mockGetAI: getAI,
    mockInitializeApp: initializeApp,
  };
});

vi.mock('firebase/app', () => ({
  initializeApp: mockInitializeApp,
}));

vi.mock('firebase/app-check', () => ({
  initializeAppCheck: vi.fn(),
  ReCaptchaEnterpriseProvider: class {},
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
import { FirebaseOnDeviceModel } from './firebase-on-device';

describe('FirebaseOnDeviceModel', () => {
  const fakeAI = { app: {}, backend: {} } as unknown as AI;
  const mockAvailability = vi.fn();

  beforeEach(() => {
    mockGenerateContent.mockReset();
    mockInitializeDeviceModel.mockReset();
    mockGetGenerativeModel.mockClear();
    mockAvailability.mockReset();
    (globalThis as Record<string, unknown>).LanguageModel = {
      availability: mockAvailability,
    };
  });

  afterEach(() => {
    delete (globalThis as Record<string, unknown>).LanguageModel;
  });

  it('passes mode only_on_device and responseConstraint to getGenerativeModel and maps on_device source', async () => {
    mockAvailability.mockResolvedValue('available');
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '{"entities":[]}',
        inferenceSource: 'on_device',
      },
    });

    const schema = {
      type: 'object',
      properties: {
        entities: { type: 'array' },
      },
    };

    const model = new FirebaseOnDeviceModel(fakeAI);
    const result = await model.generate({
      prompt: 'Find entities in: Jane Doe lives at 100 Main St.',
      responseSchema: schema,
    });

    expect(mockAvailability).toHaveBeenCalledWith({
      expectedInputs: [{ type: 'text', languages: ['en'] }],
      expectedOutputs: [{ type: 'text', languages: ['en'] }],
    });
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(1);
    expect(mockGetGenerativeModel).toHaveBeenCalledWith(fakeAI, {
      mode: 'only_on_device',
      onDeviceParams: {
        createOptions: {
          expectedInputs: [{ type: 'text', languages: ['en'] }],
          expectedOutputs: [{ type: 'text', languages: ['en'] }],
        },
        promptOptions: {
          responseConstraint: schema,
        },
      },
    });
    expect(result).toEqual({
      text: '{"entities":[]}',
      ranOn: 'device',
    });
  });

  it('reports ranOn: cloud when response.inferenceSource is in_cloud', async () => {
    mockAvailability.mockResolvedValue('available');
    mockGenerateContent.mockResolvedValueOnce({
      response: {
        text: () => '{"entities":[]}',
        inferenceSource: 'in_cloud',
      },
    });

    const model = new FirebaseOnDeviceModel(fakeAI);
    const result = await model.generate({
      prompt: 'Synthetic text',
    });

    expect(result.ranOn).toBe('cloud');
  });

  it('throws code device-unavailable and never calls generateContent when LanguageModel is missing from globalThis', async () => {
    delete (globalThis as Record<string, unknown>).LanguageModel;

    const model = new FirebaseOnDeviceModel(fakeAI);

    let caught: (Error & { code?: string }) | undefined;
    try {
      await model.generate({
        prompt: 'SYNTHETIC-TEXT jane.doe@example.com',
      });
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.code).toBe('device-unavailable');
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(mockGetGenerativeModel).not.toHaveBeenCalled();
  });

  it('throws code device-unavailable and never calls generateContent when LanguageModel.availability() returns unavailable', async () => {
    mockAvailability.mockResolvedValue('unavailable');

    const model = new FirebaseOnDeviceModel(fakeAI);

    let caught: (Error & { code?: string }) | undefined;
    try {
      await model.generate({
        prompt: 'SYNTHETIC-TEXT jane.doe@example.com',
      });
    } catch (err) {
      caught = err as Error & { code?: string };
    }

    expect(caught).toBeInstanceOf(Error);
    expect(caught?.code).toBe('device-unavailable');
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('refuses when LanguageModel disappears while availability is being checked (review finding 3)', async () => {
    mockAvailability.mockImplementation(async () => {
      delete (globalThis as Record<string, unknown>).LanguageModel;
      return 'available';
    });
    const model = new FirebaseOnDeviceModel(fakeAI);
    await expect(model.generate({ prompt: 'SYNTHETIC-TEXT jane.doe@example.com' })).rejects.toMatchObject({
      code: 'device-unavailable',
    });
    expect(mockGetGenerativeModel).not.toHaveBeenCalled();
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it('creates a fresh model for every call so a model built without the Prompt API is never reused', async () => {
    mockAvailability.mockResolvedValue('available');
    mockGenerateContent.mockResolvedValue({
      response: { text: () => '{"entities":[]}', inferenceSource: 'on_device' },
    });
    const model = new FirebaseOnDeviceModel(fakeAI);
    await model.generate({ prompt: 'one' });
    await model.generate({ prompt: 'two' });
    expect(mockGetGenerativeModel).toHaveBeenCalledTimes(2);
  });
});
