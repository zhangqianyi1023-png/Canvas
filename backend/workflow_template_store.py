"""SQLite persistence for official workflow templates."""

from __future__ import annotations
from typing import Optional

import json
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


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: Optional[str], fallback=None):
    if not value:
        return fallback
    return json.loads(value)


class WorkflowTemplateStore:
    def __init__(self, database_path: str):
        self.database_path = str(Path(database_path).resolve())
        os.makedirs(os.path.dirname(self.database_path), exist_ok=True)
        self.connection = sqlite3.connect(self.database_path, check_same_thread=False)
        self.connection.row_factory = sqlite3.Row
        self.connection.execute("PRAGMA foreign_keys = ON")
        self._lock = threading.RLock()
        self._create_schema()

    def close(self):
        self.connection.close()

    def _create_schema(self):
        with self._lock:
            self.connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS template_categories (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    enabled INTEGER NOT NULL DEFAULT 1,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );
                CREATE TABLE IF NOT EXISTS workflow_templates (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    category_id TEXT NOT NULL,
                    cover_url TEXT NOT NULL DEFAULT '',
                    sort_order INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'draft',
                    current_version_id TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT,
                    FOREIGN KEY(category_id) REFERENCES template_categories(id)
                );
                CREATE TABLE IF NOT EXISTS workflow_template_drafts (
                    template_id TEXT PRIMARY KEY,
                    workflow_json TEXT NOT NULL,
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    updated_at TEXT NOT NULL,
                    FOREIGN KEY(template_id) REFERENCES workflow_templates(id)
                );
                CREATE TABLE IF NOT EXISTS workflow_template_versions (
                    id TEXT PRIMARY KEY,
                    template_id TEXT NOT NULL,
                    version_number INTEGER NOT NULL,
                    workflow_json TEXT NOT NULL,
                    schema_version INTEGER NOT NULL DEFAULT 1,
                    cover_url TEXT NOT NULL DEFAULT '',
                    published_at TEXT NOT NULL,
                    UNIQUE(template_id, version_number),
                    FOREIGN KEY(template_id) REFERENCES workflow_templates(id)
                );
                CREATE INDEX IF NOT EXISTS idx_templates_category
                    ON workflow_templates(category_id, deleted_at, sort_order);
                CREATE INDEX IF NOT EXISTS idx_versions_template
                    ON workflow_template_versions(template_id, version_number);
                """
            )
            category_columns = {
                row["name"]
                for row in self.connection.execute("PRAGMA table_info(template_categories)")
            }
            if "deleted_at" not in category_columns:
                self.connection.execute(
                    "ALTER TABLE template_categories ADD COLUMN deleted_at TEXT"
                )
            self.connection.commit()

    @staticmethod
    def _category(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "sortOrder": row["sort_order"],
            "enabled": bool(row["enabled"]),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "deletedAt": row["deleted_at"] if "deleted_at" in row.keys() else None,
        }

    @staticmethod
    def _template(row: sqlite3.Row) -> dict:
        return {
            "id": row["id"],
            "name": row["name"],
            "description": row["description"],
            "categoryId": row["category_id"],
            "categoryName": row["category_name"] if "category_name" in row.keys() else "",
            "coverUrl": row["cover_url"],
            "sortOrder": row["sort_order"],
            "status": row["status"],
            "currentPublishedVersionId": row["current_version_id"],
            "currentVersionNumber": (
                row["current_version_number"]
                if "current_version_number" in row.keys()
                else None
            ),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "deletedAt": row["deleted_at"],
        }

    @staticmethod
    def _version(row: sqlite3.Row, include_workflow: bool = True) -> dict:
        result = {
            "id": row["id"],
            "templateId": row["template_id"],
            "versionNumber": row["version_number"],
            "schemaVersion": row["schema_version"],
            "coverUrl": row["cover_url"],
            "publishedAt": row["published_at"],
        }
        if include_workflow:
            result["workflowData"] = _json_load(row["workflow_json"], {})
        return result

    def _require_category(self, category_id: str) -> sqlite3.Row:
        row = self.connection.execute(
            "SELECT * FROM template_categories WHERE id = ? AND deleted_at IS NULL",
            (category_id,),
        ).fetchone()
        if not row:
            raise KeyError("模板分组不存在")
        return row

    def _require_template(self, template_id: str, include_deleted: bool = False) -> sqlite3.Row:
        sql = "SELECT * FROM workflow_templates WHERE id = ?"
        params: tuple[Any, ...] = (template_id,)
        if not include_deleted:
            sql += " AND deleted_at IS NULL"
        row = self.connection.execute(sql, params).fetchone()
        if not row:
            raise KeyError("模板不存在")
        return row

    def create_category(self, payload: dict) -> dict:
        name = str(payload.get("name") or "").strip()
        if not name:
            raise ValueError("分组名称不能为空")
        now = _utc_now()
        category_id = str(payload.get("id") or _new_id("category"))
        with self._lock:
            self.connection.execute(
                """
                INSERT INTO template_categories
                    (id, name, sort_order, enabled, created_at, updated_at, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL)
                """,
                (
                    category_id,
                    name,
                    int(payload.get("sortOrder") or 0),
                    0 if payload.get("enabled") is False else 1,
                    now,
                    now,
                ),
            )
            self.connection.commit()
        return self.get_category(category_id)

    def get_category(self, category_id: str) -> dict:
        with self._lock:
            return self._category(self._require_category(category_id))

    def update_category(self, category_id: str, payload: dict) -> dict:
        with self._lock:
            row = self._require_category(category_id)
            name = str(payload.get("name", row["name"]) or "").strip()
            if not name:
                raise ValueError("分组名称不能为空")
            self.connection.execute(
                """
                UPDATE template_categories
                SET name = ?, sort_order = ?, enabled = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    name,
                    int(payload.get("sortOrder", row["sort_order"])),
                    int(bool(payload.get("enabled", bool(row["enabled"])))),
                    _utc_now(),
                    category_id,
                ),
            )
            self.connection.commit()
        return self.get_category(category_id)

    def list_categories(self, include_disabled: bool = True) -> list[dict]:
        sql = "SELECT * FROM template_categories WHERE deleted_at IS NULL"
        if not include_disabled:
            sql += " AND enabled = 1"
        sql += " ORDER BY sort_order ASC, created_at ASC"
        with self._lock:
            return [self._category(row) for row in self.connection.execute(sql).fetchall()]

    def delete_category(self, category_id: str):
        with self._lock:
            self._require_category(category_id)
            count = self.connection.execute(
                """
                SELECT COUNT(*) AS count FROM workflow_templates
                WHERE category_id = ? AND deleted_at IS NULL
                """,
                (category_id,),
            ).fetchone()["count"]
            if count:
                raise ValueError("分组下仍有模板，不能删除")
            now = _utc_now()
            self.connection.execute(
                """
                UPDATE template_categories
                SET enabled = 0, deleted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, category_id),
            )
            self.connection.commit()

    def create_template(self, payload: dict) -> dict:
        name = str(payload.get("name") or "").strip()
        category_id = str(payload.get("categoryId") or "").strip()
        if not name:
            raise ValueError("模板名称不能为空")
        if not category_id:
            raise ValueError("模板必须选择类型分组")
        now = _utc_now()
        template_id = str(payload.get("id") or _new_id("template"))
        with self._lock:
            self._require_category(category_id)
            self.connection.execute(
                """
                INSERT INTO workflow_templates (
                    id, name, description, category_id, cover_url, sort_order,
                    status, current_version_id, created_at, updated_at, deleted_at
                ) VALUES (?, ?, ?, ?, ?, ?, 'draft', NULL, ?, ?, NULL)
                """,
                (
                    template_id,
                    name,
                    str(payload.get("description") or "").strip(),
                    category_id,
                    str(payload.get("coverUrl") or "").strip(),
                    int(payload.get("sortOrder") or 0),
                    now,
                    now,
                ),
            )
            self.connection.commit()
        return self.get_template(template_id)

    def update_template(self, template_id: str, payload: dict) -> dict:
        with self._lock:
            row = self._require_template(template_id)
            category_id = str(payload.get("categoryId", row["category_id"]) or "").strip()
            self._require_category(category_id)
            name = str(payload.get("name", row["name"]) or "").strip()
            if not name:
                raise ValueError("模板名称不能为空")
            self.connection.execute(
                """
                UPDATE workflow_templates
                SET name = ?, description = ?, category_id = ?, cover_url = ?,
                    sort_order = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    name,
                    str(payload.get("description", row["description"]) or "").strip(),
                    category_id,
                    str(payload.get("coverUrl", row["cover_url"]) or "").strip(),
                    int(payload.get("sortOrder", row["sort_order"])),
                    _utc_now(),
                    template_id,
                ),
            )
            self.connection.commit()
        return self.get_template(template_id)

    def _template_select(self) -> str:
        return """
            SELECT t.*, c.name AS category_name, v.version_number AS current_version_number
            FROM workflow_templates t
            JOIN template_categories c ON c.id = t.category_id
            LEFT JOIN workflow_template_versions v ON v.id = t.current_version_id
        """

    def get_template(self, template_id: str, include_deleted: bool = False) -> dict:
        sql = self._template_select() + " WHERE t.id = ?"
        if not include_deleted:
            sql += " AND t.deleted_at IS NULL"
        with self._lock:
            row = self.connection.execute(sql, (template_id,)).fetchone()
            if not row:
                raise KeyError("模板不存在")
            return self._template(row)

    def list_templates(
        self,
        category_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> list[dict]:
        clauses = ["t.deleted_at IS NULL"]
        params: list[Any] = []
        if category_id:
            clauses.append("t.category_id = ?")
            params.append(category_id)
        if status:
            clauses.append("t.status = ?")
            params.append(status)
        sql = self._template_select()
        sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY c.sort_order ASC, t.sort_order ASC, t.updated_at DESC"
        with self._lock:
            rows = self.connection.execute(sql, params).fetchall()
            return [self._template(row) for row in rows]

    def save_draft(self, template_id: str, workflow_data: dict) -> dict:
        schema_version = int(workflow_data.get("schemaVersion") or 1)
        now = _utc_now()
        with self._lock:
            self._require_template(template_id)
            self.connection.execute(
                """
                INSERT INTO workflow_template_drafts
                    (template_id, workflow_json, schema_version, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(template_id) DO UPDATE SET
                    workflow_json = excluded.workflow_json,
                    schema_version = excluded.schema_version,
                    updated_at = excluded.updated_at
                """,
                (template_id, _json_dump(workflow_data), schema_version, now),
            )
            self.connection.execute(
                "UPDATE workflow_templates SET updated_at = ? WHERE id = ?",
                (now, template_id),
            )
            self.connection.commit()
        return self.get_draft(template_id)

    def get_draft(self, template_id: str) -> dict:
        with self._lock:
            self._require_template(template_id)
            row = self.connection.execute(
                "SELECT * FROM workflow_template_drafts WHERE template_id = ?",
                (template_id,),
            ).fetchone()
            if not row:
                return {
                    "templateId": template_id,
                    "workflowData": {
                        "schemaVersion": 1,
                        "nodes": [],
                        "edges": [],
                        "viewport": {"x": 0, "y": 0, "zoom": 1},
                        "pairs": [],
                    },
                    "schemaVersion": 1,
                    "updatedAt": None,
                }
            return {
                "templateId": row["template_id"],
                "workflowData": _json_load(row["workflow_json"], {}),
                "schemaVersion": row["schema_version"],
                "updatedAt": row["updated_at"],
            }

    def publish(self, template_id: str) -> dict:
        with self._lock:
            template = self._require_template(template_id)
            draft = self.connection.execute(
                "SELECT * FROM workflow_template_drafts WHERE template_id = ?",
                (template_id,),
            ).fetchone()
            if not draft:
                raise ValueError("模板尚未保存草稿")
            version_number = self.connection.execute(
                """
                SELECT COALESCE(MAX(version_number), 0) + 1 AS next_version
                FROM workflow_template_versions WHERE template_id = ?
                """,
                (template_id,),
            ).fetchone()["next_version"]
            version_id = _new_id("version")
            now = _utc_now()
            try:
                self.connection.execute("BEGIN IMMEDIATE")
                self.connection.execute(
                    """
                    INSERT INTO workflow_template_versions (
                        id, template_id, version_number, workflow_json,
                        schema_version, cover_url, published_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        version_id,
                        template_id,
                        version_number,
                        draft["workflow_json"],
                        draft["schema_version"],
                        template["cover_url"],
                        now,
                    ),
                )
                self.connection.execute(
                    """
                    UPDATE workflow_templates
                    SET status = 'published', current_version_id = ?, updated_at = ?
                    WHERE id = ?
                    """,
                    (version_id, now, template_id),
                )
                self.connection.commit()
            except Exception:
                self.connection.rollback()
                raise
            row = self.connection.execute(
                "SELECT * FROM workflow_template_versions WHERE id = ?",
                (version_id,),
            ).fetchone()
            return self._version(row)

    def unpublish(self, template_id: str) -> dict:
        with self._lock:
            self._require_template(template_id)
            self.connection.execute(
                """
                UPDATE workflow_templates
                SET status = 'unpublished', updated_at = ?
                WHERE id = ?
                """,
                (_utc_now(), template_id),
            )
            self.connection.commit()
        return self.get_template(template_id)

    def soft_delete_template(self, template_id: str):
        with self._lock:
            self._require_template(template_id)
            now = _utc_now()
            self.connection.execute(
                """
                UPDATE workflow_templates
                SET status = 'deleted', deleted_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (now, now, template_id),
            )
            self.connection.commit()

    def list_versions(self, template_id: str) -> list[dict]:
        with self._lock:
            self._require_template(template_id)
            rows = self.connection.execute(
                """
                SELECT * FROM workflow_template_versions
                WHERE template_id = ?
                ORDER BY version_number DESC
                """,
                (template_id,),
            ).fetchall()
            return [self._version(row) for row in rows]

    def list_public_categories(self) -> list[dict]:
        with self._lock:
            rows = self.connection.execute(
                """
                SELECT DISTINCT c.*
                FROM template_categories c
                JOIN workflow_templates t ON t.category_id = c.id
                WHERE c.enabled = 1
                  AND c.deleted_at IS NULL
                  AND t.status = 'published'
                  AND t.deleted_at IS NULL
                  AND t.current_version_id IS NOT NULL
                ORDER BY c.sort_order ASC, c.created_at ASC
                """
            ).fetchall()
            return [self._category(row) for row in rows]

    def list_public_templates(self, category_id: Optional[str] = None) -> list[dict]:
        clauses = [
            "c.enabled = 1",
            "c.deleted_at IS NULL",
            "t.status = 'published'",
            "t.deleted_at IS NULL",
            "t.current_version_id IS NOT NULL",
        ]
        params: list[Any] = []
        if category_id:
            clauses.append("t.category_id = ?")
            params.append(category_id)
        sql = self._template_select()
        sql += " WHERE " + " AND ".join(clauses)
        sql += " ORDER BY c.sort_order ASC, t.sort_order ASC, t.updated_at DESC"
        with self._lock:
            rows = self.connection.execute(sql, params).fetchall()
            return [self._template(row) for row in rows]

    def get_public_template(self, template_id: str) -> dict:
        with self._lock:
            template_row = self.connection.execute(
                self._template_select()
                + """
                WHERE t.id = ?
                  AND c.enabled = 1
                  AND t.status = 'published'
                  AND t.deleted_at IS NULL
                  AND t.current_version_id IS NOT NULL
                """,
                (template_id,),
            ).fetchone()
            if not template_row:
                raise KeyError("已发布模板不存在")
            version_row = self.connection.execute(
                "SELECT * FROM workflow_template_versions WHERE id = ?",
                (template_row["current_version_id"],),
            ).fetchone()
            if not version_row:
                raise KeyError("模板发布版本不存在")
            template = self._template(template_row)
            version = self._version(version_row)
            return {
                **template,
                "versionId": version["id"],
                "versionNumber": version["versionNumber"],
                "schemaVersion": version["schemaVersion"],
                "coverUrl": version["coverUrl"] or template["coverUrl"],
                "publishedAt": version["publishedAt"],
                "workflowData": version["workflowData"],
            }
