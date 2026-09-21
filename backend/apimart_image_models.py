"""APIMart image model compatibility rules used by settings and requests."""

from __future__ import annotations

from dataclasses import dataclass, field
import re
from typing import Mapping, Optional


RATIOS_GEMINI = (
    "auto", "1:1", "2:3", "3:2", "3:4", "4:3", "4:5", "5:4",
    "9:16", "16:9", "21:9",
)
RATIOS_GEMINI_EXTENDED = RATIOS_GEMINI + ("1:4", "4:1", "1:8", "8:1")
RATIOS_GPT_IMAGE_2 = (
    "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
    "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21",
)
RATIOS_SEEDREAM = (
    "auto", "1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3",
    "2:1", "1:2", "21:9", "9:21",
)
RATIOS_STANDARD = ("1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3")
RATIOS_FLUX = ("auto",) + RATIOS_STANDARD + ("21:9", "9:21")
RATIOS_GROK_OFFICIAL = (
    "auto", "1:1", "3:4", "4:3", "9:16", "16:9", "2:3", "3:2",
    "9:19.5", "19.5:9", "9:20", "20:9", "1:2", "2:1",
)


@dataclass(frozen=True)
class APIMartImageModelSpec:
    key: str
    label: str
    aliases: tuple[str, ...]
    ratios: tuple[str, ...]
    resolutions: tuple[str, ...] = ()
    default_ratio: str = "1:1"
    default_resolution: str = ""
    supports_image_to_image: bool = False
    supports_inpaint: bool = False
    max_reference_images: int = 0
    max_api_output_count: int = 1
    quality_options: tuple[str, ...] = ()
    background_options: tuple[str, ...] = ()
    output_formats: tuple[str, ...] = ()
    size_field: str = "size"
    generation_endpoint: str = "/images/generations"
    supports_pixel_size: bool = False
    mask_via_generation: bool = False
    resolution_aliases: Mapping[str, str] = field(default_factory=dict)
    request_model: str = ""
    alias_payload_overrides: Mapping[str, Mapping[str, str]] = field(default_factory=dict)


SPECS = (
    APIMartImageModelSpec(
        key="gemini-3.1-flash-image",
        label="Nano Banana 2",
        aliases=(
            "gemini-3.1-flash-image-preview",
            "gemini-3.1-flash-image-preview-official",
            "nano-banana-2-ext",
            "nano-banana-2",
        ),
        ratios=RATIOS_GEMINI_EXTENDED,
        resolutions=("0.5K", "1K", "2K", "4K"),
        default_ratio="auto",
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=14,
    ),
    APIMartImageModelSpec(
        key="gemini-3.1-flash-lite-image",
        label="Nano Banana Lite",
        aliases=(
            "gemini-3.1-flash-lite-image",
            "gemini-3.1-flash-lite-image-ext",
            "nano-banana-2-lite",
            "nano-banana-2-lite-ext",
        ),
        ratios=RATIOS_GEMINI,
        resolutions=("1K",),
        default_ratio="auto",
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=14,
        max_api_output_count=4,
    ),
    APIMartImageModelSpec(
        key="gemini-3-pro-image",
        label="Nano Banana Pro",
        aliases=(
            "gemini-3-pro-image-preview",
            "gemini-3-pro-image-preview-official",
            "nano-banana-pro-ext",
            "nano-banana-pro",
        ),
        ratios=RATIOS_GEMINI,
        resolutions=("1K", "2K", "4K"),
        default_ratio="auto",
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=14,
    ),
    APIMartImageModelSpec(
        key="gemini-2.5-flash-image",
        label="Nano Banana",
        aliases=(
            "gemini-2.5-flash-image-preview",
            "gemini-2.5-flash-image-preview-official",
            "nano-banana-ext",
            "nano-banana",
        ),
        ratios=RATIOS_GEMINI,
        resolutions=("1K",),
        default_ratio="auto",
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=14,
    ),
    APIMartImageModelSpec(
        key="imagen-4",
        label="Imagen 4.0",
        aliases=("imagen-4.0-apimart",),
        ratios=("1:1", "4:3", "3:4", "16:9", "9:16"),
        default_ratio="16:9",
    ),
    APIMartImageModelSpec(
        key="gpt-image-1",
        label="GPT Image 1/1.5",
        aliases=("gpt-image-1-official", "gpt-image-1.5-official"),
        ratios=("1:1", "3:2", "2:3"),
        supports_image_to_image=True,
        supports_inpaint=True,
        max_reference_images=15,
        max_api_output_count=4,
        quality_options=("auto", "low", "medium", "high"),
        mask_via_generation=True,
    ),
    APIMartImageModelSpec(
        key="gpt-image-2",
        label="GPT Image 2",
        aliases=("gpt-image-2", "gpt-image-2-ext", "gpt-image-2-official"),
        ratios=RATIOS_GPT_IMAGE_2,
        resolutions=("1k", "2k", "4k"),
        default_resolution="1k",
        supports_image_to_image=True,
        supports_inpaint=True,
        max_reference_images=15,
        quality_options=("auto", "low", "medium", "high"),
        background_options=("auto", "opaque", "transparent"),
        output_formats=("png",),
        supports_pixel_size=True,
        mask_via_generation=True,
    ),
    APIMartImageModelSpec(
        key="gpt-image-2.5",
        label="GPT Image 2.5",
        aliases=(
            "gpt-image-2.5",
            "gpt-image-2.5-flare",
            "gpt-image-2.5-sunburst",
        ),
        ratios=RATIOS_GPT_IMAGE_2,
        resolutions=("1k", "2k", "4k"),
        default_ratio="auto",
        default_resolution="1k",
        supports_image_to_image=True,
        max_reference_images=16,
        max_api_output_count=4,
        quality_options=("auto", "low", "medium", "high", "xhigh", "max"),
        background_options=("auto", "opaque", "transparent"),
        output_formats=("png", "jpeg", "webp"),
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="gpt-image-2.5-ext",
        label="GPT Image 2.5 Ext",
        aliases=("gpt-image-2.5-ext", "gpt-image-2.5-ext-flare", "gpt-image-2.5-ext-sunburst"),
        ratios=("auto", "1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "5:4", "4:5", "21:9"),
        resolutions=("1K", "2K", "4K"),
        default_ratio="auto",
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=16,
        max_api_output_count=4,
        supports_pixel_size=True,
        request_model="gpt-image-2.5-ext",
        alias_payload_overrides={
            "gpt-image-2.5-ext": {"version": "flare"},
            "gpt-image-2.5-ext-flare": {"version": "flare"},
            "gpt-image-2.5-ext-sunburst": {"version": "sunburst"},
        },
    ),
    APIMartImageModelSpec(
        key="seedream-4.0",
        label="Seedream 4.0",
        aliases=("seedream-4.0", "seedream-4-0"),
        ratios=RATIOS_SEEDREAM,
        resolutions=("1K", "2K", "4K"),
        default_resolution="2K",
        supports_image_to_image=True,
        max_reference_images=10,
        max_api_output_count=15,
    ),
    APIMartImageModelSpec(
        key="seedream-4.5",
        label="Seedream 4.5",
        aliases=("seedream-4.5", "seedream-4-5"),
        ratios=RATIOS_SEEDREAM,
        resolutions=("2K", "4K"),
        default_resolution="2K",
        supports_image_to_image=True,
        max_reference_images=10,
        max_api_output_count=15,
    ),
    APIMartImageModelSpec(
        key="seedream-5-lite",
        label="Seedream 5.0 Lite",
        aliases=("seedream-5-0-lite", "seedream-5.0-lite"),
        ratios=tuple(value for value in RATIOS_SEEDREAM if value != "9:21"),
        resolutions=("2K", "3K", "4K"),
        default_resolution="2K",
        supports_image_to_image=True,
        max_reference_images=10,
        max_api_output_count=15,
    ),
    APIMartImageModelSpec(
        key="seedream-5-pro",
        label="Seedream 5.0 Pro",
        aliases=("seedream-5-0-pro", "seedream-5.0-pro"),
        ratios=tuple(value for value in RATIOS_SEEDREAM if value != "9:21"),
        resolutions=("1K", "1.5K", "2K"),
        default_ratio="auto",
        default_resolution="1.5K",
        supports_image_to_image=True,
        max_reference_images=10,
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="flux-kontext",
        label="Flux Kontext",
        aliases=("flux-kontext-pro", "flux-kontext-max"),
        ratios=RATIOS_FLUX,
        supports_image_to_image=True,
        max_reference_images=4,
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="flux-2",
        label="Flux 2.0",
        aliases=("flux-2-flex", "flux-2-pro", "flux-2-max"),
        ratios=RATIOS_FLUX,
        resolutions=("1MP", "2MP", "3MP", "4MP"),
        default_resolution="2MP",
        supports_image_to_image=True,
        max_reference_images=8,
        supports_pixel_size=True,
        resolution_aliases={
            "512": "1MP", "512p": "1MP", "1m": "1MP",
            "1k": "2MP", "1024": "2MP",
            "2k": "3MP", "2048": "3MP",
            "4k": "4MP",
        },
    ),
    APIMartImageModelSpec(
        key="qwen-image-2",
        label="Qwen Image 2.0",
        aliases=("qwen-image-2.0", "qwen-image-2.0-pro"),
        ratios=RATIOS_STANDARD,
        resolutions=("1K", "2K"),
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=1,
        max_api_output_count=6,
    ),
    APIMartImageModelSpec(
        key="qwen-image-3",
        label="Qwen Image 3.0",
        aliases=("qwen-image-3.0", "qwen-image-3.0-pro"),
        ratios=RATIOS_STANDARD,
        resolutions=("1K", "2K"),
        default_resolution="1K",
        supports_image_to_image=True,
        max_reference_images=3,
        max_api_output_count=6,
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="z-image-turbo",
        label="Z-Image-Turbo",
        aliases=("z-image-turbo",),
        ratios=RATIOS_STANDARD,
        resolutions=("1K", "2K"),
        default_resolution="1K",
    ),
    APIMartImageModelSpec(
        key="grok-imagine-1.5",
        label="Grok Imagine 1.5",
        aliases=("grok-imagine-1.5-apimart", "grok-imagine-1.5-ext"),
        ratios=("1:1", "16:9", "9:16", "3:2", "2:3"),
        supports_image_to_image=True,
        max_reference_images=5,
        max_api_output_count=10,
    ),
    APIMartImageModelSpec(
        key="grok-imagine-2-ext",
        label="Grok Imagine 2.0 Ext",
        aliases=("grok-imagine-2.0-ext",),
        ratios=RATIOS_STANDARD,
        resolutions=("quality",),
        default_resolution="quality",
        max_api_output_count=12,
        supports_pixel_size=True,
        resolution_aliases={"1k": "quality", "2k": "quality", "4k": "quality"},
    ),
    APIMartImageModelSpec(
        key="grok-imagine-official",
        label="Grok Imagine Official",
        aliases=("grok-imagine-image", "grok-imagine-image-quality"),
        ratios=RATIOS_GROK_OFFICIAL,
        resolutions=("1k", "2k"),
        default_ratio="auto",
        default_resolution="1k",
        supports_image_to_image=True,
        max_reference_images=5,
        max_api_output_count=10,
        size_field="aspect_ratio",
    ),
    APIMartImageModelSpec(
        key="grok-imagine-2-official",
        label="Grok Imagine 2.0 Official",
        aliases=("grok-imagine-image-2.0",),
        ratios=RATIOS_GROK_OFFICIAL,
        resolutions=("1k", "2k"),
        default_ratio="auto",
        default_resolution="1k",
        supports_image_to_image=True,
        max_reference_images=3,
        max_api_output_count=10,
        size_field="aspect_ratio",
    ),
    APIMartImageModelSpec(
        key="wan-2.7-image",
        label="Wan 2.7 Image",
        aliases=("wan2.7-image",),
        ratios=RATIOS_STANDARD,
        resolutions=("1K", "2K"),
        default_resolution="2K",
        supports_image_to_image=True,
        max_reference_images=9,
        max_api_output_count=12,
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="wan-2.7-image-pro",
        label="Wan 2.7 Image Pro",
        aliases=("wan2.7-image-pro",),
        ratios=RATIOS_STANDARD,
        resolutions=("1K", "2K", "4K"),
        default_resolution="2K",
        supports_image_to_image=True,
        max_reference_images=9,
        max_api_output_count=12,
        supports_pixel_size=True,
    ),
    APIMartImageModelSpec(
        key="midjourney",
        label="Midjourney Imagine",
        aliases=("midjourney", "midjourney-imagine"),
        ratios=RATIOS_GPT_IMAGE_2,
        default_ratio="auto",
        supports_image_to_image=True,
        max_reference_images=4,
        generation_endpoint="/midjourney/generations",
    ),
)


def normalize_model_id(model: str) -> str:
    return str(model or "").strip().lower().replace("_", "-")


_SPEC_BY_ALIAS = {
    normalize_model_id(alias): spec
    for spec in SPECS
    for alias in spec.aliases
}


def get_apimart_image_model_spec(model: str) -> Optional[APIMartImageModelSpec]:
    normalized = normalize_model_id(model)
    return _SPEC_BY_ALIAS.get(normalized) or _SPEC_BY_ALIAS.get(normalized.rsplit("/", 1)[-1])


def is_adapted_apimart_image_model(model: str) -> bool:
    return get_apimart_image_model_spec(model) is not None


def _capability_labels(spec: APIMartImageModelSpec) -> list[str]:
    labels = ["文生图"]
    if spec.supports_image_to_image:
        labels.append("参考图")
    if spec.supports_inpaint:
        labels.append("局部重绘")
    return labels


def get_apimart_image_model_support(model: str) -> dict:
    spec = get_apimart_image_model_spec(model)
    if not spec:
        return {
            "modelId": str(model or "").strip(),
            "adapted": False,
            "status": "unadapted",
            "reason": "当前版本尚未完成该 APIMart 图片模型的适配",
            "capabilityLabels": [],
            "capabilities": {},
        }
    return {
        "modelId": str(model or "").strip(),
        "adapted": True,
        "status": "adapted",
        "family": spec.key,
        "displayName": spec.label,
        "reason": "",
        "capabilityLabels": _capability_labels(spec),
        "capabilities": {
            "textToImage": True,
            "imageToImage": spec.supports_image_to_image,
            "inpaint": spec.supports_inpaint,
            "ratios": list(spec.ratios),
            "resolutions": list(spec.resolutions),
            "defaultRatio": spec.default_ratio,
            "defaultResolution": spec.default_resolution,
            "maxReferenceImages": spec.max_reference_images,
            "maxApiOutputCount": spec.max_api_output_count,
            "qualityOptions": list(spec.quality_options),
            "backgroundOptions": list(spec.background_options),
            "outputFormats": list(spec.output_formats),
        },
    }


def _parse_ratio(value: str) -> Optional[float]:
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*[:x*]\s*(\d+(?:\.\d+)?)\s*", value)
    if not match:
        return None
    width, height = float(match.group(1)), float(match.group(2))
    return width / height if width > 0 and height > 0 else None


def _normalize_size(value: str, spec: APIMartImageModelSpec) -> str:
    raw = str(value or spec.default_ratio).strip()
    lowered = raw.lower()
    supported = {item.lower(): item for item in spec.ratios}
    if lowered in supported:
        return supported[lowered]

    direct_alias = lowered.replace("x", ":")
    if direct_alias in supported:
        return supported[direct_alias]

    if spec.supports_pixel_size and re.fullmatch(r"\d{2,5}[x*]\d{2,5}", lowered):
        return lowered.replace("*", "x")

    ratio = _parse_ratio(lowered)
    if ratio:
        for candidate, canonical in supported.items():
            candidate_ratio = _parse_ratio(candidate)
            if candidate_ratio and abs(candidate_ratio - ratio) < 0.002:
                return canonical

    supported_text = "、".join(spec.ratios)
    raise ValueError(f"{spec.label} 不支持比例 {raw}；可选比例：{supported_text}")


def _normalize_resolution(value: str, spec: APIMartImageModelSpec) -> str:
    if not spec.resolutions:
        return ""
    raw = str(value or spec.default_resolution).strip()
    aliases = {key.lower(): resolved for key, resolved in spec.resolution_aliases.items()}
    if raw.lower() in aliases:
        return aliases[raw.lower()]
    supported = {item.lower(): item for item in spec.resolutions}
    if raw.lower() in supported:
        return supported[raw.lower()]
    supported_text = "、".join(spec.resolutions)
    raise ValueError(f"{spec.label} 不支持分辨率 {raw or '空'}；可选分辨率：{supported_text}")


def _alias_payload_overrides(model: str, spec: APIMartImageModelSpec) -> dict[str, str]:
    normalized = normalize_model_id(model)
    alias = normalized.rsplit("/", 1)[-1]
    overrides = spec.alias_payload_overrides.get(normalized) or spec.alias_payload_overrides.get(alias)
    return dict(overrides or {})


def validate_apimart_image_request(
    model: str,
    *,
    references: Optional[list[str]] = None,
    operation: str = "",
) -> APIMartImageModelSpec:
    spec = get_apimart_image_model_spec(model)
    if not spec:
        raise ValueError(f"当前版本尚未适配 APIMart 图片模型：{model or '未填写'}")
    reference_count = len([value for value in (references or []) if value])
    if reference_count and not spec.supports_image_to_image:
        raise ValueError(f"{spec.label} 仅支持文生图，请移除参考图或更换模型")
    if spec.max_reference_images and reference_count > spec.max_reference_images:
        raise ValueError(
            f"{spec.label} 最多支持 {spec.max_reference_images} 张参考图，当前有 {reference_count} 张"
        )
    if str(operation or "").strip().lower() == "inpaint" and not spec.supports_inpaint:
        raise ValueError(f"{spec.label} 当前不支持局部修改（蒙版重绘），请更换支持局部重绘的模型")
    return spec


def prepare_apimart_image_payload(payload: dict) -> tuple[dict, APIMartImageModelSpec]:
    request_payload = dict(payload or {})
    model = str(request_payload.get("model") or "").strip()
    spec = validate_apimart_image_request(model, operation=request_payload.get("operation", ""))
    request_payload.pop("operation", None)
    request_payload.pop("mask_url", None)
    request_payload.pop("original_image_url", None)
    alias_overrides = _alias_payload_overrides(model, spec)

    if spec.generation_endpoint == "/midjourney/generations":
        size = _normalize_size(request_payload.pop("size", spec.default_ratio), spec)
        prompt = str(request_payload.get("prompt") or "").strip()
        if size != "auto" and not re.search(r"(?:^|\s)--ar(?:\s|$)", prompt):
            request_payload["prompt"] = f"{prompt} --ar {size}".strip()
        request_payload.pop("resolution", None)
        request_payload.pop("quality", None)
        request_payload.pop("n", None)
        if spec.request_model:
            request_payload["model"] = spec.request_model
        request_payload.update(alias_overrides)
        return request_payload, spec

    if spec.request_model:
        request_payload["model"] = spec.request_model

    size = _normalize_size(request_payload.get("size") or spec.default_ratio, spec)
    request_payload.pop("size", None)
    request_payload[spec.size_field] = size

    resolution = _normalize_resolution(request_payload.get("resolution", ""), spec)
    if resolution:
        request_payload["resolution"] = resolution
    else:
        request_payload.pop("resolution", None)

    quality = str(request_payload.get("quality") or "auto").strip().lower()
    if spec.quality_options:
        if quality not in spec.quality_options:
            raise ValueError(f"{spec.label} 不支持质量选项 {quality}")
        request_payload["quality"] = quality
    else:
        request_payload.pop("quality", None)

    background = str(request_payload.get("background") or "auto").strip().lower()
    if spec.background_options:
        if background not in spec.background_options:
            supported_text = "、".join(spec.background_options)
            raise ValueError(f"{spec.label} 不支持背景选项 {background}；可选背景：{supported_text}")
        request_payload["background"] = background
    else:
        request_payload.pop("background", None)

    output_format = str(request_payload.get("output_format") or "").strip().lower()
    if spec.output_formats:
        if not output_format:
            output_format = spec.output_formats[0]
        if output_format not in spec.output_formats:
            supported_text = "、".join(spec.output_formats)
            raise ValueError(f"{spec.label} 不支持输出格式 {output_format}；可选格式：{supported_text}")
        request_payload["output_format"] = output_format
    else:
        request_payload.pop("output_format", None)

    if request_payload.get("background") == "transparent" and request_payload.get("output_format") == "jpeg":
        raise ValueError(f"{spec.label} 使用透明背景时，输出格式必须选择 png 或 webp")

    try:
        output_count = int(request_payload.get("n") or 1)
    except (TypeError, ValueError):
        output_count = 1
    if output_count < 1 or output_count > spec.max_api_output_count:
        raise ValueError(f"{spec.label} 单次请求支持 1-{spec.max_api_output_count} 张")
    request_payload["n"] = output_count
    request_payload.update(alias_overrides)
    return request_payload, spec


def apimart_image_generation_endpoint(model: str) -> str:
    spec = get_apimart_image_model_spec(model)
    return spec.generation_endpoint if spec else "/images/generations"


def apimart_mask_uses_generation_endpoint(model: str) -> bool:
    spec = get_apimart_image_model_spec(model)
    return bool(spec and spec.mask_via_generation)
