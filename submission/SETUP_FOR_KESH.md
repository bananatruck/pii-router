# Setup for Kesh: connect a real Firebase project and Gemini Nano

This takes about 30 minutes of your time; the Gemini Nano download runs in the background.
Every step names the page it comes from.
Nothing here costs money: the Gemini Developer API provider is used at no cost within its limits, and Gemini Nano runs on your machine.
Work in `~/Documents/Projects/hackathons/pii-router` (Node 22.18 or later (or Node 24 LTS), because `pnpm verify:setup` runs a TypeScript file directly, and pnpm; `node_modules` is already installed there).

## Fast path

1. Run `pnpm verify:setup`. On 2026-11-18 it reported two blockers: the placeholder config, and 6.4 GB free on the volume with your Chrome profile (Flatpak Chrome, `~/.var/app/com.google.Chrome`), where Chrome needs at least 22 GB free before it downloads Gemini Nano. Free about 16 GB first.
2. Start the Gemini Nano download early, because it is the long wait: run `pnpm dev` (it serves `http://localhost:5173`, which step 5 needs), then do step 5.
3. Do steps 1 to 4 while it downloads.
4. Run `pnpm verify:setup` again until it says "ready for the real run". It checks the pasted config offline (it never prints the API key and makes no network request), checks that no App Check debug token was committed, re-checks the disk, and lists the `[VERIFY AFTER REAL RUN]` markers in `submission/DEVPOST.md` with the step that settles each.
5. Do step 6 and update those markers with what you saw.

You need: a Google account, desktop Chrome 139 or later, and a machine that meets the Prompt API hardware requirements (step 5).
This laptop (G14, 16 GB RAM) meets the RAM rule; free disk is the problem.

## 1. Create the Firebase project

Doc: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (Step 2).

1. Open https://console.firebase.google.com and click "Create a new Firebase project".
2. Name it, for example `pii-router`.
3. Google Analytics is not needed ("you do not need to set up Google Analytics to use the Firebase AI Logic SDKs").

## 2. Turn on Firebase AI Logic

Same doc, Step 2.

1. In the console, go to AI Services > AI Logic and click Get started.
2. When asked for a "Gemini API provider", pick the Gemini Developer API ("lets you get started quickly at no cost").
3. Continue through the workflow; it enables the APIs and enforces App Check for AI Logic automatically.
4. If it offers to register a web app, do it and keep the config object it shows.

## 3. Register the web app and paste the config

Doc: https://firebase.google.com/docs/web/learn-more#config-object

1. If step 2 did not register an app: Project settings > General > Your apps > Add app > Web. Name it `pii-router-web`. Hosting is not needed.
2. Copy the `firebaseConfig` values into `src/firebase-config.ts`, replacing every `PLACEHOLDER_...` value, then run `pnpm verify:setup`.
   The web config identifies the project and is not a secret, so it can be committed.
3. Leave `recaptchaEnterpriseSiteKey` as the placeholder for local testing.
   The App Check SDK still loads the reCAPTCHA Enterprise script with that placeholder key, even though the debug token is what authenticates on localhost; I could not run this, so watch the console in step 4 and note any reCAPTCHA errors.

## 4. App Check debug token for localhost

Docs: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (Step 4) and https://firebase.google.com/docs/app-check/web/debug-provider.

1. In the console, open Security > App Check > APIs and check that the row for Firebase AI Logic says Enforced.
2. Run the app locally with `pnpm dev` and open `http://localhost:5173` (it must be `localhost` or `127.0.0.1` in a development build for the debug provider to switch on).
   In a development build on localhost the app sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initializeAppCheck`, as the doc says.
3. Open DevTools > Console and copy the line `Firebase App Check debug token: ...`.
   The SDK prints it only when it creates a new token on the first load; if you miss it, clear the site data for localhost (DevTools > Application > Storage > Clear site data) and reload.
4. In the console, go to Security > App Check > Apps, open the overflow menu on the web app, choose Manage debug tokens, and add the token.
5. Never paste the token into a file in the repository, an issue or the Devpost form ("Don't commit your debug token to a public repository").

## 5. Enable Gemini Nano in Chrome

Docs: https://firebase.google.com/docs/ai-logic/hybrid/web/get-started (Step 1) and https://developer.chrome.com/docs/ai/prompt-api (hardware requirements).

1. Check `chrome://settings/help` shows version 139 or later.
2. Open `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input`, set it to Enabled, and restart Chrome (on this laptop Chrome is the Flatpak `com.google.Chrome`; the flag page is the same).
3. Hardware, from the Prompt API page: Windows 10 or 11, macOS 13+, or Linux; at least 22 GB free on the volume with your Chrome profile; a GPU with more than 4 GB of VRAM, or 16 GB of RAM and 4 CPU cores; an unmetered connection for the download.
4. Optional, to download ahead of time: on `http://localhost:5173`, open DevTools > Console and run `await LanguageModel.availability();`.
   If it prints `downloadable`, run `await LanguageModel.create();` and wait.
   `chrome://on-device-internals` shows the model state.
5. In the app, the "Gemini Nano" pill should say "ready".
   If it says "needs download", click "Prepare Gemini Nano" (the SDK requires a click before `initializeDeviceModel()`).

## 6. Run the real end-to-end check

1. With `pnpm dev` running and the debug token registered, reload `http://localhost:5173`.
   The header pills should read "Gemini Nano: ready", "Firebase: connected", "Live".
2. Click "Use sample" and choose "Support email" to load the synthetic support email, pick "Rewrite to sound professional", leave the route on "Auto", and click "Run".
3. Check in the app: the step strip shows Patterns and Gemini Nano on the device side, the cloud step marked "cloud", and the payload panel contains placeholders such as `[PERSON_1]` and `[EMAIL_1]` and no amber values.
4. Check independently: DevTools > Network, filter `firebasevertexai`, open the `generateContent` request, and read its payload.
   It must contain the placeholders and none of the sample's name, email, phone or card number.
   Also check that no request to that host was made during the Gemini Nano step.
5. Clear the Network log (the rewrite left a request in it), then switch the task to "Summarize" and Run: with Gemini Nano ready, Auto keeps it on the device, and the Network tab must show no `firebasevertexai` request at all.
6. Fail-closed check: set the Chrome flag to Disabled (not Default, which may still leave the API on), restart, reload, and run the rewrite again.
   The app must say it is blocked because Gemini Nano is unavailable, and the Network tab must show no `generateContent` request.
   Turn the flag back on afterwards.
7. Write down what you saw; `submission/CHECKLIST.md` has a line for it.

## 7. Optional: real models on a hosted URL

The GitHub Pages site runs the labelled simulated demo, because App Check on a hosted origin needs a production attestation provider and debug tokens are tied to one browser.
To run real models on the hosted site, register the web app with reCAPTCHA Enterprise in Security > App Check > Apps (doc: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider), allow the domain `bananatruck.github.io` on the key, paste the site key into `recaptchaEnterpriseSiteKey`, and push to `main`.
I did not verify whether reCAPTCHA Enterprise asks for a billing account in a new project; if it does, skip this step, because the rules accept debug tokens and the video can show the local run.
