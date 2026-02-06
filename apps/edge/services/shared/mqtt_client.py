"""MOSY Edge — Shared MQTT connection factory (paho-mqtt 1.x).

Uses paho-mqtt 1.6.1 for compatibility with azure-iot-device SDK.
When azure-iot-device 3.x ships with paho-mqtt 2.x support, migrate to V2 API.
"""

from __future__ import annotations

import os
import time
from typing import Callable, Optional

import paho.mqtt.client as mqtt

from shared.logger import setup_logging

log = setup_logging("mqtt_client")


def create_mqtt_client(
    client_id: str,
    on_connect: Optional[Callable] = None,
    on_message: Optional[Callable] = None,
) -> mqtt.Client:
    """Create and connect a paho-mqtt 1.x client to the local Mosquitto broker."""
    broker = os.environ.get("MQTT_BROKER", "localhost")
    port = int(os.environ.get("MQTT_PORT", "1883"))

    client = mqtt.Client(
        client_id=client_id,
        protocol=mqtt.MQTTv311,
    )

    if on_connect:
        client.on_connect = on_connect
    if on_message:
        client.on_message = on_message

    client.reconnect_delay_set(min_delay=1, max_delay=60)

    connected = False
    retries = 0
    while not connected:
        try:
            client.connect(broker, port, keepalive=60)
            connected = True
            log.info("mqtt_connected", broker=broker, port=port, client_id=client_id)
        except (ConnectionRefusedError, OSError) as exc:
            retries += 1
            delay = min(2 ** retries, 30)
            log.warning(
                "mqtt_connect_retry",
                broker=broker,
                port=port,
                error=str(exc),
                retry_in=delay,
            )
            time.sleep(delay)

    return client
