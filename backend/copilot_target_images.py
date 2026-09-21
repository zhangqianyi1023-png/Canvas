"""Resolve selected Canvas image nodes into safe Harness image blocks."""

from __future__ import annotations

import base64
import ipaddress
import mimetypes
from pathlib import Path
from typing import Union
from urllib.parse import unquote, urlparse


COPILOT_TARGET_IMAGE_MAX_BYTES = 8 * 1024 * 1024
COPILOT_TARGET_IMAGE_TOTAL_MAX_BYTES = 16 * 1024 * 1024
SUPPORTED_TARGET_IMAGE_MIMES = {
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
}


class CopilotTargetImageError(ValueError):
    """A selected Canvas image cannot be safely attached to Copilot."""


def _is_loopback_host(hostname: str) -> bool:
    value = (hostname or "").strip().lower()
    if value == "localhost":
        return True
    try:
        return ipaddress.ip_address(value).is_loopback
    except ValueError:
        return False


def resolve_copilot_target_image(
    image_url: str,
    upload_dir: Union[str, Path],
    *,
    max_bytes: int = COPILOT_TARGET_IMAGE_MAX_BYTES,
) -> dict:
    value = str(image_url or "").strip()
    if not value:
        raise CopilotTargetImageError("画布图片没有可读取的本地地址")

    parsed = urlparse(value)
    if parsed.scheme:
        if parsed.scheme not in {"http", "https"} or not _is_loopback_host(parsed.hostname or ""):
            raise CopilotTargetImageError("Copilot 仅能读取本项目已保存的本地图片")
        path = unquote(parsed.path or "")
    else:
        path = unquote(parsed.path or value)

    prefix = "/uploads/"
    if not path.startswith(prefix):
        raise CopilotTargetImageError("Copilot 仅能读取 /uploads 中的画布图片")
    filename = path[len(prefix):]
    if not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
        raise CopilotTargetImageError("画布图片地址无效")

    upload_root = Path(upload_dir).expanduser().resolve()
    image_path = (upload_root / filename).resolve()
    if image_path.parent != upload_root or not image_path.is_file():
        raise CopilotTargetImageError("画布图片文件不存在")

    size = image_path.stat().st_size
    if size <= 0:
        raise CopilotTargetImageError("画布图片文件为空")
    if size > max_bytes:
        raise CopilotTargetImageError("画布图片超过 8MB，暂时无法交给 Copilot 分析")

    mime_type = (mimetypes.guess_type(filename)[0] or "").lower()
    if mime_type not in SUPPORTED_TARGET_IMAGE_MIMES:
        raise CopilotTargetImageError("画布图片格式暂不支持视觉分析")

    image_bytes = image_path.read_bytes()
    return {
        "image_data": base64.b64encode(image_bytes).decode("ascii"),
        "image_mime_type": mime_type,
        "image_byte_size": len(image_bytes),
    }


def attach_copilot_target_images(
    targets: list[dict],
    upload_dir: Union[str, Path],
) -> list[dict]:
    attached = []
    total_bytes = 0
    for target in targets:
        item = dict(target)
        if item.get("kind") == "image":
            try:
                image = resolve_copilot_target_image(item.get("thumbnail_url", ""), upload_dir)
            except CopilotTargetImageError as exc:
                item["image_attached"] = False
                item["image_error"] = str(exc)
            else:
                total_bytes += image["image_byte_size"]
                if total_bytes > COPILOT_TARGET_IMAGE_TOTAL_MAX_BYTES:
                    raise CopilotTargetImageError("引用的画布图片总大小超过 16MB，请减少选择后重试")
                item.update(image)
                item["image_attached"] = True
        attached.append(item)
    return attached

