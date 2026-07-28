import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { RefreshCw, Flower2, Check, AlertTriangle } from 'lucide-react';
import GaneshaFigure from './GaneshaFigure';
import BlinkingGanesha from './BlinkingGanesha';
import Petal from './Petal';
import AwarenessVideo from './AwarenessVideo';
import { ERROR_COPY, type ScanResult, type ScanFailure } from '../services/scanApi';

interface ResultsPageProps {
  onRetry: () => void;
  onHome: () => void;
  /** Verdict from the OCR backend. */
  result: ScanResult | null;
  /** Set when the scan failed unrecoverably. */
  failure?: ScanFailure | null;
}

type Phase = 'loading' | 'result';

const LOAD_STEPS = [
  'స్క్రీన్ చదువుతున్నాను...',
  'డేటా విశ్లేషిస్తున్నాను...',
  'ఫలితాలు తయారు చేస్తున్నాను...',
];

/* ring sizes for loading animation */
const RINGS = [
  { r: 44, stroke: 4, color: 'rgba(139,30,45,0.85)',  dash: 120, dur: 1.4 },
  { r: 58, stroke: 3, color: 'rgba(232,184,75,0.55)', dash: 70,  dur: 2.2 },
  { r: 72, stroke: 2, color: 'rgba(255,255,255,0.18)', dash: 50, dur: 3.0 },
];

const ARC_R = 60;
const ARC_C = 2 * Math.PI * ARC_R;

export default function ResultsPage({ onRetry, onHome, result, failure }: ResultsPageProps) {
  const [phase, setPhase]   = useState<Phase>('loading');
  const [stepIdx, setStep]  = useState(0);
  const [loadPct, setLoadPct] = useState(0);

  /* ── derive everything from the backend verdict ── */
  const minutes    = result?.minutes ?? 0;
  const limit      = result?.limit_minutes ?? 300;
  const isGood     = result ? result.status === 'healthy' : true;
  const today      = { hours: Math.floor(minutes / 60), mins: minutes % 60 };
  const pctRaw     = Math.min((minutes / Math.max(1, limit)) * 100, 100);
  const arcOffset  = ARC_C - (pctRaw / 100) * ARC_C;
  const confidence = Math.round((result?.confidence ?? 0) * 100);

  /* The OCR work already happened on the scanner screen, so this is a
     short, deliberate reveal beat rather than an artificial wait. */
  useEffect(() => {
    const REVEAL_MS = 1100;
    const interval = setInterval(() => {
      setLoadPct(p => (p >= 100 ? 100 : p + 7));
    }, 70);
    const stepTimer = setInterval(() => {
      setStep(s => (s + 1) % LOAD_STEPS.length);
    }, 420);
    const reveal = setTimeout(() => {
      clearInterval(interval);
      clearInterval(stepTimer);
      setLoadPct(100);
      setPhase('result');
    }, REVEAL_MS);

    return () => { clearInterval(interval); clearInterval(stepTimer); clearTimeout(reveal); };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden loading-bg flex flex-col items-center justify-center px-4">

      {/* soft background glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(139,30,45,0.18) 0%, transparent 70%)',
        }}
      />
      <div className="grain-layer" />

      {/* floating petals */}
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="petal" style={{
          left: `${10 + i * 11}%`,
          animationDelay: `${i * 0.7}s`,
          animationDuration: `${5 + i * 0.8}s`,
          top: '-20px', fontSize: '1rem',
        }}><Petal /></span>
      ))}

      <AnimatePresence mode="wait">

        {/* ─────── LOADING PHASE ─────── */}
        {phase === 'loading' && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}
            className="flex flex-col items-center gap-8 relative z-10 w-full max-w-sm"
          >
            {/* spinning rings + Ganesha */}
            <div className="relative flex items-center justify-center" style={{ width: 180, height: 180 }}>
              <svg width="180" height="180" viewBox="0 0 180 180" className="absolute inset-0">
                {RINGS.map((ring, idx) => (
                  <g key={idx}>
                    {/* track */}
                    <circle cx="90" cy="90" r={ring.r} fill="none"
                      stroke={ring.color} strokeWidth={ring.stroke} opacity={0.2} />
                    {/* animated arc */}
                    <circle cx="90" cy="90" r={ring.r} fill="none"
                      stroke={ring.color} strokeWidth={ring.stroke}
                      strokeLinecap="round"
                      strokeDasharray={`${ring.dash} ${2 * Math.PI * ring.r}`}
                      style={{
                        transformOrigin: '90px 90px',
                        animation: `spinRing ${ring.dur}s linear infinite ${idx % 2 ? 'reverse' : ''}`,
                      }}
                    />
                  </g>
                ))}
              </svg>

              {/* Ganesha center */}
              <motion.div
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
                className="relative z-10"
              >
                <GaneshaFigure
                  src="/images/ganesha-divine.png"
                  alt="Ganesha"
                  className="w-20 object-contain"
                  style={{ filter: 'drop-shadow(0 8px 24px rgba(232,184,75,0.35)) drop-shadow(0 4px 14px rgba(0,0,0,0.4))' }}
                />
              </motion.div>
            </div>

            {/* status text */}
            <div className="text-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={stepIdx}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.35 }}
                  className="font-telugu text-base sm:text-lg font-semibold"
                  style={{ color: '#fff', textShadow: '0 0 20px rgba(139,30,45,0.6)' }}
                >
                  {LOAD_STEPS[stepIdx]}
                </motion.p>
              </AnimatePresence>
              <p className="font-telugu text-xs mt-1" style={{ color: 'rgba(232,184,75,0.6)' }}>
                వినాయకుడు మీ స్క్రీన్ చూస్తున్నాడు...
              </p>
            </div>

            {/* progress bar */}
            <div className="w-full max-w-xs">
              <div className="flex justify-between mb-1.5">
                <span className="font-telugu text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>ప్రాసెసింగ్</span>
                <span className="font-telugu text-xs font-semibold" style={{ color: '#E8B84B' }}>
                  {Math.round(loadPct)}%
                </span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.08)' }}>
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    width: `${loadPct}%`,
                    background: 'linear-gradient(90deg, #8B1E2D, #E8B84B)',
                    boxShadow: '0 0 8px rgba(232,184,75,0.4)',
                    transition: 'width 0.07s linear',
                  }}
                />
              </div>
            </div>

            {/* Om mantra */}
            <p className="font-telugu text-xs" style={{ color: 'rgba(232,184,75,0.4)' }}>
              || ఓం గణ గణపతయే నమః ||
            </p>
          </motion.div>
        )}

        {/* ─────── FAILURE ─────── */}
        {phase === 'result' && failure && (
          <motion.div
            key="failure"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.34, 1.4, 0.64, 1] }}
            className="relative z-10 flex flex-col items-center gap-5 w-full max-w-sm"
          >
            <div className="relative">
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(circle, rgba(232,184,75,0.2) 0%, transparent 70%)' }}
              />
              <BlinkingGanesha
                src="/images/ganesha-divine.png"
                blinkSrc="/images/ganesha-blink.png"
                alt="Ganesha"
                className="w-32 sm:w-40 relative z-10"
                style={{ filter: 'drop-shadow(0 12px 28px rgba(0,0,0,0.5))' }}
              />
            </div>

            <div className="ornate-card w-full p-5 text-center">
              <p className="font-telugu text-base" style={{ color: 'rgba(255,240,215,0.95)' }}>
                {ERROR_COPY[failure.code] ?? failure.message}
              </p>
              <p className="font-telugu text-xs mt-2" style={{ color: 'rgba(255,240,215,0.5)' }}>
                స్క్రీన్ టైమ్ పేజీ పూర్తిగా, స్పష్టంగా కనిపించేలా చూడండి.
              </p>
            </div>

            <div className="flex flex-col gap-3 w-full">
              <motion.button
                onClick={onRetry}
                whileHover={{ scale: 1.03, y: -2 }}
                whileTap={{ scale: 0.97 }}
                className="w-full py-3.5 rounded-full font-telugu-serif text-sm flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #8B1E2D, #6B0F1A)',
                  boxShadow: '0 8px 24px rgba(139,30,45,0.45), inset 0 1px 0 rgba(255,233,173,0.25)',
                  color: '#fff',
                }}
              >
                <RefreshCw size={15} />
                మళ్ళీ స్కాన్ చేయండి
              </motion.button>
              <button
                onClick={onHome}
                className="w-full py-3 rounded-full font-telugu text-sm transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                హోమ్‌కి వెళ్ళండి
              </button>
            </div>
          </motion.div>
        )}

        {/* ─────── RESULT PHASE ─────── */}
        {phase === 'result' && !failure && (
          <motion.div
            key="result"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.55, ease: [0.34, 1.4, 0.64, 1] }}
            className="relative z-10 flex flex-col md:flex-row items-center justify-center gap-8 md:gap-14 w-full max-w-4xl"
          >
            {/* ── LEFT: verdict + stats + actions ── */}
            <div className="flex flex-col items-center gap-5 w-full max-w-sm order-2 md:order-1">

            {/* headline */}
            <div className="text-center">
              <motion.h2
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="font-telugu-serif font-black"
                style={{
                  fontSize: 'clamp(1.8rem, 6vw, 2.5rem)',
                  color: isGood ? '#4CAF50' : '#FF7043',
                  textShadow: `0 0 24px ${isGood ? 'rgba(76,175,80,0.45)' : 'rgba(255,112,67,0.45)'}`,
                }}
              >
                {isGood ? 'అద్భుతం!' : 'అయ్యో!'}
              </motion.h2>
              <motion.p
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
                className="font-telugu text-sm mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}
              >
                {isGood ? 'మీ Screen Time చాలా బాగుంది!' : 'మీ Screen Time కొంచెం ఎక్కువగా ఉంది.'}
              </motion.p>
            </div>

            {/* time card */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="w-full rounded-2xl p-5 relative overflow-hidden"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${isGood ? 'rgba(76,175,80,0.3)' : 'rgba(255,112,67,0.3)'}`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <div className="flex items-center justify-between">
                {/* arc progress */}
                <div className="relative flex-shrink-0">
                  <svg width="130" height="130" viewBox="0 0 130 130">
                    <circle cx="65" cy="65" r={ARC_R} fill="none"
                      stroke="rgba(255,255,255,0.08)" strokeWidth="8" />
                    <motion.circle
                      cx="65" cy="65" r={ARC_R} fill="none"
                      stroke={isGood ? '#4CAF50' : '#FF7043'}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={ARC_C}
                      initial={{ strokeDashoffset: ARC_C }}
                      animate={{ strokeDashoffset: arcOffset }}
                      transition={{ delay: 0.5, duration: 1, ease: 'easeOut' }}
                      style={{ transform: 'rotate(-90deg)', transformOrigin: '65px 65px' }}
                    />
                    <text x="65" y="58" textAnchor="middle"
                      style={{ fontSize: '20px', fontWeight: 700, fill: '#fff', fontFamily: 'Noto Sans Telugu' }}>
                      {today.hours}గ {today.mins}ని
                    </text>
                    <text x="65" y="75" textAnchor="middle"
                      style={{ fontSize: '9px', fill: 'rgba(255,255,255,0.45)', fontFamily: 'Noto Sans Telugu' }}>
                      ఈరోజు మొత్తం
                    </text>
                  </svg>
                </div>

                {/* info */}
                <div className="flex-1 pl-4 text-right">
                  <p className="font-telugu text-[10px] mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Today's Screen Time
                  </p>
                  <p className="font-bold text-2xl text-white">
                    {today.hours}h {today.mins}m
                  </p>
                  <p className="font-telugu text-[10px] mt-1"
                    style={{ color: isGood ? 'rgba(76,175,80,0.8)' : 'rgba(255,112,67,0.8)' }}>
                    {isGood ? '(5 గంటల కన్ను తక్కువ ✓)' : '(5 గంటల కన్ను ఎక్కువ ✗)'}
                  </p>
                </div>
              </div>

              {/* message strip */}
              {isGood && (
                <div className="mt-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(46,125,50,0.15)', border: '1px solid rgba(76,175,80,0.2)' }}>
                  <p className="font-telugu text-xs text-center flex items-center justify-center gap-1.5" style={{ color: 'rgba(76,175,80,0.9)' }}>
                    <Flower2 size={12} aria-hidden />
                    నువ్వు చాలా బాగ్ చేస్తున్నావు! ఇలాగే కొనసాగించు
                  </p>
                </div>
              )}
              {!isGood && (
                <div className="mt-3 px-3 py-2 rounded-xl"
                  style={{ background: 'rgba(230,81,0,0.12)', border: '1px solid rgba(255,112,67,0.2)' }}>
                  <p className="font-telugu text-xs text-center" style={{ color: 'rgba(255,112,67,0.85)' }}>
                    కొంచెం తగ్గించేందుకు ప్రయత్నించండి
                  </p>
                </div>
              )}

              {/* OCR confidence */}
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="font-telugu text-[10px]" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  OCR కచ్చితత్వం
                </span>
                <div className="flex items-center gap-2 flex-1 max-w-[130px]">
                  <div className="h-1 flex-1 rounded-full" style={{ background: 'rgba(255,255,255,0.09)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${confidence}%` }}
                      transition={{ delay: 0.7, duration: 0.8, ease: 'easeOut' }}
                      style={{ background: isGood ? '#4CAF50' : '#FF7043' }}
                    />
                  </div>
                  <span className="text-[10px] tabular-nums font-latin" style={{ color: '#E8B84B' }}>
                    {confidence}%
                  </span>
                </div>
              </div>
            </motion.div>

            {/* awareness video — auto-plays with the reveal */}
            <AwarenessVideo status={isGood ? 'healthy' : 'warning'} />

            {/* action buttons */}
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="flex flex-col gap-3 w-full"
            >
              {isGood && (
                <button
                  onClick={onRetry}
                  className="w-full py-3.5 rounded-full font-telugu-serif font-bold text-sm text-white flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #2E7D32, #1B5E20)',
                    boxShadow: '0 6px 20px rgba(46,125,50,0.4)',
                  }}
                >
                  <Flower2 size={15} />
                  మళ్ళీ స్కాన్ చేయండి
                </button>
              )}
              <button
                onClick={onRetry}
                className="w-full py-3.5 rounded-full font-telugu-serif font-bold text-sm flex items-center justify-center gap-2"
                style={{
                  background: 'linear-gradient(135deg, #8B1E2D, #6B0F1A)',
                  boxShadow: '0 6px 20px rgba(139,30,45,0.45)',
                  color: '#fff',
                }}
              >
                <RefreshCw size={15} />
                మళ్ళీ ప్రయత్నించండి
              </button>
              <button
                onClick={onHome}
                className="w-full py-3 rounded-full font-telugu text-sm font-medium transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.6)',
                }}
              >
                హోమ్‌కి వెళ్ళండి
              </button>
            </motion.div>

            {/* mantra */}
            <p className="font-telugu text-xs" style={{ color: 'rgba(232,184,75,0.35)' }}>
              || ఓం గణ గణపతయే నమః ||
            </p>
            </div>

            {/* ── RIGHT: happy Ganesha ── */}
            <motion.div
              initial={{ opacity: 0, x: 50, scale: 0.8 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              transition={{ delay: 0.25, duration: 0.7, ease: [0.34, 1.4, 0.64, 1] }}
              className="relative flex-shrink-0 order-1 md:order-2"
            >
              {/* celebratory expanding rings */}
              <span className="celebrate-ring" />
              <span className="celebrate-ring" style={{ animationDelay: '1.2s' }} />

              {/* emotion glow */}
              <div
                className="absolute inset-0 rounded-full pointer-events-none"
                style={{
                  background: isGood
                    ? 'radial-gradient(circle, rgba(46,125,50,0.28) 0%, transparent 70%)'
                    : 'radial-gradient(circle, rgba(230,81,0,0.26) 0%, transparent 70%)',
                }}
              />

              {/* gentle happy bounce */}
              <motion.div
                animate={{ y: [0, -8, 0], rotate: [0, -1.5, 1.5, 0] }}
                transition={{ duration: 3.4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative z-10"
              >
                <BlinkingGanesha
                  src="/images/ganesha-divine.png"
                  blinkSrc="/images/ganesha-blink.png"
                  alt="Happy Ganesha"
                  className="w-44 sm:w-56 lg:w-64"
                  smile={isGood}
                  celebrate
                  style={{
                    filter: `drop-shadow(0 14px 30px ${isGood ? 'rgba(46,125,50,0.45)' : 'rgba(230,81,0,0.4)'}) drop-shadow(0 0 40px rgba(232,184,75,0.25))`,
                  }}
                />
              </motion.div>

              {/* status badge */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.55, type: 'spring', stiffness: 260, damping: 14 }}
                className="absolute top-2 right-2 w-10 h-10 rounded-full flex items-center justify-center shadow-lg z-20"
                style={{ background: isGood ? '#2E7D32' : '#E65100' }}
              >
                {isGood ? <Check size={18} className="text-white" /> : <AlertTriangle size={17} className="text-white" />}
              </motion.div>

              {/* ground shadow */}
              <span
                className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-3/4 h-6 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%)', filter: 'blur(7px)' }}
              />
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
