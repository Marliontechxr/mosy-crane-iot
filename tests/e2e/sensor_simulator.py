"""MOSY — Sensor Simulator for E2E Testing.

Publishes realistic telemetry to MQTT topics that the edge services consume.
Simulates boom, cabin, and OCR sensors at configurable rates.
"""

from __future__ import annotations

import json
import math
import os
import random
import time
from dataclasses import dataclass, field
from typing import Any

import paho.mqtt.client as mqtt

MQTT_BROKER = os.environ.get("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.environ.get("MQTT_PORT", "1883"))
CRANE_ID = os.environ.get("CRANE_ID", "POC-001")


@dataclass
class CraneState:
    """Simulated crane state with gradual transitions."""

    boom_angle: float = 45.0
    boom_length: float = 30.0
    hook_height: float = 12.0
    load_kg: float = 0.0
    max_load_kg: float = 50000.0
    wind_speed_ms: float = 3.5
    wind_direction_deg: float = 180.0
    slew_angle: float = 0.0
    latitude: float = 13.0827
    longitude: float = 80.2707
    engine_running: bool = True
    operator_present: bool = True
    operator_ear: float = 0.32  # Eye Aspect Ratio (awake)
    _tick: int = field(default=0, repr=False)

    def tick(self) -> None:
        """Advance simulation by one step with realistic jitter."""
        self._tick += 1

        # Boom oscillates gently
        self.boom_angle = 45.0 + 5.0 * math.sin(self._tick * 0.05)

        # Load ramps up, holds, then ramps down (simulates lift cycle)
        cycle_pos = (self._tick % 600) / 600.0
        if cycle_pos < 0.2:
            self.load_kg = (cycle_pos / 0.2) * 25000
        elif cycle_pos < 0.6:
            self.load_kg = 25000 + random.gauss(0, 200)
        elif cycle_pos < 0.8:
            self.load_kg = 25000 * (1 - (cycle_pos - 0.6) / 0.2)
        else:
            self.load_kg = random.gauss(0, 50)
        self.load_kg = max(0, self.load_kg)

        # Wind varies realistically
        self.wind_speed_ms = max(
            0, 3.5 + 2.0 * math.sin(self._tick * 0.01) + random.gauss(0, 0.3)
        )
        self.wind_direction_deg = (self.wind_direction_deg + random.gauss(0, 2)) % 360

        # Slew rotates slowly
        self.slew_angle = (self.slew_angle + 0.2) % 360

        # Hook height varies with load
        if self.load_kg > 1000:
            self.hook_height = 12.0 + 3.0 * math.sin(self._tick * 0.03)
        else:
            self.hook_height = 15.0


def build_boom_telemetry(state: CraneState) -> dict[str, Any]:
    """Build BoomTelemetry MQTT payload."""
    return {
        "crane_id": CRANE_ID,
        "timestamp": time.time(),
        "boom_angle_deg": round(state.boom_angle, 2),
        "boom_length_m": round(state.boom_length, 2),
        "hook_height_m": round(state.hook_height, 2),
        "slew_angle_deg": round(state.slew_angle, 2),
        "wind_speed_ms": round(state.wind_speed_ms, 2),
        "wind_direction_deg": round(state.wind_direction_deg, 1),
        "tip_clearance_m": round(state.hook_height + 5.0, 2),
        "lidar_distance_cm": int(state.hook_height * 100),
        "imu_pitch": round(state.boom_angle, 2),
        "imu_roll": round(random.gauss(0, 0.5), 2),
        "imu_yaw": round(state.slew_angle, 2),
        "accelerometer_mg": round(random.gauss(1000, 20), 1),
    }


def build_cabin_telemetry(state: CraneState) -> dict[str, Any]:
    """Build CabinTelemetry MQTT payload."""
    return {
        "crane_id": CRANE_ID,
        "timestamp": time.time(),
        "latitude": state.latitude + random.gauss(0, 0.00001),
        "longitude": state.longitude + random.gauss(0, 0.00001),
        "gps_speed_kmh": 0.0,
        "gps_heading_deg": 0.0,
        "gps_fix": True,
        "gps_satellites": 12,
        "cabin_pitch": round(random.gauss(0, 0.3), 2),
        "cabin_roll": round(random.gauss(0, 0.3), 2),
        "cabin_yaw": round(state.slew_angle, 2),
        "cabin_temp_c": round(32.0 + random.gauss(0, 0.5), 1),
        "engine_vibration": state.engine_running,
        "joystick_pressure_kg": round(random.uniform(1.5, 4.0), 2)
        if state.operator_present
        else 0.0,
    }


def build_ocr_telemetry(state: CraneState) -> dict[str, Any]:
    """Build DashboardOCR MQTT payload."""
    load_pct = (state.load_kg / state.max_load_kg) * 100
    return {
        "crane_id": CRANE_ID,
        "timestamp": time.time(),
        "source": "dashboard_ocr",
        "confidence": round(random.uniform(0.85, 0.98), 3),
        "gauges": {
            "load_percentage": {
                "value": round(load_pct, 1),
                "unit": "%",
                "confidence": round(random.uniform(0.88, 0.97), 3),
                "type": "digital",
            },
            "boom_angle": {
                "value": round(state.boom_angle, 1),
                "unit": "degrees",
                "confidence": round(random.uniform(0.90, 0.98), 3),
                "type": "digital",
            },
            "boom_length": {
                "value": round(state.boom_length, 1),
                "unit": "meters",
                "confidence": round(random.uniform(0.88, 0.96), 3),
                "type": "digital",
            },
            "wind_speed": {
                "value": round(state.wind_speed_ms * 3.6, 1),
                "unit": "km/h",
                "confidence": round(random.uniform(0.82, 0.95), 3),
                "type": "digital",
            },
            "max_load": {
                "value": round(state.max_load_kg, 0),
                "unit": "kg",
                "confidence": round(random.uniform(0.90, 0.98), 3),
                "type": "digital",
            },
        },
        "frame_quality": round(random.uniform(0.7, 0.95), 3),
    }


def build_cabin_vision(state: CraneState) -> dict[str, Any]:
    """Build CabinCameraInference MQTT payload (PERCLOS)."""
    return {
        "crane_id": CRANE_ID,
        "timestamp": time.time(),
        "operator_detected": state.operator_present,
        "ear_left": round(state.operator_ear + random.gauss(0, 0.02), 3),
        "ear_right": round(state.operator_ear + random.gauss(0, 0.02), 3),
        "ear_avg": round(state.operator_ear, 3),
        "mar": round(0.35 + random.gauss(0, 0.05), 3),
        "perclos": round(random.uniform(0.05, 0.12), 3),
        "fatigue_state": "awake",
        "yawning": False,
    }


class SensorSimulator:
    """Publishes simulated sensor data to MQTT for E2E testing."""

    def __init__(
        self,
        broker: str = MQTT_BROKER,
        port: int = MQTT_PORT,
        crane_id: str = CRANE_ID,
    ) -> None:
        self.crane_id = crane_id
        self.state = CraneState()
        self.client = mqtt.Client(
            client_id=f"e2e-simulator-{crane_id}", clean_session=True
        )
        self.client.connect(broker, port, keepalive=30)
        self.client.loop_start()
        self._running = False

    def publish_once(self) -> None:
        """Publish one cycle of all sensor telemetry."""
        self.state.tick()

        # Boom telemetry (10 Hz in real life, 1 Hz for tests)
        self.client.publish(
            f"mosy/{self.crane_id}/telemetry/boom",
            json.dumps(build_boom_telemetry(self.state)),
            qos=0,
        )

        # Cabin telemetry
        self.client.publish(
            f"mosy/{self.crane_id}/telemetry/cabin",
            json.dumps(build_cabin_telemetry(self.state)),
            qos=0,
        )

        # OCR telemetry (slower rate)
        if self.state._tick % 3 == 0:
            self.client.publish(
                f"mosy/{self.crane_id}/telemetry/ocr",
                json.dumps(build_ocr_telemetry(self.state)),
                qos=1,
            )

        # Cabin vision (PERCLOS)
        if self.state._tick % 5 == 0:
            self.client.publish(
                f"mosy/{self.crane_id}/vision/cabin",
                json.dumps(build_cabin_vision(self.state)),
                qos=0,
            )

    def run(self, duration_s: int = 30, interval_s: float = 0.1) -> int:
        """Run simulator for specified duration. Returns number of ticks."""
        self._running = True
        tick_count = 0
        end_time = time.time() + duration_s
        while self._running and time.time() < end_time:
            self.publish_once()
            tick_count += 1
            time.sleep(interval_s)
        return tick_count

    def stop(self) -> None:
        """Stop the simulator."""
        self._running = False
        self.client.loop_stop()
        self.client.disconnect()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="MOSY Sensor Simulator")
    parser.add_argument("--duration", type=int, default=60, help="Run duration (s)")
    parser.add_argument("--interval", type=float, default=0.1, help="Tick interval (s)")
    parser.add_argument("--broker", default=MQTT_BROKER, help="MQTT broker host")
    parser.add_argument("--port", type=int, default=MQTT_PORT, help="MQTT broker port")
    args = parser.parse_args()

    sim = SensorSimulator(broker=args.broker, port=args.port)
    print(f"Simulating crane {CRANE_ID} for {args.duration}s at {args.interval}s intervals")
    ticks = sim.run(duration_s=args.duration, interval_s=args.interval)
    sim.stop()
    print(f"Completed {ticks} ticks")
