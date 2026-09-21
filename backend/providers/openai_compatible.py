from __future__ import annotations

import base64
import mimetypes
import os
from urllib.parse import unquote, urlparse

import requests

from app_paths import UPLOAD_DIR
from assets import default_asset_store
from model_capabilities import get_image_model_support
from .base import ProviderAdapter, ProviderError, SubmissionResult, TaskResult, extract_error, parse_submission, parse_task_result


UPLOAD_ROOT = str(UPLOAD_DIR)
IMAGE_PIXEL_SIZES = {
    "1:1": {"1k": "1024x1024", "2k": "2048x2048", "4k": "2880x2880"},
    "3:2": {"1k": "1536x1024", "2k": "2048x1360", "4k": "3520x2336"},
    "2:3": {"1k": "1024x1536", "2k": "1360x2048", "4k": "2336x3520"},
    "4:3": {"1k": "1024x768", "2k": "2048x1536", "4k": "3312x2480"},
    "3:4": {"1k": "768x1024", "2k": "1536x2048", "4k": "2480x3312"},
    "5:4": {"1k": "1280x1024", "2k": "2560x2048", "4k": "3216x2576"},
    "4:5": {"1k": "1024x1280", "2k": "2048x2560", "4k": "2576x3216"},
    "16:9": {"1k": "1536x864", "2k": "2048x1152", "4k": "3840x2160"},
    "9:16": {"1k": "864x1536", "2k": "1152x2048", "4k": "2160x3840"},
    "2:1": {"1k": "2048x1024", "2k": "2688x1344", "4k": "3840x1920"},
    "1:2": {"1k": "1024x2048", "2k": "1344x2688", "4k": "1920x3840"},
    "3:1": {"1k": "1881x836", "2k": "3072x1024", "4k": "3840x1280"},
    "1:3": {"1k": "887x1774", "2k": "1024x3072", "4k": "1280x3840"},
    "21:9": {"1k": "2016x864", "2k": "2688x1152", "4k": "3840x1648"},
    "9:21": {"1k": "864x2016", "2k": "1152x2688", "4k": "1648x3840"},
}


def normalize_base_url(base_url: str) -> str:
    value = (base_url or "").strip().rstrip("/")
    if not value:
        raise ProviderError("Base URL 不能为空")
    for suffix in ("/images/generations", "/videos/generations", "/models"):
        if value.endswith(suffix):
            value = value[:-len(suffix)].rstrip("/")
            break
    if not value.endswith("/v1"):
        value = f"{value}/v1"
    return value


class OpenAICompatibleAdapter(ProviderAdapter):
    protocol = "openai"
    supports_image_edit = True

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
            raise ProviderError(f"HTTP {status}: {body or exc}") from exc

    def _post(self, base_url: str, api_key: str, endpoint: str, payload: dict) -> dict:
        url = f"{normalize_base_url(base_url)}{endpoint}"
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

    def _post_image_edit(
        self,
        base_url: str,
        api_key: str,
        payload: dict,
        references: list[str],
        mask_reference: str = "",
    ) -> dict:
        """Send reference images through the standard multipart image-edit API."""
        url = f"{normalize_base_url(base_url)}/images/edits"
        files = []
        field_name = "image" if len(references) == 1 else "image[]"
        for index, reference in enumerate(references):
            filename, content, mime = self._reference_as_file(reference, index)
            files.append((field_name, (filename, content, mime)))
        if mask_reference:
            filename, content, mime = self._reference_as_file(mask_reference, len(references))
            files.append(("mask", (filename, content, mime)))

        headers = self._headers(api_key)
        headers.pop("Content-Type", None)
        try:
            response = requests.post(
                url,
                headers=headers,
                data={
                    key: str(value)
                    for key, value in payload.items()
                    if value is not None
                },
                files=files,
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

    def _get(self, base_url: str, api_key: str, endpoint: str) -> dict:
        url = f"{normalize_base_url(base_url)}{endpoint}"
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

    @staticmethod
    def _local_reference_as_data_url(reference: str) -> str:
        parsed = urlparse(reference)
        path = unquote(parsed.path or "")
        if not path.startswith("/uploads/"):
            return reference
        if parsed.scheme and parsed.hostname not in {"localhost", "127.0.0.1", "::1"}:
            return reference
        filename = os.path.basename(path)
        local_path = os.path.abspath(os.path.join(UPLOAD_ROOT, filename))
        if not local_path.startswith(UPLOAD_ROOT + os.sep) or not os.path.isfile(local_path):
            raise ProviderError(f"本地参考图片不存在: {filename}")
        mime = mimetypes.guess_type(filename)[0] or "image/png"
        if not mime.startswith("image/"):
            raise ProviderError(f"参考文件不是图片: {filename}")
        with open(local_path, "rb") as image_file:
            encoded = base64.b64encode(image_file.read()).decode("ascii")
        return f"data:{mime};base64,{encoded}"

    @staticmethod
    def _reference_as_file(reference: str, index: int) -> tuple[str, bytes, str]:
        if reference.startswith("data:image/"):
            header, encoded = reference.split(",", 1)
            mime = header.split(";", 1)[0].replace("data:", "")
            try:
                content = base64.b64decode(encoded, validate=True)
            except (ValueError, base64.binascii.Error) as exc:
                raise ProviderError("参考图 base64 数据无效") from exc
            extension = mimetypes.guess_extension(mime) or ".png"
            return f"reference_{index + 1}{extension}", content, mime

        try:
            response = requests.get(reference, timeout=(15, 90))
            response.raise_for_status()
        except requests.exceptions.RequestException as exc:
            raise ProviderError(f"无法读取远程参考图片: {exc}") from exc

        mime = (response.headers.get("Content-Type", "") or "").split(";", 1)[0].strip()
        if not mime.startswith("image/"):
            mime = mimetypes.guess_type(urlparse(reference).path)[0] or "image/png"
        extension = mimetypes.guess_extension(mime) or ".png"
        return f"reference_{index + 1}{extension}", response.content, mime

    def prepare_references(self, references: list[str], base_url: str, api_key: str) -> list[str]:
        unique = list(dict.fromkeys(reference.strip() for reference in references if reference and reference.strip()))
        return [self._local_reference_as_data_url(reference) for reference in unique]

    def prepare_image_payload(self, payload: dict) -> dict:
        request_payload = dict(payload)
        request_payload.pop("operation", None)
        request_payload.pop("mask_url", None)
        request_payload.pop("original_image_url", None)
        model_support = get_image_model_support(str(request_payload.get("model") or ""))
        model_is_adapted = bool(model_support.get("adapted"))
        supports_pixel_size = bool((model_support.get("capabilities") or {}).get("supportsPixelSize"))
        size = str(request_payload.get("size") or "1:1").lower()
        resolution = str(request_payload.pop("resolution", "1k") or "1k").lower()
        if resolution not in {"1k", "2k", "4k"}:
            resolution = "1k"
        if model_is_adapted and not supports_pixel_size and "x" in size:
            ratio = next(
                (
                    ratio
                    for ratio, values in IMAGE_PIXEL_SIZES.items()
                    if resolution in values and values[resolution].lower() == size
                ),
                "",
            )
            if ratio:
                size = ratio
        elif (not model_is_adapted or supports_pixel_size) and "x" not in size:
            size = IMAGE_PIXEL_SIZES.get(size, {}).get(resolution) or IMAGE_PIXEL_SIZES["1:1"][resolution]
        request_payload["size"] = size
        return request_payload

    def supports_masked_image_edit(self, model: str) -> bool:
        return self.supports_image_edit

    def uses_generation_endpoint_for_masked_edit(self, model: str) -> bool:
        return False

    def image_generation_endpoint(self, model: str) -> str:
        return "/images/generations"

    def _payload_with_references(self, payload: dict, references: list[str], base_url: str, api_key: str) -> dict:
        request_payload = dict(payload)
        prepared = self.prepare_references(references, base_url, api_key)
        if prepared:
            request_payload["image_url"] = prepared[0]
            request_payload["image_urls"] = prepared
        role_images = []
        for item in request_payload.get("image_with_roles") or []:
            if not isinstance(item, dict):
                continue
            url = str(item.get("url") or "").strip()
            if not url:
                continue
            role_images.append({**item, "url": self._local_reference_as_data_url(url)})
        if role_images:
            request_payload["image_with_roles"] = role_images
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
        mask_url = str(payload.get("mask_url") or "").strip()
        if operation == "inpaint" and not self.supports_masked_image_edit(str(payload.get("model") or "")):
            raise ProviderError("当前图片模型不支持局部修改，请切换支持图片编辑的模型")
        prepared_payload = self.prepare_image_payload(payload)
        prepared_references = self.prepare_references(references, base_url, api_key)
        if operation == "inpaint":
            if not prepared_references:
                raise ProviderError("局部修改缺少原图")
            if not mask_url:
                raise ProviderError("局部修改缺少遮罩图")
            prepared_masks = self.prepare_references([mask_url], base_url, api_key)
            if not prepared_masks:
                raise ProviderError("局部修改遮罩图无效")
            if self.uses_generation_endpoint_for_masked_edit(str(payload.get("model") or "")):
                request_payload = dict(prepared_payload)
                request_payload["image_url"] = prepared_references[0]
                request_payload["image_urls"] = prepared_references
                request_payload["mask_url"] = prepared_masks[0]
                data = self._post(
                    base_url,
                    api_key,
                    self.image_generation_endpoint(str(payload.get("model") or "")),
                    request_payload,
                )
            else:
                data = self._post_image_edit(
                    base_url,
                    api_key,
                    prepared_payload,
                    [prepared_references[0]],
                    prepared_masks[0],
                )
        elif prepared_references and self.supports_image_edit:
            data = self._post_image_edit(
                base_url,
                api_key,
                prepared_payload,
                prepared_references,
            )
        else:
            request_payload = dict(prepared_payload)
            if prepared_references:
                request_payload["image_url"] = prepared_references[0]
                request_payload["image_urls"] = prepared_references
            data = self._post(
                base_url,
                api_key,
                self.image_generation_endpoint(str(payload.get("model") or "")),
                request_payload,
            )
        result = parse_submission(data, "image")
        if result.status != "completed" or not result.result:
            return result
        localized_images = []
        for image in result.result.get("images", []):
            sources = image.get("url", []) if isinstance(image, dict) else []
            if isinstance(sources, str):
                sources = [sources]
            normalized_sources = []
            for source in sources:
                if isinstance(source, str) and source.startswith("data:image/"):
                    normalized_sources.append(default_asset_store.localize_url(source)["url"])
                elif source:
                    normalized_sources.append(source)
            if normalized_sources:
                localized_images.append({"url": normalized_sources})
        if not localized_images:
            raise ProviderError("图片响应中没有可保存的媒体结果")
        return SubmissionResult(status="completed", result={"images": localized_images})

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
            "/videos/generations",
            self._payload_with_references(payload, references, base_url, api_key),
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
            raise ProviderError("上游任务 ID 不能为空")
        data = self._get(base_url, api_key, f"/tasks/{task_id.strip()}")
        return parse_task_result(data, media_type)

    def query_raw_task(self, *, task_id: str, base_url: str, api_key: str) -> dict:
        if not (task_id or "").strip():
            raise ProviderError("上游任务 ID 不能为空")
        payload = self._get(base_url, api_key, f"/tasks/{task_id.strip()}")
        error = extract_error(payload)
        if error:
            raise ProviderError(error)
        data = payload.get("data", payload) if isinstance(payload, dict) else payload
        if isinstance(data, list) and data:
            data = data[0]
        if not isinstance(data, dict) or not data.get("status"):
            raise ProviderError("上游未返回有效的任务状态")
        return data
