"""MOSY Edge — Analog gauge reader using Hough Circle detection.

Reads analog (needle-style) gauges from the crane LMI dashboard
using HSV color filtering for needle detection and angle→value mapping.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Dict, Optional, Tuple

import numpy as np

from shared.logger import setup_logging

log = setup_logging("analog_reader")


@dataclass
class AnalogReading:
    """Result of analog gauge reading."""
    angle_degrees: float
    value: float
    confidence: float
    valid: bool


@dataclass
class AnalogGaugeConfig:
    """Configuration for an analog gauge."""
    needle_color_hsv_low: Tuple[int, int, int]
    needle_color_hsv_high: Tuple[int, int, int]
    center_x: float  # Normalized (0-1) center of gauge
    center_y: float
    start_angle_degrees: float  # Angle at scale_min (e.g., 225°)
    end_angle_degrees: float    # Angle at scale_max (e.g., -45°)
    scale_min: float
    scale_max: float


def detect_needle_angle(
    image_bgr: np.ndarray,
    config: AnalogGaugeConfig,
) -> Optional[float]:
    """Detect the needle angle in an analog gauge using HSV color filtering.

    Args:
        image_bgr: BGR image of the gauge region.
        config: Gauge configuration with needle color and geometry.

    Returns:
        Detected angle in degrees, or None if detection fails.
    """
    import cv2

    hsv = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2HSV)

    # Create mask for needle color
    low = np.array(config.needle_color_hsv_low, dtype=np.uint8)
    high = np.array(config.needle_color_hsv_high, dtype=np.uint8)
    mask = cv2.inRange(hsv, low, high)

    # Morphological operations to clean up mask
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

    # Find contours of the needle
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    if not contours:
        return None

    # Use largest contour as the needle
    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) < 50:
        return None

    # Fit line through the needle contour
    [vx, vy, x, y] = cv2.fitLine(largest, cv2.DIST_L2, 0, 0.01, 0.01)

    # Calculate center of gauge in pixel coords
    h, w = image_bgr.shape[:2]
    cx = int(config.center_x * w)
    cy = int(config.center_y * h)

    # Get the farthest point from center as the needle tip direction
    moments = cv2.moments(largest)
    if moments["m00"] > 0:
        mx = int(moments["m10"] / moments["m00"])
        my = int(moments["m01"] / moments["m00"])
    else:
        mx, my = int(x[0]), int(y[0])

    # Angle from center to needle centroid
    dx = mx - cx
    dy = cy - my  # Flip Y axis (image coords)
    angle = math.degrees(math.atan2(dy, dx))

    return angle


def angle_to_value(
    angle: float,
    config: AnalogGaugeConfig,
) -> float:
    """Convert detected needle angle to gauge value via linear interpolation.

    Args:
        angle: Detected angle in degrees.
        config: Gauge configuration with angle-to-value mapping.

    Returns:
        Interpolated gauge value.
    """
    start = config.start_angle_degrees
    end = config.end_angle_degrees

    # Normalize angles to handle wraparound
    if end < start:
        total_sweep = start - end
        if angle > start:
            angle_from_start = angle - start
        elif angle < end:
            angle_from_start = start - angle + 360
        else:
            angle_from_start = start - angle
    else:
        total_sweep = end - start
        angle_from_start = angle - start

    if total_sweep == 0:
        return config.scale_min

    fraction = max(0.0, min(1.0, angle_from_start / total_sweep))
    return config.scale_min + fraction * (config.scale_max - config.scale_min)


def read_analog(
    image_bgr: np.ndarray,
    config: AnalogGaugeConfig,
    gauge_name: str = "unknown",
) -> AnalogReading:
    """Read an analog gauge from a BGR image.

    Args:
        image_bgr: BGR image of the gauge region.
        config: Gauge configuration.
        gauge_name: Name for logging.

    Returns:
        AnalogReading with detected value and confidence.
    """
    angle = detect_needle_angle(image_bgr, config)

    if angle is None:
        log.debug("analog_no_needle", gauge=gauge_name)
        return AnalogReading(
            angle_degrees=0.0,
            value=0.0,
            confidence=0.0,
            valid=False,
        )

    value = angle_to_value(angle, config)

    # Confidence based on whether value is within expected range
    in_range = config.scale_min <= value <= config.scale_max
    confidence = 0.8 if in_range else 0.3

    log.debug(
        "analog_read",
        gauge=gauge_name,
        angle=round(angle, 1),
        value=round(value, 2),
        confidence=confidence,
    )

    return AnalogReading(
        angle_degrees=round(angle, 2),
        value=round(value, 2),
        confidence=confidence,
        valid=in_range,
    )
