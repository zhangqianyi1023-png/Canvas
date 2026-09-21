"""Durable, content-addressed storage for canvas media assets."""

from __future__ import annotations

import hashlib
import http.client
import base64
import json
import mimetypes
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional, Union
from urllib.parse import unquote, urlparse

import requests

from app_paths import UPLOAD_DIR


MIME_EXTENSIONS = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
}

REMOTE_DOWNLOAD_ATTEMPTS = 5
REMOTE_DOWNLOAD_RETRY_DELAY_SECONDS = 0.8
REMOTE_DOWNLOAD_CHUNK_SIZE = 1024 * 256

REMOTE_DOWNLOAD_RETRY_ERRORS = (
    requests.exceptions.RequestException,
    http.client.IncompleteRead,
    http.client.HTTPException,
)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _normalized_mime(mime_type: str, source_url: str = "") -> str:
    value = (mime_type or "").split(";", 1)[0].strip().lower()
    if value in MIME_EXTENSIONS:
        return value
    guessed, _ = mimetypes.guess_type(urlparse(source_url).path)
    if guessed in MIME_EXTENSIONS:
        return guessed
    raise ValueError(f"不支持的媒体格式: {value or source_url or 'unknown'}")


class AssetStore:
    def __init__(self, root: Union[str, Path], index_name: str = "asset-index.json"):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.index_path = self.root / index_name
        self._lock = threading.RLock()
        self._records = self._load_index()

    def _load_index(self) -> dict[str, dict]:
        try:
            payload = json.loads(self.index_path.read_text(encoding="utf-8"))
            records = payload.get("assets", payload)
            return records if isinstance(records, dict) else {}
        except (FileNotFoundError, json.JSONDecodeError, OSError):
            return {}

    def _write_index(self) -> None:
        temporary = self.index_path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps({"version": 1, "assets": self._records}, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        os.replace(temporary, self.index_path)

    def _record_for_hash(self, digest: str) -> Optional[dict]:
        record = self._records.get(digest)
        if not record:
            return None
        path = self.root / record["filename"]
        return dict(record) if path.is_file() else None

    def save_bytes(self, content: bytes, mime_type: str, source_url: str = "") -> dict:
        if not content:
            raise ValueError("媒体文件为空")
        mime = _normalized_mime(mime_type, source_url)
        digest = hashlib.sha256(content).hexdigest()
        extension = MIME_EXTENSIONS[mime]

        with self._lock:
            existing = self._record_for_hash(digest)
            if existing:
                if source_url and not existing.get("sourceUrl"):
                    existing["sourceUrl"] = source_url
                    self._records[digest] = existing
                    self._write_index()
                return existing

            filename = f"{digest}.{extension}"
            path = self.root / filename
            if not path.exists():
                temporary = path.with_suffix(f".{extension}.tmp")
                temporary.write_bytes(content)
                os.replace(temporary, path)

            media_type = "video" if mime.startswith("video/") else "audio" if mime.startswith("audio/") else "image"
            record = {
                "id": digest,
                "sha256": digest,
                "mediaType": media_type,
                "mimeType": mime,
                "filename": filename,
                "url": f"/uploads/{filename}",
                "byteSize": len(content),
                "sourceUrl": source_url,
                "createdAt": _utc_now(),
            }
            self._records[digest] = record
            self._write_index()
            return dict(record)

    def register_local_url(self, url: str) -> dict:
        parsed = urlparse(url or "")
        path = unquote(parsed.path or "")
        if not path.startswith("/uploads/"):
            raise ValueError("不是本地上传资源")
        filename = os.path.basename(path)
        if not filename or filename in {".", ".."}:
            raise ValueError("本地资源路径不合法")
        local_path = (self.root / filename).resolve()
        if local_path.parent != self.root or not local_path.is_file():
            raise FileNotFoundError(f"本地资源不存在: {filename}")
        mime, _ = mimetypes.guess_type(filename)
        content = local_path.read_bytes()
        record = self.save_bytes(content, mime or "", source_url="")
        if record["filename"] != filename:
            return record

        return record

    def localize_url(self, url: str) -> dict:
        value = (url or "").strip()
        if value.startswith("data:"):
            if "," not in value:
                raise ValueError("媒体 data URL 不完整")
            header, encoded = value.split(",", 1)
            if ";base64" not in header.lower():
                raise ValueError("媒体 data URL 必须使用 base64 编码")
            mime = header[5:].split(";", 1)[0].strip().lower()
            try:
                content = base64.b64decode(encoded, validate=True)
            except (ValueError, base64.binascii.Error) as exc:
                raise ValueError("媒体 data URL 的 base64 数据无效") from exc
            return self.save_bytes(content, mime, source_url="")
        parsed = urlparse(value)
        if parsed.path.startswith("/uploads/"):
            return self.register_local_url(value)
        if parsed.scheme not in {"http", "https"}:
            raise ValueError("仅支持 HTTP(S) 或本地上传资源")

        for attempt in range(REMOTE_DOWNLOAD_ATTEMPTS):
            try:
                response = requests.get(
                    value,
                    timeout=(20, 120),
                    allow_redirects=True,
                    headers={"User-Agent": "AI-Canvas/0.1"},
                    stream=True,
                )
                response.raise_for_status()
                content = b"".join(
                    chunk for chunk in response.iter_content(chunk_size=REMOTE_DOWNLOAD_CHUNK_SIZE)
                    if chunk
                )

                content_encoding = response.headers.get("Content-Encoding", "").strip().lower()
                content_length = response.headers.get("Content-Length", "").strip()
                if content_length and content_encoding in {"", "identity"}:
                    try:
                        expected_length = int(content_length)
                    except ValueError:
                        expected_length = 0
                    if expected_length > 0 and len(content) != expected_length:
                        raise requests.exceptions.ChunkedEncodingError(
                            f"incomplete response: received {len(content)} of {expected_length} bytes"
                        )

                content_type = response.headers.get("Content-Type", "")
                return self.save_bytes(content, content_type, source_url=value)
            except requests.exceptions.HTTPError:
                raise
            except REMOTE_DOWNLOAD_RETRY_ERRORS:
                if attempt == REMOTE_DOWNLOAD_ATTEMPTS - 1:
                    raise
                time.sleep(REMOTE_DOWNLOAD_RETRY_DELAY_SECONDS * (attempt + 1))

        raise RuntimeError("远程媒体下载失败")

    def localize_urls(self, urls: list[str]) -> dict[str, dict]:
        localized = {}
        for url in dict.fromkeys(item for item in urls if item):
            localized[url] = self.localize_url(url)
        return localized

    def list_assets(self) -> list[dict]:
        with self._lock:
            assets = []
            for record in self._records.values():
                path = self.root / record.get("filename", "")
                if path.is_file():
                    assets.append(dict(record))
            return sorted(assets, key=lambda item: item.get("createdAt") or "", reverse=True)


default_asset_store = AssetStore(UPLOAD_DIR)
