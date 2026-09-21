"""Small process bridge between FastAPI and the DeepSeek Harness Node SDK."""

from __future__ import annotations

import atexit
import json
import os
import queue
import re
import shutil
import subprocess
import threading
import uuid
from collections import deque
from pathlib import Path
from typing import Any, Optional


_configured_runtime_dir = os.environ.get("INUX_COPILOT_RUNTIME_DIR", "").strip()
RUNTIME_DIR = (
    Path(_configured_runtime_dir).expanduser().resolve()
    if _configured_runtime_dir
    else Path(__file__).resolve().parent / "copilot-runtime"
)
BRIDGE_SCRIPT = RUNTIME_DIR / "bridge.mjs"
SDK_PACKAGE = RUNTIME_DIR / "node_modules" / "@deepseek-ai" / "dsh-sdk-client" / "package.json"


class CopilotHarnessError(RuntimeError):
    """A safe, user-presentable Harness runtime failure."""


_ACTION_VERB = re.compile(
    r"创建|新建|新增|添加|插入|生成|连接|连线|接到|修改|更新|改写|重写|替换|调整|润色|精简|"
    r"改成|改为|改得|运行|执行|删除|移除|复制|"
    r"\b(create|add|insert|generate|connect|update|rewrite|replace|run|execute|delete|remove|duplicate)\b",
    re.IGNORECASE,
)
_DIRECT_REQUEST = re.compile(
    r"^\s*(请|帮我|替我|给我|我要|我需要|直接|现在|立即|把|在画布|"
    r"创建|新建|新增|添加|插入|生成|连接|连线|修改|更新|改写|重写|替换|调整|润色|精简|"
    r"改成|改为|改得|运行|执行|删除|移除|复制|"
    r"create|add|insert|generate|connect|update|rewrite|replace|run|execute|delete|remove|duplicate)",
    re.IGNORECASE,
)
_ANALYSIS_REQUEST = re.compile(
    r"^\s*(请\s*)?(帮我\s*)?(分析|讨论|聊聊|解释|介绍|告诉我|怎么|如何|为什么|是否|能不能|可不可以|"
    r"analy[sz]e|discuss|explain|how|why|can you|could you)",
    re.IGNORECASE,
)
_QUESTION_REQUEST = re.compile(
    r"怎么|如何|为什么|是否|能不能|可不可以|可以.{0,12}吗|能.{0,12}吗|会.{0,12}吗|请问|教程|方法|"
    r"\b(how|why|can you|could you|would you|is it possible)\b",
    re.IGNORECASE,
)
_STRONG_REQUEST = re.compile(
    r"帮我|替我|给我|我要|我需要|直接|现在|立即|把|在画布|到画布|"
    r"\b(please (create|add|insert|generate|connect|update|run|execute)|do it|right now)\b",
    re.IGNORECASE,
)
_NEGATED_ACTION = re.compile(
    r"^\s*(请\s*)?(不要|别|无需|不需要|先不|暂时不)\s*"
    r"(创建|新建|新增|添加|插入|生成|连接|连线|修改|更新|改写|重写|替换|调整|润色|精简|"
    r"改成|改为|改得|运行|执行|删除|移除|复制)",
    re.IGNORECASE,
)
_TARGETED_EDIT_FOLLOWUP = re.compile(
    r"^\s*(请\s*)?(再|更|稍微|继续)?\s*"
    r"(短|长|简洁|精简|口语|正式|活泼|具体|详细|自然|有力|柔和|专业).{0,12}(一点|一些)?\s*[。！!]?\s*$",
    re.IGNORECASE,
)


def has_explicit_canvas_action(message: str, *, has_targets: bool = False) -> bool:
    """Conservative write gate; semantic planning still belongs to Harness."""
    text = " ".join(str(message or "").strip().split())
    if not text:
        return False
    if has_targets and _TARGETED_EDIT_FOLLOWUP.search(text):
        return True
    if not _ACTION_VERB.search(text):
        return False
    positive_after_negation = re.search(
        r"(只|但是|但|而是|改为|改成).{0,20}(创建|新建|新增|添加|生成|连接|修改|改写|重写|调整|运行|执行)",
        text,
    )
    if _NEGATED_ACTION.search(text) and not positive_after_negation:
        return False
    if _ANALYSIS_REQUEST.search(text) and not re.search(
        r"并.{0,12}(创建|添加|生成|连接|修改|改写|重写|调整|运行|执行)", text
    ):
        return False
    if _QUESTION_REQUEST.search(text) and not _STRONG_REQUEST.search(text):
        return False
    if _DIRECT_REQUEST.search(text):
        return True
    return bool(_STRONG_REQUEST.search(text) or positive_after_negation)


def _provider_value(provider: Any, key: str, default: Any = "") -> Any:
    if isinstance(provider, dict):
        return provider.get(key, default)
    return getattr(provider, key, default)


def resolve_copilot_provider(
    settings: Any,
    provider_id: str = "",
    model_name: str = "",
) -> dict[str, Any]:
    """Choose an enabled text model without exposing credentials."""
    providers = list(getattr(settings, "providers", None) or [])
    active_id = str(getattr(settings, "activeProviderId", "") or "")
    ordered = sorted(providers, key=lambda item: _provider_value(item, "id") != active_id)

    requested_provider_id = str(provider_id or "").strip()
    requested_model_name = str(model_name or "").strip()
    if bool(requested_provider_id) != bool(requested_model_name):
        raise CopilotHarnessError("模型选择信息不完整，请重新选择。")

    usable = []
    for provider in ordered:
        base_url = str(_provider_value(provider, "baseUrl") or "").strip().rstrip("/")
        api_key = str(_provider_value(provider, "apiKey") or "").strip()
        models = [str(item).strip() for item in (_provider_value(provider, "textModels", []) or []) if str(item).strip()]
        default_model = str(_provider_value(provider, "defaultTextModel") or "").strip()
        model = default_model or (models[0] if models else "")
        enabled = bool(_provider_value(provider, "enabled", True))
        if enabled and base_url and api_key and model:
            usable.append((provider, base_url, api_key, model))

    if requested_provider_id:
        requested_provider = next(
            (item for item in providers if str(_provider_value(item, "id") or "") == requested_provider_id),
            None,
        )
        if requested_provider is None:
            raise CopilotHarnessError("选择的模型服务已不存在，请重新选择。")
        if not bool(_provider_value(requested_provider, "enabled", True)):
            raise CopilotHarnessError("选择的模型服务尚未启用，请先在设置中启用。")
        base_url = str(_provider_value(requested_provider, "baseUrl") or "").strip().rstrip("/")
        api_key = str(_provider_value(requested_provider, "apiKey") or "").strip()
        models = [str(item).strip() for item in (_provider_value(requested_provider, "textModels", []) or []) if str(item).strip()]
        default_model = str(_provider_value(requested_provider, "defaultTextModel") or "").strip()
        allowed_models = set(models + ([default_model] if default_model else []))
        if requested_model_name not in allowed_models:
            raise CopilotHarnessError("选择的文本模型已不可用，请重新选择。")
        if not base_url or not api_key:
            raise CopilotHarnessError("选择的模型服务配置不完整，请在设置中检查。")
        selected = (requested_provider, base_url, api_key, requested_model_name)
    else:
        if not usable:
            raise CopilotHarnessError("请先在设置中配置可用的文本模型和 API。")
        selected = next((item for item in usable if "deepseek" in item[3].lower()), usable[0])

    provider, base_url, api_key, model = selected
    max_tokens = _provider_value(provider, "maxTextTokens", 8192)
    try:
        max_tokens = max(1024, min(int(max_tokens), 32768))
    except (TypeError, ValueError):
        max_tokens = 8192

    return {
        "providerId": str(_provider_value(provider, "id") or ""),
        "providerName": str(_provider_value(provider, "name") or "DeepSeek"),
        "baseUrl": base_url,
        "apiKey": api_key,
        "model": model,
        "maxTokens": max_tokens,
    }


def plan_requires_confirmation(plan: Any) -> bool:
    if not isinstance(plan, dict):
        return False
    nodes = plan.get("nodes")
    if not isinstance(nodes, list):
        return False
    return len(nodes) >= 5 or any(isinstance(node, dict) and node.get("run") is True for node in nodes)


def edit_plan_requires_confirmation(plan: Any) -> bool:
    if not isinstance(plan, dict):
        return False
    edits = plan.get("edits")
    return isinstance(edits, list) and len(edits) > 1


def friendly_copilot_error(message: str) -> str:
    text = str(message or "").strip()
    lowered = text.lower()
    if any(marker in lowered for marker in (
        "stream ended",
        "stream_closed",
        "transport",
        "sse stream",
        "rate_limit",
        "get_channel_failed",
    )):
        return "当前文本模型服务暂时不可用，请稍后重试或在设置中切换文本模型。"
    if any(marker in lowered for marker in ("401", "403", "credential", "api key", "unauthorized")):
        return "当前文本模型的访问凭证不可用，请在设置中检查 API 配置。"
    return text or "DeepSeek Harness 执行失败。"


class HarnessBridge:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._process: Optional[subprocess.Popen[str]] = None
        self._responses: queue.Queue[dict[str, Any]] = queue.Queue()
        self._stderr_tail: deque[str] = deque(maxlen=30)

    def _start_locked(self) -> None:
        if self._process and self._process.poll() is None:
            return
        if not SDK_PACKAGE.exists():
            raise CopilotHarnessError("Copilot 的 Harness 运行依赖尚未安装。")
        node_bin = os.environ.get("INUX_COPILOT_NODE_BIN") or shutil.which("node")
        if not node_bin:
            raise CopilotHarnessError("没有找到 Node.js，无法启动 DeepSeek Harness。")

        self._responses = queue.Queue()
        self._stderr_tail.clear()
        self._process = subprocess.Popen(
            [node_bin, str(BRIDGE_SCRIPT)],
            cwd=str(RUNTIME_DIR),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
        )
        threading.Thread(target=self._read_stdout, args=(self._process,), daemon=True).start()
        threading.Thread(target=self._read_stderr, args=(self._process,), daemon=True).start()

    def _read_stdout(self, process: subprocess.Popen[str]) -> None:
        if process.stdout is None:
            return
        for line in process.stdout:
            try:
                payload = json.loads(line)
            except (TypeError, ValueError):
                continue
            if isinstance(payload, dict):
                self._responses.put(payload)
        self._responses.put({"bridgeClosed": True})

    def _read_stderr(self, process: subprocess.Popen[str]) -> None:
        if process.stderr is None:
            return
        for line in process.stderr:
            cleaned = line.strip()
            if cleaned:
                self._stderr_tail.append(cleaned)

    def _stop_locked(self) -> None:
        process = self._process
        self._process = None
        if not process:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=3)

    def close(self) -> None:
        with self._lock:
            self._stop_locked()

    def request(self, payload: dict[str, Any], timeout: float = 210) -> dict[str, Any]:
        with self._lock:
            self._start_locked()
            process = self._process
            if process is None or process.stdin is None:
                raise CopilotHarnessError("DeepSeek Harness 启动失败。")

            request_id = uuid.uuid4().hex
            wire_payload = {**payload, "id": request_id}
            try:
                process.stdin.write(json.dumps(wire_payload, ensure_ascii=False) + "\n")
                process.stdin.flush()
            except (BrokenPipeError, OSError) as exc:
                self._stop_locked()
                raise CopilotHarnessError("DeepSeek Harness 连接已断开，请重试。") from exc

            while True:
                try:
                    response = self._responses.get(timeout=timeout)
                except queue.Empty as exc:
                    self._stop_locked()
                    raise CopilotHarnessError("Copilot 思考超时，请稍后重试。") from exc
                if response.get("bridgeClosed"):
                    detail = "；".join(self._stderr_tail)
                    self._stop_locked()
                    raise CopilotHarnessError(f"DeepSeek Harness 意外退出。{detail[:500]}")
                if response.get("id") != request_id:
                    continue
                if not response.get("ok"):
                    detail = friendly_copilot_error(str(response.get("error") or ""))
                    raise CopilotHarnessError(detail[:1000])
                result = response.get("result")
                if not isinstance(result, dict):
                    raise CopilotHarnessError("DeepSeek Harness 返回了无法识别的结果。")
                return result


_bridge = HarnessBridge()
atexit.register(_bridge.close)


def run_copilot_turn(
    *,
    session_id: str,
    message: str,
    canvas: dict[str, Any],
    provider: dict[str, Any],
    dsh_home: Path,
    attachments: Optional[list[dict[str, Any]]] = None,
    target_nodes: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    normalized_targets = target_nodes or []
    action_allowed = has_explicit_canvas_action(message, has_targets=bool(normalized_targets))
    config = {
        "baseUrl": provider["baseUrl"],
        "apiKey": provider["apiKey"],
        "model": provider["model"],
        "maxTokens": provider["maxTokens"],
        "dshHome": str(dsh_home.resolve()),
    }
    result = _bridge.request({
        "type": "turn",
        "sessionId": session_id,
        "message": message,
        "canvas": canvas,
        "targetNodes": normalized_targets,
        "attachments": attachments or [],
        "actionAllowed": action_allowed,
        "config": config,
    })

    plan = result.get("plan") if action_allowed else None
    edit_plan = result.get("editPlan") if action_allowed else None
    target_ids = {
        str(target.get("id") or "").strip()
        for target in normalized_targets
        if isinstance(target, dict) and str(target.get("id") or "").strip()
    }
    edit_node_ids = {
        str(edit.get("node_id") or "").strip()
        for edit in (edit_plan.get("edits") if isinstance(edit_plan, dict) else [])
        if isinstance(edit, dict)
    }
    invalid_edit_target = bool(edit_plan) and (
        not target_ids or not edit_node_ids or not edit_node_ids.issubset(target_ids)
    )
    conflicting_plans = bool(plan and edit_plan)
    if invalid_edit_target or conflicting_plans:
        edit_plan = None
        if conflicting_plans:
            plan = None
        result["guarded"] = True
    if (result.get("plan") or result.get("editPlan")) and not action_allowed:
        result["guarded"] = True
    result["plan"] = plan
    result["editPlan"] = edit_plan
    result["requiresConfirmation"] = plan_requires_confirmation(plan)
    result["editRequiresConfirmation"] = edit_plan_requires_confirmation(edit_plan)
    result["model"] = provider["model"]
    result["providerName"] = provider["providerName"]
    return result
