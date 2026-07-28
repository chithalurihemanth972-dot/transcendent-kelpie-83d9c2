import { useEffect, type RefObject } from 'react';

/**
 * Buttery pointer parallax: a rAF loop eases two CSS variables (--px, --py)
 * toward the normalized cursor position every frame. Unlike a CSS transition
 * on transform (which lags behind a 60 Hz event stream), the lerp converges
 * smoothly and never fights the compositor.
 *
 * Layers read the vars via `transform: translate3d(calc(var(--px)*N*1px) …)`.
 */
export function usePointerParallax(rootRef: RefObject<HTMLElement | null>, strength = 0.08) {
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;

    let targetX = 0;
    let targetY = 0;
    let curX = 0;
    let curY = 0;
    let raf = 0;
    let active = false;

    const tick = () => {
      curX += (targetX - curX) * strength;
      curY += (targetY - curY) * strength;

      /* snap to rest when close enough so we can stop the loop */
      if (Math.abs(targetX - curX) < 0.001 && Math.abs(targetY - curY) < 0.001) {
        curX = targetX;
        curY = targetY;
        el.style.setProperty('--px', curX.toFixed(4));
        el.style.setProperty('--py', curY.toFixed(4));
        active = false;
        return;
      }

      el.style.setProperty('--px', curX.toFixed(4));
      el.style.setProperty('--py', curY.toFixed(4));
      raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (!active) {
        active = true;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      targetX = ((e.clientX - r.left) / r.width - 0.5) * 2;
      targetY = ((e.clientY - r.top) / r.height - 0.5) * 2;
      kick();
    };

    const onLeave = () => {
      targetX = 0;
      targetY = 0;
      kick();
    };

    el.addEventListener('pointermove', onMove, { passive: true });
    el.addEventListener('pointerleave', onLeave);

    return () => {
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(raf);
      el.style.setProperty('--px', '0');
      el.style.setProperty('--py', '0');
    };
  }, [rootRef, strength]);
}
