"""AI Canvas 后端 — FastAPI 服务"""

import os
import re
import shutil
import subprocess
import tempfile
import time
import json
import threading
import uuid
import requests
from fastapi import BackgroundTasks, FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from model_capabilities import (
    build_image_model_capability_map,
    expand_image_model_selection_aliases,
    get_image_model_support,
    is_adapted_image_model,
    prepare_image_payload,
    validate_image_request,
)
from video_model_capabilities import build_video_model_capability_map
from app_paths import ADMIN_DATA_DIR as RESOLVED_ADMIN_DATA_DIR
from app_paths import UPLOAD_DIR as RESOLVED_UPLOAD_DIR
from nodes import LLMNode, ImageNode, VideoNode, TTSNode
from nodes.voice_design import VoiceDesignNode
from nodes.video import is_known_image_only_model
from providers.apimart import upload_reference_image
from providers.rightcode import build_rightcode_image_model_capability_map, get_rightcode_image_model_support
from providers import ProviderError, get_provider_adapter
from nodes.llm import NODE_META as LLM_META
from nodes.image import NODE_META as IMAGE_META
from nodes.video import NODE_META as VIDEO_META
from nodes.tts import NODE_META as TTS_META
from assets import default_asset_store
from auth import (
    api_auth_error_response,
    create_auth_router,
    get_authenticated_username_from_request,
    should_require_api_auth,
)
from prompt_style_api import create_prompt_style_router
from prompt_style_store import PromptStyleStore
from workflow_template_api import create_workflow_template_router
from workflow_template_store import WorkflowTemplateStore
from task_media import (
    build_local_task_result,
    extract_task_source_urls,
    is_server_media_url,
    normalize_task_media_fields,
    persist_task_source_urls,
)
from copilot_harness import (
    CopilotHarnessError,
    resolve_copilot_provider,
    run_copilot_turn,
)
from copilot_target_images import (
    CopilotTargetImageError,
    attach_copilot_target_images,
)

app = FastAPI(title="AI Canvas", version="0.1.0")
BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(BACKEND_DIR)
UPLOAD_DIR = str(RESOLVED_UPLOAD_DIR)
LEGACY_UPLOAD_DIR = UPLOAD_DIR if os.environ.get("INUX_DATA_DIR") else os.path.join(PROJECT_DIR, "uploads")
ADMIN_DATA_DIR = str(RESOLVED_ADMIN_DATA_DIR)
RUNTIME_SETTINGS_FILE = os.path.join(ADMIN_DATA_DIR, "runtime-settings.json")
WORKFLOW_TEMPLATE_DB = os.path.join(ADMIN_DATA_DIR, "workflow-templates.sqlite3")
PROMPT_STYLE_DB = os.path.join(ADMIN_DATA_DIR, "prompt-styles.sqlite3")
SUPPORTED_IMAGE_MIMES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
SUPPORTED_VIDEO_MIMES = {
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/webm": "webm",
}
SUPPORTED_AUDIO_MIMES = {
    "audio/mpeg": "mp3",
    "audio/mp3": "mp3",
    "audio/wav": "wav",
    "audio/x-wav": "wav",
    "audio/webm": "webm",
    "audio/mp4": "m4a",
    "audio/aac": "aac",
    "audio/ogg": "ogg",
}
SUPPORTED_AUDIO_EXTENSIONS = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".webm": "audio/webm",
    ".m4a": "audio/mp4",
    ".aac": "audio/aac",
    ".ogg": "audio/ogg",
}
SUPPORTED_PROVIDER_PROTOCOLS = {"openai", "apimart", "rightcode", "gemini", "volcengine", "runninghub", "jimeng", "minimax"}

# ── 任务中心：统一管理所有异步生成任务 ──
TASK_CENTER_FILE = os.path.join(ADMIN_DATA_DIR, "task_center.json")
_task_center: dict = {}
_task_center_lock = threading.RLock()
TERMINAL_TASK_STATUSES = {"completed", "failed", "query_failed", "save_failed", "cancelled"}


def _resolve_audio_upload_content_type(file: UploadFile) -> str:
    content_type = (file.content_type or "").split(";", 1)[0].strip().lower()
    if content_type in SUPPORTED_AUDIO_MIMES:
        return content_type
    suffix = Path(file.filename or "").suffix.lower()
    if content_type in {"", "application/octet-stream"} and suffix in SUPPORTED_AUDIO_EXTENSIONS:
        return SUPPORTED_AUDIO_EXTENSIONS[suffix]
    return content_type


def _clone_jsonable(value):
    return json.loads(json.dumps(value, ensure_ascii=False))


def _task_center_snapshot() -> dict:
    with _task_center_lock:
        return _clone_jsonable(_task_center)

def _load_task_center():
    global _task_center
    try:
        if os.path.exists(TASK_CENTER_FILE):
            with open(TASK_CENTER_FILE, "r") as f:
                loaded = json.load(f)
            with _task_center_lock:
                _task_center = loaded
    except Exception:
        with _task_center_lock:
            _task_center = {}

def _save_task_center():
    with _task_center_lock:
        snapshot = _clone_jsonable(_task_center)
        os.makedirs(os.path.dirname(TASK_CENTER_FILE), exist_ok=True)
        tmp_file = f"{TASK_CENTER_FILE}.{threading.get_ident()}.tmp"
        with open(tmp_file, "w") as f:
            json.dump(snapshot, f, ensure_ascii=False)
        os.replace(tmp_file, TASK_CENTER_FILE)

def _now_seconds() -> int:
    return int(time.time())

def _task_duration_seconds(created_at, finished_at) -> int:
    try:
        created = int(created_at or finished_at or 0)
        finished = int(finished_at or created)
    except (TypeError, ValueError):
        return 0
    return max(0, finished - created)

def _finalize_task_timing(entry: dict, finished_at: Optional[int] = None) -> None:
    finished = int(finished_at or _now_seconds())
    entry["finished_at"] = int(entry.get("finished_at") or finished)
    entry["duration_seconds"] = _task_duration_seconds(entry.get("created_at"), entry["finished_at"])

def _public_task_info(info: dict) -> dict:
    """Return task data safe for frontend display."""
    public = normalize_task_media_fields(info)
    public.pop("api_key", None)
    return public

def _public_task_entry(task_id: str, info: dict) -> dict:
    return {"task_id": task_id, **_public_task_info(info)}

def _resolve_task_query_context(entry: Optional[dict], api_base_url: str = "", api_key: str = "") -> tuple[str, str]:
    base_url = (api_base_url or "").strip() or ((entry or {}).get("api_base_url") or "").strip()
    key = (api_key or "").strip() or ((entry or {}).get("api_key") or "").strip()
    if base_url and key:
        return base_url, key

    settings = load_runtime_settings()
    active_provider = next((p for p in settings.providers if p.id == settings.activeProviderId), None)
    if active_provider:
        base_url = base_url or active_provider.baseUrl.strip()
        key = key or active_provider.apiKey.strip()
    return base_url, key

def _register_task(task_id: str, task_type: str = "image",
                   node_id: str = "", project_id: str = "",
                   prompt_summary: str = "", run_id: str = "",
                   parent_id: str = "", batch_id: str = "",
                   api_base_url: str = "", api_key: str = "",
                   provider_protocol: str = "openai",
                   upstream_task_id: str = "",
                   submission_status: str = ""):
    with _task_center_lock:
        created_at = _now_seconds()
        _task_center[task_id] = {
            "status": "running",
            "type": task_type,
            "created_at": created_at,
            "cancelled_at": None,
            "result": None,
            "node_id": node_id,
            "project_id": project_id,
            "run_id": run_id,
            "parent_id": parent_id,
            "batch_id": batch_id,
            "prompt_summary": prompt_summary[:100] if prompt_summary else "",
            "api_base_url": (api_base_url or "").strip(),
            "api_key": (api_key or "").strip(),
            "provider_protocol": (provider_protocol or "openai").strip().lower(),
            "upstream_task_id": (upstream_task_id or "").strip(),
            "submission_status": (submission_status or "").strip().lower(),
            "source_result": None,
            "source_urls": [],
            "server_urls": [],
            "media_records": [],
            "persistence_status": "pending",
            "save_error": "",
        }
    try:
        _save_task_center()
    except Exception as exc:
        # The upstream task already exists. Keep it queryable in memory instead
        # of turning a successful submission into a client-side failure.
        with _task_center_lock:
            _task_center[task_id]["task_center_save_error"] = str(exc)
        print(f"[task-center] failed to persist registered task {task_id}: {exc}")

def _update_task(task_id: str, status: str, result=None):
    now = _now_seconds()
    with _task_center_lock:
        if task_id in _task_center:
            # 已取消的任务不接受状态变更
            if _task_center[task_id].get("status") == "cancelled":
                return
            _task_center[task_id]["status"] = status
            if result is not None:
                _task_center[task_id]["result"] = result
            if status in TERMINAL_TASK_STATUSES:
                _finalize_task_timing(_task_center[task_id], now)
        else:
            _task_center[task_id] = {
                "status": status,
                "type": "image",
                "created_at": now,
                "cancelled_at": None,
                "result": result,
                "node_id": "",
                "project_id": "",
                "run_id": "",
                "parent_id": "",
                "batch_id": "",
                "prompt_summary": "",
                "api_base_url": "",
                "api_key": "",
                "submission_status": "",
                "source_result": None,
                "source_urls": [],
                "server_urls": [],
                "media_records": [],
                "persistence_status": "pending",
                "save_error": "",
            }
            if status in TERMINAL_TASK_STATUSES:
                _finalize_task_timing(_task_center[task_id], now)
    _save_task_center()


def _mark_task_failed(task_id: str, error: str = "", node_id: str = "",
                      project_id: str = "", run_id: str = "",
                      source: str = "client",
                      submission_status: str = "") -> dict:
    message = str(error or "生成失败")
    now = _now_seconds()
    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry:
            _task_center[task_id] = {
                "status": "failed",
                "type": "image",
                "created_at": now,
                "cancelled_at": None,
                "result": None,
                "node_id": node_id,
                "project_id": project_id,
                "run_id": run_id,
                "parent_id": "",
                "batch_id": "",
                "prompt_summary": "",
                "api_base_url": "",
                "api_key": "",
                "submission_status": "",
                "source_result": None,
                "source_urls": [],
                "server_urls": [],
                "media_records": [],
                "persistence_status": "pending",
                "save_error": "",
            }
            entry = _task_center[task_id]

        status = _public_task_info(entry).get("status")
        if status in {"completed", "saving", "save_failed", "cancelled"}:
            return _public_task_entry(task_id, entry)

        entry.update({
            "status": "failed",
            "failed_at": now,
            "failure_source": source,
            "error": {"message": message},
            "query_error": "",
            "query_failure_count": 0,
            "last_query_error_at": None,
            "save_error": entry.get("save_error", ""),
        })
        _finalize_task_timing(entry, now)
        if submission_status:
            entry["submission_status"] = submission_status
        if node_id and not entry.get("node_id"):
            entry["node_id"] = node_id
        if project_id and not entry.get("project_id"):
            entry["project_id"] = project_id
        if run_id and not entry.get("run_id"):
            entry["run_id"] = run_id
    _save_task_center()
    with _task_center_lock:
        return _public_task_entry(task_id, _task_center[task_id])


def _task_needs_persistence(info: Optional[dict]) -> bool:
    if not info:
        return False
    normalized = normalize_task_media_fields(info)
    source_urls = normalized.get("source_urls") or []
    server_urls = normalized.get("server_urls") or []
    return bool(source_urls) and len(server_urls) < len(source_urls)


def _record_task_source_result(task_id: str, source_result) -> dict:
    with _task_center_lock:
        exists = task_id in _task_center
    if not exists:
        _register_task(task_id, "image")
    with _task_center_lock:
        entry = _task_center[task_id]
        task_type = entry.get("type") or "image"
    source_urls = extract_task_source_urls(task_type, source_result)
    with _task_center_lock:
        entry = _task_center[task_id]
        if entry.get("status") == "cancelled":
            return _clone_jsonable(entry)
        entry.update({
            "status": "saving" if source_urls else "save_failed",
            "source_result": source_result,
            "source_urls": source_urls,
            "persistence_status": "saving" if source_urls else "save_failed",
            "save_error": "" if source_urls else "任务已完成，但没有找到可保存的媒体地址",
        })
        if not source_urls:
            _finalize_task_timing(entry)
    _save_task_center()
    with _task_center_lock:
        return _clone_jsonable(_task_center[task_id])


def _persist_task_media(task_id: str) -> dict:
    with _task_center_lock:
        entry = _clone_jsonable(_task_center.get(task_id))
    if not entry:
        raise KeyError("任务不存在")
    if entry.get("status") == "cancelled":
        return _public_task_entry(task_id, entry)
    normalized = normalize_task_media_fields(entry)
    source_urls = normalized.get("source_urls") or []
    if not source_urls:
        with _task_center_lock:
            entry = _task_center[task_id]
            entry.update({
                "status": "save_failed",
                "persistence_status": "save_failed",
                "save_error": "任务中没有可保存的媒体地址",
            })
            _finalize_task_timing(entry)
        _save_task_center()
        with _task_center_lock:
            return _public_task_entry(task_id, _task_center[task_id])

    with _task_center_lock:
        entry = _task_center[task_id]
        if entry.get("status") == "cancelled":
            return _public_task_entry(task_id, entry)
        entry.update({
            "status": "saving",
            "persistence_status": "saving",
            "save_error": "",
            "source_urls": source_urls,
        })
        task_type = entry.get("type") or "image"
        media_records = _clone_jsonable(entry.get("media_records") or [])
    _save_task_center()
    persisted = persist_task_source_urls(
        task_type,
        source_urls,
        default_asset_store,
        media_records,
    )
    with _task_center_lock:
        entry = _task_center[task_id]
        if entry.get("status") == "cancelled":
            return _public_task_entry(task_id, entry)
        entry.update({
            "source_urls": persisted["source_urls"],
            "server_urls": persisted["server_urls"],
            "media_records": persisted["media_records"],
            "save_error": persisted["save_error"],
            "result": persisted["result"],
            "status": "completed" if persisted["ok"] else "save_failed",
            "persistence_status": "saved" if persisted["ok"] else "save_failed",
        })
        _finalize_task_timing(entry)
    _save_task_center()
    with _task_center_lock:
        return _public_task_entry(task_id, _task_center[task_id])

_load_task_center()

RUNNING_TASK_STATUSES = {"running", "pending", "processing", "queued", "created", "submitted", "in_progress"}
TASK_QUERY_FAILURE_LIMIT = 3

def _normalize_task_status(status: str = "") -> str:
    value = str(status or "").lower()
    if value in RUNNING_TASK_STATUSES:
        return "running"
    return value


def _reset_task_query_failure(task_id: str) -> None:
    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry:
            return
        changed = False
        for key in ("query_error", "last_query_error_at"):
            if entry.pop(key, None) is not None:
                changed = True
        if entry.pop("query_failure_count", 0):
            changed = True
    if changed:
        _save_task_center()


def _record_task_query_failure(task_id: str, error: str) -> dict:
    with _task_center_lock:
        exists = task_id in _task_center
    if not exists:
        _register_task(task_id, "image")
    with _task_center_lock:
        entry = _task_center[task_id]
        if entry.get("status") not in {"running", "query_failed"}:
            return _clone_jsonable(entry)
        failure_count = int(entry.get("query_failure_count") or 0) + 1
        now = _now_seconds()
        next_status = "query_failed" if failure_count >= TASK_QUERY_FAILURE_LIMIT else "running"
        entry.update({
            "status": next_status,
            "query_failure_count": failure_count,
            "query_error": str(error or "无法查询中转站任务状态"),
            "last_query_error_at": now,
        })
        if next_status == "query_failed":
            _finalize_task_timing(entry, now)
    _save_task_center()
    with _task_center_lock:
        return _clone_jsonable(_task_center[task_id])

# CORS 允许前端访问
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def require_api_auth(request, call_next):
    if should_require_api_auth(request.url.path, request.method):
        if not get_authenticated_username_from_request(request):
            return api_auth_error_response()
    return await call_next(request)

workflow_template_store = WorkflowTemplateStore(WORKFLOW_TEMPLATE_DB)
app.include_router(
    create_workflow_template_router(workflow_template_store, default_asset_store)
)
prompt_style_store = PromptStyleStore(PROMPT_STYLE_DB)
app.include_router(create_prompt_style_router(prompt_style_store))
app.include_router(create_auth_router())

# 节点实例
llm_node = LLMNode()
image_node = ImageNode()
video_node = VideoNode()
tts_node = TTSNode()
voice_design_node = VoiceDesignNode()


# ===== 数据模型 =====

class LLMRequest(BaseModel):
    provider_id: str = ""
    api_base_url: str = ""
    api_protocol: str = "openai"
    text_api_mode: str = "auto"
    api_key: str
    model_name: str = ""
    system_prompt: str = "你是一个专业的电商文案策划师。"
    user_prompt: str
    temperature: float = 0.7
    max_tokens: int = 2048
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)


class ImageRequest(BaseModel):
    provider_id: str = ""
    api_protocol: str = "openai"
    api_base_url: str = ""
    api_key: str
    prompt: str
    model: str = "gpt-image-2"
    size: str = "16:9"
    resolution: str = "1k"
    quality: str = "auto"
    background: str = "auto"
    output_format: str = "png"
    n: int = 1
    operation: str = ""
    image_url: str = ""
    original_image_url: str = ""
    mask_url: str = ""
    image_urls: list[str] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    poll_interval: int = 5
    timeout: int = 300
    async_mode: bool = False
    node_id: str = ""
    project_id: str = ""
    run_id: str = ""
    parent_id: str = ""
    batch_id: str = ""


class VideoRequest(BaseModel):
    provider_id: str = ""
    api_protocol: str = "openai"
    api_base_url: str = ""
    api_key: str
    prompt: str
    model: str = "sora-2"
    duration: int = 8
    aspect_ratio: str = "16:9"
    resolution: str = "720p"
    image_url: str = ""
    image_urls: list[str] = Field(default_factory=list)
    image_with_roles: list[dict] = Field(default_factory=list)
    video_urls: list[str] = Field(default_factory=list)
    reference_video_urls: list[str] = Field(default_factory=list)
    audio_urls: list[str] = Field(default_factory=list)
    generation_mode: str = ""
    generate_audio: Optional[bool] = None
    poll_interval: int = 5
    timeout: int = 300
    async_mode: bool = False
    node_id: str = ""
    project_id: str = ""
    run_id: str = ""


class VideoEditorTransform(BaseModel):
    x: float = 50
    y: float = 50
    scale: float = 1
    rotate: float = 0
    opacity: float = 1


class VideoEditorClip(BaseModel):
    id: str = ""
    sourceId: str = ""
    sourceUrl: str = ""
    type: str = "image"
    name: str = ""
    start: float = 0
    duration: float = 3
    inPoint: float = 0
    transform: VideoEditorTransform = Field(default_factory=VideoEditorTransform)


class VideoEditorCanvas(BaseModel):
    width: int = 1280
    height: int = 720
    aspectRatio: str = "16:9"


class VideoEditorTimeline(BaseModel):
    version: int = 1
    canvas: VideoEditorCanvas = Field(default_factory=VideoEditorCanvas)
    clips: list[VideoEditorClip] = Field(default_factory=list)


class VideoEditorRenderRequest(BaseModel):
    node_id: str = ""
    timeline: VideoEditorTimeline


class TTSRequest(BaseModel):
    api_base_url: str = ""
    api_key: str
    model: str = ""
    text: str
    voice: str = "冰糖"
    style: str = ""


class VoiceDesignRequest(BaseModel):
    prompt: str = ""
    preview_text: str = ""


class PrivateAvatarAsset(BaseModel):
    url: str = ""
    name: str = ""
    type: str = "image"
    role: str = "reference"


class PrivateAvatarGroup(BaseModel):
    name: str = "角色"
    description: str = "AI Canvas character certification"


class PrivateAvatarTarget(BaseModel):
    kind: str = "character_node"
    nodeId: str = ""


class PrivateAvatarSubmitRequest(BaseModel):
    api_base_url: str = ""
    api_key: str = ""
    client_task_id: str = ""
    project_name: str = "default"
    asset_type: str = "Image"
    url: str = ""
    name: str = ""
    assets: list[PrivateAvatarAsset] = Field(default_factory=list)
    group_id: str = ""
    group: Optional[PrivateAvatarGroup] = None
    node_id: str = ""
    project_id: str = ""
    run_id: str = ""
    target: Optional[PrivateAvatarTarget] = None


class ChatAttachment(BaseModel):
    name: str = ""
    mime_type: str = ""
    size: int = 0
    data_url: str = ""


class ChatMessage(BaseModel):
    role: str
    content: str = ""
    attachments: list[ChatAttachment] = Field(default_factory=list)


class ChatRequest(BaseModel):
    provider_id: str = ""
    api_base_url: str
    api_key: str = ""
    model_name: str
    messages: list[ChatMessage]
    system_prompt: str = "你是一个专业、友好且高效的 AI 助手。"
    temperature: float = 0.7
    max_tokens: int = 4096


class CopilotAttachment(BaseModel):
    name: str = ""
    mime_type: str = ""
    size: int = 0
    kind: str = ""
    data_url: str = ""
    text_content: str = ""


class CopilotTargetNode(BaseModel):
    id: str
    node_type: str = ""
    result_type: str = ""
    label: str = ""
    kind: str = "node"
    content: str = ""
    prompt: str = ""
    thumbnail_url: str = ""
    can_edit_content: bool = False
    can_edit_prompt: bool = False
    can_rename: bool = True
    revision: str = ""


class CopilotTurnRequest(BaseModel):
    session_id: str
    message: str
    canvas: dict = Field(default_factory=dict)
    provider_id: str = ""
    model_name: str = ""
    attachments: list[CopilotAttachment] = Field(default_factory=list)
    target_nodes: list[CopilotTargetNode] = Field(default_factory=list)


class ProviderProbeRequest(BaseModel):
    base_url: str
    api_key: str = ""
    protocol: str = "openai"


class RuntimeProvider(BaseModel):
    id: str
    name: str = ""
    protocol: str = "openai"
    textApiMode: str = "auto"
    maxTextTokens: int = 8192
    baseUrl: str = ""
    apiKey: str = ""
    enabled: bool = True
    textModels: list[str] = Field(default_factory=list)
    imageModels: list[str] = Field(default_factory=list)
    imageModelCapabilities: dict[str, dict] = Field(default_factory=dict)
    videoModels: list[str] = Field(default_factory=list)
    videoModelCapabilities: dict[str, dict] = Field(default_factory=dict)
    defaultTextModel: str = ""
    defaultImageModel: str = ""
    defaultVideoModel: str = ""


class AllowedModels(BaseModel):
    text: list[str] = Field(default_factory=list)
    image: list[str] = Field(default_factory=list)
    video: list[str] = Field(default_factory=list)


class RuntimeSettings(BaseModel):
    activeProviderId: str = ""
    providers: list[RuntimeProvider] = Field(default_factory=list)
    allowedModels: AllowedModels = Field(default_factory=AllowedModels)
    # Backward-compatible fallback for settings saved before provider-level limits.
    maxTextTokens: int = 8192


def normalize_string_list(values: list[str]) -> list[str]:
    cleaned = []
    for item in values or []:
        if isinstance(item, str):
            item = item.strip()
        if item:
            cleaned.append(item)
    return cleaned


def normalize_text_api_mode(value: str) -> str:
    mode = (value or "auto").strip().lower()
    return mode if mode in {"auto", "chat_completions", "responses"} else "auto"


def normalize_max_text_tokens(value) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return 8192
    return max(1024, min(parsed, 32768))


def load_runtime_settings() -> RuntimeSettings:
    if not os.path.exists(RUNTIME_SETTINGS_FILE):
        return RuntimeSettings()
    try:
        with open(RUNTIME_SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        legacy_max_text_tokens = normalize_max_text_tokens(data.get("maxTextTokens") if isinstance(data, dict) else None)
        if isinstance(data, dict) and isinstance(data.get("providers"), list):
            data["providers"] = [
                {
                    **provider,
                    "maxTextTokens": provider.get("maxTextTokens", legacy_max_text_tokens),
                }
                if isinstance(provider, dict) else provider
                for provider in data["providers"]
            ]
        settings = RuntimeSettings(**data)
        settings.maxTextTokens = normalize_max_text_tokens(settings.maxTextTokens)
        settings.providers = [
            RuntimeProvider(
                **{
                    **provider.model_dump(),
                    "maxTextTokens": normalize_max_text_tokens(
                        provider.maxTextTokens or settings.maxTextTokens
                    ),
                }
            )
            for provider in settings.providers
        ]
        for provider in settings.providers:
            if provider.protocol.strip().lower() == "rightcode":
                provider.imageModelCapabilities = build_rightcode_image_model_capability_map(
                    provider.imageModels,
                    getattr(provider, "imageModelCapabilities", {}) or {},
                )
            elif provider.protocol.strip().lower() == "apimart":
                provider.imageModels = expand_image_model_selection_aliases(provider.imageModels)
                provider.imageModelCapabilities = build_image_model_capability_map(
                    provider.imageModels,
                    getattr(provider, "imageModelCapabilities", {}) or {},
                )
            else:
                provider.imageModelCapabilities = build_image_model_capability_map(
                    provider.imageModels,
                    getattr(provider, "imageModelCapabilities", {}) or {},
                )
            provider.videoModelCapabilities = build_video_model_capability_map(
                provider.videoModels,
                getattr(provider, "videoModelCapabilities", {}) or {},
            )
        return settings
    except Exception:
        return RuntimeSettings()


def save_runtime_settings(settings: RuntimeSettings) -> RuntimeSettings:
    settings.maxTextTokens = normalize_max_text_tokens(settings.maxTextTokens)
    normalized_providers = []
    for item in settings.providers or []:
        protocol = item.protocol.strip().lower()
        image_models = normalize_string_list(item.imageModels if hasattr(item, 'imageModels') else [])
        if protocol == "apimart":
            image_models = expand_image_model_selection_aliases(image_models)
        existing_capabilities = dict(getattr(item, 'imageModelCapabilities', {}) or {})
        image_capabilities = (
            build_rightcode_image_model_capability_map(image_models, existing_capabilities)
            if protocol == "rightcode"
            else build_image_model_capability_map(image_models, existing_capabilities)
        )
        video_models = normalize_string_list(item.videoModels if hasattr(item, 'videoModels') else [])
        existing_video_capabilities = dict(getattr(item, 'videoModelCapabilities', {}) or {})
        video_capabilities = build_video_model_capability_map(video_models, existing_video_capabilities)
        if protocol == "apimart":
            unsupported = [model for model, support in image_capabilities.items() if support.get("adapted") is not True]
            if unsupported:
                names = "、".join(unsupported)
                raise HTTPException(status_code=400, detail=f"以下 APIMart 图片模型尚未适配，不能保存：{names}")
        normalized_providers.append(RuntimeProvider(
            id=item.id,
            name=item.name.strip(),
            protocol=protocol,
            textApiMode=normalize_text_api_mode(item.textApiMode if hasattr(item, 'textApiMode') else 'auto'),
            maxTextTokens=normalize_max_text_tokens(
                item.maxTextTokens if hasattr(item, 'maxTextTokens') else settings.maxTextTokens
            ),
            baseUrl=item.baseUrl.strip(),
            apiKey=item.apiKey.strip(),
            enabled=item.enabled if hasattr(item, 'enabled') else True,
            textModels=normalize_string_list(item.textModels if hasattr(item, 'textModels') else []),
            imageModels=image_models,
            imageModelCapabilities=image_capabilities,
            videoModels=video_models,
            videoModelCapabilities=video_capabilities,
            defaultTextModel=(item.defaultTextModel or '').strip() if hasattr(item, 'defaultTextModel') else '',
            defaultImageModel=(
                (item.defaultImageModel or '').strip()
                if hasattr(item, 'defaultImageModel') and (item.defaultImageModel or '').strip() in image_models
                else image_models[0] if image_models else ''
            ),
            defaultVideoModel=(
                (item.defaultVideoModel or '').strip()
                if hasattr(item, 'defaultVideoModel') and (item.defaultVideoModel or '').strip() in video_models
                else video_models[0] if video_models else ''
            ),
        ))
    settings.providers = normalized_providers
    settings.allowedModels = AllowedModels(
        text=normalize_string_list(settings.allowedModels.text),
        image=normalize_string_list(settings.allowedModels.image),
        video=normalize_string_list(settings.allowedModels.video),
    )

    if settings.activeProviderId and not any(
        p.id == settings.activeProviderId for p in settings.providers
    ):
        raise HTTPException(status_code=400, detail="启用中转站不存在")

    os.makedirs(ADMIN_DATA_DIR, exist_ok=True)
    tmp_path = RUNTIME_SETTINGS_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(settings.model_dump(), f, ensure_ascii=False, indent=2)
    os.replace(tmp_path, RUNTIME_SETTINGS_FILE)
    return settings


@app.get("/api/admin/runtime-settings")
def get_runtime_settings():
    return load_runtime_settings().model_dump()


@app.put("/api/admin/runtime-settings")
def update_runtime_settings(settings: RuntimeSettings):
    updated = save_runtime_settings(settings)
    return {"success": True, "settings": updated.model_dump()}


def resolve_text_max_tokens_for_request(req, settings: RuntimeSettings) -> int:
    provider_id = (getattr(req, "provider_id", "") or "").strip()
    base_url = clean_base_url(req.api_base_url)
    api_key = (req.api_key or "").strip()
    model_name = (req.model_name or "").strip()

    for provider in settings.providers or []:
        if provider.enabled is False:
            continue
        if provider_id and provider.id == provider_id:
            return normalize_max_text_tokens(provider.maxTextTokens)
        provider_base = clean_base_url(provider.baseUrl)
        provider_key = (provider.apiKey or "").strip()
        provider_models = set(normalize_string_list(provider.textModels))
        base_matches = bool(provider_base and provider_base == base_url)
        key_matches = bool(provider_key and provider_key == api_key)
        model_matches = bool(model_name and model_name in provider_models)
        if base_matches and (key_matches or model_matches):
            return normalize_max_text_tokens(provider.maxTextTokens)

    return normalize_max_text_tokens(req.max_tokens or settings.maxTextTokens)


class AssetLocalizationRequest(BaseModel):
    urls: list[str] = Field(default_factory=list)


def clean_base_url(base_url: str) -> str:
    return (base_url or "").strip().rstrip("/")


def resolve_media_provider_protocol(
    provider_id: str = "",
    api_base_url: str = "",
    requested_protocol: str = "openai",
) -> str:
    """Resolve saved provider identity first so older clients keep working."""
    settings = load_runtime_settings()
    normalized_provider_id = (provider_id or "").strip()
    normalized_base_url = clean_base_url(api_base_url)

    # Older saved providers may have the default "openai" protocol even though
    # their URL points to APIMart. The URL is unambiguous, so prefer APIMart
    # before selecting the image adapter.
    def resolve_protocol(protocol: str) -> str:
        normalized = (protocol or "openai").strip().lower()
        if "apimart" in normalized_base_url.lower():
            return "apimart"
        if "rightapi" in normalized_base_url.lower():
            return "rightcode"
        if "minimax" in normalized_base_url.lower():
            return "minimax"
        return normalized

    for provider in settings.providers:
        if provider.enabled is False:
            continue
        if normalized_provider_id and provider.id == normalized_provider_id:
            return resolve_protocol(provider.protocol)
    for provider in settings.providers:
        if provider.enabled is False:
            continue
        if normalized_base_url and clean_base_url(provider.baseUrl) == normalized_base_url:
            return resolve_protocol(provider.protocol)
    return resolve_protocol(requested_protocol)


def provider_models_url(base_url: str, protocol: str) -> str:
    base = clean_base_url(base_url)
    if not base:
        raise HTTPException(status_code=400, detail="Base URL 不能为空")

    protocol = (protocol or "openai").lower()
    if protocol == "gemini":
        return base if base.endswith("/models") else f"{base}/models"
    if protocol == "volcengine":
        if base.endswith("/models"):
            return base
        return f"{base}/api/v3/models" if not base.endswith("/api/v3") else f"{base}/models"
    if protocol == "runninghub":
        return base if base.endswith("/models") else f"{base}/openapi/v2/models"
    if protocol == "minimax":
        return base if base.endswith("/v1/models") or base.endswith("/models") else f"{base}/v1/models"
    if protocol == "rightcode":
        if base.endswith("/v1/models") or base.endswith("/models"):
            return base
        if base.endswith("/draw/v1"):
            base = base[:-len("/draw/v1")]
        elif base.endswith("/v1"):
            base = base[:-len("/v1")]
        return f"{base.rstrip('/')}/v1/models"
    if protocol == "jimeng":
        raise HTTPException(status_code=400, detail="当前项目暂未接入即梦 CLI 的模型拉取")
    if protocol == "apimart" and not base.endswith("/v1") and not base.endswith("/models"):
        return f"{base}/v1/models"
    if protocol == "openai" and not base.endswith("/v1") and not base.endswith("/models"):
        return f"{base}/v1/models"
    return base if base.endswith("/models") else f"{base}/models"


def provider_headers(api_key: str, protocol: str) -> dict:
    key = (api_key or "").strip()
    headers = {"Accept": "application/json"}
    protocol = (protocol or "openai").lower()
    if not key:
        return headers
    if protocol == "gemini":
        headers["x-goog-api-key"] = key
    elif protocol == "runninghub":
        headers["Api-Key"] = key
    else:
        headers["Authorization"] = f"Bearer {key}"
    return headers


def collect_model_ids(payload) -> list[str]:
    if isinstance(payload, dict):
        if isinstance(payload.get("data"), list):
            return collect_model_ids(payload["data"])
        if isinstance(payload.get("models"), list):
            return collect_model_ids(payload["models"])
        if isinstance(payload.get("items"), list):
            return collect_model_ids(payload["items"])
        model_id = payload.get("id") or payload.get("name") or payload.get("model")
        return [str(model_id)] if model_id else []
    if isinstance(payload, list):
        ids = []
        for item in payload:
            ids.extend(collect_model_ids(item))
        return ids
    return []


def collect_model_records(payload) -> list[dict]:
    if isinstance(payload, dict):
        for key in ("data", "models", "items"):
            if isinstance(payload.get(key), list):
                return collect_model_records(payload[key])
        model_id = payload.get("id") or payload.get("name") or payload.get("model")
        if not model_id:
            return []
        return [{
            "id": str(model_id),
            "category": str(payload.get("category") or "").strip().lower(),
            "capability_tags": payload.get("capability_tags") if isinstance(payload.get("capability_tags"), list) else [],
        }]
    if isinstance(payload, list):
        records = []
        for item in payload:
            records.extend(collect_model_records(item))
        return records
    return []


def categorize_model_ids(
    model_ids: list[str],
    *,
    categories: Optional[dict[str, str]] = None,
    protocol: str = "",
) -> dict:
    unique_ids = []
    seen = set()
    for model_id in model_ids:
        value = model_id.strip()
        if not value or value in seen or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]*", value):
            continue
        seen.add(value)
        unique_ids.append(value)

    image_pattern = re.compile(
        r"(image|img|vision|gpt-image|flux|dall|midjourney|nano-banana|seedream|grok-imagine)",
        re.I,
    )
    video_pattern = re.compile(
        r"(video|sora|wan|kling|veo|hailuo|runway|seedance|minimax-h3|h3-max|happyhorse|gemini-omni)",
        re.I,
    )
    text_models = []
    image_models = []
    video_models = []

    for model_id in unique_ids:
        declared_category = (categories or {}).get(model_id, "")
        if declared_category == "image" or (
            protocol == "apimart" and is_adapted_image_model(model_id)
        ):
            image_models.append(model_id)
        elif declared_category == "video":
            video_models.append(model_id)
        elif declared_category in {"chat", "text", "audio"}:
            text_models.append(model_id)
        elif is_known_image_only_model(model_id):
            image_models.append(model_id)
        elif video_pattern.search(model_id):
            video_models.append(model_id)
        elif image_pattern.search(model_id):
            image_models.append(model_id)
        else:
            text_models.append(model_id)

    return {
        "all_models": unique_ids,
        "text_models": text_models,
        "image_models": image_models,
        "video_models": video_models,
        "model_count": len(unique_ids),
    }


def fetch_provider_models(req: ProviderProbeRequest) -> dict:
    protocol = (req.protocol or "openai").lower()
    if protocol not in SUPPORTED_PROVIDER_PROTOCOLS:
        raise HTTPException(status_code=400, detail="不支持的协议类型")

    url = provider_models_url(req.base_url, protocol)
    try:
        params = {"expand": "category"} if protocol == "apimart" else None
        response = requests.get(
            url,
            headers=provider_headers(req.api_key, protocol),
            params=params,
            timeout=20,
        )
        if protocol == "apimart" and response.status_code in {400, 404, 405, 422}:
            response = requests.get(url, headers=provider_headers(req.api_key, protocol), timeout=20)
    except requests.RequestException as exc:
        return {"ok": False, "error": f"无法连接上游服务: {exc}", "model_count": 0}

    if response.status_code >= 400:
        return {
            "ok": False,
            "status": response.status_code,
            "error": response.text[:500] or f"HTTP {response.status_code}",
            "model_count": 0,
        }

    try:
        payload = response.json()
    except ValueError:
        return {"ok": False, "error": "上游返回的不是 JSON 数据", "model_count": 0}

    records = collect_model_records(payload)
    categories = {record["id"]: record["category"] for record in records if record["category"]}
    categorized = categorize_model_ids(
        collect_model_ids(payload),
        categories=categories,
        protocol=protocol,
    )
    if protocol == "apimart":
        categorized["image_models"] = expand_image_model_selection_aliases(categorized["image_models"])
        categorized["image_models"] = sorted(
            categorized["image_models"],
            key=lambda model: (not is_adapted_image_model(model), model.lower()),
        )
    model_support = {
        model: (
            get_rightcode_image_model_support(model)
            if protocol == "rightcode"
            else get_image_model_support(model)
        )
        for model in categorized["image_models"]
    }
    video_model_support = build_video_model_capability_map(categorized["video_models"])
    return {
        "ok": True,
        "url": str(getattr(response, "url", url)),
        **categorized,
        "enforce_image_adaptation": protocol == "apimart",
        "image_model_support": model_support,
        "video_model_support": video_model_support,
    }


def build_chat_content(message: ChatMessage):
    text_parts = [message.content.strip()] if message.content.strip() else []
    file_notes = []
    image_parts = []

    for attachment in message.attachments:
        mime = (attachment.mime_type or "").strip()
        name = attachment.name or "未命名文件"
        if mime.startswith("image/") and attachment.data_url:
            image_parts.append({
                "type": "image_url",
                "image_url": {"url": attachment.data_url},
            })
        else:
            size_hint = f"，大小 {attachment.size} bytes" if attachment.size else ""
            file_notes.append(f"- {name}（{mime or 'unknown'}{size_hint}）")

    if file_notes:
        text_parts.append("用户附加了以下文件，当前无法直接读取二进制内容，请根据文件名和上下文继续协助：\n" + "\n".join(file_notes))

    text = "\n\n".join(text_parts).strip()
    if image_parts:
        parts = []
        if text:
            parts.append({"type": "text", "text": text})
        parts.extend(image_parts)
        return parts
    return text


# ===== API 路由 =====

@app.post("/api/uploads/images")
async def upload_image(file: UploadFile = File(...)):
    """上传用户选择的图片素材，返回后续生成可复用的 URL"""
    if file.content_type not in SUPPORTED_IMAGE_MIMES:
        raise HTTPException(status_code=400, detail="图片格式不支持，仅支持 JPEG、PNG、WebP、GIF")

    try:
        chunks = []
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        asset = default_asset_store.save_bytes(
            b"".join(chunks),
            file.content_type,
            source_url="",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"图片上传失败: {exc}") from exc

    return {
        "success": True,
        "asset": {
            **asset,
            "originalFilename": file.filename,
        },
    }


@app.post("/api/uploads/videos")
async def upload_video(file: UploadFile = File(...)):
    """上传用户选择的视频素材，返回后续节点可复用的 URL"""
    if file.content_type not in SUPPORTED_VIDEO_MIMES:
        raise HTTPException(status_code=400, detail="视频格式不支持，仅支持 MP4、MOV、WebM")

    try:
        chunks = []
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        asset = default_asset_store.save_bytes(
            b"".join(chunks),
            file.content_type,
            source_url="",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"视频上传失败: {exc}") from exc

    return {
        "success": True,
        "asset": {
            **asset,
            "originalFilename": file.filename,
        },
    }


@app.post("/api/uploads/audio")
async def upload_audio(file: UploadFile = File(...)):
    """上传用户选择的音频素材，返回后续节点可复用的 URL。"""
    content_type = _resolve_audio_upload_content_type(file)
    if content_type not in SUPPORTED_AUDIO_MIMES:
        raise HTTPException(status_code=400, detail="音频格式不支持，仅支持 MP3、WAV、WebM、M4A、AAC、OGG")

    try:
        chunks = []
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            chunks.append(chunk)
        asset = default_asset_store.save_bytes(
            b"".join(chunks),
            content_type,
            source_url="",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"音频上传失败: {exc}") from exc

    return {
        "success": True,
        "asset": {
            **asset,
            "originalFilename": file.filename,
        },
    }


@app.post("/api/assets/localize")
def localize_assets(req: AssetLocalizationRequest):
    """Protect remote or legacy media behind stable, deduplicated local assets."""
    try:
        mapping = default_asset_store.localize_urls(req.urls)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"资源本地化失败: {exc}") from exc

    return {
        "success": True,
        "assets": list(mapping.values()),
        "mapping": mapping,
    }


@app.get("/api/assets")
def list_assets():
    """List durable local media assets for the in-app asset library."""
    return {"success": True, "assets": default_asset_store.list_assets()}


def _run_ffmpeg(command: list[str], label: str):
    try:
        completed = subprocess.run(
            command,
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        return completed
    except FileNotFoundError as exc:
        raise HTTPException(status_code=500, detail="未找到 FFmpeg，请先安装 ffmpeg") from exc
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or str(exc)).strip()
        raise HTTPException(status_code=500, detail=f"{label}失败: {detail[-1200:]}") from exc


def _resolve_video_editor_source(source_url: str) -> Path:
    value = (source_url or "").strip()
    if not value:
        raise HTTPException(status_code=400, detail="时间轴片段缺少素材地址")

    parsed = urlparse(value)
    path = unquote(parsed.path or value)
    if path.startswith("/uploads/"):
        filename = os.path.basename(path)
        local_path = (Path(UPLOAD_DIR) / filename).resolve()
        upload_root = Path(UPLOAD_DIR).resolve()
        if local_path.parent != upload_root or not local_path.is_file():
            raise HTTPException(status_code=400, detail=f"素材不存在: {path}")
        return local_path

    if parsed.scheme in {"http", "https"}:
        try:
            asset = default_asset_store.localize_url(value)
            return _resolve_video_editor_source(asset["url"])
        except Exception as exc:
            raise HTTPException(status_code=502, detail=f"素材本地化失败: {exc}") from exc

    raise HTTPException(status_code=400, detail="仅支持 /uploads 或 HTTP(S) 素材")


def _normalize_video_encoder_dimension(value: Optional[float], fallback: int, minimum: int, maximum: int) -> int:
    dimension = int(value or fallback)
    dimension = max(minimum, min(dimension, maximum))
    if dimension % 2 == 0:
        return dimension
    return dimension + 1 if dimension < maximum else dimension - 1


def _render_video_editor_segment(clip: VideoEditorClip, source_path: Path, canvas: VideoEditorCanvas, output_path: Path):
    width = _normalize_video_encoder_dimension(canvas.width, 1280, 320, 3840)
    height = _normalize_video_encoder_dimension(canvas.height, 720, 240, 3840)
    duration = max(0.2, min(float(clip.duration or 0), 300))
    in_point = max(0, float(clip.inPoint or 0))
    scale = max(0.1, min(float(clip.transform.scale or 1), 4))
    opacity = max(0, min(float(clip.transform.opacity), 1))
    rotate = max(-180, min(float(clip.transform.rotate or 0), 180))
    x = max(0, min(float(clip.transform.x or 50), 100))
    y = max(0, min(float(clip.transform.y or 50), 100))
    rotate_radians = rotate * 3.141592653589793 / 180

    source_args = (
        ["-loop", "1", "-t", f"{duration:.3f}", "-i", str(source_path)]
        if clip.type != "video"
        else ["-ss", f"{in_point:.3f}", "-t", f"{duration:.3f}", "-i", str(source_path)]
    )
    scale_filter = (
        f"scale=w='trunc(iw*min({width}/iw,{height}/ih)*{scale}/2)*2':"
        f"h='trunc(ih*min({width}/iw,{height}/ih)*{scale}/2)*2'"
    )
    filter_complex = (
        f"[0:v]setpts=PTS-STARTPTS,{scale_filter},"
        f"rotate={rotate_radians}:ow=rotw(iw):oh=roth(ih):c=none,"
        f"format=rgba,colorchannelmixer=aa={opacity}[fg];"
        f"[1:v][fg]overlay=x='{width}*{x}/100-overlay_w/2':"
        f"y='{height}*{y}/100-overlay_h/2':eof_action=pass:shortest=0,"
        f"format=yuv420p[v]"
    )
    command = [
        "ffmpeg",
        "-y",
        *source_args,
        "-f", "lavfi",
        "-t", f"{duration:.3f}",
        "-i", f"color=c=black:s={width}x{height}:r=30",
        "-filter_complex", filter_complex,
        "-map", "[v]",
        "-t", f"{duration:.3f}",
        "-r", "30",
        "-an",
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        str(output_path),
    ]
    _run_ffmpeg(command, "片段渲染")


def _ffmpeg_concat_line(path: Path) -> str:
    escaped = str(path).replace("'", "'\\''")
    return f"file '{escaped}'"


@app.post("/api/video-editor/render")
def render_video_editor(req: VideoEditorRenderRequest):
    """Render the lightweight canvas video-editor timeline into a local MP4."""
    timeline = req.timeline
    clips = sorted(
        [clip for clip in timeline.clips if clip.sourceUrl and clip.duration > 0],
        key=lambda item: item.start,
    )
    if not clips:
        raise HTTPException(status_code=400, detail="时间轴里还没有可合成的素材")

    with tempfile.TemporaryDirectory(prefix="video-editor-") as tmp_dir:
        tmp_path = Path(tmp_dir)
        segment_paths = []
        for index, clip in enumerate(clips):
            source_path = _resolve_video_editor_source(clip.sourceUrl)
            segment_path = tmp_path / f"segment_{index:03d}.mp4"
            _render_video_editor_segment(clip, source_path, timeline.canvas, segment_path)
            segment_paths.append(segment_path)

        concat_file = tmp_path / "concat.txt"
        concat_file.write_text(
            "\n".join(_ffmpeg_concat_line(path) for path in segment_paths),
            encoding="utf-8",
        )
        rendered_path = tmp_path / f"video_editor_{uuid.uuid4().hex}.mp4"
        _run_ffmpeg([
            "ffmpeg",
            "-y",
            "-f", "concat",
            "-safe", "0",
            "-i", str(concat_file),
            "-c", "copy",
            "-movflags", "+faststart",
            str(rendered_path),
        ], "视频合成")

        try:
            asset = default_asset_store.save_bytes(rendered_path.read_bytes(), "video/mp4", source_url="")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"视频保存失败: {exc}") from exc

    return {
        "success": True,
        "video_url": asset["url"],
        "asset": asset,
    }

@app.get("/api/models")
def get_models():
    """返回所有可用节点的元数据"""
    return {
        "nodes": [LLM_META, IMAGE_META, VIDEO_META, TTS_META]
    }


@app.post("/api/providers/test-connection")
def test_provider_connection(req: ProviderProbeRequest):
    """验证 API Provider 地址是否可用，并返回可识别模型数量"""
    return fetch_provider_models(req)


@app.post("/api/providers/fetch-models")
def fetch_provider_model_list(req: ProviderProbeRequest):
    """从 API Provider 拉取模型列表，供前端按能力维护默认模型"""
    return fetch_provider_models(req)


@app.post("/api/llm")
def run_llm(req: LLMRequest):
    """执行 LLM 文本生成"""
    settings = load_runtime_settings()
    max_text_tokens = resolve_text_max_tokens_for_request(req, settings)
    return llm_node.execute(
        api_base_url=req.api_base_url,
        api_key=req.api_key,
        model_name=req.model_name,
        system_prompt=req.system_prompt,
        user_prompt=req.user_prompt,
        temperature=req.temperature,
        max_tokens=max_text_tokens,
        image_urls=req.image_urls,
        api_protocol=req.api_protocol,
        text_api_mode=req.text_api_mode,
    )


@app.post("/api/chat")
def run_chat(req: ChatRequest):
    """执行多轮聊天，兼容 OpenAI chat/completions 格式"""
    api_base_url = clean_base_url(req.api_base_url)
    if not api_base_url:
      raise HTTPException(status_code=400, detail="Base URL 不能为空")
    settings = load_runtime_settings()
    max_text_tokens = resolve_text_max_tokens_for_request(req, settings)

    headers = {"Content-Type": "application/json"}
    if req.api_key:
        headers["Authorization"] = f"Bearer {req.api_key}"

    messages = []
    if req.system_prompt.strip():
        messages.append({"role": "system", "content": req.system_prompt.strip()})

    for message in req.messages:
        role = message.role if message.role in {"user", "assistant", "system"} else "user"
        content = build_chat_content(message)
        if not content:
            continue
        messages.append({"role": role, "content": content})

    if not messages or all(item["role"] != "user" for item in messages):
        raise HTTPException(status_code=400, detail="至少需要一条用户消息")

    payload = {
        "model": req.model_name,
        "messages": messages,
        "temperature": req.temperature,
        "max_tokens": max_text_tokens,
    }

    try:
        response = requests.post(
            f"{api_base_url}/chat/completions",
            headers=headers,
            json=payload,
            timeout=180,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        return {"success": True, "response": content, "raw": data}
    except requests.exceptions.Timeout:
        return {"success": False, "error": "API 请求超时（180s）"}
    except requests.exceptions.ConnectionError:
        return {"success": False, "error": f"无法连接到 {api_base_url}/chat/completions"}
    except requests.exceptions.HTTPError:
        return {"success": False, "error": f"HTTP {response.status_code}: {response.text[:500]}"}
    except (KeyError, IndexError, ValueError) as exc:
        return {"success": False, "error": f"解析响应失败: {exc}"}


@app.post("/api/copilot/turn")
def run_canvas_copilot_turn(req: CopilotTurnRequest):
    """Run one persistent DeepSeek Harness turn and return optional Canvas actions."""
    session_id = req.session_id.strip()
    message = req.message.strip()
    if not re.fullmatch(r"[A-Za-z0-9._:-]{1,160}", session_id):
        raise HTTPException(status_code=400, detail="Copilot 会话标识无效")
    if not message:
        raise HTTPException(status_code=400, detail="请输入对话内容")
    if len(message) > 12000:
        raise HTTPException(status_code=400, detail="单条消息不能超过 12000 个字符")
    if len(json.dumps(req.canvas, ensure_ascii=False)) > 300_000:
        raise HTTPException(status_code=413, detail="画布上下文过大，请减少选中内容后重试")
    if len(req.attachments) > 6:
        raise HTTPException(status_code=400, detail="单次最多添加 6 个文件")
    if len(req.target_nodes) > 6:
        raise HTTPException(status_code=400, detail="单次最多引用 6 个画布节点")

    attachment_payload = []
    attachment_chars = 0
    allowed_image_mimes = {"image/png", "image/jpeg", "image/webp", "image/gif"}
    for attachment in req.attachments:
        item = attachment.model_dump()
        mime_type = attachment.mime_type.strip().lower()
        attachment_chars += len(attachment.data_url) + len(attachment.text_content)
        if attachment.kind == "image":
            if mime_type not in allowed_image_mimes:
                raise HTTPException(status_code=400, detail=f"暂不支持这种图片格式：{attachment.name}")
            if attachment.size > 8 * 1024 * 1024 or not attachment.data_url.startswith(f"data:{mime_type};base64,"):
                raise HTTPException(status_code=400, detail=f"图片附件无效或超过 8MB：{attachment.name}")
        elif attachment.kind == "text":
            if attachment.size > 1024 * 1024 or len(attachment.text_content.encode("utf-8")) > 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"文本附件超过 1MB：{attachment.name}")
        else:
            raise HTTPException(status_code=400, detail=f"暂时支持图片和文本文件：{attachment.name}")
        attachment_payload.append(item)
    if attachment_chars > 24_000_000:
        raise HTTPException(status_code=413, detail="附件内容过大，请减少文件后重试")

    target_payload = []
    for target in req.target_nodes:
        node_id = target.id.strip()
        if not node_id or len(node_id) > 160 or any(ord(char) < 32 for char in node_id):
            raise HTTPException(status_code=400, detail="引用的画布节点标识无效")
        target_payload.append({
            "id": node_id,
            "node_type": target.node_type.strip()[:80],
            "result_type": target.result_type.strip()[:80],
            "label": target.label.strip()[:120],
            "kind": target.kind.strip()[:20],
            "content": target.content[:12000],
            "prompt": target.prompt[:8000],
            "thumbnail_url": target.thumbnail_url.strip()[:2000],
            "can_edit_content": target.can_edit_content,
            "can_edit_prompt": target.can_edit_prompt,
            "can_rename": target.can_rename,
            "revision": target.revision.strip()[:80],
        })
    if len(json.dumps(target_payload, ensure_ascii=False)) > 160_000:
        raise HTTPException(status_code=413, detail="引用的节点内容过大，请减少节点后重试")
    try:
        target_payload = attach_copilot_target_images(target_payload, UPLOAD_DIR)
    except CopilotTargetImageError as exc:
        raise HTTPException(status_code=413, detail=str(exc)) from exc

    try:
        provider = resolve_copilot_provider(
            load_runtime_settings(),
            provider_id=req.provider_id,
            model_name=req.model_name,
        )
        return run_copilot_turn(
            session_id=session_id,
            message=message,
            canvas=req.canvas,
            provider=provider,
            dsh_home=Path(ADMIN_DATA_DIR) / "copilot-harness",
            attachments=attachment_payload,
            target_nodes=target_payload,
        )
    except CopilotHarnessError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _update_media_submission_state(
    task_id: str,
    submission_status: str,
    upstream_task_id: Optional[str] = None,
) -> bool:
    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry or entry.get("status") == "cancelled":
            return False
        entry["submission_status"] = submission_status
        if upstream_task_id is not None:
            entry["upstream_task_id"] = upstream_task_id.strip()
    try:
        _save_task_center()
    except Exception as exc:
        with _task_center_lock:
            if task_id in _task_center:
                _task_center[task_id]["task_center_save_error"] = str(exc)
        print(f"[task-center] failed to persist submission state {task_id}: {exc}")
    return True


def _run_media_submission(task_id: str, req, task_type: str, protocol: str) -> None:
    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry or entry.get("status") == "cancelled":
            return

    try:
        if task_type == "video":
            result = video_node.submit(
                api_base_url=req.api_base_url,
                api_key=req.api_key,
                prompt=req.prompt,
                model=req.model,
                duration=req.duration,
                aspect_ratio=req.aspect_ratio,
                resolution=req.resolution,
                image_url=req.image_url,
                image_urls=req.image_urls,
                image_with_roles=req.image_with_roles,
                video_urls=req.video_urls,
                reference_video_urls=req.reference_video_urls,
                audio_urls=req.audio_urls,
                generation_mode=req.generation_mode,
                generate_audio=req.generate_audio,
                api_protocol=protocol,
            )
        else:
            result = image_node.submit(
                api_base_url=req.api_base_url,
                api_key=req.api_key,
                prompt=req.prompt,
                model=req.model,
                size=req.size,
                resolution=req.resolution,
                quality=req.quality,
                background=req.background,
                output_format=req.output_format,
                n=req.n,
                operation=req.operation,
                image_url=req.image_url,
                mask_url=req.mask_url,
                image_urls=req.image_urls,
                api_protocol=protocol,
            )
    except Exception as exc:
        label = "视频" if task_type == "video" else "图片"
        _mark_task_failed(
            task_id,
            error=f"{label}生成服务异常：{exc}",
            node_id=req.node_id,
            project_id=req.project_id,
            run_id=req.run_id,
            source="backend",
            submission_status="failed",
        )
        return

    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry or entry.get("status") == "cancelled":
            return

    if not result.get("success"):
        _mark_task_failed(
            task_id,
            error=result.get("error") or f"{task_type} 提交失败",
            node_id=req.node_id,
            project_id=req.project_id,
            run_id=req.run_id,
            source="upstream",
            submission_status="failed",
        )
        return

    submission_status = result.get("status") or ("running" if result.get("task_id") else "")
    if submission_status == "completed":
        if not _update_media_submission_state(task_id, "completed", ""):
            return
        _record_task_source_result(task_id, result.get("result"))
        try:
            _persist_task_media(task_id)
        except Exception as exc:
            with _task_center_lock:
                entry = _task_center.get(task_id)
                if not entry or entry.get("status") == "cancelled":
                    return
                entry.update({
                    "status": "save_failed",
                    "persistence_status": "save_failed",
                    "save_error": str(exc),
                })
                _finalize_task_timing(entry)
            _save_task_center()
        return

    upstream_task_id = str(result.get("task_id") or "").strip()
    if not upstream_task_id:
        _mark_task_failed(
            task_id,
            error="上游提交成功，但没有返回任务 ID",
            node_id=req.node_id,
            project_id=req.project_id,
            run_id=req.run_id,
            source="upstream",
            submission_status="failed",
        )
        return
    _update_media_submission_state(task_id, "submitted", upstream_task_id)


def _queue_media_submission(
    req,
    task_type: str,
    protocol: str,
    background_tasks: BackgroundTasks,
) -> dict:
    local_task_id = f"{task_type}_{uuid.uuid4().hex}"
    _register_task(
        local_task_id,
        task_type,
        node_id=req.node_id,
        project_id=req.project_id,
        run_id=req.run_id,
        parent_id=getattr(req, "parent_id", ""),
        batch_id=getattr(req, "batch_id", ""),
        prompt_summary=req.prompt,
        api_base_url=req.api_base_url,
        api_key=req.api_key,
        provider_protocol=protocol,
        submission_status="submitting",
    )
    background_tasks.add_task(
        _run_media_submission,
        local_task_id,
        req,
        task_type,
        protocol,
    )
    return {
        "success": True,
        "task_id": local_task_id,
        "async": True,
        "status": "running",
    }


@app.post("/api/image")
def run_image(req: ImageRequest, background_tasks: BackgroundTasks):
    """执行图片生成。异步模式始终返回本地任务 ID。"""
    protocol = resolve_media_provider_protocol(req.provider_id, req.api_base_url, req.api_protocol)
    try:
        if protocol == "apimart":
            references = list(dict.fromkeys([
                *([req.image_url] if req.image_url else []),
                *[value for value in req.image_urls if value],
            ]))
            validate_image_request(
                req.model,
                references=references,
                operation=req.operation,
            )
            prepare_image_payload({
                "model": req.model,
                "prompt": req.prompt,
                "size": req.size,
                "resolution": req.resolution,
                "quality": req.quality,
                "background": req.background,
                "output_format": req.output_format,
                "n": req.n,
                "operation": req.operation,
                "mask_url": req.mask_url,
            })
        if req.async_mode:
            return _queue_media_submission(req, "image", protocol, background_tasks)
        return image_node.execute(
            api_base_url=req.api_base_url,
            api_key=req.api_key,
            prompt=req.prompt,
            model=req.model,
            size=req.size,
            resolution=req.resolution,
            quality=req.quality,
            background=req.background,
            output_format=req.output_format,
            n=req.n,
            operation=req.operation,
            image_url=req.image_url,
            mask_url=req.mask_url,
            image_urls=req.image_urls,
            poll_interval=req.poll_interval,
            timeout=req.timeout,
            api_protocol=protocol,
        )
    except Exception as exc:
        return {"success": False, "error": f"图片生成服务异常：{exc}"}


class TaskQueryRequest(BaseModel):
    api_base_url: str = ""
    api_key: str


class TaskFailRequest(BaseModel):
    error: str = "生成失败"
    node_id: str = ""
    project_id: str = ""
    run_id: str = ""
    source: str = "client"


@app.get("/api/task/{task_id}")
def query_task(
    task_id: str,
    background_tasks: BackgroundTasks,
    api_base_url: str = "",
    api_key: str = "",
):
    """查询异步任务状态 — 优先从任务中心读取，running 时主动查中转站"""
    task_center = _task_center_snapshot()
    entry = task_center.get(task_id)
    if entry and entry.get("status") == "saving":
        return {"success": True, "data": _public_task_entry(task_id, entry), "source": "task_center"}
    if entry and entry.get("status") == "completed" and _task_needs_persistence(entry):
        with _task_center_lock:
            if task_id in _task_center:
                _task_center[task_id]["status"] = "saving"
                _task_center[task_id]["persistence_status"] = "saving"
                entry = _clone_jsonable(_task_center[task_id])
        _save_task_center()
        background_tasks.add_task(_persist_task_media, task_id)
        return {"success": True, "data": _public_task_entry(task_id, entry), "source": "task_center"}
    if (
        entry
        and entry.get("status") in ("running", "query_failed")
        and entry.get("submission_status") == "submitting"
        and not entry.get("upstream_task_id")
    ):
        return {"success": True, "data": _public_task_entry(task_id, entry), "source": "task_center"}
    if entry and entry.get("status") not in ("running", "query_failed"):
        return {"success": True, "data": _public_task_entry(task_id, entry), "source": "task_center"}

    # running、query_failed 或未知：查中转站
    resolved_base_url, resolved_api_key = _resolve_task_query_context(entry, api_base_url, api_key)
    resolved_protocol = (entry or {}).get("provider_protocol") or resolve_media_provider_protocol(
        api_base_url=resolved_base_url,
        requested_protocol="openai",
    )
    upstream_task_id = (entry or {}).get("upstream_task_id") or task_id
    if entry and not resolved_api_key:
        failed_entry = _record_task_query_failure(task_id, "缺少查询中转站所需的 API Key")
        return {"success": True, "data": _public_task_entry(task_id, failed_entry), "source": "task_center"}

    if entry and entry.get("type") == "avatar_certification":
        try:
            task_data = get_provider_adapter("apimart").query_raw_task(
                task_id=upstream_task_id,
                base_url=resolved_base_url,
                api_key=resolved_api_key,
            )
            result = {"success": True, "data": task_data}
        except ProviderError as exc:
            result = {"success": False, "error": str(exc)}
        if result.get("success"):
            tc_data = result.get("data", {})
            tc_status = _normalize_task_status(tc_data.get("status", ""))
            task = _record_private_avatar_task_result(task_id, tc_data, tc_status)
            return {"success": True, "data": task, "source": "task_center"}
        failed_entry = _record_task_query_failure(task_id, result.get("error", "无法查询认证任务状态"))
        return {"success": True, "data": _public_task_entry(task_id, failed_entry), "source": "task_center"}

    query_node = video_node if (entry or {}).get("type") == "video" else image_node
    result = query_node.query_task(
        task_id=upstream_task_id,
        api_base_url=resolved_base_url,
        api_key=resolved_api_key,
        api_protocol=resolved_protocol,
    )
    if result.get("success"):
        tc_data = result.get("data", {})
        tc_status = _normalize_task_status(tc_data.get("status", ""))
        if tc_status == "completed":
            _reset_task_query_failure(task_id)
            _record_task_source_result(task_id, tc_data.get("result"))
            background_tasks.add_task(_persist_task_media, task_id)
            task_center = _task_center_snapshot()
            return {
                "success": True,
                "data": _public_task_entry(task_id, task_center[task_id]),
                "source": "task_center",
            }
        elif tc_status == "failed":
            _reset_task_query_failure(task_id)
            _mark_task_failed(
                task_id,
                error=tc_data.get("error") or tc_data.get("message") or "生成失败",
                source="upstream",
            )
        elif tc_status == "running":
            _reset_task_query_failure(task_id)
            if not entry:
                _register_task(task_id, "video" if query_node is video_node else "image")
            else:
                with _task_center_lock:
                    current_status = _task_center[task_id].get("status")
                    should_save_running = current_status == "query_failed"
                    if current_status in {"running", "query_failed"}:
                        _task_center[task_id]["status"] = "running"
                if should_save_running:
                    _save_task_center()
        else:
            failed_entry = _record_task_query_failure(
                task_id,
                f"中转站返回未知任务状态：{tc_data.get('status') or '空'}",
            )
            return {"success": True, "data": _public_task_entry(task_id, failed_entry), "source": "task_center"}
        return {
            "success": True,
            "data": _public_task_entry(task_id, _task_center_snapshot().get(task_id, tc_data)),
            "source": "task_center",
        }
    failed_entry = _record_task_query_failure(task_id, result.get("error", "无法查询中转站任务状态"))
    return {"success": True, "data": _public_task_entry(task_id, failed_entry), "source": "task_center"}


@app.get("/api/tasks")
def list_tasks(project_id: str = "", node_id: str = "", run_id: str = ""):
    """列出所有任务，可按 project_id / node_id 过滤"""
    task_center = _task_center_snapshot()
    tasks = [_public_task_entry(tid, info) for tid, info in task_center.items()]
    if project_id:
        tasks = [t for t in tasks if t.get("project_id") == project_id]
    if node_id:
        tasks = [t for t in tasks if t.get("node_id") == node_id]
    if run_id:
        tasks = [t for t in tasks if t.get("run_id") == run_id]
    running = sum(1 for t in tasks if t["status"] in ("running", "saving"))
    completed = sum(1 for t in tasks if t["status"] == "completed")
    failed = sum(1 for t in tasks if t["status"] == "failed")
    query_failed = sum(1 for t in tasks if t["status"] == "query_failed")
    save_failed = sum(1 for t in tasks if t["status"] == "save_failed")
    cancelled = sum(1 for t in tasks if t["status"] == "cancelled")
    return {
        "success": True,
        "total": len(tasks),
        "running": running,
        "completed": completed,
        "failed": failed,
        "query_failed": query_failed,
        "save_failed": save_failed,
        "cancelled": cancelled,
        "tasks": tasks,
    }


@app.post("/api/task/{task_id}/persist")
def retry_task_persistence(task_id: str):
    """重新把已经生成的中转站媒体保存到本站服务器。"""
    if task_id not in _task_center_snapshot():
        raise HTTPException(status_code=404, detail="任务不存在")
    task = _persist_task_media(task_id)
    return {
        "success": task.get("status") == "completed",
        "task": task,
        "error": task.get("save_error", ""),
    }


@app.post("/api/task/{task_id}/fail")
def fail_task(task_id: str, req: TaskFailRequest):
    """由生成链路上报致命失败，后端任务中心负责终止任务状态。"""
    task = _mark_task_failed(
        task_id,
        error=req.error,
        node_id=req.node_id,
        project_id=req.project_id,
        run_id=req.run_id,
        source=req.source,
    )
    return {
        "success": task.get("status") == "failed",
        "task": task,
        "error": task.get("error", {}).get("message", "") if isinstance(task.get("error"), dict) else task.get("error", ""),
    }


@app.post("/api/task/{task_id}/cancel")
def cancel_task(task_id: str):
    """取消任务——仅 running 状态可取消"""
    now = _now_seconds()
    with _task_center_lock:
        if task_id not in _task_center:
            return {"ok": False, "error": "任务不存在"}
        if _task_center[task_id]["status"] != "running":
            return {"ok": False, "error": "任务不在运行中，无法取消"}
        _task_center[task_id]["status"] = "cancelled"
        _task_center[task_id]["cancelled_at"] = now
        _finalize_task_timing(_task_center[task_id], now)
    _save_task_center()
    return {"ok": True}


def _normalize_private_avatar_assets(req: PrivateAvatarSubmitRequest) -> list[PrivateAvatarAsset]:
    assets = list(req.assets or [])
    if req.url:
        assets.append(PrivateAvatarAsset(
            url=req.url,
            name=req.name or "avatar",
            type=req.asset_type,
            role="main_visual",
        ))
    normalized = []
    for index, asset in enumerate(assets):
        url = (asset.url or "").strip()
        if not url:
            continue
        normalized.append(PrivateAvatarAsset(
            url=url,
            name=(asset.name or req.name or f"avatar-{index + 1}").strip(),
            type=str(asset.type or req.asset_type or "image").strip().lower(),
            role=(asset.role or "reference").strip(),
        ))
    if not normalized:
        raise HTTPException(status_code=400, detail="至少需要提交一个角色素材")
    return normalized


def _extract_private_avatar_task_id(data: dict) -> str:
    payload = data.get("data", data) if isinstance(data, dict) else {}
    if isinstance(payload, dict):
        return payload.get("id") or payload.get("task_id") or payload.get("taskId") or ""
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0].get("id") or payload[0].get("task_id") or payload[0].get("taskId") or ""
    return ""


def _normalize_private_avatar_result(result: dict, submitted_assets: Optional[list] = None) -> dict:
    submitted_assets = submitted_assets if isinstance(submitted_assets, list) else []
    if not isinstance(result, dict):
        result = {}
    raw_assets = result.get("assets") or result.get("Assets") or []
    if not isinstance(raw_assets, list):
        raw_assets = []
    asset_url = result.get("asset_url") or result.get("assetUrl") or ""
    asset_id = result.get("asset_id") or result.get("assetId") or ""
    if asset_url and not raw_assets:
        raw_assets = [{
            "asset_url": asset_url,
            "asset_id": asset_id or asset_url.replace("asset://", ""),
            "status": result.get("status") or "Active",
        }]

    def merge_asset(item, index):
        submitted = submitted_assets[index] if index < len(submitted_assets) and isinstance(submitted_assets[index], dict) else {}
        asset_url_value = item.get("asset_url") or item.get("assetUrl") or item.get("url") or ""
        asset_id_value = item.get("asset_id") or item.get("assetId") or item.get("id") or ""
        return {
            **item,
            "assetUrl": asset_url_value,
            "assetId": asset_id_value or (asset_url_value.replace("asset://", "") if asset_url_value.startswith("asset://") else ""),
            "status": item.get("status") or "Active",
            "name": item.get("name") or submitted.get("name") or "",
            "type": str(item.get("type") or item.get("asset_type") or submitted.get("type") or "image").lower(),
            "role": item.get("role") or submitted.get("role") or "",
        }

    assets = [merge_asset(item, index) for index, item in enumerate(raw_assets) if isinstance(item, dict)]
    usable_assets = [
        asset for asset in assets
        if str(asset.get("assetUrl") or "").startswith("asset://")
        or str(asset.get("asset_url") or "").startswith("asset://")
    ]
    failed_assets = [
        asset for asset in assets
        if str(asset.get("status") or "").lower() in {"failed", "failure", "rejected", "error", "errored"}
    ]
    return {
        "assets": assets,
        "usable_assets": usable_assets,
        "failed_assets": failed_assets,
        "group_id": result.get("group_id") or result.get("groupId") or "",
        "group_name": result.get("group_name") or result.get("groupName") or "",
        "project_name": result.get("project_name") or result.get("projectName") or "",
        "raw": result,
    }


def _record_private_avatar_task_result(task_id: str, task_data: dict, status: str) -> dict:
    with _task_center_lock:
        entry = _task_center.get(task_id)
        if not entry:
            _register_task(task_id, "avatar_certification")
            entry = _task_center[task_id]
        submitted_assets = _clone_jsonable(entry.get("submitted_assets") or [])
        normalized_result = _normalize_private_avatar_result((task_data or {}).get("result") or {}, submitted_assets)
        completed = status == "completed" and bool(normalized_result.get("usable_assets"))
        entry.update({
            "status": "completed" if completed else "failed" if status in {"completed", "failed"} else "running",
            "result": normalized_result,
            "source_result": task_data,
            "persistence_status": "not_required",
            "save_error": "",
            "error": None if completed else {"message": "认证未返回可用 Asset"} if status == "completed" else (task_data or {}).get("error"),
        })
        if entry.get("status") in TERMINAL_TASK_STATUSES:
            _finalize_task_timing(entry)
    _save_task_center()
    with _task_center_lock:
        return _public_task_entry(task_id, _task_center[task_id])


@app.post("/api/private-avatar/submit")
def submit_private_avatar(req: PrivateAvatarSubmitRequest):
    """提交角色主视觉/三视图认证，并登记到任务中心。"""
    base_url = clean_base_url(req.api_base_url) or "https://api.apimart.ai/v1"
    if not req.api_key.strip():
        raise HTTPException(status_code=400, detail="API Key 不能为空")
    assets = _normalize_private_avatar_assets(req)
    task_id = (req.client_task_id or "").strip() or f"avatar_certification_submit_{uuid.uuid4().hex}"
    target = req.target.model_dump() if req.target else {"kind": "character_node", "nodeId": req.node_id}
    _register_task(
        task_id,
        "avatar_certification",
        node_id=req.node_id or target.get("nodeId", ""),
        project_id=req.project_id,
        run_id=req.run_id,
        prompt_summary=", ".join(asset.name for asset in assets),
        api_base_url=base_url,
        api_key=req.api_key,
    )

    try:
        uploaded_assets = []
        for asset in assets:
            asset_type = str(asset.type or "image").lower()
            uploaded_url = upload_reference_image(req.api_key, asset.url, base_url) if asset_type == "image" else asset.url
            uploaded_assets.append({
                "url": uploaded_url,
                "name": asset.name,
                "type": asset_type,
                "role": asset.role,
            })
        submit_payload = {
            "project_name": req.project_name or "default",
            "asset_type": req.asset_type or "Image",
            "assets": [{"url": item["url"], "name": item["name"]} for item in uploaded_assets],
        }
        if req.group_id:
            submit_payload["group_id"] = req.group_id
        else:
            submit_payload["group"] = (req.group or PrivateAvatarGroup()).model_dump()

        with _task_center_lock:
            entry = _task_center[task_id]
            entry.update({
                "type": "avatar_certification",
                "target": target,
                "submitted_assets": uploaded_assets,
                "source_urls": [item["url"] for item in uploaded_assets],
                "persistence_status": "not_required",
            })
        _save_task_center()

        response = requests.post(
            f"{base_url}/seedance2/private-avatar",
            headers={
                "Authorization": f"Bearer {req.api_key}",
                "Content-Type": "application/json",
            },
            json=submit_payload,
            timeout=(15, 90),
        )
        response.raise_for_status()
        body = response.json()
        upstream_task_id = _extract_private_avatar_task_id(body)
        if not upstream_task_id:
            raise RuntimeError(f"未获取到认证 task_id: {json.dumps(body, ensure_ascii=False)[:500]}")
        if upstream_task_id != task_id:
            _register_task(
                upstream_task_id,
                "avatar_certification",
                node_id=req.node_id or target.get("nodeId", ""),
                project_id=req.project_id,
                run_id=req.run_id,
                prompt_summary=", ".join(item["name"] for item in uploaded_assets),
                api_base_url=base_url,
                api_key=req.api_key,
            )
            with _task_center_lock:
                _task_center[upstream_task_id].update({
                    "target": target,
                    "submitted_assets": uploaded_assets,
                    "source_urls": [item["url"] for item in uploaded_assets],
                    "persistence_status": "not_required",
                })
            _save_task_center()
        task_snapshot = _task_center_snapshot()
        return {
            "success": True,
            "task_id": upstream_task_id,
            "task": _public_task_entry(upstream_task_id, task_snapshot[upstream_task_id]),
        }
    except Exception as exc:
        message = str(exc)
        _mark_task_failed(
            task_id,
            f"提交角色认证失败：{message}",
            node_id=req.node_id or target.get("nodeId", ""),
            project_id=req.project_id,
            run_id=req.run_id,
            source="avatar_certification_submit",
        )
        with _task_center_lock:
            if task_id in _task_center:
                _task_center[task_id].update({
                    "type": "avatar_certification",
                    "target": target,
                    "submitted_assets": [asset.model_dump() for asset in assets],
                    "persistence_status": "not_required",
                })
        _save_task_center()
        return {"success": False, "error": f"提交角色认证失败：{message}", "task_id": task_id}


@app.delete("/api/tasks/history")
def clear_task_history():
    """清理已完成/已取消/已失败的历史任务"""
    task_center = _task_center_snapshot()
    to_remove = [
        tid for tid, info in task_center.items()
        if _public_task_info(info).get("status") in ("completed", "cancelled", "failed", "query_failed", "save_failed")
    ]
    with _task_center_lock:
        for tid in to_remove:
            _task_center.pop(tid, None)
    _save_task_center()
    return {"ok": True, "removed": len(to_remove)}


@app.post("/api/video")
def run_video(req: VideoRequest, background_tasks: BackgroundTasks):
    """执行视频生成"""
    protocol = resolve_media_provider_protocol(req.provider_id, req.api_base_url, req.api_protocol)
    if req.async_mode:
        return _queue_media_submission(req, "video", protocol, background_tasks)

    result = video_node.execute(
        api_base_url=req.api_base_url,
        api_key=req.api_key,
        prompt=req.prompt,
        model=req.model,
        duration=req.duration,
        aspect_ratio=req.aspect_ratio,
        resolution=req.resolution,
        image_url=req.image_url,
        image_urls=req.image_urls,
        image_with_roles=req.image_with_roles,
        video_urls=req.video_urls,
        reference_video_urls=req.reference_video_urls,
        audio_urls=req.audio_urls,
        generation_mode=req.generation_mode,
        generate_audio=req.generate_audio,
        poll_interval=req.poll_interval,
        timeout=req.timeout,
        api_protocol=protocol,
    )
    return result


@app.post("/api/tts")
def run_tts(req: TTSRequest):
    """执行语音合成"""
    result = tts_node.execute(
        api_base_url=req.api_base_url,
        api_key=req.api_key,
        model=req.model,
        text=req.text,
        voice=req.voice,
        style=req.style,
        output_dir=UPLOAD_DIR,
    )
    if result.get("success") and result.get("filename"):
        result["audio_url"] = f"/uploads/{result['filename']}"
    return result


def _resolve_voice_design_api_key(settings: RuntimeSettings) -> str:
    minimax_settings = getattr(settings, "minimaxVoiceDesign", None)
    minimax_key = getattr(minimax_settings, "apiKey", "") if minimax_settings else ""
    if str(minimax_key or "").strip():
        return str(minimax_key).strip()
    active_provider = next((p for p in settings.providers if p.id == settings.activeProviderId), None)
    if active_provider and active_provider.apiKey.strip():
        return active_provider.apiKey.strip()
    fallback_provider = next((p for p in settings.providers if p.apiKey.strip()), None)
    return fallback_provider.apiKey.strip() if fallback_provider else ""


@app.post("/api/voice-design")
def run_voice_design(req: VoiceDesignRequest):
    """使用当前配置的 Key 设计角色音色。"""
    settings = load_runtime_settings()
    result = voice_design_node.execute(
        api_key=_resolve_voice_design_api_key(settings),
        prompt=req.prompt,
        preview_text=req.preview_text,
        output_dir=UPLOAD_DIR,
    )
    if result.get("success") and result.get("filename"):
        result["audio_url"] = f"/uploads/{result['filename']}"
    return result


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/proxy/download")
def proxy_download(url: str):
    """
    中转下载：把任意 HTTP(S) 图片拉回来返回给前端。
    解决跨域 + 防盗链图无法直接 <a download> 的问题。
    """
    if not url:
        raise HTTPException(status_code=400, detail="缺少 url 参数")
    if not url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="url 必须以 http(s):// 开头")

    try:
        resp = requests.get(
            url,
            timeout=60,
            stream=True,
            headers={"User-Agent": "AI-Canvas/0.1"},
        )
        resp.raise_for_status()
    except requests.exceptions.Timeout:
        raise HTTPException(status_code=504, detail="下载源超时")
    except requests.exceptions.HTTPError:
        raise HTTPException(
            status_code=502,
            detail=f"下载源返回 HTTP {resp.status_code}",
        )
    except requests.exceptions.RequestException as exc:
        raise HTTPException(status_code=502, detail=f"下载源不可达: {exc}")

    # 从 URL 里猜扩展名作为下载文件名
    from urllib.parse import urlparse
    parsed = urlparse(url)
    last = parsed.path.rsplit("/", 1)[-1] or "image"
    if "." not in last:
        last = f"{last}.png"
    # 文件名里的非 ASCII / 特殊字符做兜底
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", last)[:80]

    content_type = resp.headers.get("Content-Type", "application/octet-stream")
    return StreamingResponse(
        resp.iter_content(chunk_size=64 * 1024),
        media_type=content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "Cache-Control": "no-store",
        },
    )


# 静态文件服务：上传的参考图片
os.makedirs(UPLOAD_DIR, exist_ok=True)
if os.path.isdir(LEGACY_UPLOAD_DIR) and LEGACY_UPLOAD_DIR != UPLOAD_DIR:
    for legacy_filename in os.listdir(LEGACY_UPLOAD_DIR):
        legacy_path = os.path.join(LEGACY_UPLOAD_DIR, legacy_filename)
        target_path = os.path.join(UPLOAD_DIR, legacy_filename)
        if os.path.isfile(legacy_path) and not os.path.exists(target_path):
            shutil.copy2(legacy_path, target_path)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")
