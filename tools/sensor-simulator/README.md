# MOSY Sensor Simulator

Standalone CLI tool that publishes realistic crane telemetry to MQTT for demos, testing, and development.

## Install

```bash
pip install -r requirements.txt
```

## Usage

```bash
# Full 5-minute client demo (recommended for presentations)
python main.py --scenario full-demo

# Normal operations with custom crane ID
python main.py --scenario normal --crane-id CRANE-001 --duration 120

# Overload scenario at 2x speed
python main.py --scenario overload --speed 2.0

# Connect to remote MQTT broker (e.g., Jetson)
python main.py --scenario full-demo --broker 192.168.4.1

# Run forever (infinite loop)
python main.py --scenario normal --duration 0
```

## Scenarios

| Scenario      | Description                                                |
|---------------|------------------------------------------------------------|
| `normal`      | Periodic lift cycles, moderate wind, alert operator         |
| `overload`    | Load gradually approaches and exceeds 90% capacity          |
| `fatigue`     | Operator PERCLOS rises to drowsy threshold                  |
| `wind-gust`   | Sudden wind event peaking near 72 km/h                      |
| `ocr-failure` | Dashboard OCR confidence degrades and recovers              |
| `disconnect`  | Simulates intermittent MQTT disconnection                   |
| `full-demo`   | Complete 5-minute crane operation cycle (see below)         |

## Full Demo Timeline

| Time      | Phase                                                         |
|-----------|---------------------------------------------------------------|
| 0:00-0:30 | Engine startup, safety check, operator check-in               |
| 0:30-1:30 | Normal lifting operations (3 lift cycles)                     |
| 1:30-2:00 | Warning: load approaches 80%, wind picks up to 23 km/h       |
| 2:00-2:30 | Critical: load hits 92%, alert triggers, operator backs off   |
| 2:30-3:30 | Normal operations resume, productivity scoring visible        |
| 3:30-4:00 | Fatigue: PERCLOS rises to 25% (drowsy warning)                |
| 4:00-4:30 | Break period, operator checks out temporarily                 |
| 4:30-5:00 | Operator returns, final lifts, shift checkout                 |

## MQTT Topics Published

- `mosy/{crane_id}/telemetry/boom` (10 Hz)
- `mosy/{crane_id}/telemetry/cabin` (10 Hz)
- `mosy/{crane_id}/telemetry/ocr` (5 Hz)
- `mosy/{crane_id}/vision/boom` (2 Hz)
- `mosy/{crane_id}/vision/cabin` (2 Hz)
- `mosy/{crane_id}/state/lift` (on change)
- `mosy/{crane_id}/state/operator` (on change)
- `mosy/{crane_id}/state/engine` (on change)

## CLI Options

| Flag         | Default      | Description                        |
|--------------|--------------|------------------------------------|
| `--crane-id` | `DEMO-001`   | Crane identifier                   |
| `--broker`   | `localhost`   | MQTT broker host                   |
| `--port`     | `1883`        | MQTT broker port                   |
| `--duration` | `300`         | Duration in seconds (0 = infinite) |
| `--scenario` | `normal`      | Simulation scenario                |
| `--speed`    | `1.0`         | Time multiplier (2.0 = 2x speed)  |
