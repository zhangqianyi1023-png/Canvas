"""Provider-neutral video generation node."""

from __future__ import annotations

import os
import time
from typing import List, Optional
from urllib.parse import urlparse

import requests

from assets import default_asset_store
from providers import ProviderError, get_provider_adapter
from video_model_capabilities import get_video_model_spec, normalize_video_request


def is_known_image_only_model(model: str) -> bool:
    normalized_model = (model or "").strip().lower().replace("_", "-")
    return normalized_model in {
        "doubao-seedance-4-0",
        "doubao-seedance-4.0",
        "doubao-seedance-4-5",
        "doubao-seedance-4.5",
    }


def is_seedance_2_model(model: str) -> bool:
    spec = get_video_model_spec(model)
    return bool(spec and spec.key.startswith("seedance-2."))


def max_reference_images_for_model(model: str) -> Optional[int]:
    return 1 if "sora" in (model or "").strip().lower() else None


def _unique_urls(values: Optional[List[str]]) -> List[str]:
    return list(dict.fromkeys(url.strip() for url in (values or []) if url and url.strip()))


def _normalize_role_images(values: Optional[List[dict]]) -> List[dict]:
    result = []
    seen = set()
    for item in values or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("url") or item.get("image_url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        result.append({
            **item,
            "url": url,
            "role": str(item.get("role") or item.get("assetRole") or "reference_image").strip(),
        })
    return result


def _has_role_image(role_images: List[dict], role: str) -> bool:
    return any(str(item.get("role") or "").strip().lower() == role for item in role_images)


def normalize_video_resolution(model: str, resolution: str, aspect_ratio: str) -> str:
    normalized_model = (model or "").strip().lower()
    normalized_resolution = (resolution or "").strip().lower()
    if "x" in normalized_resolution or normalized_resolution in {"1k", "2k", "4k"}:
        return resolution
    if "seedance" in normalized_model:
        seedance_dimensions = {
            "1:1": (1920, 1920),
            "3:4": (1920, 2560),
            "4:3": (2560, 1920),
            "9:16": (1440, 2560),
            "16:9": (2560, 1440),
        }
        width, height = seedance_dimensions.get(aspect_ratio, seedance_dimensions["16:9"])
        return f"{width}x{height}"
    base_height = {"720p": 720, "1080p": 1080}.get(normalized_resolution)
    if not base_height:
        return resolution
    dimensions = {
        "1:1": (base_height, base_height),
        "3:4": (base_height, round(base_height * 4 / 3)),
        "4:3": (round(base_height * 4 / 3), base_height),
        "9:16": (base_height, round(base_height * 16 / 9)),
        "16:9": (round(base_height * 16 / 9), base_height),
    }
    width, height = dimensions.get(aspect_ratio, dimensions["16:9"])
    return f"{width}x{height}"


def collect_media_urls(value) -> List[str]:
    if isinstance(value, str):
        return [value] if value.startswith(("http://", "https://", "/uploads/")) else []
    if isinstance(value, list):
        urls = []
        for item in value:
            urls.extend(collect_media_urls(item))
        return urls
    if isinstance(value, dict):
        urls = []
        for key in ("video_url", "videoUrl", "url", "videos", "video", "output", "outputs", "files"):
            urls.extend(collect_media_urls(value.get(key)))
        return urls
    return []


def extract_video_url(value) -> str:
    urls = list(dict.fromkeys(collect_media_urls(value)))
    for url in urls:
        if os.path.splitext(urlparse(url).path)[1].lower() in {".mp4", ".webm", ".mov"}:
            return url
    for url in urls:
        try:
            response = requests.head(
                url,
                timeout=20,
                allow_redirects=True,
                headers={"User-Agent": "AI-Canvas/0.1"},
            )
            content_type = (response.headers.get("Content-Type") or "").split(";", 1)[0].lower()
            if response.ok and content_type.startswith("video/"):
                return url
        except requests.RequestException:
            continue
    return ""


def cache_generated_video(video_url: str) -> str:
    return default_asset_store.localize_url(video_url)["url"]


def _completed_video_response(result: dict, task_id: str = "") -> dict:
    video_url = extract_video_url(result)
    if not video_url:
        return {"success": False, "error": "未找到视频 URL", "task_id": task_id}
    try:
        playable_video_url = cache_generated_video(video_url)
        video_asset = default_asset_store.register_local_url(playable_video_url)
    except Exception as exc:
        return {
            "success": False,
            "error": f"视频已生成，但保存到本地失败: {exc}",
            "video_url": "",
            "source_video_url": video_url,
            "source_video_urls": [video_url],
            "persistence_status": "save_failed",
            "task_id": task_id,
        }
    return {
        "success": True,
        "video_url": playable_video_url,
        "source_video_url": video_url,
        "source_video_urls": [video_url],
        "video_asset": video_asset,
        "persistence_status": "saved",
        "task_id": task_id,
    }


class VideoNode:
    def execute(
        self,
        api_base_url: str = "",
        api_key: str = "",
        prompt: str = "",
        model: str = "sora-2",
        duration: int = 8,
        aspect_ratio: str = "16:9",
        resolution: str = "720p",
        image_url: str = "",
        image_urls: Optional[List[str]] = None,
        image_with_roles: Optional[List[dict]] = None,
        video_urls: Optional[List[str]] = None,
        reference_video_urls: Optional[List[str]] = None,
        audio_urls: Optional[List[str]] = None,
        generation_mode: str = "",
        generate_audio: Optional[bool] = None,
        poll_interval: int = 5,
        timeout: int = 300,
        api_protocol: str = "openai",
    ) -> dict:
        submission = self.submit(
            api_base_url=api_base_url,
            api_key=api_key,
            prompt=prompt,
            model=model,
            duration=duration,
            aspect_ratio=aspect_ratio,
            resolution=resolution,
            image_url=image_url,
            image_urls=image_urls,
            image_with_roles=image_with_roles,
            video_urls=video_urls,
            reference_video_urls=reference_video_urls,
            audio_urls=audio_urls,
            generation_mode=generation_mode,
            generate_audio=generate_audio,
            api_protocol=api_protocol,
        )
        if not submission.get("success"):
            return submission
        if submission.get("status") == "completed":
            return _completed_video_response(submission.get("result") or {})
        return self._poll_task(
            submission["task_id"],
            api_base_url,
            api_key,
            api_protocol,
            poll_interval,
            timeout,
        )

    def submit(
        self,
        api_base_url: str = "",
        api_key: str = "",
        prompt: str = "",
        model: str = "sora-2",
        duration: int = 8,
        aspect_ratio: str = "16:9",
        resolution: str = "720p",
        image_url: str = "",
        image_urls: Optional[List[str]] = None,
        image_with_roles: Optional[List[dict]] = None,
        video_urls: Optional[List[str]] = None,
        reference_video_urls: Optional[List[str]] = None,
        audio_urls: Optional[List[str]] = None,
        generation_mode: str = "",
        generate_audio: Optional[bool] = None,
        api_protocol: str = "openai",
    ) -> dict:
        if is_known_image_only_model(model):
            return {"success": False, "error": f"{model} 是图片模型，不能用于视频生成。请选择视频模型。"}
        references = _unique_urls(image_urls)
        if image_url and image_url.strip():
            references.insert(0, image_url.strip())
        references = list(dict.fromkeys(references))
        role_images = _normalize_role_images(image_with_roles)
        plain_role_image_urls = [item["url"] for item in role_images]
        video_references = _unique_urls([*(video_urls or []), *(reference_video_urls or [])])
        audio_references = _unique_urls(audio_urls)
        normalized_mode = str(generation_mode or "").strip()

        spec = get_video_model_spec(model)
        if normalized_mode and spec and normalized_mode not in spec.generation_modes:
            return {"success": False, "error": f"{spec.label} 不支持当前生成方式：{normalized_mode}"}
        if normalized_mode == "first_last_frame":
            if not (_has_role_image(role_images, "first_frame") and _has_role_image(role_images, "last_frame")):
                return {"success": False, "error": "首尾帧模式需要同时提供首帧和尾帧图片。"}
            references = []
            video_references = []
            audio_references = []
        all_image_references = list(dict.fromkeys([*references, *plain_role_image_urls]))

        try:
            normalized = normalize_video_request(
                model=model,
                duration=duration,
                aspect_ratio=aspect_ratio,
                resolution=resolution,
                image_count=len(all_image_references),
                video_count=len(video_references),
                audio_count=len(audio_references),
            )
        except ValueError as exc:
            return {"success": False, "error": str(exc)}

        payload = {"model": model, "prompt": prompt, "duration": normalized["duration"]}
        if normalized_mode:
            payload["generation_mode"] = normalized_mode
        if role_images:
            payload["image_with_roles"] = role_images
        if video_references:
            payload["video_urls"] = video_references
            payload["reference_video_urls"] = video_references
        if audio_references:
            payload["audio_urls"] = audio_references
        if generate_audio is not None:
            payload["generate_audio"] = bool(generate_audio)
        if normalized["spec"]:
            payload["size"] = normalized["aspect_ratio"]
            payload["resolution"] = normalized["resolution"]
        else:
            payload["resolution"] = normalize_video_resolution(model, resolution, aspect_ratio)

        max_references = max_reference_images_for_model(model)
        if max_references is not None:
            references = references[:max_references]

        try:
            result = get_provider_adapter(api_protocol).submit_video(
                base_url=api_base_url,
                api_key=api_key,
                payload=payload,
                references=references,
            )
        except (ProviderError, ValueError) as exc:
            return {"success": False, "error": str(exc)}
        if result.status == "completed":
            return {"success": True, "async": False, "status": "completed", "result": result.result}
        return {
            "success": True,
            "async": True,
            "status": "running",
            "task_id": result.upstream_task_id,
        }

    def query_task(
        self,
        task_id: str,
        api_base_url: str = "",
        api_key: str = "",
        api_protocol: str = "openai",
    ) -> dict:
        try:
            result = get_provider_adapter(api_protocol).query_task(
                task_id=task_id,
                base_url=api_base_url,
                api_key=api_key,
                media_type="video",
            )
        except (ProviderError, ValueError) as exc:
            return {"success": False, "error": str(exc)}
        data = {"status": result.status}
        if result.result is not None:
            data["result"] = result.result
        if result.error:
            data["error"] = result.error
        return {"success": True, "data": data}

    def _poll_task(
        self,
        task_id: str,
        base_url: str,
        api_key: str,
        api_protocol: str,
        poll_interval: int = 5,
        timeout: int = 300,
    ) -> dict:
        start_time = time.time()
        while time.time() - start_time < timeout:
            time.sleep(poll_interval)
            result = self.query_task(
                task_id=task_id,
                api_base_url=base_url,
                api_key=api_key,
                api_protocol=api_protocol,
            )
            if not result.get("success"):
                continue
            data = result.get("data") or {}
            if data.get("status") == "completed":
                return _completed_video_response(data.get("result") or {}, task_id)
            if data.get("status") == "failed":
                return {"success": False, "error": f"任务失败: {data.get('error') or '未知错误'}", "task_id": task_id}
        return {"success": False, "error": f"超时（{timeout}s）", "task_id": task_id}


NODE_META = {
    "type": "Sora2Video",
    "display_name": "Sora2 视频",
    "category": "AI/Video",
    "inputs": {
        "api_key": {"type": "string", "default": "", "label": "API Key"},
        "prompt": {"type": "string", "default": "", "label": "Prompt", "multiline": True},
        "model": {"type": "select", "options": ["sora-2", "sora-2-pro"], "default": "sora-2", "label": "模型"},
        "duration": {"type": "select", "options": [4, 8, 12, 16, 20], "default": 8, "label": "时长(秒)"},
        "resolution": {"type": "select", "options": ["720p", "1024p", "1080p"], "default": "720p", "label": "分辨率"},
        "image_url": {"type": "string", "default": "", "label": "参考图 URL"},
    },
    "outputs": {
        "video_url": {"type": "string", "label": "视频 URL"},
        "task_id": {"type": "string", "label": "任务 ID"},
    },
}
