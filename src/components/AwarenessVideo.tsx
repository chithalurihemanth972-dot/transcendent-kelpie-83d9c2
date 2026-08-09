import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { ScanStatus } from '../services/scanApi';

type ScreenTimeVideoAPI = {
  getElapsed?: () => number;
  play3hExact?: () => Promise<void> | void;
  play3to5h?: () => Promise<void> | void;
  playGt5h?: () => Promise<void> | void;
};

declare global {
  interface Window {
    __screenTimeVideoAPI?: ScreenTimeVideoAPI;
  }
}

type Milestone = '3h' | '3to5h' | 'gt5h';

function getScreenTimeAPI(): ScreenTimeVideoAPI | null {
  return window.__screenTimeVideoAPI ?? null;
}

function getMilestoneFromElapsed(elapsed: number): Milestone {
  // screenTimeVideo.tsx uses elapsed time in seconds.
  if (elapsed >= 5 * 60 * 60) {
    return 'gt5h';
  }

  if (elapsed >= 3 * 60 * 60) {
    return '3to5h';
  }

  return '3h';
}

export default function AwarenessVideo({
  status,
}: {
  status: ScanStatus;
}) {
  const healthy = status === 'healthy';

  const accent = healthy ? '#4CAF50' : '#FF7043';

  const [playingMilestone, setPlayingMilestone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * The milestone video system is initialized separately by
   * screenTimeVideo.tsx.
   *
   * This component intentionally does NOT:
   * - load healthy.mp4
   * - load warning.mp4
   * - create another video element
   * - create another screen-time tracker
   * - create another timer
   *
   * It only communicates with the existing screen-time video API.
   */

  useEffect(() => {
    setError(null);
  }, [status]);

  const playMilestoneVideo = useCallback(async () => {
    setError(null);

    const api = getScreenTimeAPI();

    if (!api) {
      const message =
        'Screen-time video module is not initialized. Please initialize screenTimeVideo.tsx before using this button.';

      console.error(`[AwarenessVideo] ${message}`);

      setError('Screen-time video is not ready yet.');
      return;
    }

    if (typeof api.getElapsed !== 'function') {
      const message =
        'Screen-time video API is available, but getElapsed() is missing.';

      console.error(`[AwarenessVideo] ${message}`);

      setError('Unable to determine current screen time.');
      return;
    }

    const elapsed = api.getElapsed();

    if (!Number.isFinite(elapsed) || elapsed < 0) {
      console.error(
        '[AwarenessVideo] Invalid elapsed screen time:',
        elapsed
      );

      setError('Invalid screen-time value.');
      return;
    }

    const milestone = getMilestoneFromElapsed(elapsed);

    setPlayingMilestone(true);

    try {
      switch (milestone) {
        case '3h': {
          if (typeof api.play3hExact !== 'function') {
            throw new Error('play3hExact() is not available.');
          }

          await api.play3hExact();
          break;
        }

        case '3to5h': {
          if (typeof api.play3to5h !== 'function') {
            throw new Error('play3to5h() is not available.');
          }

          await api.play3to5h();
          break;
        }

        case 'gt5h': {
          if (typeof api.playGt5h !== 'function') {
            throw new Error('playGt5h() is not available.');
          }

          await api.playGt5h();
          break;
        }
      }
    } catch (error) {
      console.error(
        '[AwarenessVideo] Failed to open milestone video:',
        error
      );

      setError('Milestone video could not be opened.');
    } finally {
      setPlayingMilestone(false);
    }
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: 0.55,
        duration: 0.7,
        ease: [0.22, 1, 0.36, 1],
      }}
      className="w-full rounded-2xl overflow-hidden relative"
      style={{
        border: `1px solid ${
          healthy
            ? 'rgba(76,175,80,0.28)'
            : 'rgba(255,112,67,0.28)'
        }`,
        background: 'rgba(255,255,255,0.04)',
        aspectRatio: '16 / 9',
      }}
    >
      {/* Background glow */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background: healthy
            ? 'radial-gradient(ellipse at 50% 45%, rgba(46,125,50,0.2), transparent 68%)'
            : 'radial-gradient(ellipse at 50% 45%, rgba(230,81,0,0.18), transparent 68%)',
        }}
      />

      {/* Animated play indicator */}
      <motion.span
        animate={{
          scale: [1, 1.06, 1],
          opacity: [0.75, 1, 0.75],
        }}
        transition={{
          duration: 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="w-11 h-11 rounded-full flex items-center justify-center relative z-10"
        style={{
          background: `${accent}22`,
          border: `1px solid ${accent}66`,
        }}
      >
        <Play size={16} style={{ color: accent }} />
      </motion.span>

      {/* Main message */}
      <p
        className="font-telugu text-xs relative z-10 text-center px-6"
        style={{
          color: 'rgba(255,240,215,0.62)',
        }}
      >
        {healthy
          ? 'ఇలాగే కొనసాగించండి — మీ సమతుల్యత బాగుంది.'
          : 'కొంచెం విరామం తీసుకోండి — మీ కళ్ళకు, మనసుకు మంచిది.'}
      </p>

      {/* Milestone information */}
      <p
        className="text-xs mt-1 relative z-10 text-center"
        style={{
          color: 'rgba(255,255,255,0.8)',
        }}
      >
        మీ స్క్రీన్ సమయానికి అనుగుణంగా అవగాహన వీడియోను చూడండి.
      </p>

      {/* Error state */}
      {error && (
        <p
          className="text-xs mt-2 relative z-10 text-center px-4"
          style={{
            color: '#ff9b8a',
          }}
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Play button */}
      <div className="mt-3 relative z-10">
        <button
          type="button"
          onClick={playMilestoneVideo}
          disabled={playingMilestone}
          aria-label="Play screen-time milestone video"
          className="px-4 py-2 rounded-full font-medium transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background: '#ffe9ad',
            color: '#231f1b',
          }}
        >
          {playingMilestone
            ? 'Opening…'
            : 'Play milestone video'}
        </button>
      </div>
    </motion.div>
  );
}
