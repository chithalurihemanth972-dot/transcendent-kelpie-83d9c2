import { useEffect, useState } from 'react';
import { motion, type TargetAndTransition, type Transition } from 'framer-motion';
import { getCleanGanesha } from '../utils/cleanImage';

interface GaneshaFigureProps {
  src: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** framer-motion props forwarded to the underlying motion.img */
  animate?: TargetAndTransition;
  initial?: TargetAndTransition;
  transition?: Transition;
}

/**
 * Renders Lord Ganesha with a true alpha matte — the baked white backdrop
 * is removed at runtime so only the deity's silhouette floats over the
 * scene. Fades in only once processing completes (never a white box).
 */
export default function GaneshaFigure({
  src,
  alt = 'Lord Ganesha',
  className,
  style,
  animate,
  initial,
  transition,
}: GaneshaFigureProps) {
  const [cleanSrc, setCleanSrc] = useState<string | null>(null);

  useEffect(() => getCleanGanesha(src, setCleanSrc), [src]);

  return (
    <motion.img
      src={cleanSrc ?? src}
      alt={alt}
      draggable={false}
      className={className}
      initial={initial}
      animate={animate}
      transition={transition}
      style={{
        ...style,
        opacity: cleanSrc ? 1 : 0,
        transition: 'opacity 0.7s ease',
        mixBlendMode: 'normal',
        userSelect: 'none',
      }}
    />
  );
}
