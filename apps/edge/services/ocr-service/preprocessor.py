"""MOSY Edge — Image preprocessing for dashboard OCR.

Quality assessment (brightness, contrast, blur), ROI extraction,
and CLAHE enhancement for optimal OCR performance.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np

from shared.logger import setup_logging

log = setup_logging("preprocessor")

# Quality thresholds
MIN_BRIGHTNESS = 40.0
MAX_BRIGHTNESS = 220.0
MIN_CONTRAST = 20.0
MAX_BLUR_SCORE = 100.0  # Laplacian variance below this → too blurry


@dataclass
class QualityMetrics:
    """Image quality assessment results."""
    brightness: float
    contrast: float
    blur_score: float
    is_acceptable: bool


@dataclass
class RoiRegion:
    """Normalized ROI coordinates (0.0 to 1.0)."""
    x: float
    y: float
    width: float
    height: float


def assess_quality(image_gray: np.ndarray) -> QualityMetrics:
    """Assess image quality for OCR processing.

    Args:
        image_gray: Grayscale image (H, W), dtype uint8.

    Returns:
        QualityMetrics with brightness, contrast, blur score.
    """
    brightness = float(np.mean(image_gray))
    contrast = float(np.std(image_gray))

    # Laplacian variance — higher = sharper image
    import cv2
    laplacian = cv2.Laplacian(image_gray, cv2.CV_64F)
    blur_score = float(np.var(laplacian))

    is_acceptable = (
        MIN_BRIGHTNESS <= brightness <= MAX_BRIGHTNESS
        and contrast >= MIN_CONTRAST
        and blur_score >= MAX_BLUR_SCORE
    )

    return QualityMetrics(
        brightness=round(brightness, 2),
        contrast=round(contrast, 2),
        blur_score=round(blur_score, 2),
        is_acceptable=is_acceptable,
    )


def extract_roi(
    image: np.ndarray,
    roi: RoiRegion,
) -> np.ndarray:
    """Extract a region of interest from an image using normalized coordinates.

    Args:
        image: Full image (H, W) or (H, W, C).
        roi: Normalized ROI coordinates (0.0 to 1.0).

    Returns:
        Cropped image region.
    """
    h, w = image.shape[:2]
    x1 = max(0, int(roi.x * w))
    y1 = max(0, int(roi.y * h))
    x2 = min(w, int((roi.x + roi.width) * w))
    y2 = min(h, int((roi.y + roi.height) * h))

    if x2 <= x1 or y2 <= y1:
        log.warning("invalid_roi", roi=f"{roi.x},{roi.y},{roi.width},{roi.height}")
        return image

    return image[y1:y2, x1:x2]


def apply_clahe(
    image_gray: np.ndarray,
    clip_limit: float = 2.0,
    tile_grid: Tuple[int, int] = (8, 8),
) -> np.ndarray:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization).

    Args:
        image_gray: Grayscale image (H, W), dtype uint8.
        clip_limit: CLAHE clip limit.
        tile_grid: Tile grid size for CLAHE.

    Returns:
        Enhanced grayscale image.
    """
    import cv2
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    return clahe.apply(image_gray)


def preprocess_for_ocr(
    frame_bgr: np.ndarray,
    roi: Optional[RoiRegion] = None,
) -> Tuple[np.ndarray, QualityMetrics]:
    """Full preprocessing pipeline for dashboard OCR.

    Steps:
    1. Convert to grayscale
    2. Extract ROI (if provided)
    3. Assess quality
    4. Apply CLAHE enhancement
    5. Apply adaptive thresholding for digital displays

    Args:
        frame_bgr: BGR frame from camera.
        roi: Optional ROI to extract before processing.

    Returns:
        Tuple of (processed image for OCR, quality metrics).
    """
    import cv2

    gray = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2GRAY)

    if roi is not None:
        gray = extract_roi(gray, roi)

    quality = assess_quality(gray)

    # CLAHE enhancement
    enhanced = apply_clahe(gray)

    # Adaptive threshold for digital display readout
    binary = cv2.adaptiveThreshold(
        enhanced, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY,
        blockSize=11,
        C=2,
    )

    return binary, quality
