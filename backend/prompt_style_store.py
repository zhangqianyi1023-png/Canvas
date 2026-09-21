"""SQLite persistence for official prompt styles."""

from __future__ import annotations

from typing import Optional
import os
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex}"


class PromptStyleStore:
    def __init__(self, database_path: str):
        self.database_path = str(Path(database_path).resolve())
        os.makedirs(os.path.dirname(self.database_path), exist_ok=True)
        self.connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self._lock = threading.RLock()
        self._create_schema()

    def close(self):
        self.connection.close()

    def _create_schema(self):
        with self._lock:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS prompt_styles (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    category TEXT NOT NULL DEFAULT '',
                    prompt TEXT NOT NULL,
                    cover_url TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );
                CREATE INDEX IF NOT EXISTS idx_prompt_styles_public
                    ON prompt_styles(enabled, deleted_at, category, sort_order);
                """
            )
            self.connection.commit()

    @staticmethod
    def _style(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "category": row["category"],
            "prompt": row["prompt"],
            "coverUrl": row["cover_url"],
            "sortOrder": row["sort_order"],
            "enabled": bool(row["enabled"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "deletedAt": row["deleted_at"],
        }

    def _require_style(self, style_id: str) -> sqlite3.Row:
        row = self.connection.execute(
            "SELECT * FROM prompt_styles WHERE id = ? AND deleted_at IS NULL",
            (style_id,),
        ).fetchone()
        if not row:
            raise KeyError("风格提示词不存在")
        return row

    def create_style(self, payload: dict[str, Any]) -> dict:
        name = str(payload.get("name") or "").strip()
        prompt = str(payload.get("prompt") or "").strip()
        if not name:
            raise ValueError("风格名称不能为空")
        if not prompt:
            raise ValueError("提示词内容不能为空")
        now = _utc_now()
        style_id = str(payload.get("id") or _new_id("style"))
        with self._lock:
            self.connection.execute(
                """
                INSERT INTO prompt_styles (
                    id, name, category, prompt, cover_url, sort_order,
                    enabled, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    style_id,
                    name,
                    str(payload.get("category") or "").strip(),
                    prompt,
                    str(payload.get("coverUrl") or "").strip(),
                    int(payload.get("sortOrder") or 0),
                    0 if payload.get("enabled") is False else 1,
                    now,
                    now,
                ),
            )
            self.connection.commit()
        return self.get_style(style_id)

    def get_style(self, style_id: str) -> dict:
        with self._lock:
            return self._style(self._require_style(style_id))

    def update_style(self, style_id: str, payload: dict[str, Any]) -> dict:
        with self._lock:
            row = self._require_style(style_id)
            name = str(payload.get("name", row["name"]) or "").strip()
            prompt = str(payload.get("prompt", row["prompt"]) or "").strip()
            if not name:
                raise ValueError("风格名称不能为空")
            if not prompt:
                raise ValueError("提示词内容不能为空")
            self.connection.execute(
                """
                UPDATE prompt_styles
                SET name = ?, category = ?, prompt = ?, cover_url = ?,
                    sort_order = ?, enabled = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    name,
                    str(payload.get("category", row["category"]) or "").strip(),
                    prompt,
                    str(payload.get("coverUrl", row["cover_url"]) or "").strip(),
                    int(payload.get("sortOrder", row["sort_order"])),
                    0 if payload.get("enabled", bool(row["enabled"])) is False else 1,
                    _utc_now(),
                    style_id,
                ),
            )
            self.connection.commit()
        return self.get_style(style_id)

    def delete_style(self, style_id: str):
        with self._lock:
            self._require_style(style_id)
            now = _utc_now()
            self.connection.execute(
                """
                UPDATE prompt_styles
                SET enabled = 0, deleted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, style_id),
            )
            self.connection.commit()

    def list_styles(
        self,
        category: Optional[str] = None,
        include_disabled: bool = True,
    ) -> list[dict]:
        clauses = ["deleted_at IS NULL"]
        params: list[Any] = []
        if category:
            clauses.append("category = ?")
            params.append(category)
        if not include_disabled:
            clauses.append("enabled = 1")
        sql = "SELECT * FROM prompt_styles WHERE " + " AND ".join(clauses)
        sql += " ORDER BY category ASC, sort_order ASC, updated_at DESC"
        with self._lock:
            rows = self.connection.execute(sql, params).fetchall()
            return [self._style(row) for row in rows]

    def list_public_styles(self, category: Optional[str] = None) -> list[dict]:
        return self.list_styles(category=category, include_disabled=False)
