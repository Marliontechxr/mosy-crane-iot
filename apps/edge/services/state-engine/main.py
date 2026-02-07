"""MOSY Edge — State Engine entry point.

Subscribes to fused telemetry and cabin telemetry.
Runs lift, operator, and engine state machines.
Publishes state updates to mosy/{crane_id}/state/{lift|operator|engine}.
Exposes health check on port 8085.
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
from state_engine.lift_state import LiftStateMachine
from state_engine.operator_state import OperatorStateMachine
from state_engine.engine_state import EngineStateMachine
from state_engine.scorer import ProductivityScorer

log = setup_logging("state_engine")

CRANE_ID = os.environ.get("CRANE_ID", "POC-001")
HEALTH_PORT = int(os.environ.get("HEALTH_PORT", "8085"))

# MQTT topics
TOPIC_FUSED = f"mosy/{CRANE_ID}/telemetry/fused"
TOPIC_CABIN = f"mosy/{CRANE_ID}/telemetry/cabin"
TOPIC_LIFT_STATE = f"mosy/{CRANE_ID}/state/lift"
TOPIC_OPERATOR_STATE = f"mosy/{CRANE_ID}/state/operator"
TOPIC_ENGINE_STATE = f"mosy/{CRANE_ID}/state/engine"

# State machines
lift_fsm = LiftStateMachine(crane_id=CRANE_ID)
operator_fsm = OperatorStateMachine(crane_id=CRANE_ID)
engine_fsm = EngineStateMachine(crane_id=CRANE_ID)

# Productivity scorer
scorer = ProductivityScorer(crane_id=CRANE_ID)

# Additional topic constants
TOPIC_SHIFT_SCORE = f"mosy/{CRANE_ID}/shift/score"
TOPIC_BOOM_VISION = f"mosy/{CRANE_ID}/vision/boom"
TOPIC_OPERATOR_CHECKIN = f"mosy/{CRANE_ID}/operator/check-in"

_running = True
_client: mqtt.Client | None = None


# ---------------------------------------------------------------------------
# MQTT callbacks
# ---------------------------------------------------------------------------
def on_connect(
    client: mqtt.Client,
    userdata: object,
    flags: dict,
    rc: int,
) -> None:
    log.info("mqtt_connected", rc=rc)
    client.subscribe(TOPIC_FUSED, qos=1)
    client.subscribe(TOPIC_CABIN, qos=0)
    client.subscribe(TOPIC_BOOM_VISION, qos=1)
    client.subscribe(TOPIC_OPERATOR_CHECKIN, qos=1)
    log.info(
        "subscribed",
        topics=[TOPIC_FUSED, TOPIC_CABIN, TOPIC_BOOM_VISION, TOPIC_OPERATOR_CHECKIN],
    )


def on_message(
    client: mqtt.Client,
    userdata: object,
    msg: mqtt.MQTTMessage,
) -> None:
    try:
        payload = json.loads(msg.payload.decode("utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        log.warning("invalid_payload", topic=msg.topic, error=str(exc))
        return

    if msg.topic == TOPIC_FUSED:
        _process_fused(client, payload)
    elif msg.topic == TOPIC_CABIN:
        _process_cabin(client, payload)
    elif msg.topic == TOPIC_BOOM_VISION:
        scorer.process_state_update(msg.topic, payload)
    elif msg.topic == TOPIC_OPERATOR_CHECKIN:
        _process_checkin(client, payload)
    else:
        log.warning("unexpected_topic", topic=msg.topic)


def _process_fused(client: mqtt.Client, fused: dict) -> None:
    """Run lift and engine FSMs on fused telemetry."""
    # Lift state machine
    lift_update = lift_fsm.update(fused)
    if lift_update:
        client.publish(TOPIC_LIFT_STATE, json.dumps(lift_update), qos=1)
        log.info("lift_state_published", state=lift_update["current_state"])
        scorer.process_state_update(TOPIC_LIFT_STATE, lift_update)

    # Engine state machine
    engine_update = engine_fsm.update(fused)
    if engine_update:
        client.publish(TOPIC_ENGINE_STATE, json.dumps(engine_update), qos=1)
        log.info("engine_state_published", state=engine_update["current_state"])
        scorer.process_state_update(TOPIC_ENGINE_STATE, engine_update)

    # Scorer: wind/overspeed from fused telemetry
    scorer.process_state_update(TOPIC_FUSED, fused)


def _process_cabin(client: mqtt.Client, cabin: dict) -> None:
    """Run operator FSM on cabin telemetry."""
    op_update = operator_fsm.update(cabin)
    if op_update:
        client.publish(TOPIC_OPERATOR_STATE, json.dumps(op_update), qos=1)
        log.info("operator_state_published", state=op_update["current_state"])
        scorer.process_state_update(TOPIC_OPERATOR_STATE, op_update)


def _process_checkin(client: mqtt.Client, payload: dict) -> None:
    """Handle operator check-in / check-out and publish shift score."""
    action = payload.get("action")
    if action == "check-in":
        scorer.start_shift()
        log.info("shift_started", crane_id=CRANE_ID)
    elif action == "check-out":
        if scorer.is_active:
            score_payload = scorer.to_mqtt_payload()
            client.publish(TOPIC_SHIFT_SCORE, json.dumps(score_payload), qos=1)
            scorer.end_shift()
            log.info("shift_score_published", score=score_payload["final_score"])
    else:
        log.warning("unknown_checkin_action", action=action)


# ---------------------------------------------------------------------------
# Health check
# ---------------------------------------------------------------------------
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        if self.path == "/health":
            body = json.dumps({
                "status": "ok",
                "service": "state-engine",
                "crane_id": CRANE_ID,
                "states": {
                    "lift": lift_fsm.state.value,
                    "operator": operator_fsm.state.value,
                    "engine": engine_fsm.state.value,
                },
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
    global _running, _client

    log.info("starting", crane_id=CRANE_ID)
    health_server = start_health_server()

    _client = create_mqtt_client(
        client_id=f"mosy-state-engine-{CRANE_ID}",
        on_connect=on_connect,
        on_message=on_message,
    )
    _client.loop_start()

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
        if _client:
            _client.loop_stop()
            _client.disconnect()
        health_server.shutdown()
        log.info("stopped")


if __name__ == "__main__":
    main()
