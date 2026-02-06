"""
main.py — MOSY RPi 5 Cabin Hub entry point.
Blueprint Section 8 — async event loop managing all cabin sensors.

Architecture:
  - 10Hz sensor polling loop (IMU, vibration, GPS, joystick)
  - 5 FPS camera capture in background thread
  - MQTT publishing to Jetson Mosquitto broker
  - Shift tracking with local JSON persistence
"""
from __future__ import annotations

import logging
import signal
import sys
import time
from typing import Any

from data.config_manager import ConfigManager
from sensors.bno055_cabin import CabinImu
from sensors.gps_reader import GpsReader
from sensors.vibration_detector import VibrationDetector
from sensors.joystick_pressure import JoystickPressure
from comms.mqtt_publisher import CabinMqttPublisher, MqttConfig
from comms.camera_manager import CameraManager, CameraConfig
from data.shift_tracker import ShiftTracker

try:
    import setproctitle  # type: ignore
    setproctitle.setproctitle("mosy-cabin-hub")
except ImportError:
    pass

logger = logging.getLogger("mosy-cabin")


def setup_logging(level: str = "INFO", log_file: str | None = None) -> None:
    """Configure logging for the cabin hub."""
    fmt = "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
    handlers: list[logging.Handler] = [logging.StreamHandler()]

    if log_file:
        try:
            handlers.append(logging.FileHandler(log_file))
        except Exception:
            pass

    logging.basicConfig(level=getattr(logging, level, logging.INFO),
                        format=fmt, handlers=handlers)


class CabinHub:
    """Main cabin hub orchestrator."""

    def __init__(self, config: ConfigManager) -> None:
        self._config = config
        self._running = False

        # Sensors
        self._imu = CabinImu(
            i2c_address=config.get("sensors.imu.i2c_address", 0x29),
        )
        self._gps = GpsReader(
            port=config.get("sensors.gps.uart_port", "/dev/ttyAMA0"),
            baud=config.get("sensors.gps.baud_rate", 9600),
        )
        self._vibration = VibrationDetector(
            gpio_pin=config.get("sensors.vibration.gpio_pin", 17),
            debounce_ms=config.get("sensors.vibration.debounce_ms", 20),
        )
        self._joystick = JoystickPressure(
            dout_pin=config.get("sensors.joystick_pressure.dout_pin", 27),
            sck_pin=config.get("sensors.joystick_pressure.sck_pin", 22),
            calibration_factor=config.get("sensors.joystick_pressure.calibration_factor", 430.0),
            tare_weight=config.get("sensors.joystick_pressure.tare_weight", 0),
        )

        # Camera
        cam_cfg = CameraConfig(
            usb_device=config.get("camera.usb_device", "/dev/video0"),
            resolution=tuple(config.get("camera.resolution", [1280, 720])),
            fps=config.get("camera.fps", 5),
            jpeg_quality=config.get("camera.jpeg_quality", 85),
        )
        self._camera = CameraManager(cam_cfg)

        # MQTT
        crane_id = config.get("device.crane_id", "CRANE-001")
        mqtt_cfg = MqttConfig(
            broker=config.get("mqtt.broker", "192.168.4.1"),
            port=config.get("mqtt.port", 1883),
            topic=config.get("mqtt.topic_cabin", "mosy/{crane_id}/telemetry/cabin"),
            keepalive=config.get("mqtt.keepalive", 60),
            reconnect_delay=config.get("mqtt.reconnect_delay", 5),
            crane_id=crane_id,
            client_id=config.get("device.id", "cabin-hub-001"),
        )
        self._mqtt = CabinMqttPublisher(mqtt_cfg)

        # Shift tracker
        self._shift = ShiftTracker()

    def init(self) -> bool:
        """Initialize all subsystems. Returns True if critical systems are ready."""
        logger.info("Initializing cabin hub subsystems...")

        # MQTT is critical
        if not self._mqtt.init():
            logger.error("MQTT init failed — cannot proceed")
            return False

        # Sensors — log failures but continue (graceful degradation)
        if self._config.get("sensors.imu.enabled", True):
            if self._imu.init():
                logger.info("IMU initialized")
            else:
                logger.warning("IMU init failed — continuing without IMU")

        if self._config.get("sensors.gps.enabled", True):
            if self._gps.init():
                logger.info("GPS initialized")
            else:
                logger.warning("GPS init failed — continuing without GPS")

        if self._config.get("sensors.vibration.enabled", True):
            if self._vibration.init():
                logger.info("Vibration sensor initialized")
            else:
                logger.warning("Vibration sensor init failed — continuing without vibration")

        if self._config.get("sensors.joystick_pressure.enabled", True):
            if self._joystick.init():
                logger.info("Joystick pressure initialized")
            else:
                logger.warning("Joystick init failed — continuing without joystick")

        # Camera — non-critical
        if self._camera.init():
            self._camera.start()
        else:
            logger.warning("Camera init failed — continuing without camera")

        # Shift tracker
        self._shift.init()

        return True

    def run(self) -> None:
        """Run the 10Hz sensor polling loop."""
        self._running = True
        logger.info("Cabin hub running — 10Hz sensor loop started")

        interval_s = 1.0 / self._config.get("sensors.imu.sampling_rate_hz", 10)

        while self._running:
            loop_start = time.time()

            # Read all sensors
            imu = self._imu.read()
            gps = self._gps.read()
            vib = self._vibration.read()
            joy = self._joystick.read()
            cam_status = self._camera.get_status()

            # Build telemetry payload matching CabinTelemetry schema
            payload: dict[str, Any] = {
                "anemometer": {
                    "wind_speed_kmh": 0.0,  # Anemometer is on boom unit
                    "wind_direction_degrees": 0,
                    "status": "good",
                },
                "cabin_camera": {
                    "inference_status": "ready" if cam_status.is_running else "error",
                    "face_detected": False,
                    "face_confidence": 0.0,
                    "face_bounding_box": None,
                },
                "environmental": {
                    "temperature_c": imu.temperature if imu.valid else 0.0,
                    "humidity_percent": 0,  # No humidity sensor in POC
                    "cabin_door_open": False,  # No door sensor in POC
                    "seatbelt_fastened": None,  # No seatbelt sensor in POC
                },
                # Extra fields not in standard CabinTelemetry but useful
                "cabin_imu": {
                    "pitch": round(imu.pitch, 2) if imu.valid else 0.0,
                    "roll": round(imu.roll, 2) if imu.valid else 0.0,
                    "yaw": round(imu.yaw, 2) if imu.valid else 0.0,
                    "valid": imu.valid,
                },
                "gps": {
                    "latitude": gps.latitude if gps.valid else 0.0,
                    "longitude": gps.longitude if gps.valid else 0.0,
                    "altitude": gps.altitude if gps.valid else 0.0,
                    "speed_kmh": gps.speed_kmh if gps.valid else 0.0,
                    "satellites": gps.satellites if gps.valid else 0,
                    "fix_quality": gps.fix_quality if gps.valid else 0,
                    "valid": gps.valid,
                },
                "vibration": {
                    "engine_running": vib.motion_detected,
                    "event_count": vib.event_count,
                },
                "joystick": {
                    "weight_kg": joy.weight_kg if joy.valid else 0.0,
                    "is_active": joy.is_active if joy.valid else False,
                },
            }

            self._mqtt.publish(payload)

            # Maintain target rate
            elapsed = time.time() - loop_start
            sleep_time = interval_s - elapsed
            if sleep_time > 0:
                time.sleep(sleep_time)

    def stop(self) -> None:
        """Gracefully stop all subsystems."""
        logger.info("Stopping cabin hub...")
        self._running = False
        self._camera.stop()
        self._mqtt.close()
        self._gps.close()
        self._vibration.cleanup()
        self._shift.check_out()
        logger.info("Cabin hub stopped")


def main() -> None:
    """Entry point for the MOSY cabin hub."""
    # Load config
    config = ConfigManager("config.yaml")
    if not config.load():
        print("ERROR: Failed to load config.yaml", file=sys.stderr)
        sys.exit(1)

    # Setup logging
    setup_logging(
        level=config.get("logging.level", "INFO"),
        log_file=config.get("logging.file"),
    )

    logger.info("MOSY Cabin Hub %s starting...", config.get("device.id", "unknown"))

    # Create and initialize hub
    hub = CabinHub(config)
    if not hub.init():
        logger.error("Critical init failure — exiting")
        sys.exit(1)

    # Signal handlers for graceful shutdown
    def handle_signal(signum: int, frame: Any) -> None:
        logger.info("Received signal %d — shutting down", signum)
        hub.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_signal)
    signal.signal(signal.SIGTERM, handle_signal)

    # Auto check-in operator
    hub._shift.check_in(
        operator_id="OP-001",
        crane_id=config.get("device.crane_id", "CRANE-001"),
    )

    # Run main loop
    try:
        hub.run()
    except KeyboardInterrupt:
        hub.stop()
    except Exception as e:
        logger.exception("Unexpected error: %s", e)
        hub.stop()
        sys.exit(1)


if __name__ == "__main__":
    main()
