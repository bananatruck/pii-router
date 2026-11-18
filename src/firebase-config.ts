/**
 * THE ONLY FILE TO EDIT TO CONNECT A FIREBASE PROJECT.
 *
 * These are PLACEHOLDER values. Until they are replaced, the app runs only in the clearly
 * labelled "Simulated" demo mode and never constructs the cloud model.
 *
 * How to fill this in: submission/SETUP_FOR_KESH.md, or
 * https://firebase.google.com/docs/web/learn-more#config-object
 *
 * The Firebase web config identifies the project; it is not a secret. Do not put an App Check
 * debug token here or anywhere else in the repository
 * (https://firebase.google.com/docs/app-check/web/debug-provider).
 */
export const firebaseConfig = {
  apiKey: 'PLACEHOLDER_API_KEY',
  authDomain: 'PLACEHOLDER_PROJECT_ID.firebaseapp.com',
  projectId: 'PLACEHOLDER_PROJECT_ID',
  storageBucket: 'PLACEHOLDER_PROJECT_ID.firebasestorage.app',
  messagingSenderId: 'PLACEHOLDER_SENDER_ID',
  appId: 'PLACEHOLDER_APP_ID',
};

/**
 * reCAPTCHA Enterprise site key for the production App Check provider on a hosted origin
 * (https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).
 * On localhost in a development build the debug provider is used instead and this may stay a placeholder.
 */
export const recaptchaEnterpriseSiteKey = 'PLACEHOLDER_RECAPTCHA_ENTERPRISE_SITE_KEY';

/**
 * Cloud model for the redacted request. Leave as undefined to use the SDK default
 * (gemini-3.5-flash-lite from JS SDK v13.0.0, per
 * https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options).
 */
export const cloudModelName: string | undefined = undefined;

/** True once every config value has been replaced. */
export function isFirebaseConfigured(config: Record<string, string> = firebaseConfig): boolean {
  return Object.values(config).every((v) => typeof v === 'string' && v.length > 0 && !v.includes('PLACEHOLDER'));
}

export function isRecaptchaConfigured(key: string = recaptchaEnterpriseSiteKey): boolean {
  return key.length > 0 && !key.includes('PLACEHOLDER');
}
