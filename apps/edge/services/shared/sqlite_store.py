"""MOSY Edge — SQLite wrapper for local data (telemetry buffer, config)."""

from __future__ import annotations

import json
import os
import sqlite3
import threading
import time
from typing import Any, Dict, List, Optional

from shared.logger import setup_logging

log = setup_logging("sqlite_store")


class SQLiteStore:
    """Thread-safe SQLite store for buffering telemetry and alerts offline."""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or os.environ.get("SQLITE_DB_PATH", "/app/data/bridge.db")
        self._lock = threading.RLock()
        self._init_database()

    def _init_database(self) -> None:
        os.makedirs(os.path.dirname(self.db_path), exist_ok=True)
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS message_buffer (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        timestamp INTEGER NOT NULL,
                        crane_id TEXT NOT NULL,
                        topic TEXT NOT NULL,
                        payload TEXT NOT NULL,
                        sent INTEGER DEFAULT 0,
                        created_at REAL DEFAULT (strftime('%s', 'now'))
                    )
                """)
                conn.execute("""
                    CREATE INDEX IF NOT EXISTS idx_buffer_unsent
                    ON message_buffer(sent, timestamp)
                """)
                conn.execute("""
                    CREATE TABLE IF NOT EXISTS config_store (
                        key TEXT PRIMARY KEY,
                        value TEXT NOT NULL,
                        updated_at REAL DEFAULT (strftime('%s', 'now'))
                    )
                """)
                conn.commit()
                log.info("sqlite_initialized", db_path=self.db_path)
            finally:
                conn.close()

    def buffer_message(
        self, crane_id: str, topic: str, payload: Dict[str, Any], timestamp: int
    ) -> int:
        """Store a message in the buffer for later forwarding. Returns row id."""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.execute(
                    "INSERT INTO message_buffer (timestamp, crane_id, topic, payload) VALUES (?, ?, ?, ?)",
                    (timestamp, crane_id, topic, json.dumps(payload)),
                )
                conn.commit()
                return cursor.lastrowid or 0
            finally:
                conn.close()

    def get_unsent_messages(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Retrieve unsent messages in FIFO order."""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                conn.row_factory = sqlite3.Row
                rows = conn.execute(
                    "SELECT id, timestamp, crane_id, topic, payload FROM message_buffer WHERE sent = 0 ORDER BY timestamp ASC LIMIT ?",
                    (limit,),
                ).fetchall()
                return [
                    {
                        "id": row["id"],
                        "timestamp": row["timestamp"],
                        "crane_id": row["crane_id"],
                        "topic": row["topic"],
                        "payload": json.loads(row["payload"]),
                    }
                    for row in rows
                ]
            finally:
                conn.close()

    def mark_sent(self, message_ids: List[int]) -> None:
        """Mark messages as successfully sent."""
        if not message_ids:
            return
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                placeholders = ",".join("?" for _ in message_ids)
                conn.execute(
                    f"UPDATE message_buffer SET sent = 1 WHERE id IN ({placeholders})",
                    message_ids,
                )
                conn.commit()
            finally:
                conn.close()

    def cleanup_old(self, max_age_days: int = 7) -> int:
        """Delete sent messages older than max_age_days. Returns count deleted."""
        cutoff = time.time() - (max_age_days * 86400)
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                cursor = conn.execute(
                    "DELETE FROM message_buffer WHERE sent = 1 AND created_at < ?",
                    (cutoff,),
                )
                conn.commit()
                return cursor.rowcount
            finally:
                conn.close()

    def get_buffer_stats(self) -> Dict[str, int]:
        """Return buffer statistics."""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                total = conn.execute("SELECT COUNT(*) FROM message_buffer").fetchone()[0]
                unsent = conn.execute("SELECT COUNT(*) FROM message_buffer WHERE sent = 0").fetchone()[0]
                return {"total": total, "unsent": unsent, "sent": total - unsent}
            finally:
                conn.close()

    def set_config(self, key: str, value: Any) -> None:
        """Store a config value."""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                conn.execute(
                    "INSERT OR REPLACE INTO config_store (key, value, updated_at) VALUES (?, ?, ?)",
                    (key, json.dumps(value), time.time()),
                )
                conn.commit()
            finally:
                conn.close()

    def get_config(self, key: str, default: Any = None) -> Any:
        """Retrieve a config value."""
        with self._lock:
            conn = sqlite3.connect(self.db_path)
            try:
                row = conn.execute(
                    "SELECT value FROM config_store WHERE key = ?", (key,)
                ).fetchone()
                return json.loads(row[0]) if row else default
            finally:
                conn.close()
