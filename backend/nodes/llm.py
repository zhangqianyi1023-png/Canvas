"""OpenAI-compatible LLM 节点。"""

import base64
import json
import mimetypes
import os
import re
import requests
import time
from typing import Optional
from urllib.parse import unquote, urlparse

from app_paths import UPLOAD_DIR
from providers.apimart import is_local_upload_reference, upload_reference_image


UPLOAD_ROOT = str(UPLOAD_DIR)
TEXT_API_MODES = {"auto", "chat_completions", "responses"}
RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}
PROTOCOL_FALLBACK_STATUSES = {400, 404, 405, 422}
PROTOCOL_ERROR_HINTS = {
    "endpoint",
    "unknown url",
    "unknown path",
    "not found",
    "unsupported endpoint",
    "unsupported field",
    "unsupported parameter",
    "not supported by this endpoint",
    "unknown field",
    "unknown parameter",
    "unrecognized field",
    "unrecognized request argument",
    "missing required field",
    "required field",
    "input_text",
    "input_image",
    "chat/completions",
    "responses",
}


class LLMHTTPError(RuntimeError):
    def __init__(self, status_code: int, body: str):
        self.status_code = status_code
        self.body = body or ""
        super().__init__(f"HTTP {status_code}: {self.body[:300]}")


class LLMIncompleteOutputError(ValueError):
    def __init__(self, partial_response: str = "", reasoning_tokens: int = 0):
        self.partial_response = partial_response or ""
        suffix = f"（推理已使用 {reasoning_tokens} Token）" if reasoning_tokens else ""
        super().__init__(f"文本输出额度达到系统最大值，内容未生成完整{suffix}")


def prepare_llm_image_reference(
    image_url: str,
    api_protocol: str = "openai",
    api_key: str = "",
    api_base_url: str = "",
) -> str:
    """Convert local uploaded images to data URLs before calling a remote LLM."""
    reference = (image_url or "").strip()
    if not reference:
        return reference

    parsed = urlparse(reference)
    is_local_upload = is_local_upload_reference(reference)
    if (api_protocol or "").lower() == "apimart" and (
        reference.startswith("data:image/") or is_local_upload
    ):
        return upload_reference_image(api_key, reference, api_base_url)

    if reference.startswith("data:") or not is_local_upload:
        return reference

    filename = os.path.basename(unquote(parsed.path))
    local_path = os.path.abspath(os.path.join(UPLOAD_ROOT, filename))
    if not local_path.startswith(UPLOAD_ROOT + os.sep) or not os.path.isfile(local_path):
        raise ValueError(f"本地参考图片不存在: {filename}")

    mime_type = mimetypes.guess_type(filename)[0] or "image/png"
    if not mime_type.startswith("image/"):
        raise ValueError(f"参考文件不是图片: {filename}")

    with open(local_path, "rb") as image_file:
        encoded = base64.b64encode(image_file.read()).decode("ascii")
    return f"data:{mime_type};base64,{encoded}"


def normalize_text_api_mode(value: str) -> str:
    mode = (value or "auto").strip().lower()
    return mode if mode in TEXT_API_MODES else "auto"


def choose_text_api_mode(configured_mode: str, has_images: bool) -> str:
    mode = normalize_text_api_mode(configured_mode)
    if mode == "auto":
        return "responses" if has_images else "chat_completions"
    return mode


def _normalize_api_base(api_base_url: str, api_protocol: str = "openai") -> str:
    base = (api_base_url or "").strip().rstrip("/")
    for suffix in ("/chat/completions", "/responses"):
        if base.endswith(suffix):
            base = base[:-len(suffix)].rstrip("/")

    protocol = (api_protocol or "openai").lower()
    parsed = urlparse(base)

    if protocol == "apimart":
        if parsed.hostname in {"apimart.ai", "www.apimart.ai"}:
            base = "https://api.apimart.ai/v1"
        elif parsed.hostname == "api.apimart.ai" and not base.endswith("/v1"):
            base = f"{base}/v1"
    elif protocol == "openai" and not base.endswith("/v1"):
        base = f"{base}/v1"

    return base


def normalize_llm_url(api_base_url: str, api_mode: str, api_protocol: str = "openai") -> str:
    base = _normalize_api_base(api_base_url, api_protocol)
    suffix = "responses" if api_mode == "responses" else "chat/completions"
    return f"{base}/{suffix}"


def normalize_chat_completions_url(api_base_url: str, api_protocol: str = "openai") -> str:
    return normalize_llm_url(api_base_url, "chat_completions", api_protocol)


def build_llm_payload(
        api_mode: str,
        model_name: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        image_urls: Optional[list[str]] = None) -> dict:
    references = [image_url for image_url in (image_urls or []) if image_url]
    prompt = user_prompt or ("请根据参考图片生成文本内容。" if references else "")

    if api_mode == "responses":
        user_content = [{"type": "input_text", "text": prompt}]
        user_content.extend({
            "type": "input_image",
            "image_url": image_url,
        } for image_url in references)
        inputs = []
        if system_prompt:
            inputs.append({
                "role": "system",
                "content": [{"type": "input_text", "text": system_prompt}],
            })
        inputs.append({"role": "user", "content": user_content})
        return {
            "model": model_name,
            "input": inputs,
            "temperature": temperature,
            "max_output_tokens": max_tokens,
            "stream": False,
        }

    user_content = prompt
    if references:
        user_content = [{"type": "text", "text": prompt}]
        user_content.extend({
            "type": "image_url",
            "image_url": {"url": image_url},
        } for image_url in references)
    messages = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append({"role": "user", "content": user_content})
    return {
        "model": model_name,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "stream": False,
    }


def _unwrap_response_data(data):
    if isinstance(data, dict) and isinstance(data.get("data"), dict):
        return data["data"]
    return data


def _content_to_text(content) -> str:
    if isinstance(content, str):
        return content
    if not isinstance(content, list):
        return ""
    chunks = []
    for item in content:
        if not isinstance(item, dict):
            continue
        text = item.get("text") or item.get("content")
        if isinstance(text, str) and text:
            chunks.append(text)
    return "".join(chunks)


def _raise_empty_output_error(finish_reason: str = "", usage=None, incomplete_details=None):
    details = usage.get("completion_tokens_details") if isinstance(usage, dict) else {}
    reasoning_tokens = details.get("reasoning_tokens", 0) if isinstance(details, dict) else 0
    incomplete_reason = incomplete_details.get("reason") if isinstance(incomplete_details, dict) else ""
    if finish_reason == "length" or incomplete_reason in {"max_output_tokens", "length"}:
        raise LLMIncompleteOutputError(reasoning_tokens=reasoning_tokens)
    if finish_reason == "content_filter":
        raise ValueError("模型响应被内容安全策略过滤")
    if finish_reason in {"tool_calls", "function_call"}:
        raise ValueError("模型返回了工具调用，但当前文本节点不支持执行工具")
    raise ValueError("响应中没有可用正文")


def parse_chat_completion_response(text: str) -> str:
    if not text:
        raise ValueError("空响应")

    stripped = text.strip()
    if stripped.startswith("data:"):
        chunks = []
        reasoning_chunks = []
        finish_reason = ""
        usage = None
        events = re.split(r"(?:^|\r?\n)data:\s*", stripped)
        for payload in events:
            payload = payload.strip()
            if not payload or payload == "[DONE]":
                continue
            if payload.endswith("[DONE]"):
                payload = payload[:-6].strip()
            data = json.loads(payload)
            choice = (data.get("choices") or [{}])[0]
            finish_reason = choice.get("finish_reason") or finish_reason
            usage = data.get("usage") or usage
            delta = choice.get("delta") or {}
            message = choice.get("message") or {}
            content = delta.get("content")
            if content is None:
                content = message.get("content")
            if content:
                chunks.append(content)
            reasoning_content = delta.get("reasoning_content") or message.get("reasoning_content")
            if reasoning_content:
                reasoning_chunks.append(reasoning_content)
        if chunks:
            content = "".join(chunks)
            if finish_reason == "length":
                details = usage.get("completion_tokens_details") if isinstance(usage, dict) else {}
                reasoning_tokens = details.get("reasoning_tokens", 0) if isinstance(details, dict) else 0
                raise LLMIncompleteOutputError(content, reasoning_tokens)
            return content
        if reasoning_chunks:
            return "".join(reasoning_chunks)
        raise ValueError("流式响应中没有可用正文")

    data = _unwrap_response_data(json.loads(stripped))
    if not isinstance(data, dict):
        raise ValueError("上游响应格式无效")
    if data.get("error"):
        error = data["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise ValueError(f"上游返回错误: {message}")
    choice = data["choices"][0]
    message = choice.get("message") or {}
    content = _content_to_text(message.get("content"))
    if content:
        if choice.get("finish_reason") == "length":
            usage = data.get("usage") if isinstance(data.get("usage"), dict) else {}
            details = usage.get("completion_tokens_details", {})
            reasoning_tokens = details.get("reasoning_tokens", 0) if isinstance(details, dict) else 0
            raise LLMIncompleteOutputError(content, reasoning_tokens)
        return content
    reasoning_content = _content_to_text(message.get("reasoning_content"))
    if reasoning_content:
        return reasoning_content
    _raise_empty_output_error(
        finish_reason=choice.get("finish_reason") or "",
        usage=data.get("usage"),
    )


def parse_responses_response(text: str) -> str:
    if not text:
        raise ValueError("空响应")
    data = _unwrap_response_data(json.loads(text.strip()))
    if not isinstance(data, dict):
        raise ValueError("上游响应格式无效")
    if data.get("error"):
        error = data["error"]
        message = error.get("message") if isinstance(error, dict) else str(error)
        raise ValueError(f"上游返回错误: {message}")

    chunks = []
    for output_item in data.get("output") or []:
        if not isinstance(output_item, dict) or output_item.get("type") != "message":
            continue
        for content_item in output_item.get("content") or []:
            if not isinstance(content_item, dict):
                continue
            if content_item.get("type") in {"output_text", "text"}:
                value = content_item.get("text")
                if isinstance(value, str) and value:
                    chunks.append(value)
    if chunks:
        content = "".join(chunks)
        incomplete_reason = (data.get("incomplete_details") or {}).get("reason")
        if incomplete_reason in {"max_output_tokens", "length"}:
            raise LLMIncompleteOutputError(content)
        return content

    _raise_empty_output_error(
        finish_reason=data.get("status") if data.get("status") != "completed" else "",
        usage=data.get("usage"),
        incomplete_details=data.get("incomplete_details"),
    )


def is_protocol_compatibility_error(status_code: int, body: str) -> bool:
    if status_code not in PROTOCOL_FALLBACK_STATUSES:
        return False
    normalized = (body or "").lower()
    return any(hint in normalized for hint in PROTOCOL_ERROR_HINTS)


class LLMNode:
    """调用 LLM API 生成文本"""

    def __init__(self):
        self._session = None

    def _create_session(self):
        session = requests.Session()
        session.verify = False
        import urllib3
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
        return session

    def _get_session(self):
        if self._session is None:
            self._session = self._create_session()
        return self._session

    def _reset_session(self):
        session = self._session
        self._session = None
        if session is not None:
            try:
                session.close()
            except Exception:
                pass

    def _execute_mode(self, api_mode: str, api_base_url: str, api_protocol: str,
                      headers: dict, payload: dict) -> str:
        url = normalize_llm_url(api_base_url, api_mode, api_protocol)
        last_err = None
        for attempt in range(3):
            session = self._get_session()
            try:
                resp = session.post(url, headers=headers, json=payload, timeout=(15, 90))
                if resp.status_code in RETRYABLE_HTTP_STATUSES and attempt < 2:
                    time.sleep(attempt + 1)
                    continue
                resp.raise_for_status()
                if api_mode == "responses":
                    return parse_responses_response(resp.text)
                return parse_chat_completion_response(resp.text)
            except requests.exceptions.HTTPError as exc:
                response = exc.response or locals().get("resp")
                status_code = getattr(response, "status_code", 0)
                body = getattr(response, "text", "")
                raise LLMHTTPError(status_code, body) from exc
            except requests.exceptions.Timeout as exc:
                last_err = exc
                self._reset_session()
                if attempt < 2:
                    time.sleep(attempt + 1)
            except requests.exceptions.ConnectionError as exc:
                last_err = exc
                self._reset_session()
                if attempt < 2:
                    time.sleep(attempt + 1)
            except requests.exceptions.RequestException as exc:
                last_err = exc
                self._reset_session()
                if attempt < 2:
                    time.sleep(attempt + 1)
        if isinstance(last_err, requests.exceptions.Timeout):
            raise RuntimeError("API 请求超时") from last_err
        raise RuntimeError(f"无法连接上游: {last_err}") from last_err

    def execute(self, api_base_url: str, api_key: str, model_name: str,
                system_prompt: str, user_prompt: str,
                temperature: float = 0.7, max_tokens: int = 2048,
                image_urls: Optional[list[str]] = None,
                api_protocol: str = "openai",
                text_api_mode: str = "auto") -> dict:
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"

        try:
            references = [
                prepare_llm_image_reference(image_url, api_protocol, api_key, api_base_url)
                for image_url in (image_urls or [])
                if image_url and image_url.strip()
            ]
        except (OSError, RuntimeError, ValueError) as exc:
            return {"success": False, "error": f"读取参考图片失败: {exc}"}
        configured_mode = normalize_text_api_mode(text_api_mode)
        primary_mode = choose_text_api_mode(configured_mode, bool(references))
        modes = [primary_mode]
        if configured_mode == "auto":
            alternate = "chat_completions" if primary_mode == "responses" else "responses"
            modes.append(alternate)

        for index, api_mode in enumerate(modes):
            payload = build_llm_payload(
                api_mode=api_mode,
                model_name=model_name,
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                temperature=temperature,
                max_tokens=max_tokens,
                image_urls=references,
            )
            try:
                content = self._execute_mode(
                    api_mode=api_mode,
                    api_base_url=api_base_url,
                    api_protocol=api_protocol,
                    headers=headers,
                    payload=payload,
                )
                return {"success": True, "response": content, "api_mode": api_mode}
            except LLMIncompleteOutputError as exc:
                return {
                    "success": False,
                    "incomplete": True,
                    "partial_response": exc.partial_response,
                    "error": f"[{api_mode}] {exc}",
                    "api_mode": api_mode,
                }
            except ValueError as ve:
                return {"success": False, "error": f"[{api_mode}] {ve}", "api_mode": api_mode}
            except LLMHTTPError as exc:
                can_fallback = (
                    configured_mode == "auto"
                    and index == 0
                    and is_protocol_compatibility_error(exc.status_code, exc.body)
                )
                if can_fallback:
                    continue
                return {"success": False, "error": f"[{api_mode}] {exc}", "api_mode": api_mode}
            except RuntimeError as exc:
                return {"success": False, "error": f"[{api_mode}] {exc}", "api_mode": api_mode}

        return {"success": False, "error": "文本接口模式不兼容", "api_mode": primary_mode}


# 节点元数据
NODE_META = {
    "type": "LLM",
    "display_name": "文本模型",
    "category": "AI/LLM",
    "inputs": {
        "api_base_url": {"type": "string", "default": "", "label": "API 地址"},
        "api_key": {"type": "string", "default": "", "label": "API Key"},
        "model_name": {"type": "string", "default": "", "label": "模型名称"},
        "system_prompt": {"type": "string", "default": "你是一个专业的电商文案策划师。", "label": "系统提示词", "multiline": True},
        "user_prompt": {"type": "string", "default": "", "label": "用户提示词", "multiline": True},
        "temperature": {"type": "float", "default": 0.7, "min": 0.0, "max": 2.0, "label": "温度"},
        "max_tokens": {"type": "int", "default": 2048, "min": 64, "max": 65536, "label": "最大 Token"},
    },
    "outputs": {
        "response": {"type": "string", "label": "LLM 输出"},
    },
}
