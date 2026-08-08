# Screen-Time Videos (3h / 3–5h / >5h)

This README explains how to add the three milestone videos and how the site will play them based on user screen time.

Overview
- Upload three video files to public/videos/ using the exact filenames below.
- The site includes a lightweight client module at `src/utils/screenTimeVideo.tsx` that tracks visible screen time and plays the appropriate video in a temporary full-screen overlay when a milestone is reached.
- No backend or UI component changes are required.

Required filenames (place in `public/videos/`):
- `3h.mp4`        — played if the user hits ~3 hours (preferred within a small window)
- `3to5h.mp4`     — played if user is between 3 and 5 hours (and exact 3h has been missed)
- `gt5h.mp4`      — played once user exceeds 5 hours

Default behavior
- The module uses these default paths:
  - `/videos/3h.mp4`
  - `/videos/3to5h.mp4`
  - `/videos/gt5h.mp4`
- The module persists elapsed seconds and "played" flags in `localStorage` so each milestone plays only once per browser profile.
- The overlay video is muted when auto-playing to maximize browser autoplay compatibility.

How it works (brief)
- The module counts seconds only while `document.visibilityState === 'visible'` and the window is focused.
- When thresholds are reached it appends a single overlay container to `document.body` and mounts a video element (via React or DOM fallback). The overlay is removed after playback.
- The module does not mutate existing DOM elements or global CSS; it only appends/removes one overlay node, so it should not interfere with OCR or other page functions.

Integration (you usually don't need to change anything)
- The module file `src/utils/screenTimeVideo.tsx` currently auto-initializes on import. If your app imports that module (or the module file is bundled), it will start tracking immediately.
- If you prefer to explicitly initialize, the module exports `initScreenTimeVideo(config?)` — to call it from your entrypoint (`src/index.tsx` or similar):

```tsx
import { initScreenTimeVideo } from './utils/screenTimeVideo';
initScreenTimeVideo({
  // optional overrides:
  // videoAt3h: '/videos/3h.mp4',
  // video3to5h: '/videos/3to5h.mp4',
  // videoGt5h: '/videos/gt5h.mp4',
  // autoplayEnabled: true | false
});
```

Testing / Debug
- Open the browser console and use the debug API: `window.__screenTimeVideoAPI`.
  - `window.__screenTimeVideoAPI.getElapsed()` -> returns elapsed seconds
  - `window.__screenTimeVideoAPI.resetElapsed()` -> resets counters and played flags
  - `window.__screenTimeVideoAPI.play3hExact()` / `play3to5h()` / `playGt5h()` -> manually trigger playback for testing

Notes & Troubleshooting
- If browser blocks autoplay with sound, videos are muted during autoplay. To enable sound, either:
  - set `autoplayEnabled: false` and trigger playback after a user gesture, or
  - prompt the user to interact (click) and then call `initScreenTimeVideo({ autoplayEnabled: true })`.
- If overlay is behind other elements, adjust `overlayZIndex` in the init config.
- To change the exact 3-hour preferred window, set `exact3hWindowSec` when initializing (default 60 seconds).

If you want me to also:
- Add a `public/videos/.gitkeep` placeholder (so the folder appears in git),
- Or change the module to require explicit initialization (not auto-init),
let me know and I will commit that change.
