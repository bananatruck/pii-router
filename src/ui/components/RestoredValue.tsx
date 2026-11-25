import { motion, useReducedMotion } from 'motion/react';

/** A short reveal for restored values, written for PII Router under Apache-2.0. */
export function RestoredValue({ text }: { text: string }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.span
      className="whitespace-pre-wrap [overflow-wrap:anywhere]"
      initial={reduceMotion ? false : { opacity: 0.4 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.25 }}
    >
      {text}
    </motion.span>
  );
}
