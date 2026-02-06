"""
Shift tracker — operator check-in/check-out and shift statistics.
Blueprint Section 8 — local data persistence for operator shifts.
"""
from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass, asdict
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ShiftRecord:
    """Operator shift data record."""
    operator_id: str
    crane_id: str
    date: str               # ISO date YYYY-MM-DD
    check_in: float          # Epoch timestamp
    check_out: Optional[float] = None
    total_lifts: int = 0
    total_tonnes: float = 0.0
    alerts_count: int = 0
    idle_minutes: float = 0.0


class ShiftTracker:
    """Tracks operator shift check-in/check-out and basic statistics."""

    def __init__(self, data_dir: str = "/var/lib/mosy-cabin") -> None:
        self._data_dir = data_dir
        self._current_shift: Optional[ShiftRecord] = None

    def init(self) -> None:
        """Ensure data directory exists."""
        os.makedirs(self._data_dir, exist_ok=True)
        logger.info("Shift tracker initialized (data_dir=%s)", self._data_dir)

    def check_in(self, operator_id: str, crane_id: str) -> ShiftRecord:
        """Start a new shift for the operator."""
        now = time.time()
        date_str = time.strftime("%Y-%m-%d", time.localtime(now))

        self._current_shift = ShiftRecord(
            operator_id=operator_id,
            crane_id=crane_id,
            date=date_str,
            check_in=now,
        )

        self._save_shift()
        logger.info("Shift check-in: %s on %s at %s", operator_id, crane_id, date_str)
        return self._current_shift

    def check_out(self) -> Optional[ShiftRecord]:
        """End the current shift."""
        if self._current_shift is None:
            return None

        self._current_shift.check_out = time.time()
        self._save_shift()
        logger.info("Shift check-out: %s", self._current_shift.operator_id)

        shift = self._current_shift
        self._current_shift = None
        return shift

    def record_lift(self, tonnes: float) -> None:
        """Record a completed lift operation."""
        if self._current_shift:
            self._current_shift.total_lifts += 1
            self._current_shift.total_tonnes += tonnes
            self._save_shift()

    def record_alert(self) -> None:
        """Record an alert event."""
        if self._current_shift:
            self._current_shift.alerts_count += 1

    @property
    def current_shift(self) -> Optional[ShiftRecord]:
        """Get the active shift record."""
        return self._current_shift

    def _save_shift(self) -> None:
        """Save current shift to JSON file."""
        if self._current_shift is None:
            return

        filepath = os.path.join(
            self._data_dir,
            f"shift_{self._current_shift.date}_{self._current_shift.operator_id}.json",
        )
        try:
            with open(filepath, "w") as f:
                json.dump(asdict(self._current_shift), f, indent=2)
        except Exception as e:
            logger.error("Failed to save shift data: %s", e)

    def load_shift(self, date: str, operator_id: str) -> Optional[ShiftRecord]:
        """Load a shift record from file."""
        filepath = os.path.join(self._data_dir, f"shift_{date}_{operator_id}.json")
        if not os.path.exists(filepath):
            return None

        try:
            with open(filepath, "r") as f:
                data = json.load(f)
            return ShiftRecord(**data)
        except Exception as e:
            logger.error("Failed to load shift data: %s", e)
            return None
