import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import HeroPage from './components/HeroPage';
import CameraScanner from './components/CameraScanner';
import ResultsPage from './components/ResultsPage';
import AmbienceToggle from './components/AmbienceToggle';
import type { ScanResult, ScanFailure } from './services/scanApi';

type Screen = 'hero' | 'camera' | 'results';

/* one easing token across all page transitions */
const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export default function App() {
  const [screen, setScreen] = useState<Screen>('hero');
  const [result, setResult] = useState<ScanResult | null>(null);
  const [failure, setFailure] = useState<ScanFailure | null>(null);

  const go = (s: Screen) => setScreen(s);

  const handleResult = (r: ScanResult) => { setFailure(null); setResult(r); go('results'); };
  const handleFailure = (f: ScanFailure) => { setResult(null); setFailure(f); go('results'); };
  const handleRetry = () => { setResult(null); setFailure(null); go('camera'); };
  const handleHome = () => { setResult(null); setFailure(null); go('hero'); };

  /* lock scroll on the two full-screen views, free it on the hero */
  useEffect(() => {
    document.body.style.overflowY = screen === 'hero' ? 'auto' : 'hidden';
    if (screen !== 'hero') window.scrollTo({ top: 0 });
    return () => { document.body.style.overflowY = 'auto'; };
  }, [screen]);

  return (
    <div className={`w-full bg-[#0a0507] ${screen === 'hero' ? 'min-h-screen' : 'h-screen overflow-hidden'}`}>
      <AnimatePresence mode="wait">

        {screen === 'hero' && (
          <motion.div
            key="hero"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.04 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="w-full"
          >
            <HeroPage onStart={() => go('camera')} />
          </motion.div>
        )}

        {screen === 'camera' && (
          <motion.div
            key="camera"
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -60 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="w-full h-full"
          >
            <CameraScanner
              onResult={handleResult}
              onFailure={handleFailure}
              onBack={() => go('hero')}
            />
          </motion.div>
        )}

        {screen === 'results' && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            transition={{ duration: 0.45, ease: EASE }}
            className="w-full h-full"
          >
            <ResultsPage
              result={result}
              failure={failure}
              onRetry={handleRetry}
              onHome={handleHome}
            />
          </motion.div>
        )}

      </AnimatePresence>

      {/* temple ambience — arms itself on the first interaction */}
      <AmbienceToggle />
    </div>
  );
}
