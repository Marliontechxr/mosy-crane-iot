"""MOSY Edge — IoT Agent (Azure IoT Device SDK).

Manages the Azure IoT Hub device connection:
  - Device twin desired/reported property sync
  - Direct method handlers (reboot, recalibrate, updateConfig)
  - Twin patches published to local MQTT for service consumption
Exposes health check on port 8086.
"""

from __future__ import annotations

import json
import os
import signal
import threading
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Any, Dict, Optional

import paho.mqtt.client as mqtt

from shared.logger import setup_logging
from shared.mqtt_client import create_mqtt_client
from shared.sqlite_store import SQLiteStore

log = setup_logging("iot_agent")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8086"))
IOT_HUB_CONNECTION_STRING = os.environ.get("IOT_HUB_CONNECTION_STRING", "")
TWIN_SYNC_INTERVAL_S = float(os.environ.get("TWIN_SYNC_INTERVAL_S", "60.0"))

# Local MQTT topics for distributing twin/config updates
TOPIC_CONFIG = f"mosy/{CRANE_ID}/config/calibration"
TOPIC_COMMANDS = f"mosy/{CRANE_ID}/commands"

_running = True
_iot_client: Optional[Any] = None
_local_client: Optional[mqtt.Client] = None
_store: Optional[SQLiteStore] = None
_iot_connected = False
_last_twin: Dict[str, Any] = {}


# ---------------------------------------------------------------------------
# Azure IoT Hub — Device Twin
# ---------------------------------------------------------------------------
def _init_iot_hub() -> Optional[Any]:
    """Create and connect the IoT Hub device client."""
    if not IOT_HUB_CONNECTION_STRING:
        log.warning("iot_hub_not_configured", hint="Set IOT_HUB_CONNECTION_STRING")
        return None

    try:
        from azure.iot.device import IoTHubDeviceClient

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


def _setup_twin_handler() -> None:
    """Register handler for desired property changes from IoT Hub."""
    if _iot_client is None:
        return

    def on_twin_desired(patch: Dict[str, Any]) -> None:
        """Handle desired twin property patch from IoT Hub."""
        log.info("twin_desired_received", keys=list(patch.keys()))

        # Persist to SQLite config store
        if _store:
            for key, value in patch.items():
                if key.startswith("$"):
                    continue  # Skip system properties
                _store.set_config(f"twin.desired.{key}", value)

        # Distribute calibration updates via local MQTT
        if "calibration" in patch and _local_client:
            _local_client.publish(TOPIC_CONFIG, json.dumps(patch["calibration"]), qos=1)
            log.info("calibration_distributed")

        # Distribute config updates
        if "config" in patch and _local_client:
            config_topic = f"mosy/{CRANE_ID}/config/update"
            _local_client.publish(config_topic, json.dumps(patch["config"]), qos=1)
            log.info("config_distributed")

        # Acknowledge desired properties as reported
        _report_twin_properties(patch)

    try:
        _iot_client.on_twin_desired_properties_patch_received = on_twin_desired
        log.info("twin_handler_registered")
    except Exception:
        log.exception("twin_handler_setup_failed")


def _report_twin_properties(properties: Dict[str, Any]) -> None:
    """Report properties back to IoT Hub (acknowledged)."""
    if _iot_client is None:
        return
    try:
        reported = {}
        for key, value in properties.items():
            if key.startswith("$"):
                continue
            reported[key] = {
                "value": value,
                "status": "applied",
                "timestamp": time.time(),
            }
        _iot_client.patch_twin_reported_properties(reported)
        log.info("twin_reported_patched", keys=list(reported.keys()))
    except Exception:
        log.exception("twin_report_failed")


def _sync_device_twin() -> None:
    """Fetch full device twin and sync desired properties."""
    global _last_twin
    if _iot_client is None:
        return

    try:
        twin = _iot_client.get_twin()
        _last_twin = twin
        desired = twin.get("desired", {})
        log.info("twin_synced", desired_keys=list(desired.keys()))

        # Update reported status
        _iot_client.patch_twin_reported_properties({
            "status": {
                "crane_id": CRANE_ID,
                "agent_version": "0.1.0",
                "last_sync": time.time(),
                "uptime_s": time.monotonic(),
            }
        })
    except Exception:
        log.exception("twin_sync_failed")


# ---------------------------------------------------------------------------
# Direct Method handlers
# ---------------------------------------------------------------------------
def _setup_method_handlers() -> None:
    """Register direct method request handlers."""
    if _iot_client is None:
        return

    def method_handler(method_request: Any) -> None:
        method_name = method_request.name
        payload = method_request.payload or {}
        log.info("direct_method_received", method=method_name)

        try:
            from azure.iot.device import MethodResponse

            if method_name == "reboot":
                result = _handle_reboot(payload)
                response = MethodResponse.create_from_method_request(method_request, 200, result)
            elif method_name == "recalibrate":
                result = _handle_recalibrate(payload)
                response = MethodResponse.create_from_method_request(method_request, 200, result)
            elif method_name == "updateConfig":
                result = _handle_update_config(payload)
                response = MethodResponse.create_from_method_request(method_request, 200, result)
            elif method_name == "getStatus":
                result = _handle_get_status()
                response = MethodResponse.create_from_method_request(method_request, 200, result)
            else:
                response = MethodResponse.create_from_method_request(
                    method_request, 404, {"error": f"Unknown method: {method_name}"}
                )

            _iot_client.send_method_response(response)
            log.info("direct_method_responded", method=method_name, status=response.status)
        except Exception:
            log.exception("direct_method_error", method=method_name)

    try:
        _iot_client.on_method_request_received = method_handler
        log.info("method_handlers_registered")
    except Exception:
        log.exception("method_handler_setup_failed")


def _handle_reboot(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle reboot direct method — publishes reboot command to local MQTT."""
    target = payload.get("target", "jetson")
    delay_s = payload.get("delay_seconds", 5)

    if _local_client:
        cmd = {
            "timestamp": time.time(),
            "crane_id": CRANE_ID,
            "command_id": f"reboot-{int(time.time())}",
            "target": target,
            "action": "reboot",
            "parameters": {"delay_seconds": delay_s},
            "timeout_seconds": 60,
            "requires_acknowledgement": True,
        }
        _local_client.publish(f"{TOPIC_COMMANDS}/{target}", json.dumps(cmd), qos=2)

    return {"status": "accepted", "target": target, "delay_seconds": delay_s}


def _handle_recalibrate(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle recalibrate direct method — publishes calibration to local MQTT."""
    if _local_client:
        _local_client.publish(TOPIC_CONFIG, json.dumps(payload), qos=1)

    return {"status": "accepted", "calibration_id": payload.get("calibration_id", "unknown")}


def _handle_update_config(payload: Dict[str, Any]) -> Dict[str, Any]:
    """Handle config update direct method."""
    if _store:
        for key, value in payload.items():
            _store.set_config(f"remote.{key}", value)

    if _local_client:
        config_topic = f"mosy/{CRANE_ID}/config/update"
        _local_client.publish(config_topic, json.dumps(payload), qos=1)

    return {"status": "accepted", "keys_updated": list(payload.keys())}


def _handle_get_status() -> Dict[str, Any]:
    """Handle getStatus direct method — returns current agent status."""
    buffer_stats = _store.get_buffer_stats() if _store else {}
    return {
        "crane_id": CRANE_ID,
        "agent_version": "0.1.0",
        "iot_connected": _iot_connected,
        "buffer_stats": buffer_stats,
        "uptime_s": round(time.monotonic(), 1),
        "timestamp": time.time(),
    }


# ---------------------------------------------------------------------------
# Twin sync loop
# ---------------------------------------------------------------------------
def twin_sync_loop() -> None:
    """Periodically sync device twin."""
    log.info("twin_sync_loop_started", interval_s=TWIN_SYNC_INTERVAL_S)
    while _running:
        _sync_device_twin()
        time.sleep(TWIN_SYNC_INTERVAL_S)


# ---------------------------------------------------------------------------
# Local MQTT (for distributing commands)
# ---------------------------------------------------------------------------
def on_local_connect(
    client: mqtt.Client,
    userdata: object,
    flags: dict,
    rc: int,
) -> None:
    log.info("local_mqtt_connected", rc=rc)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            body = json.dumps({
                "status": "ok",
                "service": "iot-agent",
                "crane_id": CRANE_ID,
                "iot_hub_connected": _iot_connected,
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
    global _running, _iot_client, _local_client, _store, _iot_connected

    log.info("starting", crane_id=CRANE_ID)

    _store = SQLiteStore()
    health_server = start_health_server()

    # Connect to local MQTT
    _local_client = create_mqtt_client(
        client_id=f"mosy-iot-agent-{CRANE_ID}",
        on_connect=on_local_connect,
    )
    _local_client.loop_start()

    # Connect to Azure IoT Hub
    _iot_client = _init_iot_hub()
    if _iot_client:
        _iot_connected = True
        _setup_twin_handler()
        _setup_method_handlers()
        _sync_device_twin()

        # Start twin sync loop
        sync_thread = threading.Thread(target=twin_sync_loop, daemon=True)
        sync_thread.start()
    else:
        log.warning("running_without_iot_hub")

    def shutdown(signum: int, frame: object) -> None:
        global _running
        log.info("shutdown_requested", signal=signum)
        _running = False

    signal.signal(signal.SIGTERM, shutdown)
    signal.signal(signal.SIGINT, shutdown)

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
                _iot_client.disconnect()
            except Exception:
                pass
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
