"""
Tests for vibration detection logic.
"""
import pytest
from sensors.vibration_detector import detect_vibration_state


class TestVibrationDetection:
    """Test engine running detection from vibration events."""

    def test_no_events_engine_off(self):
        assert detect_vibration_state(0, 0.0, 100.0) is False

    def test_recent_event_engine_on(self):
        # Event 2 seconds ago, threshold 5s → engine running
        assert detect_vibration_state(10, 98.0, 100.0, idle_threshold_s=5.0) is True

    def test_old_event_engine_off(self):
        # Event 10 seconds ago, threshold 5s → engine off
        assert detect_vibration_state(10, 90.0, 100.0, idle_threshold_s=5.0) is False

    def test_event_at_threshold_boundary(self):
        # Event exactly at threshold → engine off (not < threshold)
        assert detect_vibration_state(5, 95.0, 100.0, idle_threshold_s=5.0) is False

    def test_event_just_within_threshold(self):
        # Event 4.9s ago, threshold 5s → engine running
        assert detect_vibration_state(5, 95.1, 100.0, idle_threshold_s=5.0) is True

    def test_single_event(self):
        # Single event within threshold → engine running
        assert detect_vibration_state(1, 99.5, 100.0, idle_threshold_s=5.0) is True

    def test_custom_threshold(self):
        # Custom 30s threshold
        assert detect_vibration_state(100, 75.0, 100.0, idle_threshold_s=30.0) is True
        assert detect_vibration_state(100, 60.0, 100.0, idle_threshold_s=30.0) is False
