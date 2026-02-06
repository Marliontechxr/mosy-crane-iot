# MOSY — Crane IoT Monitoring System

## Project Identity
- **Product**: MOSY (Mobile Crane Operator Safety & Productivity System)
- **Client**: Balanetra Technologies × TCE IT Department
- **Architecture Status**: FROZEN v2.0 — February 2026

## Single Source of Truth
The file `MOSY_BLUEPRINT.md` in this repository root is the **authoritative specification**.
Every decision — tech stack, sensor protocols, database schemas, API contracts, MQTT topics,
component names, Azure resource names — is defined there. **Never deviate from the blueprint
without explicit user approval.**

## Core Architecture Principles
1. **Offline-First, Edge-First**: All safety logic runs on the Jetson locally. Cloud is NEVER in the critical path. Store-and-forward to Azure.
2. **Dashboard OCR is PRIMARY**: The USB camera reading the crane's LMI display is the primary truth source. Sensors are cross-validation, not primary.
3. **No Mock Data, No Placeholders**: Every function must handle real sensor protocols (UART, I2C, analog), real MQTT messages, real Cosmos DB documents. Use typed schemas from the blueprint.
4. **Production-Ready Code Only**: Error handling, retry logic, graceful degradation, logging, and input validation on every function. No TODO comments. No `console.log` debugging left in.

## Tech Stack (Exact Versions — Do Not Upgrade Without Approval)
| Layer | Technology | Version |
|-------|-----------|---------|
| Admin Dashboard | Next.js (App Router) | 16.x |
| Styling | Tailwind CSS | 4.1 |
| Components | shadcn/ui | latest |
| Charts | Recharts | 3.7 |
| State | Zustand | latest |
| Maps | Mapbox GL JS | 3.x |
| Auth | Microsoft Entra External ID (MSAL) | @azure/msal-browser 5.1.0 |
| Cloud DB | Azure Cosmos DB | @azure/cosmos 4.9.0 |
| Cloud Functions | Azure Functions | Node.js 22, v4 programming model |
| Real-time | Azure SignalR Service | @azure/functions 4.7.0 |
| IoT | Azure IoT Hub SDK | azure-iot-device 2.x |
| Edge AI Runtime | ONNX Runtime | 1.23.x |
| Dashboard OCR | PaddleOCR | 3.4 |
| Face Detection | MediaPipe | 0.10.x |
| VLM | Moondream 2 | 0.5B INT8 ONNX |
| Edge OS | Docker Compose | on Ubuntu 22.04 |
| MQTT Broker | Mosquitto | 2.1.1 |
| Boom Firmware | ESP-IDF / Arduino | 5.5.2 / 3.3.6 |
| Cabin Hub | Python on RPi OS Trixie | paho-mqtt 2.1.0 |
| IaC | Bicep | latest |
| CI/CD | GitHub Actions | latest |

## Monorepo Structure
```
mosy/
├── apps/
│   ├── admin-dashboard/     # Next.js 16 App Router
│   ├── tablet-pwa/          # React PWA for operator tablet
│   └── edge/
│       ├── services/        # Python Docker services (Jetson)
│       │   ├── ocr-service/
│       │   ├── vision-service/
│       │   ├── fusion-service/
│       │   ├── safety-service/
│       │   ├── state-engine/
│       │   ├── mqtt-bridge/
│       │   └── iot-agent/
│       ├── docker-compose.yml
│       └── Dockerfile.base
├── firmware/
│   ├── esp32-boom/          # ESP-IDF/Arduino firmware
│   └── rpi5-cabin/          # Python cabin aggregator
├── packages/
│   ├── shared-types/        # TypeScript types shared across apps
│   ├── mqtt-schemas/        # MQTT message schemas (TS + Python)
│   └── ui-components/       # Shared React components
├── infra/
│   ├── bicep/               # Azure infrastructure as code
│   ├── scripts/             # Deployment scripts
│   └── config/              # Environment configs
├── functions/               # Azure Functions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/                    # Generated API docs
├── MOSY_BLUEPRINT.md        # THE source of truth
├── CLAUDE.md                # This file
├── package.json             # Root workspace config
├── turbo.json               # Turborepo config
└── .github/workflows/       # CI/CD pipelines
```

## Development Rules

### Code Quality
- TypeScript strict mode (`"strict": true`) for all TS code
- Python type hints on every function (mypy strict)
- ESLint + Prettier for TS/JS (config in root)
- Ruff for Python linting
- No `any` types in TypeScript — use proper generics or unknown
- Every public function has a JSDoc/docstring comment
- Error boundaries in every React page component

### Testing Requirements
- Unit tests for every utility function and service method
- Integration tests for API routes (supertest)
- Edge service tests with pytest + pytest-asyncio
- Firmware tests with Unity framework (PlatformIO)
- Minimum 80% code coverage before merge

### Git Conventions
- Branch naming: `feat/`, `fix/`, `infra/`, `edge/`, `firmware/`
- Commit messages: conventional commits (`feat:`, `fix:`, `chore:`, `infra:`)
- PR required for main branch — no direct pushes
- Each phase = one feature branch → squash merge to main

### Azure Conventions
- Resource Group: `rg-mosy-prod` (production), `rg-mosy-dev` (development)
- Naming: `mosy-{service}-{env}` (e.g., `mosy-iothub-prod`, `mosy-cosmos-dev`)
- Region: South India (`southindia`)
- Tags: `project=mosy`, `env=prod|dev`, `owner=balanetra`
- All secrets in Azure Key Vault — never in code or env files committed to git

### Docker Conventions (Edge Services)
- Base image: `nvcr.io/nvidia/l4t-ml:r36.4.0-py3` for Jetson, `python:3.11-slim` for x86 POC
- Multi-stage builds (builder → runtime)
- Non-root user in all containers
- Health checks on every service
- Resource limits defined in docker-compose.yml

## Phase Execution Order
This project is built in 8 phases. Each phase must be COMPLETE and TESTED before moving to the next:

1. **Foundation** — Monorepo setup, shared types, infrastructure provisioning
2. **Azure Backend** — IoT Hub, Cosmos DB, Functions, SignalR
3. **Edge Core** — MQTT broker, sensor fusion, state machines, SQLite
4. **Edge AI** — Dashboard OCR, Moondream 2, PERCLOS
5. **Admin Dashboard** — Next.js pages, real-time telemetry, fleet management
6. **Operator Tablet** — PWA with camera feeds, HUD overlay, offline mode
7. **Firmware** — ESP32-S3 boom unit, RPi 5 cabin hub
8. **Integration & Deployment** — E2E testing, CI/CD, production deploy

## Important Notes for Claude Code
- Azure CLI is already authenticated. Use `az` commands directly.
- When creating Azure resources, always use Bicep templates in `infra/bicep/`.
- For the POC, edge services run on x86 (laptop). Use CPU ONNX Runtime, not CUDA.
- The tablet PWA connects to the Jetson's local network (192.168.4.x), NOT the cloud.
- Camera feeds on the tablet are MJPEG streams from the Jetson, not cloud-proxied.
- WhatsApp notifications use the WhatsApp Business API via Azure Communication Services.
- All MQTT topics start with `mosy/{crane_id}/` — see Blueprint Section 9.
- All Cosmos DB containers are in database `mosydb` — see Blueprint Section 15.
- All API routes are under `/api/` in the Next.js app — see Blueprint Section 16.
