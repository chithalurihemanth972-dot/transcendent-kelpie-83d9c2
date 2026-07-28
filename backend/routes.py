"""REST endpoints.

The scan pipeline is a budget-aware escalation loop:

    0. flatten the phone screen out of the frame
    1. header band, fast renderings              -> vote
    2. header band, numeric whitelist            -> vote
    3. upper half, deep renderings               -> vote
    4. whole screen                              -> vote

Evidence accumulates across tiers; the loop exits as soon as consensus is
decisive, so the common case returns in a fraction of the budget while
hard cases keep working instead of failing silently.

The image exists only in memory for the lifetime of the request.
"""

from __future__ import annotations

import time

from flask import Blueprint, jsonify, request

import ocr
from config import config
from consensus import Candidate, ConsensusResult, vote
from decision import evaluate
from image_processing import build_renderings, crop_region, decode, region_weight
from screen_detect import detect_and_flatten, sharpness
from screen_time_parser import find_all
from utils import Timer, fail, format_duration, ok, truncate

api = Blueprint("api", __name__)

# Wall-clock ceiling for one scan.
BUDGET_SECONDS = 8.0


@api.get("/api/health")
def health():
    available = ocr.is_available()
    return jsonify(
        ok(
            {
                "service": "digital-samatulyata-ocr",
                "ocr_available": available,
                "ocr_error": "" if available else ocr.availability_error(),
                "limit_minutes": config.SCREEN_TIME_LIMIT_MINUTES,
            }
        )
    )


@api.get("/api/config")
def get_config():
    return jsonify(
        ok(
            {
                "limit_minutes": config.SCREEN_TIME_LIMIT_MINUTES,
                "limit_label": format_duration(config.SCREEN_TIME_LIMIT_MINUTES),
                "min_confidence": config.MIN_CONFIDENCE,
            }
        )
    )


def _read_upload():
    if "image" in request.files:
        storage = request.files["image"]
        if not storage.filename and not storage.mimetype:
            return None, fail("EMPTY_UPLOAD", "No image was received.")
        mime = (storage.mimetype or "").lower()
        if mime and mime not in config.ALLOWED_MIME:
            return None, fail("BAD_TYPE", f"Unsupported image type: {mime}")
        return storage.read(), None

    if request.data:
        return request.data, None

    return None, fail("EMPTY_UPLOAD", "No image was received.")


def _run_tier(
    screen,
    region: str,
    target_h: int,
    psms,
    candidates,
    readings,
    deadline: float,
    deep: bool = False,
    numeric: bool = False,
    weight_scale: float = 1.0,
) -> ConsensusResult | None:
    """OCR one region across several renderings and page-seg modes."""
    cropped = crop_region(screen, region, target_h)
    tag = f"{region}-num" if numeric else region
    weight = region_weight(region) * weight_scale

    for name, rendering in build_renderings(cropped, tag, deep=deep):
        for psm in psms:
            if time.monotonic() > deadline:
                break
            reading = ocr.read_one(rendering, name, psm=psm, numeric_only=numeric)
            if not reading:
                continue
            readings.append(reading)
            # Every plausible duration becomes a vote, not just the first.
            for parsed in find_all(reading.text):
                candidates.append(
                    Candidate(
                        parsed=parsed,
                        ocr_confidence=reading.confidence,
                        variant=f"{reading.variant}/psm{psm}",
                        region_weight=weight,
                        text=reading.text,
                    )
                )
        if time.monotonic() > deadline:
            break

    return vote(candidates)


@api.post("/api/scan")
def scan():
    raw, error = _read_upload()
    if error:
        return jsonify(error), 400
    if not raw:
        return jsonify(fail("EMPTY_UPLOAD", "No image was received.")), 400
    if len(raw) > config.MAX_UPLOAD_BYTES:
        return jsonify(fail("TOO_LARGE", "Image exceeds the size limit.")), 413

    try:
        original = decode(raw)
    except ValueError as exc:
        return jsonify(fail("DECODE_FAILED", str(exc))), 400

    timer = Timer()
    candidates: list[Candidate] = []
    readings: list[ocr.OcrReading] = []
    consensus: ConsensusResult | None = None

    with timer:
        deadline = time.monotonic() + BUDGET_SECONDS

        # Step 0 · flatten the phone screen out of the frame.
        try:
            screen, detected, det_score = detect_and_flatten(original)
        except Exception:
            screen, detected, det_score = original, False, 0.0

        blur = sharpness(screen)
        det_boost = (1.0 + det_score * 0.15) if detected else 0.9

        try:
            # Tier 1 · header band, fast
            consensus = _run_tier(
                screen, "header", 640, (ocr.PSM_BLOCK, ocr.PSM_SPARSE),
                candidates, readings, deadline, weight_scale=det_boost,
            )

            # Tier 2 · header band, numeric whitelist
            if not (consensus and consensus.is_decisive) and time.monotonic() < deadline:
                consensus = _run_tier(
                    screen, "header", 640, (ocr.PSM_BLOCK, ocr.PSM_LINE),
                    candidates, readings, deadline,
                    numeric=True, weight_scale=det_boost * 1.04,
                )

            # Tier 3 · upper half, deep renderings
            if not (consensus and consensus.is_decisive) and time.monotonic() < deadline:
                consensus = _run_tier(
                    screen, "upper", 760, (ocr.PSM_BLOCK, ocr.PSM_SPARSE),
                    candidates, readings, deadline,
                    deep=True, weight_scale=det_boost,
                )

            # Tier 4 · whole screen
            if not (consensus and consensus.is_decisive) and time.monotonic() < deadline:
                consensus = _run_tier(
                    screen, "screen", 1100, (ocr.PSM_BLOCK, ocr.PSM_SPARSE),
                    candidates, readings, deadline, weight_scale=det_boost,
                )
        except ocr.OcrUnavailable as exc:
            return jsonify(fail("OCR_UNAVAILABLE", str(exc))), 503

    best_text = max(readings, key=lambda r: r.score).text if readings else ""

    if not consensus:
        code = "NOT_DETECTED" if best_text.strip() else "NO_TEXT"
        return (
            jsonify(
                fail(
                    code,
                    "Screen time could not be detected in this image.",
                    {
                        "detected_text": truncate(best_text),
                        "screen_detected": detected,
                        "sharpness": round(blur, 1),
                        "elapsed_ms": timer.ms,
                    },
                )
            ),
            422,
        )

    if consensus.confidence < config.MIN_CONFIDENCE:
        return (
            jsonify(
                fail(
                    "LOW_CONFIDENCE",
                    "The reading was too unclear to trust.",
                    {
                        "detected_text": truncate(consensus.best.text),
                        "confidence": round(consensus.confidence, 4),
                        "screen_detected": detected,
                        "sharpness": round(blur, 1),
                        "elapsed_ms": timer.ms,
                    },
                )
            ),
            422,
        )

    verdict = evaluate(consensus.minutes)

    return jsonify(
        ok(
            {
                "status": verdict.status,
                "screen_time": format_duration(verdict.minutes),
                "minutes": verdict.minutes,
                "confidence": round(consensus.confidence, 4),
                "limit_minutes": verdict.limit_minutes,
                "limit_label": format_duration(verdict.limit_minutes),
                "over_by_minutes": verdict.over_by_minutes,
                "ratio": verdict.ratio,
                "matched_text": consensus.best.parsed.raw,
                "match_pattern": consensus.best.parsed.pattern,
                "detected_text": truncate(consensus.best.text),
                "ocr_variant": consensus.best.variant,
                "votes": consensus.votes,
                "agreement": round(consensus.agreement, 3),
                "candidates_seen": consensus.total_candidates,
                "screen_detected": detected,
                "sharpness": round(blur, 1),
                "elapsed_ms": timer.ms,
            }
        )
    )
