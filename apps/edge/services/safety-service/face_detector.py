"""MOSY Edge — MediaPipe Face Mesh wrapper for landmark extraction.

Returns 468 normalized landmarks per detected face. Used by EAR calculator
and operator tracker for fatigue detection (PERCLOS).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import numpy as np

from shared.logger import setup_logging

log = setup_logging("face_detector")

# MediaPipe imported lazily to allow mocking in tests
_mp_face_mesh = None


def _get_face_mesh():  # type: ignore[no-untyped-def]
    """Lazy-init MediaPipe FaceMesh to avoid import at module level."""
    global _mp_face_mesh
    if _mp_face_mesh is None:
        import mediapipe as mp
        _mp_face_mesh = mp.solutions.face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        log.info("mediapipe_face_mesh_initialized")
    return _mp_face_mesh


@dataclass
class FaceLandmarks:
    """468 normalized (x, y, z) landmarks from MediaPipe Face Mesh."""
    landmarks: np.ndarray  # shape (468, 3)
    face_confidence: float


def detect_face(frame_rgb: np.ndarray) -> Optional[FaceLandmarks]:
    """Run MediaPipe Face Mesh on an RGB frame.

    Args:
        frame_rgb: NumPy array of shape (H, W, 3), dtype uint8, RGB order.

    Returns:
        FaceLandmarks with 468 points, or None if no face detected.
    """
    face_mesh = _get_face_mesh()
    results = face_mesh.process(frame_rgb)

    if not results.multi_face_landmarks:
        return None

    face = results.multi_face_landmarks[0]
    landmarks = np.array(
        [(lm.x, lm.y, lm.z) for lm in face.landmark],
        dtype=np.float64,
    )

    # MediaPipe doesn't expose per-face confidence directly;
    # use detection score from first detection if available
    confidence = 0.95
    if hasattr(results, "detections") and results.detections:
        confidence = results.detections[0].score[0]

    return FaceLandmarks(landmarks=landmarks, face_confidence=confidence)


def release() -> None:
    """Release MediaPipe resources."""
    global _mp_face_mesh
    if _mp_face_mesh is not None:
        _mp_face_mesh.close()
        _mp_face_mesh = None
        log.info("mediapipe_face_mesh_released")
