"""MOSY Edge — Structured JSON logging with correlation IDs."""

from __future__ import annotations

import logging
import os
import uuid

import structlog


def _generate_correlation_id() -> str:
    return uuid.uuid4().hex[:12]


_correlation_id: str = _generate_correlation_id()


def get_correlation_id() -> str:
    return _correlation_id


def new_correlation_id() -> str:
    global _correlation_id
    _correlation_id = _generate_correlation_id()
    return _correlation_id


def setup_logging(service_name: str) -> structlog.stdlib.BoundLogger:
    """Configure structured JSON logging for an edge service."""
    log_level = getattr(logging, os.environ.get("LOG_LEVEL", "INFO").upper(), logging.INFO)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.stdlib.add_log_level,
            structlog.stdlib.add_logger_name,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.stdlib.BoundLogger,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    logging.basicConfig(format="%(message)s", level=log_level)

    logger: structlog.stdlib.BoundLogger = structlog.get_logger(
        service=service_name,
        crane_id=os.environ.get("CRANE_ID", "UNKNOWN"),
    )
    return logger
