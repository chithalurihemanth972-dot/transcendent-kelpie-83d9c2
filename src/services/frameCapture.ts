/**
 * Burst frame capture with automatic sharpness selection.
 *
 * A single webcam grab is a lottery: autofocus may be hunting, the hand
 * may be mid-shake, the rolling shutter may have smeared a row. Instead
 * of gambling, we grab a short burst and keep only the frames a human
 * would have called "the good one".
 */

import { canvasOf, ctxOf, toGray, laplacianVariance, exposureScore } from './imageOps';

export interface ScoredFrame {
  image: ImageData;
  sharpness: number;
  exposure: number;
  score: number;
}

export interface BurstOptions {
  /** How many frames to grab. */
  count?: number;
  /** Delay between grabs (ms). */
  intervalMs?: number;
  /** Longest the whole burst may take. */
  budgetMs?: number;
  onTick?: (captured: number, total: number) => void;
}

const DEFAULTS: Required<Omit<BurstOptions, 'onTick'>> = {
  count: 7,
  intervalMs: 70,
  budgetMs: 900,
};

/** Grab the current video frame at native resolution. */
export function grabImageData(video: HTMLVideoElement): ImageData | null {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) return null;

  const c = canvasOf(w, h);
  const ctx = ctxOf(c);
  ctx.drawImage(video, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/**
 * Score a frame for OCR suitability.
 * Sharpness dominates — a well-exposed blurry frame is useless, whereas
 * a slightly dark but crisp frame still reads fine after normalisation.
 */
function scoreFrame(image: ImageData): ScoredFrame {
  // Score on a downscaled proxy: same ranking, a fraction of the cost.
  const scale = Math.min(1, 480 / image.width);
  let proxyData = image;

  if (scale < 1) {
    const w = Math.max(32, Math.round(image.width * scale));
    const h = Math.max(32, Math.round(image.height * scale));
    const full = canvasOf(image.width, image.height);
    ctxOf(full).putImageData(image, 0, 0);
    const small = canvasOf(w, h);
    const sctx = ctxOf(small);
    sctx.drawImage(full, 0, 0, w, h);
    proxyData = sctx.getImageData(0, 0, w, h);
  }

  const gray = toGray(proxyData);
  const sharpness = laplacianVariance(gray);
  const exposure = exposureScore(gray);

  // Saturating curve: past ~400 the extra sharpness stops mattering.
  const sharpNorm = Math.min(1, sharpness / 400);
  return {
    image,
    sharpness,
    exposure,
    score: sharpNorm * 0.78 + exposure * 0.22,
  };
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Capture a burst and return frames ranked best-first.
 * Stops early once a genuinely sharp frame is in hand.
 */
export async function captureBurst(
  video: HTMLVideoElement,
  opts: BurstOptions = {},
): Promise<ScoredFrame[]> {
  const { count, intervalMs, budgetMs } = { ...DEFAULTS, ...opts };
  const started = performance.now();
  const frames: ScoredFrame[] = [];

  for (let i = 0; i < count; i++) {
    if (performance.now() - started > budgetMs) break;

    const image = grabImageData(video);
    if (image) {
      const scored = scoreFrame(image);
      frames.push(scored);
      opts.onTick?.(frames.length, count);

      // Excellent frame already in hand — no reason to keep the user waiting.
      if (scored.sharpness > 520 && scored.exposure > 0.72 && frames.length >= 3) break;
    }

    if (i < count - 1) await wait(intervalMs);
  }

  frames.sort((a, b) => b.score - a.score);
  return frames;
}

/** Convert ImageData to a PNG blob (for the server engine). */
export function imageDataToBlob(image: ImageData): Promise<Blob> {
  const c = canvasOf(image.width, image.height);
  ctxOf(c).putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png');
  });
}

export async function blobToImageData(blob: Blob): Promise<ImageData> {
  const bmp = await createImageBitmap(blob);
  const c = canvasOf(bmp.width, bmp.height);
  ctxOf(c).drawImage(bmp, 0, 0);
  bmp.close?.();
  return ctxOf(c).getImageData(0, 0, c.width, c.height);
}
