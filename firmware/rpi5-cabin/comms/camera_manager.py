"""
Camera manager — USB camera capture and RTSP forwarding.
Blueprint Section 8 — captures frames from dashboard camera,
forwards to Jetson for PERCLOS processing.
"""
from __future__ import annotations

import logging
import time
import threading
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CameraConfig:
    """Camera configuration."""
    usb_device: str = "/dev/video0"
    resolution: tuple[int, int] = (1280, 720)
    fps: int = 5
    jpeg_quality: int = 85


@dataclass
class CameraStatus:
    """Current camera state."""
    is_running: bool = False
    frames_captured: int = 0
    last_frame_time: float = 0.0
    error: Optional[str] = None


class CameraManager:
    """Manages USB camera capture and frame forwarding."""

    def __init__(self, config: CameraConfig) -> None:
        self._config = config
        self._cap: Optional[object] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._frames_captured = 0
        self._last_frame_time = 0.0
        self._error: Optional[str] = None
        self._frame_callback: Optional[callable] = None

    def init(self, frame_callback: Optional[callable] = None) -> bool:
        """
        Initialize camera capture.

        Args:
            frame_callback: Optional callback(frame_bytes, timestamp) for each frame.

        Returns:
            True if camera opened successfully.
        """
        try:
            import cv2  # type: ignore

            self._cap = cv2.VideoCapture(self._config.usb_device)
            if not self._cap.isOpened():
                self._error = f"Cannot open {self._config.usb_device}"
                logger.error("Camera init failed: %s", self._error)
                return False

            # Set resolution
            self._cap.set(cv2.CAP_PROP_FRAME_WIDTH, self._config.resolution[0])
            self._cap.set(cv2.CAP_PROP_FRAME_HEIGHT, self._config.resolution[1])
            self._cap.set(cv2.CAP_PROP_FPS, self._config.fps)

            self._frame_callback = frame_callback
            logger.info(
                "Camera initialized: %s (%dx%d @ %d fps)",
                self._config.usb_device,
                self._config.resolution[0],
                self._config.resolution[1],
                self._config.fps,
            )
            return True

        except Exception as e:
            self._error = str(e)
            logger.error("Camera init failed: %s", e)
            return False

    def start(self) -> None:
        """Start camera capture in background thread."""
        if self._running or self._cap is None:
            return

        self._running = True
        self._thread = threading.Thread(target=self._capture_loop, daemon=True)
        self._thread.start()
        logger.info("Camera capture started")

    def _capture_loop(self) -> None:
        """Capture loop running in background thread."""
        import cv2  # type: ignore

        frame_interval = 1.0 / self._config.fps

        while self._running and self._cap is not None:
            loop_start = time.time()

            ret, frame = self._cap.read()
            if not ret:
                self._error = "Frame capture failed"
                time.sleep(0.1)
                continue

            self._frames_captured += 1
            self._last_frame_time = time.time()
            self._error = None

            # Encode as JPEG if callback is set
            if self._frame_callback is not None:
                try:
                    _, jpeg = cv2.imencode(
                        ".jpg", frame,
                        [cv2.IMWRITE_JPEG_QUALITY, self._config.jpeg_quality],
                    )
                    self._frame_callback(jpeg.tobytes(), self._last_frame_time)
                except Exception as e:
                    logger.warning("Frame encode/callback failed: %s", e)

            # Maintain target FPS
            elapsed = time.time() - loop_start
            if elapsed < frame_interval:
                time.sleep(frame_interval - elapsed)

    def stop(self) -> None:
        """Stop camera capture."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=2.0)
            self._thread = None

        if self._cap is not None:
            self._cap.release()
            self._cap = None

        logger.info("Camera capture stopped (%d frames)", self._frames_captured)

    def get_status(self) -> CameraStatus:
        """Get current camera status."""
        return CameraStatus(
            is_running=self._running,
            frames_captured=self._frames_captured,
            last_frame_time=self._last_frame_time,
            error=self._error,
        )
