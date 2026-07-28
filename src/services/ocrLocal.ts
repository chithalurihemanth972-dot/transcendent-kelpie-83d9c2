/**
 * In-browser OCR engine — lean, fast, camera-grade.
 *
 * Architecture:
 *   1. Preprocess → 3 targeted renderings (gray / adaptive / inverted)
 *   2. Run Tesseract on each, PSM 6, collect all readings
 *   3. Consensus vote across everything
 *   4. If not decisive → one more pass with numeric whitelist
 *   5. Return best vote or "nothing"
 *
 * Maximum 4 recognitions. Most scans resolve in 2-3.
 */

import { countContext, findAll, type ParsedTime } from './screenTimeParser';
import { vote, isDecisive, type Candidate, type ConsensusResult } from './consensus';
import { detectScreen } from './screenDetect';
import { canvasOf, ctxOf, toGray, grayToCanvas, meanOf, invert, adaptiveThreshold, type Gray } from './imageOps';

type Worker = import('tesseract.js').Worker;

/* ───────────────────────── worker pool ───────────────────────── */

let workerPromise: Promise<Worker> | null = null;
let numericWorkerPromise: Promise<Worker> | null = null;

async function makeWorker(whitelist: string | null, onProgress?: (pct: number) => void) {
  const { createWorker } = await import('tesseract.js');
  const w = await createWorker('eng', 1, {
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' && onProgress) {
        onProgress(Math.round(m.progress * 100));
      }
    },
  });
  if (whitelist) {
    await w.setParameters({ tessedit_char_whitelist: whitelist });
  }
  return w;
}

async function getWorker(onProgress?: (pct: number) => void): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = makeWorker(null, onProgress).catch((e) => {
      workerPromise = null;
      throw e;
    });
  }
  return workerPromise;
}

async function getNumericWorker(): Promise<Worker> {
  if (!numericWorkerPromise) {
    numericWorkerPromise = makeWorker('0123456789hmHM:. ').catch((e) => {
      numericWorkerPromise = null;
      throw e;
    });
  }
  return numericWorkerPromise;
}

export async function warmUp(): Promise<boolean> {
  try {
    await getWorker();
    void getNumericWorker().catch(() => {});
    return true;
  } catch { return false; }
}

export async function disposeWorker(): Promise<void> {
  for (const p of [workerPromise, numericWorkerPromise]) {
    try { (await p)?.terminate(); } catch {}
  }
  workerPromise = null;
  numericWorkerPromise = null;
}

/* ───────────────────────── preprocessing ───────────────────────── */

interface RenderedVariant {
  name: string;
  canvas: HTMLCanvasElement;
  regionWeight: number;
}

/**
 * Single preprocessing pipeline: detect screen → crop → produce 3 variants.
 *
 * This replaces the old 5-variant × 3-region matrix that created 15 canvases.
 * Three targeted renderings cover every practical case:
 *   - `gray`: high-contrast stretched grayscale
 *   - `adaptive`: local-mean binarisation (the uneven-lighting fix)
 *   - `inverted`: light-on-dark for mis-detected themes
 */
function preprocess(src: ImageData): { variants: RenderedVariant[]; detected: boolean; score: number } {
  const detection = detectScreen(src);
  const img = detection.image;
  const regionWeight = detection.detected ? 1 + detection.score * 0.15 : 0.9;

  // Scale to Tesseract's optimal text height
  const targetH = 640;
  const scale = targetH / img.height;
  const full = canvasOf(img.width, img.height);
  ctxOf(full).putImageData(img, 0, 0);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const resized = canvasOf(w, h);
  ctxOf(resized).drawImage(full, 0, 0, w, h);
  full.remove();
  const resizedImg = ctxOf(resized).getImageData(0, 0, w, h);
  resized.remove();

  const gray = toGray(resizedImg);
  const mean = meanOf(gray);
  const dark = mean < 125;

  // Single enhancement pipeline (the old one did stretchContrast → sharpen → otsu separately)
  const enhanced: Gray = {
    data: new Uint8ClampedArray(gray.data),
    width: gray.width,
    height: gray.height,
  };
  // Inline percentile contrast stretch (2nd-98th)
  {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]]++;
    const total = gray.data.length;
    let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.02) { lo = v; break; } }
    acc = 0;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.98) { hi = v; break; } }
    if (hi - lo < 15) { lo = 0; hi = 255; }
    const span = hi - lo;
    for (let i = 0; i < gray.data.length; i++) {
      enhanced.data[i] = Math.max(0, Math.min(255, ((gray.data[i] - lo) / span) * 255));
    }
  }

  const primary = dark ? invert(enhanced) : enhanced;

  // Build 3 variants in one shot
  const v: RenderedVariant[] = [
    { name: 'gray', canvas: grayToCanvas(primary), regionWeight },
  ];

  // Adaptive: critical for uneven lighting
  v.push({ name: 'adaptive', canvas: grayToCanvas(adaptiveThreshold(primary)), regionWeight: regionWeight * 0.95 });

  // Inverted: catches mis-detected dark themes
  v.push({ name: 'inverted', canvas: grayToCanvas(invert(primary)), regionWeight: regionWeight * 0.85 });

  return { variants: v, detected: detection.detected, score: detection.score };
}

/* ───────────────────────── recognition ───────────────────────── */

export interface LocalReading {
  text: string;
  confidence: number;
  variant: string;
  contextHits: number;
}

export interface LocalScan {
  parsed: ParsedTime;
  reading: LocalReading;
  confidence: number;
  consensus: ConsensusResult;
  elapsedMs: number;
  screenDetected: boolean;
}

export type LocalFailure = { parsed: null; reading: LocalReading | null };

export async function recognize(
  source: ImageData,
  opts: {
    onProgress?: (pct: number) => void;
    budgetMs?: number;
    alternates?: ImageData[];
  } = {},
): Promise<LocalScan | LocalFailure> {
  const started = performance.now();
  const budget = opts.budgetMs ?? 7000;
  const deadline = started + budget;

  const worker = await getWorker(opts.onProgress);

  // ── Step 1: preprocess (fast: < 30ms) ──
  const { variants, detected } = preprocess(source);

  // ── Step 2: run Tesseract on each variant sequentially ──
  // Each recognition takes ~200-400ms. With 3 variants, worst case ~1.2s.
  const candidates: Candidate[] = [];

  for (const v of variants) {
    if (performance.now() > deadline) break;
    let text = '';
    let conf = 0;
    try {
      const { data } = await worker.recognize(v.canvas);
      text = data.text ?? '';
      conf = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
    } catch { continue; }
    if (!text.trim()) continue;

    for (const parsed of findAll(text)) {
      candidates.push({
        parsed,
        ocrConfidence: conf,
        variant: v.name,
        regionWeight: v.regionWeight,
        text,
      });
    }
  }

  let consensus = vote(candidates);

  // ── Step 4: numeric whitelist pass if not decisive ──
  if (!isDecisive(consensus) && performance.now() < deadline) {
    try {
      const nw = await getNumericWorker();
      for (const v of variants) {
        if (performance.now() > deadline) break;
        let text = '';
        let conf = 0;
        try {
          const { data } = await nw.recognize(v.canvas);
          text = data.text ?? '';
          conf = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
        } catch { continue; }
        if (!text.trim()) continue;
        for (const parsed of findAll(text)) {
          candidates.push({ parsed, ocrConfidence: conf, variant: `num:${v.name}`, regionWeight: v.regionWeight * 1.04, text });
        }
      }
      consensus = vote(candidates);
    } catch { /* numeric worker unavailable */ }
  }

  // ── Step 5: retry with 2nd burst frame if still not decisive ──
  if (!isDecisive(consensus) && opts.alternates?.length) {
    for (const alt of opts.alternates) {
      if (performance.now() > deadline) break;
      const altPp = preprocess(alt);
      for (const v of altPp.variants) {
        if (performance.now() > deadline) break;
        let text = '';
        let conf = 0;
        try {
          const { data } = await worker.recognize(v.canvas);
          text = data.text ?? '';
          conf = Math.max(0, Math.min(1, (data.confidence ?? 0) / 100));
        } catch { continue; }
        if (!text.trim()) continue;
        for (const parsed of findAll(text)) {
          candidates.push({ parsed, ocrConfidence: conf, variant: `alt:${v.name}`, regionWeight: v.regionWeight * 0.9, text });
        }
      }
      consensus = vote(candidates);
      if (isDecisive(consensus)) break;
    }
  }

  // ── Step 6: final vote or failure ──
  consensus = vote(candidates);

  if (!consensus) {
    // Collect all readings for diagnostics
    const allTexts = candidates.map((c) => c.text);
    const bestText = allTexts.sort((a, b) => b.length - a.length)[0] ?? '';
    return { parsed: null, reading: { text: bestText, confidence: 0, variant: '', contextHits: 0 } };
  }

  return {
    parsed: { ...consensus.best.parsed, minutes: consensus.minutes },
    reading: {
      text: consensus.best.text,
      confidence: consensus.best.ocrConfidence,
      variant: consensus.best.variant,
      contextHits: countContext(consensus.best.text),
    },
    confidence: consensus.confidence,
    consensus,
    elapsedMs: Math.round(performance.now() - started),
    screenDetected: detected,
  };
}
