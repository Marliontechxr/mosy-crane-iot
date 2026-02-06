"""MOSY Edge — PaddleOCR wrapper for digital display reading.

Reads numeric values from the crane LMI (Load Moment Indicator) dashboard
digital displays. Uses char whitelist for digits only.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

import numpy as np

from shared.logger import setup_logging

log = setup_logging("digital_reader")

# PaddleOCR imported lazily
_ocr_engine = None

# Only digits and decimal point
CHAR_WHITELIST = "0123456789."


def _get_ocr():  # type: ignore[no-untyped-def]
    """Lazy-init PaddleOCR engine."""
    global _ocr_engine
    if _ocr_engine is None:
        from paddleocr import PaddleOCR
        _ocr_engine = PaddleOCR(
            use_angle_cls=True,
            lang="en",
            show_log=False,
            use_gpu=False,
        )
        log.info("paddleocr_initialized")
    return _ocr_engine


@dataclass
class OcrReading:
    """Single OCR reading from a gauge region."""
    raw_text: str
    parsed_value: Optional[float]
    confidence: float
    valid: bool


def _parse_numeric(text: str) -> Optional[float]:
    """Extract numeric value from OCR text.

    Strips non-numeric characters except decimal point,
    handles common OCR errors (O→0, l→1, S→5).
    """
    cleaned = text.strip()

    # Take only the first whitespace-delimited token to avoid
    # OCR substitutions corrupting unit text like "tonnes" → "5onne5"
    tokens = cleaned.split()
    if tokens:
        cleaned = tokens[0]

    # Common OCR substitutions for digits
    cleaned = cleaned.replace("O", "0").replace("o", "0")
    cleaned = cleaned.replace("l", "1").replace("I", "1")
    cleaned = cleaned.replace("S", "5").replace("s", "5")
    cleaned = cleaned.replace("B", "8")
    cleaned = cleaned.replace(",", ".")  # European decimal comma

    # Keep only digits and decimal point
    cleaned = re.sub(r"[^0-9.]", "", cleaned)

    if not cleaned or cleaned == ".":
        return None

    # Handle multiple decimal points — keep only the first
    parts = cleaned.split(".")
    if len(parts) > 2:
        cleaned = parts[0] + "." + "".join(parts[1:])

    try:
        return float(cleaned)
    except ValueError:
        return None


def read_digital(
    image: np.ndarray,
    gauge_name: str = "unknown",
) -> OcrReading:
    """Run PaddleOCR on a preprocessed gauge image.

    Args:
        image: Preprocessed grayscale or binary image (H, W).
        gauge_name: Name of the gauge for logging.

    Returns:
        OcrReading with parsed numeric value and confidence.
    """
    ocr = _get_ocr()

    # PaddleOCR expects BGR or RGB 3-channel image
    if len(image.shape) == 2:
        import cv2
        image_3ch = cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
    else:
        image_3ch = image

    results = ocr.ocr(image_3ch, cls=True)

    if not results or not results[0]:
        return OcrReading(raw_text="", parsed_value=None, confidence=0.0, valid=False)

    # Collect all text detections
    best_text = ""
    best_confidence = 0.0

    for line in results[0]:
        text = line[1][0]
        conf = float(line[1][1])
        if conf > best_confidence:
            best_text = text
            best_confidence = conf

    parsed = _parse_numeric(best_text)

    log.debug(
        "ocr_read",
        gauge=gauge_name,
        raw_text=best_text,
        parsed=parsed,
        confidence=round(best_confidence, 3),
    )

    return OcrReading(
        raw_text=best_text,
        parsed_value=parsed,
        confidence=round(best_confidence, 4),
        valid=parsed is not None,
    )


def release() -> None:
    """Release PaddleOCR resources."""
    global _ocr_engine
    _ocr_engine = None
    log.info("paddleocr_released")
