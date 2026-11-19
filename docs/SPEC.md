# PII Router - specification

PII Router is a web app for Chrome.
You paste text that contains personal data, pick a task, and it decides where the work may run.
Gemini Nano on your device finds and removes the personal data, only the redacted text goes to the cloud model, and the original values are put back into the answer on your device.
Where inference runs is decided by privacy, not only by capability.

This file is the contract for everyone who works on the code, human or agent.
Where it cites documentation, the cited page is the source of truth, read on 2026-11-17.

## 1. The hackathon, as read

Source pages (read live on 2026-11-17; identical in content to copies saved locally during the build):
`https://firebasehybridaihackathon.devpost.com/`, `/rules` and `/resources`.

### 1.1 What must be built

The project must be a Gen AI app that uses the Firebase AI Logic Hybrid Inference SDK.
For the Web (Chrome) platform that means Gemini Nano 4 through Firebase AI Logic, in "Web applications or Chrome extensions".
"Firebase AI Logic requires App Check; debug tokens are accepted in submissions."
Other Firebase products (Remote Config, Firestore, Authentication) are encouraged, not required.
The project must install and run consistently on its platform and must work as shown in the video and the description.
New projects are eligible; "AI coding assistants" are listed as allowed standard tools, and any other pre-existing code or work must be disclosed.

### 1.2 What must be submitted

- A platform selection (we select Web).
- A text description covering how Firebase AI Logic is used, the features, and the value proposition.
- A public GitHub or GitLab repository with all source, assets and instructions, that "must demonstrate the use of Firebase AI Logic at runtime in your code - imported and actually called".
- An open source license file, visible in the repository's About section; "Apache is preferred".
- A demo video of at most 3 minutes, public on YouTube, in English or with English subtitles, showing the project working on its platform.
- Strongly encouraged: a URL where judges can try the project; "a hosted project is highly encouraged".
- The project must be free for judges to use until the judging period ends.
- The repository, form and testing instructions must not contain production API keys, live Google Cloud project secrets, or personally identifiable information.

### 1.3 Judging

Stage one is pass or fail on the submission requirements.
Stage two scores four equally weighted criteria from 1 to 5:

- Technological Implementation: how well it is built and how effectively it uses Firebase AI Logic hybrid inference.
- Design: a complete, coherent product experience, not a technical proof of concept.
- Potential Impact: a credible, specific case for a real problem and a real audience, judged on what is demonstrated.
- Quality of the Idea: a creative, non-obvious use of Firebase AI Logic, with genuine understanding of the problem space.

Ties are broken on the criteria in that order.
A project can win the Grand Prize and at most one "Best of" prize; we target Best Web/Chrome App.

### 1.4 How this design answers the criteria

- Technological Implementation: both inference modes that matter are used on purpose (`ONLY_ON_DEVICE` for anything that sees raw text, `ONLY_IN_CLOUD` for redacted text), the SDK's `inferenceSource` is checked on every on-device call, and the privacy guarantee is enforced by tests on the exact outbound payload.
- Design: one screen shows, live, what stayed on the device and what crossed to the cloud, character for character.
- Potential Impact: people paste customer emails, medical notes and HR text into cloud chatbots every day; this lets them use a strong cloud model without handing over the personal details.
- Quality of the Idea: the documented hybrid pattern is "on-device when available, cloud otherwise"; here the split is decided by what the text contains, and the on-device model acts as the privacy gate for the cloud model.

### 1.5 Decision: web app, not a Chrome extension

I build a web app (Vite, React, TypeScript) that runs in desktop Chrome.
The rules allow either form.
I rejected the Manifest V3 extension because the hosted URL is "highly encouraged", because the Firebase hybrid guide is written for web apps on `localhost` and hosted origins, and because the only production App Check provider for Web named in the docs is reCAPTCHA Enterprise, which is bound to web domains (https://firebase.google.com/docs/ai-logic/production-checklist).
A static build can be hosted on GitHub Pages in simulated mode tonight, and on Firebase Hosting or Pages with real models once the Firebase project exists.

## 2. Platform facts this design depends on

Each line names the page it comes from.

- On-device inference through Firebase AI Logic needs SDK v12.5.0 or later and Chrome on Desktop 139 or later (https://firebase.google.com/docs/ai-logic/hybrid/web/get-started).
- On-device inference uses Chrome's Prompt API (same page).
- The flag `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` must be Enabled, then Chrome restarted (same page).
- `getAI(firebaseApp, { backend: new GoogleAIBackend() })` and `getGenerativeModel(ai, { mode: InferenceMode.X })` from `firebase/ai` (same page).
- Modes, quoted: `PREFER_ON_DEVICE` "Use the on-device model if it's available; otherwise, fall back to the cloud-hosted model"; `ONLY_ON_DEVICE` "Use the on-device model if it's available; otherwise, throw an exception"; `PREFER_IN_CLOUD`; `ONLY_IN_CLOUD` "Use the cloud-hosted model if it's available; otherwise, throw an exception" (https://firebase.google.com/docs/ai-logic/hybrid/web/configuration-options).
- `result.response.inferenceSource` is `ON_DEVICE` or `IN_CLOUD`, from JS SDK v12.5.0 (same page).
- `inCloudParams: { model, generationConfig }` and `onDeviceParams: { createOptions: { expectedInputs, expectedOutputs, initialPrompts } }` (same page).
- The default cloud model is `gemini-3.5-flash-lite` from JS SDK v13.0.0 (same page).
- Structured output on device: `onDeviceParams.promptOptions.responseConstraint` with a `Schema` or plain JSON schema; in the cloud: `inCloudParams.generationConfig.responseMimeType: "application/json"` and `responseSchema` (https://firebase.google.com/docs/ai-logic/hybrid/web/generate-structured-output).
- `model.initializeDeviceModel(progressCallback)` must be called "after or on an end-user page interaction" and "before any queries to the model" (https://firebase.google.com/docs/ai-logic/hybrid/web/get-started).
- With `ONLY_ON_DEVICE`, a request made before the download finishes waits for the download (same page).
- On device the token limit is 9216, and only single-turn text generation is supported, not chat (same page).
- App Check is enforced for Firebase AI Logic in all projects since November 2, 2026 (banner on the same page and the production checklist).
- Debug provider: set `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` before `initializeAppCheck`, read the token from the console, register it under Security > App Check > Apps > Manage debug tokens; never commit it (https://firebase.google.com/docs/app-check/web/debug-provider).
- Production web provider: `initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(KEY), isTokenAutoRefreshEnabled: true })` (https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider).
- Prompt API hardware: Windows 10 or 11, macOS 13+, Linux or Chromebook Plus; at least 22 GB free on the Chrome profile volume; a GPU with more than 4 GB VRAM, or 16 GB RAM and 4 cores (https://developer.chrome.com/docs/ai/prompt-api).
- `LanguageModel.availability(options)` returns `unavailable`, `downloadable`, `downloading` or `available`; pass the same options as the prompt (same page).
- Chrome's own guidance: "When you fallback to the cloud, there may be legal or functional consequences for your application. If you process sensitive information, be sure to make the appropriate terms and conditions available for user review and consent" (https://developer.chrome.com/docs/ai/firebase-ai-logic).

### 2.1 The non-obvious consequence for privacy

`PREFER_ON_DEVICE` is the mode every sample uses, and it silently sends the prompt to the cloud when Nano is missing.
For a privacy tool that would be a leak.
So raw text is only ever given to a model created with `InferenceMode.ONLY_ON_DEVICE`, which throws instead of falling back when it has an on-device adapter; section 2.2 explains the case where it has none and how the app refuses it.
As a second check, any on-device answer whose `inferenceSource` is not `ON_DEVICE` is discarded and the run is blocked.
The cloud model is created with `InferenceMode.ONLY_IN_CLOUD` and only ever receives the redacted payload.
The `PREFER_*` modes are not used anywhere in this app.

### 2.2 An SDK behaviour that contradicts the docs, found by reading the source

In the installed SDK (`firebase` 13.4.0, which bundles `@firebase/ai` 3.1.0), `getGenerativeModel` builds its on-device adapter by calling the AI service's optional `chromeAdapterFactory` (`ai.chromeAdapterFactory?.(...)`), and that factory reads `(window || getGlobal()).LanguageModel` and returns `undefined` unless both that value and the mode are truthy (`dist/esm/index.esm.js`, `function chromeAdapterFactory`, `if (languageModel && mode)`).
`callCloudOrDevice` then starts with `if (!chromeAdapter) { return { response: await inCloudCall(), inferenceSource: InferenceSource.IN_CLOUD } }`, before it looks at the mode.
So whenever no adapter is created (a browser without the Prompt API at all, such as Firefox, Safari, older Chrome or Chrome with the API off; a page where `window.LanguageModel` is missing or falsy; or an AI service without the factory), a model created with `ONLY_ON_DEVICE` sends the prompt to the cloud instead of throwing. Streaming and chat use the same dispatcher, and `countTokens` without an adapter also goes to the cloud (checked by the round-2 review).
The docs say `ONLY_ON_DEVICE` should "throw an exception" when the on-device model is not available.
The SDK's `InferenceSource` values are the strings `"on_device"` and `"in_cloud"`, so code must compare with the exported constant, not with the text `ON_DEVICE` printed in the docs.
Consequences for this app:

- `FirebaseOnDeviceModel` refuses to call `generateContent` unless `LanguageModel` exists on the global object, `LanguageModel.availability()` is not `unavailable`, and the model it just created has an on-device adapter (`model.chromeAdapter`, the exact condition `callCloudOrDevice` tests); these checks run before every call, and the app never uses streaming, chat or `countTokens`.
- A test runs the real SDK with no `LanguageModel` and a stubbed `fetch`, and shows the SDK would call the network in `ONLY_ON_DEVICE` mode, while our wrapper blocks the call and `fetch` is never reached.
- The `inferenceSource` check stays as a second line, but it runs after the fact and is not relied on for the guarantee.

Confirmed twice on 2026-11-18:

- `src/models/sdk-fallback.test.ts` loads the browser build of `@firebase/ai` with no `LanguageModel` and a stubbed `fetch`: the SDK's `ONLY_ON_DEVICE` model calls `fetch` with the prompt in the body, and `FirebaseOnDeviceModel` never calls `fetch`.
- `e2e/sdk-probe.mjs` repeats this in Playwright's Chromium 156 with `window.LanguageModel` removed and every Google host intercepted and aborted: the SDK tried to POST the prompt to `firebasevertexai.googleapis.com`; `FirebaseOnDeviceModel` threw `device-unavailable` and made no request.

A related observation from the same Chromium on `localhost`, checked by hand during the build and not recorded by a script: `LanguageModel` exists and reports `downloadable`.
In that state our guard lets the call through, because the model has a real on-device adapter: the SDK's `ONLY_ON_DEVICE` path awaits the adapter's existing download promise (a fresh adapter has none) and then creates a Prompt API session, which may start the download or fail; it does not go to the cloud.
The router never asks the on-device model for anything unless its status is `ready`, so in practice the app blocks instead of waiting.

## 3. Data flow and the trust boundary

```
 ON THIS DEVICE (trusted)                                   | CLOUD (untrusted)
                                                            |
 user text + task instruction                               |
        |                                                   |
        v                                                   |
 [1] pattern detector (deterministic, no model)             |
     emails, phones, card numbers (Luhn), IBAN (mod 97),    |
     US SSN, IPv4                                           |
        |                                                   |
        v                                                   |
 [2] on-device entity finder: Gemini Nano via Firebase      |
     AI Logic, ONLY_ON_DEVICE, JSON schema output           |
     names, street addresses, other identifiers             |
     - unavailable / throws / bad JSON / wrong source       |
       -> BLOCKED, nothing is sent                          |
        |                                                   |
        v                                                   |
 [3] redactor: each value -> placeholder like [EMAIL_1];    |
     the vault (placeholder -> value) never leaves memory   |
        |                                                   |
        v                                                   |
 [4] route decision                                         |
     device-only: Nano answers from the original text  -----|-- nothing crosses
     cloud-redacted: continue                               |
        |                                                   |
        v                                                   |
 [5] egress guard: re-scan the payload with [1] and check   |
     every vault value is absent; any hit -> BLOCKED        |
        |                                                   |
        +---- exact payload string ------------------------>| [6] Gemini via Firebase AI Logic,
                                                            |     ONLY_IN_CLOUD, App Check
        +<--- answer with placeholders ---------------------|
        v                                                   |
 [7] restorer: placeholders -> original values              |
        |                                                   |
        v                                                   |
 answer shown to the user                                   |
```

The vault, the original text and the restored answer exist only in page memory.
The app writes none of them to `localStorage`, `sessionStorage`, IndexedDB, cookies or logs.
In live mode the Firebase App Check SDK stores its own App Check token (in a debug build, the debug token) in browser storage; that is not user text.
The app makes no analytics or third-party requests; fonts are bundled.
The only network calls in live mode are the Firebase SDK's own calls (App Check and the AI Logic endpoint).

## 4. The model interface

All model access goes through one interface in `src/core/types.ts`:

```ts
interface ModelClient {
  readonly location: 'device' | 'cloud';
  readonly simulated: boolean;
  readonly label: string;
  status(): Promise<ModelStatus>;
  prepare(onProgress?: (fraction: number) => void): Promise<void>;
  generate(request: GenerateRequest): Promise<GenerateResult>;
}
```

There are three implementations.

- `FirebaseOnDeviceModel` (`src/models/firebase-on-device.ts`): Gemini Nano through Firebase AI Logic with `InferenceMode.ONLY_ON_DEVICE`; `status()` uses `LanguageModel.availability()` from the Prompt API; it reports `ranOn` from `response.inferenceSource`.
- `FirebaseCloudModel` (`src/models/firebase-cloud.ts`): Gemini through Firebase AI Logic with `InferenceMode.ONLY_IN_CLOUD`, App Check initialised first, config read only from `src/firebase-config.ts`.
- `FakeModel` (`src/core/fake-model.ts`): deterministic, no network, `simulated: true`, usable as device or cloud, with failure injection for tests.

The UI shows the label "Simulated" on every result produced by a fake model, and a banner across the page in demo mode.
Simulated output is never presented as model output.

## 5. Routes

- `device-only`: the whole task runs on Gemini Nano with the original text; nothing leaves the device.
- `cloud-redacted`: detection on device, redacted payload to the cloud, restoration on device.

The user picks one of three preferences: "Auto", "Keep on this device", "Use the cloud (redacted)".
Auto picks `device-only` for light tasks (summarize) when Nano is ready and the input is under the on-device budget, and `cloud-redacted` for heavy tasks (rewrite, draft a reply, custom) or long input.
The on-device budget is 12,000 characters, about a third of the documented 9216-token limit, leaving room for the instruction and the answer.

## 6. Failure behaviour

The rule is: if we cannot prove the payload is clean, nothing is sent.

| Situation | Behaviour |
|---|---|
| Nano unavailable, not downloaded, or Chrome without the Prompt API | `cloud-redacted` is blocked; the user sees what the pattern detector found and is told names and addresses cannot be checked without Nano. |
| On-device call throws | Blocked, with the reason. |
| `LanguageModel` is missing from the page | The on-device model is reported unavailable and never called, because the SDK would send the prompt to the cloud (section 2.2). |
| On-device answer is not valid JSON for the schema | Blocked. |
| `inferenceSource` of an on-device call is not `ON_DEVICE` | Every route is blocked, including device-only, and the user is told the text may already have left the device. |
| Egress guard finds a detected value or a pattern hit in the payload, or in a folded copy of it (digits joined across line breaks and separators) | Blocked. |
| Input contains invisible or look-alike characters (zero-width, NBSP, fullwidth digits) | Text and instruction are normalized (NFKC, format characters removed) before any detection; the UI shows the normalized text. |
| Run is clicked twice, or the mode is switched during a run | One run at a time; the mode switch is disabled while a run is in flight. |
| Firebase config is still the placeholder | Live mode is off; the cloud model is not constructed; demo mode is offered. |
| Cloud call fails (network, App Check, quota) | The error is shown without echoing the payload or any vault value. |
| Cloud answer drops or mangles a placeholder | Restoration is tolerant of case and spacing; any placeholder left over is listed. |

Errors shown to the user and thrown inside the app never contain raw input, vault values or the payload.

## 7. What is and is not caught

Caught by the deterministic patterns, after normalization: email addresses (including non-ASCII letters), phone numbers in common North American and international formats, payment card numbers with spaces, dashes or dots that pass the Luhn check, IBANs that pass the mod-97 check, US Social Security numbers in `AAA-GG-SSSS` form with invalid ranges excluded, IPv4 addresses (quoted email local parts and IBANs from any country included). Any other run of 9 or more digits, even inside a URL or an identifier or split across lines, is masked as an ID.
Caught by Gemini Nano, best effort: personal names, street addresses, and other identifiers the model recognises; what it reports in either segment is redacted in both, together with each part of a reported name.
Not guaranteed: names and addresses the on-device model misses (including when text in the input persuades it to report nothing; an empty answer cannot be told apart from a clean text), identifiers with fewer than 9 digits in formats the patterns do not cover (for example a 7-digit local phone number), a value split between the custom instruction and the text, personal data implied by context (for example "my neighbour, the only dentist in town"), and anything inside images or attachments, which are not accepted.
The README and the app say this in plain words.

## 8. Adversarial review

On 2026-11-18 Cursor (grok-4.7-high) reviewed the code read-only, trying to make a personal value reach the cloud, logs, storage or errors.
Its findings and what was done:

- Invisible and look-alike characters (zero-width spaces, NBSP, fullwidth digits, dotted card numbers, non-ASCII email letters) hid values from the patterns: fixed by normalizing input and widening the patterns, with a folded re-scan in the egress guard as a second line.
- A model span that overlapped a pattern hit was dropped whole, so its other part was sent: fixed by redacting the uncovered remainder.
- A race between the Prompt API check and model creation, plus model caching, could build a model with no on-device adapter: fixed by checking again with no `await` before creation and, since the CodeRabbit review on 2026-11-18, by checking the model's on-device adapter before every use, so a cached model is reused only while it has one (reuse lets the SDK destroy each previous Prompt API session); a detector call that reports a cloud run now stops every route.
- A fast double click could start two runs, and the mode could change mid-run: fixed with a synchronous lock and a frozen mode switch.
- A prompt injection that makes Gemini Nano report no entities cannot be detected; model-reported values are now matched case-insensitively and across whitespace, and section 7 states the limit.

The review also checked, and found holding: placeholder injection, cloud error messages, storage, URLs, the clipboard (only on the user's Copy click), and that `ONLY_IN_CLOUD` is the only mode used for the cloud model.

On 2026-11-18 (afternoon) GPT 6.1 Sol through Codex reviewed it again, read-only, running in-memory probes against `runPipeline`; its raw output is kept outside the repository with the build notes.
It found that numbers the patterns claim to catch still leaked in hostile surroundings (an extension after a phone, a card inside a URL or after an underscore, digits split across lines, slashed or doubled separators, user-typed placeholder lookalikes), that quoted email local parts and IBANs from countries missing from the length table were missed, that entities reported around a generated placeholder or in only one segment were not applied, and that short or lowercase name parts were sent.
Fixed with tests: a second-phase catch-all for runs of 9 or more digits, placeholder exemption limited to placeholders the run generated, quoted local parts, IBANs from any country, entity pieces, cross-segment application and relaxed name parts.
It also showed the on-device guard could be bypassed when `window.LanguageModel` and `globalThis.LanguageModel` differ or the AI service has no adapter factory; the wrapper now checks the created model's own adapter.
The privacy suite now has adversarial cases that declare, independently of the detectors, the values that must be absent from the payload (`src/core/adversarial.test.ts`).

## 9. Test plan

- Unit tests for each pattern, including Luhn and mod-97 edge cases and near misses that must not match.
- Redaction and restoration round trips, placeholder collisions with text that already contains `[EMAIL_1]`, repeated values sharing one placeholder, overlapping detections.
- The privacy guarantee: a recording fake cloud model captures the exact `prompt` string it receives; for a corpus of synthetic inputs, no value found by either detector appears in it, including values inside a custom instruction.
- Fail closed: with the on-device detector unavailable, throwing, returning invalid JSON, or reporting a cloud source, the recording cloud model is never called and the outcome is `blocked`.
- The Firebase cloud implementation: `firebase/ai` is mocked and the test asserts the exact arguments passed to `getGenerativeModel` (mode `ONLY_IN_CLOUD`) and to `generateContent`.
- The Firebase on-device implementation: the test asserts mode `ONLY_ON_DEVICE`, maps `IN_CLOUD` to `ranOn: 'cloud'`, refuses when the Prompt API is missing or disappears during the availability check, reuses one model per schema, and drops a model that has no on-device adapter; the router tests assert that a cloud source blocks the run.
- No persistence and no logging: tests spy on `console` and storage during a full run.
- Browser check: Playwright with the bundled Chromium runs the built app in Simulated mode at 1440 and 390 pixels wide (cloud route, device-only route, blocked path), fails on any console error or warning or third-party request, and saves desktop and phone screenshots.
- All personal data in tests and fixtures is synthetic: `example.com`, `.org` and `.net` addresses, reserved or fictional phone numbers (`555-01xx`, the UK drama range), RFC 5737 documentation IPs, published test card and IBAN numbers, and the voided specimen SSN 078-05-1120.

## 10. Configuration

`src/firebase-config.ts` is the single place for the Firebase web config and the reCAPTCHA Enterprise site key.
It ships with placeholder values that the app detects.
The debug App Check token is never stored in the repository; the app sets `self.FIREBASE_APPCHECK_DEBUG_TOKEN = true` only in a development build on `localhost`.
