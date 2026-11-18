import {
  getGenerativeModel,
  InferenceMode,
  InferenceSource,
  type AI,
  type GenerativeModel,
} from 'firebase/ai';
import { cloudModelName } from '../firebase-config';
import type {
  GenerateRequest,
  GenerateResult,
  ModelClient,
  ModelStatus,
} from '../core/types';
import { firebaseUnavailableReason, getFirebase } from './firebase-app';

function createSafeCloudError(cause: unknown): Error & { code?: string } {
  const safeError = new Error('The cloud model request failed.') as Error & {
    code?: string;
  };
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof (cause as { code?: unknown }).code === 'string'
  ) {
    safeError.code = (cause as { code: string }).code;
  }
  return safeError;
}

/**
 * Gemini cloud model through Firebase AI Logic with InferenceMode.ONLY_IN_CLOUD.
 */
export class FirebaseCloudModel implements ModelClient {
  readonly location = 'cloud' as const;
  readonly simulated = false;
  readonly label = 'Gemini in the cloud (Firebase AI Logic, ONLY_IN_CLOUD)';

  private readonly explicitAI?: AI;
  private cachedModel: GenerativeModel | null = null;

  constructor(ai?: AI) {
    this.explicitAI = ai;
  }

  private getOrCreateModel(): GenerativeModel {
    if (this.cachedModel) {
      return this.cachedModel;
    }

    const ai = this.explicitAI ?? getFirebase()?.ai;
    if (!ai) {
      const err = new Error('The cloud model request failed.') as Error & {
        code?: string;
      };
      err.code = 'cloud-unavailable';
      throw err;
    }

    // https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options
    // "ONLY_IN_CLOUD : Use the cloud-hosted model if it's available; otherwise, throw an exception."
    // "You can use the inCloudParams configuration option to specify an alternative default cloud-hosted model."
    this.cachedModel = getGenerativeModel(ai, {
      mode: InferenceMode.ONLY_IN_CLOUD,
      inCloudParams: cloudModelName ? { model: cloudModelName } : undefined,
    });

    return this.cachedModel;
  }

  async status(): Promise<ModelStatus> {
    if (this.explicitAI || getFirebase() !== null) {
      return { state: 'ready' };
    }
    return {
      state: 'unavailable',
      reason:
        firebaseUnavailableReason() ??
        'Firebase AI Logic is not configured for cloud inference.',
    };
  }

  async prepare(): Promise<void> {
    return;
  }

  async generate(request: GenerateRequest): Promise<GenerateResult> {
    try {
      const model = this.getOrCreateModel();

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
    } catch (err) {
      throw createSafeCloudError(err);
    }
  }
}
