/**
 * Library: Aceternity UI (TextGenerateEffect)
 * Original URL: https://ui.aceternity.com/registry/text-generate-effect.json
 * License: MIT
 * Retrieval date: 2026-11-18
 * Modifications:
 * - Adapted for strict TypeScript, noUncheckedIndexedAccess, and verbatimModuleSyntax.
 * - Added prefers-reduced-motion check so tokens render at full opacity immediately when reduced motion is enabled.
 * - Added renderToken support so bracketed placeholders (like [PERSON_1]) render as boundary-blue chips inside the cloud reply reveal.
 * - Replaced hardcoded dark/light 2xl bold typography with inherited monospace styling for the PII Router cloud reply panel.
 */

import { useEffect, useMemo, type ReactNode } from 'react';
import { motion, stagger, useAnimate } from 'motion/react';
import { cn } from '@/lib/utils';

export interface TextGenerateEffectProps {
  words: string;
  className?: string;
  filter?: boolean;
  duration?: number;
  renderWord?: (word: string, index: number) => ReactNode;
}

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' && (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

export const TextGenerateEffect = ({
  words,
  className,
  filter = true,
  duration = 0.35,
  renderWord,
}: TextGenerateEffectProps) => {
  const [scope, animate] = useAnimate();
  const reducedMotion = prefersReducedMotion();
  const tokens = useMemo(() => words.split(/(\s+)/), [words]);

  useEffect(() => {
    if (reducedMotion || !scope.current) return;
    void animate(
      'span[data-tge-word]',
      {
        opacity: 1,
        filter: filter ? 'blur(0px)' : 'none',
      },
      {
        duration: duration || 0.35,
        delay: stagger(0.04),
      },
    );
  }, [animate, duration, filter, reducedMotion, scope, words]);

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
              data-tge-word=""
              className={reducedMotion ? 'opacity-100' : 'opacity-0'}
              style={{
                filter: !reducedMotion && filter ? 'blur(6px)' : 'none',
              }}
            >
              {renderWord ? renderWord(token, idx) : token}
            </motion.span>
          );
        })}
      </motion.div>
    </div>
  );
};
