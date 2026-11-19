/**
 * Library: Magic UI (BorderBeam)
 * Original URL: https://magicui.design/r/border-beam.json
 * License: MIT. Full notice: THIRD_PARTY_NOTICES.md at the repository and built-site root.
 * Retrieval date: 2026-11-18
 * Modifications:
 * - Adapted imports for verbatimModuleSyntax and strict TypeScript.
 * - Added prefers-reduced-motion check to render a static highlight border when reduced motion is enabled.
 * - Defaulted beam colors to the PII Router boundary blue (#2B59E8) and marker amber (#F4C04E).
 */

import type { CSSProperties } from 'react';
import { motion, type MotionStyle, type Transition } from 'motion/react';

import { cn } from '@/lib/utils';
import { useMediaQuery } from '@/ui/hooks/useMediaQuery';

export interface BorderBeamProps {
  size?: number;
  duration?: number;
  delay?: number;
  colorFrom?: string;
  colorTo?: string;
  transition?: Transition;
  className?: string;
  style?: CSSProperties;
  reverse?: boolean;
  initialOffset?: number;
  borderWidth?: number;
}

export const BorderBeam = ({
  className,
  size = 56,
  delay = 0,
  duration = 4,
  colorFrom = '#2B59E8',
  colorTo = '#F4C04E',
  transition,
  style,
  reverse = false,
  initialOffset = 0,
  borderWidth = 2,
}: BorderBeamProps) => {
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  if (reducedMotion) {
    return (
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 rounded-[inherit] border-2 border-boundary-blue"
      />
    );
  }

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 rounded-[inherit] border-(length:--border-beam-width) border-transparent mask-[linear-gradient(transparent,transparent),linear-gradient(#000,#000)] mask-intersect [mask-clip:padding-box,border-box]"
      style={
        {
          '--border-beam-width': `${borderWidth}px`,
        } as CSSProperties
      }
    >
      <motion.div
        className={cn(
          'absolute aspect-square',
          'bg-linear-to-l from-(--color-from) via-(--color-to) to-transparent',
          className,
        )}
        style={
          {
            width: size,
            offsetPath: `rect(0 auto auto 0 round ${size}px)`,
            '--color-from': colorFrom,
            '--color-to': colorTo,
            ...style,
          } as MotionStyle
        }
        initial={{ offsetDistance: `${initialOffset}%` }}
        animate={{
          offsetDistance: reverse
            ? [`${100 - initialOffset}%`, `${-initialOffset}%`]
            : [`${initialOffset}%`, `${100 + initialOffset}%`],
        }}
        transition={{
          repeat: Infinity,
          ease: 'linear',
          duration,
          delay: -delay,
          ...transition,
        }}
      />
    </div>
  );
};
