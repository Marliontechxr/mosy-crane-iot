"""MOSY Edge — PERCLOS (Percentage of Eye Closure) sliding window tracker.

Maintains a 60-second time-based deque of eye-closure observations.
Classifies fatigue state based on percentage of time eyes are closed:
  - PERCLOS < 15%  → "awake"
  - 15% <= PERCLOS < 30%  → "drowsy"
  - PERCLOS >= 30%  → "fatigued"
"""

from __future__ import annotations

import time
from collections import deque
from dataclasses import dataclass
from typing import Deque, Tuple


# Thresholds from Blueprint Section 14
PERCLOS_AWAKE = 0.15       # Below 15% → awake
PERCLOS_DROWSY = 0.30      # Below 30% → drowsy, above → fatigued
WINDOW_SECONDS = 60.0      # 60-second sliding window


@dataclass
class PerclosResult:
    """PERCLOS calculation result."""
    perclos_score: float       # 0.0 to 1.0
    fatigue_state: str         # "awake", "drowsy", "fatigued"
    window_samples: int        # Number of samples in window
    window_duration_s: float   # Actual time span of samples
    consecutive_closed: int    # Consecutive closed-eye frames
    yawn_count: int            # Yawns detected in window


class PerclosTracker:
    """Time-based sliding window PERCLOS calculator."""

    def __init__(self, window_s: float = WINDOW_SECONDS) -> None:
        self._window_s = window_s
        # Deque of (timestamp, eyes_closed: bool, yawning: bool)
        self._observations: Deque[Tuple[float, bool, bool]] = deque()
        self._consecutive_closed = 0

    def update(self, eyes_closed: bool, yawning: bool, timestamp: float | None = None) -> PerclosResult:
        """Add an observation and compute current PERCLOS.

        Args:
            eyes_closed: True if eyes are below EAR threshold.
            yawning: True if MAR is above yawn threshold.
            timestamp: Observation time (defaults to now).

        Returns:
            PerclosResult with current fatigue classification.
        """
        now = timestamp if timestamp is not None else time.time()

        # Add observation
        self._observations.append((now, eyes_closed, yawning))

        # Prune observations outside the window
        cutoff = now - self._window_s
        while self._observations and self._observations[0][0] < cutoff:
            self._observations.popleft()

        # Track consecutive closed frames
        if eyes_closed:
            self._consecutive_closed += 1
        else:
            self._consecutive_closed = 0

        # Calculate PERCLOS
        total = len(self._observations)
        if total == 0:
            return PerclosResult(
                perclos_score=0.0,
                fatigue_state="awake",
                window_samples=0,
                window_duration_s=0.0,
                consecutive_closed=0,
                yawn_count=0,
            )

        closed_count = sum(1 for _, closed, _ in self._observations if closed)
        yawn_count = sum(1 for _, _, yawn in self._observations if yawn)
        perclos = closed_count / total

        # Window duration
        if total > 1:
            duration = self._observations[-1][0] - self._observations[0][0]
        else:
            duration = 0.0

        # Classify fatigue state
        if perclos >= PERCLOS_DROWSY:
            fatigue_state = "fatigued"
        elif perclos >= PERCLOS_AWAKE:
            fatigue_state = "drowsy"
        else:
            fatigue_state = "awake"

        return PerclosResult(
            perclos_score=round(perclos, 4),
            fatigue_state=fatigue_state,
            window_samples=total,
            window_duration_s=round(duration, 2),
            consecutive_closed=self._consecutive_closed,
            yawn_count=yawn_count,
        )

    def reset(self) -> None:
        """Clear all observations."""
        self._observations.clear()
        self._consecutive_closed = 0
