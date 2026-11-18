// Real-browser repro of docs/SPEC.md section 2.2 in the bundled Chromium.
// An init script removes window.LanguageModel before any page code runs, which is the situation in
// Firefox, Safari, or Chrome with the Prompt API off; it also guarantees no on-device session or
// model download is ever started.
// Starts the Vite dev server, opens e2e/sdk-probe.html, aborts every request to a Google host and
// records it. Expected: the raw SDK in ONLY_ON_DEVICE mode tries to send the prompt to the cloud;
// FirebaseOnDeviceModel sends nothing. Run with `pnpm e2e:sdk`.

import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';

const PORT = 5181;
const URL_ = `http://localhost:${PORT}/e2e/sdk-probe.html`;
const PROMPT_MARKER = 'SYNTHETIC-PROBE';

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server at ${url} did not start`);
}

const server = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], { stdio: ['ignore', 'ignore', 'inherit'] });
const browser = await chromium.launch();
let exitCode = 0;
try {
  await waitForServer(URL_, 30000);
  const page = await browser.newPage();
  await page.addInitScript(() => {
    delete window.LanguageModel;
  });
  const attempts = [];
  await page.route(/googleapis\.com|google\.com|gstatic\.com/, async (route) => {
    const req = route.request();
    attempts.push({ at: Date.now(), url: req.url(), carriesPrompt: (req.postData() ?? '').includes(PROMPT_MARKER) });
    await route.abort();
  });
  await page.goto(URL_);
  const result = await page.evaluate(() => window.__probe);
  const sdkAttempts = attempts.filter((a) => a.at <= result.afterSdk);
  const guardedAttempts = attempts.filter((a) => a.at > result.afterSdk);
  const report = {
    browser: browser.version(),
    languageModelPresent: result.languageModelPresent,
    sdkOnlyOnDevice: result.sdk,
    sdkRequestsCarryingPrompt: sdkAttempts.filter((a) => a.carriesPrompt).map((a) => new URL(a.url).host),
    guardedModel: result.guarded,
    guardedRequests: guardedAttempts.length,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.languageModelPresent) throw new Error('this browser has the Prompt API; the probe needs one without it');
  if (report.sdkRequestsCarryingPrompt.length === 0) throw new Error('the SDK did not try to send the prompt; SPEC 2.2 may no longer hold');
  if (report.guardedRequests !== 0 || report.guardedModel !== 'threw device-unavailable') throw new Error('the guarded model reached the network');
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  exitCode = 1;
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
process.exit(exitCode);
