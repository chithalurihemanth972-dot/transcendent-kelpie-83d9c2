import { useId } from 'react';

/**
 * A single flower petal rendered as SVG — the emoji-free petal for the
 * Scales with the parent's font-size (width/height are 1em).
 */
export default function Petal({ className = '' }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 24 24" className={`petal-shape ${className}`} aria-hidden focusable="false">
      <defs>
        <linearGradient id={`p${id}`} x1="0" y1="0" x2="0.6" y2="1">
          <stop offset="0%" stopColor="#ffd9e4" />
          <stop offset="55%" stopColor="#ffb2c6" />
          <stop offset="100%" stopColor="#e78ca8" />
        </linearGradient>
      </defs>
      {/* teardrop petal */}
      <path
        d="M12 2c4.6 3.4 7.2 7.3 7.2 11.1 0 4.2-3.2 6.9-7.2 8.9-4-2-7.2-4.7-7.2-8.9C4.8 9.3 7.4 5.4 12 2Z"
        fill={`url(#p${id})`}
      />
      {/* soft inner crease */}
      <path
        d="M12 5.4c-2.1 2.9-3.2 5.7-3.2 8.4 0 2.2.9 4.1 2.3 5.6"
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="0.9"
        strokeLinecap="round"
      />
    </svg>
  );
}
