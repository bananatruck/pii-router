// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { BorderBeam } from '@/components/vendor/border-beam';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('stops the border beam when Reduce Motion changes on the open page', () => {
  let matches = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return matches; },
    addEventListener: (_event: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_event: string, listener: () => void) => listeners.delete(listener),
  }));
  const { container } = render(<BorderBeam />);
  expect(container.querySelector('.border-2')).toBeNull();
  act(() => {
    matches = true;
    for (const listener of listeners) listener();
  });
  expect(container.querySelector('.border-2')).not.toBeNull();
});
