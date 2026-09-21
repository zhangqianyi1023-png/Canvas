from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Optional


RUNNING_STATUSES = {"running", "pending", "processing", "queued", "created", "submitted", "in_progress"}
COMPLETED_STATUSES = {"completed", "complete", "succeeded", "success", "done"}
FAILED_STATUSES = {"failed", "failure", "error", "errored", "rejected"}


class ProviderError(RuntimeError):
    """A remote provider request or response could not be handled."""


class UnsupportedProviderError(ProviderError):
    """The configured protocol has no adapter for this capability."""


@dataclass(frozen=True)
class SubmissionResult:
    status: str
    upstream_task_id: str = ""
    result: Optional[dict] = None


@dataclass(frozen=True)
class TaskResult:
    status: str
    result: Optional[dict] = None
    error: str = ""


class ProviderAdapter:
    protocol = ""

    def submit_image(
        self,
        *,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
    ) -> SubmissionResult:
        raise NotImplementedError

    def submit_video(
        self,
        *,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
    ) -> SubmissionResult:
        raise NotImplementedError

    def query_task(
        self,
        *,
        task_id: str,
        base_url: str,
        api_key: str,
        media_type: str,
    ) -> TaskResult:
        raise NotImplementedError


def normalize_status(value: Any) -> str:
    status = str(value or "").strip().lower()
    if status in COMPLETED_STATUSES:
        return "completed"
    if status in FAILED_STATUSES:
        return "failed"
    if status in RUNNING_STATUSES:
        return "running"
    return status


def extract_error(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    error = payload.get("error")
    if isinstance(error, dict):
        code = error.get("code")
        message = error.get("message") or error.get("detail") or str(error)
        return f"[code={code}] {message}" if code not in (None, "") else str(message)
    if error:
        return str(error)
    return str(payload.get("message") or "") if normalize_status(payload.get("status")) == "failed" else ""


def _data_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    task = payload.get("task")
    if task is not None:
        return task
    data = payload.get("data")
    return data if data is not None else payload


def extract_upstream_task_id(payload: Any) -> str:
    if not isinstance(payload, dict):
        return ""
    for key in ("task_id", "taskId"):
        if payload.get(key):
            return str(payload[key])

    data = payload.get("data")
    candidates = data if isinstance(data, list) else [data]
    for candidate in candidates:
        if not isinstance(candidate, dict):
            continue
        for key in ("task_id", "taskId"):
            if candidate.get(key):
                return str(candidate[key])

    if payload.get("id") and (
        payload.get("status")
        or str(payload.get("object") or "").lower() in {"task", "video", "video.generation"}
    ):
        return str(payload["id"])
    return ""


def _image_sources(payload: Any) -> list[str]:
    data = _data_payload(payload)
    items = data if isinstance(data, list) else []
    if isinstance(data, dict):
        images = data.get("images")
        if isinstance(images, list):
            items = images

    sources: list[str] = []
    for item in items:
        if isinstance(item, str) and item.startswith(("http://", "https://", "/uploads/", "data:image/")):
            sources.append(item)
            continue
        if not isinstance(item, dict):
            continue
        url = item.get("url") or item.get("image_url") or item.get("imageUrl")
        if isinstance(url, list):
            sources.extend(str(value) for value in url if value)
        elif url:
            sources.append(str(url))
        encoded = item.get("b64_json") or item.get("b64Json")
        if encoded:
            sources.append(f"data:image/png;base64,{encoded}")
    return list(dict.fromkeys(sources))


def _collect_video_sources(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.startswith(("http://", "https://", "/uploads/", "data:video/")) else []
    if isinstance(value, list):
        sources: list[str] = []
        for item in value:
            sources.extend(_collect_video_sources(item))
        return sources
    if not isinstance(value, dict):
        return []
    sources: list[str] = []
    for key in ("video_url", "videoUrl", "url", "videos", "video", "content", "output", "outputs", "files"):
        sources.extend(_collect_video_sources(value.get(key)))
    return sources


def normalize_media_result(payload: Any, media_type: str) -> Optional[dict]:
    if media_type == "image":
        sources = _image_sources(payload)
        return {"images": [{"url": [source]} for source in sources]} if sources else None

    data = _data_payload(payload)
    sources = list(dict.fromkeys(_collect_video_sources(data)))
    return {"video_url": sources[0]} if sources else None


def _payload_summary(payload: Any) -> str:
    if isinstance(payload, dict):
        keys = ", ".join(sorted(str(key) for key in payload.keys())[:12])
        return f"对象字段: {keys or '空'}"
    if isinstance(payload, list):
        return f"数组长度: {len(payload)}"
    return f"类型: {type(payload).__name__}"


def parse_submission(payload: Any, media_type: str) -> SubmissionResult:
    error = extract_error(payload)
    if error:
        raise ProviderError(error)

    result = normalize_media_result(payload, media_type)
    if result:
        return SubmissionResult(status="completed", result=result)

    task_id = extract_upstream_task_id(payload)
    if task_id:
        return SubmissionResult(status="running", upstream_task_id=task_id)

    raise ProviderError(f"上游响应既没有媒体结果也没有任务 ID（{_payload_summary(payload)}）")


def parse_task_result(payload: Any, media_type: str) -> TaskResult:
    response_error = extract_error(payload)
    if response_error:
        raise ProviderError(response_error)
    data = _data_payload(payload)
    if isinstance(data, list) and data:
        data = data[0]
    if not isinstance(data, dict):
        raise ProviderError("上游未返回有效的任务数据")

    status = normalize_status(data.get("status") or payload.get("status") if isinstance(payload, dict) else "")
    if status == "completed":
        source = data.get("result") if data.get("result") is not None else data
        result = normalize_media_result(source, media_type)
        if not result:
            raise ProviderError("任务已完成，但上游没有返回可用的媒体结果")
        return TaskResult(status="completed", result=result)
    if status == "failed":
        return TaskResult(status="failed", error=extract_error(data) or extract_error(payload) or "生成失败")
    if status == "running":
        return TaskResult(status="running")
    raise ProviderError(f"上游返回未知任务状态：{data.get('status') or '空'}")
