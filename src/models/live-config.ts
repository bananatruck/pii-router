/**
 * Decides whether live mode can run, without importing the Firebase SDK.
 *
 * The UI calls this first and only loads `src/models` (and with it the Firebase SDK) through a
 * dynamic import when it returns null, so the simulated demo never downloads or runs the SDK.
 */
import { isFirebaseConfigured, isRecaptchaConfigured } from '../firebase-config';

/** True in a development build served from localhost, where the App Check debug provider is used. */
export function isLocalhostDev(): boolean {
  if (!import.meta.env.DEV) {
    return false;
  }
  const hostname = globalThis.location?.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

/** A plain-language reason why live mode cannot run, or null when the config allows it. */
export function liveConfigProblem(): string | null {
  if (!isFirebaseConfigured()) {
    return 'Firebase is not configured yet (src/firebase-config.ts still contains placeholder values).';
  }
  if (!isLocalhostDev() && !isRecaptchaConfigured()) {
    return 'App Check needs a reCAPTCHA Enterprise site key outside localhost (src/firebase-config.ts still contains the placeholder site key).';
  }
  return null;
}
