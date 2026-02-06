"""MOSY Edge — Fusion Service entry point.

Subscribes to boom, cabin, and OCR telemetry.
Publishes fused telemetry at 1 Hz on mosy/{crane_id}/telemetry/fused (QoS 1).
Exposes health check on port 8083.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler

import paho.mqtt.client as mqtt

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from fusion_service.fusion_engine import FusionEngine

log = setup_logging("fusion_service")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8083"))
FUSION_INTERVAL_S = float(os.environ.get("FUSION_INTERVAL_S", "1.0"))

# MQTT topics
TOPIC_BOOM = f"mosy/{CRANE_ID}/telemetry/boom"
TOPIC_CABIN = f"mosy/{CRANE_ID}/telemetry/cabin"
TOPIC_OCR = f"mosy/{CRANE_ID}/telemetry/ocr"
TOPIC_FUSED = f"mosy/{CRANE_ID}/telemetry/fused"

engine = FusionEngine(crane_id=CRANE_ID)
_running = True


# ---------------------------------------------------------------------------
# MQTT callbacks
# ---------------------------------------------------------------------------
def on_connect(
    client: mqtt.Client,
    userdata: object,
    flags: dict,
    rc: int,
) -> None:
    """Subscribe to all input telemetry topics on connect."""
    log.info("mqtt_connected", rc=rc)
    client.subscribe(TOPIC_BOOM, qos=0)
    client.subscribe(TOPIC_CABIN, qos=0)
    client.subscribe(TOPIC_OCR, qos=1)
    log.info(
        "subscribed",
        topics=[TOPIC_BOOM, TOPIC_CABIN, TOPIC_OCR],
    )


def on_message(
    client: mqtt.Client,
    userdata: object,
    msg: mqtt.MQTTMessage,
) -> None:
    """Route incoming telemetry to the fusion engine."""
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        log.warning("invalid_payload", topic=msg.topic, error=str(exc))
        return

    if msg.topic == TOPIC_BOOM:
        engine.update_boom(payload)
    elif msg.topic == TOPIC_CABIN:
        engine.update_cabin(payload)
    elif msg.topic == TOPIC_OCR:
        engine.update_ocr(payload)
    else:
        log.warning("unexpected_topic", topic=msg.topic)


# ---------------------------------------------------------------------------
# Fusion publishing loop (1 Hz)
# ---------------------------------------------------------------------------
def fusion_loop(client: mqtt.Client) -> None:
    """Run fusion at a fixed interval and publish results."""
    log.info("fusion_loop_started", interval_s=FUSION_INTERVAL_S)
    while _running:
        start = time.monotonic()
        try:
            fused = engine.fuse()
            if fused is not None:
                payload = json.dumps(fused)
                client.publish(TOPIC_FUSED, payload, qos=1)
                log.debug(
                    "fused_published",
                    status=fused["status"],
                    load=fused["load"]["value_tonnes"],
                    seq=fused["sequence"],
                )
        except Exception:
            log.exception("fusion_error")

        elapsed = time.monotonic() - start
        sleep_time = max(0, FUSION_INTERVAL_S - elapsed)
        time.sleep(sleep_time)


# ---------------------------------------------------------------------------
# Health check HTTP server
# ---------------------------------------------------------------------------
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            body = json.dumps({"status": "ok", "service": "fusion-service", "crane_id": CRANE_ID})
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(body.encode())
        else:
            self.send_response(404)
            self.end_headers()

    def log_message(self, format: str, *args: object) -> None:
        pass  # Suppress default HTTP logging


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

    log.info("starting", crane_id=CRANE_ID)

    health_server = start_health_server()

    client = create_mqtt_client(
        client_id=f"mosy-fusion-{CRANE_ID}",
        on_connect=on_connect,
        on_message=on_message,
    )
    client.loop_start()

    # Graceful shutdown
    def shutdown(signum: int, frame: object) -> None:
        global _running
        log.info("shutdown_requested", signal=signum)
        _running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # Run fusion loop on main thread
    try:
        fusion_loop(client)
    finally:
        log.info("shutting_down")
        client.loop_stop()
        client.disconnect()
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
