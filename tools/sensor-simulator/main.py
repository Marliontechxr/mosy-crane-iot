#!/usr/bin/env python3
"""MOSY — Standalone Sensor Simulator for demos, testing, and development.

Publishes realistic crane telemetry to MQTT, simulating all sensors, OCR,
vision, and state machine outputs. Supports multiple pre-built scenarios
including a full 5-minute client demo cycle.

Usage:
    python main.py --scenario full-demo --crane-id DEMO-001
    python main.py --scenario overload --duration 60 --speed 2.0
    python main.py --scenario normal --broker 192.168.4.1
"""

from __future__ import annotations

import argparse
import json
import math
import os
import random
import signal
import sys
import time
from dataclasses import dataclass, field
from typing import Any

import paho.mqtt.client as mqtt

# ---------------------------------------------------------------------------
# Crane State — full physics model
# ---------------------------------------------------------------------------

@dataclass
class CraneState:
    """Simulated crane state with realistic transitions and physics."""

    # Boom
    boom_angle_deg: float = 45.0
    boom_length_m: float = 30.0
    hook_height_m: float = 12.0
    slew_angle_deg: float = 0.0
    tip_clearance_m: float = 17.0

    # Load
    load_kg: float = 0.0
    max_load_kg: float = 50000.0

    # Wind
    wind_speed_ms: float = 3.5
    wind_direction_deg: float = 180.0

    # Location
    latitude: float = 13.0827
    longitude: float = 80.2707

    # Engine
    engine_running: bool = False
    engine_temp_c: float = 25.0
    engine_rpm: float = 0.0

    # Operator
    operator_present: bool = False
    operator_ear: float = 0.32
    perclos: float = 0.05
    yawning: bool = False
    fatigue_state: str = "awake"
    joystick_pressure_kg: float = 0.0

    # Lift state
    lift_state: str = "idle"
    operator_state: str = "absent"
    engine_state: str = "off"

    # Internals
    _tick: int = field(default=0, repr=False)
    _lift_count: int = field(default=0, repr=False)
    _total_tonnage: float = field(default=0.0, repr=False)

    def tick(self) -> None:
        """Advance simulation one step with jitter."""
        self._tick += 1


# ---------------------------------------------------------------------------
# Scenarios — each is a function(state, elapsed_s, duration_s) → None
# ---------------------------------------------------------------------------

def scenario_normal(state: CraneState, elapsed: float, duration: float) -> None:
    """Normal operations: periodic lift cycles, moderate conditions."""
    cycle = (elapsed % 120) / 120.0  # 2-minute lift cycles

    state.engine_running = True
    state.engine_state = "running"
    state.engine_rpm = 1800 + random.gauss(0, 20)
    state.engine_temp_c = min(85, 45 + elapsed * 0.05 + random.gauss(0, 1))
    state.operator_present = True
    state.operator_state = "alert"
    state.joystick_pressure_kg = random.uniform(1.5, 4.0)

    # Lift cycle: ramp up → hold → ramp down → pause
    if cycle < 0.25:
        state.load_kg = (cycle / 0.25) * 20000
        state.lift_state = "loading"
        state.hook_height_m = 5.0 + (cycle / 0.25) * 10
    elif cycle < 0.5:
        state.load_kg = 20000 + random.gauss(0, 100)
        state.lift_state = "hoisting"
        state.hook_height_m = 15.0 + random.gauss(0, 0.2)
    elif cycle < 0.75:
        state.load_kg = 20000 * (1 - (cycle - 0.5) / 0.25)
        state.lift_state = "lowering"
        state.hook_height_m = 15.0 - ((cycle - 0.5) / 0.25) * 10
    else:
        state.load_kg = max(0, random.gauss(0, 50))
        state.lift_state = "idle"
        state.hook_height_m = 5.0

    if cycle < 0.01:
        state._lift_count += 1
        state._total_tonnage += 20.0

    state.boom_angle_deg = 45.0 + 3.0 * math.sin(elapsed * 0.1)
    state.slew_angle_deg = (state.slew_angle_deg + 0.3) % 360
    state.wind_speed_ms = max(0, 3.5 + 1.5 * math.sin(elapsed * 0.02) + random.gauss(0, 0.2))
    state.wind_direction_deg = (state.wind_direction_deg + random.gauss(0, 1)) % 360
    state.perclos = max(0, min(0.15, 0.05 + random.gauss(0, 0.01)))
    state.operator_ear = 0.32 + random.gauss(0, 0.02)
    state.fatigue_state = "awake"


def scenario_overload(state: CraneState, elapsed: float, duration: float) -> None:
    """Load approaches and exceeds safe limits."""
    scenario_normal(state, elapsed, duration)

    progress = elapsed / max(duration, 1)
    if progress < 0.3:
        state.load_kg = 30000 + progress * 30000
    elif progress < 0.6:
        state.load_kg = 39000 + (progress - 0.3) * 40000  # Hit 92%+
        state.lift_state = "hoisting"
    elif progress < 0.8:
        state.load_kg = max(20000, 46000 - (progress - 0.6) * 100000)  # Back off
        state.lift_state = "lowering"
    else:
        state.load_kg = 15000 + random.gauss(0, 200)
        state.lift_state = "idle"


def scenario_fatigue(state: CraneState, elapsed: float, duration: float) -> None:
    """Operator fatigue gradually increases."""
    scenario_normal(state, elapsed, duration)

    progress = elapsed / max(duration, 1)
    state.perclos = min(0.35, 0.05 + progress * 0.30)
    state.operator_ear = max(0.18, 0.32 - progress * 0.14)

    if state.perclos > 0.25:
        state.fatigue_state = "drowsy"
        state.yawning = random.random() < 0.2
    elif state.perclos > 0.15:
        state.fatigue_state = "fatigued"
        state.yawning = random.random() < 0.08
    else:
        state.fatigue_state = "awake"
        state.yawning = False


def scenario_wind_gust(state: CraneState, elapsed: float, duration: float) -> None:
    """Sudden wind gust event."""
    scenario_normal(state, elapsed, duration)

    progress = elapsed / max(duration, 1)
    if 0.3 < progress < 0.5:
        gust_factor = math.sin((progress - 0.3) / 0.2 * math.pi)
        state.wind_speed_ms = 5.0 + gust_factor * 15.0  # Peak ~20 m/s (72 km/h)
    elif 0.5 < progress < 0.7:
        state.wind_speed_ms = max(5, 20 - (progress - 0.5) / 0.2 * 15)


def scenario_ocr_failure(state: CraneState, elapsed: float, duration: float) -> None:
    """OCR system degrades (low confidence, then recovery)."""
    scenario_normal(state, elapsed, duration)
    # OCR confidence handled in build_ocr_telemetry via _ocr_degraded flag
    progress = elapsed / max(duration, 1)
    state._ocr_degraded = 0.3 < progress < 0.7  # type: ignore[attr-defined]


def scenario_disconnect(state: CraneState, elapsed: float, duration: float) -> None:
    """Simulates intermittent connection drops."""
    scenario_normal(state, elapsed, duration)
    progress = elapsed / max(duration, 1)
    # Publish will be skipped in main loop when _disconnected is True
    state._disconnected = 0.4 < progress < 0.6  # type: ignore[attr-defined]


def scenario_full_demo(state: CraneState, elapsed: float, duration: float) -> None:
    """Full 5-minute client demo — complete crane operation cycle.

    Timeline:
      0:00-0:30  Engine startup, safety check, operator check-in
      0:30-1:30  Normal lifting operations (3 lift cycles)
      1:30-2:00  Warning: load approaches 80%, wind picks up
      2:00-2:30  Critical: load hits 92%, alert, operator backs off
      2:30-3:30  Normal operations resume, productivity visible
      3:30-4:00  Fatigue: PERCLOS rises to 25% (drowsy warning)
      4:00-4:30  Break: operator checks out
      4:30-5:00  Operator returns, final lifts, shift checkout
    """
    t = elapsed

    # Phase 1: Engine startup (0:00-0:30)
    if t < 30:
        progress = t / 30
        state.engine_running = progress > 0.3
        state.engine_state = "off" if progress < 0.3 else "starting" if progress < 0.6 else "running"
        state.engine_rpm = 0 if progress < 0.3 else 800 + progress * 1200
        state.engine_temp_c = 25 + progress * 15
        state.operator_present = progress > 0.2
        state.operator_state = "absent" if progress < 0.2 else "present"
        state.joystick_pressure_kg = 0 if progress < 0.5 else random.uniform(1, 2)
        state.load_kg = 0
        state.lift_state = "idle"
        state.perclos = 0.04
        state.fatigue_state = "awake"
        state.boom_angle_deg = 0 + progress * 45
        state.wind_speed_ms = 2.5 + random.gauss(0, 0.3)

    # Phase 2: Normal lifting (0:30-1:30)
    elif t < 90:
        local_t = t - 30
        cycle = (local_t % 20) / 20.0  # 20-second micro-cycles (3 fits in 60s)
        state.engine_running = True
        state.engine_state = "running"
        state.engine_rpm = 1800 + random.gauss(0, 20)
        state.engine_temp_c = min(75, 40 + local_t * 0.3)
        state.operator_present = True
        state.operator_state = "alert"
        state.joystick_pressure_kg = random.uniform(2, 4)
        state.perclos = 0.05 + random.gauss(0, 0.01)
        state.fatigue_state = "awake"
        state.wind_speed_ms = 3.5 + random.gauss(0, 0.5)

        if cycle < 0.3:
            state.load_kg = (cycle / 0.3) * 18000
            state.lift_state = "loading"
            state.hook_height_m = 5 + (cycle / 0.3) * 10
        elif cycle < 0.6:
            state.load_kg = 18000 + random.gauss(0, 100)
            state.lift_state = "hoisting"
            state.hook_height_m = 15 + random.gauss(0, 0.3)
        elif cycle < 0.85:
            state.load_kg = 18000 * (1 - (cycle - 0.6) / 0.25)
            state.lift_state = "lowering"
            state.hook_height_m = 15 - ((cycle - 0.6) / 0.25) * 10
        else:
            state.load_kg = max(0, random.gauss(0, 30))
            state.lift_state = "idle"
            state.hook_height_m = 5

        if cycle < 0.01:
            state._lift_count += 1
            state._total_tonnage += 18.0

        state.boom_angle_deg = 45 + 5 * math.sin(local_t * 0.1)
        state.slew_angle_deg = (state.slew_angle_deg + 0.5) % 360

    # Phase 3: Warning — load 80%, wind picks up (1:30-2:00)
    elif t < 120:
        local_t = t - 90
        progress = local_t / 30.0
        state.engine_running = True
        state.engine_state = "running"
        state.engine_rpm = 1900 + random.gauss(0, 30)
        state.operator_present = True
        state.operator_state = "alert"
        state.joystick_pressure_kg = random.uniform(2.5, 4.5)
        state.perclos = 0.06
        state.fatigue_state = "awake"

        state.load_kg = 30000 + progress * 10000  # 60% → 80%
        state.lift_state = "hoisting"
        state.hook_height_m = 12 + progress * 3
        state.wind_speed_ms = 4.0 + progress * 2.5  # ~6.5 m/s = ~23 km/h
        state.boom_angle_deg = 50 + 3 * math.sin(local_t * 0.15)

    # Phase 4: Critical — load 92%, alert (2:00-2:30)
    elif t < 150:
        local_t = t - 120
        progress = local_t / 30.0
        state.engine_running = True
        state.engine_state = "running"
        state.operator_present = True
        state.operator_state = "alert"
        state.fatigue_state = "awake"
        state.perclos = 0.07

        if progress < 0.4:
            # Load climbs to 92%
            state.load_kg = 40000 + progress * 15000  # 80% → 92%
            state.lift_state = "hoisting"
            state.joystick_pressure_kg = random.uniform(3, 5)
        else:
            # Operator backs off
            state.load_kg = max(20000, 46000 - (progress - 0.4) * 60000)
            state.lift_state = "lowering"
            state.joystick_pressure_kg = random.uniform(1, 2)
            state.hook_height_m = max(5, 15 - (progress - 0.4) * 15)

        state.wind_speed_ms = 6.0 + random.gauss(0, 0.5)
        state.boom_angle_deg = 52 - progress * 5

    # Phase 5: Resume normal ops (2:30-3:30)
    elif t < 210:
        local_t = t - 150
        cycle = (local_t % 20) / 20.0
        state.engine_running = True
        state.engine_state = "running"
        state.engine_rpm = 1800 + random.gauss(0, 15)
        state.operator_present = True
        state.operator_state = "alert"
        state.joystick_pressure_kg = random.uniform(2, 3.5)
        state.perclos = 0.06 + random.gauss(0, 0.01)
        state.fatigue_state = "awake"
        state.wind_speed_ms = 3.0 + random.gauss(0, 0.4)

        if cycle < 0.3:
            state.load_kg = (cycle / 0.3) * 15000
            state.lift_state = "loading"
        elif cycle < 0.6:
            state.load_kg = 15000 + random.gauss(0, 80)
            state.lift_state = "hoisting"
        elif cycle < 0.85:
            state.load_kg = 15000 * (1 - (cycle - 0.6) / 0.25)
            state.lift_state = "lowering"
        else:
            state.load_kg = max(0, random.gauss(0, 30))
            state.lift_state = "idle"

        if cycle < 0.01:
            state._lift_count += 1
            state._total_tonnage += 15.0

        state.boom_angle_deg = 45 + 3 * math.sin(local_t * 0.08)
        state.hook_height_m = 5 + 10 * max(0, min(1, cycle / 0.5))

    # Phase 6: Fatigue simulation (3:30-4:00)
    elif t < 240:
        local_t = t - 210
        progress = local_t / 30.0
        state.engine_running = True
        state.engine_state = "running"
        state.operator_present = True
        state.joystick_pressure_kg = random.uniform(1, 2.5)
        state.wind_speed_ms = 3.0 + random.gauss(0, 0.3)

        state.perclos = 0.08 + progress * 0.17  # Rise to ~25%
        state.operator_ear = max(0.20, 0.32 - progress * 0.10)
        state.yawning = progress > 0.5 and random.random() < 0.15
        state.fatigue_state = "fatigued" if progress < 0.6 else "drowsy"
        state.operator_state = "present" if progress < 0.4 else "fatigued"

        state.load_kg = 10000 + random.gauss(0, 200)
        state.lift_state = "hoisting"
        state.boom_angle_deg = 43 + random.gauss(0, 1)

    # Phase 7: Break period (4:00-4:30)
    elif t < 270:
        local_t = t - 240
        progress = local_t / 30.0
        state.operator_present = progress < 0.1
        state.operator_state = "absent"
        state.joystick_pressure_kg = 0
        state.engine_running = True
        state.engine_state = "idle"
        state.engine_rpm = 800 + random.gauss(0, 10)
        state.load_kg = 0
        state.lift_state = "idle"
        state.hook_height_m = 3
        state.perclos = 0
        state.fatigue_state = "awake"
        state.yawning = False
        state.wind_speed_ms = 2.5 + random.gauss(0, 0.3)

    # Phase 8: Return, final lifts, checkout (4:30-5:00)
    else:
        local_t = t - 270
        progress = local_t / 30.0
        state.operator_present = True
        state.operator_state = "alert"
        state.engine_running = True
        state.engine_state = "running"
        state.engine_rpm = 1800 + random.gauss(0, 15)
        state.joystick_pressure_kg = random.uniform(2, 3)
        state.perclos = 0.04 + random.gauss(0, 0.005)
        state.fatigue_state = "awake"
        state.yawning = False
        state.wind_speed_ms = 3.0 + random.gauss(0, 0.3)

        if progress < 0.6:
            cycle = (local_t % 10) / 10.0
            if cycle < 0.4:
                state.load_kg = (cycle / 0.4) * 12000
                state.lift_state = "loading"
            elif cycle < 0.7:
                state.load_kg = 12000 + random.gauss(0, 50)
                state.lift_state = "hoisting"
            else:
                state.load_kg = max(0, 12000 * (1 - (cycle - 0.7) / 0.3))
                state.lift_state = "lowering"

            if cycle < 0.01:
                state._lift_count += 1
                state._total_tonnage += 12.0
        else:
            # Shutdown
            shutdown = (progress - 0.6) / 0.4
            state.load_kg = 0
            state.lift_state = "idle"
            state.boom_angle_deg = max(0, 45 - shutdown * 45)
            state.engine_rpm = max(0, 1800 - shutdown * 1800)
            state.engine_running = shutdown < 0.8
            state.engine_state = "running" if shutdown < 0.5 else "stopping" if shutdown < 0.8 else "off"
            state.operator_present = shutdown < 0.9
            state.operator_state = "present" if shutdown < 0.9 else "absent"

    # Common updates
    state.load_kg = max(0, state.load_kg)
    state.tip_clearance_m = state.hook_height_m + 5.0


SCENARIOS = {
    "normal": scenario_normal,
    "overload": scenario_overload,
    "fatigue": scenario_fatigue,
    "wind-gust": scenario_wind_gust,
    "ocr-failure": scenario_ocr_failure,
    "disconnect": scenario_disconnect,
    "full-demo": scenario_full_demo,
}


# ---------------------------------------------------------------------------
# MQTT Payload Builders
# ---------------------------------------------------------------------------

def build_boom_telemetry(state: CraneState, crane_id: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/telemetry/boom payload."""
    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "boom_angle_deg": round(state.boom_angle_deg, 2),
        "boom_length_m": round(state.boom_length_m, 2),
        "hook_height_m": round(state.hook_height_m, 2),
        "slew_angle_deg": round(state.slew_angle_deg, 2),
        "wind_speed_ms": round(state.wind_speed_ms, 2),
        "wind_direction_deg": round(state.wind_direction_deg, 1),
        "tip_clearance_m": round(state.tip_clearance_m, 2),
        "lidar_distance_cm": int(state.hook_height_m * 100),
        "imu_pitch": round(state.boom_angle_deg, 2),
        "imu_roll": round(random.gauss(0, 0.5), 2),
        "imu_yaw": round(state.slew_angle_deg, 2),
        "accelerometer_mg": round(1000 + random.gauss(0, 15) if state.engine_running else random.gauss(0, 2), 1),
    }


def build_cabin_telemetry(state: CraneState, crane_id: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/telemetry/cabin payload."""
    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "latitude": state.latitude + random.gauss(0, 0.00001),
        "longitude": state.longitude + random.gauss(0, 0.00001),
        "gps_speed_kmh": 0.0,
        "gps_heading_deg": 0.0,
        "gps_fix": True,
        "gps_satellites": 12 + random.randint(-2, 2),
        "cabin_pitch": round(random.gauss(0, 0.3), 2),
        "cabin_roll": round(random.gauss(0, 0.3), 2),
        "cabin_yaw": round(state.slew_angle_deg, 2),
        "cabin_temp_c": round(32 + random.gauss(0, 0.5), 1),
        "engine_vibration": state.engine_running,
        "engine_rpm": round(state.engine_rpm, 0),
        "engine_temp_c": round(state.engine_temp_c, 1),
        "joystick_pressure_kg": round(state.joystick_pressure_kg, 2),
    }


def build_ocr_telemetry(state: CraneState, crane_id: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/telemetry/ocr payload."""
    load_pct = (state.load_kg / state.max_load_kg) * 100
    degraded = getattr(state, "_ocr_degraded", False)
    base_conf = random.uniform(0.3, 0.5) if degraded else random.uniform(0.88, 0.98)

    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "source": "dashboard_ocr",
        "confidence": round(base_conf, 3),
        "gauges": {
            "load_percentage": {
                "value": round(load_pct, 1),
                "unit": "%",
                "confidence": round(base_conf + random.gauss(0, 0.02), 3),
                "type": "digital",
            },
            "boom_angle": {
                "value": round(state.boom_angle_deg, 1),
                "unit": "degrees",
                "confidence": round(base_conf + random.gauss(0, 0.01), 3),
                "type": "digital",
            },
            "boom_length": {
                "value": round(state.boom_length_m, 1),
                "unit": "meters",
                "confidence": round(base_conf + random.gauss(0, 0.02), 3),
                "type": "digital",
            },
            "wind_speed": {
                "value": round(state.wind_speed_ms * 3.6, 1),
                "unit": "km/h",
                "confidence": round(base_conf + random.gauss(0, 0.03), 3),
                "type": "digital",
            },
            "max_load": {
                "value": round(state.max_load_kg, 0),
                "unit": "kg",
                "confidence": round(base_conf + random.gauss(0, 0.01), 3),
                "type": "digital",
            },
        },
        "frame_quality": round(random.uniform(0.3, 0.5) if degraded else random.uniform(0.75, 0.95), 3),
    }


def build_boom_vision(state: CraneState, crane_id: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/vision/boom payload."""
    has_load = state.load_kg > 500
    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "scene_description": f"Crane boom at {state.boom_angle_deg:.0f}° with {'load attached' if has_load else 'no load'}",
        "detections": [
            {
                "class_id": "steel_beam" if has_load else "hook",
                "confidence": round(random.uniform(0.8, 0.95), 3),
                "bounding_box": {"x": 0.3, "y": 0.4, "w": 0.4, "h": 0.3},
            }
        ] if has_load else [],
        "personnel_detected": random.random() < 0.15,
        "personnel_in_danger_zone": False,
        "obstruction_detected": False,
    }


def build_cabin_vision(state: CraneState, crane_id: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/vision/cabin payload."""
    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "operator_detected": state.operator_present,
        "ear_left": round(state.operator_ear + random.gauss(0, 0.02), 3),
        "ear_right": round(state.operator_ear + random.gauss(0, 0.02), 3),
        "ear_avg": round(state.operator_ear, 3),
        "mar": round(0.45 if state.yawning else 0.20 + random.gauss(0, 0.03), 3),
        "perclos": round(state.perclos, 3),
        "fatigue_state": state.fatigue_state,
        "yawning": state.yawning,
    }


def build_state_update(state: CraneState, crane_id: str, state_type: str) -> dict[str, Any]:
    """Build mosy/{crane_id}/state/{type} payload."""
    value = getattr(state, f"{state_type}_state", "unknown")
    return {
        "crane_id": crane_id,
        "timestamp": time.time(),
        "state_type": state_type,
        "state": value,
        "previous_state": value,
    }


# ---------------------------------------------------------------------------
# Main Simulator
# ---------------------------------------------------------------------------

class SensorSimulator:
    """Publishes simulated sensor data to MQTT."""

    def __init__(self, broker: str, port: int, crane_id: str) -> None:
        self.crane_id = crane_id
        self.broker = broker
        self.port = port
        self.state = CraneState()
        self.client = mqtt.Client(client_id=f"mosy-simulator-{crane_id}", clean_session=True)
        self._running = False
        self._prev_states: dict[str, str] = {}

    def connect(self) -> None:
        """Connect to MQTT broker."""
        self.client.connect(self.broker, self.port, keepalive=60)
        self.client.loop_start()
        print(f"  Connected to MQTT broker at {self.broker}:{self.port}")

    def publish_tick(self, elapsed: float) -> None:
        """Publish one full cycle of telemetry."""
        cid = self.crane_id
        disconnected = getattr(self.state, "_disconnected", False)
        if disconnected:
            return

        # Boom telemetry (10 Hz — publish every tick)
        self.client.publish(
            f"mosy/{cid}/telemetry/boom",
            json.dumps(build_boom_telemetry(self.state, cid)),
            qos=0,
        )

        # Cabin telemetry (10 Hz)
        self.client.publish(
            f"mosy/{cid}/telemetry/cabin",
            json.dumps(build_cabin_telemetry(self.state, cid)),
            qos=0,
        )

        # OCR (5 Hz — every 2nd tick at 10 Hz)
        if self.state._tick % 2 == 0:
            self.client.publish(
                f"mosy/{cid}/telemetry/ocr",
                json.dumps(build_ocr_telemetry(self.state, cid)),
                qos=1,
            )

        # Boom vision (2 Hz — every 5th tick)
        if self.state._tick % 5 == 0:
            self.client.publish(
                f"mosy/{cid}/vision/boom",
                json.dumps(build_boom_vision(self.state, cid)),
                qos=0,
            )

        # Cabin vision / PERCLOS (2 Hz)
        if self.state._tick % 5 == 0:
            self.client.publish(
                f"mosy/{cid}/vision/cabin",
                json.dumps(build_cabin_vision(self.state, cid)),
                qos=0,
            )

        # State updates — only on change
        for st in ("lift", "operator", "engine"):
            current = getattr(self.state, f"{st}_state")
            prev = self._prev_states.get(st)
            if current != prev:
                self.client.publish(
                    f"mosy/{cid}/state/{st}",
                    json.dumps(build_state_update(self.state, cid, st)),
                    qos=1,
                )
                self._prev_states[st] = current

    def run(
        self,
        scenario_fn: Any,
        duration: float,
        speed: float = 1.0,
    ) -> int:
        """Run simulation. duration=0 means infinite loop."""
        self._running = True
        tick_count = 0
        start = time.time()
        interval = 0.1 / speed  # Base 10 Hz, speed multiplier

        while self._running:
            wall_elapsed = time.time() - start
            sim_elapsed = wall_elapsed * speed

            if duration > 0 and sim_elapsed >= duration:
                break

            scenario_fn(self.state, sim_elapsed, duration if duration > 0 else 300)
            self.state.tick()
            self.publish_tick(sim_elapsed)
            tick_count += 1

            time.sleep(max(0.01, interval))

        return tick_count

    def stop(self) -> None:
        """Stop simulator and disconnect."""
        self._running = False
        self.client.loop_stop()
        self.client.disconnect()


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main() -> None:
    """Parse args and run the sensor simulator."""
    parser = argparse.ArgumentParser(
        description="MOSY Sensor Simulator — publish realistic crane telemetry to MQTT",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python main.py --scenario full-demo
  python main.py --scenario overload --crane-id CRANE-001 --duration 120
  python main.py --scenario normal --speed 2.0 --broker 192.168.4.1
  python main.py --scenario full-demo --duration 0  (infinite loop)
        """,
    )
    parser.add_argument("--crane-id", default="DEMO-001", help="Crane identifier (default: DEMO-001)")
    parser.add_argument("--broker", default="localhost", help="MQTT broker host (default: localhost)")
    parser.add_argument("--port", type=int, default=1883, help="MQTT broker port (default: 1883)")
    parser.add_argument("--duration", type=float, default=300, help="Duration in seconds (0 = infinite)")
    parser.add_argument(
        "--scenario",
        choices=list(SCENARIOS.keys()),
        default="normal",
        help="Simulation scenario (default: normal)",
    )
    parser.add_argument("--speed", type=float, default=1.0, help="Time multiplier (2.0 = 2x speed)")
    args = parser.parse_args()

    scenario_fn = SCENARIOS[args.scenario]

    print("=" * 60)
    print("  MOSY Sensor Simulator")
    print("=" * 60)
    print(f"  Crane ID:  {args.crane_id}")
    print(f"  Broker:    {args.broker}:{args.port}")
    print(f"  Scenario:  {args.scenario}")
    print(f"  Duration:  {'infinite' if args.duration == 0 else f'{args.duration}s'}")
    print(f"  Speed:     {args.speed}x")
    print("=" * 60)

    sim = SensorSimulator(broker=args.broker, port=args.port, crane_id=args.crane_id)

    # Graceful shutdown on Ctrl+C
    def _signal_handler(sig: int, frame: Any) -> None:
        print("\n  Stopping simulator...")
        sim.stop()

    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    sim.connect()
    print(f"  Simulating...")
    print()

    ticks = sim.run(scenario_fn=scenario_fn, duration=args.duration, speed=args.speed)
    sim.stop()

    print()
    print(f"  Simulation complete: {ticks} ticks")
    print(f"  Lifts completed: {sim.state._lift_count}")
    print(f"  Total tonnage: {sim.state._total_tonnage:.1f}t")


if __name__ == "__main__":
    main()
