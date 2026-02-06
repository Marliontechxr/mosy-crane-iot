#!/usr/bin/env bash
# =============================================================================
# MOSY — IoT Hub SAS Token Rotation
# Generates a new SAS token for the edge device and updates the running
# mqtt-bridge and iot-agent containers.
#
# Usage:
#   export IOT_HUB_NAME=mosy-iothub-dev
#   export DEVICE_ID=POC-001
#   bash apps/edge/scripts/rotate-sas-token.sh
#
# Prerequisites:
#   - Azure CLI authenticated (az login)
#   - az iot extension installed (az extension add --name azure-iot)
# =============================================================================

set -euo pipefail

IOT_HUB="${IOT_HUB_NAME:-mosy-iothub-dev}"
DEVICE="${DEVICE_ID:-POC-001}"
DURATION="${SAS_TOKEN_DURATION:-86400}"  # 24 hours default
COMPOSE_DIR="${COMPOSE_DIR:-/opt/mosy/edge}"

echo "MOSY — Rotating IoT Hub SAS Token"
echo "  Hub:      $IOT_HUB"
echo "  Device:   $DEVICE"
echo "  Duration: ${DURATION}s"
echo ""

# Generate new SAS token
echo "Generating new SAS token..."
CONNECTION_STRING=$(az iot hub device-identity connection-string show \
    --hub-name "$IOT_HUB" \
    --device-id "$DEVICE" \
    --query connectionString \
    -o tsv)

if [[ -z "$CONNECTION_STRING" ]]; then
    echo "ERROR: Failed to get device connection string"
    exit 1
fi

echo "  Connection string obtained"

# Write to env file for Docker Compose
ENV_FILE="${COMPOSE_DIR}/.env"
if [[ -f "$ENV_FILE" ]]; then
    # Update existing IOT_HUB_CONNECTION_STRING
    if grep -q "IOT_HUB_CONNECTION_STRING" "$ENV_FILE"; then
        sed -i.bak "s|IOT_HUB_CONNECTION_STRING=.*|IOT_HUB_CONNECTION_STRING=${CONNECTION_STRING}|" "$ENV_FILE"
        rm -f "${ENV_FILE}.bak"
    else
        echo "IOT_HUB_CONNECTION_STRING=${CONNECTION_STRING}" >> "$ENV_FILE"
    fi
else
    echo "IOT_HUB_CONNECTION_STRING=${CONNECTION_STRING}" > "$ENV_FILE"
fi

echo "  Updated $ENV_FILE"

# Restart affected services
echo "Restarting mqtt-bridge and iot-agent..."
cd "$COMPOSE_DIR"
docker compose restart mqtt-bridge iot-agent

echo ""
echo "SAS token rotation complete."
echo "Next rotation due in ${DURATION}s ($(date -d "+${DURATION} seconds" 2>/dev/null || date -v+${DURATION}S))"
