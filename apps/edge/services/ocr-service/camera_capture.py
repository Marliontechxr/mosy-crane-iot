"""MOSY Edge — OpenCV frame capture for dashboard camera.

Wraps cv2.VideoCapture with frame skipping (process every Nth frame)
to maintain target FPS for OCR processing.
"""

from __future__ import annotations

import os
import time
from typing import Optional

import numpy as np

from shared.logger import setup_logging

log = setup_logging("camera_capture")


class CameraCapture:
    """OpenCV camera wrapper with frame skipping for OCR processing."""

    def __init__(
        self,
        source: str | int = 0,
        target_fps: float = 5.0,
    ) -> None:
        self._source = source
        self._target_fps = target_fps
        self._cap = None
        self._frame_count = 0
        self._last_grab_time = 0.0

    def open(self) -> bool:
        """Open the camera device or video file.

        Returns:
            True if camera opened successfully.
        """
        if str(self._source).lower() == "none":
            log.warning("camera_disabled", reason="source=none")
            return False

        try:
            import cv2
            source = int(self._source) if str(self._source).isdigit() else self._source
            self._cap = cv2.VideoCapture(source)
            if not self._cap.isOpened():
                log.error("camera_open_failed", source=self._source)
                return False

            # Try to set camera FPS (may not be supported by all devices)
            self._cap.set(cv2.CAP_PROP_FPS, self._target_fps * 3)

            actual_fps = self._cap.get(cv2.CAP_PROP_FPS)
            width = int(self._cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(self._cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            log.info(
                "camera_opened",
                source=self._source,
                resolution=f"{width}x{height}",
                device_fps=actual_fps,
                target_fps=self._target_fps,
            )
            return True
        except Exception:
            log.exception("camera_init_error")
            return False

    def read(self) -> Optional[np.ndarray]:
        """Read the next frame at target FPS, skipping intermediate frames.

        Returns:
            BGR frame as NumPy array, or None if no frame available.
        """
        if self._cap is None:
            return None

        # Rate limiting
        now = time.monotonic()
        min_interval = 1.0 / self._target_fps
        elapsed = now - self._last_grab_time
        if elapsed < min_interval:
            time.sleep(min_interval - elapsed)

        ret, frame = self._cap.read()
        if not ret or frame is None:
            return None

        self._frame_count += 1
        self._last_grab_time = time.monotonic()
        return frame

    def release(self) -> None:
        """Release the camera device."""
        if self._cap is not None:
            self._cap.release()
            log.info("camera_released", frames_captured=self._frame_count)
            self._cap = None

    @property
    def is_open(self) -> bool:
        return self._cap is not None and self._cap.isOpened()

    @property
    def frame_count(self) -> int:
        return self._frame_count
