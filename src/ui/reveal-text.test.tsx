// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { RevealText } from './components/RevealText';
import { renderWithPlaceholderChips } from './components/PlaceholderChips';

afterEach(() => cleanup());

it('keeps a placeholder written with a space whole, so it still becomes a chip', () => {
  const words = 'Write to [EMAIL 1]  and [PERSON_2] today.';
  const { container } = render(
    <RevealText words={words} renderWord={word => renderWithPlaceholderChips(word, null, () => {})} />,
  );
  const chips = [...container.querySelectorAll('[tabindex="0"]')].map(chip => chip.textContent);
  expect(chips).toEqual(['[EMAIL 1]', '[PERSON_2]']);
  // Whitespace is kept as written.
  expect(container.textContent).toBe(words);
});
