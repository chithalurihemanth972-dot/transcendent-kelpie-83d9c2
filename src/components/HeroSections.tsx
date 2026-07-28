import { useRef } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { ScanLine, Sparkles, LineChart, ShieldCheck, Clock, Leaf } from 'lucide-react';
import Reveal, { RevealGroup, RevealItem, RevealWords } from './Reveal';
import Petal from './Petal';

/* ── gold divider with a centred diamond ── */
function GoldDivider({ width = 220 }: { width?: number }) {
  return (
    <svg width={width} height="14" viewBox="0 0 220 14" aria-hidden className="opacity-70">
      <g stroke="#E8B84B" fill="none" strokeLinecap="round">
        <path d="M0 7 H86" strokeWidth="1" opacity="0.45" />
        <path d="M134 7 H220" strokeWidth="1" opacity="0.45" />
        <path d="M96 7 L110 1 L124 7 L110 13 Z" strokeWidth="1" opacity="0.9" />
      </g>
      <circle cx="110" cy="7" r="2" fill="#E8B84B" />
      <circle cx="90" cy="7" r="1.3" fill="#E8B84B" opacity="0.6" />
      <circle cx="130" cy="7" r="1.3" fill="#E8B84B" opacity="0.6" />
    </svg>
  );
}

/* ── ornate arch card (temple niche) ── */
function ArchCard({
  index, icon, title, body,
}: { index: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="arch-card group">
      <span className="arch-glow" aria-hidden />
      <div className="arch-num font-latin">{index}</div>
      <div className="arch-icon">{icon}</div>
      <h3 className="arch-title font-telugu">{title}</h3>
      <p className="arch-body font-telugu">{body}</p>
      <span className="arch-base" aria-hidden />
    </div>
  );
}

const STEPS = [
  {
    index: 'I',
    icon: <ScanLine size={22} />,
    title: 'స్క్రీన్ చూపించండి',
    body: 'మీ ఫోన్‌లోని స్క్రీన్ టైమ్ పేజీని కెమెరా ముందు ఉంచండి. క్షణంలో చదువుతాము.',
  },
  {
    index: 'II',
    icon: <Sparkles size={22} />,
    title: 'వినాయకుడు విశ్లేషిస్తాడు',
    body: 'మీ వినియోగాన్ని పరిశీలించి, ఆరోగ్యకరమైన సమతుల్యతను లెక్కిస్తాము.',
  },
  {
    index: 'III',
    icon: <LineChart size={22} />,
    title: 'మార్గం తెలుసుకోండి',
    body: 'స్పష్టమైన ఫలితం, సున్నితమైన సూచనలు — మంచి అలవాట్ల వైపు తొలి అడుగు.',
  },
];

const VALUES = [
  { icon: <ShieldCheck size={19} />, k: '100%', label: 'గోప్యత' },
  { icon: <Clock size={19} />, k: '< 5s', label: 'ఫలితం' },
  { icon: <Leaf size={19} />, k: '0', label: 'డేటా నిల్వ' },
];

export default function HeroSections({ onStart }: { onStart: () => void }) {
  const philRef = useRef<HTMLElement>(null);

  /* scroll-linked parallax for the philosophy band */
  const { scrollYProgress } = useScroll({
    target: philRef,
    offset: ['start end', 'end start'],
  });
  const bgY = useTransform(scrollYProgress, [0, 1], ['-12%', '12%']);
  const glowScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.85, 1.15, 0.85]);
  const quoteY = useTransform(scrollYProgress, [0, 1], ['22%', '-22%']);

  return (
    <div className="hs-root">
      {/* ══════ RITUAL — three steps ══════ */}
      <section className="hs-section">
        <div className="hs-inner">
          <Reveal mode="fade" className="flex justify-center mb-3">
            <span className="hs-eyebrow font-telugu">విధానం</span>
          </Reveal>

          <h2 className="hs-h2 font-telugu">
            <RevealWords text="మూడు అడుగుల్లో సమతుల్యత" />
          </h2>

          <Reveal mode="fade" delay={0.15} className="flex justify-center mt-5 mb-14 text-[#E8B84B]">
            <GoldDivider />
          </Reveal>

          <RevealGroup className="hs-grid" stagger={0.15}>
            {STEPS.map((s) => (
              <RevealItem key={s.index} mode="up">
                <ArchCard {...s} />
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ══════ PHILOSOPHY — parallax band ══════ */}
      <section className="hs-phil" ref={philRef}>
        <motion.div className="hs-phil-bg" style={{ y: bgY }} aria-hidden />
        <motion.span className="hs-phil-glow" style={{ scale: glowScale }} aria-hidden />

        {/* drifting petals */}
        {Array.from({ length: 7 }, (_, i) => (
          <span
            key={i}
            className="hp-petal"
            style={{
              position: 'absolute',
              left: `${8 + i * 13}%`,
              fontSize: `${0.6 + (i % 3) * 0.22}rem`,
              animationDelay: `${i * 1.4}s`,
              animationDuration: `${11 + (i % 4) * 3}s`,
              ['--drift' as string]: `${i % 2 ? 16 : -14}px`,
            }}
          >
            <Petal />
          </span>
        ))}

        <motion.div className="hs-phil-inner" style={{ y: quoteY }}>
          <Reveal mode="scale" duration={1.1}>
            <p className="hs-quote-mark font-hindi" aria-hidden>॥</p>
          </Reveal>

          <h2 className="hs-quote font-telugu">
            <RevealWords text="సమతుల్యమైన డిజిటల్ జీవనమే నిజమైన సమృద్ధి" />
          </h2>

          <Reveal mode="fade" delay={0.35}>
            <p className="hs-quote-sub font-telugu">
              ప్రతి క్షణం మీదే — దానిని ఎలా గడపాలో మీరే నిర్ణయించండి.
            </p>
          </Reveal>
        </motion.div>
      </section>

      {/* ══════ ASSURANCE ══════ */}
      <section className="hs-section hs-section-tight">
        <div className="hs-inner">
          <RevealGroup className="hs-values" stagger={0.14}>
            {VALUES.map((v) => (
              <RevealItem key={v.label} mode="scale">
                <div className="value-cell">
                  <span className="value-icon">{v.icon}</span>
                  <span className="value-k font-latin">{v.k}</span>
                  <span className="value-label font-telugu">{v.label}</span>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </section>

      {/* ══════ CLOSING CTA ══════ */}
      <section className="hs-closing">
        <div className="hs-inner text-center">
          <Reveal mode="fade" className="flex justify-center mb-6 text-[#E8B84B]">
            <GoldDivider width={280} />
          </Reveal>

          <Reveal mode="blur" duration={1.1}>
            <p className="hs-closing-sloka font-hindi">॥ ॐ गं गणपतये नमः ॥</p>
          </Reveal>

          <h2 className="hs-closing-h font-telugu">
            <RevealWords text="ఇప్పుడే ప్రారంభించండి" />
          </h2>

          <Reveal mode="up" delay={0.25}>
            <motion.button
              className="btn-divine mt-8"
              onClick={onStart}
              whileHover={{ scale: 1.045, y: -3 }}
              whileTap={{ scale: 0.97 }}
            >
              <Sparkles size={18} style={{ color: '#ffe9ad' }} />
              <span>స్కాన్ చేయండి</span>
            </motion.button>
          </Reveal>

          <Reveal mode="fade" delay={0.45}>
            <p className="hs-closing-note font-telugu">
              <ShieldCheck size={11} aria-hidden />
              మీ చిత్రం ఎక్కడా నిల్వ చేయబడదు
            </p>
          </Reveal>

          <Reveal mode="fade" delay={0.6}>
            <div className="hs-brand">
              <span className="hs-brand-rule" />
              <span className="hs-brand-text font-latin">A <strong>PRIORIX</strong> PRODUCT</span>
              <span className="hs-brand-rule flip" />
            </div>
          </Reveal>
        </div>
      </section>

      <style>{CSS}</style>
    </div>
  );
}

const CSS = `
.hs-root{position:relative;background:
  linear-gradient(180deg,#0a0507 0%,#140a0d 22%,#0f070a 58%,#0a0507 100%);}

/* subtle repeating temple lattice */
.hs-root::before{content:'';position:absolute;inset:0;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70' viewBox='0 0 70 70'%3E%3Cg fill='none' stroke='%23E8B84B' stroke-width='0.7'%3E%3Cpath d='M35 2 L68 35 L35 68 L2 35 Z'/%3E%3Ccircle cx='35' cy='35' r='13'/%3E%3C/g%3E%3C/svg%3E");}

.hs-section{position:relative;padding:clamp(6rem,13vh,10rem) clamp(1.2rem,5vw,3rem);}
.hs-section-tight{padding-top:clamp(2rem,5vh,4rem);padding-bottom:clamp(3rem,7vh,5rem)}
.hs-inner{max-width:1180px;margin:0 auto;position:relative;z-index:2}

.hs-eyebrow{display:inline-block;font-size:.68rem;letter-spacing:.42em;text-indent:.42em;
  color:rgba(232,184,75,.7);padding:.45rem 1.3rem;border-radius:999px;
  border:1px solid rgba(232,184,75,.28);background:rgba(232,184,75,.05);}

.hs-h2{margin:0;text-align:center;font-size:clamp(1.9rem,5vw,3.1rem);line-height:1.28;
  background:linear-gradient(180deg,#fff 0%,#fff2cf 42%,#e2b45f 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 3px 14px rgba(0,0,0,.6));}

/* ── arch cards ── */
.hs-grid{display:grid;gap:clamp(1.4rem,3vw,2.2rem);
  grid-template-columns:repeat(auto-fit,minmax(268px,1fr));}

.arch-card{position:relative;height:100%;padding:3.2rem 1.9rem 2.6rem;text-align:center;
  border-radius:150px 150px 22px 22px;
  background:linear-gradient(180deg,rgba(40,17,22,.72),rgba(14,7,10,.85));
  border:1px solid rgba(232,184,75,.24);
  box-shadow:0 26px 60px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,233,173,.12);
  transition:transform .55s cubic-bezier(.22,1,.36,1), border-color .45s ease, box-shadow .55s ease;
  overflow:hidden;}
.arch-card:hover{transform:translateY(-10px);border-color:rgba(232,184,75,.55);
  box-shadow:0 36px 80px rgba(0,0,0,.6), 0 0 44px rgba(232,184,75,.14), inset 0 1px 0 rgba(255,233,173,.2);}

.arch-glow{position:absolute;top:-40%;left:50%;width:150%;height:120%;transform:translateX(-50%);
  background:radial-gradient(ellipse at 50% 40%, rgba(232,184,75,.16), transparent 62%);
  opacity:0;transition:opacity .55s ease;pointer-events:none;}
.arch-card:hover .arch-glow{opacity:1}

.arch-num{position:absolute;top:1.15rem;left:50%;transform:translateX(-50%);
  font-size:.82rem;letter-spacing:.22em;color:rgba(232,184,75,.55);}

.arch-icon{width:62px;height:62px;margin:0 auto 1.4rem;border-radius:50%;
  display:flex;align-items:center;justify-content:center;color:#ffe9ad;
  background:radial-gradient(circle at 34% 28%, rgba(255,233,173,.2), rgba(139,30,45,.4));
  border:1px solid rgba(232,184,75,.45);
  box-shadow:0 0 26px rgba(232,184,75,.2), inset 0 1px 0 rgba(255,255,255,.16);
  transition:transform .55s cubic-bezier(.34,1.56,.64,1), box-shadow .45s ease;}
.arch-card:hover .arch-icon{transform:scale(1.1) translateY(-3px);
  box-shadow:0 0 40px rgba(232,184,75,.4), inset 0 1px 0 rgba(255,255,255,.24);}

.arch-title{margin:0 0 .7rem;font-size:1.28rem;color:#fff6e2;}
.arch-body{margin:0;font-size:.94rem;line-height:1.75;color:rgba(255,240,215,.6);}

.arch-base{position:absolute;left:50%;bottom:0;transform:translateX(-50%);
  width:64%;height:1px;
  background:linear-gradient(90deg,transparent,rgba(232,184,75,.55),transparent);}

/* ── philosophy band ── */
.hs-phil{position:relative;overflow:hidden;isolation:isolate;
  min-height:clamp(520px,82vh,760px);
  display:flex;align-items:center;justify-content:center;
  padding:clamp(4rem,10vh,7rem) clamp(1.2rem,5vw,3rem);}
.hs-phil-bg{position:absolute;inset:-18% 0;z-index:0;
  background:url('/images/hero-3d-bg.png') center/cover no-repeat;
  opacity:.3;filter:saturate(.8);}
.hs-phil::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;
  background:
    radial-gradient(ellipse 65% 55% at 50% 50%, rgba(10,5,7,.55), rgba(10,5,7,.9) 78%),
    linear-gradient(180deg,#0a0507 0%,transparent 22%,transparent 78%,#0a0507 100%);}
.hs-phil-glow{position:absolute;left:50%;top:50%;width:min(78vmin,720px);height:min(78vmin,720px);
  margin:calc(min(78vmin,720px) / -2) 0 0 calc(min(78vmin,720px) / -2);
  border-radius:50%;z-index:1;pointer-events:none;
  background:radial-gradient(circle, rgba(232,184,75,.14) 0%, rgba(139,30,45,.08) 45%, transparent 70%);}
.hs-phil-inner{position:relative;z-index:3;max-width:900px;text-align:center}

.hs-quote-mark{font-size:clamp(2rem,5vw,3rem);color:rgba(232,184,75,.5);margin-bottom:.6rem;
  filter:drop-shadow(0 0 18px rgba(232,184,75,.35));}
.hs-quote{margin:0;font-size:clamp(1.75rem,5.4vw,3.6rem);line-height:1.4;
  background:linear-gradient(180deg,#fff 0%,#fff3d4 40%,#e0b158 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 4px 22px rgba(0,0,0,.65));}
.hs-quote-sub{margin:1.6rem 0 0;font-size:clamp(.92rem,2.2vw,1.12rem);
  color:rgba(255,238,210,.62);letter-spacing:.05em}

/* ── values ── */
.hs-values{display:grid;grid-template-columns:repeat(3,1fr);gap:clamp(.8rem,2.4vw,1.6rem);
  max-width:760px;margin:0 auto;}
.value-cell{display:flex;flex-direction:column;align-items:center;gap:.55rem;
  padding:1.9rem 1rem;border-radius:20px;
  background:linear-gradient(180deg,rgba(40,17,22,.5),rgba(14,7,10,.6));
  border:1px solid rgba(232,184,75,.18);
  transition:border-color .45s ease, transform .45s cubic-bezier(.22,1,.36,1);}
.value-cell:hover{border-color:rgba(232,184,75,.45);transform:translateY(-5px)}
.value-icon{color:#E8B84B;opacity:.85}
.value-k{font-size:clamp(1.3rem,3.4vw,1.85rem);
  background:linear-gradient(180deg,#fff6dc,#e8b84b 60%,#b9820e);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}
.value-label{font-size:.8rem;color:rgba(255,240,215,.5);letter-spacing:.12em}

/* ── closing ── */
.hs-closing{position:relative;padding:clamp(4rem,10vh,7rem) clamp(1.2rem,5vw,3rem) clamp(4rem,9vh,6rem);}
.hs-closing-sloka{font-size:clamp(1rem,2.6vw,1.35rem);letter-spacing:.06em;
  background:linear-gradient(90deg,rgba(240,205,122,.7),#ffe9ad 50%,rgba(240,205,122,.7));
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 0 14px rgba(232,184,75,.4));margin-bottom:1.1rem}
.hs-closing-h{margin:0;font-size:clamp(2rem,5.6vw,3.4rem);line-height:1.25;
  background:linear-gradient(180deg,#fff 0%,#fff2cf 42%,#e2b45f 100%);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;
  filter:drop-shadow(0 3px 14px rgba(0,0,0,.6));}
.hs-closing-note{display:flex;align-items:center;justify-content:center;gap:.4rem;
  margin-top:1.5rem;font-size:.75rem;color:rgba(255,240,220,.42);letter-spacing:.06em}

.hs-brand{display:flex;align-items:center;justify-content:center;gap:.8rem;margin-top:3.2rem}
.hs-brand-rule{width:clamp(22px,6vw,52px);height:1px;
  background:linear-gradient(90deg,transparent,rgba(232,184,75,.5));}
.hs-brand-rule.flip{background:linear-gradient(90deg,rgba(232,184,75,.5),transparent);}
.hs-brand-text{font-size:.6rem;letter-spacing:.34em;text-indent:.34em;
  color:rgba(232,184,75,.45);white-space:nowrap}
.hs-brand-text strong{font-weight:400;
  background:linear-gradient(180deg,#fff6dc,#e8b84b 55%,#b9820e);
  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}

@media (max-width:560px){
  .hs-values{grid-template-columns:1fr;max-width:320px}
  .arch-card{border-radius:120px 120px 20px 20px;padding:2.8rem 1.5rem 2.2rem}
}
`;
