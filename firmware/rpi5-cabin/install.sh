#!/bin/bash
# MOSY RPi 5 Cabin Hub — Installation Script
# Blueprint Section 8 — systemd service setup
#
# Usage: sudo bash install.sh
#
set -euo pipefail

INSTALL_DIR="/home/pi/mosy-cabin"
VENV_DIR="/opt/mosy-cabin-venv"
SERVICE_NAME="mosy-cabin"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "=== MOSY Cabin Hub Installer ==="
echo ""

# Check root
if [ "$EUID" -ne 0 ]; then
  echo "ERROR: Run as root (sudo bash install.sh)"
  exit 1
fi

# Install system dependencies
echo "[1/6] Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq \
  python3-dev python3-venv python3-pip \
  python3-smbus i2c-tools \
  libopencv-dev \
  libgpiod-dev

# Enable I2C and serial
echo "[2/6] Enabling I2C and serial interfaces..."
raspi-config nonint do_i2c 0     2>/dev/null || true
raspi-config nonint do_serial 2  2>/dev/null || true  # Serial enabled, console disabled

# Create virtual environment
echo "[3/6] Creating Python virtual environment..."
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --upgrade pip
"$VENV_DIR/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"

# Copy application files
echo "[4/6] Installing application..."
mkdir -p "$INSTALL_DIR"
cp -r "$SCRIPT_DIR"/*.py "$INSTALL_DIR/" 2>/dev/null || true
cp -r "$SCRIPT_DIR"/sensors "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR"/comms "$INSTALL_DIR/"
cp -r "$SCRIPT_DIR"/data "$INSTALL_DIR/"
cp "$SCRIPT_DIR/config.yaml" "$INSTALL_DIR/"

# Create data directory
mkdir -p /var/lib/mosy-cabin
chown pi:pi /var/lib/mosy-cabin

# Create log directory
touch /var/log/mosy-cabin.log
chown pi:pi /var/log/mosy-cabin.log

# Create systemd service
echo "[5/6] Creating systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=MOSY Cabin Hub — Crane cabin sensor aggregator
After=network.target
Wants=network-online.target

[Service]
Type=simple
User=pi
WorkingDirectory=${INSTALL_DIR}
Environment="PATH=${VENV_DIR}/bin"
ExecStart=${VENV_DIR}/bin/python main.py
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

# Resource limits
MemoryMax=512M
CPUQuota=80%

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
echo "[6/6] Enabling service..."
systemctl daemon-reload
systemctl enable "$SERVICE_NAME"

echo ""
echo "=== Installation complete ==="
echo ""
echo "Commands:"
echo "  Start:   sudo systemctl start $SERVICE_NAME"
echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
echo "  Status:  sudo systemctl status $SERVICE_NAME"
echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
echo ""
echo "Config:    $INSTALL_DIR/config.yaml"
echo "Data:      /var/lib/mosy-cabin/"
echo "Logs:      /var/log/mosy-cabin.log"
