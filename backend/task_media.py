from __future__ import annotations

from typing import Any, Optional
from urllib.parse import urlparse


def _unique_urls(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if isinstance(value, str) and value.strip()))


def _collect_urls(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.startswith(("http://", "https://", "/uploads/", "data:image/", "data:video/")) else []
    if isinstance(value, list):
        urls: list[str] = []
        for item in value:
            urls.extend(_collect_urls(item))
        return urls
    if isinstance(value, dict):
        urls: list[str] = []
        for item in value.values():
            urls.extend(_collect_urls(item))
        return urls
    return []


def is_server_media_url(url: str) -> bool:
    value = (url or "").strip()
    if value.startswith("/uploads/"):
        return True
    try:
        return urlparse(value).path.startswith("/uploads/")
    except ValueError:
        return False


def extract_task_source_urls(task_type: str, result: Any) -> list[str]:
    if not result:
        return []
    if task_type == "image" and isinstance(result, dict):
        return _unique_urls(_collect_urls(result.get("images", [])))
    if task_type == "video" and isinstance(result, dict):
        prioritized = []
        for key in ("video_url", "videoUrl", "videos", "video", "output", "outputs", "files", "url"):
            prioritized.extend(_collect_urls(result.get(key)))
        return _unique_urls(prioritized)
    return _unique_urls(_collect_urls(result))


def extract_server_urls(result: Any) -> list[str]:
    return [url for url in _unique_urls(_collect_urls(result)) if is_server_media_url(url)]


def build_local_task_result(task_type: str, server_urls: list[str]) -> dict:
    if task_type == "video":
        return {"video_url": server_urls[0] if server_urls else ""}
    return {"images": [{"url": [url]} for url in server_urls]}


def normalize_task_media_fields(info: Optional[dict]) -> dict:
    normalized = dict(info or {})
    task_type = normalized.get("type") or "image"
    source_result = normalized.get("source_result")
    result = normalized.get("result")
    source_urls = _unique_urls(
        normalized.get("source_urls")
        or extract_task_source_urls(task_type, source_result)
        or extract_task_source_urls(task_type, result)
    )
    server_urls = _unique_urls(
        normalized.get("server_urls")
        or extract_server_urls(result)
    )
    normalized["source_urls"] = source_urls
    normalized["server_urls"] = server_urls
    normalized.setdefault("media_records", [])

    status = normalized.get("status") or "running"
    persistence_status = normalized.get("persistence_status") or ""
    if status == "completed" and source_urls and len(server_urls) < len(source_urls):
        normalized["status"] = "save_failed"
        normalized["persistence_status"] = persistence_status or "save_failed"
        normalized["save_error"] = normalized.get("save_error") or "生成结果尚未保存到本站服务器"
    elif status == "completed" and server_urls:
        normalized["persistence_status"] = "saved"
        normalized.setdefault("save_error", "")
    else:
        normalized["persistence_status"] = persistence_status or (
            "saving" if status == "saving" else "pending"
        )
        normalized.setdefault("save_error", "")
    return normalized


def persist_task_source_urls(
    task_type: str,
    source_urls: list[str],
    asset_store,
    existing_records: Optional[list[dict]] = None,
) -> dict:
    normalized_sources = _unique_urls(source_urls)
    previous_by_source = {
        record.get("source_url"): dict(record)
        for record in (existing_records or [])
        if record.get("source_url")
    }
    records: list[dict] = []
    assets: list[dict] = []

    for source_url in normalized_sources:
        previous = previous_by_source.get(source_url, {})
        if previous.get("server_url") and is_server_media_url(previous["server_url"]):
            records.append({
                "source_url": source_url,
                "server_url": previous["server_url"],
                "error": "",
            })
            continue
        try:
            asset = asset_store.localize_url(source_url)
            assets.append(asset)
            records.append({
                "source_url": source_url,
                "server_url": asset["url"],
                "error": "",
            })
        except Exception as exc:
            records.append({
                "source_url": source_url,
                "server_url": "",
                "error": str(exc),
            })

    server_urls = _unique_urls([record.get("server_url", "") for record in records])
    errors = [record["error"] for record in records if record.get("error")]
    ok = bool(normalized_sources) and not errors and len(server_urls) == len(normalized_sources)
    save_error = "；".join(errors)
    return {
        "ok": ok,
        "source_urls": normalized_sources,
        "server_urls": server_urls,
        "media_records": records,
        "assets": assets,
        "save_error": save_error,
        "result": build_local_task_result(task_type, server_urls),
    }
