"""Tests for the SQLite Store — message buffer and config persistence."""

from __future__ import annotations

import os
import tempfile
import time

import pytest

from shared.sqlite_store import SQLiteStore


@pytest.fixture
def store(tmp_path: str) -> SQLiteStore:
    """Create a SQLiteStore with a temporary database file."""
    db_path = os.path.join(str(tmp_path), "test.db")
    return SQLiteStore(db_path=db_path)


class TestBufferMessage:
    def test_buffer_and_retrieve(self, store: SQLiteStore) -> None:
        row_id = store.buffer_message(
            crane_id="TEST-001",
            topic="mosy/TEST-001/telemetry/fused",
            payload={"load": 10.5, "status": "valid"},
            timestamp=int(time.time()),
        )
        assert row_id > 0

        messages = store.get_unsent_messages(limit=10)
        assert len(messages) == 1
        assert messages[0]["crane_id"] == "TEST-001"
        assert messages[0]["payload"]["load"] == 10.5

    def test_fifo_order(self, store: SQLiteStore) -> None:
        now = int(time.time())
        store.buffer_message("CRANE", "topic/a", {"seq": 1}, now)
        store.buffer_message("CRANE", "topic/a", {"seq": 2}, now + 1)
        store.buffer_message("CRANE", "topic/a", {"seq": 3}, now + 2)

        messages = store.get_unsent_messages(limit=10)
        assert len(messages) == 3
        assert messages[0]["payload"]["seq"] == 1
        assert messages[2]["payload"]["seq"] == 3

    def test_limit_respected(self, store: SQLiteStore) -> None:
        now = int(time.time())
        for i in range(20):
            store.buffer_message("CRANE", "topic/a", {"seq": i}, now + i)

        messages = store.get_unsent_messages(limit=5)
        assert len(messages) == 5


class TestMarkSent:
    def test_mark_sent_removes_from_unsent(self, store: SQLiteStore) -> None:
        now = int(time.time())
        store.buffer_message("CRANE", "topic/a", {"seq": 1}, now)
        store.buffer_message("CRANE", "topic/a", {"seq": 2}, now + 1)

        messages = store.get_unsent_messages()
        assert len(messages) == 2

        store.mark_sent([messages[0]["id"]])
        remaining = store.get_unsent_messages()
        assert len(remaining) == 1
        assert remaining[0]["payload"]["seq"] == 2

    def test_mark_empty_list(self, store: SQLiteStore) -> None:
        store.mark_sent([])  # Should not raise


class TestCleanup:
    def test_cleanup_old_sent_messages(self, store: SQLiteStore) -> None:
        now = int(time.time())
        store.buffer_message("CRANE", "topic/a", {"seq": 1}, now)

        messages = store.get_unsent_messages()
        store.mark_sent([messages[0]["id"]])

        # Cleanup with 0 days = delete everything sent
        deleted = store.cleanup_old(max_age_days=0)
        assert deleted == 1

    def test_cleanup_preserves_unsent(self, store: SQLiteStore) -> None:
        now = int(time.time())
        store.buffer_message("CRANE", "topic/a", {"seq": 1}, now)

        deleted = store.cleanup_old(max_age_days=0)
        assert deleted == 0  # Unsent messages not deleted

        messages = store.get_unsent_messages()
        assert len(messages) == 1


class TestBufferStats:
    def test_stats_empty_db(self, store: SQLiteStore) -> None:
        stats = store.get_buffer_stats()
        assert stats["total"] == 0
        assert stats["unsent"] == 0
        assert stats["sent"] == 0

    def test_stats_with_messages(self, store: SQLiteStore) -> None:
        now = int(time.time())
        store.buffer_message("CRANE", "topic/a", {"seq": 1}, now)
        store.buffer_message("CRANE", "topic/a", {"seq": 2}, now + 1)

        messages = store.get_unsent_messages()
        store.mark_sent([messages[0]["id"]])

        stats = store.get_buffer_stats()
        assert stats["total"] == 2
        assert stats["unsent"] == 1
        assert stats["sent"] == 1


class TestConfigStore:
    def test_set_and_get_config(self, store: SQLiteStore) -> None:
        store.set_config("rated_capacity", 25.0)
        assert store.get_config("rated_capacity") == 25.0

    def test_get_missing_config_returns_default(self, store: SQLiteStore) -> None:
        assert store.get_config("nonexistent") is None
        assert store.get_config("nonexistent", default=42) == 42

    def test_config_overwrite(self, store: SQLiteStore) -> None:
        store.set_config("key", "value1")
        store.set_config("key", "value2")
        assert store.get_config("key") == "value2"

    def test_config_complex_value(self, store: SQLiteStore) -> None:
        config = {"thresholds": {"load": 25.0, "wind": 72.0}, "enabled": True}
        store.set_config("safety", config)
        retrieved = store.get_config("safety")
        assert retrieved == config
        assert retrieved["thresholds"]["load"] == 25.0
