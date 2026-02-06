"""Pytest conftest — map hyphenated service dirs to Python-importable names."""

from __future__ import annotations

import os
import sys

# Root of the edge services
SERVICES_DIR = os.path.join(os.path.dirname(__file__), "services")

# Map hyphenated directories to underscore module names via sys.path manipulation
# In Docker, volumes mount these as /app/fusion_service etc.
# For local testing, we add the services dir (for shared/) and create module aliases.
_SERVICE_MAP = {
    "fusion-service": "fusion_service",
    "state-engine": "state_engine",
    "mqtt-bridge": "mqtt_bridge",
    "iot-agent": "iot_agent",
    "ocr-service": "ocr_service",
    "vision-service": "vision_service",
    "safety-service": "safety_service",
}

# Add services dir for shared/ imports
if SERVICES_DIR not in sys.path:
    sys.path.insert(0, SERVICES_DIR)

# Add each hyphenated service dir and register under the underscore alias
for hyphen_name, underscore_name in _SERVICE_MAP.items():
    service_path = os.path.join(SERVICES_DIR, hyphen_name)
    if os.path.isdir(service_path) and service_path not in sys.path:
        sys.path.insert(0, service_path)

    # Also register the package directory under the underscore name
    # so 'from fusion_service.fusion_engine import ...' works
    if underscore_name not in sys.modules:
        import importlib
        spec = importlib.util.spec_from_file_location(
            underscore_name,
            os.path.join(service_path, "__init__.py"),
            submodule_search_locations=[service_path],
        )
        if spec and spec.loader:
            mod = importlib.util.module_from_spec(spec)
            sys.modules[underscore_name] = mod
            mod.__path__ = [service_path]  # type: ignore[attr-defined]
