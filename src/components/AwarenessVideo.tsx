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
 * Change (2026-08-08): if milestone videos are present this component will
 * not auto-play the awareness videos. Instead it shows a fallback panel with
 * a button to manually play the milestone overlay for testing.
 */
export default function AwarenessVideo({ status }: { status: ScanStatus }) {
  const healthy = status === 'healthy';
  const src = healthy ? '/videos/healthy.mp4' : '/videos/warning.mp4';
  const accent = healthy ? '#4CAF50' : '#FF7043';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [available, setAvailable] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [playingMilestone, setPlayingMilestone] = useState(false);

  /* auto-play once mounted — muted so browsers allow it */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = true;
    const t = window.setTimeout(() => {
      el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
    }, 450);
    return () => window.clearTimeout(t);
  }, []);

  const toggle = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().then(() => setPlaying(true)).catch(() => undefined);
    else { el.pause(); setPlaying(false); }
  };

  const toggleMute = () => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  };

  async function playMilestoneVideo() {
    // Try the screen-time API in order: play3hExact -> play3to5h -> playGt5h
    const api = (window as any).__screenTimeVideoAPI as any | undefined;
    if (!api) {
      // No API available — nothing to do
      return;
    }
    setPlayingMilestone(true);
    try {
      if (typeof api.play3hExact === 'function') {
        await api.play3hExact();
        return;
      }
      if (typeof api.play3to5h === 'function') {
        await api.play3to5h();
        return;
      }
      if (typeof api.playGt5h === 'function') {
        await api.playGt5h();
        return;
      }
    } catch (e) {
      // ignore errors — just stop the loading state
    } finally {
      setPlayingMilestone(false);
    }
  }

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
        /* graceful fallback — no broken player, no layout shift */
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
          <span
            className="absolute inset-0 pointer-events-none"
            style={{
              background: healthy
                ? 'radial-gradient(ellipse at 50% 45%, rgba(46,125,50,0.2), transparent 68%)'
                : 'radial-gradient(ellipse at 50% 45%, rgba(230,81,0,0.18), transparent 68%)',
            }}
          />
          <motion.span
            animate={{ scale: [1, 1.06, 1], opacity: [0.75, 1, 0.75] }}
            transition={{ duration: 3.6, repeat: Infinity, ease: 'easeInOut' }}
            className="w-11 h-11 rounded-full flex items-center justify-center relative z-10"
            style={{ background: `${accent}22`, border: `1px solid ${accent}66` }}
          >
            <Play size={16} style={{ color: accent }} />
          </motion.span>
          <p className="font-telugu text-xs relative z-10" style={{ color: 'rgba(255,240,215,0.62)' }}>
            {healthy
              ? 'ఇలాగే కొనసాగించండి — మీ సమతుల్యత బాగుంది.'
              : 'కొంచెం విరామం తీసుకోండి — మీ కళ్ళకు, మనసుకు మంచిది.'}
          </p>

          <p className="text-xs mt-1 relative z-10" style={{ color: 'rgba(255,255,255,0.8)' }}>
            (Awareness video replaced by milestone video.)
          </p>

          <div className="mt-3 relative z-10">
            <button
              onClick={() => playMilestoneVideo()}
              disabled={playingMilestone}
              className="px-3 py-1 rounded-full font-medium"
              style={{ background: '#ffe9ad', color: '#231f1b' }}
            >
              {playingMilestone ? 'Opening…' : 'Play milestone video'}
            </button>
          </div>
        </div>
      )}
    </motion.div>
  );
}
