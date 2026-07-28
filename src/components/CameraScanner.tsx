import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, Zap, RotateCcw, Upload, RefreshCw, ArrowLeft, Sun, Hand, Check, Flower2, ShieldCheck, Smartphone, AlertTriangle } from 'lucide-react';
import BlinkingGanesha from './BlinkingGanesha';
import Petal from './Petal';
import {
  scanImage, probeBackend, warmUpBrowserEngine, ScanError, ERROR_COPY,
  type ScanResult, type ScanFailure, type Engine, type ScanInput,
} from '../services/scanApi';
import { captureBurst } from '../services/frameCapture';

interface CameraScannerProps {
  onResult: (result: ScanResult) => void;
  onFailure: (error: ScanFailure) => void;
  onBack: () => void;
}

const PETALS = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${(i * 97) % 100}%`,
  delay: `${(i * 1.1) % 8}s`,
  duration: `${7 + (i % 4) * 2}s`,
}));

const THINK_LINES = [
  'హ్మ్... లెక్కిస్తున్నాను...',
  'స్క్రీన్ బాగుందా చూద్దాం...',
  'కొంచెం తక్కువైతే బాగుండు',
];

/* one easing token across the page */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

const BOKEH = Array.from({ length: 10 }, (_, i) => ({
  id: i,
  left: `${(i * 131) % 100}%`,
  top: `${12 + ((i * 67) % 74)}%`,
  size: 3 + (i % 3) * 3,
  delay: `${(i * 0.8) % 5}s`,
  duration: `${4.5 + (i % 4) * 1.4}s`,
}));

export default function CameraScanner({ onResult, onFailure, onBack }: CameraScannerProps) {
  const [cameraOn, setCameraOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [denied, setDenied] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [engine, setEngine] = useState<Engine>('browser');
  const [ocrPct, setOcrPct] = useState(0);
  const [sharpness, setSharpness] = useState(0);
  const [flashActive, setFlashActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [progress, setProgress] = useState(0);
  const [thinkIdx, setThinkIdx] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  /* lifecycle guards — no post-unmount work, no orphaned stream or timers */
  const mountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const track = (id: number) => { timersRef.current.push(id); return id; };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach(clearTimeout);
      timersRef.current = [];
      abortRef.current?.abort();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setInlineError(null);
    let stream: MediaStream | null = null;
    try {
      // Highest resolution the device will give us, with continuous
      // focus and exposure so the frame is settled before capture.
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 2560 },
          height: { ideal: 1440 },
          frameRate: { ideal: 30 },
          // Non-standard but widely honoured hints; ignored where absent.
          ...({
            focusMode: 'continuous',
            exposureMode: 'continuous',
            whiteBalanceMode: 'continuous',
          } as MediaTrackConstraints),
        },
      });
    } catch {
      if (!mountedRef.current) return;
      setDenied(true);
      return;
    }

    /* unmounted while the permission prompt was open — release at once */
    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      void videoRef.current.play().catch(() => undefined);
    }
    setDenied(false);
    setCameraOn(true);
    setScanning(true);
    setCaptured(false);
    setProgress(0);
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
    setScanning(false);
  };

  const flipCamera = () => {
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(next);
    if (cameraOn) {
      stopCamera();
      track(window.setTimeout(() => startCamera(next), 120));
    }
  };

  /* Shared analysis path for live capture and gallery upload. */
  const analyse = async (input: ScanInput) => {
    setAnalyzing(true);
    setInlineError(null);
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await scanImage(input, {
        signal: controller.signal,
        budgetMs: 7000,
        onEngine: (e) => mountedRef.current && setEngine(e),
        onProgress: (pct) => mountedRef.current && setOcrPct(pct),
      });
      if (!mountedRef.current) return;
      setProgress(100);
      stopCamera();
      onResult(result);
    } catch (err) {
      if (!mountedRef.current) return;
      const scanErr = err instanceof ScanError ? err : new ScanError('INTERNAL');
      if (scanErr.code === 'ABORTED') return;
      setAnalyzing(false);
      setCaptured(false);
      setProgress(0);
      /* recoverable misses stay on this page so the user can simply retry */
      if (scanErr.code === 'NOT_DETECTED' || scanErr.code === 'NO_TEXT' || scanErr.code === 'LOW_CONFIDENCE') {
        setInlineError(ERROR_COPY[scanErr.code]);
        setScanning(Boolean(streamRef.current));
      } else {
        stopCamera();
        onFailure({ code: scanErr.code, message: scanErr.message, detected_text: scanErr.detectedText });
      }
    }
  };

  const capture = () => {
    if (captured || analyzing) return;
    if (!cameraOn) { void startCamera(); return; }
    const video = videoRef.current;
    if (!video) return;

    setFlashActive(true);
    track(window.setTimeout(() => setFlashActive(false), 180));
    setScanning(false);
    setCaptured(true);

    // Grab a short burst and keep the sharpest frames. A single grab is a
    // lottery — autofocus hunting or a hand tremor ruins it silently.
    captureBurst(video, { count: 7, intervalMs: 70, budgetMs: 900 })
      .then((frames) => {
        if (!mountedRef.current) return;
        if (!frames.length) {
          setCaptured(false);
          setInlineError(ERROR_COPY.DECODE_FAILED);
          return;
        }
        setSharpness(Math.round(frames[0].sharpness));
        // Best frame first, next-best kept as fallbacks for later tiers.
        void analyse(frames.slice(0, 3).map((f) => f.image));
      })
      .catch(() => {
        if (!mountedRef.current) return;
        setCaptured(false);
        setInlineError(ERROR_COPY.DECODE_FAILED);
      });
  };

  /* progress ticker — creeps while live, accelerates during analysis */
  useEffect(() => {
    if (!scanning && !analyzing) return;
    const t = window.setInterval(() => {
      setProgress((p) => (p >= 96 ? 96 : p + (analyzing ? 3.2 : 1.6)));
    }, 110);
    return () => window.clearInterval(t);
  }, [scanning, analyzing]);

  /* thinking companion line cycle */
  useEffect(() => {
    const t = window.setInterval(() => setThinkIdx((i) => (i + 1) % THINK_LINES.length), 3100);
    return () => window.clearInterval(t);
  }, []);

  /* Decide which engine will be used, then preload it so the first
     scan is not delayed by a cold WASM download. */
  useEffect(() => {
    let alive = true;
    void probeBackend().then((status) => {
      if (!alive) return;
      setEngine(status.reachable ? 'server' : 'browser');
      if (!status.reachable) warmUpBrowserEngine();
    });
    return () => { alive = false; };
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-[#080406]">
      {/* ── 3-D temple background ── */}
      <div className="camera-bg" />
      <div className="camera-overlay" />
      <div className="grain-layer" />

      {/* ambient bokeh + petals */}
      {BOKEH.map((b) => (
        <span
          key={b.id}
          className="hp-bokeh"
          style={{ left: b.left, top: b.top, width: b.size, height: b.size, animationDelay: b.delay, animationDuration: b.duration }}
        />
      ))}
      {PETALS.map((p) => (
        <span
          key={p.id}
          className="hp-petal"
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration, fontSize: '0.9rem', ['--drift' as string]: `${p.id % 2 ? 12 : -10}px` }}
        >
          <Petal />
        </span>
      ))}

      {/* capture flash */}
      <AnimatePresence>
        {flashActive && (
          <motion.div
            key="flash"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.85 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 bg-white z-30 pointer-events-none"
          />
        )}
      </AnimatePresence>

      {/* ── layout ── */}
      <div className="relative z-10 flex flex-col h-full px-4 sm:px-6 py-3 gap-2">
        {/* traditional kolam keyline */}
        <div className="kolam-strip flex-shrink-0 -mx-4 sm:-mx-6" aria-hidden />

        {/* ─── header ─── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <motion.button
            whileHover={{ scale: 1.06 }}
            whileTap={{ scale: 0.94 }}
            onClick={onBack}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-full text-white/80 hover:text-white transition-all font-telugu text-sm"
            style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)' }}
          >
            <ArrowLeft size={15} />
            వెనక్కి
          </motion.button>

          {/* journey steps */}
          <div className="flex items-center gap-2">
            <StepDot state="done" />
            <span className="w-6 h-px" style={{ background: 'linear-gradient(90deg, rgba(232,184,75,.6), rgba(232,184,75,.15))' }} />
            <StepDot state="active" />
            <span className="w-6 h-px" style={{ background: 'rgba(255,255,255,0.15)' }} />
            <StepDot state="todo" />
            <span className="font-telugu text-[10px] ml-1.5 tracking-wider" style={{ color: 'rgba(232,184,75,0.7)' }}>
              దశ 2 · స్కాన్
            </span>
          </div>

          {/* mini om */}
          <div
            className="w-9 h-9 rounded-full flex items-center justify-center"
            style={{
              background: 'radial-gradient(circle at 35% 30%, rgba(255,232,170,0.25), rgba(139,30,45,0.25))',
              border: '1px solid rgba(232,184,75,0.4)',
              boxShadow: '0 0 18px rgba(232,184,75,0.25), inset 0 1px 0 rgba(255,255,255,0.15)',
            }}
          >
            <span
              className="font-devanagari text-base font-bold"
              style={{
                background: 'linear-gradient(160deg,#fff3cf,#e8b84b 60%,#c8960c)',
                WebkitBackgroundClip: 'text',
                backgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              ॐ
            </span>
          </div>
        </div>

        {/* ─── title ─── */}
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.6, ease: EASE }}
          className="text-center flex-shrink-0"
        >
          <div className="flex items-center justify-center gap-3">
            <span className="title-rule" />
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(140deg,#a02436,#6b0f1a)',
                boxShadow: '0 4px 14px rgba(139,30,45,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <Camera size={16} className="text-[#ffe9ad]" />
            </span>
            <h1
              className="font-telugu-serif"
              style={{ fontSize: 'clamp(1.7rem, 4.6vw, 2.5rem)', color: '#fff', textShadow: '0 2px 14px rgba(0,0,0,0.65), 0 0 34px rgba(232,184,75,0.25)', letterSpacing: '0.01em' }}
            >
              స్క్రీన్ టైమ్ స్కాన్
            </h1>
            <span
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{
                background: 'linear-gradient(140deg,#a02436,#6b0f1a)',
                boxShadow: '0 4px 14px rgba(139,30,45,0.5), inset 0 1px 0 rgba(255,255,255,0.2)',
              }}
            >
              <Flower2 size={15} className="text-[#ffe9ad]" />
            </span>
            <span className="title-rule flip" />
          </div>
          <p className="font-telugu-classic mt-1 hidden sm:block" style={{ fontSize: 'clamp(0.76rem, 1.7vw, 0.88rem)', color: 'rgba(240,210,150,0.7)', letterSpacing: '0.08em' }}>
            మీ ఫోన్‌లోని Screen Time పేజీని ఫ్రేమ్‌లో స్పష్టంగా చూపించండి
          </p>
        </motion.div>

        {/* ─── stage ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.16, duration: 0.65, ease: EASE }}
          className="flex-1 flex items-center justify-center gap-6 lg:gap-10 xl:gap-14 min-h-0 relative pt-10 sm:pt-12"
        >
          {/* side hint chips — desktop */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.7, ease: EASE }}
            className="hidden xl:flex flex-col gap-3 absolute left-[3%] top-1/2 -translate-y-1/2 z-20"
          >
            <HintChip icon={<Sun size={14} />} title="సరిైన వెలుతురు" sub="నీడ లేకుండా చూడండి" />
            <HintChip icon={<Hand size={14} />} title="స్థిరంగా పట్టుకోండి" sub="ఫోన్‌ను కదల్చకుండా" />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.48, duration: 0.7, ease: EASE }}
            className="hidden xl:flex flex-col gap-3 absolute right-[3%] top-1/2 -translate-y-1/2 z-20"
          >
            <HintChip icon={<Camera size={14} />} title="ఫ్రేమ్‌లోపల ఉంచండి" sub="స్క్రీన్ మొత్తం కనిపించాలి" />
          </motion.div>

          {/* viewfinder + peeking Ganesha */}
          <div className="vf-wrap w-full max-w-3xl" style={{ aspectRatio: '4/3', maxHeight: 'calc(100vh - 228px)' }}>
            <span className="gp-glow" aria-hidden />
            <motion.div
              className="gp-anchor lg:hidden"
              initial={{ y: 26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5, duration: 0.7, ease: EASE }}
            >
              <div className="gp-clip">
                <div className="gp-bob">
                  <BlinkingGanesha src="/images/ganesha-divine.png" blinkSrc="/images/ganesha-blink.png" alt="" />
                </div>
              </div>
            </motion.div>

            <div className={`viewfinder ${scanning ? 'scanning' : ''}`} style={{ position: 'absolute', inset: 0 }}>
              {/* live video */}
              <video
                ref={videoRef}
                className="absolute inset-0 w-full h-full object-cover rounded-[20px]"
                style={{ opacity: cameraOn ? 1 : 0, transition: 'opacity .4s' }}
                muted
                playsInline
              />

              {/* idle guide with rotating mandala watermark */}
              {!cameraOn && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                  {/* slow-spinning mandala */}
                  <svg
                    className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    width="340" height="340" viewBox="0 0 100 100"
                    style={{ animation: 'spinRing 60s linear infinite', opacity: 0.07 }}
                    aria-hidden
                  >
                    {Array.from({ length: 12 }, (_, i) => (
                      <ellipse key={i} cx="50" cy="50" rx="8" ry="30" fill="none" stroke="#E8B84B" strokeWidth="0.6"
                        transform={`rotate(${i * 30} 50 50)`} />
                    ))}
                    <circle cx="50" cy="50" r="44" fill="none" stroke="#E8B84B" strokeWidth="0.5" />
                    <circle cx="50" cy="50" r="16" fill="none" stroke="#E8B84B" strokeWidth="0.5" />
                  </svg>

                  <div className="guide-drift relative z-10">
                    <div
                      className="w-16 h-24 rounded-2xl flex items-center justify-center"
                      style={{
                        border: '1.5px solid rgba(232,184,75,0.5)',
                        background: 'linear-gradient(160deg, rgba(232,184,75,0.08), rgba(255,255,255,0.02))',
                        boxShadow: '0 0 24px rgba(232,184,75,0.12), inset 0 1px 0 rgba(255,255,255,0.08)',
                      }}
                    >
                      <Smartphone size={24} style={{ color: 'rgba(255,233,173,0.55)' }} />
                    </div>
                    <span className="absolute -top-1.5 -left-1.5 w-3.5 h-3.5 border-t-2 border-l-2 rounded-tl" style={{ borderColor: '#E8B84B' }} />
                    <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 border-t-2 border-r-2 rounded-tr" style={{ borderColor: '#E8B84B' }} />
                    <span className="absolute -bottom-1.5 -left-1.5 w-3.5 h-3.5 border-b-2 border-l-2 rounded-bl" style={{ borderColor: '#E8B84B' }} />
                    <span className="absolute -bottom-1.5 -right-1.5 w-3.5 h-3.5 border-b-2 border-r-2 rounded-br" style={{ borderColor: '#E8B84B' }} />
                  </div>
                  <p className="font-telugu text-center text-sm px-8 relative z-10" style={{ color: 'rgba(255,240,210,0.55)' }}>
                    స్క్రీన్‌టైమ్ పేజీని ఫ్రేమ్‌లోపల ఉంచండి
                  </p>
                </div>
              )}

              {/* scan laser */}
              {scanning && <div className="scan-laser" />}

              {/* corners */}
              <div className="vf-corner vf-tl" />
              <div className="vf-corner vf-tr" />
              <div className="vf-corner vf-bl" />
              <div className="vf-corner vf-br" />

              {/* status chip — top left */}
              <div
                className="absolute top-4 left-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                style={{
                  background: cameraOn ? 'rgba(46,125,50,0.22)' : 'rgba(255,255,255,0.08)',
                  border: `1px solid ${cameraOn ? 'rgba(76,175,80,0.45)' : 'rgba(255,255,255,0.15)'}`,
                  backdropFilter: 'blur(6px)',
                }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${cameraOn ? 'live-dot' : ''}`}
                  style={{ background: cameraOn ? '#4CAF50' : 'rgba(255,255,255,0.4)' }}
                />
                <span className="font-telugu text-[10px]" style={{ color: cameraOn ? '#a5d6a7' : 'rgba(255,255,255,0.55)' }}>
                  {cameraOn ? 'ప్రత్యక్షం' : 'సిద్ధం'}
                </span>
                <span
                  className="font-telugu text-[9px] pl-1.5 ml-0.5"
                  style={{ color: 'rgba(232,184,75,0.7)', borderLeft: '1px solid rgba(255,255,255,0.18)' }}
                  title={engine === 'server' ? 'Python OCR backend' : 'In-browser OCR (no server needed)'}
                >
                  {engine === 'server' ? 'సర్వర్' : 'బ్రౌజర్'}
                </span>
              </div>

              {/* progress chip — top right */}
              {scanning && (
                <div
                  className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full"
                  style={{ background: 'rgba(232,184,75,0.16)', border: '1px solid rgba(232,184,75,0.35)', backdropFilter: 'blur(6px)' }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E8B84B] animate-pulse" />
                  <span className="font-telugu text-[10px] tabular-nums" style={{ color: '#E8B84B' }}>
                    విశ్లేషణ {Math.round(progress)}%
                  </span>
                </div>
              )}

              {/* captured / analysing overlay */}
              <AnimatePresence>
                {captured && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-4 rounded-[20px]"
                    style={{ background: 'rgba(8,4,6,0.62)', backdropFilter: 'blur(4px)' }}
                  >
                    {analyzing ? (
                      <>
                        <motion.span
                          className="w-11 h-11 rounded-full"
                          style={{
                            border: '2px solid rgba(232,184,75,0.25)',
                            borderTopColor: '#E8B84B',
                          }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
                        />
                        <span className="font-telugu text-sm text-center px-6" style={{ color: '#ffe9ad' }}>
                          మీ స్క్రీన్ టైమ్ విశ్లేషించబడుతోంది...
                        </span>
                        {engine === 'browser' && ocrPct > 0 && (
                          <span className="text-[10px] tabular-nums font-latin" style={{ color: 'rgba(232,184,75,0.65)' }}>
                            {ocrPct}%
                          </span>
                        )}
                        {sharpness > 0 && sharpness < 120 && (
                          <span className="font-telugu text-[10px] text-center px-6" style={{ color: 'rgba(255,154,118,0.85)' }}>
                            ఫోన్‌ను స్థిరంగా పట్టుకోండి — చిత్రం కొంచెం అస్పష్టంగా ఉంది
                          </span>
                        )}
                      </>
                    ) : (
                      <div
                        className="flex items-center gap-2 px-5 py-3 rounded-full"
                        style={{ background: 'rgba(46,125,50,0.9)', boxShadow: '0 8px 30px rgba(46,125,50,0.5)' }}
                      >
                        <Check size={18} className="text-white" />
                        <span className="font-telugu text-sm font-semibold text-white">చిత్రం తీయబడింది</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* OCR could not find a value — recoverable, stay on this page */}
              <AnimatePresence>
                {inlineError && !captured && (
                  <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute inset-x-0 bottom-14 flex flex-col items-center gap-2.5 px-6 z-20"
                  >
                    <div
                      className="flex items-center gap-2 px-4 py-2.5 rounded-2xl max-w-sm"
                      style={{
                        background: 'rgba(30,12,6,0.88)',
                        border: '1px solid rgba(255,112,67,0.4)',
                        backdropFilter: 'blur(10px)',
                      }}
                    >
                      <AlertTriangle size={15} style={{ color: '#FF7043', flexShrink: 0 }} />
                      <span className="font-telugu text-xs" style={{ color: 'rgba(255,225,205,0.95)' }}>
                        {inlineError}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setInlineError(null); if (!cameraOn) void startCamera(); }}
                        className="font-telugu text-[11px] px-3.5 py-1.5 rounded-full transition-colors"
                        style={{ background: 'rgba(232,184,75,0.16)', border: '1px solid rgba(232,184,75,0.45)', color: '#ffe9ad' }}
                      >
                        మళ్ళీ తీయండి
                      </button>
                      <button
                        onClick={() => { setInlineError(null); fileRef.current?.click(); }}
                        className="font-telugu text-[11px] px-3.5 py-1.5 rounded-full transition-colors"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,240,215,0.8)' }}
                      >
                        చిత్రం అప్‌లోడ్ చేయండి
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* camera permission refused */}
              <AnimatePresence>
                {denied && !captured && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-8 text-center rounded-[20px] z-20"
                    style={{ background: 'rgba(8,4,6,0.8)', backdropFilter: 'blur(5px)' }}
                  >
                    <span
                      className="w-11 h-11 rounded-full flex items-center justify-center"
                      style={{ background: 'rgba(232,184,75,0.14)', border: '1px solid rgba(232,184,75,0.4)' }}
                    >
                      <Camera size={18} style={{ color: '#E8B84B' }} />
                    </span>
                    <p className="font-telugu text-sm" style={{ color: 'rgba(255,240,215,0.9)' }}>
                      కెమెరా అనుమతి ఇవ్వబడలేదు.
                    </p>
                    <p className="font-telugu text-xs max-w-xs" style={{ color: 'rgba(255,240,215,0.5)' }}>
                      బ్రౌజర్ సెట్టింగ్స్‌లో కెమెరాను అనుమతించండి — లేదా గ్యాలరీ నుండి చిత్రాన్ని అప్‌లోడ్ చేయండి.
                    </p>
                    <div className="flex gap-2 mt-1">
                      <button
                        onClick={() => { setDenied(false); void startCamera(); }}
                        className="font-telugu text-[11px] px-4 py-2 rounded-full"
                        style={{ background: 'rgba(232,184,75,0.16)', border: '1px solid rgba(232,184,75,0.45)', color: '#ffe9ad' }}
                      >
                        మళ్ళీ ప్రయత్నించండి
                      </button>
                      <button
                        onClick={() => fileRef.current?.click()}
                        className="font-telugu text-[11px] px-4 py-2 rounded-full"
                        style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.16)', color: 'rgba(255,240,215,0.8)' }}
                      >
                        చిత్రం అప్‌లోడ్ చేయండి
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* bottom hint inside frame */}
              {!captured && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                  <span
                    className="font-telugu text-[11px] px-4 py-1.5 rounded-full whitespace-nowrap"
                    style={{ background: 'rgba(8,4,6,0.55)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.65)', backdropFilter: 'blur(6px)' }}
                  >
                    క్యాప్చర్ నొక్కి స్కాన్ ప్రారంభించండి
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* ─── thinking companion (right side, desktop) ─── */}
          <motion.aside
            initial={{ opacity: 0, x: 56, rotate: 3 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            transition={{ delay: 0.32, duration: 0.85, ease: EASE }}
            className="hidden lg:flex flex-col items-center relative flex-shrink-0 w-64 xl:w-80 2xl:w-[22rem]"
          >
            {/* warm glow behind the companion */}
            <span
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/3 w-96 h-96 rounded-full pointer-events-none"
              style={{ background: 'radial-gradient(circle, rgba(232,184,75,0.18) 0%, transparent 65%)', filter: 'blur(14px)' }}
            />

            {/* floating thought glyphs */}
            <span className="float-glyph" style={{ top: '4%', left: '10%', animationDelay: '0s' }}>?</span>
            <span className="float-glyph" style={{ top: '16%', right: '4%', animationDelay: '1.5s' }}>✦</span>
            <span className="float-glyph" style={{ top: '0%', left: '56%', animationDelay: '2.4s' }}>✧</span>

            {/* thought bubble */}
            <div className="think-bubble mb-4 w-full text-center relative z-10">
              <AnimatePresence mode="wait">
                <motion.p
                  key={thinkIdx}
                  initial={{ opacity: 0, y: 7 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -7 }}
                  transition={{ duration: 0.32 }}
                  className="font-telugu text-xs leading-relaxed"
                  style={{ color: 'rgba(255,240,210,0.92)' }}
                >
                  {THINK_LINES[thinkIdx]}
                </motion.p>
              </AnimatePresence>
              <div className="flex justify-center gap-1.5 mt-2">
                <span className="think-dot" style={{ animationDelay: '0s' }} />
                <span className="think-dot" style={{ animationDelay: '0.2s' }} />
                <span className="think-dot" style={{ animationDelay: '0.4s' }} />
              </div>
            </div>

            {/* Ganesha — gentle pondering tilt + blink */}
            <motion.div
              animate={{ rotate: [-2.6, 2.6, -2.6], y: [0, -7, 0] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              style={{ transformOrigin: '50% 92%' }}
              className="relative w-64 xl:w-80 2xl:w-[22rem]"
            >
              <BlinkingGanesha
                src="/images/ganesha-divine.png"
                blinkSrc="/images/ganesha-blink.png"
                alt="Ganesha thinking about your screen time"
              />
              <span
                className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-3/4 h-5 rounded-full pointer-events-none"
                style={{ background: 'radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%)', filter: 'blur(6px)' }}
              />
            </motion.div>
          </motion.aside>
        </motion.div>

        {/* ─── bottom dock ─── */}
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.6, ease: EASE }}
          className="flex-shrink-0 flex flex-col items-center gap-1.5 pb-1"
        >
          <div
            className="flex items-end gap-2 sm:gap-4 px-4 sm:px-6 py-3 rounded-[28px]"
            style={{
              background: 'linear-gradient(180deg, rgba(40,17,22,0.6), rgba(12,5,8,0.72))',
              border: '1px solid rgba(232,184,75,0.26)',
              backdropFilter: 'blur(20px)',
              boxShadow: '0 18px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,233,173,0.12)',
            }}
          >
            <DockBtn icon={<Upload size={17} />} label="అప్‌లోడ్" onClick={() => fileRef.current?.click()} />
            <DockBtn icon={<RotateCcw size={17} />} label="మార్చు" onClick={flipCamera} />

            {/* primary capture */}
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              onClick={capture}
              className="flex flex-col items-center gap-1 mx-1"
            >
              <div
                className="capture-pulse w-[74px] h-[74px] rounded-full flex items-center justify-center -mt-7"
                style={{
                  background: 'linear-gradient(140deg,#a02436 0%,#6b0f1a 70%)',
                  border: '3px solid rgba(255,233,173,0.85)',
                }}
              >
                <Camera size={28} className="text-[#fff3cf]" />
              </div>
              <span className="font-telugu text-[10px] font-semibold mt-0.5" style={{ color: '#E8B84B' }}>
                {cameraOn ? 'క్యాప్చర్' : 'కెమెరా ఆన్'}
              </span>
            </motion.button>

            <DockBtn icon={<RefreshCw size={17} />} label="మళ్ళీ" onClick={() => { stopCamera(); setCaptured(false); setProgress(0); }} />
            <DockBtn
              icon={<Zap size={17} />}
              label="ఫ్లాష్"
              onClick={() => { setFlashActive(true); window.setTimeout(() => setFlashActive(false), 160); }}
            />
          </div>

          {/* privacy micro-line, tucked under the dock */}
          <p className="font-telugu text-[9px] flex items-center gap-1.5" style={{ color: 'rgba(255,240,220,0.34)', letterSpacing: '0.07em' }}>
            <ShieldCheck size={10} style={{ color: 'rgba(232,184,75,0.5)' }} aria-hidden />
            మీ గోప్యత మా బాధ్యత — డేటా ఎక్కడా సేవ్ కాదు
          </p>
        </motion.div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setDenied(false);
          setCaptured(true);
          setFlashActive(true);
          track(window.setTimeout(() => setFlashActive(false), 160));
          void analyse(file);
          e.target.value = '';   // allow re-picking the same file
        }}
      />

      <style>{`
        .title-rule{width:clamp(24px,6vw,70px);height:1px;
          background:linear-gradient(90deg,transparent,rgba(232,184,75,.7));}
        .title-rule.flip{background:linear-gradient(90deg,rgba(232,184,75,.7),transparent);}
      `}</style>
    </div>
  );
}

/* ── journey step dot ── */
function StepDot({ state }: { state: 'done' | 'active' | 'todo' }) {
  return (
    <span className="relative flex items-center justify-center">
      {state === 'active' && (
        <span className="absolute w-5 h-5 rounded-full" style={{ border: '1px solid rgba(232,184,75,0.5)', animation: 'livePing 1.6s ease-out infinite' }} />
      )}
      <span
        className="w-2.5 h-2.5 rounded-full flex items-center justify-center"
        style={{
          background:
            state === 'done' ? '#2E7D32' : state === 'active' ? '#E8B84B' : 'rgba(255,255,255,0.18)',
          boxShadow: state === 'active' ? '0 0 10px rgba(232,184,75,0.7)' : 'none',
        }}
      >
        {state === 'done' && (
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
    </span>
  );
}

/* ── side hint chip ── */
function HintChip({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <motion.div
      whileHover={{ x: 4, scale: 1.03 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl w-44 cursor-default"
      style={{
        background: 'rgba(8,4,6,0.55)',
        border: '1px solid rgba(232,184,75,0.22)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <span
        className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: 'rgba(232,184,75,0.15)', color: '#E8B84B', border: '1px solid rgba(232,184,75,0.3)' }}
      >
        {icon}
      </span>
      <span>
        <span className="block font-telugu text-[11px] font-semibold" style={{ color: 'rgba(255,255,255,0.85)' }}>{title}</span>
        <span className="block font-telugu text-[9px]" style={{ color: 'rgba(255,255,255,0.45)' }}>{sub}</span>
      </span>
    </motion.div>
  );
}

/* ── dock action button ── */
function DockBtn({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <motion.button
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="group flex flex-col items-center gap-1"
    >
      <span
        className="w-11 h-11 rounded-2xl flex items-center justify-center transition-all duration-300 group-hover:shadow-[0_6px_18px_rgba(232,184,75,0.25)]"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: 'rgba(255,255,255,0.75)',
        }}
      >
        <span className="transition-colors group-hover:text-[#E8B84B]" style={{ display: 'flex' }}>{icon}</span>
      </span>
      <span className="font-telugu text-[9px] transition-colors group-hover:text-[#E8B84B]" style={{ color: 'rgba(255,255,255,0.5)' }}>
        {label}
      </span>
    </motion.button>
  );
}
