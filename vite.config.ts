import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// PAGES_BASE is set by the GitHub Pages workflow (for example "/pii-router/").
const base = process.env.PAGES_BASE ?? '/';

const SDK_BROWSER_TEST = 'src/models/sdk-fallback.test.ts';

// The browser build of @firebase/ai, which is what `firebase/ai` resolves to in Chrome.
// @firebase/ai sits next to the firebase package in both pnpm and npm layouts.
function firebaseAiBrowserEntry(): string {
  const firebaseDir = realpathSync(fileURLToPath(new URL('./node_modules/firebase', import.meta.url)));
  const entry = path.join(firebaseDir, '..', '@firebase', 'ai', 'dist', 'esm', 'index.esm.js');
  if (!existsSync(entry)) throw new Error(`Browser build of @firebase/ai not found at ${entry}`);
  return entry;
}

/**
 * Ships the licence and the third-party notices with the built site: the bundled MIT and
 * MIT-plus-Commons-Clause components require their notices in every copy (CodeRabbit review).
 */
function shipNotices(): Plugin {
  return {
    name: 'ship-notices',
    generateBundle() {
      for (const [from, to] of [['THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'], ['LICENSE', 'LICENSE.txt']]) {
        this.emitFile({ type: 'asset', fileName: to, source: readFileSync(fileURLToPath(new URL(`./${from}`, import.meta.url)), 'utf8') });
      }
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), tailwindcss(), shipNotices()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    sourcemap: false,
    target: 'es2022',
  },
  test: {
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: [SDK_BROWSER_TEST],
        },
      },
      {
        // Runs the real Firebase SDK as it ships to Chrome. Without the alias, Vitest loads the
        // Node build of @firebase/ai, which has no on-device adapter at all.
        extends: true,
        resolve: { alias: { '@firebase/ai': firebaseAiBrowserEntry() } },
        test: {
          name: 'sdk-browser',
          environment: 'jsdom',
          include: [SDK_BROWSER_TEST],
          server: { deps: { inline: ['firebase', /@firebase\//] } },
        },
      },
    ],
  },
});
