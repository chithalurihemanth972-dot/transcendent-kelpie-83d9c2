import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Soft temple ambience — a low drone with an occasional distant bell.
 * Synthesised with WebAudio so no audio asset ships.
 *
 * Autoplay policy: the context is only created after the user's first
 * real interaction. Nothing plays before that.
 */
export function useAmbience() {
  const [enabled, setEnabled] = useState(false);
  const [started, setStarted] = useState(false);

  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const nodesRef = useRef<OscillatorNode[]>([]);
  const bellTimerRef = useRef<number | null>(null);

  const teardown = useCallback(() => {
    if (bellTimerRef.current) window.clearTimeout(bellTimerRef.current);
    bellTimerRef.current = null;
    nodesRef.current.forEach((n) => { try { n.stop(); } catch { /* already stopped */ } });
    nodesRef.current = [];
    const ctx = ctxRef.current;
    ctxRef.current = null;
    masterRef.current = null;
    if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
  }, []);

  const build = useCallback(() => {
    if (ctxRef.current) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;

    const ctx = new Ctor();
    ctxRef.current = ctx;

    const master = ctx.createGain();
    master.gain.value = 0;                       // fade in below
    master.connect(ctx.destination);
    masterRef.current = master;

    // Warm, slightly detuned drone (a tanpura-like fifth).
    const drone = ctx.createGain();
    drone.gain.value = 0.05;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 620;
    drone.connect(lp).connect(master);

    [98, 98.4, 147].forEach((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(drone);
      osc.start();
      nodesRef.current.push(osc);
    });

    // Slow breathing movement so it never feels static.
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.022;
    lfo.connect(lfoGain).connect(drone.gain);
    lfo.start();
    nodesRef.current.push(lfo);

    // Occasional distant bell.
    const ringBell = () => {
      const c = ctxRef.current;
      const m = masterRef.current;
      if (!c || !m) return;
      const now = c.currentTime;
      const partials = [1, 2.76, 5.4];
      partials.forEach((mult, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = 'sine';
        osc.frequency.value = 420 * mult;
        const peak = 0.05 / (i + 1.6);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(peak, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 3.4 + i);
        osc.connect(g).connect(m);
        osc.start(now);
        osc.stop(now + 4.6 + i);
      });
      bellTimerRef.current = window.setTimeout(ringBell, 14000 + Math.random() * 16000);
    };
    bellTimerRef.current = window.setTimeout(ringBell, 4200);

    // Gentle 3-second fade-in.
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + 3);
  }, []);

  /* Arm on the very first genuine interaction. */
  useEffect(() => {
    if (started) return;
    const arm = () => { setStarted(true); setEnabled(true); };
    const opts: AddEventListenerOptions = { once: true, passive: true };
    window.addEventListener('pointerdown', arm, opts);
    window.addEventListener('keydown', arm, opts);
    return () => {
      window.removeEventListener('pointerdown', arm);
      window.removeEventListener('keydown', arm);
    };
  }, [started]);

  useEffect(() => {
    if (!started) return;
    if (enabled) build();
    else teardown();
  }, [started, enabled, build, teardown]);

  /* Pause while the tab is hidden. */
  useEffect(() => {
    const onVis = () => {
      const ctx = ctxRef.current;
      if (!ctx) return;
      if (document.hidden) void ctx.suspend().catch(() => undefined);
      else if (enabled) void ctx.resume().catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [enabled]);

  useEffect(() => teardown, [teardown]);

  return { enabled, started, toggle: () => setEnabled((v) => !v) };
}
