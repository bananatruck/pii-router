// Browser check for the built app. Run with `pnpm e2e` (which builds first).
//
// Serves dist/ with `vite preview`, drives it in Playwright's bundled Chromium at desktop and
// phone width in Simulated mode, and fails on any console error, page error, failed assertion,
// or request to a host other than localhost. Saves screenshots to docs/screenshots/.
//
// All text used here is the app's own synthetic sample data.
// On a fresh machine, install the browser once first: pnpm exec playwright install chromium

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4173;
// Set E2E_BASE_URL to check a deployed copy (for example the GitHub Pages site) instead of a local build.
const REMOTE = process.env.E2E_BASE_URL;
// Relative files such as the notices resolve against BASE, so it must end in a slash.
const BASE = (REMOTE ?? `http://localhost:${PORT}/`).replace(/\/?$/, '/');
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', new URL(BASE).hostname]);
const SHOTS = new URL('../docs/screenshots/', import.meta.url);

const SAMPLE_VALUES = ['Dana Whitfield', 'dana.whitfield@example.com', '(312) 555-0142', '4111 1111 1111 1111'];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'phone', width: 390, height: 844 },
];

function fail(message) {
  throw new Error(`e2e: ${message}`);
}

/** For a deployed copy: poll until it answers, each request bounded by the time left. */
async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())) });
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`server at ${url} did not start`);
}

/**
 * Starts `vite preview` and resolves only when that process itself reports it is serving, so a
 * different server already on the port can never be tested by mistake (CodeRabbit review).
 */
function startPreview(timeoutMs) {
  const child = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const ready = new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`e2e: vite preview did not start within ${timeoutMs} ms`)), timeoutMs);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes(`localhost:${PORT}`)) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`e2e: vite preview exited (code ${code}) before serving; is port ${PORT} in use?\n${output.trim()}`));
    });
  });
  return { child, ready };
}

async function loadSample(page, label) {
  await page.getByRole('button', { name: 'Use sample' }).click();
  await page.getByRole('menuitem', { name: label }).click();
}

async function run(page) {
  await page.getByRole('button', { name: 'Run', exact: true }).click();
}

async function checkViewport(browser, viewport) {
  const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
  const page = await context.newPage();
  const problems = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') problems.push(`console ${msg.type()}: ${msg.text()}`);
  });
  page.on('pageerror', (err) => problems.push(`page error: ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`failed request: ${req.url()} (${req.failure()?.errorText ?? 'unknown'})`));
  page.on('response', (res) => {
    if (res.status() >= 400) problems.push(`HTTP ${res.status()}: ${res.url()}`);
  });
  page.on('request', (req) => {
    const host = new URL(req.url()).hostname;
    if (!ALLOWED_HOSTS.has(host)) problems.push(`third-party request: ${req.url()}`);
  });

  await page.goto(BASE);
  await page.getByTestId('simulated-banner').waitFor();
  const banner = await page.getByTestId('simulated-banner').innerText();
  if (!banner.includes('Simulated demo. No model is running')) fail(`${viewport.name}: banner text is wrong`);
  if (!(await page.getByTestId('status-mode').innerText()).includes('Simulated')) fail(`${viewport.name}: mode pill`);

  // Heavy task: redacted payload crosses to the (simulated) cloud.
  await loadSample(page, 'Support email');
  await page.getByLabel('Task').selectOption('rewrite');
  await page.getByRole('button', { name: 'Auto' }).click();
  await run(page);
  await page.getByTestId('restored-answer').waitFor({ timeout: 15000 });
  const payload = await page.getByTestId('outbound-payload').innerText();
  for (const value of SAMPLE_VALUES) {
    if (payload.includes(value)) fail(`${viewport.name}: payload contains a sample value`);
  }
  if (!payload.includes('[PERSON_1]') || !payload.includes('[EMAIL_1]')) fail(`${viewport.name}: payload lacks placeholders`);
  if (!(await page.getByTestId('egress-guard-status').innerText()).includes('Egress guard passed')) {
    fail(`${viewport.name}: egress guard status`);
  }
  await page.waitForTimeout(2500); // let the reveal animations finish before the screenshot
  // The simulated label must stay on screen wherever output is shown, including after scrolling.
  await page.getByTestId('restored-answer').scrollIntoViewIfNeeded();
  const bannerBox = await page.getByTestId('simulated-banner').boundingBox();
  if (!bannerBox || bannerBox.y < 0 || bannerBox.y > 5) fail(`${viewport.name}: simulated banner scrolled out of view`);
  // Read only what is visible: the reveal animation keeps a screen-reader copy of the final text,
  // so wait until the visible layer itself shows the restored name (CodeRabbit review).
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="restored-answer"]')?.cloneNode(true);
    if (!node) return false;
    node.querySelectorAll('.sr-only').forEach((el) => el.remove());
    return node.textContent.includes('Dana Whitfield');
  }, null, { timeout: 15000 });
  const answer = await page.getByTestId('restored-answer').innerText();
  if (!answer.includes('Dana Whitfield')) fail(`${viewport.name}: restored answer lacks the restored name`);
  if (!REMOTE) await page.screenshot({ path: new URL(`${viewport.name}-cloud-run.png`, SHOTS).pathname, fullPage: true });

  // Light task: Auto keeps everything on the device.
  await page.getByLabel('Task').selectOption('summarize');
  await run(page);
  await page.getByTestId('cloud-device-only-panel').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  if (!REMOTE) await page.screenshot({ path: new URL(`${viewport.name}-device-only.png`, SHOTS).pathname, fullPage: true });

  // Fail closed: with Gemini Nano unavailable, a heavy task is blocked and nothing is sent.
  await page.getByTestId('simulate-nano-unavailable').check();
  await page.getByLabel('Task').selectOption('rewrite');
  await run(page);
  await page.getByTestId('outcome-blocked').waitFor({ timeout: 15000 });
  if (!(await page.getByTestId('cloud-blocked-panel').innerText()).includes('Nothing was sent.')) {
    fail(`${viewport.name}: blocked state does not say nothing was sent`);
  }
  if ((await page.getByTestId('outbound-payload').count()) !== 0) fail(`${viewport.name}: a payload is shown while blocked`);
  if (!(await page.getByTestId('status-nano').innerText()).includes('unavailable')) fail(`${viewport.name}: Nano pill`);
  if (!REMOTE) await page.screenshot({ path: new URL(`${viewport.name}-blocked.png`, SHOTS).pathname, fullPage: true });
  await page.getByTestId('simulate-nano-unavailable').uncheck();

  // No horizontal page scroll at this width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(`${viewport.name}: page scrolls horizontally by ${overflow}px`);

  await context.close();
  if (problems.length > 0) fail(`${viewport.name}:\n  ${problems.join('\n  ')}`);
  return `${viewport.name}: ok`;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const preview = REMOTE ? null : startPreview(20000);
  let exitCode = 0;
  let browser = null;
  try {
    if (preview) await preview.ready;
    else await waitForServer(BASE, 20000);
    // The bundled MIT components require their notices in every copy, so the site ships them.
    for (const file of ['THIRD_PARTY_NOTICES.md', 'LICENSE.txt']) {
      const res = await fetch(new URL(file, BASE), { signal: AbortSignal.timeout(10000) });
      const body = res.ok ? await res.text() : '';
      if (!res.ok || !/License|Licence/.test(body)) fail(`${file} is not served with the site`);
    }
    browser = await chromium.launch();
    for (const viewport of VIEWPORTS) {
      process.stdout.write(`${await checkViewport(browser, viewport)}\n`);
    }
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    exitCode = 1;
  } finally {
    try {
      await browser?.close();
    } finally {
      preview?.child.kill('SIGTERM');
    }
  }
  process.exit(exitCode);
}

await main();
