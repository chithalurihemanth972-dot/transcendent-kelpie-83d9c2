"""Consensus voting across OCR readings.

One reading is a guess. Several independent readings agreeing on the same
value is evidence. This also lets the service refuse to answer when the
evidence is genuinely split, instead of confidently returning noise.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

from screen_time_parser import ParsedTime

# Values within this many minutes count as the same reading.
GROUP_TOLERANCE = 2


@dataclass
class Candidate:
    parsed: ParsedTime
    ocr_confidence: float
    variant: str
    region_weight: float
    text: str

    @property
    def weight(self) -> float:
        # Pattern structure dominates; OCR confidence modulates it.
        ocr = 0.35 + self.ocr_confidence * 0.65
        return self.parsed.strength * ocr * self.region_weight


@dataclass
class Group:
    minutes: int
    weight: float = 0.0
    members: List[Candidate] = field(default_factory=list)


@dataclass
class ConsensusResult:
    minutes: int
    confidence: float
    votes: int
    total_candidates: int
    agreement: float
    best: Candidate
    runner_up_minutes: Optional[int]

    @property
    def is_decisive(self) -> bool:
        strong = self.best.parsed.pattern in ("hero_format", "fuzzy_hm")
        if strong and self.votes >= 2 and self.agreement >= 0.65:
            return True
        if strong and self.best.ocr_confidence >= 0.80 and self.agreement >= 0.80:
            return True
        return False


def vote(candidates: List[Candidate]) -> Optional[ConsensusResult]:
    if not candidates:
        return None

    groups: List[Group] = []
    for c in candidates:
        match = next(
            (g for g in groups if abs(g.minutes - c.parsed.minutes) <= GROUP_TOLERANCE),
            None,
        )
        if match:
            match.weight += c.weight
            match.members.append(c)
            strongest = max(match.members, key=lambda m: m.weight)
            match.minutes = strongest.parsed.minutes
        else:
            groups.append(Group(minutes=c.parsed.minutes, weight=c.weight, members=[c]))

    groups.sort(key=lambda g: g.weight, reverse=True)
    winner = groups[0]
    runner_up = groups[1] if len(groups) > 1 else None

    total_weight = sum(g.weight for g in groups)
    agreement = winner.weight / total_weight if total_weight > 0 else 0.0
    best = max(winner.members, key=lambda m: m.weight)

    confidence = (
        best.parsed.strength * 0.42
        + best.ocr_confidence * 0.28
        + agreement * 0.30
        + min(0.08, (len(winner.members) - 1) * 0.02)
    )

    # A lone weak candidate must not look certain.
    if len(winner.members) == 1 and best.parsed.strength < 0.7:
        confidence *= 0.72

    # Real disagreement must be reflected in the number we report.
    if runner_up and winner.weight < runner_up.weight * 1.25:
        confidence *= 0.68

    return ConsensusResult(
        minutes=winner.minutes,
        confidence=max(0.0, min(0.99, confidence)),
        votes=len(winner.members),
        total_candidates=len(candidates),
        agreement=agreement,
        best=best,
        runner_up_minutes=runner_up.minutes if runner_up else None,
    )
