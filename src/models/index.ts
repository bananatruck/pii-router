import type { ModelClient } from '../core/types';
import { firebaseUnavailableReason, getFirebase } from './firebase-app';
import { FirebaseCloudModel } from './firebase-cloud';
import { FirebaseOnDeviceModel } from './firebase-on-device';

export { getFirebase, firebaseUnavailableReason } from './firebase-app';
export { probeLanguageModel, ON_DEVICE_EXPECTED_OPTIONS } from './prompt-api';
export { FirebaseOnDeviceModel } from './firebase-on-device';
export { FirebaseCloudModel } from './firebase-cloud';

/**
 * Creates the live Firebase AI Logic model clients.
 * When Firebase is not configured, `cloud` is null and `liveReason` explains why,
 * while `device` remains usable in Chrome 139+ with Gemini Nano enabled.
 */
export function createLiveModels(): {
  device: ModelClient;
  cloud: ModelClient | null;
  liveReason: string | null;
} {
  const fb = getFirebase();
  const device = new FirebaseOnDeviceModel(fb?.ai);
  if (!fb) {
    return {
      device,
      cloud: null,
      liveReason: firebaseUnavailableReason(),
    };
  }
  return {
    device,
    cloud: new FirebaseCloudModel(fb.ai),
    liveReason: null,
  };
}
