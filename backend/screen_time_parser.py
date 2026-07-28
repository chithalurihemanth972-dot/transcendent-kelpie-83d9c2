"""Turn raw OCR text into a duration in minutes.

Handles notations used by iOS Screen Time and Android Digital Wellbeing
(Samsung, Xiaomi/MI, OnePlus, Realme, Pixel, Nothing, Motorola), as well as
common OCR misreads (e.g. 'n' for 'h', 'rn' for 'm', '04:18', '4 h 18 m').
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import List, Optional

from config import config

# ── Unit vocabulary & Fuzzy OCR variants ─────────────────────────────
# 'h' misreads: h, H, n, N, A, R, k, b, hr, hrs, hour, hours, గం, గంట, గంటలు
_H = r"(?:h|H|n|N|A|R|k|b|hr|hrs|hour|hours|గం|గంట|గంటల)"
# 'm' misreads: m, M, rn, nn, min, mins, minute, minutes, ని, నిమి, నిమిషం, నిమిషాలు
_M = r"(?:m|M|rn|nn|min|mins|minute|minutes|ని|నిమి|నిమిషం|నిమిషాలు)"

# Words that indicate the number belongs to *today's total*
_TODAY_HINTS = (
    "today", "todays", "today's", "daily average", "screen time",
    "screentime", "digital wellbeing", "wellbeing", "ఈరోజు", "నేడు",
    "daily", "average", "total", "usage",
)

# Words that mean the nearby number is NOT today's total
_NEGATIVE_HINTS = ("yesterday", "last week", "weekly", "goal", "limit", "target")

# Digit translation map for common OCR substitutions
_DIGIT_FIXES = str.maketrans({
    "O": "0", "o": "0", "Q": "0", "D": "0",
    "l": "1", "I": "1", "i": "1", "|": "1", "!": "1",
    "Z": "2", "z": "2",
    "S": "5", "s": "5",
    "B": "8",
    "g": "9", "q": "9",
})


@dataclass
class ParsedTime:
    minutes: int
    raw: str                 # exact matched string
    pattern: str             # pattern type
    position: int            # character position
    proximity_bonus: float = 0.0

    @property
    def strength(self) -> float:
        base = {
            "hero_format": 1.0,     # "4h 18m" / "4h 18min" — hero total
            "fuzzy_hm": 0.94,       # "4n 18rn" — OCR misread of 4h 18m
            "colon_format": 0.82,   # "4:18" / "04:18"
            "hours_only": 0.72,     # "5h"
            "minutes_only": 0.48,   # "45m"
        }.get(self.pattern, 0.5)
        return min(1.0, base + self.proximity_bonus)


def _normalize(text: str) -> str:
    text = text.replace("\u00a0", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _fix_digits(token: str) -> str:
    return token.translate(_DIGIT_FIXES)


def _proximity(text_low: str, position: int) -> float:
    window = text_low[max(0, position - 80): position + 80]
    bonus = 0.0
    if any(h in window for h in _TODAY_HINTS):
        bonus += 0.25
    if any(n in window for n in _NEGATIVE_HINTS):
        bonus -= 0.50
    return bonus


def find_all(text: str) -> List[ParsedTime]:
    """Extract every plausible screen time duration from OCR text."""
    text = _normalize(text)
    low = text.lower()
    found: List[ParsedTime] = []

    def add(minutes: int, raw: str, pattern: str, pos: int) -> None:
        if not (config.MIN_PLAUSIBLE_MINUTES <= minutes <= config.MAX_PLAUSIBLE_MINUTES):
            return
        found.append(
            ParsedTime(
                minutes=minutes,
                raw=raw.strip(),
                pattern=pattern,
                position=pos,
                proximity_bonus=_proximity(low, pos),
            )
        )

    # 1) Exact "4h 18m", "4 h 18 min", "4 hrs 18 mins", "4గ 18ని"
    for m in re.finditer(rf"(\d{{1,2}})\s*{_H}\s*(\d{{1,2}})\s*{_M}?", low, re.I):
        try:
            h = int(_fix_digits(m.group(1)))
            mins = int(_fix_digits(m.group(2)))
            if mins < 60:
                add(h * 60 + mins, m.group(0), "hero_format", m.start())
        except ValueError:
            pass

    # 2) Joined / Fuzzy "4h18m", "04h18m", "4n18rn", "4h 18"
    for m in re.finditer(r"(?<!\d)(\d{1,2})\s*([hn]|hr|hrs)\s*(\d{1,2})\s*(m|min|mins|rn)?(?!\w)", low, re.I):
        try:
            h = int(_fix_digits(m.group(1)))
            mins = int(_fix_digits(m.group(3)))
            if mins < 60:
                add(h * 60 + mins, m.group(0), "fuzzy_hm", m.start())
        except ValueError:
            pass

    # 3) Clock / Duration format "4:18", "04:18", "4 : 18", "4.18", "4-18"
    for m in re.finditer(r"(?<!\d)(\d{1,2})\s*[:;.\-]\s*([0-5]\d)(?!\d)", low):
        try:
            h = int(m.group(1))
            mins = int(m.group(2))
            if h <= 23:
                add(h * 60 + mins, m.group(0), "colon_format", m.start())
        except ValueError:
            pass

    # 4) Hours only: "5h", "6 hr", "7 hours", "5 గంటలు"
    for m in re.finditer(rf"(\d{{1,2}})\s*{_H}(?!\s*\d)", low, re.I):
        try:
            add(int(_fix_digits(m.group(1))) * 60, m.group(0), "hours_only", m.start())
        except ValueError:
            pass

    # 5) Minutes only: "45m", "45 min", "45 నిమిషాలు"
    for m in re.finditer(rf"(?<!\d)(?<![hHnN]\s)(\d{{1,3}})\s*{_M}(?![a-z])", low, re.I):
        try:
            mins = int(_fix_digits(m.group(1)))
            if mins < 600:
                add(mins, m.group(0), "minutes_only", m.start())
        except ValueError:
            pass

    return found


def select_best(candidates: List[ParsedTime]) -> Optional[ParsedTime]:
    if not candidates:
        return None
    # Rank by strength (pattern + proximity hint), then pick total minutes
    ranked = sorted(candidates, key=lambda c: (round(c.strength, 3), c.minutes), reverse=True)
    top = ranked[0]
    peers = [c for c in ranked if abs(c.strength - top.strength) < 0.10]
    return max(peers, key=lambda c: c.minutes) if peers else top


def parse(text: str) -> Optional[ParsedTime]:
    return select_best(find_all(text))
