"""Phone-screen detection and perspective correction.

A webcam frame is not a screenshot — it is a room containing a glowing
rectangle held at an angle. Locating that rectangle and flattening it is
what makes the downstream region crops meaningful.
"""

from __future__ import annotations

from typing import Optional, Tuple

import cv2
import numpy as np


def _order_corners(pts: np.ndarray) -> np.ndarray:
    """Return corners as [top-left, top-right, bottom-right, bottom-left]."""
    pts = pts.reshape(4, 2).astype(np.float32)
    ordered = np.zeros((4, 2), dtype=np.float32)

    s = pts.sum(axis=1)
    ordered[0] = pts[np.argmin(s)]   # top-left  -> smallest x+y
    ordered[2] = pts[np.argmax(s)]   # bottom-right -> largest x+y

    d = np.diff(pts, axis=1).ravel()
    ordered[1] = pts[np.argmin(d)]   # top-right -> smallest y-x
    ordered[3] = pts[np.argmax(d)]   # bottom-left -> largest y-x
    return ordered


def _quad_score(quad: np.ndarray, frame_area: float) -> float:
    """Reject slivers, extreme skew and near-full-frame false positives."""
    area = cv2.contourArea(quad)
    frac = area / max(1.0, frame_area)
    if frac < 0.05 or frac > 0.97:
        return 0.0

    def side(a, b) -> float:
        return float(np.linalg.norm(quad[b] - quad[a]))

    top, right, bottom, left = side(0, 1), side(1, 2), side(2, 3), side(3, 0)
    if min(top, right, bottom, left) < 20:
        return 0.0

    h_ratio = min(top, bottom) / max(top, bottom)
    v_ratio = min(left, right) / max(left, right)
    if h_ratio < 0.55 or v_ratio < 0.55:
        return 0.0

    aspect = max(top, bottom) / max(1.0, max(left, right))
    if aspect > 3.2 or aspect < 0.18:
        return 0.0

    rect = (h_ratio + v_ratio) / 2.0
    return float(max(0.0, min(1.0, rect * 0.75 + min(1.0, frac / 0.4) * 0.25)))


def _find_quad(img: np.ndarray) -> Optional[Tuple[np.ndarray, float]]:
    """Locate the brightest large quadrilateral — the powered screen."""
    h, w = img.shape[:2]
    scale = 480.0 / max(h, w)
    small = cv2.resize(img, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    candidates = []

    # Strategy A — contours of a brightness mask. A lit screen is far
    # brighter than the room, so this is reliable indoors.
    cut = float(np.percentile(gray, 72))
    cut = max(70.0, min(cut, 225.0))
    _, mask = cv2.threshold(gray, cut, 255, cv2.THRESH_BINARY)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))

    # Strategy B — edge contours, for when the screen is dim or the room bright.
    edges = cv2.Canny(gray, 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)

    frame_area = float(small.shape[0] * small.shape[1])

    for source in (mask, edges):
        contours, _ = cv2.findContours(source, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        for c in sorted(contours, key=cv2.contourArea, reverse=True)[:6]:
            peri = cv2.arcLength(c, True)
            if peri < 80:
                continue
            approx = cv2.approxPolyDP(c, 0.02 * peri, True)

            if len(approx) == 4:
                quad = _order_corners(approx)
            else:
                # Fall back to the minimum-area rotated rectangle.
                quad = _order_corners(cv2.boxPoints(cv2.minAreaRect(c)))

            score = _quad_score(quad, frame_area)
            if score > 0:
                candidates.append((quad, score))

    if not candidates:
        return None

    quad, score = max(candidates, key=lambda t: t[1])
    return quad / scale, score  # back to full-resolution coordinates


def detect_and_flatten(img: np.ndarray) -> Tuple[np.ndarray, bool, float]:
    """Return (flattened_screen, detected, score).

    Falls back to the untouched frame when no convincing screen is found.
    """
    try:
        found = _find_quad(img)
        if not found:
            return img, False, 0.0

        quad, score = found

        # Pad slightly so the header text is never clipped.
        centre = quad.mean(axis=0)
        quad = centre + (quad - centre) * 1.02

        h, w = img.shape[:2]
        quad[:, 0] = np.clip(quad[:, 0], 0, w - 1)
        quad[:, 1] = np.clip(quad[:, 1], 0, h - 1)

        width = int(max(
            np.linalg.norm(quad[1] - quad[0]),
            np.linalg.norm(quad[2] - quad[3]),
        ))
        height = int(max(
            np.linalg.norm(quad[3] - quad[0]),
            np.linalg.norm(quad[2] - quad[1]),
        ))
        if width < 120 or height < 120:
            return img, False, 0.0

        # Cap the output so the warp stays cheap.
        cap = 1600
        if height > cap:
            k = cap / height
            width, height = int(width * k), cap

        dst = np.array(
            [[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]],
            dtype=np.float32,
        )
        matrix = cv2.getPerspectiveTransform(quad.astype(np.float32), dst)
        warped = cv2.warpPerspective(img, matrix, (width, height), flags=cv2.INTER_CUBIC)
        return warped, True, score
    except Exception:
        return img, False, 0.0


def sharpness(img: np.ndarray) -> float:
    """Variance of the Laplacian — the standard blur metric."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())
