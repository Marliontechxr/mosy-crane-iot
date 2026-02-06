# MOSY — Claude Code Execution Prompts

## How to Use This Document

**Prerequisites:**
1. Create a GitHub repo and clone it locally
2. Copy `MOSY_BLUEPRINT.md` and `CLAUDE.md` into the repo root
3. Open Claude Code in the repo directory — it will auto-read `CLAUDE.md`
4. Have Azure CLI authenticated (`az login` done)
5. Have Node.js 22+, Python 3.11+, Docker installed

**Execution Strategy:**
- Run each phase prompt **one at a time** in order
- Wait for Claude Code to complete each phase fully before starting the next
- After each phase, review the output, run tests, and commit
- If Claude Code hits context limits mid-phase, use the continuation prompt at the bottom

---

## PHASE 0: Project Bootstrap

```
Read MOSY_BLUEPRINT.md sections 1-3 completely. Then initialize the monorepo:

1. Initialize the monorepo with pnpm workspaces and Turborepo:
   - Root package.json with workspaces for apps/*, packages/*, functions/
   - turbo.json with build/test/lint pipeline
   - Root tsconfig.json with strict mode, path aliases
   - .gitignore, .prettierrc, .eslintrc covering all workspaces
   - Root .env.example with all Azure connection string placeholders (no real values)

2. Create the packages/shared-types workspace:
   - Every TypeScript interface from Blueprint Section 9 (MQTT message types)
   - Every TypeScript interface from Blueprint Section 15 (Cosmos DB document types)
   - Every TypeScript interface from Blueprint Section 16 (API request/response types)
   - Export everything from a single index.ts
   - Include a tsconfig.json and package.json

3. Create the packages/mqtt-schemas workspace:
   - TypeScript interfaces (re-export from shared-types)
   - Python dataclasses mirroring EVERY TypeScript type (for edge services)
   - JSON Schema files generated from the TypeScript types
   - Validation functions for both TS and Python

4. Create skeleton package.json for each app (admin-dashboard, tablet-pwa, functions)
   with the exact dependencies from Blueprint Section 2.

5. Initialize infra/bicep/ with placeholder main.bicep and parameters files.

6. Create .github/workflows/ with a basic CI workflow that runs lint + typecheck.

Commit as "feat: initialize MOSY monorepo with shared types and project structure"
```

---

## PHASE 1: Azure Infrastructure

```
Read MOSY_BLUEPRINT.md Section 4 (Azure Infrastructure) and Section 5 (Authentication) completely.
Use Azure CLI — we are already logged in.

1. Write the complete Bicep templates in infra/bicep/:
   - main.bicep that orchestrates all modules
   - modules/iot-hub.bicep — IoT Hub S1 in southindia
   - modules/cosmos-db.bicep — Cosmos DB account + mosydb database + ALL 10 containers
     from Blueprint Section 15 with exact partition keys, TTL settings, indexing policies,
     and autoscale (400-1000 RU/s)
   - modules/storage.bicep — Blob Storage with containers: camera-snapshots, shift-reports,
     model-artifacts, edge-logs
   - modules/functions.bicep — Function App with Node.js 22 runtime, consumption plan
   - modules/signalr.bicep — SignalR Service (Free tier for dev, Standard for prod)
   - modules/keyvault.bicep — Key Vault for all secrets
   - modules/app-service.bicep — App Service for admin dashboard (B1 for dev)
   - modules/entra.bicep — Entra External ID tenant config (if automatable, otherwise
     output manual steps)
   - parameters/dev.bicepparam — development environment parameters
   - parameters/prod.bicepparam — production environment parameters

2. Create infra/scripts/deploy.sh that:
   - Creates resource group rg-mosy-dev in southindia
   - Deploys the Bicep template with dev parameters
   - Registers an IoT Hub device identity called "jetson-poc-001"
   - Retrieves the device connection string and stores it in Key Vault
   - Retrieves Cosmos DB connection string and stores it in Key Vault
   - Outputs all connection strings to a local .env.local (gitignored)

3. Run the deployment script to provision the dev environment.

4. Verify all resources exist with `az resource list --resource-group rg-mosy-dev`

Commit as "infra: provision Azure IoT Hub, Cosmos DB, Functions, SignalR, Key Vault"
```

---

## PHASE 2: Azure Functions (Cloud Backend)

```
Read MOSY_BLUEPRINT.md Section 10 (Cloud Backend) completely.

1. Initialize the functions/ workspace as an Azure Functions v4 project (Node.js 22, TypeScript):
   - host.json with IoT Hub and SignalR bindings
   - local.settings.json pulling from .env.local (gitignored)
   - package.json with @azure/cosmos, @azure/storage-blob, @azure/communication-sms,
     @azure/functions dependencies

2. Implement EVERY Azure Function from Blueprint Section 10.2:

   a. processTelemetry — IoT Hub trigger
      - Parses the D2C message (use shared-types for type safety)
      - Writes to Cosmos DB telemetry container with craneId partition key
      - Triggers SignalR broadcast for real-time dashboard updates
      - Error handling: dead-letter to Blob Storage on failure

   b. processAlert — IoT Hub trigger with route filter (alert messages only)
      - Reads alert level from message properties
      - Writes to Cosmos DB alerts container
      - Level 3 (critical): sends WhatsApp + SMS via Azure Communication Services
      - Level 2 (warning): sends push notification
      - Level 1 (info): log only
      - Triggers SignalR alertNotification event

   c. generateShiftReport — Timer trigger (every hour, checks for ended shifts)
      - Queries Cosmos DB for shifts that ended in the last hour
      - Generates PDF summary (use pdfkit or similar)
      - Uploads PDF to Blob Storage shift-reports container
      - Sends WhatsApp notification with report link

   d. getFleetStatus — HTTP GET trigger (authenticated)
      - Queries Cosmos DB cranes container for all cranes with latest telemetry
      - Returns fleet overview with crane status, operator, current load
      - CORS enabled for admin dashboard origin

   e. getCraneDetail — HTTP GET trigger (authenticated)
      - Path parameter: craneId
      - Query parameters: from, to (ISO timestamps)
      - Returns crane config + telemetry history + recent alerts

   f. getOperatorHistory — HTTP GET trigger (authenticated)
      - Path parameter: operatorId
      - Returns shift history, performance scores, fatigue incidents

   g. negotiate — HTTP trigger for SignalR connection
      - Returns SignalR connection info (hubName: mosy-hub)

   h. broadcastUpdate — IoT Hub trigger → SignalR output binding
      - Routes telemetry to SignalR groups by craneId
      - Clients subscribe to crane-specific groups

3. Write unit tests for each function using vitest:
   - Mock Cosmos DB client, SignalR output, IoT Hub input
   - Test message parsing, error handling, routing logic
   - Test alert level escalation logic

4. Deploy functions to Azure:
   - `func azure functionapp publish mosy-functions-dev`
   - Verify each function appears in Azure Portal

Commit as "feat: implement all Azure Functions with IoT Hub processing and SignalR"
```

---

## PHASE 3: Edge Core Services

```
Read MOSY_BLUEPRINT.md Section 6 (Edge Platform) focusing on 6.3, 6.5, 6.6, 6.7.
Also read Section 9 (Communication Architecture) for MQTT schemas.

We are building for x86 LAPTOP POC first. Use python:3.11-slim as base image.

1. Create apps/edge/docker-compose.yml with ALL services from Blueprint Section 6:
   - mosquitto (Mosquitto 2.1.1 with config for anonymous local access)
   - fusion-service (sensor fusion + validation)
   - state-engine (lift/operator/engine state machines)
   - mqtt-bridge (local MQTT ↔ cloud sync via IoT Hub)
   - iot-agent (Azure IoT Edge agent, store-and-forward)
   - sqlite-volume (shared SQLite database)
   Network: mosy-edge-net (bridge)

   NOTE: ocr-service, vision-service, safety-service will be added in Phase 4.

2. Create apps/edge/Dockerfile.base with Python 3.11, paho-mqtt, sqlite3, common deps.

3. Implement fusion-service (apps/edge/services/fusion-service/):
   - main.py: MQTT subscriber on mosy/+/telemetry/boom, mosy/+/telemetry/cabin, mosy/+/telemetry/ocr
   - fusion_engine.py: Implements the data source hierarchy from Blueprint Section 6.3:
     * P1: Dashboard OCR values (primary)
     * P2: Sensor cross-validation (IMU angle vs OCR angle, LiDAR height vs geometric calc)
     * P3: Fallback methods (last known good, physics model)
   - Publishes fused data to mosy/{crane_id}/telemetry/fused at 1Hz
   - Discrepancy detection: if OCR vs sensor differ >10%, publish alert
   - Use EXACT Python dataclasses from packages/mqtt-schemas

4. Implement state-engine (apps/edge/services/state-engine/):
   - lift_state.py: Lift classification state machine from Blueprint Section 6.5
     (IDLE → LIFTING → LOADED → LOWERING → IDLE, with REAL_LIFT detection:
      Weight >100kg AND Duration >30s AND Material ≠ None AND Displacement >2m)
   - operator_state.py: 8-state operator FSM (Check-in → Safety Check → Active → Idle →
     Holding → Break → Fatigue → Check-out)
   - engine_state.py: Engine state machine (Working/Holding/Idle/Engine Off) with
     dual accumulator (total engine hours + effective work hours)
   - Subscribes to mosy/+/telemetry/fused, publishes to mosy/+/state/{type}

5. Implement mqtt-bridge (apps/edge/services/mqtt-bridge/):
   - Subscribes to mosy/+/telemetry/fused and mosy/+/alerts/+
   - Buffers messages in SQLite when offline (store-and-forward)
   - When online: forwards to Azure IoT Hub as D2C messages
   - Receives C2D messages from IoT Hub, publishes to mosy/+/commands/+
   - Health check endpoint on port 8081

6. Implement iot-agent (apps/edge/services/iot-agent/):
   - Azure IoT Device SDK (azure-iot-device Python)
   - Device twin synchronization (desired → local config, reported → device status)
   - Direct method handlers: reboot, recalibrate, updateConfig
   - Connection retry with exponential backoff

7. Create apps/edge/services/shared/:
   - sqlite_store.py: SQLite wrapper for local data (telemetry buffer, shift records, config)
   - mqtt_client.py: Shared MQTT connection factory (Mosquitto at localhost:1883)
   - logger.py: Structured JSON logging with correlation IDs

8. Write pytest tests:
   - Test fusion engine with sample sensor data (OCR matches sensors, OCR diverges, OCR fails)
   - Test state machines with event sequences
   - Test MQTT bridge store-and-forward (simulate disconnect/reconnect)
   - Test SQLite operations

9. docker compose up and verify all services start, MQTT messages flow,
   state machines transition, and messages reach Azure IoT Hub.

Commit as "feat: implement edge core — sensor fusion, state machines, MQTT bridge, IoT agent"
```

---

## PHASE 4: Edge AI Services

```
Read MOSY_BLUEPRINT.md Section 6.1, 6.2, Section 14 (AI/ML Pipeline) completely.

Building for x86 LAPTOP POC — use CPU ONNX Runtime (not CUDA).

1. Add these services to docker-compose.yml:
   - ocr-service (Dashboard OCR)
   - vision-service (Moondream 2 VLM for boom camera)
   - safety-service (PERCLOS fatigue detection for cabin camera)

2. Implement ocr-service (apps/edge/services/ocr-service/):
   - camera_capture.py: OpenCV VideoCapture from USB camera (device /dev/video0)
     Capture at 30 FPS, process every 6th frame (effective 5 FPS for OCR)
   - preprocessor.py: Perspective correction, glare removal (CPL simulation for POC),
     contrast enhancement, ROI extraction based on calibration profile
   - digital_reader.py: PaddleOCR 3.4 pipeline (detection + recognition)
     Extract: load weight, boom radius, boom angle, boom length from LMI display
   - analog_reader.py: OpenCV Hough Circle Transform for analog gauges
     Detect needle angle → map to calibrated min/max values
   - calibration.py: Load per-crane calibration JSON profile
     (ROI coordinates, gauge type digital/analog, min/max, units)
     Provide calibration mode endpoint for capturing new ROI profiles
   - Publish parsed values to mosy/{crane_id}/telemetry/ocr with confidence scores
   - Include a sample calibration profile for POC (calibrations/poc-crane.json)

3. Implement vision-service (apps/edge/services/vision-service/):
   - model_loader.py: Load Moondream 2 0.5B INT8 ONNX model
     Use onnxruntime.InferenceSession with CPUExecutionProvider
   - boom_analyzer.py: Process 8MP boom camera frames
     Prompt templates from Blueprint Section 14.1:
     * Material classification: "What type of construction material is being lifted?"
     * Personnel detection: "Are there any people in the area below the crane hook?"
     * Asset tracking: "What vehicles or equipment are visible in this image?"
   - inference_pipeline.py: Batched inference at 2-3 FPS
     Publish results to mosy/{crane_id}/vision/boom
   - For POC: Accept RTSP stream URL or local video file as camera input

4. Implement safety-service (apps/edge/services/safety-service/):
   - face_detector.py: MediaPipe Face Mesh (468 landmarks)
   - ear_calculator.py: Eye Aspect Ratio from landmarks
     EAR = (||p2-p6|| + ||p3-p5||) / (2 × ||p1-p4||)
     Landmark indices: p1=33, p2=160, p3=158, p4=133, p5=153, p6=144 (left eye)
   - perclos_tracker.py: 60-second sliding window
     Track % of frames with EAR < 0.2
     Thresholds: <15% Awake, 15-30% Drowsy (Level 2 alert), >30% Fatigue (Level 3 alert)
   - operator_tracker.py: Face presence detection, shift check-in/check-out
   - Publish to mosy/{crane_id}/vision/cabin
   - For POC: Accept webcam input as cabin camera

5. Download and prepare models for POC:
   - Create scripts/download_models.sh that fetches:
     * PaddleOCR detection + recognition models
     * Moondream 2 0.5B ONNX model (or export script)
     * MediaPipe Face Mesh model
   - Store in models/ directory (gitignored, with .gitkeep)

6. Write tests:
   - OCR service: test with sample dashboard images (include test fixtures)
   - Vision service: test with sample construction site images
   - Safety service: test with sample face images (eyes open, eyes closed)
   - Test confidence scoring and fallback behavior

7. docker compose up all services and verify:
   - OCR reads from USB camera (or test images)
   - Vision service processes boom camera frames
   - Safety service computes PERCLOS scores
   - All publish to correct MQTT topics
   - Fusion service integrates AI outputs with sensor data

Commit as "feat: implement edge AI — Dashboard OCR, Moondream 2 VLM, PERCLOS fatigue detection"
```

---

## PHASE 5: Admin Dashboard

```
Read MOSY_BLUEPRINT.md Section 11 (Admin Dashboard), Section 5 (Authentication),
and Section 16 (API Reference) completely.

1. Initialize apps/admin-dashboard/ as Next.js 16 project:
   - App Router with TypeScript strict mode
   - Tailwind CSS 4.1 configured
   - shadcn/ui initialized with all components we need (Button, Card, Table,
     Dialog, DropdownMenu, Badge, Input, Select, Tabs, Chart)
   - Recharts 3.7, Zustand, @azure/msal-browser 5.1.0 installed
   - Mapbox GL JS 3.x installed
   - Import shared-types from packages/shared-types

2. Implement authentication (apps/admin-dashboard/lib/auth/):
   - msalConfig.ts: MSAL configuration for Entra External ID
   - AuthProvider.tsx: React context wrapping MsalProvider
   - useAuth.ts hook: login, logout, getToken, user profile, role
   - middleware.ts: Protect all /dashboard/* routes, redirect to /auth/signin
   - Role-based route guards: SuperAdmin sees all, SiteManager sees their sites,
     Operator sees their crane, Viewer is read-only

3. Implement Zustand stores (apps/admin-dashboard/stores/):
   - useCraneStore.ts: fleet data, selected crane, real-time telemetry
     Actions: fetchFleet, selectCrane, updateTelemetry (from SignalR)
   - useAlertStore.ts: alerts array, unread count, filters
     Actions: fetchAlerts, addAlert (from SignalR), acknowledgeAlert
   - useAuthStore.ts: user, tokens, role, site assignments

4. Implement SignalR connection (apps/admin-dashboard/lib/signalr.ts):
   - Connect to Azure SignalR via negotiate endpoint
   - Subscribe to events: telemetryUpdate, alertNotification, stateChange,
     craneOnline, craneOffline
   - Auto-reconnect with exponential backoff
   - Update Zustand stores on each event

5. Implement ALL pages from Blueprint Section 11.1:

   a. /dashboard (Fleet Overview):
      - FleetMap component: Mapbox with crane markers (green=normal, yellow=warning, red=critical, gray=offline)
      - Click marker → navigate to crane detail
      - KPI cards row: Total Cranes, Active Operators, Today's Lifts, Safety Score
      - AlertFeed: scrolling list of recent alerts across fleet

   b. /dashboard/crane/[craneId] (Crane Detail):
      - CraneLivePanel: large view with:
        * Live boom camera feed (MJPEG via cloud-proxied URL or direct when on-site)
        * LoadMomentGauge: circular gauge showing current load % with color zones
        * TelemetryChart: 60-second rolling Recharts LineChart for boom angle, load, height
        * Operator status badge (name, photo, PERCLOS score, shift duration)
        * Wind speed indicator
      - Tabs: Live | History | Alerts | Configuration
      - History tab: date range picker → time-series charts from Cosmos DB
      - Alerts tab: filtered alert table for this crane
      - Config tab: calibration values, crane model, sensor status (device twin)

   c. /dashboard/operators (Operator Management):
      - Data table with all operators: name, ID, site, total shifts, avg score, last active
      - Search and filter by site
      - Click row → navigate to operator detail

   d. /dashboard/operators/[operatorId] (Operator Detail):
      - Profile card: photo, name, employee ID, assigned crane, certification date
      - Performance trend chart: 30-day productivity score line chart
      - Shift history table: date, crane, duration, lifts, score, fatigue incidents
      - Calendar heatmap: green (>90), yellow (75-90), red (<75) days

   e. /dashboard/reports:
      - Shift reports: list of PDF reports with download links (from Blob Storage)
      - Safety compliance: pie chart of alert types, resolution times
      - Productivity: bar chart of lifts per crane per day

   f. /dashboard/alerts:
      - Full alert history table with filtering (level, crane, date range, acknowledged)
      - Click to expand → full alert detail with sensor snapshot
      - Acknowledge button (POST /api/alerts/[id]/acknowledge)

   g. /dashboard/settings:
      - Crane management: add/edit/remove cranes, assign to sites
      - Calibration: upload calibration profiles per crane
      - User management: invite operators, assign roles (SuperAdmin only)
      - System health: device twin status for all Jetsons, last sync times

6. Implement API routes (apps/admin-dashboard/app/api/):
   - All routes from Blueprint Section 16.1
   - Each route calls Azure Functions or Cosmos DB directly
   - Authentication middleware on all routes (validate MSAL token)
   - RBAC enforcement: check role before returning data

7. Write tests:
   - Component tests with React Testing Library for each major component
   - API route tests with supertest
   - Store tests (Zustand)

8. Build and test locally: `pnpm --filter admin-dashboard dev`
   Verify all pages render, auth flow works (use test account),
   SignalR connects and receives mock data.

Commit as "feat: implement admin dashboard with fleet overview, crane detail, operator management"
```

---

## PHASE 6: Operator Tablet PWA

```
Read MOSY_BLUEPRINT.md Section 12 (Operator Tablet PWA) completely.

1. Initialize apps/tablet-pwa/ as a React + Vite PWA project:
   - TypeScript strict mode
   - Tailwind CSS 4.1
   - Workbox for service worker (offline-first caching)
   - Import shared-types from packages/shared-types

2. Implement Guidance Mode (primary screen — landscape only):
   - CameraFeed: full-screen MJPEG stream from Jetson (ws://192.168.4.1:8080/boom)
   - HUD Overlay (semi-transparent, non-obstructive):
     * Top-left: Ground clearance from LiDAR (large font, color-coded)
     * Top-right: Load percentage gauge (arc, color zones)
     * Bottom-left: Wind speed with icon (green/yellow/red)
     * Bottom-right: Alert badge (shows count, pulses on new critical)
   - Parking camera guidance lines overlaid on video:
     * Green zone: >10m clearance
     * Yellow zone: 5-10m
     * Red zone: <5m
   - Touch controls: tap to toggle HUD, swipe down for stats mode

3. Implement Stats Mode (secondary screen):
   - OperatorProfile: face thumbnail, name, ID, shift start time
   - DailyStats: lifts today, total tonnage, hours worked, current score
   - WeeklyTrend: 7-day performance score line chart (Recharts)
   - AttendanceCalendar: month view with colored day cells

4. Implement Offline Behavior:
   - Service Worker (Workbox): precache all static assets, runtime cache API calls
   - IndexedDB stores: pending-acks, cached-telemetry, shift-data
   - When offline: show last known data, queue alert acknowledgments
   - Background sync: when connection restored, flush IndexedDB queues
   - Connection status indicator in header

5. Implement MQTT Direct Connection:
   - Connect to Jetson's Mosquitto broker directly (ws://192.168.4.1:9001)
   - Subscribe to: mosy/{crane_id}/telemetry/fused, mosy/{crane_id}/alerts/+
   - Use Eclipse Paho MQTT.js in the browser
   - This is the PRIMARY data source (not cloud API)

6. PWA Manifest:
   - name: "MOSY Operator"
   - display: standalone, orientation: landscape
   - theme_color: #0A0F1C (dark theme matching slide design)
   - Icons for Android home screen

7. Write tests for Guidance Mode HUD calculations and offline sync logic.

8. Test on Chrome DevTools mobile emulation (10" tablet landscape).

Commit as "feat: implement operator tablet PWA with guidance HUD and offline support"
```

---

## PHASE 7: Firmware

```
Read MOSY_BLUEPRINT.md Section 7 (ESP32-S3 Firmware) and Section 8 (RPi 5 Cabin Hub) completely.

1. ESP32-S3 Boom Firmware (firmware/esp32-boom/):
   - PlatformIO project with ESP-IDF 5.5.2 / Arduino 3.3.6 framework
   - platformio.ini with ESP32-S3 board config, serial monitor baud rate
   - src/main.cpp: Setup + FreeRTOS task creation
   - src/sensors/:
     * tf03_lidar.cpp/h: UART at 115200 baud, parse 9-byte frames (0x59 header),
       extract distance in cm, checksum validation
     * bno055_imu.cpp/h: I2C at address 0x29, read quaternions, convert to Euler,
       output boom angle and deflection
     * ld2410_radar.cpp/h: UART at 256000 baud, parse presence/distance data,
       near-field obstacle detection (≤5m)
     * jlfs2_anemometer.cpp/h: ADC read, convert voltage to m/s using
       formula: wind_speed = (voltage - 0.054) * 6.59
   - src/comms/:
     * mqtt_publisher.cpp/h: WiFi connect to MOSY-{crane_id} SSID,
       MQTT connect to Jetson broker (192.168.4.1:1883),
       publish to mosy/{crane_id}/telemetry/boom at 10Hz
     * espnow_fallback.cpp/h: ESP-NOW broadcast as backup when WiFi drops,
       peer MAC address of Jetson's WiFi adapter
   - src/config.h: Pin assignments, crane ID, WiFi credentials, MQTT topics
   - JSON message format matching BoomTelemetryMessage from shared-types
   - Watchdog timer: reboot if no successful MQTT publish in 30 seconds
   - Deep sleep when engine vibration absent for 10 minutes

2. RPi 5 Cabin Hub (firmware/rpi5-cabin/):
   - Python project with systemd service file for auto-start
   - main.py: Async event loop managing all cabin sensors
   - sensors/:
     * bno055_cabin.py: I2C IMU for chassis tilt monitoring
     * gps_reader.py: Serial UART to Neo-6M GPS, NMEA parsing,
       extract lat/lon/speed/satellites
     * vibration_detector.py: GPIO digital read from SW-420,
       detect engine running state
     * joystick_pressure.py: HX711 ADC for load cell on joystick,
       detect active operation vs idle
   - comms/:
     * mqtt_publisher.py: paho-mqtt 2.1.0, connect to Jetson Mosquitto,
       publish mosy/{crane_id}/telemetry/cabin at 10Hz
     * camera_manager.py: Start/stop Hikvision RTSP stream,
       forward to Jetson for PERCLOS processing
   - data/:
     * shift_tracker.py: Track operator check-in/check-out locally
     * config_manager.py: Load/save crane config from JSON
   - requirements.txt with exact pinned versions
   - install.sh: Setup script for RPi 5 (install deps, create systemd service)

3. Write unit tests:
   - ESP32: PlatformIO native test for sensor parsing (mock UART/I2C data)
   - RPi 5: pytest for NMEA parsing, vibration detection logic, MQTT publishing

Commit as "feat: implement ESP32-S3 boom firmware and RPi 5 cabin hub"
```

---

## PHASE 8: Integration & Deployment

```
Read MOSY_BLUEPRINT.md Sections 17-22 (CI/CD, Testing, Security, Monitoring, POC, Production).

1. CI/CD Pipelines (.github/workflows/):
   a. ci.yml — runs on every PR:
      - Lint (ESLint + Ruff)
      - Type check (tsc --noEmit + mypy)
      - Unit tests (vitest + pytest) with coverage thresholds (80%)
      - Build all apps (Next.js, PWA, Docker images)

   b. deploy-functions.yml — deploy Azure Functions on merge to main:
      - Build functions/ workspace
      - Run tests
      - Deploy to Azure Functions App with `func azure functionapp publish`

   c. deploy-dashboard.yml — deploy admin dashboard on merge to main:
      - Build apps/admin-dashboard
      - Deploy to Azure App Service (or Azure Static Web Apps)

   d. build-edge.yml — build edge Docker images on merge to main:
      - Build multi-arch images (linux/amd64 + linux/arm64)
      - Push to Azure Container Registry
      - Tag with git SHA and 'latest'

   e. deploy-edge.yml — manual trigger to update edge deployment:
      - SSH to Jetson (or use IoT Hub direct method)
      - Pull latest images from ACR
      - docker compose up -d

2. E2E Integration Tests (tests/e2e/):
   - Test full data flow: sensor simulator → MQTT → fusion → state machine → IoT Hub → Cosmos DB → SignalR → dashboard
   - Use Docker Compose to spin up all edge services locally
   - Python script that publishes simulated sensor data to MQTT
   - Verify data arrives in Cosmos DB within 5 seconds
   - Verify SignalR broadcasts to a test client
   - Verify alert escalation triggers notification

3. Security hardening:
   - TLS 1.3 on all external endpoints
   - MQTT broker: add authentication (username/password from env vars)
   - Rotate IoT Hub SAS tokens programmatically
   - Azure Key Vault integration for all secrets
   - CSP headers on Next.js app
   - Rate limiting on API routes

4. Monitoring (infra/monitoring/):
   - Prometheus metrics endpoint on each edge service (port 9090)
   - docker-compose.monitoring.yml with Prometheus + Grafana
   - Grafana dashboards: edge service health, MQTT message rates, inference latency
   - Azure Monitor alerts: IoT Hub message quota, Cosmos DB RU consumption, Function errors

5. POC Validation Script (scripts/poc-validate.sh):
   - Start all edge services on laptop
   - Run sensor simulator for 5 minutes
   - Verify:
     * MQTT messages flowing on all topics
     * State machines transitioning correctly
     * Data reaching Cosmos DB
     * Admin dashboard showing live data
     * Alerts triggering on simulated overload
   - Generate validation report

Commit as "feat: CI/CD pipelines, E2E tests, security hardening, monitoring"
```

---

## CONTEXT CONTINUATION PROMPT

If Claude Code runs out of context mid-phase, start a new session with:

```
Read CLAUDE.md and MOSY_BLUEPRINT.md. I am building the MOSY crane IoT system.

We completed: [list completed phases, e.g., "Phases 0-3"]
We are currently on: [current phase, e.g., "Phase 4 — Edge AI Services"]
We stopped at: [describe where you stopped, e.g., "vision-service model loader is done,
need to implement boom_analyzer.py and inference_pipeline.py"]

Continue from where we left off. Check the existing code in the repo to understand
what's already built, then proceed with the remaining work in the current phase.
```

---

## SENSOR SIMULATION PROMPT (For POC Testing Without Hardware)

Use this after Phase 3 is complete to generate realistic test data:

```
Create a sensor simulator (tools/sensor-simulator/) that:

1. Publishes realistic MQTT messages to all telemetry topics at correct frequencies:
   - mosy/POC-001/telemetry/boom at 10Hz (realistic boom angle 15-75°, LiDAR 5-35m,
     wind 0-25 km/h with gusts)
   - mosy/POC-001/telemetry/cabin at 10Hz (GPS coordinates that slowly move,
     engine vibration on/off cycles, joystick activity patterns)
   - mosy/POC-001/telemetry/ocr at 5Hz (dashboard values matching boom telemetry
     with ±2% noise, simulating real OCR reading the actual dashboard)

2. Simulates realistic crane operation patterns:
   - Morning startup sequence (engine on, safety check, first lift)
   - Normal lifting cycle (approach, lift, swing, place, return) lasting 3-5 minutes
   - Idle periods (engine running, no boom movement) of 5-15 minutes
   - Lunch break (engine off, operator check-out, check back in)
   - Afternoon with increasing fatigue (PERCLOS gradually rising)
   - End of shift check-out

3. Simulates fault conditions on demand (via command-line flags):
   - --overload: gradually increase load to 95% capacity
   - --fatigue: simulate PERCLOS rising above 30%
   - --wind-gust: sudden wind spike to 40 km/h
   - --ocr-failure: stop OCR messages (test fallback)
   - --disconnect: temporarily stop all messages (test reconnection)

4. Uses EXACT message schemas from packages/mqtt-schemas Python dataclasses.

This simulator replaces real hardware for the laptop POC demo.
```

---

## NOTES

- Each phase prompt is designed to fit within Claude Code's context window
- Phases are ordered by dependency: infra → backend → edge → AI → frontend → firmware → integration
- The CLAUDE.md file ensures Claude Code remembers project rules across sessions
- The blueprint sections referenced in each phase contain ALL the detail needed
- Always commit after each phase — clean git history enables easy rollback
