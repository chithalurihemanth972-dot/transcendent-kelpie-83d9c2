import { useEffect, useRef, useState } from 'react';
import { motion, useScroll, useSpring, useTransform } from 'framer-motion';
import { ShieldCheck, Hand } from 'lucide-react';
import BlinkingGanesha from './BlinkingGanesha';
import Petal from './Petal';
import HeroSections from './HeroSections';
import { usePointerParallax } from '../hooks/usePointerParallax';

/* one easing, everywhere */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface HeroPageProps {
  onStart: () => void;
}

/* ── ambient petals ── */
const PETALS = Array.from({ length: 16 }, (_, i) => ({
  id: i,
  left: `${2 + ((i * 61) % 96)}%`,
  delay: `${(i * 0.9) % 12}s`,
  duration: `${9 + (i % 5) * 2}s`,
  size: 0.55 + ((i * 7) % 10) / 14,
  drift: i % 2 ? 14 : -12,
}));

/* ── golden bokeh dust ── */
const BOKEH = Array.from({ length: 14 }, (_, i) => ({
  id: i,
  left: `${(i * 137) % 100}%`,
  top: `${15 + ((i * 53) % 70)}%`,
  size: 3 + (i % 4) * 3,
  delay: `${(i * 0.7) % 6}s`,
  duration: `${5 + (i % 4) * 1.5}s`,
}));

/* grain texture (SVG turbulence, inline) */
const GRAIN =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export default function HeroPage({ onStart }: HeroPageProps) {
  const [ready, setReady] = useState(false);
  const [smile, setSmile] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const sectionsRef = useRef<HTMLDivElement>(null);

  /* page scroll → progress rail + cue fade */
  const { scrollYProgress } = useScroll();
  const railScale = useSpring(scrollYProgress, { stiffness: 120, damping: 28, mass: 0.4 });
  const cueOpacity = useTransform(scrollYProgress, [0, 0.06], [1, 0]);

  useEffect(() => {
    const t = setTimeout(() => setReady(true), 120);
    return () => clearTimeout(t);
  }, []);

  /* smooth rAF-lerped pointer parallax → CSS vars drive layered depth */
  usePointerParallax(rootRef, 0.075);

  return (
    <div className="hp-scroll">
      {/* scroll progress rail */}
      <motion.div className="scroll-rail" style={{ scaleX: railScale }} aria-hidden />

      <div className="hp" ref={rootRef}>
      {/* ═══ LAYER 0 · preserved 3D temple ═══ */}
      <div className="hp-bg" />
      <div className="hp-vignette" />
      <div className="hp-sides" />

      {/* ═══ LAYER 1 · rotating god-rays ═══ */}
      <div className="hp-rays" aria-hidden />

      {/* ═══ LAYER 2 · bokeh + petals + grain ═══ */}
      {BOKEH.map((b) => (
        <span
          key={b.id}
          className="hp-bokeh"
          style={{
            left: b.left,
            top: b.top,
            width: b.size,
            height: b.size,
            animationDelay: b.delay,
            animationDuration: b.duration,
          }}
        />
      ))}
      {PETALS.map((p) => (
        <span
          key={p.id}
          className="hp-petal"
          style={{
            left: p.left,
            fontSize: `${p.size}rem`,
            animationDelay: p.delay,
            animationDuration: p.duration,
            ['--drift' as string]: `${p.drift}px`,
          }}
        >
          <Petal />
        </span>
      ))}
      <div className="hp-grain" style={{ backgroundImage: GRAIN }} aria-hidden />

      {/* ═══ LAYER 3 · content ═══ */}
      <div className="hp-content">
        {/* ─── OM MEDALLION + SLOKA ─── */}
        <motion.header
          className="hp-top"
          initial={{ opacity: 0, y: -28 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : -28 }}
          transition={{ duration: 1, delay: 0.1, ease: EASE }}
        >
          <div className="om-medallion hp-parallax" data-depth="6">
            <span className="om-halo" />
            <span className="om-ring om-ring-a" />
            <span className="om-ring om-ring-b" />
            <span className="om-ticks">
              {Array.from({ length: 12 }, (_, i) => (
                <i key={i} style={{ ['--a' as string]: `${i * 30}deg` }} />
              ))}
            </span>
            <motion.span
              className="om-glyph"
              animate={{
                textShadow: [
                  '0 0 18px rgba(255,214,120,0.55), 0 0 46px rgba(232,184,75,0.28)',
                  '0 0 26px rgba(255,224,150,0.85), 0 0 70px rgba(232,184,75,0.45)',
                  '0 0 18px rgba(255,214,120,0.55), 0 0 46px rgba(232,184,75,0.28)',
                ],
              }}
              transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              ॐ
            </motion.span>
          </div>

          <div className="sloka">
            <span className="sloka-rule"><i /></span>
            <SlokaGem />
            <p className="sloka-text font-hindi" style={{ fontSize: 'clamp(0.95rem, 2.6vw, 1.3rem)' }}>
              ॥ ॐ गं गणपतये नमः ॥
            </p>
            <SlokaGem />
            <span className="sloka-rule"><i /></span>
          </div>
        </motion.header>

        {/* ─── DIVINE GANESHA ─── */}
        <motion.div
          className="hp-stage"
          initial={{ opacity: 0, scale: 0.86, y: 40 }}
          animate={{ opacity: ready ? 1 : 0, scale: ready ? 1 : 0.86, y: ready ? 0 : 40 }}
          transition={{ duration: 1.2, delay: 0.22, ease: EASE }}
        >
          {/* parallax depth wrapper */}
          <div className="hp-parallax" data-depth="-14">
            {/* layered divine glow */}
            <span className="glow glow-a" />
            <span className="glow glow-b" />
            <span className="glow glow-c" />

            {/* soft light rays fanning behind deity */}
            <span className="deity-rays" aria-hidden />

            {/* floating wrapper */}
            <motion.div
              className="ganesha-float"
              animate={{ y: [0, -9, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* ground shadow under lotus */}
              <motion.span
                className="lotus-shadow"
                animate={{ scaleX: [1, 0.92, 1], opacity: [0.55, 0.4, 0.55] }}
                transition={{ duration: 6.5, repeat: Infinity, ease: 'easeInOut' }}
              />
              <BlinkingGanesha
                src="/images/ganesha-divine.png"
                blinkSrc="/images/ganesha-blink.png"
                alt="Lord Vinayaka"
                className="ganesha-img"
                drag3d
                track
                smile={smile}
              />
            </motion.div>
          </div>

          {/* drag-to-turn hint */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ delay: 1.8, duration: 0.8 }}
            className="absolute bottom-0 left-1/2 -translate-x-1/2 flex items-center gap-1.5"
          >
            <span className="w-8 h-px" style={{ background: 'linear-gradient(90deg,transparent,rgba(232,184,75,.5))' }} />
            <Hand size={11} style={{ color: 'rgba(232,184,75,.6)' }} aria-hidden />
            <span className="font-telugu text-[10px] tracking-widest" style={{ color: 'rgba(232,184,75,.6)' }}>
              తిప్పి చూడండి
            </span>
            <Hand size={11} style={{ color: 'rgba(232,184,75,.6)', transform: 'scaleX(-1)' }} aria-hidden />
            <span className="w-8 h-px" style={{ background: 'linear-gradient(90deg,rgba(232,184,75,.5),transparent)' }} />
          </motion.div>
        </motion.div>

        {/* ─── TITLE + CTA ─── */}
        <motion.footer
          className="hp-bottom"
          initial={{ opacity: 0, y: 36 }}
          animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 36 }}
          transition={{ duration: 1, delay: 0.42, ease: EASE }}
        >
          <div className="title-mask">
            <motion.h1
              className="hp-title"
              initial={{ y: '110%', filter: 'blur(10px)' }}
              animate={{ y: '0%', filter: 'blur(0px)' }}
              transition={{ duration: 1, delay: 0.55, ease: EASE }}
            >
              డిజిటల్ సమతుల్యత
            </motion.h1>
          </div>

          <motion.p
            className="hp-sub"
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ delay: 1.15, duration: 0.9 }}
          >
            వినాయకుడితో ఆరోగ్యకరమైన డిజిటల్ జీవనం
          </motion.p>

          <motion.button
            className="cta"
            onClick={onStart}
            onHoverStart={() => setSmile(true)}
            onHoverEnd={() => setSmile(false)}
            onFocus={() => setSmile(true)}
            onBlur={() => setSmile(false)}
            whileHover={{ scale: 1.05, y: -2 }}
            whileTap={{ scale: 0.97 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 1 : 0 }}
            transition={{ delay: 1.3, duration: 0.7 }}
          >
            <span className="cta-shine" aria-hidden />
            <span className="cta-inner">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
              ప్రారంభించండి
            </span>
          </motion.button>

          <motion.p
            className="hp-trust"
            initial={{ opacity: 0 }}
            animate={{ opacity: ready ? 0.55 : 0 }}
            transition={{ delay: 1.6, duration: 0.8 }}
          >
            <ShieldCheck size={12} aria-hidden />
            100% గోప్యత · మీ డేటా మీ వద్దే
          </motion.p>

          {/* brand signature */}
          <motion.div
            className="brand-sig"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: ready ? 1 : 0, y: ready ? 0 : 8 }}
            transition={{ delay: 1.85, duration: 0.9, ease: EASE }}
          >
            <span className="brand-rule" />
            <span className="brand-text">
              A <strong>PRIORIX</strong> PRODUCT
            </span>
            <span className="brand-rule flip" />
          </motion.div>
        </motion.footer>
      </div>

      {/* scroll cue */}
      <motion.button
        className="scroll-cue"
        onClick={() => sectionsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        style={{ opacity: cueOpacity }}
        initial={{ y: 10 }}
        animate={{ y: 0 }}
        transition={{ delay: 2.1, duration: 0.8, ease: EASE }}
        aria-label="Scroll for more"
      >
        <span className="scroll-cue-label font-telugu">క్రిందికి</span>
        <span className="scroll-cue-track"><span className="scroll-cue-dot" /></span>
      </motion.button>
      </div>

      {/* ═══ scroll storytelling ═══ */}
      <div ref={sectionsRef}>
        <HeroSections onStart={onStart} />
      </div>

      <style>{CSS}</style>
    </div>
  );
}

/* small gold rhombus flanking the shloka (SVG, not a text dingbat) */
function SlokaGem() {
  return (
    <svg width="9" height="9" viewBox="0 0 10 10" className="sloka-gem" aria-hidden focusable="false">
      <path d="M5 0 L10 5 L5 10 L0 5 Z" fill="currentColor" opacity="0.9" />
      <path d="M5 2.7 L7.3 5 L5 7.3 L2.7 5 Z" fill="#0a0608" opacity="0.5" />
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════════════
   STYLES — luxury temple system
   ═══════════════════════════════════════════════════════════════ */
const CSS = `
.hp-scroll{position:relative;width:100%;background:#0a0507;}

/* fixed scroll progress rail */
.scroll-rail{position:fixed;top:0;left:0;right:0;height:2px;z-index:60;
  transform-origin:0 50%;
  background:linear-gradient(90deg,#8B1E2D,#E8B84B 55%,#fff6dc);
  box-shadow:0 0 12px rgba(232,184,75,.5);}

/* scroll cue */
.scroll-cue{position:absolute;bottom:1.1rem;left:50%;transform:translateX(-50%);
  z-index:20;display:flex;flex-direction:column;align-items:center;gap:.45rem;
  background:none;border:none;cursor:pointer;padding:.4rem .8rem;}
.scroll-cue-label{font-size:.62rem;letter-spacing:.3em;text-indent:.3em;
  color:rgba(232,184,75,.55);transition:color .3s ease;}
.scroll-cue:hover .scroll-cue-label{color:rgba(255,233,173,.9)}
.scroll-cue-track{width:20px;height:32px;border-radius:12px;
  border:1px solid rgba(232,184,75,.45);display:flex;justify-content:center;
  padding-top:6px;transition:border-color .3s ease;}
.scroll-cue:hover .scroll-cue-track{border-color:rgba(255,233,173,.8)}
.scroll-cue-dot{width:3px;height:7px;border-radius:2px;background:#E8B84B;
  animation:cueFall 1.9s cubic-bezier(.22,1,.36,1) infinite;}
@keyframes cueFall{
  0%{transform:translateY(0);opacity:0}
  30%{opacity:1}
  70%{transform:translateY(11px);opacity:0}
  100%{transform:translateY(11px);opacity:0}}

.hp{
  --px:0; --py:0;
  position:relative; width:100%; height:100vh; height:100dvh;
  overflow:hidden; background:#0a0608;
  font-family:'Gurajada','Noto Sans Telugu',sans-serif;font-style:italic;
}

/* ── background (untouched) ── */
.hp-bg{position:absolute;inset:0;z-index:0;
  background:url('/images/hero-3d-bg.png') center/cover no-repeat;}
.hp-vignette{position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    radial-gradient(ellipse 85% 60% at 50% 102%, rgba(4,2,3,.9) 0%, transparent 68%),
    radial-gradient(ellipse 110% 42% at 50% -4%, rgba(4,2,3,.55) 0%, transparent 62%),
    linear-gradient(180deg, rgba(8,4,6,.42) 0%, rgba(8,4,6,.06) 42%, rgba(8,4,6,.72) 100%);}
.hp-sides{position:absolute;inset:0;z-index:2;pointer-events:none;
  background:linear-gradient(90deg, rgba(4,2,3,.62) 0%, transparent 24%, transparent 76%, rgba(4,2,3,.62) 100%);}

/* ── rotating god-rays ── */
.hp-rays{position:absolute;inset:-30%;z-index:2;pointer-events:none;
  background:conic-gradient(from 0deg at 50% 42%,
    transparent 0deg, rgba(255,214,140,.05) 8deg, transparent 16deg,
    transparent 42deg, rgba(255,214,140,.04) 50deg, transparent 58deg,
    transparent 96deg, rgba(255,214,140,.05) 104deg, transparent 112deg,
    transparent 150deg, rgba(255,214,140,.04) 158deg, transparent 166deg,
    transparent 210deg, rgba(255,214,140,.05) 218deg, transparent 226deg,
    transparent 268deg, rgba(255,214,140,.04) 276deg, transparent 284deg,
    transparent 330deg, rgba(255,214,140,.05) 338deg, transparent 346deg);
  mix-blend-mode:screen; animation:raysTurn 90s linear infinite; filter:blur(2px);}
@keyframes raysTurn{to{transform:rotate(360deg)}}

/* ── film grain ── */
.hp-grain{position:absolute;inset:0;z-index:4;pointer-events:none;
  opacity:.05; mix-blend-mode:overlay; background-size:160px 160px;}

/* ── content shell ── */
.hp-content{position:relative;z-index:10;height:100%;
  display:flex;flex-direction:column;align-items:center;justify-content:space-between;
  padding:clamp(1.1rem,3.2vh,2.1rem) clamp(1rem,4vw,2rem)
          max(env(safe-area-inset-bottom,1.2rem),1.4rem);}

/* parallax helper — driven by the rAF lerp hook, no CSS transition */
.hp-parallax{
  transform:translate3d(calc(var(--px,0)*var(--d,10)*1px), calc(var(--py,0)*var(--d,10)*.7px), 0);
  will-change:transform;}
.hp-parallax[data-depth="6"]{--d:6}
.hp-parallax[data-depth="-14"]{--d:-14}

/* let the float + glow layers composite cleanly */
.ganesha-float,.glow,.deity-rays,.hp-rays{will-change:transform,opacity}
.hp-petal,.hp-bokeh{will-change:transform,opacity}

/* ═══ OM MEDALLION ═══ */
.hp-top{display:flex;flex-direction:column;align-items:center;gap:.9rem}
.om-medallion{position:relative;width:86px;height:86px;
  display:flex;align-items:center;justify-content:center;}
.om-halo{position:absolute;inset:-26px;border-radius:50%;
  background:radial-gradient(circle, rgba(255,214,130,.28) 0%, rgba(232,184,75,.1) 45%, transparent 70%);
  animation:haloBreath 4s ease-in-out infinite;}
@keyframes haloBreath{0%,100%{transform:scale(1);opacity:.7}50%{transform:scale(1.14);opacity:1}}
.om-ring{position:absolute;border-radius:50%;pointer-events:none;}
.om-ring-a{inset:0;
  background:conic-gradient(from 0deg,#6e4a10,#f7dd93,#c8960c,#fff3c9,#8a5a12,#f7dd93,#6e4a10);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 2.5px),#000 calc(100% - 2px));
          mask:radial-gradient(farthest-side,transparent calc(100% - 2.5px),#000 calc(100% - 2px));
  animation:ringSpin 26s linear infinite; filter:drop-shadow(0 0 6px rgba(232,184,75,.5));}
.om-ring-b{inset:7px;
  background:repeating-conic-gradient(from 0deg, rgba(255,222,150,.9) 0deg 4deg, transparent 4deg 15deg);
  -webkit-mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1px));
          mask:radial-gradient(farthest-side,transparent calc(100% - 1.5px),#000 calc(100% - 1px));
  animation:ringSpin 40s linear infinite reverse; opacity:.7;}
@keyframes ringSpin{to{transform:rotate(360deg)}}
.om-ticks{position:absolute;inset:-9px;animation:ringSpin 60s linear infinite;}
.om-ticks i{position:absolute;left:50%;top:50%;width:3px;height:3px;border-radius:50%;
  background:#f0cd7a;box-shadow:0 0 6px rgba(240,205,122,.9);
  transform:rotate(var(--a)) translateY(-46px);}
.om-glyph{position:relative;font-family:'Rozha One',serif;font-style:normal;font-weight:400;
  font-size:2.3rem;line-height:1;
  background:linear-gradient(160deg,#fff8e0 0%,#f2cf72 34%,#c8960c 62%,#f7dd93 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 1px 1px rgba(0,0,0,.55));}

/* ═══ SLOKA ═══ */
.sloka{display:flex;align-items:center;gap:.7rem}
.sloka-rule{width:clamp(28px,7vw,64px);height:1px;position:relative;overflow:visible;}
.sloka-rule i{display:block;height:1px;
  background:linear-gradient(90deg,transparent,rgba(232,184,75,.75));}
.sloka-rule:last-child i{background:linear-gradient(90deg,rgba(232,184,75,.75),transparent);}
.sloka-gem{color:rgba(232,184,75,.75);flex-shrink:0;
  filter:drop-shadow(0 0 6px rgba(232,184,75,.6));}
.sloka-text{font-family:'Tiro Devanagari Hindi',serif;font-style:normal;
  font-size:clamp(.82rem,2.1vw,1.02rem);letter-spacing:.14em;
  background:linear-gradient(90deg,rgba(240,205,122,.65),#ffe9ad 50%,rgba(240,205,122,.65));
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 0 10px rgba(232,184,75,.35));}

/* ═══ STAGE / GANESHA ═══ */
.hp-stage{position:relative;flex:1;width:100%;
  display:flex;align-items:center;justify-content:center;min-height:0;}
.glow{position:absolute;left:50%;top:50%;border-radius:50%;pointer-events:none;
  transform:translate(-50%,-50%);}
.glow-a{width:min(78vmin,560px);height:min(78vmin,560px);
  background:radial-gradient(circle, rgba(232,184,75,.09) 0%, rgba(200,150,12,.04) 42%, transparent 68%);
  animation:glowBreathe 7s ease-in-out infinite;}
.glow-b{width:min(58vmin,420px);height:min(58vmin,420px);
  background:radial-gradient(circle, rgba(255,200,110,.14) 0%, rgba(232,184,75,.06) 48%, transparent 70%);
  animation:glowBreathe 5.5s ease-in-out infinite reverse;}
.glow-c{width:min(40vmin,300px);height:min(40vmin,300px);
  background:radial-gradient(circle, rgba(255,228,170,.2) 0%, transparent 62%);
  filter:blur(6px); animation:glowBreathe 4.2s ease-in-out infinite;}
@keyframes glowBreathe{0%,100%{transform:translate(-50%,-50%) scale(1);opacity:.85}
  50%{transform:translate(-50%,-50%) scale(1.07);opacity:1}}

.deity-rays{position:absolute;left:50%;top:50%;width:min(70vmin,520px);height:min(70vmin,520px);
  transform:translate(-50%,-50%);border-radius:50%;pointer-events:none;opacity:.5;
  background:repeating-conic-gradient(from 0deg,
    rgba(255,220,150,.14) 0deg 2deg, transparent 2deg 14deg);
  -webkit-mask:radial-gradient(circle,transparent 26%,#000 40%,transparent 68%);
          mask:radial-gradient(circle,transparent 26%,#000 40%,transparent 68%);
  animation:ringSpin 80s linear infinite;}

.ganesha-float{position:relative;display:flex;align-items:flex-end;justify-content:center;
  will-change:transform;}
.lotus-shadow{position:absolute;bottom:-14px;left:50%;width:58%;height:26px;
  transform:translateX(-50%);border-radius:50%;pointer-events:none;
  background:radial-gradient(ellipse, rgba(0,0,0,.5) 0%, rgba(0,0,0,.22) 45%, transparent 72%);
  filter:blur(7px);}
.ganesha-img{position:relative;width:clamp(300px,68vmin,640px);
  filter:drop-shadow(0 30px 52px rgba(0,0,0,.5))
         drop-shadow(0 0 84px rgba(232,184,75,.2))
         drop-shadow(0 8px 20px rgba(120,60,10,.38));}

/* ═══ TITLE + CTA ═══ */
.hp-bottom{display:flex;flex-direction:column;align-items:center;
  gap:clamp(.55rem,1.6vh,.9rem);width:100%;max-width:520px;}
.title-mask{overflow:hidden;padding:.1em 0;}
.hp-title{margin:0;font-family:'Gurajada',serif;font-style:italic;font-weight:400;
  font-size:clamp(2rem,7vw,3.4rem);line-height:1.15;letter-spacing:.01em;text-align:center;
  background:linear-gradient(180deg,#ffffff 0%,#fff3d0 38%,#eec066 74%,#b9820e 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 3px 10px rgba(0,0,0,.6)) drop-shadow(0 6px 30px rgba(232,184,75,.22));}
.hp-sub{margin:0;font-family:'Gurajada',sans-serif;font-style:italic;font-weight:400;
  font-size:clamp(.86rem,2.3vw,1.12rem);letter-spacing:.05em;text-align:center;
  color:rgba(240,210,150,.82); text-shadow:0 1px 10px rgba(0,0,0,.6);}

.cta{position:relative;margin-top:.35rem;border:none;cursor:pointer;
  padding:clamp(.95rem,2.4vh,1.15rem) clamp(2.4rem,7vw,3.4rem);border-radius:999px;
  background:linear-gradient(135deg,#a02436 0%,#6b0f1a 55%,#8b1e2d 100%);
  box-shadow:0 10px 34px rgba(139,30,45,.55), 0 3px 10px rgba(0,0,0,.4),
    inset 0 1px 0 rgba(255,255,255,.18), inset 0 -2px 6px rgba(0,0,0,.35);
  overflow:hidden;}
.cta::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1px;
  background:linear-gradient(160deg,rgba(255,222,150,.65),rgba(255,255,255,.05) 40%,rgba(255,222,150,.3));
  -webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);
  -webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none;}
.cta-shine{position:absolute;top:0;left:-120%;width:55%;height:100%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.28),transparent);
  transform:skewX(-18deg);animation:ctaShine 3.2s ease-in-out infinite;}
@keyframes ctaShine{0%{left:-120%}55%,100%{left:180%}}
.cta-inner{position:relative;z-index:1;display:flex;align-items:center;gap:.6rem;
  font-family:'Gurajada',serif;font-style:italic;font-weight:400;color:#fff;
  font-size:clamp(1rem,2.7vw,1.18rem);letter-spacing:.02em;
  text-shadow:0 1px 3px rgba(0,0,0,.4);}

.hp-trust{display:flex;align-items:center;gap:.4rem;margin:0;
  font-size:.72rem;letter-spacing:.06em;color:rgba(255,240,220,.5);}

/* ── brand signature ── */
.brand-sig{display:flex;align-items:center;justify-content:center;gap:.7rem;margin-top:.15rem}
.brand-rule{width:clamp(18px,5vw,38px);height:1px;
  background:linear-gradient(90deg,transparent,rgba(232,184,75,.55));}
.brand-rule.flip{background:linear-gradient(90deg,rgba(232,184,75,.55),transparent);}
.brand-text{font-family:'Rozha One',serif;font-style:normal;font-size:.6rem;
  letter-spacing:.34em;text-indent:.34em;white-space:nowrap;
  color:rgba(232,184,75,.5);}
.brand-text strong{font-weight:400;
  background:linear-gradient(180deg,#fff6dc,#e8b84b 55%,#b9820e);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 0 10px rgba(232,184,75,.35));}
@media (max-height:600px){ .brand-sig{display:none} }

/* ═══ responsive ═══ */
@media (max-height:720px){
  .om-medallion{width:70px;height:70px}
  .om-glyph{font-size:1.9rem}
  .om-ticks i{transform:rotate(var(--a)) translateY(-38px)}
  .ganesha-img{width:clamp(250px,55vmin,460px)}
}
@media (max-height:600px){
  .hp-sub{display:none}
  .sloka-rule{width:22px}
}
`;
