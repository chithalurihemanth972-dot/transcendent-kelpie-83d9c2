"""Preprocessing for camera-grade Screen Time OCR.

Operates on the *flattened* screen produced by screen_detect, so the
region fractions below are meaningful rather than guesses about where a
phone happened to sit in a webcam frame.
"""

from __future__ import annotations

from typing import Dict, List, Tuple

import cv2
import numpy as np

# Crop boxes as fractions of the flattened screen, with a trust weight.
REGIONS: Dict[str, Tuple[float, float, float, float, float]] = {
    #        x     y     w     h     weight
    "header": (0.00, 0.04, 1.00, 0.42, 1.00),
    "upper":  (0.00, 0.00, 1.00, 0.62, 0.92),
    "screen": (0.00, 0.00, 1.00, 1.00, 0.70),
}


def decode(raw: bytes) -> np.ndarray:
    buf = np.frombuffer(raw, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    if img is None or img.size == 0:
        raise ValueError("Image could not be decoded")
    return img


def region_weight(region: str) -> float:
    return REGIONS.get(region, REGIONS["screen"])[4]


def crop_region(img: np.ndarray, region: str, target_h: int) -> np.ndarray:
    x, y, w, h, _ = REGIONS.get(region, REGIONS["screen"])
    ih, iw = img.shape[:2]
    x0, y0 = int(iw * x), int(ih * y)
    x1, y1 = min(iw, x0 + int(iw * w)), min(ih, y0 + int(ih * h))
    cropped = img[y0:y1, x0:x1]

    if cropped.size == 0:
        cropped = img

    ch = cropped.shape[0]
    if ch <= 0:
        return cropped
    scale = target_h / float(ch)
    if abs(scale - 1.0) < 0.15:
        return cropped
    interp = cv2.INTER_CUBIC if scale > 1 else cv2.INTER_AREA
    return cv2.resize(
        cropped,
        (max(16, int(cropped.shape[1] * scale)), max(16, int(ch * scale))),
        interpolation=interp,
    )


def _clahe(gray: np.ndarray) -> np.ndarray:
    return cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8, 8)).apply(gray)


def _unsharp(gray: np.ndarray, amount: float = 1.6) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (0, 0), sigmaX=2.0)
    return cv2.addWeighted(gray, 1 + amount * 0.5, blur, -amount * 0.5, 0)


def _normalise_polarity(gray: np.ndarray) -> np.ndarray:
    """Tesseract expects dark text on light ground."""
    return cv2.bitwise_not(gray) if float(np.mean(gray)) < 125.0 else gray


def build_renderings(img: np.ndarray, tag: str, deep: bool = False) -> List[Tuple[str, np.ndarray]]:
    """Produce OCR-ready renderings of one cropped region."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    base = _normalise_polarity(_unsharp(_clahe(gray)))

    out: List[Tuple[str, np.ndarray]] = [(f"{tag}:gray", base)]

    # Local adaptive threshold — the fix for a screen half in shadow.
    block = max(15, (min(base.shape[:2]) // 12) | 1)
    out.append((
        f"{tag}:adaptive",
        cv2.adaptiveThreshold(
            base, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block, 10
        ),
    ))

    if not deep:
        return out

    _, otsu = cv2.threshold(base, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    out.append((f"{tag}:otsu", otsu))

    # Max-channel recovers coloured digits that luma flattens away.
    max_ch = np.max(img, axis=2)
    max_base = _normalise_polarity(_unsharp(_clahe(max_ch)))
    out.append((f"{tag}:maxch", max_base))
    out.append((f"{tag}:inverted", cv2.bitwise_not(base)))

    return out
