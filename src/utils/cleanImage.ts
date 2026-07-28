/**
 * Removes the baked-in white backdrop from AI-generated PNGs by
 * flood-filling from the image borders over "near-white, low-saturation"
 * pixels only. Interior whites (tusks, eye highlights, modak sheen) are
 * untouched because the fill can never reach them.
 *
 * Produces true-alpha PNG data URLs, cached per-source at module level so
 * every consumer (Hero, Blink layer, Results) pays the cost exactly once.
 */

type Listener = (url: string) => void;

const cache = new Map<string, string>();
const pending = new Map<string, Set<Listener>>();

export function getCleanGanesha(src: string, onReady: Listener): () => void {
  const hit = cache.get(src);
  if (hit) {
    onReady(hit);
    return () => undefined;
  }

  let set = pending.get(src);
  if (!set) {
    set = new Set();
    pending.set(src, set);
    process(src);
  }
  set.add(onReady);
  return () => set.delete(onReady);
}

function process(src: string) {
  const resolve = (url: string) => {
    cache.set(src, url);
    const set = pending.get(src);
    pending.delete(src);
    set?.forEach((fn) => fn(url));
  };

  const img = new Image();
  img.crossOrigin = 'anonymous';

  img.onload = () => {
    try {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('no ctx');
      ctx.drawImage(img, 0, 0);

      const image = ctx.getImageData(0, 0, w, h);
      const d = image.data;

      /* "background-ish" = very light AND almost achromatic — this skips
         the pink lotus, gold crown and warm skin tones. */
      const isBackground = (i: number) => {
        const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
        if (a === 0) return true;
        const lum = (r + g + b) / 3;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        return lum > 208 && max - min < 34;
      };

      /* Iterative flood-fill from all four borders. */
      const removed = new Uint8Array(w * h);
      const stack = new Int32Array(w * h);
      let top = 0;

      const seed = (x: number, y: number) => {
        const idx = y * w + x;
        if (!removed[idx] && isBackground(idx * 4)) {
          removed[idx] = 1;
          stack[top++] = idx;
        }
      };

      for (let x = 0; x < w; x++) { seed(x, 0); seed(x, h - 1); }
      for (let y = 0; y < h; y++) { seed(0, y); seed(w - 1, y); }

      while (top > 0) {
        const idx = stack[--top];
        const x = idx % w;
        const y = (idx / w) | 0;
        if (x > 0) seed(x - 1, y);
        if (x < w - 1) seed(x + 1, y);
        if (y > 0) seed(x, y - 1);
        if (y < h - 1) seed(x, y + 1);
      }

      /* Apply alpha with a soft luminance ramp for silky edges. */
      for (let idx = 0; idx < w * h; idx++) {
        if (!removed[idx]) continue;
        const i = idx * 4;
        const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
        let alpha = 0;
        if (lum < 248) alpha = Math.min(255, ((248 - lum) / 40) * 170);
        d[i + 3] = Math.min(d[i + 3], alpha | 0);
      }

      /* Feather the silhouette border: faint survivors next to removed
         pixels get softened so no halo remains. */
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const idx = y * w + x;
          if (removed[idx]) continue;
          const touchesRemoved =
            removed[idx - 1] || removed[idx + 1] ||
            removed[idx - w] || removed[idx + w];
          if (!touchesRemoved) continue;
          const i = idx * 4;
          const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
          const max = Math.max(d[i], d[i + 1], d[i + 2]);
          const min = Math.min(d[i], d[i + 1], d[i + 2]);
          if (lum > 238 && max - min < 28) {
            d[i + 3] = Math.min(d[i + 3], 110);
          }
        }
      }

      ctx.putImageData(image, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    } catch {
      resolve(src);
    }
  };

  img.onerror = () => resolve(src);
  img.src = src;
}
