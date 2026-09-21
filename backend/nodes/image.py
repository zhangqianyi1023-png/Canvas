"""Provider-neutral image generation node."""

from __future__ import annotations

import time
from typing import List, Optional, Tuple

from assets import default_asset_store
from providers import ProviderError, get_provider_adapter
from providers.apimart import _upload_image_bytes, is_local_upload_reference, upload_reference_image
from task_media import extract_task_source_urls, persist_task_source_urls


def summarize_payload(payload: dict) -> dict:
    summary = dict(payload)
    for key in ("image_url", "image_urls"):
        if key not in summary:
            continue
        value = summary[key]
        if isinstance(value, list):
            summary[key] = [
                f"{item[:40]}..." if isinstance(item, str) and len(item) > 60 else item
                for item in value
            ]
        elif isinstance(value, str) and len(value) > 60:
            summary[key] = f"{value[:40]}..."
    return summary


def _localize_generated_image_urls(urls: List[str]) -> Tuple[List[str], List[dict], List[str]]:
    persisted = persist_task_source_urls("image", urls, default_asset_store)
    warnings = [
        f"图片已生成，但保存到本地失败: {record['error']}"
        for record in persisted["media_records"]
        if record.get("error")
    ]
    return persisted["server_urls"], persisted["assets"], warnings


def _completed_image_response(result: dict, task_id: str = "") -> dict:
    source_urls = extract_task_source_urls("image", result)
    if not source_urls:
        return {"success": False, "error": "任务完成但未获取到图片结果", "task_id": task_id}
    local_urls, localized_assets, save_warnings = _localize_generated_image_urls(source_urls)
    if save_warnings or len(local_urls) != len(source_urls):
        return {
            "success": False,
            "error": save_warnings[0] if save_warnings else "图片已生成，但保存到本地失败",
            "image_url": "",
            "image_urls": [],
            "image_assets": localized_assets,
            "source_image_urls": source_urls,
            "save_warnings": save_warnings,
            "persistence_status": "save_failed",
            "task_id": task_id,
        }
    return {
        "success": True,
        "image_url": local_urls[0],
        "image_urls": local_urls,
        "image_assets": localized_assets,
        "source_image_urls": source_urls,
        "save_warnings": [],
        "persistence_status": "saved",
        "task_id": task_id,
    }


class ImageNode:
    def execute(
        self,
        api_base_url: str = "",
        api_key: str = "",
        prompt: str = "",
        model: str = "gpt-image-2",
        size: str = "16:9",
        resolution: str = "1k",
        quality: str = "auto",
        background: str = "auto",
        output_format: str = "png",
        operation: str = "",
        image_url: str = "",
        mask_url: str = "",
        image_urls: Optional[List[str]] = None,
        n: int = 1,
        poll_interval: int = 5,
        timeout: int = 300,
        api_protocol: str = "openai",
    ) -> dict:
        submission = self.submit(
            api_base_url=api_base_url,
            api_key=api_key,
            prompt=prompt,
            model=model,
            size=size,
            resolution=resolution,
            quality=quality,
            background=background,
            output_format=output_format,
            operation=operation,
            image_url=image_url,
            mask_url=mask_url,
            image_urls=image_urls,
            n=n,
            api_protocol=api_protocol,
        )
        if not submission.get("success"):
            return submission
        if submission.get("status") == "completed":
            return _completed_image_response(submission.get("result") or {})
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
        model: str = "gpt-image-2",
        size: str = "16:9",
        resolution: str = "1k",
        quality: str = "auto",
        background: str = "auto",
        output_format: str = "png",
        operation: str = "",
        image_url: str = "",
        mask_url: str = "",
        image_urls: Optional[List[str]] = None,
        n: int = 1,
        api_protocol: str = "openai",
    ) -> dict:
        safe_n = max(1, min(int(n) if n else 1, 4))
        payload = {
            "model": model,
            "prompt": prompt,
            "n": safe_n,
            "size": size,
            "resolution": resolution,
            "quality": quality,
            "background": background,
            "output_format": output_format,
            "operation": operation,
            "mask_url": mask_url,
        }
        references = [url.strip() for url in (image_urls or []) if url and url.strip()]
        if image_url and image_url.strip():
            references.insert(0, image_url.strip())

        try:
            adapter = get_provider_adapter(api_protocol)
            result = adapter.submit_image(
                base_url=api_base_url,
                api_key=api_key,
                payload=payload,
                references=list(dict.fromkeys(references)),
            )
        except (ProviderError, ValueError) as exc:
            return {"success": False, "error": str(exc)}

        if result.status == "completed":
            return {
                "success": True,
                "async": False,
                "status": "completed",
                "result": result.result,
            }
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
                media_type="image",
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
                return _completed_image_response(data.get("result") or {}, task_id)
            if data.get("status") == "failed":
                return {
                    "success": False,
                    "error": f"任务失败: {data.get('error') or '未知错误'}",
                    "task_id": task_id,
                }
        return {
            "success": False,
            "pending": True,
            "status": "running",
            "error": "任务仍在生成中",
            "task_id": task_id,
        }


NODE_META = {
    "type": "Image2",
    "display_name": "Image2 生图",
    "category": "AI/Image",
    "inputs": {
        "api_key": {"type": "string", "default": "", "label": "API Key"},
        "prompt": {"type": "string", "default": "", "label": "Prompt", "multiline": True},
        "model": {"type": "string", "default": "gpt-image-2", "label": "模型"},
        "size": {"type": "select", "options": ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "2:1", "1:2"], "default": "16:9", "label": "比例"},
        "resolution": {"type": "select", "options": ["1k", "2k", "4k"], "default": "1k", "label": "分辨率"},
        "n": {"type": "select", "options": [1, 2, 3, 4], "default": 1, "label": "生成张数"},
        "image_url": {"type": "string", "default": "", "label": "参考图 URL"},
    },
    "outputs": {
        "image_url": {"type": "string", "label": "封面图 URL"},
        "image_urls": {"type": "list", "label": "全部图片 URL"},
        "task_id": {"type": "string", "label": "任务 ID"},
    },
}
