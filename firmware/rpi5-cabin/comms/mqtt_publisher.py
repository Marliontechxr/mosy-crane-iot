"""
MQTT publisher — connects to Jetson Mosquitto broker.
Blueprint Section 8 — paho-mqtt 2.1.0, publishes cabin telemetry at 10Hz.
"""
from __future__ import annotations

import json
import logging
import time
from dataclasses import dataclass
from typing import Any, Optional

import paho.mqtt.client as mqtt

logger = logging.getLogger(__name__)


@dataclass
class MqttConfig:
    """MQTT connection configuration."""
    broker: str = "192.168.4.1"
    port: int = 1883
    topic: str = "mosy/{crane_id}/telemetry/cabin"
    keepalive: int = 60
    reconnect_delay: int = 5
    crane_id: str = "CRANE-001"
    client_id: str = "cabin-hub-001"


class CabinMqttPublisher:
    """MQTT publisher for cabin telemetry data."""

    def __init__(self, config: MqttConfig) -> None:
        self._config = config
        self._topic = config.topic.replace("{crane_id}", config.crane_id)
        self._client: Optional[mqtt.Client] = None
        self._connected = False
        self._sequence = 0

    def init(self) -> bool:
        """Initialize MQTT client and connect to broker."""
        try:
            self._client = mqtt.Client(
                callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
                client_id=self._config.client_id,
                protocol=mqtt.MQTTv311,
            )

            self._client.on_connect = self._on_connect
            self._client.on_disconnect = self._on_disconnect
            self._client.reconnect_delay_set(
                min_delay=1,
                max_delay=self._config.reconnect_delay,
            )

            self._client.connect(
                self._config.broker,
                self._config.port,
                keepalive=self._config.keepalive,
            )
            self._client.loop_start()

            logger.info("MQTT connecting to %s:%d", self._config.broker, self._config.port)
            return True

        except Exception as e:
            logger.error("MQTT init failed: %s", e)
            return False

    def _on_connect(
        self, client: mqtt.Client, userdata: Any,
        flags: Any, rc: Any, properties: Any = None,
    ) -> None:
        """MQTT connection callback."""
        if hasattr(rc, 'value'):
            rc_val = rc.value
        else:
            rc_val = rc
        if rc_val == 0:
            self._connected = True
            logger.info("MQTT connected to %s", self._config.broker)
        else:
            logger.error("MQTT connect failed with code: %s", rc)

    def _on_disconnect(
        self, client: mqtt.Client, userdata: Any,
        flags: Any = None, rc: Any = None, properties: Any = None,
    ) -> None:
        """MQTT disconnect callback."""
        self._connected = False
        logger.warning("MQTT disconnected (rc=%s)", rc)

    def publish(self, payload: dict) -> bool:
        """
        Publish cabin telemetry payload as JSON.

        Args:
            payload: Dictionary matching CabinTelemetry schema.

        Returns:
            True if published successfully.
        """
        if self._client is None or not self._connected:
            return False

        try:
            self._sequence += 1
            payload["sequence"] = self._sequence
            payload["timestamp"] = int(time.time() * 1000)
            payload["crane_id"] = self._config.crane_id

            msg = json.dumps(payload, separators=(",", ":"))
            result = self._client.publish(self._topic, msg, qos=0)
            return result.rc == mqtt.MQTT_ERR_SUCCESS

        except Exception as e:
            logger.error("MQTT publish failed: %s", e)
            return False

    @property
    def is_connected(self) -> bool:
        """Check if MQTT is currently connected."""
        return self._connected

    def close(self) -> None:
        """Disconnect and clean up MQTT client."""
        if self._client:
            self._client.loop_stop()
            self._client.disconnect()
            self._client = None
            self._connected = False
            logger.info("MQTT client closed")
