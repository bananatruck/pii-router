// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FakeModel, type ModelClient } from '@/core';
import { App } from './App';
import type { LiveModelSet } from './useModels';

// Pin the configuration, so these tests do not depend on src/firebase-config.ts (CodeRabbit review:
// a filled-in config made the app start in Live and broke the simulated-mode tests).
const liveConfig = vi.hoisted(() => ({ problem: 'Firebase is not configured yet (test).' as string | null }));
vi.mock('@/models/live-config', () => ({
  liveConfigProblem: () => liveConfig.problem,
  isLocalhostDev: () => true,
}));
vi.mock('@/models', () => ({
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
}));

afterEach(() => {
  liveConfig.problem = 'Firebase is not configured yet (test).';
  cleanup();
  vi.useRealTimers();
});

describe('PII Router UI', () => {
  it('renders the simulated mode banner text exactly', () => {
    render(<App />);
    const banner = screen.getByTestId('simulated-banner');
    expect(banner.textContent).toBe(
      'Simulated demo. No model is running: a deterministic stand-in plays both Gemini Nano and the cloud model so you can see the flow. Results are not model output. '
        + 'The real Firebase AI Logic path has not been run against a live Firebase project or Gemini Nano yet. How to run it for real',
    );
    const link = screen.getByRole('link', { name: 'How to run it for real' });
    expect(link.getAttribute('href')).toBe('https://github.com/bananatruck/pii-router#run-it-locally');
  });

  it('disables the Live mode button and displays the reason when liveReason is not null', () => {
    const stubLive: LiveModelSet = {
      device: new FakeModel({ location: 'device', behaviour: 'unavailable' }),
      cloud: null,
      liveReason: 'Firebase is not set up yet.',
    };
    render(<App liveModels={stubLive} />);

    const liveButton = screen.getByRole('button', { name: 'Live' });
    expect(liveButton.hasAttribute('disabled')).toBe(true);
    expect(screen.getByTestId('live-disabled-reason').textContent).toContain(
      'Firebase is not set up yet.',
    );
  });

  it('loads the Support email sample, runs the pipeline, withholds all personal values from the outbound payload, and restores Dana Whitfield in the local answer', async () => {
    vi.useFakeTimers();
    render(<App />);

    // Open sample menu and pick Support email
    fireEvent.click(screen.getByRole('button', { name: /Use sample/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));

    // Press Run
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    // Advance timers past simulated device (350ms) and simulated cloud (700ms) latencies
    await vi.advanceTimersByTimeAsync(1500);

    const payloadBox = screen.getByTestId('outbound-payload');
    const payloadText = payloadBox.textContent ?? '';

    expect(payloadText).not.toContain('Dana Whitfield');
    expect(payloadText).not.toContain('dana.whitfield@example.com');
    expect(payloadText).not.toContain('(312) 555-0142');
    expect(payloadText).not.toContain('4111 1111 1111 1111');
    expect(payloadText).toContain('[PERSON_1]');
    expect(payloadText).toContain('[EMAIL_1]');
    expect(payloadText).toContain('[PHONE_1]');
    expect(payloadText).toContain('[CARD_1]');

    const restoredAnswer = screen.getByTestId('restored-answer');
    expect(restoredAnswer.textContent).toContain('Dana Whitfield');
    expect(screen.getByTestId('egress-guard-status').textContent).toContain('Egress guard passed');
  });

  it('shows Blocked and Nothing was sent when running the rewrite task with a live model set whose device is unavailable', async () => {
    const unavailableDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'unavailable', reason: 'Prompt API unavailable.' }),
      prepare: async () => {},
      generate: async () => {
        throw new Error('Unavailable');
      },
    };
    const stubCloud: ModelClient = {
      location: 'cloud',
      simulated: false,
      label: 'Gemini Cloud',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async () => ({ text: 'Should never be called', ranOn: 'cloud' }),
    };

    render(
      <App
        liveModels={{
          device: unavailableDevice,
          cloud: stubCloud,
          liveReason: null,
        }}
      />,
    );

    // Ensure Rewrite task is selected
    const taskSelect = screen.getByLabelText('Task') as HTMLSelectElement;
    fireEvent.change(taskSelect, { target: { value: 'rewrite' } });

    // Press Run
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('outcome-blocked').textContent).toContain('Blocked');
    });

    expect(screen.getByTestId('cloud-blocked-panel').textContent).toContain('Nothing was sent.');
  });

  it('shows one findings list row per placeholder for the support email sample', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Use sample/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await vi.advanceTimersByTimeAsync(1500);

    const list = screen.getByTestId('findings-list');
    const rows = list.querySelectorAll('li');
    const placeholderKeys = [...rows].map(row => row.textContent?.match(/\[[\w_]+\]/)?.[0]);
    expect(placeholderKeys.length).toBe(new Set(placeholderKeys).size);
    const listText = list.textContent ?? '';
    expect(listText).toContain('[EMAIL_1]');
    expect(listText).toContain('[PHONE_1]');
    expect(listText).toContain('[CARD_1]');
  });

  it('blocks the rewrite task with Nothing was sent when simulate nano unavailable is on', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('simulate-nano-unavailable'));
    await waitFor(() => {
      const pill = screen.getByTestId('status-nano').textContent ?? '';
      expect(pill).toContain('Gemini Nano: unavailable');
      expect(pill).toContain('(simulated)');
    });

    const taskSelect = screen.getByLabelText('Task') as HTMLSelectElement;
    fireEvent.change(taskSelect, { target: { value: 'rewrite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('outcome-blocked').textContent).toContain('Blocked');
    });
    expect(screen.getByTestId('cloud-blocked-panel').textContent).toContain('Nothing was sent.');
  });

  it('keeps everything on the device for device-only route and calls device.prepare directly on click when needs-download', async () => {
    let prepareCalledSynchronously = false;
    const downloadableDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'needs-download' }),
      prepare: async onProgress => {
        prepareCalledSynchronously = true;
        onProgress?.(0.5);
      },
      generate: async () => ({ text: 'Local summary output.', ranOn: 'device' }),
    };

    render(
      <App
        liveModels={{
          device: downloadableDevice,
          cloud: null,
          liveReason: null,
        }}
      />,
    );

    const prepareButton = await screen.findByRole('button', { name: 'Prepare Gemini Nano' });
    fireEvent.click(prepareButton);
    expect(prepareCalledSynchronously).toBe(true);
  });

  it('starts only one run when Run is clicked twice quickly, and freezes the mode switch while running', async () => {
    let detectorCalls = 0;
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const slowDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        if (request.responseSchema) {
          detectorCalls += 1;
          await gate;
          return { text: '{"entities":[]}', ranOn: 'device' };
        }
        return { text: 'Local summary output.', ranOn: 'device' };
      },
    };
    render(<App liveModels={{ device: slowDevice, cloud: null, liveReason: null }} />);
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'summarize' } });
    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    const run = screen.getByRole('button', { name: 'Run' });
    fireEvent.click(run);
    fireEvent.click(run);
    await waitFor(() => expect(detectorCalls).toBe(1));
    expect(screen.getByRole('button', { name: 'Simulated' }).hasAttribute('disabled')).toBe(true);
    release();
    await screen.findByTestId('cloud-device-only-panel');
    expect(detectorCalls).toBe(1);
  });

  it('shows wrong-source cloud copy when the detector reports cloud inference', async () => {
    const wrongSourceDevice = new FakeModel({ location: 'device', behaviour: 'wrong-source' });
    const cloud = new FakeModel({ location: 'cloud' });
    render(
      <App
        liveModels={{
          device: wrongSourceDevice,
          cloud,
          liveReason: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('cloud-blocked-panel').textContent).toContain(
        'The text may have left this device.',
      );
    });
    expect(screen.getByTestId('cloud-blocked-panel').textContent).not.toContain('Nothing was sent.');
  });

  it('disables pipeline controls while running and clears the answer when the task changes', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const slowDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        if (request.responseSchema) {
          await gate;
          return { text: '{"entities":[]}', ranOn: 'device' };
        }
        return { text: 'Local summary output.', ranOn: 'device' };
      },
    };
    const stubCloud: ModelClient = {
      location: 'cloud',
      simulated: false,
      label: 'Gemini Cloud',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async () => ({ text: 'Cloud reply for [PERSON_1].', ranOn: 'cloud' }),
    };

    render(
      <App
        liveModels={{
          device: slowDevice,
          cloud: stubCloud,
          liveReason: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Use sample' }).hasAttribute('disabled')).toBe(true);
    });
    expect(screen.getByRole('button', { name: 'Edit text' }).hasAttribute('disabled')).toBe(true);

    release();
    await screen.findByTestId('restored-answer');
    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'rewrite' } });
    expect(screen.queryByTestId('restored-answer')).toBeNull();
  });

  it('moves focus through the sample menu with keyboard and returns focus to Use sample', async () => {
    render(<App />);
    const useSample = screen.getByRole('button', { name: 'Use sample' });
    useSample.focus();
    fireEvent.click(useSample);

    const menu = await screen.findByRole('menu');
    const items = screen.getAllByRole('menuitem');
    await waitFor(() => {
      expect(document.activeElement).toBe(items[0]);
    });

    fireEvent.keyDown(menu, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);

    fireEvent.keyDown(menu, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(menu, { key: 'End' });
    expect(document.activeElement).toBe(items[items.length - 1]);

    fireEvent.keyDown(menu, { key: 'Home' });
    expect(document.activeElement).toBe(items[0]);

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(document.activeElement).toBe(useSample);
  });

  it('announces a cloud answer in the live status region without leaking the answer text', async () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /Use sample/i }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await waitFor(
      () => {
        expect(screen.getByTestId('run-status').textContent).toBe(
          'Answered through the cloud with personal details withheld.',
        );
      },
      { timeout: 3000 },
    );
    expect(screen.getByTestId('run-status').textContent).not.toContain('Dana Whitfield');
  });

  it('announces a blocked run in the live status region', async () => {
    render(<App />);

    fireEvent.click(screen.getByTestId('simulate-nano-unavailable'));
    const taskSelect = screen.getByLabelText('Task') as HTMLSelectElement;
    fireEvent.change(taskSelect, { target: { value: 'rewrite' } });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      const status = screen.getByTestId('run-status');
      expect(status.textContent?.startsWith('Blocked: ')).toBe(true);
    });
  });

  it('shows wrong-source cloud copy when the device-only answer reports wrong inference', async () => {
    let generateCalls = 0;
    const deviceOnlyWrongAnswer: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        generateCalls += 1;
        if (request.responseSchema) {
          return { text: '{"entities":[]}', ranOn: 'device' };
        }
        return { text: 'Local answer.', ranOn: 'cloud' };
      },
    };
    const cloud = new FakeModel({ location: 'cloud' });

    render(
      <App
        liveModels={{
          device: deviceOnlyWrongAnswer,
          cloud,
          liveReason: null,
        }}
      />,
    );

    fireEvent.change(screen.getByLabelText('Task'), { target: { value: 'summarize' } });
    fireEvent.click(screen.getByRole('button', { name: 'Keep on this device' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('cloud-blocked-panel').textContent).toContain(
        'The text may have left this device.',
      );
    });
    expect(screen.getByTestId('cloud-blocked-panel').textContent).not.toContain('Nothing was sent.');
    expect(generateCalls).toBeGreaterThan(1);
  });

  it('shows simulated payload-crossed copy only after a successful cloud answer', async () => {
    vi.useFakeTimers();
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await vi.advanceTimersByTimeAsync(1500);

    const tag = screen.getByTestId('payload-crossed-tag');
    expect(tag.textContent).toContain('redacted payload passed to the simulated cloud');
  });

  it('hides payload-crossed tags when the cloud call errors', async () => {
    const flakyCloud: ModelClient = {
      location: 'cloud',
      simulated: false,
      label: 'Gemini Cloud',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        if (request.responseSchema) {
          throw new Error('should not run on cloud');
        }
        throw new Error('503');
      },
    };
    const device = new FakeModel({ location: 'device' });

    render(
      <App
        liveModels={{
          device,
          cloud: flakyCloud,
          liveReason: null,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByTestId('outbound-payload')).toBeTruthy();
    });
    expect(screen.queryByTestId('payload-crossed-tag')).toBeNull();
  });

  it('closes the sample menu when a run starts and keeps menu items disabled while running', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const slowDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        if (request.responseSchema) {
          await gate;
          return { text: '{"entities":[]}', ranOn: 'device' };
        }
        return { text: 'Local summary output.', ranOn: 'device' };
      },
    };
    render(<App liveModels={{ device: slowDevice, cloud: null, liveReason: null }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    expect(screen.getByRole('menu')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.queryByRole('menu')).toBeNull();
    });
    expect(screen.getByRole('button', { name: 'Use sample' }).hasAttribute('disabled')).toBe(true);
    release();
  });

  it('does not open the text editor from the marked view while a run is in flight', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(resolve => {
      release = resolve;
    });
    const slowDevice: ModelClient = {
      location: 'device',
      simulated: false,
      label: 'Gemini Nano',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async request => {
        if (request.responseSchema) {
          await gate;
          return { text: '{"entities":[]}', ranOn: 'device' };
        }
        return { text: 'Local summary output.', ranOn: 'device' };
      },
    };
    const stubCloud: ModelClient = {
      location: 'cloud',
      simulated: false,
      label: 'Gemini Cloud',
      status: async () => ({ state: 'ready' }),
      prepare: async () => {},
      generate: async () => ({ text: 'Reply.', ranOn: 'cloud' }),
    };
    render(<App liveModels={{ device: slowDevice, cloud: stubCloud, liveReason: null }} />);

    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Edit text' }).hasAttribute('disabled')).toBe(true);
    });
    fireEvent.click(screen.getByTestId('marked-input'));
    expect(screen.queryByLabelText('Input text')).toBeNull();

    release();
    await screen.findByTestId('restored-answer');
  });

  it('sets copied only after clipboard write resolves', async () => {
    let resolveWrite: () => void = () => {};
    const writeSpy = vi.fn(
      () =>
        new Promise<void>(resolve => {
          resolveWrite = resolve;
        }),
    );
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: writeSpy },
    });

    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Use sample' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Support email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });

    const copyButton = screen.getByRole('button', { name: 'Copy' });
    fireEvent.click(copyButton);
    expect(writeSpy).toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    expect(writeSpy).toHaveBeenCalledWith(screen.getByTestId('restored-answer').textContent);

    await act(async () => { await vi.advanceTimersByTimeAsync(1799); });
    expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('adopts the normalized text on Run so the marks line up with what was scanned', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit text' }));
    fireEvent.change(screen.getByLabelText('Input text'), {
      target: { value: 'Card 4111\u200b1111\u200b1111\u200b1111 please.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await screen.findByTestId('restored-answer', {}, { timeout: 5000 });
    const marked = screen.getByTestId('marked-input');
    expect(marked.textContent).toContain('4111111111111111');
    expect(marked.querySelector('mark')?.textContent ?? '').toContain('4111111111111111');
  });

  it('switches to Live once the live models load when the user has not picked a mode', async () => {
    liveConfig.problem = null;
    render(<App />);
    await waitFor(() => expect(screen.getByTestId('status-mode').textContent).toContain('Live'));
  });

  it('does not show Copied for a newer answer when an older copy finishes late (CodeRabbit review)', async () => {
    vi.useFakeTimers();
    let resolveWrite: () => void = () => {};
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn(() => new Promise<void>(resolve => { resolveWrite = resolve; })) },
    });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Run' }));
    expect(screen.getByTestId('run-status').textContent).toBe('Running.');
    await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
    expect(screen.getByTestId('run-status').textContent).not.toBe('Running.');
    await act(async () => {
      resolveWrite();
      await Promise.resolve();
    });
    expect(screen.queryByRole('button', { name: 'Copied' })).toBeNull();
  });
});
