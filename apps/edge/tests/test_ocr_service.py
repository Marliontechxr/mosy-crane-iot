"""Tests for the OCR Service — preprocessor, digital reader, analog reader."""

from __future__ import annotations

import json
import os
from unittest.mock import patch, MagicMock

import numpy as np
import pytest

from ocr_service.preprocessor import (
    assess_quality,
    extract_roi,
    apply_clahe,
    RoiRegion,
    MIN_BRIGHTNESS,
    MAX_BRIGHTNESS,
    MIN_CONTRAST,
    MAX_BLUR_SCORE,
)
from ocr_service.digital_reader import _parse_numeric, OcrReading
from ocr_service.analog_reader import angle_to_value, AnalogGaugeConfig


# ---------------------------------------------------------------------------
# Preprocessor Tests
# ---------------------------------------------------------------------------
class TestPreprocessor:
    def test_assess_quality_good_image(self) -> None:
        # Synthetic image with good contrast and sharpness
        rng = np.random.default_rng(42)
        img = rng.integers(80, 180, size=(100, 100), dtype=np.uint8)
        # Add edges for sharpness
        img[40:60, 40:60] = 255
        img[45:55, 45:55] = 0

        quality = assess_quality(img)
        assert MIN_BRIGHTNESS <= quality.brightness <= MAX_BRIGHTNESS
        assert quality.contrast > 0

    def test_assess_quality_dark_image(self) -> None:
        img = np.full((100, 100), 10, dtype=np.uint8)
        quality = assess_quality(img)
        assert quality.brightness < MIN_BRIGHTNESS
        assert not quality.is_acceptable

    def test_assess_quality_overexposed(self) -> None:
        img = np.full((100, 100), 250, dtype=np.uint8)
        quality = assess_quality(img)
        assert quality.brightness > MAX_BRIGHTNESS
        assert not quality.is_acceptable

    def test_extract_roi(self) -> None:
        img = np.zeros((100, 200), dtype=np.uint8)
        img[10:25, 10:60] = 255  # White region

        roi = RoiRegion(x=0.05, y=0.1, width=0.25, height=0.15)
        cropped = extract_roi(img, roi)

        assert cropped.shape[0] == 15  # 0.15 * 100
        assert cropped.shape[1] == 50  # 0.25 * 200

    def test_extract_roi_invalid_returns_full(self) -> None:
        img = np.zeros((100, 200), dtype=np.uint8)
        roi = RoiRegion(x=0.5, y=0.5, width=0.0, height=0.0)
        cropped = extract_roi(img, roi)
        assert cropped.shape == img.shape

    def test_apply_clahe(self) -> None:
        img = np.full((100, 100), 128, dtype=np.uint8)
        enhanced = apply_clahe(img)
        assert enhanced.shape == img.shape
        assert enhanced.dtype == np.uint8


# ---------------------------------------------------------------------------
# Digital Reader — Numeric Parsing Tests
# ---------------------------------------------------------------------------
class TestDigitalReaderParsing:
    def test_parse_clean_number(self) -> None:
        assert _parse_numeric("12.5") == 12.5

    def test_parse_integer(self) -> None:
        assert _parse_numeric("42") == 42.0

    def test_parse_ocr_errors_O_to_0(self) -> None:
        assert _parse_numeric("1O.5") == 10.5

    def test_parse_ocr_errors_l_to_1(self) -> None:
        assert _parse_numeric("l2.5") == 12.5

    def test_parse_ocr_errors_S_to_5(self) -> None:
        assert _parse_numeric("1S.0") == 15.0

    def test_parse_european_comma(self) -> None:
        assert _parse_numeric("12,5") == 12.5

    def test_parse_garbage_returns_none(self) -> None:
        assert _parse_numeric("abc") is None

    def test_parse_empty_returns_none(self) -> None:
        assert _parse_numeric("") is None

    def test_parse_dot_only_returns_none(self) -> None:
        assert _parse_numeric(".") is None

    def test_parse_with_units(self) -> None:
        assert _parse_numeric("12.5 tonnes") == 12.5

    def test_parse_multiple_decimals(self) -> None:
        # "12.5.3" → "12.53"
        result = _parse_numeric("12.5.3")
        assert result == 12.53


# ---------------------------------------------------------------------------
# Digital Reader — OCR Engine Tests (mocked PaddleOCR)
# ---------------------------------------------------------------------------
class TestDigitalReaderOcr:
    @patch("ocr_service.digital_reader._get_ocr")
    def test_read_digital_success(self, mock_get_ocr: MagicMock) -> None:
        from ocr_service.digital_reader import read_digital

        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = [
            [
                [[[0, 0], [50, 0], [50, 20], [0, 20]], ("12.5", 0.95)],
            ]
        ]
        mock_get_ocr.return_value = mock_ocr

        img = np.full((30, 80, 3), 128, dtype=np.uint8)
        result = read_digital(img, gauge_name="load")

        assert result.valid
        assert result.parsed_value == 12.5
        assert result.confidence == 0.95

    @patch("ocr_service.digital_reader._get_ocr")
    def test_read_digital_no_text(self, mock_get_ocr: MagicMock) -> None:
        from ocr_service.digital_reader import read_digital

        mock_ocr = MagicMock()
        mock_ocr.ocr.return_value = [None]
        mock_get_ocr.return_value = mock_ocr

        img = np.full((30, 80, 3), 128, dtype=np.uint8)
        result = read_digital(img, gauge_name="load")

        assert not result.valid
        assert result.parsed_value is None


# ---------------------------------------------------------------------------
# Analog Reader — Angle-to-Value Mapping Tests
# ---------------------------------------------------------------------------
class TestAnalogReader:
    def test_angle_to_value_start(self) -> None:
        config = AnalogGaugeConfig(
            needle_color_hsv_low=(0, 100, 100),
            needle_color_hsv_high=(10, 255, 255),
            center_x=0.5,
            center_y=0.5,
            start_angle_degrees=225,
            end_angle_degrees=-45,
            scale_min=0.0,
            scale_max=100.0,
        )
        value = angle_to_value(225, config)
        assert abs(value - 0.0) < 1.0

    def test_angle_to_value_mid(self) -> None:
        config = AnalogGaugeConfig(
            needle_color_hsv_low=(0, 100, 100),
            needle_color_hsv_high=(10, 255, 255),
            center_x=0.5,
            center_y=0.5,
            start_angle_degrees=225,
            end_angle_degrees=-45,
            scale_min=0.0,
            scale_max=100.0,
        )
        # Midpoint angle at 90° (straight up) = 135° sweep from 225°
        value = angle_to_value(90, config)
        assert 40.0 <= value <= 60.0  # Approximately midrange

    def test_angle_to_value_zero_sweep(self) -> None:
        config = AnalogGaugeConfig(
            needle_color_hsv_low=(0, 100, 100),
            needle_color_hsv_high=(10, 255, 255),
            center_x=0.5,
            center_y=0.5,
            start_angle_degrees=90,
            end_angle_degrees=90,
            scale_min=0.0,
            scale_max=100.0,
        )
        value = angle_to_value(90, config)
        assert value == 0.0  # Returns scale_min on zero sweep


# ---------------------------------------------------------------------------
# Calibration Loading Tests
# ---------------------------------------------------------------------------
class TestCalibrationLoading:
    def test_load_calibration_file(self, tmp_path: object) -> None:
        cal_data = {
            "calibration_id": "test-v1",
            "crane_id": "TEST-001",
            "gauges": {
                "load": {"type": "digital", "unit": "tonnes"},
            },
        }
        cal_path = os.path.join(str(tmp_path), "test-cal.json")
        with open(cal_path, "w") as f:
            json.dump(cal_data, f)

        from ocr_service.main import _load_calibration
        loaded = _load_calibration(cal_path)
        assert loaded["calibration_id"] == "test-v1"
        assert "load" in loaded["gauges"]

    def test_load_calibration_missing_file(self) -> None:
        from ocr_service.main import _load_calibration
        loaded = _load_calibration("/nonexistent/path.json")
        assert loaded == {}

    def test_load_calibration_invalid_json(self, tmp_path: object) -> None:
        bad_path = os.path.join(str(tmp_path), "bad.json")
        with open(bad_path, "w") as f:
            f.write("not valid json{{{")

        from ocr_service.main import _load_calibration
        loaded = _load_calibration(bad_path)
        assert loaded == {}
