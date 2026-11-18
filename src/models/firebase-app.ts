import { initializeApp, type FirebaseApp } from 'firebase/app';
import { getAI, GoogleAIBackend, type AI } from 'firebase/ai';
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { firebaseConfig, recaptchaEnterpriseSiteKey } from '../firebase-config';
import { isLocalhostDev, liveConfigProblem } from './live-config';

let cachedFirebase: { app: FirebaseApp; ai: AI } | null = null;
let unavailableReason: string | null = null;

/**
 * Returns the reason why Firebase AI Logic is unavailable, or null when ready.
 */
export function firebaseUnavailableReason(): string | null {
  return liveConfigProblem() ?? unavailableReason;
}

/**
 * Lazily initialises the Firebase app, App Check, and Firebase AI Logic service.
 * Returns null when Firebase or production App Check is not configured.
 */
export function getFirebase(): { app: FirebaseApp; ai: AI } | null {
  if (liveConfigProblem() !== null) {
    return null;
  }
  if (cachedFirebase) {
    return cachedFirebase;
  }

  try {
    // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
    // "Initialize FirebaseApp: const firebaseApp = initializeApp(firebaseConfig);"
    const app = initializeApp(firebaseConfig);

    if (isLocalhostDev()) {
      // https://firebase.google.com/docs/app-check/web/debug-provider
      // "In your debug build, enable debug mode by setting self.FIREBASE_APPCHECK_DEBUG_TOKEN to true before you initialize App Check."
      (
        globalThis as typeof globalThis & {
          FIREBASE_APPCHECK_DEBUG_TOKEN?: boolean | string;
        }
      ).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }

    // https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
    // "Create a ReCaptchaEnterpriseProvider instance using your reCAPTCHA Enterprise key and pass it to initializeAppCheck()."
    initializeAppCheck(app, {
      // https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider
      // "provider: new ReCaptchaEnterpriseProvider(RECAPTCHA_KEY), isTokenAutoRefreshEnabled: true"
      provider: new ReCaptchaEnterpriseProvider(recaptchaEnterpriseSiteKey),
      isTokenAutoRefreshEnabled: true,
    });

    // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
    // "Initialize the Gemini Developer API backend service: const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });"
    const ai = getAI(app, {
      // https://firebase.google.com/docs/ai-logic/hybrid/web/get-started
      // "const ai = getAI(firebaseApp, { backend: new GoogleAIBackend() });"
      backend: new GoogleAIBackend(),
    });

    unavailableReason = null;
    cachedFirebase = { app, ai };
    return cachedFirebase;
  } catch {
    unavailableReason = 'Firebase initialisation failed.';
    return null;
  }
}
