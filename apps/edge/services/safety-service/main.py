"""MOSY Edge — Safety Service entry point.

Captures cabin camera frames, runs MediaPipe PERCLOS fatigue detection,
publishes CabinCameraInference to mosy/{crane_id}/vision/cabin (QoS 1).
Exposes health check on port 8088.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

import numpy as np

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from safety_service.operator_tracker import OperatorTracker

log = setup_logging("safety_service")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8088"))
CAMERA_SOURCE = os.environ.get("CAMERA_SOURCE", "0")
INFERENCE_FPS = float(os.environ.get("INFERENCE_FPS", "10"))

# MQTT topics
TOPIC_CABIN_VISION = f"mosy/{CRANE_ID}/vision/cabin"
TOPIC_ALERT_WARNING = f"mosy/{CRANE_ID}/alerts/warning"

# Sunglasses detection: both EAR values below this with face present
_SUNGLASSES_EAR_THRESHOLD = 0.05

_running = True
_camera = None


def _open_camera() -> Optional[object]:
    """Open OpenCV VideoCapture from CAMERA_SOURCE env var."""
    if CAMERA_SOURCE.lower() == "none":
        log.warning("camera_disabled", reason="CAMERA_SOURCE=none")
        return None

    try:
        import cv2
        source = int(CAMERA_SOURCE) if CAMERA_SOURCE.isdigit() else CAMERA_SOURCE
        cap = cv2.VideoCapture(source)
        if not cap.isOpened():
            log.error("camera_open_failed", source=CAMERA_SOURCE)
            return None
        log.info("camera_opened", source=CAMERA_SOURCE)
        return cap
    except Exception:
        log.exception("camera_init_error")
        return None


def _read_frame(camera: object) -> Optional[np.ndarray]:
    """Read a frame from camera and convert BGR→RGB."""
    import cv2
    ret, frame = camera.read()  # type: ignore[union-attr]
    if not ret or frame is None:
        return None
    return cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)


# ---------------------------------------------------------------------------
# Alert publishing helper
# ---------------------------------------------------------------------------
def _publish_alert(client: object, alert: dict) -> None:
    """Publish an alert message to the warning alerts topic."""
    try:
        client.publish(TOPIC_ALERT_WARNING, json.dumps(alert), qos=1)  # type: ignore[union-attr]
        log.info("alert_published", alert_id=alert.get("alert_id"), type=alert.get("type"))
    except Exception:
        log.exception("alert_publish_failed")


# ---------------------------------------------------------------------------
# Inference loop
# ---------------------------------------------------------------------------
def inference_loop(client: object, tracker: OperatorTracker) -> None:
    """Run face detection + PERCLOS at target FPS, publish results."""
    global _camera

    interval = 1.0 / INFERENCE_FPS
    log.info("inference_loop_started", fps=INFERENCE_FPS, camera=CAMERA_SOURCE)

    _camera = _open_camera()

    while _running:
        start = time.monotonic()

        if _camera is None:
            # Standby mode — no camera available, publish absent state
            state = tracker.process_frame(np.zeros((480, 640, 3), dtype=np.uint8))
            payload = tracker.to_mqtt_payload(state)
            client.publish(TOPIC_CABIN_VISION, json.dumps(payload), qos=1)  # type: ignore[union-attr]
            time.sleep(5.0)  # Slow poll in standby
            continue

        try:
            frame = _read_frame(_camera)
            if frame is None:
                log.warning("frame_read_failed")
                time.sleep(interval)
                continue

            state = tracker.process_frame(frame)
            payload = tracker.to_mqtt_payload(state)

            # Sunglasses detection: face present but eyes not trackable
            if (
                state.face_detected
                and state.face_confidence > 0.6
                and state.ear is not None
                and state.ear.left_ear < _SUNGLASSES_EAR_THRESHOLD
                and state.ear.right_ear < _SUNGLASSES_EAR_THRESHOLD
            ):
                _publish_alert(client, {
                    "timestamp": time.time(),
                    "crane_id": CRANE_ID,
                    "alert_id": f"SG-{int(time.time())}",
                    "level": "warning",
                    "type": "sunglasses_detected",
                    "title": "Sunglasses detected — PERCLOS unreliable",
                    "description": (
                        "Operator appears to be wearing sunglasses. "
                        "Eye tracking accuracy is degraded. "
                        "Please remove sunglasses for safety monitoring."
                    ),
                    "source": "camera",
                    "values": {"face_confidence": state.face_confidence},
                    "acknowledgement_required": False,
                    "auto_recovery": True,
                })

            client.publish(TOPIC_CABIN_VISION, json.dumps(payload), qos=1)  # type: ignore[union-attr]

        except Exception:
            log.exception("inference_error")

        elapsed = time.monotonic() - start
        sleep_time = max(0, interval - elapsed)
        time.sleep(sleep_time)


# ---------------------------------------------------------------------------
# Health check HTTP server
# ---------------------------------------------------------------------------
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            body = json.dumps({
                "status": "ok",
                "service": "safety-service",
                "crane_id": CRANE_ID,
                "camera": CAMERA_SOURCE,
            })
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        pass


def start_health_server() -> HTTPServer:
    server = HTTPServer(("0.0.0.0", HEALTH_PORT), HealthHandler)
    t = threading.Thread(target=server.serve_forever, daemon=True)
    t.start()
    log.info("health_server_started", port=HEALTH_PORT)
    return server


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main() -> None:
    global _running

    log.info("starting", crane_id=CRANE_ID, camera=CAMERA_SOURCE)

    health_server = start_health_server()
    tracker = OperatorTracker(crane_id=CRANE_ID)

    client = create_mqtt_client(
        client_id=f"mosy-safety-{CRANE_ID}",
    )
    client.loop_start()

    def shutdown(signum: int, frame: object) -> None:
        global _running
        log.info("shutdown_requested", signal=signum)
        _running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    try:
        inference_loop(client, tracker)
    finally:
        log.info("shutting_down")
        if _camera is not None:
            _camera.release()  # type: ignore[union-attr]
        from safety_service.face_detector import release
        release()
        client.loop_stop()
        client.disconnect()
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
