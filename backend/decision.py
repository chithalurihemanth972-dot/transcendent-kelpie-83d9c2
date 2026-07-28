"""Health decision logic — deliberately isolated.

Changing what counts as "healthy" should never require touching OCR,
parsing, routing or the frontend. Edit this file (or the env var) only.
"""

from __future__ import annotations

from dataclasses import dataclass

from config import config

STATUS_HEALTHY = "healthy"
STATUS_WARNING = "warning"


@dataclass(frozen=True)
class Verdict:
    status: str
    minutes: int
    limit_minutes: int

    @property
    def is_healthy(self) -> bool:
        return self.status == STATUS_HEALTHY

    @property
    def over_by_minutes(self) -> int:
        return max(0, self.minutes - self.limit_minutes)

    @property
    def ratio(self) -> float:
        """Usage as a fraction of the limit, clamped to 2.0 for display."""
        if self.limit_minutes <= 0:
            return 0.0
        return min(2.0, round(self.minutes / self.limit_minutes, 4))


def evaluate(total_minutes: int, limit_minutes: int | None = None) -> Verdict:
    """Under the limit -> healthy. At or over -> awareness required."""
    limit = config.SCREEN_TIME_LIMIT_MINUTES if limit_minutes is None else limit_minutes
    status = STATUS_HEALTHY if total_minutes < limit else STATUS_WARNING
    return Verdict(status=status, minutes=int(total_minutes), limit_minutes=int(limit))
