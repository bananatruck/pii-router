// Records the demo video for the #BuildHybridAI submission (docs/RECORDING.md explains it).
//
//   node scripts/record-demo.mjs --url https://bananatruck.github.io/pii-router/ --mode simulated
//   node scripts/record-demo.mjs --url http://localhost:5173/ --mode live \
//     --executable <path to Chrome> --profile <Chrome profile dir with Gemini Nano>   (after the real setup)
//
// Walks the page through submission/VIDEO_SCRIPT.md with human-paced pauses and records it with
// Playwright's Chromium at 1920x900. ffmpeg pads it to 1920x1080 with a caption band at the bottom,
// so captions never cover the app, burns in English captions timed to what actually happened, and
// encodes H.264. The same captions are written as .srt for YouTube. There is no voice track.
// Output goes to submission/video/ (gitignored): demo-<mode>-take.{srt,mp4}.

import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT_SECONDS = 180; // rules: "It should not be longer than 3 minutes."
const TARGET_MAX_SECONDS = 165; // keep a margin under the limit
const PAGE = { width: 1920, height: 900 }; // recorded page area
const FRAME = { width: 1920, height: 1080 }; // final video; the bottom 180 px hold the captions

function parseArgs(argv) {
  const args = {
    url: 'https://bananatruck.github.io/pii-router/',
    mode: 'simulated',
    out: 'submission/video',
    executable: '',
    profile: '',
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!key || !(key in args) || argv[i + 1] === undefined) {
      throw new Error('usage: node scripts/record-demo.mjs --url <url> --mode simulated|live [--out <dir>] [--executable <chrome>] [--profile <dir>]');
    }
    args[key] = argv[i + 1];
  }
  if (args.mode !== 'simulated' && args.mode !== 'live') throw new Error('--mode must be simulated or live');
  return args;
}

/**
 * Captions per scene. In simulated mode they say so, because the take must not present stand-in
 * output as model output. Live captions follow submission/VIDEO_SCRIPT.md for the real run.
 */
const CAPTIONS = {
  intro: {
    simulated: [
      'PII Router, for #BuildHybridAI. This take shows the public demo in its labelled Simulated mode: a stand-in plays both models, so no model output appears here.',
      'People paste customer emails and patient notes into cloud chatbots. PII Router lets a cloud model help without receiving the names, emails and card numbers.',
    ],
    live: [
      'People paste customer emails, patient notes and HR cases into cloud chatbots. The model is great; handing over the names, emails and card numbers is not.',
      'PII Router fixes that with Firebase AI Logic hybrid inference: Gemini Nano on this laptop, Gemini in the cloud.',
    ],
  },
  sample: {
    simulated: [
      'Load a sample. A deterministic detector on the device marks emails, phone numbers, Luhn-valid card numbers, IBANs and other long numbers at once, with no model involved.',
    ],
    live: [
      'The moment text lands, a deterministic detector on this device marks emails, phone numbers, Luhn-valid card numbers, IBANs and more. No model is needed for those.',
    ],
  },
  run: {
    simulated: [
      'Rewrite to sound professional, route Auto, Run. In the real app Gemini Nano finds names and addresses through Firebase AI Logic in ONLY_ON_DEVICE mode; here the stand-in plays that part.',
      'Every value becomes a placeholder. An egress guard re-scans the exact payload before anything crosses to the cloud model, which runs in ONLY_IN_CLOUD mode.',
    ],
    live: [
      'Gemini Nano, running on this laptop through Firebase AI Logic in ONLY_ON_DEVICE mode, finds what patterns cannot: names and street addresses.',
      'Every value becomes a placeholder. A guard re-scans the payload, and only then does the request cross to Gemini in the cloud, in ONLY_IN_CLOUD mode.',
    ],
  },
  payload: {
    simulated: ['This pane is the exact string handed to the cloud call: placeholders only. The in-memory vault on the left never leaves the page.'],
    live: ['This pane is the exact string that left the device, character for character: placeholders, no personal data.'],
  },
  answer: {
    simulated: ['The reply comes back with placeholders, and the device puts the real values back. They were never in the payload.'],
    live: ['The cloud writes the reply around the placeholders, and the device puts the real values back. The cloud never saw them.'],
  },
  summary: {
    simulated: ['A light task such as a summary stays on the device under Auto: nothing crosses the boundary.'],
    live: ['For light work, Auto keeps the whole task on Gemini Nano: nothing crosses the boundary.'],
  },
  blocked: {
    simulated: [
      'If the text cannot be checked on the device, nothing is sent. Here the demo simulates Gemini Nano being unavailable, and the rewrite is blocked.',
      'Reading the SDK source showed that even ONLY_ON_DEVICE falls back to the cloud when the browser has no Prompt API, so PII Router checks for the on-device adapter before every call.',
    ],
    live: [],
  },
  outro: {
    simulated: ['It is plain about its limits. Open source under Apache 2.0, with tests on the exact outbound payload: github.com/bananatruck/pii-router'],
    live: ['It is plain about its limits. Open source under Apache 2.0, with tests on the exact outbound payload: github.com/bananatruck/pii-router'],
  },
};

/** Seconds a caption stays up: long enough to read at about 15 characters a second. */
const readSeconds = (text) => Math.max(3.5, text.length / 15);

// A visible pointer, because Playwright's video does not draw the system cursor.
const CURSOR_SCRIPT = `
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;z-index:2147483647;width:22px;height:22px;margin:-11px 0 0 -11px;' +
      'border-radius:50%;border:3px solid #18202B;background:rgba(244,192,78,.55);pointer-events:none;' +
      'left:-50px;top:-50px;transition:transform .12s';
    document.body.appendChild(dot);
    addEventListener('mousemove', e => { dot.style.left = e.clientX + 'px'; dot.style.top = e.clientY + 'px'; });
    addEventListener('mousedown', () => { dot.style.transform = 'scale(.7)'; });
    addEventListener('mouseup', () => { dot.style.transform = 'scale(1)'; });
  });`;

async function point(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) throw new Error('element not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await page.waitForTimeout(350);
}

async function click(page, locator) {
  await point(page, locator);
  await page.mouse.down();
  await page.waitForTimeout(90);
  await page.mouse.up();
  await page.waitForTimeout(400);
}

async function select(page, value) {
  const task = page.getByLabel('Task');
  await point(page, task);
  await task.selectOption(value);
  await page.waitForTimeout(600);
}

async function smoothScrollTo(page, locator, block = 'center') {
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await page.waitForTimeout(1200);
}

async function scrollToTop(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
  await page.waitForTimeout(1000);
}

async function scrollToBottom(page) {
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }));
  await page.waitForTimeout(1400);
}

function scenes(mode) {
  const list = [
    { id: 'intro', action: async (page) => { await page.waitForTimeout(800); } },
    {
      id: 'sample',
      action: async (page) => {
        await click(page, page.getByRole('button', { name: 'Use sample' }));
        await click(page, page.getByRole('menuitem', { name: 'HR note' }));
        await page.waitForTimeout(900);
        await click(page, page.getByRole('button', { name: 'Use sample' }));
        await click(page, page.getByRole('menuitem', { name: 'Support email' }));
      },
    },
    {
      id: 'run',
      action: async (page) => {
        await select(page, 'rewrite');
        await click(page, page.getByRole('button', { name: 'Auto' }));
        await click(page, page.getByRole('button', { name: 'Run', exact: true }));
        await page.getByTestId('restored-answer').waitFor({ timeout: 60000 });
        await smoothScrollTo(page, page.getByTestId('step-strip'));
      },
    },
    { id: 'payload', action: async (page) => { await smoothScrollTo(page, page.getByTestId('outbound-payload')); } },
    { id: 'answer', action: async (page) => { await smoothScrollTo(page, page.getByTestId('restored-answer')); } },
    {
      id: 'summary',
      action: async (page) => {
        await scrollToTop(page);
        await select(page, 'summarize');
        await click(page, page.getByRole('button', { name: 'Run', exact: true }));
        await page.getByTestId('cloud-device-only-panel').waitFor({ timeout: 60000 });
        await point(page, page.getByTestId('cloud-device-only-panel'));
      },
    },
  ];
  if (mode === 'simulated') {
    list.push({
      id: 'blocked',
      action: async (page) => {
        await scrollToTop(page);
        await click(page, page.getByTestId('simulate-nano-unavailable'));
        await select(page, 'rewrite');
        await click(page, page.getByRole('button', { name: 'Run', exact: true }));
        await page.getByTestId('outcome-blocked').waitFor({ timeout: 60000 });
        await point(page, page.getByTestId('cloud-blocked-panel'));
      },
    });
  }
  list.push({
    id: 'outro',
    action: async (page) => {
      await scrollToBottom(page);
    },
  });
  return list;
}

function srtTime(seconds) {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(root, args.out);
  const rawDir = path.join(outDir, `raw-${args.mode}`);
  rmSync(rawDir, { recursive: true, force: true });
  mkdirSync(rawDir, { recursive: true });

  // Live mode needs a Chrome where Gemini Nano is downloaded; --executable and --profile point at it.
  // Not tested on the build machine, which cannot download Gemini Nano.
  const options = { viewport: PAGE, recordVideo: { dir: rawDir, size: PAGE } };
  const launch = args.executable ? { executablePath: args.executable } : {};
  const browser = args.profile ? null : await chromium.launch(launch);
  const context = args.profile
    ? await chromium.launchPersistentContext(args.profile, { ...launch, ...options })
    : await browser.newContext(options);
  await context.addInitScript(CURSOR_SCRIPT);
  const page = await context.newPage();
  const t0 = Date.now();
  const since = () => (Date.now() - t0) / 1000;
  const cues = [];

  await page.goto(args.url);
  await page.getByRole('button', { name: 'Run', exact: true }).waitFor();
  if (args.mode === 'simulated' && !(await page.getByTestId('simulated-banner').isVisible())) {
    throw new Error('simulated mode requested but the page shows no simulated banner');
  }
  if (args.mode === 'live') {
    // A configured app starts in Simulated while Firebase AI Logic loads, then switches to Live.
    const left = await page
      .getByTestId('simulated-banner')
      .waitFor({ state: 'detached', timeout: 30000 })
      .then(() => true, () => false);
    if (!left) throw new Error('live mode requested but the page is in simulated mode; finish submission/SETUP_FOR_KESH.md first');
  }

  for (const scene of scenes(args.mode)) {
    const captions = CAPTIONS[scene.id][args.mode];
    const start = since();
    await scene.action(page);
    const needed = captions.reduce((sum, c) => sum + readSeconds(c), 0);
    const remaining = start + needed - since();
    if (remaining > 0) await page.waitForTimeout(remaining * 1000);
    const end = since();
    const total = captions.reduce((sum, c) => sum + c.length, 0);
    let at = start;
    for (const caption of captions) {
      const length = ((end - start) * caption.length) / total;
      cues.push({ start: at, end: at + length - 0.05, text: caption });
      at += length;
    }
  }
  await page.waitForTimeout(800);
  const duration = since();
  // The demo page's own video: with --profile, Chromium also records its initial blank page.
  const video = page.video();
  await context.close();
  await browser?.close();
  if (!video) throw new Error('no video was recorded');
  const recorded = await video.path();

  const base = path.join(outDir, `demo-${args.mode}-take`);
  const srt = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
  writeFileSync(`${base}.srt`, srt);
  renameSync(recorded, `${base}.webm`);
  rmSync(rawDir, { recursive: true, force: true });

  // Captions sit in the band below the page: white Liberation Sans on the app's ink colour.
  const style = 'FontName=Liberation Sans,FontSize=11,PrimaryColour=&H00FFFFFF,OutlineColour=&H002B2018,BorderStyle=1,Outline=0,Shadow=0,MarginV=9,MarginL=30,MarginR=30';
  const band = `pad=${FRAME.width}:${FRAME.height}:0:0:color=0x18202B`;
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-i', `${base}.webm`,
    '-vf', `${band},subtitles=${path.basename(base)}.srt:force_style='${style}'`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an',
    `${path.basename(base)}.mp4`,
  ], { cwd: outDir, stdio: 'inherit' });
  rmSync(`${base}.webm`);

  const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${base}.mp4`], { encoding: 'utf8' }).trim());
  process.stdout.write(`${base}.mp4: ${seconds.toFixed(1)} s (recorded ${duration.toFixed(1)} s), captions ${base}.srt (${cues.length} cues)\n`);
  if (seconds > LIMIT_SECONDS) throw new Error(`video is ${seconds.toFixed(1)} s, over the 3-minute limit`);
  if (seconds > TARGET_MAX_SECONDS) process.stdout.write(`warning: over the ${TARGET_MAX_SECONDS} s target margin\n`);
}

await main();
