# PII Router

Use a strong cloud model on text full of personal data, without handing over the personal data.
Gemini Nano finds and removes names, emails, phone numbers, card numbers and more on your device, only the redacted text goes to Gemini in the cloud, and the real values are put back into the answer on your device.
Built with the Firebase AI Logic hybrid inference SDK for #BuildHybridAI 2026 (Web / Chrome).

**Try the simulated demo:** https://bananatruck.github.io/pii-router/
The hosted demo runs in a clearly labelled "Simulated" mode: a deterministic stand-in plays both models, so you can see the whole flow in any browser.
The real hybrid path (Gemini Nano plus Gemini in the cloud through Firebase AI Logic) is in this repository and runs locally once a Firebase project is connected; it is not deployed yet because the Firebase project does not exist yet.
See [Status](#status).

> **Status, plainly:** as of 2026-11-18 the real path has not been run against a live Firebase project or a downloaded Gemini Nano.
> Every screenshot and the hosted demo show the simulated mode; the Firebase AI Logic code is unit-tested with the SDK mocked, and its on-device guard is tested against the real SDK.

All screenshots show the simulated demo mode, as its banner says; they were taken by `pnpm e2e` in Playwright's Chromium.

![PII Router running the sample support email: personal values marked on the device side, placeholders on the cloud side, the restored answer on the device](docs/screenshots/desktop-cloud-run.png)

| A light task stays on the device | Gemini Nano unavailable: nothing is sent | Phone |
|---|---|---|
| ![Summary answered on the device; the cloud column says nothing left this device](docs/screenshots/desktop-device-only.png) | ![The rewrite is blocked because Gemini Nano is unavailable](docs/screenshots/desktop-blocked.png) | ![The same flow at phone width](docs/screenshots/phone-cloud-run.png) |

## The problem

People paste customer emails, patient notes and HR cases into cloud chatbots every day, because the cloud model writes better than anything that runs locally.
Every one of those pastes hands a third party the names, contact details and account numbers of people who never agreed to it.
On-device models fix the privacy problem but not the quality problem: Gemini Nano is good at spotting a name, not at rewriting a long, delicate reply.

## The idea

Let privacy decide where inference runs.
Gemini Nano, running locally through Firebase AI Logic, is the gatekeeper: it reads the raw text, finds the personal details, and swaps them for placeholders such as `[PERSON_1]`.
The cloud model does the heavy writing on the redacted text, and the device restores the real values in its answer.
For light tasks, such as a summary, the whole job stays on Gemini Nano and nothing leaves the device at all.

The screen shows, live and character for character, what stayed on this device and what crossed to the cloud.

## How it works

```mermaid
flowchart LR
  subgraph device["On this device"]
    A[Your text] --> B[Pattern detector<br/>no model]
    B --> C[Gemini Nano<br/>ONLY_ON_DEVICE]
    C --> D[Redactor + in-memory vault]
    D --> E{Route}
    E -->|light task| F[Gemini Nano answers<br/>nothing leaves]
    E -->|heavy task| G[Egress guard<br/>re-scans payload]
    I[Restore real values] --> J[Answer]
  end
  subgraph cloud["Cloud"]
    H[Gemini via Firebase AI Logic<br/>ONLY_IN_CLOUD]
  end
  G -->|redacted text only| H
  H -->|answer with placeholders| I
```

1. The text is normalized (invisible characters removed, look-alike characters folded), then a deterministic pattern detector marks emails, phone numbers, card numbers that pass the Luhn check, IBANs that pass the mod-97 check, US Social Security numbers and IPv4 addresses, with no model involved.
2. Gemini Nano, created with `InferenceMode.ONLY_ON_DEVICE` and a JSON schema, finds names, street addresses and other identifiers.
3. Every value becomes a placeholder; the placeholder-to-value vault lives only in page memory.
4. Auto routing keeps light tasks on the device and sends heavy ones (rewrite, draft a reply, custom) to the cloud in redacted form.
5. Before anything is sent, an egress guard re-scans the exact payload, and a folded copy of it, and checks that no vault value, including digit-only forms, is in it.
6. Gemini in the cloud, created with `InferenceMode.ONLY_IN_CLOUD`, receives only that payload.
7. The device puts the real values back into the answer.

If the app cannot verify the text on the device (Gemini Nano missing, an error, malformed output, or the SDK reporting a cloud run), it **sends nothing** and says why.
The hosted demo has a "Simulate Gemini Nano unavailable" switch so you can see this.

### Why not `PREFER_ON_DEVICE`

The usual hybrid mode, `PREFER_ON_DEVICE`, falls back to the cloud whenever Gemini Nano is missing.
For a privacy tool that fallback is the leak, so raw text only ever goes to a model in `ONLY_ON_DEVICE` mode.

### A finding from reading the SDK source

In the installed SDK (`firebase` 13.4.0, `@firebase/ai` 3.1.0), `getGenerativeModel` creates an on-device adapter only when `(window || self).LanguageModel` is truthy and the AI service has an adapter factory; without one, `callCloudOrDevice` sends the request to the cloud before it checks the mode.
So even `ONLY_ON_DEVICE` sends the prompt to the cloud in Firefox, Safari, or Chrome with the API turned off, although the docs say it should throw.
PII Router checks for the Prompt API and its availability before every on-device call, and `src/models/sdk-fallback.test.ts` demonstrates both the SDK behaviour (with the real SDK and a stubbed `fetch`) and that our wrapper never reaches the network.
Details: [docs/SPEC.md, section 2.2](docs/SPEC.md#22-an-sdk-behaviour-that-contradicts-the-docs-found-by-reading-the-source).

## What it catches and what it can miss

Caught by deterministic patterns, with no model, after removing invisible characters and folding look-alikes: email addresses, phone numbers in common North American and international formats, payment card numbers that pass the Luhn check, IBANs that pass the mod-97 check, US Social Security numbers in `AAA-GG-SSSS` form, and IPv4 addresses; any other run of 9 or more digits, even inside a URL or split across lines, is masked as an ID.
Caught by Gemini Nano, best effort: personal names (and later uses of their first or last name alone), street addresses, and other identifiers the model recognises.
Can be missed: names and addresses Gemini Nano does not recognise (including names or addresses split between the custom instruction and text, or when text in the input talks it into reporting nothing), unseparated 7-digit local phone numbers such as 5550123, short identifiers under 9 digits that are not phone numbers (such as a 6-digit employee ID), personal details implied by context ("my neighbour, the only dentist in town"), and anything in images or attachments, which the app does not accept.
Treat PII Router as a strong filter, not a guarantee of anonymity.

## Adversarial review

Before publishing, a second model (Cursor with grok-4.7-high) reviewed the code with one job: make a personal value reach the cloud, logs, storage or an error message.
It found four real ways, all fixed with tests: invisible and look-alike characters that hid values from the patterns, a model span that lost an overlap and was dropped whole, a race that could build an on-device model without its on-device adapter, and a double click that could start two runs.
A second review by GPT 6.1 Sol (through Codex) found more: numbers hidden by their surroundings (inside URLs, after an extension, split across lines), quoted emails, IBANs from countries the table lacked, model findings that were not applied everywhere, and two more ways the on-device adapter could be missing; those are fixed with tests as well.
The full list, including what it checked and found safe, is in [docs/SPEC.md, section 8](docs/SPEC.md#8-adversarial-review).

## Status

| Part | State |
|---|---|
| Pattern detector, redaction, restore, egress guard, routing | Done and tested (unit and privacy tests) |
| Simulated demo mode | Done, tested in a browser, deployed to GitHub Pages |
| Firebase AI Logic on-device and cloud clients | Written against the official docs and the installed SDK types; tested with the SDK mocked, and the fallback guard tested against the real SDK |
| Real run with a Firebase project and Gemini Nano | Not yet verified: the Firebase project does not exist yet, and the build machine cannot download Gemini Nano (it needs 22 GB of free disk). Steps: [submission/SETUP_FOR_KESH.md](submission/SETUP_FOR_KESH.md) |

## Run it locally

Requirements: Node 22.18 or later (or Node 24 LTS), because `pnpm verify:setup` runs a TypeScript file directly, and pnpm.

```sh
pnpm install
pnpm dev
```

Open `http://localhost:5173`.
With the placeholder config the app starts in Simulated mode.

To use the real models, follow [submission/SETUP_FOR_KESH.md](submission/SETUP_FOR_KESH.md) and run `pnpm verify:setup` to check the pasted config offline: create a Firebase project with Firebase AI Logic (Gemini Developer API), paste the web config into `src/firebase-config.ts`, register the App Check debug token, and enable Gemini Nano in desktop Chrome 139 or later.

## Checks

```sh
pnpm exec playwright install chromium   # once, on a fresh machine, for the browser checks
pnpm check   # lint, type-check, unit tests, production build
pnpm e2e     # builds, serves and drives the app in the bundled Chromium, saves screenshots
pnpm record:demo --mode simulated   # records the captioned demo video (docs/RECORDING.md)
```

The privacy tests (`src/core/privacy.test.ts`) run 28 synthetic inputs through every task and assert on the exact string the cloud model received.
The adversarial tests (`src/core/adversarial.test.ts`) declare, for hostile inputs, the values that must be absent from that string, independently of what the detectors found.
All personal data in this repository is synthetic: `example.com`, `.org` and `.net` addresses, reserved or fictional phone numbers (mostly the `555-01xx` range, plus the UK drama range 020 7946 0xxx), RFC 5737 documentation IP addresses, published test card and IBAN numbers, and the voided specimen SSN 078-05-1120.

## Project layout

```
src/core/            engine: patterns, redaction, guard, routing, fake model (no Firebase, no React)
src/models/          Firebase AI Logic clients: on-device (ONLY_ON_DEVICE) and cloud (ONLY_IN_CLOUD)
src/firebase-config.ts  the one file to edit to connect a Firebase project
src/ui/              the app
src/components/vendor/  MIT components from Magic UI
docs/SPEC.md         the specification: rules as read, data flow, failure behaviour, test plan
submission/          setup guide, Devpost text, video script, checklist
```

## How this was built

This project was built overnight by AI coding agents directed by Kesh.
Claude Code (Opus 5.5) led: it read the rules and the Firebase and Chrome docs, wrote the specification, split the work, reviewed every change and integrated it.
GPT 6.1 Sol (through Codex) wrote the redaction engine and its tests; Gemini 4 Argon (through Antigravity) made the mock-ups and wrote the Firebase integration layer and the first version of the UI; Cursor (grok-4.7-high) ran an adversarial privacy review, and Cursor (composer-2.5) fixed most of its findings, split the UI into components and fixed some patterns.
The commit messages say which agent wrote what.
Third-party code is listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## License

[Apache License 2.0](LICENSE).
