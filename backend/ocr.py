"""Local OCR via Tesseract.

Exposes a single-rendering read. Orchestration (which regions, which
renderings, when to stop) lives in routes.py so the escalation policy is
in one readable place.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

import numpy as np

from config import config

try:
    import pytesseract
    from pytesseract import Output

    if config.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = config.TESSERACT_CMD
    _AVAILABLE = True
    _IMPORT_ERROR = ""
except Exception as exc:
    pytesseract = None  # type: ignore[assignment]
    Output = None  # type: ignore[assignment]
    _AVAILABLE = False
    _IMPORT_ERROR = str(exc)


CONTEXT_KEYWORDS = (
    "screen time", "screentime", "digital wellbeing", "digital well-being",
    "wellbeing", "today", "daily average", "phone usage", "app usage",
    "usage", "unlocks", "notifications",
)

# 6 = uniform block, 11 = sparse text, 7 = single line
PSM_BLOCK = 6
PSM_SPARSE = 11
PSM_LINE = 7

# Restricting the alphabet stops Tesseract inventing letters where digits
# live — the single biggest accuracy win on noisy camera frames.
NUMERIC_WHITELIST = "0123456789hmHM:. "


@dataclass
class OcrReading:
    text: str
    confidence: float
    variant: str
    psm: int
    context_hits: int = 0
    words: List[str] = field(default_factory=list)

    @property
    def score(self) -> float:
        return self.confidence + min(self.context_hits, 4) * 0.12


class OcrUnavailable(RuntimeError):
    pass


def is_available() -> bool:
    if not _AVAILABLE:
        return False
    try:
        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def availability_error() -> str:
    if not _AVAILABLE:
        return f"pytesseract import failed: {_IMPORT_ERROR}"
    try:
        pytesseract.get_tesseract_version()
        return ""
    except Exception as exc:
        return f"tesseract binary not found: {exc}"


def count_context(text: str) -> int:
    low = text.lower()
    return sum(1 for kw in CONTEXT_KEYWORDS if kw in low)


def read_one(
    image: np.ndarray,
    variant: str,
    psm: int = PSM_BLOCK,
    numeric_only: bool = False,
) -> Optional[OcrReading]:
    """OCR one rendering. Returns None when nothing legible was found."""
    if not is_available():
        raise OcrUnavailable(availability_error())

    cfg = f"--oem 3 --psm {psm}"
    if numeric_only:
        cfg += f" -c tessedit_char_whitelist={NUMERIC_WHITELIST}"

    try:
        data = pytesseract.image_to_data(
            image,
            lang=config.OCR_LANGS,
            config=cfg,
            output_type=Output.DICT,
            timeout=config.OCR_TIMEOUT_SECONDS,
        )
    except Exception:
        return None

    words: List[str] = []
    confidences: List[float] = []
    for token, conf in zip(data.get("text", []), data.get("conf", [])):
        token = (token or "").strip()
        if not token:
            continue
        try:
            value = float(conf)
        except (TypeError, ValueError):
            continue
        if value < 0:  # -1 marks a non-text region
            continue
        words.append(token)
        confidences.append(value)

    if not words:
        return None

    text = " ".join(words)
    return OcrReading(
        text=text,
        confidence=round((sum(confidences) / len(confidences)) / 100.0, 4),
        variant=variant,
        psm=psm,
        context_hits=count_context(text),
        words=words,
    )
