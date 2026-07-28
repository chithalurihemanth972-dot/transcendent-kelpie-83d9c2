/**
 * Scan orchestrator.
 *
 * Engine selection is automatic:
 *   1. If the optional Python backend is reachable, use it (fastest).
 *   2. Otherwise run Tesseract WASM in this browser (zero install).
 *
 * Either way the image never leaves the user's machine. The browser
 * engine is the DEFAULT so the product works with nothing installed.
 */

import { formatDuration } from './screenTimeParser';
import * as local from './ocrLocal';
import { blobToImageData, imageDataToBlob } from './frameCapture';

export type ScanStatus = 'healthy' | 'warning';
export type Engine = 'server' | 'browser';

export interface ScanResult {
  status: ScanStatus;
  screen_time: string;
  minutes: number;
  confidence: number;
  limit_minutes: number;
  limit_label: string;
  over_by_minutes: number;
  ratio: number;
  matched_text?: string;
  detected_text?: string;
  elapsed_ms?: number;
  engine: Engine;
  /** How many independent readings agreed on this value. */
  votes?: number;
  /** Share of total evidence behind the winning value (0..1). */
  agreement?: number;
  /** Whether a phone screen was located and flattened. */
  screen_detected?: boolean;
}

/** A frame, a burst of frames, or an encoded image. */
export type ScanInput = Blob | ImageData | ImageData[];

export type ScanErrorCode =
  | 'EMPTY_UPLOAD' | 'BAD_TYPE' | 'DECODE_FAILED' | 'TOO_LARGE'
  | 'NO_TEXT' | 'NOT_DETECTED' | 'LOW_CONFIDENCE'
  | 'OCR_UNAVAILABLE' | 'INTERNAL' | 'NETWORK' | 'ABORTED';

export interface ScanFailure {
  code: ScanErrorCode;
  message: string;
  detected_text?: string;
}

export const ERROR_COPY: Record<ScanErrorCode, string> = {
  NOT_DETECTED: 'ఈ చిత్రంలో స్క్రీన్ టైమ్ గుర్తించబడలేదు.',
  NO_TEXT: 'ఈ చిత్రంలో స్క్రీన్ టైమ్ గుర్తించబడలేదు.',
  LOW_CONFIDENCE: 'చిత్రం స్పష్టంగా లేదు. మరోసారి ప్రయత్నించండి.',
  DECODE_FAILED: 'చిత్రాన్ని చదవలేకపోయాము. మరోసారి ప్రయత్నించండి.',
  BAD_TYPE: 'ఈ ఫైల్ రకం support చేయబడదు.',
  TOO_LARGE: 'చిత్రం చాలా పెద్దది. చిన్న చిత్రం ప్రయత్నించండి.',
  EMPTY_UPLOAD: 'చిత్రం అందలేదు. మరోసారి ప్రయత్నించండి.',
  OCR_UNAVAILABLE: 'విశ్లేషణ ఇంజిన్ లోడ్ కాలేదు. ఇంటర్నెట్ కనెక్షన్ చూడండి.',
  NETWORK: 'విశ్లేషణ సేవకు కనెక్ట్ కాలేదు.',
  ABORTED: 'విశ్లేషణ ఆపివేయబడింది.',
  INTERNAL: 'ఏదో తప్పు జరిగింది. మరోసారి ప్రయత్నించండి.',
};

export class ScanError extends Error {
  code: ScanErrorCode;
  detectedText?: string;
  constructor(code: ScanErrorCode, message?: string, detectedText?: string) {
    super(message || ERROR_COPY[code]);
    this.name = 'ScanError';
    this.code = code;
    this.detectedText = detectedText;
  }
}

/* ───────────────────── configuration ───────────────────── */

const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {};

/** Healthy/warning threshold. Overridable via VITE_SCREEN_TIME_LIMIT. */
export const LIMIT_MINUTES = Number(env.VITE_SCREEN_TIME_LIMIT ?? 300) || 300;

const RAW_BASE = (env.VITE_API_BASE ?? 'http://127.0.0.1:8000').replace(/\/$/, '');

/**
 * A page served over HTTPS cannot call http://127.0.0.1 — the browser
 * blocks it as mixed content before the request is even made. Detect
 * that up front so we never waste a round-trip or surface a confusing
 * error; the browser engine handles it instead.
 */
const MIXED_CONTENT_BLOCKED =
  typeof window !== 'undefined' &&
  window.location.protocol === 'https:' &&
  RAW_BASE.startsWith('http://');

export const API_BASE = RAW_BASE;

/* ───────────────────── backend probe ───────────────────── */

export interface BackendStatus {
  reachable: boolean;
  reason: 'ok' | 'mixed-content' | 'offline' | 'no-ocr';
  limitMinutes: number;
}

let cachedStatus: BackendStatus | null = null;

export async function probeBackend(force = false): Promise<BackendStatus> {
  if (cachedStatus && !force) return cachedStatus;

  if (MIXED_CONTENT_BLOCKED) {
    cachedStatus = { reachable: false, reason: 'mixed-content', limitMinutes: LIMIT_MINUTES };
    return cachedStatus;
  }

  try {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${API_BASE}/api/health`, { signal: controller.signal });
    window.clearTimeout(timeout);

    if (!res.ok) {
      cachedStatus = { reachable: false, reason: 'offline', limitMinutes: LIMIT_MINUTES };
      return cachedStatus;
    }
    const json = await res.json();
    cachedStatus = json?.ok && json?.ocr_available
      ? { reachable: true, reason: 'ok', limitMinutes: json.limit_minutes ?? LIMIT_MINUTES }
      : { reachable: false, reason: 'no-ocr', limitMinutes: LIMIT_MINUTES };
  } catch {
    cachedStatus = { reachable: false, reason: 'offline', limitMinutes: LIMIT_MINUTES };
  }
  return cachedStatus;
}

/** Preload the WASM engine so the first scan is not slowed by download. */
export function warmUpBrowserEngine(): void {
  void local.warmUp();
}

/* ───────────────────── decision logic ───────────────────── */

/** Normalise any accepted input into a primary frame plus fallbacks. */
async function normaliseInput(
  input: ScanInput,
): Promise<{ primary: ImageData; alternates: ImageData[] }> {
  if (Array.isArray(input)) {
    if (!input.length) throw new ScanError('EMPTY_UPLOAD');
    return { primary: input[0], alternates: input.slice(1, 3) };
  }
  if (input instanceof Blob) {
    return { primary: await blobToImageData(input), alternates: [] };
  }
  return { primary: input, alternates: [] };
}

function buildResult(
  minutes: number,
  confidence: number,
  engine: Engine,
  limitMinutes: number,
  extras: Partial<ScanResult> = {},
): ScanResult {
  const limit = limitMinutes || LIMIT_MINUTES;
  return {
    status: minutes < limit ? 'healthy' : 'warning',
    screen_time: formatDuration(minutes),
    minutes,
    confidence: Number(confidence.toFixed(4)),
    limit_minutes: limit,
    limit_label: formatDuration(limit),
    over_by_minutes: Math.max(0, minutes - limit),
    ratio: Number(Math.min(2, minutes / Math.max(1, limit)).toFixed(4)),
    engine,
    ...extras,
  };
}

/* ───────────────────── engines ───────────────────── */

async function scanViaServer(blob: Blob, signal?: AbortSignal): Promise<ScanResult> {
  const form = new FormData();
  form.append('image', blob, 'capture.png');

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/scan`, { method: 'POST', body: form, signal });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw new ScanError('ABORTED');
    throw new ScanError('NETWORK');
  }

  let payload: Record<string, unknown>;
  try {
    payload = await res.json();
  } catch {
    throw new ScanError('INTERNAL');
  }

  if (!res.ok || payload.ok === false) {
    const code = (payload.code as ScanErrorCode) ?? 'INTERNAL';
    throw new ScanError(code, undefined, payload.detected_text as string);
  }

  return { ...(payload as unknown as ScanResult), engine: 'server' };
}

async function scanViaBrowser(
  input: ScanInput,
  limitMinutes: number,
  onProgress?: (pct: number) => void,
  budgetMs?: number,
): Promise<ScanResult> {
  const started = performance.now();
  const { primary, alternates } = await normaliseInput(input);

  let outcome: Awaited<ReturnType<typeof local.recognize>>;
  try {
    outcome = await local.recognize(primary, { onProgress, alternates, budgetMs });
  } catch {
    // Worker/WASM could not load — almost always a blocked CDN.
    throw new ScanError('OCR_UNAVAILABLE');
  }

  if (!outcome.parsed) {
    const text = outcome.reading?.text ?? '';
    throw new ScanError(text.trim() ? 'NOT_DETECTED' : 'NO_TEXT', undefined, text);
  }

  const { parsed, reading, confidence, consensus, screenDetected } = outcome as local.LocalScan;
  if (confidence < 0.34) {
    throw new ScanError('LOW_CONFIDENCE', undefined, reading.text);
  }

  return buildResult(parsed.minutes, confidence, 'browser', limitMinutes, {
    matched_text: parsed.raw,
    detected_text: reading.text.replace(/\s+/g, ' ').trim().slice(0, 800),
    elapsed_ms: Math.round(performance.now() - started),
    votes: consensus.votes,
    agreement: Number(consensus.agreement.toFixed(3)),
    screen_detected: screenDetected,
  });
}

/* ───────────────────── public API ───────────────────── */

export interface ScanOptions {
  signal?: AbortSignal;
  onProgress?: (pct: number) => void;
  onEngine?: (engine: Engine) => void;
  /** Hard ceiling for browser-side analysis. */
  budgetMs?: number;
}

/** Minimum confidence we are willing to report as an answer. */
const ACCEPT_CONFIDENCE = 0.55;

/**
 * Analyse a capture. Accepts a single image or a ranked burst.
 *
 * When the server engine is available it is tried first, but a weak or
 * failed server verdict is re-checked in the browser rather than shipped
 * to the user — two independent engines agreeing is the strongest signal
 * available without a ground-truth label.
 */
export async function scanImage(input: ScanInput, opts: ScanOptions = {}): Promise<ScanResult> {
  const { signal, onProgress, onEngine, budgetMs } = opts;
  const status = await probeBackend();

  if (status.reachable) {
    onEngine?.('server');
    try {
      const blob = Array.isArray(input)
        ? await imageDataToBlob(input[0])
        : input instanceof Blob
          ? input
          : await imageDataToBlob(input);

      const serverResult = await scanViaServer(blob, signal);

      // Server was unsure — verify locally before trusting it.
      if (serverResult.confidence < ACCEPT_CONFIDENCE) {
        try {
          onEngine?.('browser');
          const localResult = await scanViaBrowser(input, status.limitMinutes, onProgress, budgetMs);
          // Both engines agree → very high confidence.
          if (Math.abs(localResult.minutes - serverResult.minutes) <= 2) {
            return { ...localResult, confidence: Math.min(0.99, localResult.confidence + 0.18) };
          }
          return localResult.confidence >= serverResult.confidence ? localResult : serverResult;
        } catch {
          return serverResult;
        }
      }
      return serverResult;
    } catch (err) {
      const e = err as ScanError;
      // Transport problems fall back; a genuine "nothing here" surfaces.
      if (e.code === 'NETWORK' || e.code === 'OCR_UNAVAILABLE' || e.code === 'INTERNAL') {
        cachedStatus = null;
        onEngine?.('browser');
        return scanViaBrowser(input, status.limitMinutes, onProgress, budgetMs);
      }
      throw e;
    }
  }

  onEngine?.('browser');
  return scanViaBrowser(input, status.limitMinutes, onProgress, budgetMs);
}

/** Backwards-compatible alias. */
export const postScan = (input: ScanInput, signal?: AbortSignal) => scanImage(input, { signal });

/** Draw the current video frame to a PNG blob at native resolution. */
export function grabFrame(video: HTMLVideoElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) { reject(new ScanError('EMPTY_UPLOAD')); return; }

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) { reject(new ScanError('INTERNAL')); return; }

    ctx.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new ScanError('INTERNAL'))),
      'image/png',
    );
  });
}
