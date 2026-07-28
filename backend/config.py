"""Central configuration. Every tunable lives here so behaviour can be
changed without touching business logic."""

import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


def _float(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, default))
    except (TypeError, ValueError):
        return default


class Config:
    # ── Server ────────────────────────────────────────────────
    # 0.0.0.0 so the dev server is reachable from a phone on the same
    # Wi-Fi, which is the common way to test a camera flow.
    HOST = os.getenv("HOST", "0.0.0.0")
    PORT = _int("PORT", 8000)
    DEBUG = os.getenv("DEBUG", "0") == "1"

    # Vite dev server + preview origins. "*" is acceptable because the
    # API is local-only, stateless and stores nothing.
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "*")

    # ── Uploads ───────────────────────────────────────────────
    MAX_UPLOAD_BYTES = _int("MAX_UPLOAD_BYTES", 12 * 1024 * 1024)  # 12 MB
    ALLOWED_MIME = {"image/png", "image/jpeg", "image/jpg", "image/webp"}

    # ── OCR ───────────────────────────────────────────────────
    # Absolute path to the tesseract binary, if it is not on PATH.
    TESSERACT_CMD = os.getenv("TESSERACT_CMD") or None
    # "eng" is sufficient — phone Screen Time values are Latin numerals.
    # Add "+tel" once the Telugu traineddata is installed.
    OCR_LANGS = os.getenv("OCR_LANGS", "eng")
    OCR_TIMEOUT_SECONDS = _int("OCR_TIMEOUT_SECONDS", 20)

    # ── Decision logic ────────────────────────────────────────
    # The single knob that defines "healthy". 5 hours by default.
    SCREEN_TIME_LIMIT_MINUTES = _int("SCREEN_TIME_LIMIT_MINUTES", 5 * 60)

    # Below this, we report "not detected" rather than guessing.
    MIN_CONFIDENCE = _float("MIN_CONFIDENCE", 0.35)

    # Sanity bounds — a phone cannot report 30 hours of daily use.
    MAX_PLAUSIBLE_MINUTES = _int("MAX_PLAUSIBLE_MINUTES", 24 * 60)
    MIN_PLAUSIBLE_MINUTES = _int("MIN_PLAUSIBLE_MINUTES", 1)

    # ── Image preprocessing ───────────────────────────────────
    # Longest edge after resize. Tesseract likes ~1600–2200px.
    TARGET_LONG_EDGE = _int("TARGET_LONG_EDGE", 1800)
    MIN_LONG_EDGE = _int("MIN_LONG_EDGE", 900)


config = Config()
