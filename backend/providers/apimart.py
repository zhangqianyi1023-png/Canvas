from __future__ import annotations

import base64
import ipaddress
import os
import socket
from typing import Optional, Tuple
from urllib.parse import unquote, urlparse

import httpx
import requests

from app_paths import UPLOAD_DIR
from apimart_image_models import (
    apimart_image_generation_endpoint,
    apimart_mask_uses_generation_endpoint,
    get_apimart_image_model_spec,
    prepare_apimart_image_payload,
    validate_apimart_image_request,
)
from .base import ProviderError
from .openai_compatible import OpenAICompatibleAdapter, normalize_base_url


SUPPORTED_UPLOAD_MIMES = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
}
UPLOAD_ATTEMPTS_PER_FIELD = 2
UPLOAD_ROOT = str(UPLOAD_DIR)
UPLOAD_TRANSPORTS = ("httpx-http2", "httpx-http1", "requests")


def is_local_upload_reference(image_url: str) -> bool:
    parsed = urlparse(image_url or "")
    path = unquote(parsed.path or "")
    if not path.startswith("/uploads/"):
        return False
    if not parsed.scheme:
        return True
    if parsed.scheme not in {"http", "https"}:
        return False
    hostname = parsed.hostname
    if hostname in {"localhost", "127.0.0.1", "::1"}:
        return True
    try:
        address = ipaddress.ip_address(hostname or "")
    except ValueError:
        return False
    return address.is_private or address.is_loopback


def _decode_data_url(data_url: str) -> Tuple[str, bytes]:
    if not data_url.startswith("data:image/") or "," not in data_url:
        raise ValueError("参考图不是有效的 data URL")
    header, encoded = data_url.split(",", 1)
    mime = header.split(";", 1)[0].replace("data:", "")
    try:
        return mime, base64.b64decode(encoded, validate=True)
    except (ValueError, base64.binascii.Error) as exc:
        raise ValueError("参考图 base64 数据无效") from exc


def _prepare_upload_image(data_url: str) -> Tuple[str, bytes, str]:
    mime, image_bytes = _decode_data_url(data_url)
    if mime not in SUPPORTED_UPLOAD_MIMES:
        raise ValueError("参考图格式不支持，仅支持 JPEG、PNG、WebP、GIF")
    return f"reference.{SUPPORTED_UPLOAD_MIMES[mime]}", image_bytes, mime


def _prepare_local_upload_image(
    image_url: str,
    upload_dir: str = UPLOAD_ROOT,
) -> Optional[Tuple[str, bytes, str]]:
    if not is_local_upload_reference(image_url):
        return None
    parsed = urlparse(image_url)
    filename = os.path.basename(unquote(parsed.path or ""))
    upload_root = os.path.abspath(upload_dir)
    local_path = os.path.abspath(os.path.join(upload_root, filename))
    if not local_path.startswith(upload_root + os.sep):
        raise ValueError("参考图本地路径不合法")
    mime_by_ext = {
        "jpg": "image/jpeg",
        "jpeg": "image/jpeg",
        "png": "image/png",
        "webp": "image/webp",
        "gif": "image/gif",
    }
    mime = mime_by_ext.get(os.path.splitext(filename)[1].lower().lstrip("."))
    if not mime:
        raise ValueError("参考图格式不支持，仅支持 JPEG、PNG、WebP、GIF")
    if not os.path.isfile(local_path):
        raise ValueError("参考图本地文件不存在")
    with open(local_path, "rb") as file:
        return filename, file.read(), mime


def _resolve_host_addresses(hostname: str) -> list[str]:
    try:
        return sorted({item[4][0] for item in socket.getaddrinfo(hostname, 443, proto=socket.IPPROTO_TCP)})
    except OSError:
        return []


def _format_upload_exception(exc: Exception, upload_host: str) -> str:
    addresses = _resolve_host_addresses(upload_host)
    hint = f" 当前 {upload_host} 解析到: {', '.join(addresses)}。" if addresses else ""
    return f"连接 APIMart 上传接口失败，参考图还没有传到 APIMart。{hint} 原因: {exc}"


def _extract_url(value) -> str:
    if isinstance(value, str) and value.startswith(("http://", "https://")):
        return value
    if isinstance(value, list):
        for item in value:
            found = _extract_url(item)
            if found:
                return found
    if isinstance(value, dict):
        for key in ("url", "image_url", "imageUrl", "file_url", "fileUrl", "data"):
            found = _extract_url(value.get(key))
            if found:
                return found
    return ""


def _parse_uploaded_image_response(response) -> Tuple[Optional[str], Optional[str]]:
    try:
        data = response.json()
    except ValueError:
        return None, "上传接口返回的不是 JSON"
    uploaded_url = _extract_url(data)
    if uploaded_url:
        return uploaded_url, None
    error = data.get("error") if isinstance(data, dict) else None
    if isinstance(error, dict):
        error = error.get("message") or str(error)
    return None, str(error or f"上传成功但没有返回图片 URL: {str(data)[:300]}")


def _post_upload_with_httpx(upload_url: str, headers: dict, filename: str, image_bytes: bytes, mime: str, http2: bool):
    with httpx.Client(http2=http2, timeout=30) as client:
        return client.post(upload_url, headers=headers, files={"file": (filename, image_bytes, mime)})


def _post_upload_with_requests(upload_url: str, headers: dict, filename: str, image_bytes: bytes, mime: str):
    return requests.post(upload_url, headers=headers, files={"file": (filename, image_bytes, mime)}, timeout=30)


def _post_upload(transport: str, upload_url: str, headers: dict, filename: str, image_bytes: bytes, mime: str):
    if transport == "httpx-http2":
        return _post_upload_with_httpx(upload_url, headers, filename, image_bytes, mime, http2=True)
    if transport == "httpx-http1":
        return _post_upload_with_httpx(upload_url, headers, filename, image_bytes, mime, http2=False)
    return _post_upload_with_requests(upload_url, headers, filename, image_bytes, mime)


def _upload_image_bytes(api_key: str, filename: str, image_bytes: bytes, mime: str, base_url: str = "") -> str:
    normalized_base = normalize_base_url(base_url)
    upload_url = f"{normalized_base}/uploads/images"
    upload_host = urlparse(upload_url).hostname or "上传服务"
    headers = {"Authorization": f"Bearer {(api_key or '').strip()}"}
    last_error = ""
    for _ in range(UPLOAD_ATTEMPTS_PER_FIELD):
        for transport in UPLOAD_TRANSPORTS:
            try:
                response = _post_upload(transport, upload_url, headers, filename, image_bytes, mime)
                if response.status_code >= 400:
                    body = (getattr(response, "text", "") or "")[:300]
                    raise ProviderError(f"HTTP {response.status_code}: {body}")
                uploaded_url, response_error = _parse_uploaded_image_response(response)
                if uploaded_url:
                    return uploaded_url
                last_error = response_error or "上传接口没有返回图片 URL"
            except ProviderError:
                raise
            except Exception as exc:
                last_error = _format_upload_exception(exc, upload_host)
    raise ProviderError(last_error or "参考图上传失败")


def upload_reference_image(api_key: str, image_ref: str, base_url: str = "") -> str:
    if image_ref.startswith("data:image/"):
        filename, image_bytes, mime = _prepare_upload_image(image_ref)
        return _upload_image_bytes(api_key, filename, image_bytes, mime, base_url)
    local_image = _prepare_local_upload_image(image_ref)
    if local_image:
        filename, image_bytes, mime = local_image
        return _upload_image_bytes(api_key, filename, image_bytes, mime, base_url)
    return image_ref


class APIMartAdapter(OpenAICompatibleAdapter):
    protocol = "apimart"
    supports_image_edit = False

    def supports_masked_image_edit(self, model: str) -> bool:
        spec = get_apimart_image_model_spec(model)
        return bool(spec and spec.supports_inpaint)

    def uses_generation_endpoint_for_masked_edit(self, model: str) -> bool:
        return apimart_mask_uses_generation_endpoint(model)

    def image_generation_endpoint(self, model: str) -> str:
        return apimart_image_generation_endpoint(model)

    def prepare_image_payload(self, payload: dict) -> dict:
        try:
            request_payload, _ = prepare_apimart_image_payload(payload)
            return request_payload
        except ValueError as exc:
            raise ProviderError(str(exc)) from exc

    def submit_image(
        self,
        *,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
    ):
        try:
            validate_apimart_image_request(
                str(payload.get("model") or ""),
                references=references,
                operation=str(payload.get("operation") or ""),
            )
        except ValueError as exc:
            raise ProviderError(str(exc)) from exc
        return super().submit_image(
            base_url=base_url,
            api_key=api_key,
            payload=payload,
            references=references,
        )

    def prepare_references(self, references: list[str], base_url: str, api_key: str) -> list[str]:
        unique = list(dict.fromkeys(reference.strip() for reference in references if reference and reference.strip()))
        return [upload_reference_image(api_key, reference, base_url) for reference in unique]
