// Browser check for the built app. Run with `pnpm e2e` (which builds first).
//
// Serves dist/ with `vite preview`, drives it in Playwright's bundled Chromium at desktop and
// phone width in Simulated mode, and fails on any console error, page error, failed assertion,
// or request to a host other than localhost. Saves screenshots to docs/screenshots/.
//
// All text used here is the app's own synthetic sample data.

import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from '@playwright/test';

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const SHOTS = new URL('../docs/screenshots/', import.meta.url);

const SAMPLE_VALUES = ['Dana Whitfield', 'dana.whitfield@example.com', '(312) 555-0142', '4111 1111 1111 1111'];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 960 },
  { name: 'phone', width: 390, height: 844 },
];

function fail(message) {
  throw new Error(`e2e: ${message}`);
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  fail(`server at ${url} did not start`);
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
  page.on('request', (req) => {
    const host = new URL(req.url()).hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') problems.push(`third-party request: ${req.url()}`);
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
  const answer = await page.getByTestId('restored-answer').innerText();
  if (!answer.includes('Dana Whitfield')) fail(`${viewport.name}: restored answer lacks the restored name`);
  await page.screenshot({ path: new URL(`${viewport.name}-cloud-run.png`, SHOTS).pathname, fullPage: true });

  // Light task: Auto keeps everything on the device.
  await page.getByLabel('Task').selectOption('summarize');
  await run(page);
  await page.getByTestId('cloud-device-only-panel').waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: new URL(`${viewport.name}-device-only.png`, SHOTS).pathname, fullPage: true });

  // No horizontal page scroll at this width.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 0) fail(`${viewport.name}: page scrolls horizontally by ${overflow}px`);

  await context.close();
  if (problems.length > 0) fail(`${viewport.name}:\n  ${problems.join('\n  ')}`);
  return `${viewport.name}: ok`;
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  const server = spawn('pnpm', ['exec', 'vite', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  let exitCode = 0;
  const browser = await chromium.launch();
  try {
    await waitForServer(BASE, 20000);
    for (const viewport of VIEWPORTS) {
      process.stdout.write(`${await checkViewport(browser, viewport)}\n`);
    }
  } catch (err) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    exitCode = 1;
  } finally {
    await browser.close();
    server.kill('SIGTERM');
  }
  process.exit(exitCode);
}

await main();
