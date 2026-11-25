// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Header } from './components/Header';

afterEach(() => cleanup());

it('announces device status changes politely, without the download percentage', () => {
  const props = { mode: 'live' as const, setMode: () => {}, liveReason: null };
  const { rerender } = render(<Header {...props} deviceStatus={{ state: 'downloading', fraction: 0.4 }} />);
  const region = screen.getByTestId('device-status-announcement');
  expect(region.getAttribute('aria-live')).toBe('polite');
  expect(region.textContent).toBe('Gemini Nano: downloading');
  rerender(<Header {...props} deviceStatus={{ state: 'downloading', fraction: 0.7 }} />);
  expect(region.textContent).toBe('Gemini Nano: downloading');
  rerender(<Header {...props} deviceStatus={{ state: 'ready' }} />);
  expect(region.textContent).toBe('Gemini Nano: ready');
  rerender(<Header {...props} deviceStatus={{ state: 'unavailable', reason: 'x' }} />);
  expect(region.textContent).toBe('Gemini Nano: unavailable');
  // The visible pill still shows the percentage.
  rerender(<Header {...props} deviceStatus={{ state: 'downloading', fraction: 0.4 }} />);
  expect(screen.getByTestId('status-nano').textContent).toContain('(40%)');
});
