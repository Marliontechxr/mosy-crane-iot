"""Unit tests for ProductivityScorer (state-engine).

Covers base scoring, penalty deductions, clamping, shift reset,
calculate() correctness, and to_mqtt_payload() shape.
"""
import sys
import os

sys.path.insert(
    0,
    os.path.join(
        os.path.dirname(__file__),
        "../../apps/edge/services/state-engine",
    ),
)

import pytest

from scorer import ProductivityScorer


@pytest.fixture
def scorer() -> ProductivityScorer:
    """Return a fresh scorer with an active shift."""
    s = ProductivityScorer(crane_id="CRANE-TEST-001")
    s.start_shift()
    return s


# ── 1. Base score is 100 at start ────────────────────────────────────────────

def test_base_score_is_100_at_start(scorer: ProductivityScorer) -> None:
    """A fresh shift with no penalties should yield a score of 100."""
    result = scorer.calculate()
    assert result.final_score == 100
    assert result.base_score == 100
    assert result.penalties == {}


# ── 2. Single fatigue_warning penalty deducts 15 ─────────────────────────────

def test_fatigue_warning_penalty_deducts_15(scorer: ProductivityScorer) -> None:
    """Recording a fatigue_warning should deduct exactly 15 points."""
    scorer.record_penalty("fatigue_warning")
    result = scorer.calculate()
    assert result.final_score == 85
    assert result.penalties == {"fatigue_warning": 15}


# ── 3. Single load_exceed penalty deducts 25 ─────────────────────────────────

def test_load_exceed_penalty_deducts_25(scorer: ProductivityScorer) -> None:
    """Recording a load_exceed should deduct exactly 25 points."""
    scorer.record_penalty("load_exceed")
    result = scorer.calculate()
    assert result.final_score == 75
    assert result.penalties == {"load_exceed": 25}


# ── 4. Multiple penalties stack correctly ─────────────────────────────────────

def test_multiple_penalties_stack(scorer: ProductivityScorer) -> None:
    """Multiple distinct penalties should accumulate their deductions."""
    scorer.record_penalty("fatigue_warning")   # -15
    scorer.record_penalty("overspeed")          # -10
    scorer.record_penalty("idle_time_extended") # -5
    result = scorer.calculate()
    assert result.final_score == 70  # 100 - 15 - 10 - 5
    assert result.penalties == {
        "fatigue_warning": 15,
        "overspeed": 10,
        "idle_time_extended": 5,
    }


# ── 5. Score clamps to 0 (never goes negative) ──────────────────────────────

def test_score_clamps_to_zero(scorer: ProductivityScorer) -> None:
    """Score should never drop below 0 even with extreme penalties."""
    # Apply every penalty type: 15+30+25+10+5+50+20 = 155 total deductions
    for penalty_name in ProductivityScorer.PENALTIES:
        scorer.record_penalty(penalty_name)
    result = scorer.calculate()
    assert result.final_score == 0


# ── 6. Score clamps to 100 (never exceeds base) ─────────────────────────────

def test_score_clamps_to_100(scorer: ProductivityScorer) -> None:
    """Score should never exceed 100 even if no penalties are recorded.

    Also verifies that recording an unknown penalty name has no effect.
    """
    scorer.record_penalty("nonexistent_penalty_type")
    result = scorer.calculate()
    assert result.final_score == 100
    assert result.penalties == {}


# ── 7. start_shift() resets score and penalties ──────────────────────────────

def test_start_shift_resets_score_and_penalties(scorer: ProductivityScorer) -> None:
    """Calling start_shift() should clear all accumulated penalties."""
    scorer.record_penalty("fatigue_critical")  # -30
    scorer.record_penalty("load_exceed")        # -25
    assert scorer.calculate().final_score == 45

    scorer.start_shift()
    result = scorer.calculate()
    assert result.final_score == 100
    assert result.penalties == {}


# ── 8. calculate() returns correct score after penalties ─────────────────────

def test_calculate_returns_correct_score(scorer: ProductivityScorer) -> None:
    """calculate() should return a ProductivityScore with accurate fields."""
    scorer.record_penalty("engine_overheat")          # -20
    scorer.record_penalty("personnel_in_drop_zone")   # -50
    result = scorer.calculate()

    assert result.base_score == 100
    assert result.final_score == 30  # 100 - 20 - 50
    assert result.penalties == {
        "engine_overheat": 20,
        "personnel_in_drop_zone": 50,
    }
    assert isinstance(result.timestamp, float)
    assert result.timestamp > 0


# ── 9. to_mqtt_payload() returns properly shaped dict ────────────────────────

def test_to_mqtt_payload_shape(scorer: ProductivityScorer) -> None:
    """to_mqtt_payload() must return a dict with score, penalties, and shift_start keys."""
    scorer.record_penalty("overspeed")  # -10
    payload = scorer.to_mqtt_payload()

    assert isinstance(payload, dict)
    # Required keys
    assert "final_score" in payload
    assert "penalties" in payload
    assert "timestamp" in payload
    assert "crane_id" in payload
    assert "base_score" in payload

    # Value checks
    assert payload["final_score"] == 90
    assert payload["penalties"] == {"overspeed": 10}
    assert payload["crane_id"] == "CRANE-TEST-001"
    assert payload["base_score"] == 100
    assert isinstance(payload["timestamp"], float)
