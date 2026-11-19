# Devpost submission draft

Every field of the Devpost form, drafted in my voice.
Paste each block into the matching field.
Three kinds of markers are left for you:

- `[VERIFY AFTER REAL RUN]`: a sentence about the real Firebase and Gemini Nano path that was built and unit-tested but could not be run on the build machine; keep it only if the real run in `SETUP_FOR_KESH.md` step 6 shows it, otherwise delete or correct it.
- `[LINK]`: a URL that only exists after you create it (the YouTube video).
- `[KESH TO CONFIRM]`: a first-person sentence drafted in your voice; keep it only if it is true for you.

What was verified overnight, and how, is listed at the end of this file so you can check each claim.

## Project name

PII Router

## Elevator pitch (the short tagline, 200 characters max)

Gemini Nano strips personal data on your device, Gemini in the cloud does the heavy writing on the redacted text, and your device puts the real names back. Privacy decides where inference runs.

## Platform

Web (Chrome).

## Built with

firebase-ai-logic, gemini-nano, gemini, chrome-prompt-api, firebase-app-check, typescript, react, vite, tailwindcss, vitest, playwright

## Try it out

- Code: https://github.com/bananatruck/pii-router
- Simulated demo (runs in any browser, clearly labelled, no model involved): https://bananatruck.github.io/pii-router/
- Demo video: [LINK]

## About the project

### Inspiration

[KESH TO CONFIRM: this opening is drafted in your voice; keep it only if it is true for you.] Every week I watch people paste customer emails, patient notes and HR cases into cloud chatbots, because the cloud model writes so much better than anything local.
Each paste hands a third party the names, emails, phone numbers and card numbers of people who never agreed to it.
On-device models solve the privacy half but not the quality half: Gemini Nano is good at spotting a name, not at rewriting a long, careful reply.
#BuildHybridAI asked for apps that use both, and I wanted the split between device and cloud to be decided by what the text contains, not only by whether a model happens to be available.

### What it does

You paste text and pick a task: summarize, rewrite to sound professional, draft a reply, or your own instruction.
A deterministic detector on the device marks emails, phone numbers, Luhn-valid card numbers, mod-97-valid IBANs, US Social Security numbers and IPv4 addresses as you type, with no model involved.
When you run it, Gemini Nano, through Firebase AI Logic in `ONLY_ON_DEVICE` mode, finds what patterns cannot: names, street addresses and other identifiers.
Every value becomes a placeholder such as `[PERSON_1]`, and the placeholder-to-value vault stays in page memory.
Light tasks stay entirely on Gemini Nano, so nothing leaves the device.
Heavy tasks go to Gemini in the cloud, through Firebase AI Logic in `ONLY_IN_CLOUD` mode, carrying only the redacted text, after a guard re-scans the exact payload.
The answer comes back with placeholders and the device restores the real values.
The screen is split by the trust boundary, so you can compare, character for character, what stayed on the device and what crossed to the cloud.
If the app cannot verify the text on the device, it sends nothing and tells you why.

### How I built it

The app is a Vite, React and TypeScript web app for desktop Chrome, using the Firebase JS SDK 13.4.0 (`firebase/ai`).
All model access goes through one small interface with three implementations: Gemini Nano through Firebase AI Logic, Gemini in the cloud through Firebase AI Logic, and a deterministic fake used by the tests and by the labelled demo mode.
Firebase AI Logic is imported and called at runtime in `src/models/firebase-on-device.ts` and `src/models/firebase-cloud.ts`, with App Check initialised first in `src/models/firebase-app.ts` (the reCAPTCHA Enterprise provider, with the debug-token flag set first on localhost development builds so App Check uses a debug token there).
[VERIFY AFTER REAL RUN] Status when this was drafted: these calls are unit-tested with the SDK mocked and the on-device guard is tested against the real SDK, but they have not yet run against a live Firebase project or a downloaded Gemini Nano; after the real run, replace this sentence with what it showed.
The on-device detector uses structured output: the same JSON schema goes to `onDeviceParams.promptOptions.responseConstraint`, and anything that does not parse is rejected.
`response.inferenceSource` is checked on every on-device call, and a cloud source blocks the run.
The privacy promise is enforced by tests rather than by trust: a recording cloud model captures the exact string it receives, and for 28 synthetic inputs across every task, no detected value appears in it.
A second suite of adversarial inputs declares, independently of the detectors, the values that must never appear in that string, so a value the detectors miss fails the test instead of slipping past it.
Further tests show that when Gemini Nano is unavailable, throws, returns malformed JSON or reports the wrong source, the cloud model is never called.
Before publishing I had a second model attack the code: Cursor with grok-4.7-high, told to make a personal value reach the cloud, logs, storage or an error.
It found four real ways (invisible and look-alike characters, a model span lost to an overlap, a race in the on-device check, and a double-click double run), and each is fixed with a test; `docs/SPEC.md` section 8 lists them.
A later review by GPT 6.1 Sol through Codex found more: numbers hidden by their surroundings (inside a URL, after an extension, split across lines), quoted email addresses, IBANs from countries my table lacked, model findings that were not applied everywhere, and two more ways the SDK could build an on-device model without its on-device adapter; those are fixed with tests too.

I built this overnight by directing AI coding agents, and I want to be plain about it.
Claude Code (Opus 5.5) acted as tech lead: it read the rules and the Firebase and Chrome docs, wrote the specification, split the work and reviewed and integrated every change.
GPT 6.1 Sol (through Codex) wrote the redaction engine and its tests, Gemini 4 Argon (through Antigravity) wrote the Firebase integration layer and the first version of the UI from a mock-up, Cursor (grok-4.7-high) ran an adversarial privacy review, and Cursor (composer-2.5) fixed most of its findings, split the UI into components and fixed some patterns.
The commit history says which agent wrote what.
[KESH TO CONFIRM] The idea, the product decisions and the review of the result are mine.

### Challenges I ran into

The hardest part was that the obvious hybrid mode is the wrong one for privacy.
`PREFER_ON_DEVICE`, the mode every sample uses, silently sends the prompt to the cloud when Gemini Nano is missing, which for this app would be exactly the leak it exists to prevent.
So raw text only ever goes to a model in `ONLY_ON_DEVICE` mode.
Then, reading the SDK source, I found that even `ONLY_ON_DEVICE` goes to the cloud when the browser has no Prompt API at all: `getGenerativeModel` creates no on-device adapter when `(window || self).LanguageModel` is missing, and `callCloudOrDevice` then calls the cloud before it looks at the mode.
The docs say that mode should throw.
I reproduced it twice: in a unit test with the real SDK and a stubbed `fetch`, and in a real Chromium with `e2e/sdk-probe.mjs`, which removes `LanguageModel`, intercepts Google hosts, and records that the SDK tried to POST the prompt to `firebasevertexai.googleapis.com` while my wrapper made no request at all.
PII Router now checks for the Prompt API and its availability before every on-device call.

### Accomplishments that I'm proud of

The privacy claim is something the tests check, on the exact outbound payload, not a sentence in a README.
Two adversarial reviews found real holes before anyone else could; each one they found is fixed with a test, and the limits that remain are written down.
The app fails closed: no Gemini Nano, no cloud call.
The UI makes the trust boundary visible, so a non-technical user can see that the cloud got `[PERSON_1]` and not the name.

### What I learned

Hybrid inference is usually framed as availability: local when you can, cloud when you must.
For sensitive data the more useful framing is authority: the on-device model decides what the cloud model is allowed to see.
I also learned to read the SDK, not only the docs, before making a privacy promise.

### What's next for PII Router

A Chrome extension side panel, so selected text on any page can be routed the same way.
Firebase Remote Config for the cloud model name and the routing thresholds, as the Firebase production checklist recommends.
More pattern types (passport and national ID formats beyond the US) and a test corpus in more languages.
Reporting the `ONLY_ON_DEVICE` fallback to the Firebase team with the repro.

## How I used Firebase AI Logic (the hackathon's question)

Two Firebase AI Logic models, deliberately in non-default modes.
Gemini Nano runs through `getGenerativeModel(ai, { mode: InferenceMode.ONLY_ON_DEVICE, onDeviceParams: { createOptions, promptOptions: { responseConstraint } } })` as a structured-output entity detector and, for light tasks, as the answerer; `initializeDeviceModel()` is called from the "Prepare Gemini Nano" button, as the docs require a user gesture.
Gemini in the cloud runs through `getGenerativeModel(ai, { mode: InferenceMode.ONLY_IN_CLOUD })` (default model `gemini-3.5-flash-lite`) and only ever receives the redacted payload.
`response.inferenceSource` is checked on every on-device call.
App Check is initialised before `getAI` with the reCAPTCHA Enterprise provider; on localhost development builds the debug-token flag is set first, so a registered debug token is used.
[VERIFY AFTER REAL RUN] In my real run in desktop Chrome, the detection step ran on Gemini Nano, the rewrite went to Gemini in the cloud, and the `generateContent` request in the Network tab contained only placeholders.

## Testing instructions for judges

The hosted demo (https://bananatruck.github.io/pii-router/) runs in a clearly labelled Simulated mode in any browser: a deterministic stand-in plays both models so you can see the whole flow, including the fail-closed path ("Simulate Gemini Nano unavailable").
To run the real models: clone the repository, `pnpm install`, add a Firebase web config with Firebase AI Logic (Gemini Developer API) enabled to `src/firebase-config.ts`, run `pnpm dev`, register the App Check debug token printed in the console, and open `http://localhost:5173` in desktop Chrome 139 or later with `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` enabled.
The README has the full steps.
The simulated demo needs no account, payment or personal data, and the app includes synthetic samples; the real path needs a free Firebase project as described above.

## Existing project?

No. This is a new project, created on November 17 and 18, 2026, inside the submission period.
Pre-existing code it includes: open source npm packages and three UI components copied from Magic UI and React Bits, all listed with their licences in `THIRD_PARTY_NOTICES.md`.

## What was verified overnight, and how

- Unit, privacy and UI tests: `pnpm test` passes, 335 tests in 14 files (run on 2026-11-18 at 23:04 PST).
- Lint, type-check and production build: `pnpm lint`, `pnpm typecheck`, `pnpm build` pass.
- Browser: `pnpm e2e` drives the built app in Playwright's Chromium 156 at 1440 and 390 pixels wide in Simulated mode (cloud route, device-only route, and the blocked path) with no console errors and no third-party requests; screenshots are in `docs/screenshots/`.
- The hosted demo: the same check was run against https://bananatruck.github.io/pii-router/ with `E2E_BASE_URL` after each deploy and passed (observed in the build session; not recorded in the repository; rerun it with `E2E_BASE_URL=https://bananatruck.github.io/pii-router/ node e2e/run.mjs`).
- SDK fallback: `pnpm e2e:sdk` reproduces it in Chromium 156.
- Only tested against the fake or a mocked SDK: everything that needs a Firebase project or a downloaded Gemini Nano, that is the real on-device detection, the real cloud call, App Check, `initializeDeviceModel()`, and the real model's answers.
  The Firebase clients' calls are unit-tested with `firebase/ai` mocked, and written against the docs and the installed SDK types.
