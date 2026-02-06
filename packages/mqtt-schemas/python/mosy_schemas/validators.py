"""MOSY MQTT Message Validators — runtime validation for Python edge services."""

from __future__ import annotations

import json
from dataclasses import fields
from typing import Any, Dict, Type, TypeVar

from mosy_schemas.mqtt_types import (
    AlertMessage,
    BoomTelemetry,
    CabinTelemetry,
    CalibrationUpdate,
    CommandMessage,
    DashboardOCR,
    DiagnosticMessage,
    EngineStateUpdate,
    FusedTelemetry,
    LiftStateUpdate,
    OperatorStateUpdate,
)

T = TypeVar("T")

TOPIC_SCHEMA_MAP: Dict[str, Type[Any]] = {
    "telemetry/boom": BoomTelemetry,
    "telemetry/cabin": CabinTelemetry,
    "telemetry/ocr": DashboardOCR,
    "telemetry/fused": FusedTelemetry,
    "alerts/info": AlertMessage,
    "alerts/warning": AlertMessage,
    "alerts/critical": AlertMessage,
    "state/lift": LiftStateUpdate,
    "state/operator": OperatorStateUpdate,
    "state/engine": EngineStateUpdate,
    "config/calibration": CalibrationUpdate,
    "commands/esp32": CommandMessage,
    "commands/rpi5": CommandMessage,
    "commands/jetson": CommandMessage,
}


class ValidationError(Exception):
    """Raised when MQTT message validation fails."""

    def __init__(self, topic_suffix: str, errors: list[str]) -> None:
        self.topic_suffix = topic_suffix
        self.errors = errors
        super().__init__(f"Validation failed for {topic_suffix}: {'; '.join(errors)}")


def _validate_required_fields(data: dict[str, Any], cls: Type[Any]) -> list[str]:
    """Check that all required fields of a dataclass are present in the data dict."""
    errors: list[str] = []
    for f in fields(cls):
        if f.name not in data and f.default is f.default_factory:  # type: ignore[attr-defined]
            errors.append(f"Missing required field: {f.name}")
    return errors


def validate_mqtt_message(topic_suffix: str, payload: bytes | str | dict[str, Any]) -> dict[str, Any]:
    """
    Validate an MQTT message payload against the expected schema.

    Args:
        topic_suffix: Topic suffix after mosy/{crane_id}/ (e.g., "telemetry/boom")
        payload: Raw bytes, JSON string, or parsed dict

    Returns:
        The parsed and validated payload as a dict.

    Raises:
        ValidationError: If validation fails.
        ValueError: If topic suffix has no registered schema.
    """
    schema_cls = TOPIC_SCHEMA_MAP.get(topic_suffix)
    if schema_cls is None:
        raise ValueError(f"No schema registered for topic suffix: {topic_suffix}")

    # Parse payload
    if isinstance(payload, bytes):
        try:
            data = json.loads(payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise ValidationError(topic_suffix, [f"Invalid JSON: {exc}"]) from exc
    elif isinstance(payload, str):
        try:
            data = json.loads(payload)
        except json.JSONDecodeError as exc:
            raise ValidationError(topic_suffix, [f"Invalid JSON: {exc}"]) from exc
    else:
        data = payload

    if not isinstance(data, dict):
        raise ValidationError(topic_suffix, ["Payload must be a JSON object"])

    # Validate required fields
    errors = _validate_required_fields(data, schema_cls)
    if errors:
        raise ValidationError(topic_suffix, errors)

    # Validate common fields
    if "timestamp" in data and not isinstance(data["timestamp"], (int, float)):
        errors.append("timestamp must be a number")
    if "crane_id" in data and not isinstance(data["crane_id"], str):
        errors.append("crane_id must be a string")

    if errors:
        raise ValidationError(topic_suffix, errors)

    return data
