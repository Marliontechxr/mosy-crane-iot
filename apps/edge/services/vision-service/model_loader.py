"""MOSY Edge — Moondream 2 VLM model loader.

Uses the official `moondream` Python library (not raw ONNX).
Moondream 2 uses custom .mf.gz format, not standard ONNX files.
Lazy-loads model on first inference to avoid blocking startup.
"""

from __future__ import annotations

import threading
from typing import Optional

from shared.logger import setup_logging

log = setup_logging("model_loader")

_model = None
_model_lock = threading.Lock()
_model_loading = False


def get_model():  # type: ignore[no-untyped-def]
    """Get or lazily initialize the Moondream 2 VLM.

    Thread-safe. First call downloads and loads the model (~1.1GB INT8).
    Subsequent calls return the cached model immediately.

    Returns:
        Moondream VL model instance, or None if loading fails.
    """
    global _model, _model_loading

    if _model is not None:
        return _model

    with _model_lock:
        # Double-check after acquiring lock
        if _model is not None:
            return _model

        if _model_loading:
            log.warning("model_already_loading")
            return None

        _model_loading = True
        log.info("moondream_loading", model="moondream-2b-int8")

        try:
            import moondream as md
            _model = md.vl(model="moondream-2b-int8")
            log.info("moondream_loaded", model="moondream-2b-int8")
            return _model
        except Exception:
            log.exception("moondream_load_failed")
            return None
        finally:
            _model_loading = False


def is_loaded() -> bool:
    """Check if the model is loaded without triggering load."""
    return _model is not None


def release() -> None:
    """Release model from memory."""
    global _model
    with _model_lock:
        _model = None
    log.info("moondream_released")
