// @vitest-environment jsdom

// The live-models import in useModels must respect a mode the user picked while it was pending.
// This file holds the dynamic import of '@/models' open with a gate, so the callback really runs
// after the click (CodeRabbit review: the old test injected models and never reached that path).
// Modules are reset per test, so the gate never leaks into other test files.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

let releaseImport: () => void = () => {};

beforeEach(() => {
  vi.resetModules();
  const gate = new Promise<void>(resolve => {
    releaseImport = resolve;
  });
  vi.doMock('@/models/live-config', () => ({ liveConfigProblem: () => null, isLocalhostDev: () => true }));
  vi.doMock('@/models', async () => {
    await gate;
    return {
      createLiveModels: () => ({
        device: {
          location: 'device',
          simulated: false,
          label: 'Gemini Nano (test)',
          status: async () => ({ state: 'ready' }),
          prepare: async () => {},
          generate: async () => ({ text: '{"entities":[]}', ranOn: 'device' }),
        },
        cloud: null,
        liveReason: null,
      }),
    };
  });
});

afterEach(() => {
  cleanup();
  vi.doUnmock('@/models');
  vi.doUnmock('@/models/live-config');
});

it('stays in Simulated when the user picks it while the live models are still loading', async () => {
  const { App } = await import('./App');
  render(<App />);
  expect(screen.getByTestId('status-mode').textContent).toContain('Simulated');
  fireEvent.click(screen.getByRole('button', { name: 'Simulated' }));
  await act(async () => {
    releaseImport();
    await import('@/models');
  });
  expect(screen.getByTestId('status-mode').textContent).toContain('Simulated');
});

it('switches to Live when the models finish loading and the user has not picked a mode', async () => {
  const { App } = await import('./App');
  render(<App />);
  releaseImport();
  await waitFor(() => expect(screen.getByTestId('status-mode').textContent).toContain('Live'));
});

it('keeps a simulated answer labelled simulated after the automatic switch to Live', async () => {
  const { App } = await import('./App');
  render(<App />);
  fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
  fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
  fireEvent.click(screen.getByRole('button', { name: 'Run' }));
  await waitFor(() => expect(screen.getByTestId('payload-crossed-tag')).toBeTruthy(), {
    timeout: 5000,
  });
  releaseImport();
  await waitFor(() => expect(screen.getByTestId('status-mode').textContent).toContain('Live'));
  // The answer on screen came from the simulated models, so its crossing label must say so.
  expect(screen.getByTestId('payload-crossed-tag').textContent).toContain(
    'redacted payload passed to the simulated cloud',
  );
});
