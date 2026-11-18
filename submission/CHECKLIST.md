# Submission checklist for Kesh

Deadline: Nov 30, 2026 at 2:00 pm PST (rules section 4).
Everything not listed here was done overnight; the repository, the demo site, the docs and the drafted form text are ready.
Each step names the rule that drives it, quoted from https://firebasehybridaihackathon.devpost.com/rules (read 2026-11-17).

## Left for you

- [ ] **Firebase project, real run (about 30 minutes).** Start with `pnpm verify:setup`, then follow `submission/SETUP_FOR_KESH.md` steps 1 to 6, commit the filled-in `src/firebase-config.ts`, and push.
  Rule: the repository "must demonstrate the use of Firebase AI Logic at runtime in your code - imported and actually called"; the code already does this, and the real run proves it works.
  Rule: "Firebase AI Logic requires App Check; debug tokens are accepted in submissions."
  Do not commit the debug token: "Entrants must not include production API keys, live Google Cloud project secrets ... within their repository".
- [ ] **Record what the real run showed.** In `submission/DEVPOST.md`, replace each `[VERIFY AFTER REAL RUN]` marker with what you saw, or delete the sentence if it did not hold.
  Rule: "must function as depicted in the video and/or expressed in the text description".
- [ ] **Confirm your voice.** In `submission/DEVPOST.md`, two first-person sentences are marked `[KESH TO CONFIRM]`; keep, reword or delete them, then remove the markers.
- [ ] **Video (3 minutes or less).** Submit a take of the real run, not `submission/video/demo-simulated-take.mp4`: that file (local, gitignored, about 1:49, captions burned in plus `demo-simulated-take.srt`) shows only the simulated demo and exists to check the flow and the captions. After the real setup, re-record with `pnpm record:demo --mode live` (`docs/RECORDING.md`) or by hand following `submission/VIDEO_SCRIPT.md`, upload to YouTube as Public, add English captions, and paste the link in the form.
  Rule: "It should not be longer than 3 minutes", "uploaded to and made publicly visible on YouTube", "in English or include English subtitles", and it "should include footage that shows the Project functioning on the platform(s) for which it was built".
  Rule: the video must not contain "any third party advertising, slogan, logo, trademark"; record the app and Chrome only, with no other branded tabs or bookmarks visible.
- [ ] **Register and submit on Devpost.** Join the hackathon at https://firebasehybridaihackathon.devpost.com/, then create the project and paste the fields from `submission/DEVPOST.md`.
  Rule: "You must have a Devpost account to register"; select at least one platform (select Web).
- [ ] **Eligibility statement.** You confirm in the form that you are above the age of majority and not a resident of an excluded place (rules section 3).
- [ ] **Final push before the deadline.** "Commits pushed to the code repository after the Submission Period ends will not be evaluated."

## Already done, worth a glance

- [x] Public repository `bananatruck/pii-router` with the Apache-2.0 license in `LICENSE`.
  Rule: "The repository must be public and open source by including an open source license file ... visible at the top of the repository page (in the About section). Although Apache is preferred, any open source license can be used."
  Check that GitHub shows "Apache-2.0 license" in the About sidebar.
- [x] Hosted demo on GitHub Pages in the labelled simulated mode.
  Rule: "A hosted project is highly encouraged"; the project must be "available free of charge and without any restriction" to judges until judging ends; keep the site up until after Dec 16, 2026.
- [x] No personal data in the repository: every name, email, phone, card, IBAN and SSN in the code and docs is synthetic (`example.com`, `.org` and `.net` addresses, reserved or fictional phone numbers such as `555-01xx` and the UK drama range, RFC 5737 documentation IPs, published test card and IBAN examples, the voided specimen SSN 078-05-1120).
  Rule: entrants "must not include ... personally identifiable information (PII) within their repository, submission form, or testing instructions."
- [x] Third-party code is listed with licenses in `THIRD_PARTY_NOTICES.md`.
  Rule: "Participants may use standard development tools, including frameworks, libraries, starter templates, and AI coding assistants, but must disclose any other pre-existing code or work incorporated into the Project."

## Disclosure of AI coding assistance

The rules list "AI coding assistants" as allowed standard tools.
The honest description, already in `DEVPOST.md` and the README: this project was built overnight by AI coding agents directed by Kesh.
Claude Code (Opus 5.5) led the work, designed it and integrated it; GPT 6.1 Sol through Codex wrote the redaction engine and its tests; Gemini 4 Argon through Antigravity made the mock-ups and wrote the Firebase integration layer and the first version of the UI; Cursor (grok-4.7-high) ran an adversarial privacy review, and Cursor (composer-2.5) fixed most of its findings, split the UI into components and fixed some patterns.
Keep that wording, or make it more specific, but do not make it vaguer.
The rules also require that the submission is "the result of the Entrant's ideas and creativity"; the idea and the direction are yours, and the disclosure says plainly how the code was produced.

## Decisions you may want to revisit

- Web app rather than Chrome extension: reasons in `docs/SPEC.md` section 1.5.
- Aceternity UI's licence page says "You cannot re-distribute the Item as a stock image or its source files, regardless of modifications" while allowing use in "end products", including freely distributed ones.
  A public repository contains the component's source as part of the app, which I read as end-product use, but it is a judgment call; `THIRD_PARTY_NOTICES.md` names the file so it can be swapped out if you disagree.
- React Bits is "MIT + Commons Clause", which allows use "as part of an application, website, or product" but not selling the component itself; the notice is included.
