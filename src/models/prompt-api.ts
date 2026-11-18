import type { ModelStatus } from '../core/types';

/**
 * Expected input and output modalities and languages for Gemini Nano on device.
 * Shared between LanguageModel.availability() and Firebase AI Logic onDeviceParams.createOptions.
 */
export const ON_DEVICE_EXPECTED_OPTIONS: {
  expectedInputs: [{ type: 'text'; languages: ['en'] }];
  expectedOutputs: [{ type: 'text'; languages: ['en'] }];
} = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

const MISSING_PROMPT_API_REASON =
  'Chrome Prompt API (LanguageModel) is not available in this browser. Use Chrome 139+ on desktop and enable chrome://flags/#prompt-api-for-gemini-nano-multimodal-input, then restart Chrome.';

/**
 * Probes Chrome's built-in Prompt API (LanguageModel) without sending any user text.
 */
export async function probeLanguageModel(): Promise<ModelStatus> {
  if (
    typeof globalThis === 'undefined' ||
    !('LanguageModel' in globalThis) ||
    typeof LanguageModel === 'undefined' ||
    typeof LanguageModel.availability !== 'function'
  ) {
    return {
      state: 'unavailable',
      reason: MISSING_PROMPT_API_REASON,
    };
  }

  try {
    // https://developer.chrome.com/docs/ai/prompt-api
    // "Always pass the same options to the availability() function that you use in prompt() or promptStreaming()."
    const availability = await LanguageModel.availability(
      ON_DEVICE_EXPECTED_OPTIONS,
    );

    switch (availability) {
      case 'available':
        return { state: 'ready' };
      case 'downloadable':
        return { state: 'needs-download' };
      case 'downloading':
        return { state: 'downloading' };
      case 'unavailable':
      default:
        return {
          state: 'unavailable',
          reason:
            'Gemini Nano on-device model reported unavailable in Chrome. Check chrome://flags/#prompt-api-for-gemini-nano-multimodal-input and hardware requirements.',
        };
    }
  } catch {
    return {
      state: 'unavailable',
      reason: 'Failed to check Chrome Prompt API (LanguageModel.availability) status.',
    };
  }
}
