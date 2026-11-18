# Demo video script

Limit from the rules: "It should not be longer than 3 minutes. If it is longer than 3 minutes, only the first 3 minutes may be evaluated."
Target length: 2 minutes 40 seconds, which leaves 20 seconds of margin.
The video must be public on YouTube and in English (or have English subtitles), and must show the project working on its platform, so record it in desktop Chrome with Gemini Nano ready and the real Firebase project connected (see `SETUP_FOR_KESH.md`).
Record the real run, not the simulated demo; if any shot uses the demo mode, the yellow "Simulated" banner must be visible in that shot and the narration must say so.
Use only the synthetic sample texts built into the app; never show real personal data.
Do not show the App Check debug token or the Firebase console's API key area.

## Shot list

| Time | On screen | Narration |
|---|---|---|
| 0:00-0:15 | The app in Chrome, header pills reading "Gemini Nano: ready", "Firebase: connected", "Live". | "People paste customer emails, patient notes and HR cases into cloud chatbots every day. The model is great; handing over the names, emails and card numbers is not. PII Router fixes that with Firebase AI Logic's hybrid inference." |
| 0:15-0:35 | Click "Use sample". The support email appears; amber marks appear on the email address, phone number and card number as the text loads. | "The moment text lands, a deterministic detector on this device marks emails, phone numbers, card numbers that pass the Luhn check, IBANs and more. No model is needed for those, so this part can't be talked out of it." |
| 0:35-1:05 | Pick "Rewrite to sound professional", leave "Auto", click "Run". The step strip lights up: Patterns, Gemini Nano, Redact, Guard on the device side; the beam crosses the boundary; Cloud on the right. | "Then Gemini Nano, running on this laptop through Firebase AI Logic in ONLY_ON_DEVICE mode, finds what patterns can't: names and street addresses. Everything it finds becomes a placeholder. A guard re-scans the payload, and only then does the request cross to Gemini in the cloud, in ONLY_IN_CLOUD mode." |
| 1:05-1:25 | Zoom on the right pane: the exact payload with `[PERSON_1]`, `[EMAIL_1]`, `[PHONE_1]`, `[CARD_1]`. Then DevTools > Network, the `generateContent` request body showing the same placeholders. | "This pane is the exact string that left the device, character for character. Here it is in the network tab: placeholders, no personal data." |
| 1:25-1:45 | The answer panel: the cloud's reply with placeholders resolves into the restored text, the real name and email fading back in. | "The cloud writes the polished reply around the placeholders, and the device puts the real values back. The cloud never saw them." |
| 1:45-2:05 | Switch the task to "Summarize", click "Run". The right pane reads "Nothing left this device"; the Network tab stays empty. | "For light work, Auto keeps the whole task on Gemini Nano. Where the work runs is decided by what the text contains and how heavy the task is." |
| 2:05-2:30 | Show the fail-closed state recorded earlier with Gemini Nano disabled: the red "Blocked" message and an empty Network tab. | "Here's the important part. The common hybrid mode, PREFER_ON_DEVICE, silently falls back to the cloud. And reading the SDK source, I found that even ONLY_ON_DEVICE goes to the cloud when the browser has no Prompt API at all. So PII Router checks first, and when it can't verify the text on the device, it sends nothing and tells you why." |
| 2:30-2:40 | The "What it catches / What it can miss" section, then the repo URL. | "It's honest about its limits, it's open source under Apache 2.0, and every privacy claim is backed by a test on the exact outbound payload." |

## Recording notes

- Before recording, run `submission/SETUP_FOR_KESH.md` step 6 once so Gemini Nano is downloaded and the debug token is registered.
- For the 2:05 shot, record it separately: set `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` to Default, restart Chrome, run the rewrite, then turn the flag back on.
- Add English captions in YouTube Studio (auto-captions plus a quick correction pass is enough).
- Title suggestion: "PII Router: Gemini Nano redacts on-device, Gemini in the cloud does the heavy lifting (#BuildHybridAI)".
