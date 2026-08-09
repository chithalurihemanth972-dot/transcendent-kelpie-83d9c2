import React from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Screen-Time Milestone Video System
 *
 * Videos:
 *   < 3h      -> no automatic milestone video
 *   3h        -> /videos/3h.mp4
 *   3h–5h     -> /videos/3to5h.mp4
 *   > 5h      -> /videos/gt5h.mp4
 *
 * Videos must exist at:
 *
 * public/videos/3h.mp4
 * public/videos/3to5h.mp4
 * public/videos/gt5h.mp4
 *
 * This module:
 * - Tracks visible screen time.
 * - Persists screen time in localStorage.
 * - Automatically triggers milestone videos.
 * - Exposes window.__screenTimeVideoAPI for manual playback.
 * - Prevents duplicate initialization.
 * - Prevents duplicate milestone playback.
 */

type VideoConfig = {
  videoAt3h?: string;
  video3to5h?: string;
  videoGt5h?: string;

  exact3hWindowSec?: number;

  storagePrefix?: string;

  autoplayEnabled?: boolean;

  overlayZIndex?: number;
};

type ScreenTimeVideoAPI = {
  getElapsed: () => number;

  resetElapsed: () => void;

  play3hExact: () => Promise<void>;

  play3to5h: () => Promise<void>;

  playGt5h: () => Promise<void>;
};

declare global {
  interface Window {
    __screenTimeVideoAPI?: ScreenTimeVideoAPI;
  }
}

const DEFAULT_CONFIG: Required<VideoConfig> = {
  videoAt3h: '/videos/3h.mp4',
  video3to5h: '/videos/3to5h.mp4',
  videoGt5h: '/videos/gt5h.mp4',

  // 60-second window after exactly 3 hours.
  exact3hWindowSec: 60,

  storagePrefix: 'screenTimeVideo',

  autoplayEnabled: true,

  overlayZIndex: 999999,
};

const secondsForHours = (hours: number) => hours * 60 * 60;

const STORAGE_KEYS = (prefix: string) => ({
  seconds: `${prefix}:seconds`,
  played3hExact: `${prefix}:played:3h_exact`,
  played3to5h: `${prefix}:played:3to5h`,
  playedGt5h: `${prefix}:played:gt5h`,
});

/**
 * Build clean candidate URLs.
 *
 * We intentionally do NOT create:
 *
 * /videos/3h.mp4.mp4
 *
 * because your actual files are:
 *
 * /videos/3h.mp4
 * /videos/3to5h.mp4
 * /videos/gt5h.mp4
 */
function getCandidates(url: string): string[] {
  const clean = url.trim();

  if (!clean) {
    return [];
  }

  const candidates = [clean];

  if (!clean.toLowerCase().endsWith('.mp4')) {
    candidates.push(`${clean}.mp4`);
  }

  return [...new Set(candidates)];
}

/**
 * Verify that the video exists.
 *
 * First try HEAD.
 * If HEAD is unavailable or returns a non-success response,
 * try a tiny Range GET request.
 */
async function findFirstExisting(
  candidates: string[],
): Promise<string | undefined> {
  for (const url of candidates) {
    // ------------------------------------------------------------
    // 1. HEAD request
    // ------------------------------------------------------------
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        cache: 'no-store',
      });

      if (response.ok) {
        return url;
      }
    } catch {
      // Continue to Range GET.
    }

    // ------------------------------------------------------------
    // 2. Range GET fallback
    // ------------------------------------------------------------
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0',
        },
        cache: 'no-store',
      });

      if (response.ok || response.status === 206) {
        return url;
      }
    } catch {
      // Try next candidate.
    }
  }

  return undefined;
}

/* ================================================================
   VIDEO OVERLAY
================================================================ */

function VideoOverlay({
  src,
  onClose,
  zIndex,
  autoplay,
}: {
  src: string;
  onClose: () => void;
  zIndex: number;
  autoplay: boolean;
}) {
  const [videoError, setVideoError] = React.useState(false);

  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Screen-time awareness video"
      onClick={(event) => {
        // Only close when clicking the backdrop itself.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex,

        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',

        padding: '24px',

        background:
          'rgba(0, 0, 0, 0.94)',

        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      }}
    >
      {!videoError ? (
        <video
          src={src}
          controls
          autoPlay={autoplay}
          muted={autoplay}
          playsInline
          preload="auto"
          onEnded={onClose}
          onError={() => {
            console.error(
              '[ScreenTimeVideo] Video failed to load:',
              src,
            );

            setVideoError(true);
          }}
          style={{
            position: 'relative',
            zIndex: zIndex + 1,

            width: 'min(1100px, 100%)',
            maxHeight: 'calc(100vh - 48px)',

            display: 'block',

            borderRadius: '16px',

            background: '#000',

            boxShadow:
              '0 30px 100px rgba(0,0,0,0.65)',
          }}
        />
      ) : (
        <div
          style={{
            position: 'relative',
            zIndex: zIndex + 1,

            width: 'min(520px, 100%)',

            padding: '28px',

            borderRadius: '18px',

            textAlign: 'center',

            color: '#ffe9ad',

            background:
              'linear-gradient(145deg, #241416, #12090b)',

            border:
              '1px solid rgba(232,184,75,0.28)',
          }}
        >
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              marginBottom: '10px',
            }}
          >
            Awareness video unavailable
          </div>

          <div
            style={{
              fontSize: '13px',
              color: 'rgba(255,255,255,0.65)',
              marginBottom: '20px',
            }}
          >
            Please verify that the video exists at:
          </div>

          <code
            style={{
              display: 'block',
              marginBottom: '20px',
              color: '#ffb4a5',
              wordBreak: 'break-word',
            }}
          >
            {src}
          </code>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              borderRadius: '999px',
              padding: '10px 20px',
              background: '#ffe9ad',
              color: '#231f1b',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      )}

      {/* Close button */}
      <button
        type="button"
        onClick={onClose}
        aria-label="Close video"
        style={{
          position: 'fixed',
          top: '18px',
          right: '18px',
          zIndex: zIndex + 2,

          width: '42px',
          height: '42px',

          borderRadius: '50%',
          border:
            '1px solid rgba(255,255,255,0.2)',

          background:
            'rgba(20,10,12,0.82)',

          color: '#fff',

          fontSize: '24px',
          lineHeight: 1,

          cursor: 'pointer',
        }}
      >
        ×
      </button>
    </div>
  );
}

/* ================================================================
   INITIALIZATION
================================================================ */

let cleanupInstance: (() => void) | null = null;

export function initScreenTimeVideo(
  userConfig?: VideoConfig,
) {
  // --------------------------------------------------------------
  // Browser guard
  // --------------------------------------------------------------
  if (
    typeof window === 'undefined' ||
    typeof document === 'undefined'
  ) {
    return;
  }

  // --------------------------------------------------------------
  // Prevent duplicate initialization
  // --------------------------------------------------------------
  if (cleanupInstance) {
    return cleanupInstance;
  }

  const config: Required<VideoConfig> = {
    ...DEFAULT_CONFIG,
    ...(userConfig ?? {}),
  };

  const keys = STORAGE_KEYS(config.storagePrefix);

  // --------------------------------------------------------------
  // Stored screen time
  // --------------------------------------------------------------
  let elapsed =
    Number.parseInt(
      localStorage.getItem(keys.seconds) ?? '0',
      10,
    ) || 0;

  let ticking = false;

  let tickHandle: number | null = null;

  let thresholdCheckRunning = false;

  let activeOverlayCleanup: (() => void) | null = null;

  // --------------------------------------------------------------
  // Storage helpers
  // --------------------------------------------------------------
  const isPlayed = (key: string) =>
    localStorage.getItem(key) === '1';

  const markPlayed = (key: string) =>
    localStorage.setItem(key, '1');

  const saveElapsed = () =>
    localStorage.setItem(
      keys.seconds,
      String(elapsed),
    );

  /* ==============================================================
     SHOW VIDEO
  ============================================================== */

  const showVideo = async (
    src: string,
  ): Promise<void> => {
    if (!config.autoplayEnabled) {
      return;
    }

    // Prevent two fullscreen videos at once.
    if (activeOverlayCleanup) {
      return;
    }

    return new Promise<void>((resolve) => {
      const overlayRoot =
        document.createElement('div');

      overlayRoot.setAttribute(
        'data-screen-time-video',
        '1',
      );

      document.body.appendChild(
        overlayRoot,
      );

      let root: Root | null = null;

      let closed = false;

      const cleanup = () => {
        if (closed) {
          return;
        }

        closed = true;

        activeOverlayCleanup = null;

        try {
          root?.unmount();
        } catch {
          // Ignore cleanup errors.
        }

        if (overlayRoot.parentNode) {
          overlayRoot.parentNode.removeChild(
            overlayRoot,
          );
        }

        resolve();
      };

      activeOverlayCleanup = cleanup;

      try {
        root = createRoot(
          overlayRoot,
        );

        root.render(
          React.createElement(
            VideoOverlay,
            {
              src,

              onClose: cleanup,

              zIndex:
                config.overlayZIndex,

              autoplay:
                config.autoplayEnabled,
            },
          ),
        );
      } catch (error) {
        console.error(
          '[ScreenTimeVideo] Failed to create video overlay:',
          error,
        );

        cleanup();
      }
    });
  };

  /* ==============================================================
     VIDEO PLAYERS
  ============================================================== */

  const playVideo = async (
    videoUrl: string,
  ) => {
    const candidates =
      getCandidates(videoUrl);

    if (!candidates.length) {
      throw new Error(
        'No video URL was configured.',
      );
    }

    const existing =
      await findFirstExisting(
        candidates,
      );

    if (!existing) {
      throw new Error(
        `Video not found. Tried: ${candidates.join(
          ', ',
        )}`,
      );
    }

    console.info(
      '[ScreenTimeVideo] Playing:',
      existing,
    );

    await showVideo(existing);
  };

  /* ==============================================================
     THRESHOLD LOGIC
  ============================================================== */

  const checkThresholds =
    async () => {
      // Prevent overlapping async threshold checks.
      if (thresholdCheckRunning) {
        return;
      }

      thresholdCheckRunning = true;

      try {
        const playedGt5 =
          isPlayed(
            keys.playedGt5h,
          );

        const played3to5 =
          isPlayed(
            keys.played3to5h,
          );

        const played3hExact =
          isPlayed(
            keys.played3hExact,
          );

        // --------------------------------------------------------
        // > 5 HOURS
        // --------------------------------------------------------
        if (
          elapsed >=
            secondsForHours(5) &&
          !playedGt5
        ) {
          try {
            await playVideo(
              config.videoGt5h,
            );

            markPlayed(
              keys.playedGt5h,
            );
          } catch (error) {
            console.error(
              '[ScreenTimeVideo] >5h video failed:',
              error,
            );
          }

          return;
        }

        // --------------------------------------------------------
        // 3–5 HOURS
        // --------------------------------------------------------
        if (
          elapsed >=
            secondsForHours(3)
        ) {
          const exact3hEnd =
            secondsForHours(3) +
            config.exact3hWindowSec;

          // Exact 3-hour window.
          if (
            !played3hExact &&
            elapsed < exact3hEnd
          ) {
            try {
              await playVideo(
                config.videoAt3h,
              );

              markPlayed(
                keys.played3hExact,
              );
            } catch (error) {
              console.error(
                '[ScreenTimeVideo] 3h video failed:',
                error,
              );
            }

            return;
          }

          // Exact 3h window missed.
          if (
            !played3to5 &&
            elapsed <
              secondsForHours(5)
          ) {
            try {
              await playVideo(
                config.video3to5h,
              );

              markPlayed(
                keys.played3to5h,
              );
            } catch (error) {
              console.error(
                '[ScreenTimeVideo] 3–5h video failed:',
                error,
              );
            }

            return;
          }
        }
      } finally {
        thresholdCheckRunning = false;
      }
    };

  /* ==============================================================
     TIMER
  ============================================================== */

  const tick = async () => {
    elapsed += 1;

    saveElapsed();

    await checkThresholds();
  };

  const startTicking =
    () => {
      if (ticking) {
        return;
      }

      ticking = true;

      tickHandle =
        window.setInterval(() => {
          tick().catch((error) => {
            console.error(
              '[ScreenTimeVideo] Tick error:',
              error,
            );
          });
        }, 1000);
    };

  const stopTicking =
    () => {
      ticking = false;

      if (
        tickHandle !== null
      ) {
        window.clearInterval(
          tickHandle,
        );

        tickHandle = null;
      }
    };

  /* ==============================================================
     VISIBILITY
  ============================================================== */

  const handleVisibility =
    () => {
      if (
        document.visibilityState ===
        'visible'
      ) {
        startTicking();
      } else {
        stopTicking();
      }
    };

  document.addEventListener(
    'visibilitychange',
    handleVisibility,
  );

  window.addEventListener(
    'focus',
    handleVisibility,
  );

  window.addEventListener(
    'blur',
    handleVisibility,
  );

  if (
    document.visibilityState ===
    'visible'
  ) {
    startTicking();
  }

  /* ==============================================================
     PUBLIC API
  ============================================================== */

  const api: ScreenTimeVideoAPI = {
    getElapsed: () =>
      elapsed,

    resetElapsed: () => {
      elapsed = 0;

      saveElapsed();

      localStorage.removeItem(
        keys.played3hExact,
      );

      localStorage.removeItem(
        keys.played3to5h,
      );

      localStorage.removeItem(
        keys.playedGt5h,
      );

      console.info(
        '[ScreenTimeVideo] Screen time reset.',
      );
    },

    play3hExact: async () => {
      await playVideo(
        config.videoAt3h,
      );

      markPlayed(
        keys.played3hExact,
      );
    },

    play3to5h: async () => {
      await playVideo(
        config.video3to5h,
      );

      markPlayed(
        keys.played3to5h,
      );
    },

    playGt5h: async () => {
      await playVideo(
        config.videoGt5h,
      );

      markPlayed(
        keys.playedGt5h,
      );
    },
  };

  window.__screenTimeVideoAPI =
    api;

  console.info(
    '[ScreenTimeVideo] Initialized successfully.',
  );

  console.info(
    '[ScreenTimeVideo] Current elapsed seconds:',
    elapsed,
  );

  console.info(
    '[ScreenTimeVideo] Videos:',
    {
      threeHours:
        config.videoAt3h,

      threeToFive:
        config.video3to5h,

      greaterThanFive:
        config.videoGt5h,
    },
  );

  /* ==============================================================
     CLEANUP
  ============================================================== */

  const cleanup = () => {
    stopTicking();

    document.removeEventListener(
      'visibilitychange',
      handleVisibility,
    );

    window.removeEventListener(
      'focus',
      handleVisibility,
    );

    window.removeEventListener(
      'blur',
      handleVisibility,
    );

    if (activeOverlayCleanup) {
      activeOverlayCleanup();
    }

    if (
      window.__screenTimeVideoAPI ===
      api
    ) {
      delete window.__screenTimeVideoAPI;
    }

    cleanupInstance = null;
  };

  cleanupInstance =
    cleanup;

  return cleanup;
}
