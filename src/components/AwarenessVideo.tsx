import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Play } from 'lucide-react';
import type { ScanStatus } from '../services/scanApi';

type ScreenTimeVideoAPI = {
  getElapsed?: () => number;

  resetElapsed?: () => void;

  play3hExact?: () => Promise<void>;

  play3to5h?: () => Promise<void>;

  playGt5h?: () => Promise<void>;
};

declare global {
  interface Window {
    __screenTimeVideoAPI?: ScreenTimeVideoAPI;
  }
}

type Milestone =
  | '3h'
  | '3to5h'
  | 'gt5h';

function getMilestone(
  elapsedSeconds: number,
): Milestone {
  if (
    elapsedSeconds >=
    5 * 60 * 60
  ) {
    return 'gt5h';
  }

  if (
    elapsedSeconds >=
    3 * 60 * 60
  ) {
    return '3to5h';
  }

  return '3h';
}

function formatScreenTime(
  seconds: number,
) {
  const safeSeconds =
    Math.max(
      0,
      Math.floor(seconds),
    );

  const hours =
    Math.floor(
      safeSeconds / 3600,
    );

  const minutes =
    Math.floor(
      (safeSeconds % 3600) /
        60,
    );

  return `${hours}h ${minutes}m`;
}

export default function AwarenessVideo({
  status,
}: {
  status: ScanStatus;
}) {
  const healthy =
    status === 'healthy';

  const accent = healthy
    ? '#4CAF50'
    : '#FF7043';

  const [
    playingMilestone,
    setPlayingMilestone,
  ] = useState(false);

  const [
    error,
    setError,
  ] = useState<string | null>(
    null,
  );

  const [
    elapsed,
    setElapsed,
  ] = useState(0);

  /*
   * Keep the displayed screen-time value
   * synchronized with the existing tracker.
   *
   * This does NOT create another tracker.
   */
  useEffect(() => {
    const update =
      () => {
        const api =
          window.__screenTimeVideoAPI;

        if (
          api &&
          typeof api.getElapsed ===
            'function'
        ) {
          setElapsed(
            api.getElapsed(),
          );
        }
      };

    update();

    const interval =
      window.setInterval(
        update,
        1000,
      );

    return () =>
      window.clearInterval(
        interval,
      );
  }, []);

  /*
   * Clear stale errors when scan status changes.
   */
  useEffect(() => {
    setError(null);
  }, [status]);

  const playMilestoneVideo =
    useCallback(async () => {
      setError(null);

      const api =
        window.__screenTimeVideoAPI;

      if (!api) {
        console.error(
          '[AwarenessVideo] __screenTimeVideoAPI is unavailable.',
        );

        setError(
          'Screen-time video is not ready yet.',
        );

        return;
      }

      if (
        typeof api.getElapsed !==
        'function'
      ) {
        console.error(
          '[AwarenessVideo] getElapsed() is unavailable.',
        );

        setError(
          'Unable to read screen time.',
        );

        return;
      }

      const currentElapsed =
        api.getElapsed();

      if (
        !Number.isFinite(
          currentElapsed,
        ) ||
        currentElapsed < 0
      ) {
        console.error(
          '[AwarenessVideo] Invalid screen time:',
          currentElapsed,
        );

        setError(
          'Invalid screen-time value.',
        );

        return;
      }

      setElapsed(
        currentElapsed,
      );

      const milestone =
        getMilestone(
          currentElapsed,
        );

      setPlayingMilestone(
        true,
      );

      try {
        /*
         * IMPORTANT:
         *
         * We select the video based on
         * the ACTUAL current screen time.
         */
        if (
          milestone === '3h'
        ) {
          if (
            typeof api.play3hExact !==
            'function'
          ) {
            throw new Error(
              'play3hExact() is unavailable.',
            );
          }

          await api.play3hExact();
        }

        if (
          milestone === '3to5h'
        ) {
          if (
            typeof api.play3to5h !==
            'function'
          ) {
            throw new Error(
              'play3to5h() is unavailable.',
            );
          }

          await api.play3to5h();
        }

        if (
          milestone === 'gt5h'
        ) {
          if (
            typeof api.playGt5h !==
            'function'
          ) {
            throw new Error(
              'playGt5h() is unavailable.',
            );
          }

          await api.playGt5h();
        }
      } catch (err) {
        console.error(
          '[AwarenessVideo] Failed to open milestone video:',
          err,
        );

        setError(
          'Milestone video could not be opened. Check the video file path.',
        );
      } finally {
        setPlayingMilestone(
          false,
        );
      }
    }, []);

  const milestoneLabel =
    elapsed >= 5 * 60 * 60
      ? '> 5 hours'
      : elapsed >= 3 * 60 * 60
        ? '3–5 hours'
        : '< 3 hours';

  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 18,
      }}
      animate={{
        opacity: 1,
        y: 0,
      }}
      transition={{
        delay: 0.55,
        duration: 0.7,
        ease: [
          0.22,
          1,
          0.36,
          1,
        ],
      }}
      className="w-full rounded-2xl overflow-hidden relative"
      style={{
        border: `1px solid ${
          healthy
            ? 'rgba(76,175,80,0.28)'
            : 'rgba(255,112,67,0.28)'
        }`,

        background:
          'rgba(255,255,255,0.04)',

        aspectRatio:
          '16 / 9',
      }}
    >
      {/* Background glow */}
      <span
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            healthy
              ? 'radial-gradient(ellipse at 50% 45%, rgba(46,125,50,0.2), transparent 68%)'
              : 'radial-gradient(ellipse at 50% 45%, rgba(230,81,0,0.18), transparent 68%)',
        }}
      />

      {/* Animated play icon */}
      <motion.span
        animate={{
          scale: [
            1,
            1.06,
            1,
          ],
          opacity: [
            0.75,
            1,
            0.75,
          ],
        }}
        transition={{
          duration: 3.6,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="w-11 h-11 rounded-full flex items-center justify-center relative z-10"
        style={{
          background:
            `${accent}22`,

          border:
            `1px solid ${accent}66`,
        }}
      >
        <Play
          size={16}
          style={{
            color: accent,
          }}
        />
      </motion.span>

      {/* Main Telugu message */}
      <p
        className="font-telugu text-xs relative z-10 text-center px-6"
        style={{
          color:
            'rgba(255,240,215,0.62)',
        }}
      >
        {healthy
          ? 'ఇలాగే కొనసాగించండి — మీ సమతుల్యత బాగుంది.'
          : 'కొంచెం విరామం తీసుకోండి — మీ కళ్ళకు, మనసుకు మంచిది.'}
      </p>

      {/* Current screen-time information */}
      <p
        className="text-xs mt-2 relative z-10 text-center"
        style={{
          color:
            'rgba(255,255,255,0.82)',
        }}
      >
        Screen time:{' '}
        {formatScreenTime(
          elapsed,
        )}
      </p>

      {/* Milestone information */}
      <p
        className="text-xs mt-1 relative z-10 text-center"
        style={{
          color:
            'rgba(255,255,255,0.55)',
        }}
      >
        Current mode:{' '}
        {milestoneLabel}
      </p>

      {/* Error */}
      {error && (
        <p
          role="alert"
          className="text-xs mt-2 relative z-10 text-center px-4"
          style={{
            color:
              '#ff9b8a',
          }}
        >
          {error}
        </p>
      )}

      {/* Play milestone video */}
      <div className="mt-3 relative z-10 flex justify-center">
        <button
          type="button"
          onClick={
            playMilestoneVideo
          }
          disabled={
            playingMilestone
          }
          className="px-4 py-2 rounded-full font-medium transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          style={{
            background:
              '#ffe9ad',

            color:
              '#231f1b',

            boxShadow:
              '0 4px 20px rgba(255,233,173,0.12)',
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
