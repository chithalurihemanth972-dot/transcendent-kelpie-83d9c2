import React from 'react';
import { createRoot } from 'react-dom/client';

/**
 * Screen-time video player
 *
 * - Tracks visible screen time (seconds) while the page is visible.
 * - Persists elapsed seconds in localStorage under key 'screenTimeSeconds'.
 * - When thresholds are reached, plays the configured video in a full-screen overlay
 *   and marks that milestone as played in localStorage to avoid repeated replay.
 *
 * Configuration:
 * - Edit `DEFAULT_CONFIG` or pass a config to initScreenTimeVideo.
 *
 * Integration:
 * - Import this module from your app entrypoint (e.g., src/index.tsx)
 *   import { initScreenTimeVideo } from './utils/screenTimeVideo';
 *   initScreenTimeVideo();
 *
 * Notes:
 * - Videos are muted by default to allow autoplay; README explains user interaction for audio.
 */

/* --- Types --- */
type VideoConfig = {
  // URL or path to the video files (relative to site root or absolute URL)
  videoAt3h?: string; // exact 3h play (short window)
  video3to5h?: string; // 3-5h window video
  videoGt5h?: string; // >5h video
  // Seconds to consider "exact 3h" window (default 60 seconds)
  exact3hWindowSec?: number;
  // LocalStorage key prefix
  storagePrefix?: string;
  // Allow disabling auto-play (module still tracks time)
  autoplayEnabled?: boolean;
  // Overlay z-index (default high)
  overlayZIndex?: number;
};

const DEFAULT_CONFIG: Required<VideoConfig> = {
  videoAt3h: '/videos/3h.mp4',
  video3to5h: '/videos/3to5h.mp4',
  videoGt5h: '/videos/gt5h.mp4',
  exact3hWindowSec: 60,
  storagePrefix: 'screenTimeVideo',
  autoplayEnabled: true,
  overlayZIndex: 999999,
};

/* --- Helpers --- */
const secs = (h: number) => h * 3600;
const STORAGE_KEYS = (prefix: string) => ({
  seconds: `${prefix}:seconds`,
  played3hExact: `${prefix}:played:3h_exact`,
  played3to5h: `${prefix}:played:3to5h`,
  playedGt5h: `${prefix}:played:gt5h`,
});

// Try a list of candidate URLs and return the first that the server responds OK to.
async function findFirstExisting(candidates: string[]): Promise<string | undefined> {
  for (const url of candidates) {
    try {
      // First try HEAD — quick and lightweight
      const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
      if (res && res.ok) return url;
    } catch (e) {
      // If HEAD fails (some hosts block it), try a small GET using Range to avoid full download
      try {
        const r = await fetch(url, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          cache: 'no-cache',
        });
        if (r && (r.ok || r.status === 206)) return url;
      } catch (e2) {
        // ignore and continue
      }
    }
  }
  return undefined;
}

/* --- Overlay React component --- */
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
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'black',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex,
      }}
      aria-hidden={false}
    >
      <video
        src={src}
        style={{ maxWidth: '100%', maxHeight: '100%' }}
        controls
        autoPlay={autoplay}
        muted={autoplay} // muted for autoplay reliability
        playsInline
        onEnded={onClose}
      />
      {/* Clicking outside the video closes */}
      <div
        onClick={onClose}
        style={{
          position: 'absolute',
          inset: 0,
        }}
      />
    </div>
  );
}

/* --- Core init function --- */
export function initScreenTimeVideo(userConfig?: VideoConfig) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const config = { ...DEFAULT_CONFIG, ...(userConfig || {}) };
  const keys = STORAGE_KEYS(config.storagePrefix);

  // Read stored seconds, fallback to zero
  let elapsed = parseInt(localStorage.getItem(keys.seconds) || '0', 10) || 0;
  let ticking = false;
  let tickHandle: number | null = null;

  // Ensure flags exist (boolean stored as '1')
  const playedFlag = (k: string) => localStorage.getItem(k) === '1';
  const setPlayed = (k: string) => localStorage.setItem(k, '1');

  const saveSeconds = () => localStorage.setItem(keys.seconds, String(elapsed));

  // Overlay mount helper
  const showVideo = (src: string) =>
    new Promise<void>((resolve) => {
      if (!config.autoplayEnabled) {
        // Do not auto open if disabled; caller can open via UI if desired.
        resolve();
        return;
      }
      const overlayRoot = document.createElement('div');
      overlayRoot.setAttribute('data-screen-time-video', '1');
      document.body.appendChild(overlayRoot);

      // createRoot requires container not to have children on initial call
      // Using React 18 createRoot if available
      try {
        const root = createRoot(overlayRoot);
        const cleanup = () => {
          try {
            root.unmount();
          } catch (e) {
            // ignore
          }
          if (overlayRoot.parentNode) overlayRoot.parentNode.removeChild(overlayRoot);
        };
        root.render(
          React.createElement(VideoOverlay, {
            src,
            onClose: () => {
              cleanup();
              resolve();
            },
            zIndex: config.overlayZIndex,
            autoplay: config.autoplayEnabled,
          })
        );
      } catch (err) {
        // Fallback: minimal DOM video insertion (no React)
        const v = document.createElement('video');
        v.src = src;
        v.controls = true;
        v.autoplay = config.autoplayEnabled;
        v.muted = config.autoplayEnabled;
        v.style.maxWidth = '100%';
        v.style.maxHeight = '100%';
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.inset = '0';
        overlay.style.background = 'black';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = String(config.overlayZIndex);
        overlay.appendChild(v);
        document.body.appendChild(overlay);
        v.addEventListener('ended', () => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
          resolve();
        });
      }
    });

  // Decide and trigger which video to play when thresholds met
  const checkThresholds = async () => {
    // priority: GT 5h > 3-5h > exact 3h
    const playedGt5 = playedFlag(keys.playedGt5h);
    const played3to5 = playedFlag(keys.played3to5h);
    const played3hExact = playedFlag(keys.played3hExact);

    if (elapsed >= secs(5) && !playedGt5) {
      try {
        const src = (await findFirstExisting([config.videoGt5h, config.videoGt5h + '.mp4'])) || config.videoGt5h;
        await showVideo(src);
      } catch {}
      setPlayed(keys.playedGt5h);
      return;
    }

    // elapsed in [3h, 5h)
    if (elapsed >= secs(3) && elapsed < secs(5)) {
      // Try exact 3h first if within small window
      const exactWindowEnd = secs(3) + config.exact3hWindowSec;
      if (!played3hExact && elapsed >= secs(3) && elapsed < exactWindowEnd) {
        try {
          const src = (await findFirstExisting([config.videoAt3h, config.videoAt3h + '.mp4'])) || config.videoAt3h;
          await showVideo(src);
        } catch {}
        setPlayed(keys.played3hExact);
        return;
      }

      // If exact missed, but not yet played 3-5h
      if (!played3to5) {
        try {
          const src = (await findFirstExisting([config.video3to5h, config.video3to5h + '.mp4'])) || config.video3to5h;
          await showVideo(src);
        } catch {}
        setPlayed(keys.played3to5h);
        return;
      }
    }
  };

  // Tick when visible
  const tick = async () => {
    elapsed += 1;
    saveSeconds();
    // Every tick check thresholds (cheap)
    await checkThresholds();
  };

  const startTicking = () => {
    if (ticking) return;
    ticking = true;
    // Use setInterval 1s
    tickHandle = window.setInterval(() => {
      tick().catch(() => {});
    }, 1000);
  };
  const stopTicking = () => {
    ticking = false;
    if (tickHandle !== null) {
      clearInterval(tickHandle);
      tickHandle = null;
    }
  };

  // Visibility + focus/blur handling: count time only when document.visible
  const handleVisibility = () => {
    if (document.visibilityState === 'visible') {
      startTicking();
    } else {
      stopTicking();
    }
  };

  document.addEventListener('visibilitychange', handleVisibility, false);
  window.addEventListener('focus', handleVisibility, false);
  window.addEventListener('blur', handleVisibility, false);

  // start if visible now
  if (document.visibilityState === 'visible') startTicking();

  // Expose a small control API on window for debugging/manually trigger
  const apiKey = '__screenTimeVideoAPI';
  // @ts-expect-error assign
  window[apiKey] = {
    getElapsed: () => elapsed,
    resetElapsed: () => {
      elapsed = 0;
      saveSeconds();
      localStorage.removeItem(keys.played3hExact);
      localStorage.removeItem(keys.played3to5h);
      localStorage.removeItem(keys.playedGt5h);
    },
    play3hExact: async () => {
      const src = (await findFirstExisting([config.videoAt3h, config.videoAt3h + '.mp4'])) || config.videoAt3h;
      await showVideo(src);
      setPlayed(keys.played3hExact);
    },
    play3to5h: async () => {
      const src = (await findFirstExisting([config.video3to5h, config.video3to5h + '.mp4'])) || config.video3to5h;
      await showVideo(src);
      setPlayed(keys.played3to5h);
    },
    playGt5h: async () => {
      const src = (await findFirstExisting([config.videoGt5h, config.videoGt5h + '.mp4'])) || config.videoGt5h;
      await showVideo(src);
      setPlayed(keys.playedGt5h);
    },
  };

  // return cleanup function
  return () => {
    stopTicking();
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('focus', handleVisibility);
    window.removeEventListener('blur', handleVisibility);
    try {
      // @ts-expect-error
      delete window[apiKey];
    } catch {}
  };
}

// Auto-initialize when module is imported, but allow config override by calling initScreenTimeVideo manually afterwards.
// If you want to avoid auto-init, import the module with a special query or remove the following block and call initScreenTimeVideo explicitly.
try {
  // If you don't want auto-init, remove/comment this call and initialize manually in your entrypoint.
  initScreenTimeVideo();
} catch (e) {
  // swallow errors on server-side or unusual environments
  // console.debug('screenTimeVideo init error', e);
}
