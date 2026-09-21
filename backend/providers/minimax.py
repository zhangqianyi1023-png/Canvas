from __future__ import annotations

import requests

from video_model_capabilities import get_video_model_spec
from .base import ProviderAdapter, ProviderError, SubmissionResult, TaskResult, parse_submission, parse_task_result
from .openai_compatible import OpenAICompatibleAdapter


def normalize_minimax_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        return "https://api.minimax.io"
    for suffix in ("/v2/video_generation", "/v2/query/video_generation", "/v2", "/v1/models", "/v1"):
        if value.endswith(suffix):
            value = value[: -len(suffix)].rstrip("/")
            break
    return value or "https://api.minimax.io"


class MiniMaxAdapter(ProviderAdapter):
    protocol = "minimax"

    @staticmethod
    def _headers(api_key: str) -> dict:
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if (api_key or "").strip():
            headers["Authorization"] = f"Bearer {api_key.strip()}"
        return headers

    @staticmethod
    def _raise_http_error(response) -> None:
        try:
            response.raise_for_status()
        except requests.exceptions.HTTPError as exc:
            body = (getattr(response, "text", "") or "").strip()[:500]
            status = getattr(response, "status_code", "")
            raise ProviderError(f"MiniMax HTTP {status}: {body or exc}") from exc

    def _post(self, base_url: str, api_key: str, endpoint: str, payload: dict) -> dict:
        url = f"{normalize_minimax_base_url(base_url)}{endpoint}"
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
            raise ProviderError(f"无法连接 MiniMax 服务: {exc}") from exc
        except ValueError as exc:
            raise ProviderError("MiniMax 返回的不是 JSON 数据") from exc

    def _get(self, base_url: str, api_key: str, endpoint: str, params: dict) -> dict:
        url = f"{normalize_minimax_base_url(base_url)}{endpoint}"
        try:
            response = requests.get(
                url,
                headers=self._headers(api_key),
                params=params,
                timeout=20,
            )
            self._raise_http_error(response)
            return response.json()
        except ProviderError:
            raise
        except requests.exceptions.RequestException as exc:
            raise ProviderError(f"无法查询 MiniMax 任务: {exc}") from exc
        except ValueError as exc:
            raise ProviderError("MiniMax 返回的不是 JSON 数据") from exc

    def _prepare_media_url(self, url: str) -> str:
        return OpenAICompatibleAdapter._local_reference_as_data_url(url)

    def _build_content(self, payload: dict, references: list[str]) -> list[dict]:
        prompt = str(payload.get("prompt") or "").strip()
        if not prompt:
            raise ProviderError("MiniMax-H3 视频生成需要填写提示词")
        content = [{"type": "text", "text": prompt}]
        generation_mode = str(payload.get("generation_mode") or "").strip()

        if generation_mode == "first_last_frame":
            for item in payload.get("image_with_roles") or []:
                if not isinstance(item, dict):
                    continue
                role = str(item.get("role") or item.get("assetRole") or "").strip()
                url = str(item.get("url") or "").strip()
                if role not in {"first_frame", "last_frame"} or not url:
                    continue
                content.append({
                    "type": "image_url",
                    "image_url": {"url": self._prepare_media_url(url)},
                    "role": role,
                })
            return content

        for url in references:
            content.append({
                "type": "image_url",
                "image_url": {"url": self._prepare_media_url(url)},
                "role": "reference_image",
            })
        for url in payload.get("video_urls") or payload.get("reference_video_urls") or []:
            if url:
                content.append({
                    "type": "video_url",
                    "video_url": {"url": str(url).strip()},
                    "role": "reference_video",
                })
        for url in payload.get("audio_urls") or []:
            if url:
                content.append({
                    "type": "audio_url",
                    "audio_url": {"url": str(url).strip()},
                    "role": "reference_audio",
                })
        return content

    def _build_video_payload(self, payload: dict, references: list[str]) -> dict:
        model = str(payload.get("model") or "").strip()
        spec = get_video_model_spec(model)
        if not spec or spec.key != "minimax-h3":
            raise ProviderError(f"{model or '当前模型'} 不是已适配的 MiniMax-H3 视频模型")
        request_payload = {
            "model": model or "MiniMax-H3",
            "content": self._build_content(payload, references),
            "duration": payload.get("duration"),
            "resolution": payload.get("resolution"),
        }
        ratio = str(payload.get("size") or payload.get("ratio") or "").strip()
        if ratio:
            request_payload["ratio"] = ratio
        return {key: value for key, value in request_payload.items() if value not in (None, "")}

    def submit_image(self, *, base_url: str, api_key: str, payload: dict, references: list[str]) -> SubmissionResult:
        raise ProviderError("MiniMax 官方适配当前只支持视频生成")

    def submit_video(
        self,
        *,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
    ) -> SubmissionResult:
        data = self._post(
            base_url,
            api_key,
            "/v2/video_generation",
            self._build_video_payload(payload, references),
        )
        return parse_submission(data, "video")

    def query_task(
        self,
        *,
        task_id: str,
        base_url: str,
        api_key: str,
        media_type: str,
    ) -> TaskResult:
        if not (task_id or "").strip():
            raise ProviderError("MiniMax 任务 ID 不能为空")
        data = self._get(
            base_url,
            api_key,
            "/v2/query/video_generation",
            {"task_id": task_id.strip()},
        )
        return parse_task_result(data, media_type)
