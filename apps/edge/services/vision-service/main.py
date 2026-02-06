"""MOSY Edge — Vision Service entry point.

Captures boom camera frames, runs Moondream 2 VLM scene analysis,
publishes BoomCameraInference to mosy/{crane_id}/vision/boom (QoS 1).
Exposes health check on port 8087.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from vision_service.model_loader import get_model, is_loaded, release as release_model
from vision_service.boom_analyzer import analyze_boom_scene
from vision_service.inference_pipeline import InferencePipeline

log = setup_logging("vision_service")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8087"))
CAMERA_SOURCE = os.environ.get("CAMERA_SOURCE", "0")
INFERENCE_FPS = float(os.environ.get("INFERENCE_FPS", "0.2"))  # 1 frame / 5s

# MQTT topic
TOPIC_BOOM_VISION = f"mosy/{CRANE_ID}/vision/boom"

_running = True


# ---------------------------------------------------------------------------
# Inference loop
# ---------------------------------------------------------------------------
def inference_loop(client: object, pipeline: InferencePipeline) -> None:
    """Run VLM inference at target interval, publish BoomCameraInference."""
    interval = pipeline.target_interval_s
    log.info("inference_loop_started", fps=INFERENCE_FPS, interval_s=interval)

    # Lazy-load model on first iteration
    model = None

    while _running:
        start = time.monotonic()

        # Load model if not yet done
        if model is None:
            log.info("loading_vlm_model")
            model = get_model()
            if model is None:
                log.error("vlm_model_unavailable")
                time.sleep(30.0)
                continue
            log.info("vlm_model_ready")

        if not pipeline.is_open:
            time.sleep(5.0)
            continue

        try:
            image = pipeline.capture_frame()
            if image is None:
                log.warning("frame_capture_failed")
                time.sleep(interval)
                continue

            result = analyze_boom_scene(model, image)

            payload = {
                "timestamp": time.time(),
                "crane_id": CRANE_ID,
                "inference_id": result.inference_id,
                "model_name": "moondream2-0.5b",
                "detections": result.detections,
                "caption": result.caption,
                "processing_time_ms": result.processing_time_ms,
                "hardware": "cpu",
            }

            client.publish(TOPIC_BOOM_VISION, json.dumps(payload), qos=1)  # type: ignore[union-attr]
            log.debug(
                "inference_published",
                detections=len(result.detections),
                time_ms=result.processing_time_ms,
            )

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
                "service": "vision-service",
                "crane_id": CRANE_ID,
                "camera": CAMERA_SOURCE,
                "model_loaded": is_loaded(),
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

    pipeline = InferencePipeline(
        camera_source=CAMERA_SOURCE,
        target_fps=INFERENCE_FPS,
    )
    camera_ok = pipeline.open()

    if not camera_ok:
        log.warning("camera_not_available", source=CAMERA_SOURCE)

    client = create_mqtt_client(
        client_id=f"mosy-vision-{CRANE_ID}",
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
            inference_loop(client, pipeline)
        else:
            log.info("standby_mode", reason="no camera")
            while _running:
                time.sleep(5.0)
    finally:
        log.info("shutting_down")
        pipeline.release()
        release_model()
        client.loop_stop()
        client.disconnect()
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
