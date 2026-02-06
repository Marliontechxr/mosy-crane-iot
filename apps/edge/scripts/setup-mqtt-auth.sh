#!/usr/bin/env bash
# =============================================================================
# MOSY — Setup MQTT Broker Authentication
# Creates password file for Mosquitto from environment variables.
#
# Usage:
#   export MQTT_PASS_FUSION=secretpass1
#   export MQTT_PASS_STATE=secretpass2
#   ... (set all passwords)
#   bash apps/edge/scripts/setup-mqtt-auth.sh
#
# Or with defaults for development:
#   bash apps/edge/scripts/setup-mqtt-auth.sh --dev
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOSQUITTO_DIR="${SCRIPT_DIR}/../config/mosquitto"
PASSWD_FILE="${MOSQUITTO_DIR}/passwd"

echo "MOSY — Setting up MQTT authentication"

# Development mode uses deterministic passwords (NOT for production)
if [[ "${1:-}" == "--dev" ]]; then
    echo "  Using development passwords (NOT FOR PRODUCTION)"
    MQTT_PASS_FUSION="${MQTT_PASS_FUSION:-mosy-dev-fusion}"
    MQTT_PASS_STATE="${MQTT_PASS_STATE:-mosy-dev-state}"
    MQTT_PASS_OCR="${MQTT_PASS_OCR:-mosy-dev-ocr}"
    MQTT_PASS_VISION="${MQTT_PASS_VISION:-mosy-dev-vision}"
    MQTT_PASS_SAFETY="${MQTT_PASS_SAFETY:-mosy-dev-safety}"
    MQTT_PASS_BRIDGE="${MQTT_PASS_BRIDGE:-mosy-dev-bridge}"
    MQTT_PASS_IOT="${MQTT_PASS_IOT:-mosy-dev-iot}"
    MQTT_PASS_BOOM="${MQTT_PASS_BOOM:-mosy-dev-boom}"
    MQTT_PASS_CABIN="${MQTT_PASS_CABIN:-mosy-dev-cabin}"
    MQTT_PASS_TABLET="${MQTT_PASS_TABLET:-mosy-dev-tablet}"
    MQTT_PASS_ADMIN="${MQTT_PASS_ADMIN:-mosy-dev-admin}"
    MQTT_PASS_E2E="${MQTT_PASS_E2E:-mosy-dev-e2e}"
fi

# Validate required passwords
USERS=(
    "mosy-fusion:${MQTT_PASS_FUSION:-}"
    "mosy-state-engine:${MQTT_PASS_STATE:-}"
    "mosy-ocr:${MQTT_PASS_OCR:-}"
    "mosy-vision:${MQTT_PASS_VISION:-}"
    "mosy-safety:${MQTT_PASS_SAFETY:-}"
    "mosy-bridge:${MQTT_PASS_BRIDGE:-}"
    "mosy-iot-agent:${MQTT_PASS_IOT:-}"
    "mosy-boom:${MQTT_PASS_BOOM:-}"
    "mosy-cabin:${MQTT_PASS_CABIN:-}"
    "mosy-tablet:${MQTT_PASS_TABLET:-}"
    "mosy-admin:${MQTT_PASS_ADMIN:-}"
    "mosy-e2e:${MQTT_PASS_E2E:-}"
)

# Check all passwords are set
for entry in "${USERS[@]}"; do
    user="${entry%%:*}"
    pass="${entry#*:}"
    if [[ -z "$pass" ]]; then
        echo "ERROR: Password not set for $user"
        echo "Set MQTT_PASS_* environment variables or use --dev flag"
        exit 1
    fi
done

# Create password file
rm -f "$PASSWD_FILE"
touch "$PASSWD_FILE"

for entry in "${USERS[@]}"; do
    user="${entry%%:*}"
    pass="${entry#*:}"
    # Use mosquitto_passwd to hash passwords
    if command -v mosquitto_passwd &>/dev/null; then
        mosquitto_passwd -b "$PASSWD_FILE" "$user" "$pass"
    else
        # Fallback: use Docker container to generate hashed passwords
        docker run --rm -v "$MOSQUITTO_DIR:/mosquitto/config" \
            eclipse-mosquitto:2.0.20 \
            mosquitto_passwd -b /mosquitto/config/passwd "$user" "$pass"
    fi
    echo "  Added user: $user"
done

echo ""
echo "Password file created at: $PASSWD_FILE"
echo "ACL file at: ${MOSQUITTO_DIR}/acl"
echo ""
echo "To use authenticated mode:"
echo "  1. Set MOSQUITTO_CONF=mosquitto.prod.conf in your environment"
echo "  2. Set MQTT_USERNAME/MQTT_PASSWORD env vars on each service"
echo "  3. Restart: docker compose up -d"
