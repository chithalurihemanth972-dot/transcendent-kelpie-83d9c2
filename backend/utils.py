"""Small shared helpers: timing, safe temp files, uniform JSON envelopes."""

from __future__ import annotations

import os
import tempfile
import time
from contextlib import contextmanager
from typing import Any, Dict, Iterator, Optional


@contextmanager
def temp_file(suffix: str = ".png") -> Iterator[str]:
    """Yield a temp file path and guarantee deletion afterwards.

    Used so a captured frame never persists on disk beyond the request,
    even if OCR raises.
    """
    fd, path = tempfile.mkstemp(suffix=suffix, prefix="dsam_")
    os.close(fd)
    try:
        yield path
    finally:
        try:
            if os.path.exists(path):
                os.remove(path)
        except OSError:
            # Best effort — never let cleanup failure surface to the user.
            pass


class Timer:
    """Context manager measuring wall time in milliseconds."""

    def __init__(self) -> None:
        self.ms: int = 0
        self._start: float = 0.0

    def __enter__(self) -> "Timer":
        self._start = time.perf_counter()
        return self

    def __exit__(self, *_exc: Any) -> None:
        self.ms = int((time.perf_counter() - self._start) * 1000)


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def format_duration(total_minutes: int) -> str:
    """258 -> '4h 18m'. Mirrors how phones present Screen Time."""
    hours, minutes = divmod(max(0, int(total_minutes)), 60)
    if hours and minutes:
        return f"{hours}h {minutes}m"
    if hours:
        return f"{hours}h"
    return f"{minutes}m"


def ok(payload: Dict[str, Any]) -> Dict[str, Any]:
    out: Dict[str, Any] = {"ok": True}
    out.update(payload)
    return out


def fail(code: str, message: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    out: Dict[str, Any] = {"ok": False, "code": code, "message": message}
    if extra:
        out.update(extra)
    return out


def truncate(text: str, limit: int = 800) -> str:
    """Keep `detected_text` in the response useful but bounded."""
    text = " ".join((text or "").split())
    return text if len(text) <= limit else text[: limit - 1] + "…"
