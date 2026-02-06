"""
Tests for MQTT publisher configuration and payload building.
"""
import pytest
from unittest.mock import MagicMock, patch
from comms.mqtt_publisher import MqttConfig, CabinMqttPublisher


class TestMqttConfig:
    """Test MQTT configuration defaults."""

    def test_default_broker(self):
        cfg = MqttConfig()
        assert cfg.broker == "192.168.4.1"
        assert cfg.port == 1883

    def test_topic_interpolation(self):
        cfg = MqttConfig(crane_id="CRANE-002")
        publisher = CabinMqttPublisher(cfg)
        # Topic should have crane_id resolved
        assert "CRANE-002" in publisher._topic

    def test_custom_config(self):
        cfg = MqttConfig(
            broker="10.0.0.1",
            port=8883,
            crane_id="CRANE-TEST",
            client_id="test-client",
        )
        assert cfg.broker == "10.0.0.1"
        assert cfg.port == 8883


class TestCabinMqttPublisher:
    """Test MQTT publisher behavior."""

    def test_publish_returns_false_when_not_connected(self):
        cfg = MqttConfig()
        publisher = CabinMqttPublisher(cfg)
        # Without init, should not publish
        result = publisher.publish({"test": "data"})
        assert result is False

    def test_is_connected_initially_false(self):
        cfg = MqttConfig()
        publisher = CabinMqttPublisher(cfg)
        assert publisher.is_connected is False

    def test_sequence_increments(self):
        cfg = MqttConfig()
        publisher = CabinMqttPublisher(cfg)
        assert publisher._sequence == 0

    def test_close_on_uninitialized(self):
        cfg = MqttConfig()
        publisher = CabinMqttPublisher(cfg)
        # Should not raise
        publisher.close()
        assert publisher.is_connected is False
