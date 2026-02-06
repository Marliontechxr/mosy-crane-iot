"""MOSY E2E test fixtures.

Provides MQTT client, sensor simulator, and service health checks.
"""

from __future__ import annotations

import json
import os
import time
from typing import Any

import paho.mqtt.client as mqtt
import pytest
import requests

MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
CRANE_ID = os.environ.get("CRANE_ID", "POC-001")

# Edge service health endpoints
EDGE_SERVICES = {
    "fusion-service": 8083,
    "ocr-service": 8084,
    "state-engine": 8085,
    "iot-agent": 8086,
    "vision-service": 8087,
    "safety-service": 8088,
    "mqtt-bridge": 8081,
}


@pytest.fixture(scope="session")
def mqtt_client() -> mqtt.Client:
    """Create a connected MQTT client for E2E tests."""
    client = mqtt.Client(client_id="e2e-test-runner", clean_session=True)
    client.connect(MQTT_BROKER, MQTT_PORT, keepalive=30)
    client.loop_start()
    yield client
    client.loop_stop()
    client.disconnect()


@pytest.fixture(scope="session")
def message_collector(mqtt_client: mqtt.Client) -> dict[str, list[dict[str, Any]]]:
    """Collect messages from subscribed topics into a dict keyed by topic."""
    collected: dict[str, list[dict[str, Any]]] = {}

    def _on_message(
        _client: mqtt.Client,
        _userdata: object,
        msg: mqtt.MQTTMessage,
    ) -> None:
        topic = msg.topic
        if topic not in collected:
            collected[topic] = []
        try:
            payload = json.loads(msg.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            payload = {"_raw": msg.payload.hex()}
        collected[topic].append(payload)

    mqtt_client.on_message = _on_message

    # Subscribe to all output topics
    topics = [
        f"mosy/{CRANE_ID}/telemetry/fused",
        f"mosy/{CRANE_ID}/state/lift",
        f"mosy/{CRANE_ID}/state/operator",
        f"mosy/{CRANE_ID}/state/engine",
        f"mosy/{CRANE_ID}/alerts/+",
    ]
    for t in topics:
        mqtt_client.subscribe(t, qos=1)

    time.sleep(1)  # Allow subscriptions to settle
    return collected


def wait_for_services(timeout: int = 120) -> dict[str, bool]:
    """Wait for all edge services to be healthy. Returns status dict."""
    status: dict[str, bool] = {}
    deadline = time.time() + timeout

    for name, port in EDGE_SERVICES.items():
        healthy = False
        while time.time() < deadline:
            try:
                if name == "mqtt-bridge":
                    resp = requests.get(
                        f"http://localhost:{port}/health", timeout=3
                    )
                    healthy = resp.status_code == 200
                else:
                    import socket

                    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    s.settimeout(3)
                    s.connect(("localhost", port))
                    s.close()
                    healthy = True
            except (requests.RequestException, OSError):
                time.sleep(2)
                continue
            if healthy:
                break
        status[name] = healthy

    return status
