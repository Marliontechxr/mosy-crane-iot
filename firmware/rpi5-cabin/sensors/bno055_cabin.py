"""
BNO055 cabin IMU — I2C chassis tilt monitoring.
Blueprint Section 8 — detects cabin tilting and orientation.
"""
from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class CabinImuReading:
    """Chassis tilt data from BNO055."""
    pitch: float   # degrees, forward/backward tilt
    roll: float    # degrees, lateral tilt
    yaw: float     # degrees, heading
    temperature: float  # °C internal sensor
    valid: bool = True


class CabinImu:
    """BNO055 IMU reader for cabin chassis tilt monitoring."""

    # BNO055 register addresses
    REG_CHIP_ID = 0x00
    REG_OPR_MODE = 0x3D
    REG_PWR_MODE = 0x3E
    REG_SYS_TRIGGER = 0x3F
    REG_EULER_H_LSB = 0x1A
    REG_TEMP = 0x34
    CHIP_ID_VALUE = 0xA5
    MODE_NDOF = 0x0C

    def __init__(self, i2c_address: int = 0x29) -> None:
        self._address = i2c_address
        self._bus: Optional[object] = None
        self._initialized = False

    def init(self) -> bool:
        """Initialize BNO055 on I2C bus 1. Returns True on success."""
        try:
            import smbus2  # type: ignore
            self._bus = smbus2.SMBus(1)

            # Verify chip ID
            chip_id = self._bus.read_byte_data(self._address, self.REG_CHIP_ID)
            if chip_id != self.CHIP_ID_VALUE:
                logger.error("BNO055 chip ID mismatch: 0x%02X (expected 0xA5)", chip_id)
                return False

            # Set to config mode, then NDOF fusion mode
            self._bus.write_byte_data(self._address, self.REG_OPR_MODE, 0x00)
            time.sleep(0.025)
            self._bus.write_byte_data(self._address, self.REG_SYS_TRIGGER, 0x20)
            time.sleep(0.65)

            # Verify chip ID again after reset
            chip_id = self._bus.read_byte_data(self._address, self.REG_CHIP_ID)
            if chip_id != self.CHIP_ID_VALUE:
                return False

            # Set NDOF mode
            self._bus.write_byte_data(self._address, self.REG_OPR_MODE, self.MODE_NDOF)
            time.sleep(0.02)

            self._initialized = True
            logger.info("BNO055 cabin IMU initialized at 0x%02X", self._address)
            return True

        except Exception as e:
            logger.error("BNO055 init failed: %s", e)
            return False

    def read(self) -> CabinImuReading:
        """Read Euler angles and temperature from BNO055."""
        if not self._initialized or self._bus is None:
            return CabinImuReading(0, 0, 0, 0, valid=False)

        try:
            # Read 6 bytes of Euler data (heading, roll, pitch — each 2 bytes LE)
            data = self._bus.read_i2c_block_data(self._address, self.REG_EULER_H_LSB, 6)

            heading = self._to_signed_16(data[0], data[1]) / 16.0
            roll = self._to_signed_16(data[2], data[3]) / 16.0
            pitch = self._to_signed_16(data[4], data[5]) / 16.0

            # Temperature
            temp = self._bus.read_byte_data(self._address, self.REG_TEMP)

            return CabinImuReading(
                pitch=pitch,
                roll=roll,
                yaw=heading,
                temperature=float(temp),
            )

        except Exception as e:
            logger.warning("BNO055 read failed: %s", e)
            return CabinImuReading(0, 0, 0, 0, valid=False)

    @staticmethod
    def _to_signed_16(lsb: int, msb: int) -> int:
        """Convert two bytes to signed 16-bit integer."""
        val = (msb << 8) | lsb
        if val >= 0x8000:
            val -= 0x10000
        return val
