from __future__ import annotations

import requests

from .base import ProviderError, SubmissionResult, TaskResult, normalize_media_result, normalize_status, parse_submission
from .openai_compatible import OpenAICompatibleAdapter, normalize_base_url


RIGHTCODE_IMAGE_RATIOS = ["1:1", "16:9", "9:16", "4:3"]
RIGHTCODE_IMAGE_RESOLUTIONS = ["1k", "2k", "4k"]


def normalize_rightcode_base_url(base_url: str) -> str:
    value = normalize_base_url(base_url)
    if value.endswith("/draw/v1"):
        return value[:-len("/draw/v1")].rstrip()
    return value[:-len("/v1")].rstrip() if value.endswith("/v1") else value.rstrip()


def get_rightcode_image_model_support(model: str) -> dict:
    return {
        "adapted": True,
        "status": "adapted",
        "family": "rightcode-image",
        "capabilityLabels": ["文生图", "参考图", "异步任务"],
        "capabilities": {
            "textToImage": True,
            "imageToImage": True,
            "supportsPixelSize": True,
            "ratios": RIGHTCODE_IMAGE_RATIOS,
            "resolutions": RIGHTCODE_IMAGE_RESOLUTIONS,
            "defaultRatio": "1:1",
            "defaultResolution": "1k",
        },
    }


def build_rightcode_image_model_capability_map(models, existing=None) -> dict[str, dict]:
    existing_map = {
        str(model): dict(detail)
        for model, detail in (existing or {}).items()
        if model and isinstance(detail, dict)
    }
    capability_map: dict[str, dict] = {}
    for model in dict.fromkeys(str(item).strip() for item in models if str(item).strip()):
        capability_map[model] = {**get_rightcode_image_model_support(model), **existing_map.pop(model, {})}
    for model, override in existing_map.items():
        capability_map[model] = {**get_rightcode_image_model_support(model), **override}
    return capability_map


class RightCodeAdapter(OpenAICompatibleAdapter):
    protocol = "rightcode"
    supports_image_edit = False

    def _post_rightcode(self, base_url: str, api_key: str, endpoint: str, payload: dict) -> dict:
        url = f"{normalize_rightcode_base_url(base_url)}{endpoint}"
        try:
            response = requests.post(
                url,
                headers=self._headers(api_key),
                json=payload,
                timeout=(15, 90),
            )
            self._raise_http_error(response)
            return response.json()
        except ProviderError:
            raise
        except requests.exceptions.RequestException as exc:
            raise ProviderError(f"无法连接上游服务: {exc}") from exc
        except ValueError as exc:
            raise ProviderError("上游返回的不是 JSON 数据") from exc

    def _get_rightcode(self, base_url: str, api_key: str, endpoint: str) -> dict:
        url = f"{normalize_rightcode_base_url(base_url)}{endpoint}"
        try:
            response = requests.get(url, headers=self._headers(api_key), timeout=15)
            self._raise_http_error(response)
            return response.json()
        except ProviderError:
            raise
        except requests.exceptions.RequestException as exc:
            raise ProviderError(f"无法查询上游任务: {exc}") from exc
        except ValueError as exc:
            raise ProviderError("上游返回的不是 JSON 数据") from exc

    def prepare_image_payload(self, payload: dict) -> dict:
        request_payload = dict(payload)
        request_payload.pop("operation", None)
        request_payload.pop("mask_url", None)
        request_payload.pop("original_image_url", None)
        request_payload.pop("background", None)
        request_payload.pop("quality", None)
        request_payload.pop("output_format", None)

        resolution = str(request_payload.pop("resolution", "") or "").strip().lower()
        if resolution in {"1k", "2k", "4k"}:
            request_payload["imageSize"] = resolution.upper()
        request_payload["async"] = True
        return request_payload

    def submit_image(
        self,
        *,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
    ) -> SubmissionResult:
        operation = str(payload.get("operation") or "").strip().lower()
        if operation == "inpaint":
            raise ProviderError("Right Code 图片接口暂不支持局部修改，请切换支持图片编辑的模型")

        request_payload = self.prepare_image_payload(payload)
        prepared_references = self.prepare_references(references, base_url, api_key)
        if prepared_references:
            request_payload["image"] = prepared_references

        data = self._post_rightcode(
            base_url,
            api_key,
            "/draw/v1/images/generations",
            request_payload,
        )
        return parse_submission(data, "image")

    def query_task(
        self,
        *,
        task_id: str,
        base_url: str,
        api_key: str,
        media_type: str,
    ) -> TaskResult:
        if not (task_id or "").strip():
            raise ProviderError("上游任务 ID 不能为空")
        data = self._get_rightcode(
            base_url,
            api_key,
            f"/v1/tasks/{task_id.strip()}",
        )

        result = normalize_media_result(data, media_type)
        if result:
            return TaskResult(status="completed", result=result)

        status = normalize_status(data.get("status") if isinstance(data, dict) else "")
        if status == "failed":
            error = data.get("error") if isinstance(data, dict) else None
            if isinstance(error, dict):
                error = error.get("message") or str(error)
            return TaskResult(status="failed", error=str(error or "生成失败"))
        if status == "running":
            return TaskResult(status="running")
        raise ProviderError(f"上游返回未知任务状态：{data.get('status') or '空'}")
