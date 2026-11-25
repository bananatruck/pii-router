import { initializeApp } from 'firebase/app';
import {
  getAI,
  getGenerativeModel,
  GoogleAIBackend,
  InferenceMode,
  InferenceSource,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';
import type {
  GenerateRequest,
  GenerateResult,
  JsonSchema,
  ModelClient,
  ModelStatus,
} from '../core/types';
import { getFirebase } from './firebase-app';
import { ON_DEVICE_EXPECTED_OPTIONS, probeLanguageModel } from './prompt-api';

const LOCAL_DEVICE_APP_NAME = 'pii-router-local-device';
const LOCAL_DEVICE_CONFIG = {
  apiKey: 'local-only-on-device-api-key',
  projectId: 'local-only-on-device-project',
  appId: '1:000000000000:web:0000000000000000',
};

let cachedLocalAI: AI | null = null;

function getOrCreateLocalAI(): AI {
  const configured = getFirebase();
  if (configured) {
    return configured.ai;
  }
  if (cachedLocalAI) {
    return cachedLocalAI;
  }

  // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
  // "Initialize FirebaseApp: const firebaseApp = initializeApp(firebaseConfig);"
  const localApp = initializeApp(LOCAL_DEVICE_CONFIG, {
    name: LOCAL_DEVICE_APP_NAME,
    automaticDataCollectionEnabled: false,
  });

  // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
  // "Initialize the Gemini Developer API backend service: const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });"
  cachedLocalAI = getAI(localApp, {
    // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
    // "const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });"
    backend: new GoogleAIBackend(),
  });
  return cachedLocalAI;
}

function createDeviceUnavailableError(message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.code = 'device-unavailable';
  return err;
}

/**
 * Gemini Nano on-device model through Firebase AI Logic with InferenceMode.ONLY_ON_DEVICE.
 */
export class FirebaseOnDeviceModel implements ModelClient {
  readonly location = 'device' as const;
  readonly simulated = false;
  readonly label = 'Gemini Nano on this device (Firebase AI Logic, ONLY_ON_DEVICE)';

  private readonly explicitAI?: AI;

  constructor(ai?: AI) {
    this.explicitAI = ai;
  }

  private resolveAI(): AI {
    return this.explicitAI ?? getOrCreateLocalAI();
  }

  // Keep the download adapter alive while Chrome downloads the model in the background.
  private downloadModel: GenerativeModel | null = null;

  private createModel(schema?: JsonSchema, signal?: AbortSignal): GenerativeModel {
    const ai = this.resolveAI();

    // https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
    // "ONLY_ON_DEVICE : Use the on-device model if it's available; otherwise, throw an exception."
    // https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output
    // "For on-device models : Specify the responseConstraint in onDeviceParams using either a schema created with Schema helper methods or a plain JSON schema."
    const model = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_ON_DEVICE,
      onDeviceParams: {
        createOptions: {
          ...(signal ? { signal } : {}),
          expectedInputs: ON_DEVICE_EXPECTED_OPTIONS.expectedInputs,
          expectedOutputs: ON_DEVICE_EXPECTED_OPTIONS.expectedOutputs,
        },
        ...(schema
          ? {
              promptOptions: {
                responseConstraint: schema,
              },
            }
          : {}),
      },
    });

    this.assertOnDeviceAdapter(model);
    return model;
  }

  /**
   * The exact condition the SDK uses: callCloudOrDevice sends the request to the cloud whenever the
   * model has no on-device adapter, before it looks at the mode. The SDK stores the adapter as
   * `chromeAdapter` on the model. Checking it covers every way the adapter can be missing, such as
   * `window.LanguageModel` differing from `globalThis.LanguageModel`, or an AI service without an
   * adapter factory (round-2 review).
   */
  private assertOnDeviceAdapter(model: GenerativeModel): void {
    if (!(model as unknown as { chromeAdapter?: unknown }).chromeAdapter) {
      throw createDeviceUnavailableError(
        'The SDK created the model without an on-device adapter; refusing, because it would send the prompt to the cloud.',
      );
    }
  }

  /** Throws unless the Prompt API is on the page right now. Must run with no await before createModel. */
  private assertPromptApiPresent(): void {
    if (!(globalThis as { LanguageModel?: unknown }).LanguageModel) {
      throw createDeviceUnavailableError(
        'Chrome Prompt API (LanguageModel) is missing; refusing the on-device call to prevent a cloud fallback.',
      );
    }
  }

  async status(): Promise<ModelStatus> {
    return probeLanguageModel();
  }

  async prepare(onProgress?: (fraction: number) => void): Promise<void> {
    const modelStatus = await probeLanguageModel();
    if (modelStatus.state === 'unavailable') {
      throw createDeviceUnavailableError(modelStatus.reason);
    }

    this.assertPromptApiPresent();
    const defaultModel = this.downloadModel ?? this.createModel();
    this.assertOnDeviceAdapter(defaultModel);
    this.downloadModel = defaultModel;

    // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
    // "You must call initializeDeviceModel() after or on an end-user page interaction (like a button click) and before you send a prompt request to the model."
    await defaultModel.initializeDeviceModel(onProgress);
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    // SPEC 2.2 guard: the installed SDK falls back to the cloud in ONLY_ON_DEVICE mode when
    // window.LanguageModel is absent. Check before the availability probe, and again after it with no
    // await between the check, the model's creation and the call, so the page cannot change in between.
    this.assertPromptApiPresent();
    const modelStatus = await probeLanguageModel();
    if (modelStatus.state === 'unavailable') {
      throw createDeviceUnavailableError(modelStatus.reason);
    }
    this.assertPromptApiPresent();
    const controller = new AbortController();
    try {
      const model = this.createModel(request.responseSchema, controller.signal);

      // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
      // "To generate text output, call generateContent with the text input: const result = await model.generateContent(prompt);"
      const result = await model.generateContent(request.prompt);
      const response = result.response;

      // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
      // "const text = response.text();"
      const text = response.text();

      // https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
      // "This information is provided by the inferenceSource property of each response (available starting with JS SDK v12.5.0)."
      const ranOn =
        response.inferenceSource === InferenceSource.ON_DEVICE ? 'device' : 'cloud';

      return {
        text,
        ranOn,
      };
    } finally {
      // Chrome destroys the Prompt API session when its creation signal is aborted.
      controller.abort();
    }
  }
}
