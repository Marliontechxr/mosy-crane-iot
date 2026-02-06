#!/usr/bin/env bash
# =============================================================================
# MOSY — One-Command Demo Startup
#
# Starts the full demo environment:
#   1. Edge services + sensor simulator (Docker Compose with demo profile)
#   2. Admin Dashboard in demo mode (Next.js dev server)
#
# Usage:
#   bash scripts/demo-start.sh
#
# Stop: Ctrl+C (kills dashboard, then run: docker compose down in apps/edge)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
EDGE_DIR="${PROJECT_ROOT}/apps/edge"
DASHBOARD_DIR="${PROJECT_ROOT}/apps/admin-dashboard"

# Cleanup on exit
cleanup() {
    echo ""
    echo "Stopping demo environment..."
    kill "$DASHBOARD_PID" 2>/dev/null || true
    cd "$EDGE_DIR" && docker compose --profile demo down --remove-orphans 2>/dev/null || true
    echo "Demo stopped."
}
trap cleanup EXIT

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║     MOSY — Demo Environment Startup      ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Step 1: Start edge services with demo profile
echo "  [1/3] Starting edge services + sensor simulator..."
cd "$EDGE_DIR"
CRANE_ID=DEMO-001 docker compose --profile demo up -d --remove-orphans

echo "  [2/3] Waiting for services to initialize (20s)..."
sleep 20

# Verify mosquitto is up
if docker exec mosy-mosquitto mosquitto_sub -h localhost -t '$SYS/broker/uptime' -C 1 -W 5 >/dev/null 2>&1; then
    echo "  MQTT broker: UP"
else
    echo "  WARNING: MQTT broker may not be ready yet"
fi

# Step 3: Start admin dashboard in demo mode
echo "  [3/3] Starting Admin Dashboard (demo mode)..."
cd "$DASHBOARD_DIR"
NEXT_PUBLIC_DEMO_MODE=true pnpm dev &
DASHBOARD_PID=$!

# Wait for dashboard to be ready
echo "  Waiting for dashboard (10s)..."
sleep 10

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║         MOSY Demo Ready                  ║"
echo "  ╠══════════════════════════════════════════╣"
echo "  ║  Admin Dashboard:  http://localhost:3000  ║"
echo "  ║  MQTT Broker:      localhost:1883         ║"
echo "  ║  Sensor Simulator: running (full-demo)    ║"
echo "  ║                                          ║"
echo "  ║  Press Ctrl+C to stop                    ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# Keep running until Ctrl+C
wait "$DASHBOARD_PID"
