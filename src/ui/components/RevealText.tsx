import { useEffect, useMemo, type ReactNode } from 'react';
import { motion, stagger, useAnimate, useReducedMotion } from 'motion/react';
import { PLACEHOLDER_SOURCE } from '@/core';
import { cn } from '@/lib/utils';

const MAX_TOTAL_MS = 1200;

export interface RevealTextProps {
  words: string;
  className?: string;
  renderWord?: (word: string, index: number) => ReactNode;
}

/**
 * Words and the whitespace between them, as written. A complete placeholder is one token even when
 * written with a space ("[EMAIL 1]"), so it can still be rendered as a chip.
 */
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  for (const match of text.matchAll(new RegExp(PLACEHOLDER_SOURCE, 'gi'))) {
    tokens.push(...text.slice(cursor, match.index).split(/(\s+)/), match[0]);
    cursor = match.index + match[0].length;
  }
  tokens.push(...text.slice(cursor).split(/(\s+)/));
  return tokens.filter(token => token !== '');
}

export function RevealText({ words, className, renderWord }: RevealTextProps) {
  const [scope, animate] = useAnimate();
  const reduceMotion = useReducedMotion() === true;
  const tokens = useMemo(() => tokenize(words), [words]);

  const wordCount = useMemo(
    () => tokens.filter(token => !/^\s+$/.test(token)).length,
    [tokens],
  );

  const { duration, delayStep } = useMemo(() => {
    const n = Math.max(1, wordCount);
    const perTokenMs = MAX_TOTAL_MS / n;
    const durationSec = Math.min(0.4, (perTokenMs * 0.55) / 1000);
    const delaySec = Math.min(0.06, (perTokenMs * 0.45) / 1000);
    return { duration: durationSec, delayStep: delaySec };
  }, [wordCount]);

  useEffect(() => {
    if (reduceMotion || !scope.current) return;
    void animate(
      'span[data-reveal-word]',
      { opacity: 1, filter: 'blur(0px)' },
      { duration, delay: stagger(delayStep) },
    );
  }, [animate, delayStep, duration, reduceMotion, scope, words]);

  return (
    <div className={cn('font-mono text-sm leading-relaxed text-ink whitespace-pre-wrap', className)}>
      <motion.div ref={scope}>
        {tokens.map((token, idx) => {
          if (/^\s+$/.test(token)) {
            return <span key={`ws-${idx}`}>{token}</span>;
          }
          return (
            <motion.span
              key={`${token}-${idx}`}
              data-reveal-word=""
              className={reduceMotion ? 'opacity-100' : 'opacity-0'}
              style={reduceMotion ? undefined : { filter: 'blur(6px)' }}
            >
              {renderWord ? renderWord(token, idx) : token}
            </motion.span>
          );
        })}
      </motion.div>
    </div>
  );
}