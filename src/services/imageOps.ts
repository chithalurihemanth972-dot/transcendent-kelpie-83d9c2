/**
 * Low-level image operations for camera-grade OCR.
 *
 * Everything here is hand-written typed-array code — no OpenCV in the
 * browser. Kept allocation-light because these run on every frame.
 */

export interface Gray {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/* ───────────────────────── conversion ───────────────────────── */

export function canvasOf(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w));
  c.height = Math.max(1, Math.round(h));
  return c;
}

export function ctxOf(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas 2d unavailable');
  return ctx;
}

export function toGray(src: ImageData): Gray {
  const { data, width, height } = src;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    // Rec.601 luma
    out[p] = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
  }
  return { data: out, width, height };
}

/** Max of R,G,B — recovers coloured digits that luma flattens away. */
export function toMaxChannel(src: ImageData): Gray {
  const { data, width, height } = src;
  const out = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; p < out.length; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    out[p] = r > g ? (r > b ? r : b) : g > b ? g : b;
  }
  return { data: out, width, height };
}

export function grayToCanvas(g: Gray): HTMLCanvasElement {
  const c = canvasOf(g.width, g.height);
  const ctx = ctxOf(c);
  const img = ctx.createImageData(g.width, g.height);
  for (let p = 0, i = 0; p < g.data.length; p++, i += 4) {
    const v = g.data[p];
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

export function meanOf(g: Gray): number {
  let s = 0;
  for (let i = 0; i < g.data.length; i++) s += g.data[i];
  return s / g.data.length;
}

/* ───────────────────── sharpness / quality ───────────────────── */

/**
 * Variance of the Laplacian — the standard blur metric.
 * Higher = sharper. A blurred webcam frame typically scores < 60;
 * a crisp one scores 300+.
 */
export function laplacianVariance(g: Gray): number {
  const { data, width: w, height: h } = g;
  if (w < 3 || h < 3) return 0;

  let sum = 0;
  let sumSq = 0;
  let n = 0;

  // Sub-sample every 2nd pixel — 4x faster, statistically identical.
  for (let y = 1; y < h - 1; y += 2) {
    const row = y * w;
    for (let x = 1; x < w - 1; x += 2) {
      const i = row + x;
      const lap =
        -4 * data[i] + data[i - 1] + data[i + 1] + data[i - w] + data[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (!n) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

/** Penalise frames that are blown out or crushed to black. */
export function exposureScore(g: Gray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i += 3) hist[g.data[i]]++;
  let total = 0;
  for (let v = 0; v < 256; v++) total += hist[v];
  if (!total) return 0;

  let clipped = 0;
  for (let v = 0; v < 6; v++) clipped += hist[v];
  for (let v = 250; v < 256; v++) clipped += hist[v];

  return 1 - Math.min(1, clipped / total / 0.35);
}

/* ───────────────────── enhancement ───────────────────── */

/** Percentile contrast stretch — robust to a few hot pixels. */
export function stretchContrast(g: Gray, lowPct = 0.02, highPct = 0.98): Gray {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;

  let acc = 0, lo = 0, hi = 255;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * lowPct) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * highPct) { hi = v; break; } }
  if (hi - lo < 12) { lo = 0; hi = 255; }

  const span = hi - lo;
  const lut = new Uint8ClampedArray(256);
  for (let v = 0; v < 256; v++) lut[v] = ((v - lo) / span) * 255;

  const out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < g.data.length; i++) out[i] = lut[g.data[i]];
  return { data: out, width: g.width, height: g.height };
}

/** 3x3 box blur — cheap moiré suppression for photos of LCD panels. */
export function boxBlur3(g: Gray): Gray {
  const { data, width: w, height: h } = g;
  const out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) { out[i] = data[i]; continue; }
      out[i] =
        (data[i - w - 1] + data[i - w] + data[i - w + 1] +
         data[i - 1]     + data[i]     + data[i + 1] +
         data[i + w - 1] + data[i + w] + data[i + w + 1]) / 9;
    }
  }
  return { data: out, width: w, height: h };
}

/** Unsharp mask built on the box blur above. */
export function unsharp(g: Gray, amount = 1.6): Gray {
  const blur = boxBlur3(g);
  const out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < g.data.length; i++) {
    out[i] = Math.max(0, Math.min(255, g.data[i] + amount * (g.data[i] - blur.data[i])));
  }
  return { data: out, width: g.width, height: g.height };
}

export function invert(g: Gray): Gray {
  const out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < g.data.length; i++) out[i] = 255 - g.data[i];
  return { data: out, width: g.width, height: g.height };
}

/* ───────────────────── thresholding ───────────────────── */

export function otsu(g: Gray): number {
  const hist = new Uint32Array(256);
  for (let i = 0; i < g.data.length; i++) hist[g.data[i]]++;
  const total = g.data.length;
  let sumAll = 0;
  for (let v = 0; v < 256; v++) sumAll += v * hist[v];

  let sumB = 0, wB = 0, best = -1, t = 127;
  for (let v = 0; v < 256; v++) {
    wB += hist[v];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += v * hist[v];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > best) { best = between; t = v; }
  }
  return t;
}

export function binarize(g: Gray, t: number): Gray {
  const out = new Uint8ClampedArray(g.data.length);
  for (let i = 0; i < g.data.length; i++) out[i] = g.data[i] > t ? 255 : 0;
  return { data: out, width: g.width, height: g.height };
}

/**
 * Local adaptive threshold via integral image (Bradley–Roth).
 *
 * This is THE fix for photographing a screen in a room: one half of the
 * phone may be in shadow while the other catches a lamp. A single global
 * Otsu cut destroys one half; a local mean handles both.
 * O(n) regardless of window size.
 */
export function adaptiveThreshold(g: Gray, windowFrac = 0.12, bias = 0.86): Gray {
  const { data, width: w, height: h } = g;
  const integral = new Float64Array((w + 1) * (h + 1));

  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += data[y * w + x];
      integral[(y + 1) * (w + 1) + (x + 1)] = integral[y * (w + 1) + (x + 1)] + rowSum;
    }
  }

  const half = Math.max(4, Math.floor(Math.min(w, h) * windowFrac * 0.5));
  const out = new Uint8ClampedArray(data.length);

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half);
    const y1 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half);
      const x1 = Math.min(w - 1, x + half);
      const count = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (w + 1) + (x1 + 1)] -
        integral[y0 * (w + 1) + (x1 + 1)] -
        integral[(y1 + 1) * (w + 1) + x0] +
        integral[y0 * (w + 1) + x0];
      const mean = sum / count;
      out[y * w + x] = data[y * w + x] > mean * bias ? 255 : 0;
    }
  }
  return { data: out, width: w, height: h };
}

/* ───────────────────── geometry ───────────────────── */

/**
 * Solve the 3x3 homography mapping `from` -> `to` (4 point pairs).
 * Returns the 8 free coefficients (h8 fixed at 1), or null if degenerate.
 */
export function solveHomography(from: Point[], to: Point[]): number[] | null {
  if (from.length !== 4 || to.length !== 4) return null;

  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -x * u, -y * u]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -x * v, -y * v]);
    b.push(v);
  }

  // Gaussian elimination with partial pivoting.
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-9) return null;
    if (pivot !== col) {
      [A[col], A[pivot]] = [A[pivot], A[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
    }
    const d = A[col][col];
    for (let c = col; c < n; c++) A[col][c] /= d;
    b[col] /= d;

    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (!f) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  return b;
}

/**
 * Perspective-correct `quad` (in source-image coords) to a flat
 * `outW x outH` canvas. Uses inverse mapping + bilinear sampling.
 */
export function warpQuad(
  src: ImageData,
  quad: Point[],
  outW: number,
  outH: number,
): ImageData | null {
  const dst: Point[] = [
    { x: 0, y: 0 },
    { x: outW - 1, y: 0 },
    { x: outW - 1, y: outH - 1 },
    { x: 0, y: outH - 1 },
  ];

  // Inverse mapping: destination -> source.
  const h = solveHomography(dst, quad);
  if (!h) return null;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;
  const out = new ImageData(outW, outH);
  const sw = src.width;
  const sh = src.height;
  const sd = src.data;
  const od = out.data;

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const denom = h6 * x + h7 * y + 1;
      const sx = (h0 * x + h1 * y + h2) / denom;
      const sy = (h3 * x + h4 * y + h5) / denom;

      const o = (y * outW + x) * 4;
      if (sx < 0 || sy < 0 || sx > sw - 1 || sy > sh - 1) {
        od[o] = od[o + 1] = od[o + 2] = 0;
        od[o + 3] = 255;
        continue;
      }

      const x0 = sx | 0, y0 = sy | 0;
      const x1 = Math.min(sw - 1, x0 + 1);
      const y1 = Math.min(sh - 1, y0 + 1);
      const fx = sx - x0, fy = sy - y0;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      for (let ch = 0; ch < 3; ch++) {
        od[o + ch] =
          sd[i00 + ch] * w00 + sd[i10 + ch] * w10 +
          sd[i01 + ch] * w01 + sd[i11 + ch] * w11;
      }
      od[o + 3] = 255;
    }
  }
  return out;
}

/** Shoelace area of a polygon. */
export function polygonArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    a += (pts[j].x + pts[i].x) * (pts[j].y - pts[i].y);
  }
  return Math.abs(a / 2);
}
