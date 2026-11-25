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

/**
 * Starts the Vite dev server and resolves only when that process itself reports it is serving, so
 * an older server already on the port can never be probed by mistake. `exit` is null until the
 * server's exit is observed, then `{ code, signal }` (a signal leaves `code` null), and fails
 * the probe.
 */
function startServer(timeoutMs) {
  const child = spawn('pnpm', ['exec', 'vite', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const state = { child, exit: null };
  state.ready = new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`vite did not start within ${timeoutMs} ms`)), timeoutMs);
    child.stdout.on('data', (chunk) => {
      output += chunk.toString();
      // Vite colours its output when FORCE_COLOR or CI is set, with escapes inside the URL.
      if (output.replace(/\x1b\[[0-9;]*m/g, '').includes(`localhost:${PORT}`)) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code, signal) => {
      state.exit = { code, signal };
      clearTimeout(timer);
      reject(new Error(`vite exited (code ${code}, signal ${signal}) before serving; is port ${PORT} in use?\n${output.trim()}`));
    });
  });
  // Handled through `ready` and `exit`; avoid an unhandled rejection after a successful start.
  state.ready.catch(() => {});
  return state;
}

const server = startServer(30000);
let browser = null;
let exitCode = 0;
try {
  await server.ready;
  browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(() => {
    delete window.LanguageModel;
  });
  const attempts = [];
  let phase = 'setup';
  await page.route(/googleapis\.com|google\.com|gstatic\.com/, async (route) => {
    const req = route.request();
    attempts.push({ phase, url: req.url(), carriesPrompt: (req.postData() ?? '').includes(PROMPT_MARKER) });
    await route.abort();
  });
  await page.goto(URL_);
  await page.waitForFunction(() => Boolean(window.__probe));
  const languageModelPresent = await page.evaluate(() => window.__probe.languageModelPresent());
  phase = 'sdk';
  const sdkOutcome = await page.evaluate(() => window.__probe.runSdk());
  phase = 'guarded';
  const guardedOutcome = await page.evaluate(() => window.__probe.runGuarded());
  phase = 'done';
  const report = {
    browser: browser.version(),
    languageModelPresent,
    sdkOnlyOnDevice: sdkOutcome,
    sdkRequestsCarryingPrompt: attempts.filter((a) => a.phase === 'sdk' && a.carriesPrompt).map((a) => new URL(a.url).host),
    guardedModel: guardedOutcome,
    guardedRequests: attempts.filter((a) => a.phase === 'guarded').length,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (server.exit !== null) {
    throw new Error(`the probe's own vite server exited (code ${server.exit.code}, signal ${server.exit.signal}) during the probe`);
  }
  if (report.languageModelPresent) throw new Error('this browser has the Prompt API; the probe needs one without it');
  if (report.sdkRequestsCarryingPrompt.length === 0) throw new Error('the SDK did not try to send the prompt; SPEC 2.2 may no longer hold');
  if (report.guardedRequests !== 0 || report.guardedModel !== 'threw device-unavailable') throw new Error('the guarded model reached the network');
} catch (err) {
  process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
  exitCode = 1;
} finally {
  try {
    await browser?.close();
  } finally {
    server.child.kill('SIGTERM');
  }
}
process.exit(exitCode);
