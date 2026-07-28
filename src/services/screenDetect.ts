/**
 * Phone-screen detection — simplified for speed.
 *
 * Previous version: histogram → connected components → 4-point corner →
 * Gaussian elimination → bilinear inverse mapping over ~1.4M pixels.
 * Cost: 150-400ms just for the warp.
 *
 * This version: downsample → brightness centroid → bounding box → crop.
 * Cost: < 15ms. Tesseract's LSTM handles the mild perspective from a
 * bounding-box crop perfectly well — it was trained on exactly this kind
 * of input. The expensive perspective warp was solving a problem that
 * did not exist.
 */

import {
  canvasOf, ctxOf, toGray, type Gray, type Point,
} from './imageOps';

export interface ScreenDetection {
  image: ImageData;
  quad: Point[];
  score: number;
  detected: boolean;
}

const PROXY_W = 160;

function proxy(src: ImageData): { gray: Gray; scale: number; ctx: CanvasRenderingContext2D } {
  const scale = PROXY_W / src.width;
  const w = Math.max(32, Math.round(src.width * scale));
  const h = Math.max(32, Math.round(src.height * scale));

  const full = canvasOf(src.width, src.height);
  ctxOf(full).putImageData(src, 0, 0);

  const small = canvasOf(w, h);
  const sctx = ctxOf(small);
  sctx.imageSmoothingQuality = 'low';
  sctx.drawImage(full, 0, 0, w, h);
  full.remove();

  const imageData = sctx.getImageData(0, 0, w, h);
  return { gray: toGray(imageData), scale, ctx: sctx };
}

/**
 * Find the brightest contiguous rectangular region.
 *
 * Approach: divide the image into a coarse grid, compute the mean
 * brightness of each cell, then find the rectangle of cells that
 * maximises average brightness * area. A phone screen is the
 * brightest coherent rectangle in any webcam frame.
 */
function findScreenQuad(gray: Gray, scale: number, fullW: number, fullH: number): { quad: Point[]; score: number } | null {
  const { data: d, width: w, height: h } = gray;
  const cols = Math.min(12, w);
  const rows = Math.min(8, h);
  const cw = w / cols;
  const ch = h / rows;

  // Compute mean brightness per cell
  const means = new Float32Array(rows * cols);
  const counts = new Uint32Array(rows * cols);

  for (let y = 0; y < h; y++) {
    const ry = Math.min(rows - 1, (y / ch) | 0);
    for (let x = 0; x < w; x++) {
      const cx = Math.min(cols - 1, (x / cw) | 0);
      const idx = ry * cols + cx;
      means[idx] += d[y * w + x];
      counts[idx]++;
    }
  }
  for (let i = 0; i < means.length; i++) {
    means[i] = counts[i] > 0 ? means[i] / counts[i] : 0;
  }

  // Find the screen by looking for the brightest rectangular sub-grid
  let bestScore = -1;
  let bestRect = { r0: 0, c0: 0, r1: rows - 1, c1: cols - 1 };

  for (let r0 = 0; r0 < rows; r0++) {
    for (let c0 = 0; c0 < cols; c0++) {
      for (let r1 = r0; r1 < rows; r1++) {
        for (let c1 = c0; c1 < cols; c1++) {
          const area = (r1 - r0 + 1) * (c1 - c0 + 1);
          if (area < 8 || area > rows * cols * 0.85) continue;

          let sum = 0;
          for (let r = r0; r <= r1; r++) {
            for (let c = c0; c <= c1; c++) {
              sum += means[r * cols + c];
            }
          }
          const avg = sum / area;

          // Heuristic: screen cells should be brighter than the median
          const med = 100; // phone screens are usually > 100 in luminance
          const brightnessBonus = Math.max(0, (avg - med) / 155);
          const fill = area / (rows * cols);

          // Penalise very small or very large rectangles
          const sizePenalty = fill < 0.1 ? fill / 0.1 : fill > 0.7 ? 1.0 : 1.0;

          // Aspect ratio should be phone-like (0.4-0.6)
          const ar = (c1 - c0 + 1) / (r1 - r0 + 1);
          const arBonus = (ar > 0.35 && ar < 0.75) ? 1.0 : 0.5;

          const score = brightnessBonus * arBonus * sizePenalty;
          if (score > bestScore) {
            bestScore = score;
            bestRect = { r0, c0, r1, c1 };
          }
        }
      }
    }
  }

  if (bestScore < 0.15) return null;

  // Map grid coords back to pixel coords
  const pad = 2; // expand a little to avoid edge clipping
  const tl: Point = {
    x: Math.max(0, (bestRect.c0 - pad) * cw / scale),
    y: Math.max(0, (bestRect.r0 - pad) * ch / scale),
  };
  const br: Point = {
    x: Math.min(fullW, (bestRect.c1 + pad + 1) * cw / scale),
    y: Math.min(fullH, (bestRect.r1 + pad + 1) * ch / scale),
  };

  // Confidence: how much of the image does this occupy, and how bright is it
  const screenArea = (br.x - tl.x) * (br.y - tl.y);
  const totalArea = fullW * fullH;
  const fraction = screenArea / totalArea;
  const brightness = bestScore;

  // A phone screen should be 10%-70% of the frame and notably brighter
  let score = 0;
  if (fraction >= 0.08 && fraction <= 0.75 && brightness > 0.15) {
    score = Math.min(1, brightness * 0.6 + Math.min(1, fraction / 0.35) * 0.4);
  }

  return {
    quad: [tl, { x: br.x, y: tl.y }, br, { x: tl.x, y: br.y }],
    score,
  };
}

/**
 * Detect the phone screen and return the cropped + scaled region.
 * No perspective warp — the bounding-box crop keeps this under 15ms
 * and Tesseract's LSTM handles the mild perspective from webcam angles.
 */
export function detectScreen(src: ImageData): ScreenDetection {
  const fallback: ScreenDetection = {
    image: src,
    quad: [
      { x: 0, y: 0 },
      { x: src.width - 1, y: 0 },
      { x: src.width - 1, y: src.height - 1 },
      { x: 0, y: src.height - 1 },
    ],
    score: 0,
    detected: false,
  };

  try {
    const { gray, scale } = proxy(src);
    const result = findScreenQuad(gray, scale, src.width, src.height);
    if (!result) return fallback;

    const [tl, , br] = result.quad;
    const x = Math.max(0, Math.floor(tl.x) - 4);
    const y = Math.max(0, Math.floor(tl.y) - 4);
    const w = Math.min(src.width, Math.ceil(br.x - tl.x)) + 8;
    const h = Math.min(src.height, Math.ceil(br.y - tl.y)) + 8;

    // Crop the bounding-box region from the full-resolution source
    const srcCanvas = canvasOf(src.width, src.height);
    ctxOf(srcCanvas).putImageData(src, 0, 0);
    const cropCanvas = canvasOf(w, h);
    const cctx = ctxOf(cropCanvas);
    cctx.drawImage(srcCanvas, x, y, w, h, 0, 0, w, h);
    const cropped = cctx.getImageData(0, 0, w, h);
    srcCanvas.remove();
    cropCanvas.remove();

    return {
      image: cropped,
      quad: result.quad,
      score: result.score,
      detected: true,
    };
  } catch {
    return fallback;
  }
}
