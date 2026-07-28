# Awareness videos

Drop two files here — they auto-play inside the Result section:

| File | Plays when | Tone |
|---|---|---|
| `healthy.mp4` | `status === "healthy"` (under the threshold) | Encouraging, calm, congratulatory |
| `warning.mp4` | `status === "warning"` (at or over the threshold) | Gentle, supportive guidance — never scolding |

## Requirements

- **Format:** MP4 (H.264 + AAC) for the widest browser support
- **Aspect ratio:** 16:9 — the player reserves this, so anything else is letterboxed
- **Length:** 15–40 s, they loop
- **Resolution:** 1280×720 is plenty; keep each file under ~5 MB
- **Audio:** starts muted (browser autoplay policy). The user can unmute with
  the control in the player's bottom-right corner.

## If the files are missing

Nothing breaks. `AwarenessVideo.tsx` detects the load failure and renders a
calm animated panel with the matching Telugu guidance line instead, so the
result section never shows a broken player.
