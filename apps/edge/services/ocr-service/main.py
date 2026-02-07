"""MOSY Edge — OCR Service entry point.

Captures dashboard camera frames, runs PaddleOCR on gauge ROIs,
publishes DashboardOCR to mosy/{crane_id}/telemetry/ocr (QoS 1).
Supports live calibration updates via MQTT.
Exposes health check on port 8084.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
import uuid
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Dict, Optional

import numpy as np

import paho.mqtt.client as mqtt

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from ocr_service.camera_capture import CameraCapture
from ocr_service.preprocessor import (
    preprocess_for_ocr,
    RoiRegion,
    QualityMetrics,
)
from ocr_service.digital_reader import read_digital, OcrReading
from ocr_service.analog_reader import (
    read_analog,
    AnalogGaugeConfig,
    AnalogReading,
)

log = setup_logging("ocr_service")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8084"))
CAMERA_SOURCE = os.environ.get("CAMERA_SOURCE", "0")
OCR_FPS = float(os.environ.get("OCR_FPS", "5"))
CALIBRATION_PATH = os.environ.get(
    "CALIBRATION_PATH",
    "/app/calibrations/poc-crane.json",
)

# MQTT topics
TOPIC_OCR = f"mosy/{CRANE_ID}/telemetry/ocr"
TOPIC_CALIBRATION = f"mosy/{CRANE_ID}/config/calibration"
TOPIC_ALERT_WARNING = f"mosy/{CRANE_ID}/alerts/warning"

# Dashboard display off: raw brightness (0-255) below this threshold
_DISPLAY_OFF_BRIGHTNESS_THRESHOLD = 15.0

_running = True
_calibration_lock = threading.Lock()
_calibration: Dict = {}
_sequence = 0


def _load_calibration(path: str) -> Dict:
    """Load calibration profile from JSON file."""
    try:
        with open(path, "r") as f:
            cal = json.load(f)
        log.info("calibration_loaded", path=path, id=cal.get("calibration_id"))
        return cal
    except FileNotFoundError:
        log.warning("calibration_file_not_found", path=path)
        return {}
    except json.JSONDecodeError as exc:
        log.error("calibration_parse_error", path=path, error=str(exc))
        return {}


def _get_roi(gauge_config: Dict) -> Optional[RoiRegion]:
    """Extract ROI from gauge calibration config."""
    roi = gauge_config.get("roi")
    if roi is None:
        return None
    return RoiRegion(
        x=roi["x"],
        y=roi["y"],
        width=roi["width"],
        height=roi["height"],
    )


def _read_gauge(
    frame_bgr: np.ndarray,
    gauge_name: str,
    gauge_config: Dict,
) -> Dict:
    """Read a single gauge (digital or analog) from the dashboard frame.

    Returns a GaugeReading dict matching mqtt_types.GaugeReading.
    """
    gauge_type = gauge_config.get("type", "digital")
    roi = _get_roi(gauge_config)

    if gauge_type == "digital":
        from ocr_service.preprocessor import preprocess_for_ocr
        processed, quality = preprocess_for_ocr(frame_bgr, roi)
        reading = read_digital(processed, gauge_name=gauge_name)

        return {
            "raw_value": reading.parsed_value if reading.valid else 0.0,
            "unit": gauge_config.get("unit", ""),
            "confidence": reading.confidence,
            "method": "digital",
            "roi_used": gauge_name,
        }

    elif gauge_type == "analog":
        # Extract ROI region for analog processing
        if roi is not None:
            from ocr_service.preprocessor import extract_roi
            h, w = frame_bgr.shape[:2]
            x1 = max(0, int(roi.x * w))
            y1 = max(0, int(roi.y * h))
            x2 = min(w, int((roi.x + roi.width) * w))
            y2 = min(h, int((roi.y + roi.height) * h))
            gauge_img = frame_bgr[y1:y2, x1:x2]
        else:
            gauge_img = frame_bgr

        config = AnalogGaugeConfig(
            needle_color_hsv_low=tuple(gauge_config.get("needle_color_hsv_low", [0, 100, 100])),  # type: ignore[arg-type]
            needle_color_hsv_high=tuple(gauge_config.get("needle_color_hsv_high", [10, 255, 255])),  # type: ignore[arg-type]
            center_x=gauge_config.get("gauge_center", {}).get("x", 0.5),
            center_y=gauge_config.get("gauge_center", {}).get("y", 0.5),
            start_angle_degrees=gauge_config.get("start_angle_degrees", 225),
            end_angle_degrees=gauge_config.get("end_angle_degrees", -45),
            scale_min=gauge_config.get("scale_min", 0.0),
            scale_max=gauge_config.get("scale_max", 100.0),
        )
        reading = read_analog(gauge_img, config, gauge_name=gauge_name)

        return {
            "raw_value": reading.value if reading.valid else 0.0,
            "unit": gauge_config.get("unit", ""),
            "confidence": reading.confidence,
            "method": "analog",
            "roi_used": gauge_name,
        }

    else:
        log.warning("unknown_gauge_type", gauge=gauge_name, type=gauge_type)
        return {
            "raw_value": 0.0,
            "unit": gauge_config.get("unit", ""),
            "confidence": 0.0,
            "method": gauge_type,
            "roi_used": gauge_name,
        }


# ---------------------------------------------------------------------------
# Alert publishing helper
# ---------------------------------------------------------------------------
def _publish_alert(client: mqtt.Client, alert: dict) -> None:
    """Publish an alert message to the warning alerts topic."""
    try:
        client.publish(TOPIC_ALERT_WARNING, json.dumps(alert), qos=1)
        log.info("alert_published", alert_id=alert.get("alert_id"), type=alert.get("type"))
    except Exception:
        log.exception("alert_publish_failed")


# ---------------------------------------------------------------------------
# MQTT callbacks (calibration updates)
# ---------------------------------------------------------------------------
def on_connect(
    client: mqtt.Client,
    userdata: object,
    flags: dict,
    rc: int,
) -> None:
    log.info("mqtt_connected", rc=rc)
    client.subscribe(TOPIC_CALIBRATION, qos=1)
    log.info("subscribed", topic=TOPIC_CALIBRATION)


def on_message(
    client: mqtt.Client,
    userdata: object,
    msg: mqtt.MQTTMessage,
) -> None:
    """Handle live calibration updates via MQTT."""
    global _calibration
    if msg.topic == TOPIC_CALIBRATION:
        try:
            new_cal = json.loads(msg.payload.decode("utf-8"))
            with _calibration_lock:
                _calibration = new_cal
            log.info("calibration_updated_live", id=new_cal.get("calibration_id"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            log.warning("calibration_parse_error", error=str(exc))


# ---------------------------------------------------------------------------
# OCR processing loop
# ---------------------------------------------------------------------------
def ocr_loop(client: mqtt.Client, camera: CameraCapture) -> None:
    """Run OCR at target FPS, publish DashboardOCR results."""
    global _sequence

    interval = 1.0 / OCR_FPS
    log.info("ocr_loop_started", fps=OCR_FPS)

    while _running:
        start = time.monotonic()

        frame = camera.read()
        if frame is None:
            time.sleep(interval)
            continue

        try:
            with _calibration_lock:
                gauges = _calibration.get("gauges", {})

            readings = {}
            for gauge_name, gauge_config in gauges.items():
                readings[gauge_name] = _read_gauge(frame, gauge_name, gauge_config)

            _sequence += 1

            import cv2
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = float(np.mean(gray))
            contrast = float(np.std(gray))
            laplacian = cv2.Laplacian(gray, cv2.CV_64F)
            blur_score = float(np.var(laplacian))

            # Dashboard display off detection: near-black frame
            if brightness < _DISPLAY_OFF_BRIGHTNESS_THRESHOLD:
                _publish_alert(client, {
                    "timestamp": time.time(),
                    "crane_id": CRANE_ID,
                    "alert_id": f"DOF-{int(time.time())}",
                    "level": "warning",
                    "type": "dashboard_display_off",
                    "title": "Dashboard display appears to be off",
                    "description": (
                        "Camera reading very low brightness. "
                        "Dashboard display may be turned off or camera obstructed."
                    ),
                    "source": "ocr",
                    "values": {"brightness": round(brightness, 2)},
                    "acknowledgement_required": True,
                    "auto_recovery": True,
                })

            payload = {
                "timestamp": time.time(),
                "crane_id": CRANE_ID,
                "sequence": _sequence,
                "readings": readings,
                "quality_metrics": {
                    "image_brightness": round(brightness / 255.0, 3),
                    "contrast": round(contrast / 128.0, 3),
                    "blur_score": round(min(1.0, blur_score / 1000.0), 3),
                    "ocr_engine_version": "paddleocr-3.0",
                },
                "calibration_profile_id": _calibration.get("calibration_id", "unknown"),
                "processing_time_ms": round((time.monotonic() - start) * 1000, 1),
            }

            client.publish(TOPIC_OCR, json.dumps(payload), qos=1)
            log.debug(
                "ocr_published",
                seq=_sequence,
                gauges=len(readings),
                time_ms=payload["processing_time_ms"],
            )

        except Exception:
            log.exception("ocr_processing_error")

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
                "service": "ocr-service",
                "crane_id": CRANE_ID,
                "camera": CAMERA_SOURCE,
                "calibration_id": _calibration.get("calibration_id", "none"),
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
    global _running, _calibration

    log.info("starting", crane_id=CRANE_ID, camera=CAMERA_SOURCE)

    # Load calibration
    _calibration = _load_calibration(CALIBRATION_PATH)

    health_server = start_health_server()

    # Open camera
    camera = CameraCapture(source=CAMERA_SOURCE, target_fps=OCR_FPS)
    camera_ok = camera.open()

    if not camera_ok:
        log.warning("camera_not_available", source=CAMERA_SOURCE)

    client = create_mqtt_client(
        client_id=f"mosy-ocr-{CRANE_ID}",
        on_connect=on_connect,
        on_message=on_message,
    )
    client.loop_start()

    def shutdown(signum: int, frame: object) -> None:
        global _running
        log.info("shutdown_requested", signal=signum)
        _running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    try:
        if camera_ok:
            ocr_loop(client, camera)
        else:
            # Standby mode
            log.info("standby_mode", reason="no camera")
            while _running:
                time.sleep(5.0)
    finally:
        log.info("shutting_down")
        camera.release()
        from ocr_service.digital_reader import release
        release()
        client.loop_stop()
        client.disconnect()
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
