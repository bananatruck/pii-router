// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { FakeModel, type ModelClient } from '@/core';
import { App } from './App';
import type { LiveModelSet } from './useModels';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('PII Router UI', () => {
  it('renders the simulated mode banner text exactly', () => {
    render(<App />);
    const banner = screen.getByTestId('simulated-banner');
    expect(banner.textContent).toBe(
      'Simulated demo. No model is running: a deterministic stand-in plays both Gemini Nano and the cloud model so you can see the flow. Results are not model output.',
    );
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
});
