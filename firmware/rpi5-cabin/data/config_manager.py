"""
Config manager — load/save crane configuration from YAML.
Blueprint Section 8 — runtime configuration for cabin hub.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Optional

import yaml

logger = logging.getLogger(__name__)


class ConfigManager:
    """Load and manage cabin hub configuration from YAML file."""

    def __init__(self, config_path: str = "config.yaml") -> None:
        self._path = config_path
        self._config: dict[str, Any] = {}

    def load(self) -> bool:
        """Load configuration from YAML file. Returns True on success."""
        if not os.path.exists(self._path):
            logger.error("Config file not found: %s", self._path)
            return False

        try:
            with open(self._path, "r") as f:
                self._config = yaml.safe_load(f) or {}

            logger.info("Configuration loaded from %s", self._path)
            return True

        except Exception as e:
            logger.error("Failed to load config: %s", e)
            return False

    def get(self, key: str, default: Any = None) -> Any:
        """
        Get a configuration value by dot-separated key path.

        Example: config.get("mqtt.broker") → "192.168.4.1"
        """
        keys = key.split(".")
        value = self._config
        for k in keys:
            if isinstance(value, dict):
                value = value.get(k)
            else:
                return default
            if value is None:
                return default
        return value

    @property
    def raw(self) -> dict[str, Any]:
        """Get the full raw configuration dictionary."""
        return self._config
