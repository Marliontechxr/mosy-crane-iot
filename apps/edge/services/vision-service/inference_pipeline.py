"""MOSY Edge — Vision Service frame capture and inference pipeline.

Captures boom camera frames via OpenCV, converts to PIL Images,
and feeds through Moondream 2 VLM for scene analysis.
"""

from __future__ import annotations

import os
import time
from typing import Optional

import numpy as np
from PIL import Image

from shared.logger import setup_logging

log = setup_logging("inference_pipeline")


class InferencePipeline:
    """Boom camera frame capture + VLM inference pipeline."""

    def __init__(
        self,
        camera_source: str | int = 0,
        target_fps: float = 0.2,  # 1 frame every 5 seconds (VLM is slow)
    ) -> None:
        self._source = camera_source
        self._target_fps = target_fps
        self._cap = None
        self._frame_count = 0

    def open(self) -> bool:
        """Open the boom camera device or RTSP/file source."""
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
            log.info("camera_opened", source=self._source)
            return True
        except Exception:
            log.exception("camera_init_error")
            return False

    def capture_frame(self) -> Optional[Image.Image]:
        """Capture a single frame and convert to PIL Image (RGB).

        Returns:
            PIL Image in RGB, or None if capture fails.
        """
        if self._cap is None:
            return None

        ret, frame = self._cap.read()
        if not ret or frame is None:
            return None

        self._frame_count += 1

        # BGR → RGB → PIL
        import cv2
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        return Image.fromarray(rgb)

    def release(self) -> None:
        """Release camera resources."""
        if self._cap is not None:
            self._cap.release()
            log.info("camera_released", frames=self._frame_count)
            self._cap = None

    @property
    def is_open(self) -> bool:
        return self._cap is not None and self._cap.isOpened()

    @property
    def target_interval_s(self) -> float:
        return 1.0 / self._target_fps if self._target_fps > 0 else 5.0
