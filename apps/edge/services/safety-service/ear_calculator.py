"""MOSY Edge — Eye Aspect Ratio (EAR) and Mouth Aspect Ratio (MAR) calculator.

Uses MediaPipe Face Mesh landmark indices from Blueprint Section 14.
EAR detects blink/eye closure for PERCLOS; MAR detects yawning.

EAR formula:
    EAR = (||p2 - p6|| + ||p3 - p5||) / (2 * ||p1 - p4||)

Where p1..p6 are the 6 eye landmarks for each eye (left/right).
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


# ---------------------------------------------------------------------------
# MediaPipe Face Mesh landmark indices (0-based)
# ---------------------------------------------------------------------------
# Left eye landmarks
LEFT_EYE = [33, 160, 158, 133, 153, 144]  # p1..p6

# Right eye landmarks
RIGHT_EYE = [362, 385, 387, 263, 373, 380]  # p1..p6

# Mouth landmarks (for yawn detection)
MOUTH_UPPER = 13
MOUTH_LOWER = 14
MOUTH_LEFT = 78
MOUTH_RIGHT = 308

# Thresholds
EAR_THRESHOLD = 0.2     # Eyes considered closed below this
MAR_THRESHOLD = 0.7     # Mouth considered open (yawning) above this


@dataclass
class EarResult:
    """Result of EAR/MAR computation for a single frame."""
    left_ear: float
    right_ear: float
    avg_ear: float
    eyes_closed: bool
    mar: float
    yawning: bool


def _distance(p1: np.ndarray, p2: np.ndarray) -> float:
    """Euclidean distance between two 2D/3D points."""
    return float(np.linalg.norm(p1 - p2))


def compute_ear(landmarks: np.ndarray, eye_indices: list[int]) -> float:
    """Compute Eye Aspect Ratio for a single eye.

    Args:
        landmarks: (468, 3) normalized landmark array.
        eye_indices: 6 landmark indices [p1, p2, p3, p4, p5, p6].

    Returns:
        EAR value (higher = more open).
    """
    p1, p2, p3, p4, p5, p6 = [landmarks[i][:2] for i in eye_indices]

    # Vertical distances
    v1 = _distance(p2, p6)
    v2 = _distance(p3, p5)

    # Horizontal distance
    h = _distance(p1, p4)

    if h < 1e-6:
        return 0.0

    return (v1 + v2) / (2.0 * h)


def compute_mar(landmarks: np.ndarray) -> float:
    """Compute Mouth Aspect Ratio for yawn detection.

    MAR = vertical_distance / horizontal_distance

    Args:
        landmarks: (468, 3) normalized landmark array.

    Returns:
        MAR value (higher = more open mouth).
    """
    upper = landmarks[MOUTH_UPPER][:2]
    lower = landmarks[MOUTH_LOWER][:2]
    left = landmarks[MOUTH_LEFT][:2]
    right = landmarks[MOUTH_RIGHT][:2]

    vertical = _distance(upper, lower)
    horizontal = _distance(left, right)

    if horizontal < 1e-6:
        return 0.0

    return vertical / horizontal


def calculate(landmarks: np.ndarray) -> EarResult:
    """Calculate EAR and MAR from Face Mesh landmarks.

    Args:
        landmarks: (468, 3) normalized landmark array from MediaPipe.

    Returns:
        EarResult with left/right EAR, average EAR, eye closure, MAR, yawning.
    """
    left_ear = compute_ear(landmarks, LEFT_EYE)
    right_ear = compute_ear(landmarks, RIGHT_EYE)
    avg_ear = (left_ear + right_ear) / 2.0

    mar = compute_mar(landmarks)

    return EarResult(
        left_ear=left_ear,
        right_ear=right_ear,
        avg_ear=avg_ear,
        eyes_closed=avg_ear < EAR_THRESHOLD,
        mar=mar,
        yawning=mar > MAR_THRESHOLD,
    )
