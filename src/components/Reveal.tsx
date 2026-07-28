import { motion, type Variants } from 'framer-motion';
import type { ReactNode } from 'react';

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

type Mode = 'up' | 'fade' | 'scale' | 'blur' | 'left' | 'right';

const VARIANTS: Record<Mode, Variants> = {
  up:    { hidden: { opacity: 0, y: 46 },                    show: { opacity: 1, y: 0 } },
  fade:  { hidden: { opacity: 0 },                           show: { opacity: 1 } },
  scale: { hidden: { opacity: 0, scale: 0.92, y: 24 },       show: { opacity: 1, scale: 1, y: 0 } },
  blur:  { hidden: { opacity: 0, filter: 'blur(14px)', y: 28 }, show: { opacity: 1, filter: 'blur(0px)', y: 0 } },
  left:  { hidden: { opacity: 0, x: -52 },                   show: { opacity: 1, x: 0 } },
  right: { hidden: { opacity: 0, x: 52 },                    show: { opacity: 1, x: 0 } },
};

/**
 * Scroll-triggered reveal. Uses framer's viewport observer so it stays
 * off the main thread and fires once — no jank, no re-trigger flicker.
 */
export default function Reveal({
  children,
  mode = 'up',
  delay = 0,
  duration = 0.9,
  className,
  amount = 0.35,
}: {
  children: ReactNode;
  mode?: Mode;
  delay?: number;
  duration?: number;
  className?: string;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[mode]}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      transition={{ duration, delay, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Parent that staggers its Reveal-like children. */
export function RevealGroup({
  children,
  className,
  stagger = 0.13,
  amount = 0.3,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  amount?: number;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: stagger } } }}
    >
      {children}
    </motion.div>
  );
}

/** Child of RevealGroup — inherits the stagger timeline. */
export function RevealItem({
  children,
  mode = 'up',
  duration = 0.85,
  className,
}: {
  children: ReactNode;
  mode?: Mode;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      variants={VARIANTS[mode]}
      transition={{ duration, ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

/** Word-by-word mask reveal for headline typography. */
export function RevealWords({
  text,
  className,
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
}) {
  const words = text.split(' ');
  return (
    <motion.span
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.5 }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08, delayChildren: delay } } }}
      style={{ display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0.28em' }}
    >
      {words.map((w, i) => (
        <span key={i} style={{ overflow: 'hidden', display: 'inline-block', paddingBottom: '0.12em' }}>
          <motion.span
            className={wordClassName}
            style={{ display: 'inline-block' }}
            variants={{
              hidden: { y: '115%', opacity: 0 },
              show: { y: '0%', opacity: 1 },
            }}
            transition={{ duration: 0.95, ease: EASE }}
          >
            {w}
          </motion.span>
        </span>
      ))}
    </motion.span>
  );
}
