import { Volume2, VolumeX } from 'lucide-react';
import { motion } from 'framer-motion';
import { useAmbience } from '../hooks/useAmbience';

/**
 * Minimal ambience control. Fixed bottom-left, deliberately quiet so it
 * does not compete with the composition — but always reachable, which
 * WCAG 1.4.2 requires for any auto-starting audio.
 */
export default function AmbienceToggle() {
  const { enabled, started, toggle } = useAmbience();
  if (!started) return null;

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      onClick={toggle}
      aria-label={enabled ? 'Mute temple ambience' : 'Play temple ambience'}
      aria-pressed={enabled}
      className="fixed bottom-4 left-4 z-[70] w-9 h-9 rounded-full flex items-center justify-center transition-colors"
      style={{
        background: 'rgba(12,5,8,0.7)',
        border: `1px solid rgba(232,184,75,${enabled ? 0.5 : 0.25})`,
        color: enabled ? '#ffe9ad' : 'rgba(255,240,215,0.42)',
        backdropFilter: 'blur(10px)',
      }}
    >
      {enabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
    </motion.button>
  );
}
