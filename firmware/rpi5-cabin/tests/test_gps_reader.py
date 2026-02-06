"""
Tests for GPS NMEA sentence parsing.
"""
import pytest
from sensors.gps_reader import parse_gga_sentence, parse_rmc_sentence, _nmea_to_decimal


class TestNmeaToDecimal:
    """Test NMEA coordinate to decimal degree conversion."""

    def test_north_latitude(self):
        # 1300.5678 N → 13° 0.5678' → 13.009463
        result = _nmea_to_decimal("1300.5678", "N")
        assert abs(result - 13.009463) < 0.0001

    def test_south_latitude(self):
        result = _nmea_to_decimal("1300.5678", "S")
        assert result < 0
        assert abs(result + 13.009463) < 0.0001

    def test_east_longitude(self):
        # 08023.4567 E → 80° 23.4567' → 80.390945
        result = _nmea_to_decimal("08023.4567", "E")
        assert abs(result - 80.390945) < 0.0001

    def test_west_longitude(self):
        result = _nmea_to_decimal("08023.4567", "W")
        assert result < 0

    def test_empty_string(self):
        assert _nmea_to_decimal("", "N") == 0.0
        assert _nmea_to_decimal("1234.5678", "") == 0.0


class TestParseGGA:
    """Test GPGGA sentence parsing."""

    def test_valid_gga(self):
        sentence = "$GPGGA,120000.00,1300.5678,N,08023.4567,E,1,08,1.2,45.6,M,0.0,M,,*00"
        reading = parse_gga_sentence(sentence)
        assert reading is not None
        assert reading.valid
        assert abs(reading.latitude - 13.009463) < 0.0001
        assert abs(reading.longitude - 80.390945) < 0.0001
        assert abs(reading.altitude - 45.6) < 0.01
        assert reading.satellites == 8
        assert reading.fix_quality == 1

    def test_no_fix(self):
        sentence = "$GPGGA,120000.00,,,,,0,00,,,M,,M,,*00"
        reading = parse_gga_sentence(sentence)
        assert reading is not None
        assert not reading.valid

    def test_gngga_supported(self):
        sentence = "$GNGGA,120000.00,1300.5678,N,08023.4567,E,1,12,0.8,50.0,M,0.0,M,,*00"
        reading = parse_gga_sentence(sentence)
        assert reading is not None
        assert reading.valid

    def test_non_gga_sentence(self):
        sentence = "$GPRMC,120000.00,A,1300.5678,N,08023.4567,E,0.5,,010226,,,A*00"
        reading = parse_gga_sentence(sentence)
        assert reading is None

    def test_short_sentence(self):
        sentence = "$GPGGA,120000.00"
        reading = parse_gga_sentence(sentence)
        assert reading is None

    def test_checksum_stripped(self):
        sentence = "$GPGGA,120000.00,1300.5678,N,08023.4567,E,2,10,1.0,100.0,M,0.0,M,,*4F"
        reading = parse_gga_sentence(sentence)
        assert reading is not None
        assert reading.fix_quality == 2


class TestParseRMC:
    """Test GPRMC sentence parsing for speed."""

    def test_valid_rmc_speed(self):
        sentence = "$GPRMC,120000.00,A,1300.5678,N,08023.4567,E,5.4,,010226,,,A*00"
        speed = parse_rmc_sentence(sentence)
        assert speed is not None
        # 5.4 knots × 1.852 = 10.00 km/h
        assert abs(speed - 10.0) < 0.1

    def test_void_status(self):
        sentence = "$GPRMC,120000.00,V,,,,,0.0,,010226,,,N*00"
        speed = parse_rmc_sentence(sentence)
        assert speed is None

    def test_gnrmc_supported(self):
        sentence = "$GNRMC,120000.00,A,1300.5678,N,08023.4567,E,10.0,,010226,,,A*00"
        speed = parse_rmc_sentence(sentence)
        assert speed is not None
        assert abs(speed - 18.52) < 0.1

    def test_zero_speed(self):
        sentence = "$GPRMC,120000.00,A,1300.5678,N,08023.4567,E,0.0,,010226,,,A*00"
        speed = parse_rmc_sentence(sentence)
        assert speed is not None
        assert abs(speed) < 0.01

    def test_non_rmc(self):
        sentence = "$GPGGA,120000.00,1300.5678,N,08023.4567,E,1,08,1.2,45.6,M,0.0,M,,*00"
        speed = parse_rmc_sentence(sentence)
        assert speed is None
