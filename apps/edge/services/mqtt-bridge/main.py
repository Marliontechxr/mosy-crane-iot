"""MOSY Edge — MQTT Bridge (Store-and-Forward to Azure IoT Hub).

Subscribes to fused telemetry and alerts.
Buffers messages in SQLite when offline.
Forwards to Azure IoT Hub when connected.
Receives cloud-to-device (C2D) messages and publishes to local MQTT commands.
Exposes health check on port 8081.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

import paho.mqtt.client as mqtt

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from shared.sqlite_store import SQLiteStore

log = setup_logging("mqtt_bridge")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8081"))
IOT_HUB_CONNECTION_STRING = os.environ.get("IOT_HUB_CONNECTION_STRING", "")
FORWARD_INTERVAL_S = float(os.environ.get("FORWARD_INTERVAL_S", "5.0"))
CLEANUP_INTERVAL_S = float(os.environ.get("CLEANUP_INTERVAL_S", "3600"))
MAX_BATCH_SIZE = int(os.environ.get("MAX_BATCH_SIZE", "50"))

# MQTT topics to bridge to cloud
TOPICS_TO_BRIDGE = [
    f"mosy/{CRANE_ID}/telemetry/fused",
    f"mosy/{CRANE_ID}/alerts/+",
    f"mosy/{CRANE_ID}/state/+",
]
TOPIC_COMMANDS = f"mosy/{CRANE_ID}/commands"

_running = True
_store: Optional[SQLiteStore] = None
_iot_client: Optional[object] = None  # Azure IoT Device Client
_iot_connected = False
_local_client: Optional[mqtt.Client] = None

# Prolonged disconnect tracking
_disconnect_since: Optional[float] = None
_DISCONNECT_ALERT_THRESHOLD_S: float = 300.0  # 5 minutes


# ---------------------------------------------------------------------------
# Azure IoT Hub client
# ---------------------------------------------------------------------------
def _init_iot_hub() -> Optional[object]:
    """Initialize Azure IoT Hub device client if connection string is set."""
    if not IOT_HUB_CONNECTION_STRING:
        log.warning("iot_hub_not_configured", hint="Set IOT_HUB_CONNECTION_STRING")
        return None

    try:
        from azure.iot.device import IoTHubDeviceClient, Message

        client = IoTHubDeviceClient.create_from_connection_string(
            IOT_HUB_CONNECTION_STRING,
            connection_retry=True,
            retry_total=10,
            keep_alive=60,
        )
        client.connect()
        log.info("iot_hub_connected")
        return client
    except ImportError:
        log.error("azure_iot_sdk_not_installed")
        return None
    except Exception:
        log.exception("iot_hub_connect_failed")
        return None


def _send_to_iot_hub(topic: str, payload: dict) -> bool:
    """Send a message to Azure IoT Hub. Returns True if successful."""
    global _iot_connected, _disconnect_since

    if _iot_client is None:
        return False

    try:
        from azure.iot.device import Message

        msg = Message(json.dumps(payload))
        msg.content_type = "application/json"
        msg.content_encoding = "utf-8"
        msg.custom_properties["source_topic"] = topic
        msg.custom_properties["crane_id"] = CRANE_ID

        _iot_client.send_message(msg)  # type: ignore[union-attr]

        # Reconnection detected — check for prolonged disconnect
        if not _iot_connected and _disconnect_since is not None:
            duration = time.time() - _disconnect_since
            if duration > _DISCONNECT_ALERT_THRESHOLD_S and _local_client is not None:
                alert = {
                    "timestamp": time.time(),
                    "crane_id": CRANE_ID,
                    "alert_id": f"DC-{int(time.time())}",
                    "level": "warning",
                    "type": "prolonged_disconnect",
                    "title": f"Cloud connection restored after {duration / 60:.1f} min",
                    "description": (
                        f"Azure IoT Hub was unreachable for "
                        f"{duration / 60:.1f} minutes."
                    ),
                    "source": "system",
                    "values": {"disconnect_duration_s": round(duration, 1)},
                    "acknowledgement_required": False,
                    "auto_recovery": True,
                }
                _local_client.publish(
                    f"mosy/{CRANE_ID}/alerts/warning",
                    json.dumps(alert),
                    qos=1,
                )
                log.info(
                    "prolonged_disconnect_alert",
                    duration_s=round(duration, 1),
                )
            _disconnect_since = None

        _iot_connected = True
        return True
    except Exception as exc:
        log.warning("iot_hub_send_failed", error=str(exc))
        if _iot_connected and _disconnect_since is None:
            _disconnect_since = time.time()
            log.info("disconnect_tracking_started")
        _iot_connected = False
        return False


# ---------------------------------------------------------------------------
# C2D message handler
# ---------------------------------------------------------------------------
def _setup_c2d_handler() -> None:
    """Set up cloud-to-device message handler that republishes to local MQTT."""
    if _iot_client is None:
        return

    def on_c2d(message: object) -> None:
        try:
            data = json.loads(message.data.decode("utf-8"))  # type: ignore[union-attr]
            target = data.get("target", "jetson")
            local_topic = f"{TOPIC_COMMANDS}/{target}"
            if _local_client:
                _local_client.publish(local_topic, json.dumps(data), qos=1)
                log.info("c2d_forwarded", target=target, action=data.get("action"))
        except Exception:
            log.exception("c2d_handler_error")

    try:
        _iot_client.on_message_received = on_c2d  # type: ignore[union-attr]
        log.info("c2d_handler_registered")
    except Exception:
        log.exception("c2d_handler_setup_failed")


# ---------------------------------------------------------------------------
# Local MQTT callbacks
# ---------------------------------------------------------------------------
def on_connect(
    client: mqtt.Client,
    userdata: object,
    flags: dict,
    rc: int,
) -> None:
    log.info("local_mqtt_connected", rc=rc)
    for topic_pattern in TOPICS_TO_BRIDGE:
        client.subscribe(topic_pattern, qos=1)
    log.info("subscribed", topics=TOPICS_TO_BRIDGE)


def on_message(
    client: mqtt.Client,
    userdata: object,
    msg: mqtt.MQTTMessage,
) -> None:
    """Buffer incoming messages for forwarding to IoT Hub."""
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        log.warning("invalid_payload", topic=msg.topic, error=str(exc))
        return

    timestamp = int(payload.get("timestamp", time.time()))

    if _store:
        _store.buffer_message(
            crane_id=CRANE_ID,
            topic=msg.topic,
            payload=payload,
            timestamp=timestamp,
        )


# ---------------------------------------------------------------------------
# Forwarding loop
# ---------------------------------------------------------------------------
def forward_loop() -> None:
    """Periodically forward buffered messages to Azure IoT Hub."""
    log.info("forward_loop_started", interval_s=FORWARD_INTERVAL_S)
    last_cleanup = time.monotonic()

    while _running:
        try:
            if _store and _iot_client:
                messages = _store.get_unsent_messages(limit=MAX_BATCH_SIZE)
                if messages:
                    sent_ids = []
                    for msg in messages:
                        success = _send_to_iot_hub(msg["topic"], msg["payload"])
                        if success:
                            sent_ids.append(msg["id"])
                        else:
                            break  # Stop batch on first failure

                    if sent_ids:
                        _store.mark_sent(sent_ids)
                        log.info("messages_forwarded", count=len(sent_ids))

            # Periodic cleanup of old sent messages
            elapsed = time.monotonic() - last_cleanup
            if elapsed > CLEANUP_INTERVAL_S and _store:
                deleted = _store.cleanup_old(max_age_days=7)
                if deleted > 0:
                    log.info("old_messages_cleaned", count=deleted)
                last_cleanup = time.monotonic()

        except Exception:
            log.exception("forward_loop_error")

        time.sleep(FORWARD_INTERVAL_S)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            stats = _store.get_buffer_stats() if _store else {}
            body = json.dumps({
                "status": "ok",
                "service": "mqtt-bridge",
                "crane_id": CRANE_ID,
                "iot_hub_connected": _iot_connected,
                "buffer": stats,
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
    global _running, _store, _iot_client, _local_client

    log.info("starting", crane_id=CRANE_ID)

    # Initialize SQLite store
    _store = SQLiteStore()
    stats = _store.get_buffer_stats()
    log.info("store_initialized", pending=stats.get("unsent", 0))

    # Initialize Azure IoT Hub client
    _iot_client = _init_iot_hub()
    if _iot_client:
        _setup_c2d_handler()

    # Start health server
    health_server = start_health_server()

    # Connect to local MQTT
    _local_client = create_mqtt_client(
        client_id=f"mosy-bridge-{CRANE_ID}",
        on_connect=on_connect,
        on_message=on_message,
    )
    _local_client.loop_start()

    def shutdown(signum: int, frame: object) -> None:
        global _running
        log.info("shutdown_requested", signal=signum)
        _running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

    # Start forwarding loop on a background thread
    forward_thread = threading.Thread(target=forward_loop, daemon=True)
    forward_thread.start()

    try:
        while _running:
            time.sleep(1)
    finally:
        log.info("shutting_down")
        if _local_client:
            _local_client.loop_stop()
            _local_client.disconnect()
        if _iot_client:
            try:
                _iot_client.disconnect()  # type: ignore[union-attr]
            except Exception:
                pass
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
