"""
GPS reader — Neo-6M UART NMEA parsing.
Blueprint Section 8 — serial GPS at 9600 baud, extract lat/lon/altitude/satellites.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class GpsReading:
    """Parsed GPS position data."""
    latitude: float     # decimal degrees
    longitude: float    # decimal degrees
    altitude: float     # meters above sea level
    speed_kmh: float    # ground speed in km/h
    satellites: int     # number of satellites in view
    fix_quality: int    # 0=no fix, 1=GPS, 2=DGPS
    valid: bool = True


def parse_gga_sentence(sentence: str) -> Optional[GpsReading]:
    """
    Parse a GPGGA NMEA sentence into a GpsReading.

    Format: $GPGGA,hhmmss.ss,llll.ll,a,yyyyy.yy,a,x,xx,x.x,x.x,M,x.x,M,,*hh

    Field indices:
        1: UTC time
        2: Latitude (ddmm.mmmm)
        3: N/S
        4: Longitude (dddmm.mmmm)
        5: E/W
        6: Fix quality (0-8)
        7: Number of satellites
        8: HDOP
        9: Altitude (meters)
        10: Altitude unit (M)

    Returns None if the sentence cannot be parsed or has no fix.
    """
    if not sentence.startswith("$GPGGA") and not sentence.startswith("$GNGGA"):
        return None

    try:
        # Strip checksum
        if "*" in sentence:
            sentence = sentence[:sentence.index("*")]

        parts = sentence.split(",")
        if len(parts) < 10:
            return None

        fix_quality = int(parts[6]) if parts[6] else 0
        if fix_quality == 0:
            return GpsReading(0, 0, 0, 0, 0, 0, valid=False)

        lat = _nmea_to_decimal(parts[2], parts[3])
        lon = _nmea_to_decimal(parts[4], parts[5])
        altitude = float(parts[9]) if parts[9] else 0.0
        satellites = int(parts[7]) if parts[7] else 0

        return GpsReading(
            latitude=lat,
            longitude=lon,
            altitude=altitude,
            speed_kmh=0.0,  # GGA doesn't have speed; updated from RMC
            satellites=satellites,
            fix_quality=fix_quality,
        )

    except (ValueError, IndexError) as e:
        logger.debug("GGA parse error: %s", e)
        return None


def parse_rmc_sentence(sentence: str) -> Optional[float]:
    """
    Parse GPRMC sentence to extract ground speed in km/h.

    Field index 7 = speed in knots. 1 knot = 1.852 km/h.
    Returns None if sentence is invalid or speed field is empty.
    """
    if not sentence.startswith("$GPRMC") and not sentence.startswith("$GNRMC"):
        return None

    try:
        if "*" in sentence:
            sentence = sentence[:sentence.index("*")]

        parts = sentence.split(",")
        if len(parts) < 8:
            return None

        # Status field: A=active, V=void
        if parts[2] != "A":
            return None

        speed_knots = float(parts[7]) if parts[7] else 0.0
        return speed_knots * 1.852

    except (ValueError, IndexError):
        return None


def _nmea_to_decimal(coord: str, direction: str) -> float:
    """
    Convert NMEA coordinate (ddmm.mmmm or dddmm.mmmm) to decimal degrees.
    """
    if not coord or not direction:
        return 0.0

    # Find the decimal point position to split degrees and minutes
    dot_pos = coord.index(".")
    deg_len = dot_pos - 2  # Degrees are everything before the last 2 digits before dot

    degrees = float(coord[:deg_len])
    minutes = float(coord[deg_len:])
    decimal = degrees + (minutes / 60.0)

    if direction in ("S", "W"):
        decimal = -decimal

    return round(decimal, 7)


class GpsReader:
    """Serial GPS reader with NMEA sentence parsing."""

    def __init__(self, port: str = "/dev/ttyAMA0", baud: int = 9600) -> None:
        self._port = port
        self._baud = baud
        self._serial: Optional[object] = None
        self._last_reading = GpsReading(0, 0, 0, 0, 0, 0, valid=False)

    def init(self) -> bool:
        """Open serial port for GPS. Returns True on success."""
        try:
            import serial  # type: ignore
            self._serial = serial.Serial(
                self._port,
                baudrate=self._baud,
                timeout=1.0,
            )
            logger.info("GPS initialized on %s at %d baud", self._port, self._baud)
            return True
        except Exception as e:
            logger.error("GPS init failed: %s", e)
            return False

    def read(self) -> GpsReading:
        """Read and parse available NMEA sentences. Returns latest valid reading."""
        if self._serial is None:
            return GpsReading(0, 0, 0, 0, 0, 0, valid=False)

        try:
            while self._serial.in_waiting > 0:
                line = self._serial.readline().decode("ascii", errors="ignore").strip()
                if not line:
                    continue

                # Parse GGA for position
                gga = parse_gga_sentence(line)
                if gga is not None and gga.valid:
                    self._last_reading = gga

                # Parse RMC for speed
                speed = parse_rmc_sentence(line)
                if speed is not None and self._last_reading.valid:
                    self._last_reading.speed_kmh = speed

        except Exception as e:
            logger.warning("GPS read error: %s", e)

        return self._last_reading

    def close(self) -> None:
        """Close serial port."""
        if self._serial:
            self._serial.close()
            self._serial = None
