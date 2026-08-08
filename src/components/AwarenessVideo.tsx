import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Play, Pause, Volume2, VolumeX } from 'lucide-react';
import type { ScanStatus } from '../services/scanApi';

/**
 * Awareness video that auto-plays with the result reveal.
 *
 * Drop files at `public/videos/healthy.mp4` and `public/videos/warning.mp4`.
 * If they are absent the component degrades to a calm animated panel so the
 * result section never shows a broken player.
 *
 * Change (2026-08-08): if the repository contains the new screen-time
 * milestone videos (`/videos/3h.mp4`, `/videos/3to5h.mp4`, `/videos/gt5h.mp4`)
 * this component will *not* auto-play the old awareness videos. This lets
 * you upload new milestone videos without the old players also playing.
 */
export default function AwarenessVideo({ status }: { status: ScanStatus }) {
  const healthy = status === 'healthy';
  const src = healthy ? '/videos/healthy.mp4' : '/videos/warning.mp4';
  const accent = healthy ? '#4CAF50' : '#FF7043';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [available, setAvailable] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);

  /*
   * Auto-play once mounted — but first check if the new screen-time videos
   * exist. If they do, disable auto-play of these awareness videos so only
   * the new milestone videos will be used by the site.
   */
  useEffect(() => {
    let mounted = true;
    let t: number | null = null;

    async function init() {
      // Check for any of the new milestone video files. Use HEAD requests where
      // possible so we don't download the entire file. If any exist, disable
      // this awareness player (component will render fallback panel instead).
      try {
        const candidates = ['/videos/3h.mp4', '/videos/3to5h.mp4', '/videos/gt5h.mp4'];
        for (const u of candidates) {
          try {
            const res = await fetch(u, { method: 'HEAD' });
            if (res && res.ok) {
              if (mounted) setAvailable(false);
              return; // stop: new milestone videos are present
            }
          } catch (e) {
            // ignore network errors per-file and continue
          }
        }
      } catch (e) {
        // ignore global errors and proceed to normal behavior
      }

      // No new milestone videos found; proceed to auto-play this awareness video
      const el = videoRef.current;
      if (!el) return;
      el.muted = true;
      t = window.setTimeout(() => {
        el
          .play()
          .then(() => mounted && setPlaying(true))
          .catch(() => mounted && setPlaying(false));
      }, 450);
    }

    init();

    return () => {
      mounted = false;
      if (t) window.clearTimeout(t);
    };
  }, []);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => undefined);
    else {
      el.pause();
      setPlaying(false);
    }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
      className="w-full rounded-2xl overflow-hidden relative"
      style={{
        border: `1px solid ${healthy ? 'rgba(76,175,80,0.28)' : 'rgba(255,112,67,0.28)'}`,
        background: 'rgba(255,255,255,0.04)',
        aspectRatio: '16 / 9',
      }}
    >
      {available ? (
        <>
          <video
            ref={videoRef}
            className="absolute inset-0 w-full h-full object-cover"
            src={src}
            loop
            playsInline
            muted={muted}
            preload="auto"
            onError={() => setAvailable(false)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
          {/* controls */}
          <div className="absolute bottom-2 right-2 flex gap-1.5 z-10">
            <button
              onClick={toggle}
              aria-label={playing ? 'Pause video' : 'Play video'}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(8,4,6,0.66)', border: '1px solid rgba(232,184,75,0.35)', color: '#ffe9ad' }}
            >
              {playing ? <Pause size={13} /> : <Play size={13} />}
            </button>
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute video' : 'Mute video'}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{ background: 'rgba(8,4,6,0.66)', border: '1px solid rgba(232,184,75,0.35)', color: '#ffe9ad' }}
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
          </div>
        </>
      ) : (
        // fallback calm panel (existing behavior) — same content as before when files missing
        <div className="w-full h-full flex items-center justify-center p-6 text-center">
          <div>
            <h3 style={{ color: accent }} className="text-lg font-semibold mb-2">
              {healthy ? 'Healthy' : 'Warning'}
            </h3>
            <p style={{ color: 'rgba(255,255,255,0.8)' }} className="text-sm">
              {healthy
                ? 'Great job — keep up the healthy habits. (Awareness video replaced by milestone video.)'
                : 'Please review the guidance — this area shows tailored support. (Awareness video replaced by milestone video.)'}
            </p>
          </div>
        </div>
      )}
    </motion.div>
  );
}
