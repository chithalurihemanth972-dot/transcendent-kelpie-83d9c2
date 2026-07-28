import { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { getCleanGanesha } from '../utils/cleanImage';

interface BlinkingGaneshaProps {
  src: string;
  blinkSrc: string;
  alt?: string;
  className?: string;
  style?: React.CSSProperties;
  /** click → blissful bounce + petal burst */
  interactive?: boolean;
  /** eyes + head gently follow the pointer (spring physics) */
  track?: boolean;
  /** force the joyful smiling face (e.g. CTA hover) */
  smile?: boolean;
  /** fire one celebration burst shortly after mount */
  celebrate?: boolean;
  /** drag-to-turn pseudo-3D: pointer drag rotates the idol with perspective */
  drag3d?: boolean;
}

interface Burst {
  id: number;
  angle: number;
  dist: number;
  glyph: string;
  delay: number;
}

const GLYPHS = ['✦', '✧', '✦', '·'];
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Lord Ganesha, alive —
 *  · true-alpha matte on both eye states (no white box)
 *  · organic joyful blinks every ~3–6 s (with occasional double-blinks)
 *  · spring-damped gaze that follows the pointer, as if he watches you
 *  · `smile` swaps to the blissful closed-eye blessing face
 *  · click / celebrate → bounce + petal-and-light burst
 */
export default function BlinkingGanesha({
  src,
  blinkSrc,
  alt = 'Lord Ganesha',
  className,
  style,
  interactive = false,
  track = false,
  smile = false,
  celebrate = false,
  drag3d = false,
}: BlinkingGaneshaProps) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  const [blinkUrl, setBlinkUrl] = useState<string | null>(null);
  const [blinking, setBlinking] = useState(false);
  const [joyKey, setJoyKey] = useState(0);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [ready, setReady] = useState(false);
  const [dragging, setDragging] = useState(false);
  const nextId = useRef(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const fireBurstRef = useRef<() => void>(() => undefined);

  useEffect(() => getCleanGanesha(src, (u) => { setOpenUrl(u); setReady(true); }), [src]);
  useEffect(() => getCleanGanesha(blinkSrc, setBlinkUrl), [blinkSrc]);

  /* ── gaze tracking — snappy but soft, settles like a real head turn ── */
  const tx = useMotionValue(0);
  const ty = useMotionValue(0);
  const tr = useMotionValue(0);
  const sx = useSpring(tx, { stiffness: 130, damping: 20, mass: 0.5 });
  const sy = useSpring(ty, { stiffness: 130, damping: 20, mass: 0.5 });
  const sr = useSpring(tr, { stiffness: 95, damping: 17, mass: 0.5 });

  useEffect(() => {
    if (!track) return;
    const onMove = (e: PointerEvent) => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      tx.set(clamp(dx * 30, -14, 14));
      ty.set(clamp(dy * 20, -10, 10));
      sr.set(clamp(dx * 6, -2.6, 2.6));
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [track, tx, ty, sr]);

  /* ── drag-to-turn pseudo-3D ── */
  const dryRaw = useMotionValue(0);
  const drxRaw = useMotionValue(0);
  const dry = useSpring(dryRaw, { stiffness: 120, damping: 18, mass: 0.5 });
  const drx = useSpring(drxRaw, { stiffness: 120, damping: 18, mass: 0.5 });
  /* moving specular sheen that tracks the turn */
  const sheenX = useTransform(dry, [-22, 22], ['-26%', '26%']);

  useEffect(() => {
    if (!drag3d) return;
    const el = wrapRef.current;
    if (!el) return;
    let startX = 0, startY = 0, baseY = 0, baseX = 0;

    const onDown = (e: PointerEvent) => {
      startX = e.clientX; startY = e.clientY;
      baseY = dryRaw.get(); baseX = drxRaw.get();
      setDragging(true);
      el.setPointerCapture(e.pointerId);
    };
    const onMove = (e: PointerEvent) => {
      if (!dragging) return;
      const dy = (e.clientX - startX) * 0.28;
      const dx = (e.clientY - startY) * 0.16;
      dryRaw.set(clamp(baseY + dy, -22, 22));
      drxRaw.set(clamp(baseX - dx, -12, 12));
    };
    const onUp = (e: PointerEvent) => {
      setDragging(false);
      dryRaw.set(0);
      drxRaw.set(0);
      /* a gentle tap (tiny movement) = a joyful poke */
      const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (moved < 6) fireBurstRef.current();
    };

    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
  }, [drag3d, dragging, dryRaw, drxRaw]);

  /* ── organic blink loop ── */
  useEffect(() => {
    let t: number;
    const loop = () => {
      t = window.setTimeout(() => {
        setBlinking(true);
        window.setTimeout(() => setBlinking(false), 150);
        if (Math.random() < 0.28) {
          window.setTimeout(() => {
            setBlinking(true);
            window.setTimeout(() => setBlinking(false), 130);
          }, 260);
        }
        loop();
      }, 2600 + Math.random() * 3400);
    };
    loop();
    return () => window.clearTimeout(t);
  }, []);

  const fireBurst = () => {
    setJoyKey((k) => k + 1);
    const base = nextId.current;
    nextId.current += 12;
    const items: Burst[] = Array.from({ length: 12 }, (_, i) => ({
      id: base + i,
      angle: (i / 12) * 360 + (Math.random() * 24 - 12),
      dist: 80 + Math.random() * 90,
      glyph: GLYPHS[i % GLYPHS.length],
      delay: Math.random() * 0.12,
    }));
    setBursts((b) => [...b, ...items]);
    window.setTimeout(
      () => setBursts((b) => b.filter((x) => x.id < base || x.id >= base + 12)),
      1300,
    );
  };
  fireBurstRef.current = fireBurst;

  /* celebrate shortly after mount (results reveal) */
  useEffect(() => {
    if (!celebrate) return;
    const t = window.setTimeout(fireBurst, 750);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [celebrate]);

  const showHappy = (smile || blinking) && !!blinkUrl;

  return (
    <motion.div
      ref={wrapRef}
      className={className}
      style={{
        ...style,
        x: sx, y: sy, rotate: sr,
        transformPerspective: 1100,
        rotateY: drag3d ? dry : 0,
        rotateX: drag3d ? drx : 0,
        cursor: drag3d ? (dragging ? 'grabbing' : 'grab') : interactive ? 'pointer' : undefined,
        willChange: 'transform',
      }}
      onClick={interactive && !drag3d ? fireBurst : undefined}
      whileHover={interactive && !drag3d ? { scale: 1.015 } : undefined}
    >
      {/* joy bounce layer */}
      <motion.div
        key={joyKey}
        initial={false}
        animate={
          interactive && joyKey > 0
            ? { scale: [1, 1.06, 0.975, 1.015, 1], rotate: [0, -1.2, 1.2, 0] }
            : celebrate && joyKey > 0
              ? { scale: [1, 1.05, 1] }
              : { scale: 1 }
        }
        transition={{ duration: 0.7, ease: [0.34, 1.56, 0.64, 1] }}
        className="relative"
      >
        {/* open eyes */}
        <img
          src={openUrl ?? src}
          alt={alt}
          draggable={false}
          className="relative block w-full h-auto object-contain select-none"
          style={{ opacity: ready ? (showHappy ? 0 : 1) : 0, transition: 'opacity 0.16s ease' }}
        />
        {/* joyful smiling face */}
        {blinkUrl && (
          <img
            src={blinkUrl}
            alt=""
            aria-hidden
            draggable={false}
            className="absolute inset-0 w-full h-full object-contain select-none"
            style={{ opacity: showHappy && ready ? 1 : 0, transition: 'opacity 0.16s ease' }}
          />
        )}

        {/* moving specular sheen while turning (pseudo-3D light) */}
        {drag3d && (
          <motion.span
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              x: sheenX,
              background:
                'linear-gradient(105deg, transparent 38%, rgba(255,240,200,0.16) 50%, transparent 62%)',
              mixBlendMode: 'screen',
            }}
          />
        )}

        {bursts.map((b) => {
          const rad = (b.angle * Math.PI) / 180;
          return (
            <motion.span
              key={b.id}
              className="joy-spark"
              initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }}
              animate={{
                x: Math.cos(rad) * b.dist,
                y: Math.sin(rad) * b.dist - 30,
                opacity: [0, 1, 0],
                scale: [0.4, 1.1, 0.6],
                rotate: b.angle,
              }}
              transition={{ duration: 1.05, delay: b.delay, ease: 'easeOut' }}
            >
              {b.glyph}
            </motion.span>
          );
        })}
      </motion.div>
    </motion.div>
  );
}
