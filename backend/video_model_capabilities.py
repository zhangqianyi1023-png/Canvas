"""Canonical video model capability rules shared by relay adapters."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional


SEEDANCE_RATIOS = ("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16", "21:9")
MINIMAX_H3_RATIOS = ("adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16")
COMMON_VIDEO_RATIOS = ("16:9", "9:16", "1:1")
MULTIMODAL_VIDEO_RATIOS = ("adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16")


@dataclass(frozen=True)
class VideoModelSpec:
    key: str
    label: str
    aliases: tuple[str, ...]
    ratios: tuple[str, ...]
    resolutions: tuple[str, ...]
    min_duration: int
    max_duration: int
    default_duration: int
    default_resolution: str
    default_ratio: str = ""
    max_reference_images: int = 0
    max_reference_videos: int = 0
    max_reference_audio: int = 0
    generation_modes: tuple[str, ...] = ()
    supports_audio_output: bool = False
    supports_audio_only_reference: bool = False


VIDEO_MODEL_SPECS = (
    VideoModelSpec(
        key="seedance-2.0",
        label="Seedance 2.0",
        aliases=(
            "dreamina-seedance-2-0-260128",
            "dreamina-seedance-2-0",
            "doubao-seedance-2.0",
            "doubao-seedance-2-0",
        ),
        ratios=SEEDANCE_RATIOS,
        resolutions=("480p", "720p", "1080p", "4k"),
        min_duration=4,
        max_duration=15,
        default_duration=5,
        default_resolution="720p",
        default_ratio="16:9",
        max_reference_images=9,
        max_reference_videos=3,
        max_reference_audio=3,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="seedance-2.0-mini",
        label="Seedance 2.0 Mini",
        aliases=(
            "dreamina-seedance-2-0-mini-260615",
            "dreamina-seedance-2-0-mini",
            "doubao-seedance-2.0-mini",
            "doubao-seedance-2-0-mini",
        ),
        ratios=SEEDANCE_RATIOS,
        resolutions=("480p", "720p"),
        min_duration=4,
        max_duration=15,
        default_duration=5,
        default_resolution="720p",
        default_ratio="16:9",
        max_reference_images=9,
        max_reference_videos=3,
        max_reference_audio=3,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="seedance-2.0-fast",
        label="Seedance 2.0 Fast",
        aliases=(
            "dreamina-seedance-2-0-fast-260128",
            "dreamina-seedance-2-0-fast",
            "doubao-seedance-2.0-fast",
            "doubao-seedance-2-0-fast",
        ),
        ratios=SEEDANCE_RATIOS,
        resolutions=("480p", "720p"),
        min_duration=4,
        max_duration=15,
        default_duration=5,
        default_resolution="720p",
        default_ratio="16:9",
        max_reference_images=9,
        max_reference_videos=3,
        max_reference_audio=3,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="seedance-2.5",
        label="Seedance 2.5",
        aliases=(
            "dreamina-seedance-2-5-260628",
            "dreamina-seedance-2-5",
            "doubao-seedance-2.5",
            "doubao-seedance-2-5",
        ),
        ratios=SEEDANCE_RATIOS,
        resolutions=("480p", "720p", "1080p"),
        min_duration=4,
        max_duration=30,
        default_duration=-1,
        default_resolution="720p",
        max_reference_images=30,
        max_reference_videos=10,
        max_reference_audio=10,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=True,
        supports_audio_only_reference=True,
    ),
    VideoModelSpec(
        key="minimax-h3",
        label="MiniMax-H3",
        aliases=(
            "MiniMax-H3",
            "minimax-h3",
        ),
        ratios=MINIMAX_H3_RATIOS,
        resolutions=("768P", "2K"),
        min_duration=4,
        max_duration=15,
        default_duration=5,
        default_resolution="768P",
        max_reference_images=9,
        max_reference_videos=3,
        max_reference_audio=3,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=False,
    ),
    VideoModelSpec(
        key="kling-v3",
        label="Kling v3",
        aliases=(
            "kling-v3",
            "kling-v3.0",
            "kling-3.0",
            "kling-v3-video",
            "kling-v3.0-video",
            "kling/kling-v3-video-generation",
            "kling/kling-v3-omni-video-generation",
        ),
        ratios=COMMON_VIDEO_RATIOS,
        resolutions=("720p", "1080p", "4k"),
        min_duration=3,
        max_duration=15,
        default_duration=5,
        default_resolution="720p",
        max_reference_images=2,
        max_reference_videos=1,
        generation_modes=("first_last_frame",),
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="sora-2",
        label="Sora 2",
        aliases=(
            "sora-2",
        ),
        ratios=("16:9", "9:16"),
        resolutions=("720p", "1080p"),
        min_duration=4,
        max_duration=20,
        default_duration=8,
        default_resolution="720p",
        max_reference_images=1,
    ),
    VideoModelSpec(
        key="wan3.0-video",
        label="Wan 3.0 Video",
        aliases=(
            "wan3.0-video",
            "wan-3.0-video",
            "wan-3.0",
            "wan3-video",
        ),
        ratios=MULTIMODAL_VIDEO_RATIOS,
        resolutions=("480p", "720p", "1080p"),
        min_duration=4,
        max_duration=30,
        default_duration=5,
        default_resolution="720p",
        max_reference_images=10,
        max_reference_videos=5,
        max_reference_audio=5,
        generation_modes=("omni_reference", "first_last_frame"),
        supports_audio_output=True,
        supports_audio_only_reference=False,
    ),
    VideoModelSpec(
        key="happyhorse",
        label="HappyHorse",
        aliases=(
            "happyhorse",
            "happyhorse-1.0",
            "happyhorse-1-0",
            "happyhorse-1.1",
            "happyhorse-1-1",
            "happyhorse-1.0-video",
            "happyhorse-1.1-video",
        ),
        ratios=("16:9", "9:16", "1:1", "4:3", "3:4"),
        resolutions=("720p", "1080p"),
        min_duration=3,
        max_duration=15,
        default_duration=5,
        default_resolution="720p",
        max_reference_images=9,
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="gemini-omni",
        label="Gemini Omni",
        aliases=(
            "gemini-omni",
            "gemini-omni-flash-preview",
            "gemini-omni-flash",
            "gemini-omni-1.1-flash",
            "gemini-omni-flash-video",
        ),
        ratios=("16:9", "9:16"),
        resolutions=("720p",),
        min_duration=4,
        max_duration=10,
        default_duration=8,
        default_resolution="720p",
        supports_audio_output=True,
    ),
    VideoModelSpec(
        key="grok-imagine-1.5-video",
        label="Grok Imagine 1.5 Video",
        aliases=(
            "grok-imagine-1.5-video",
            "grok-imagine-video-v1.5",
            "grok-imagine-video-1.5",
            "grok-imagine-1-5-video",
        ),
        ratios=("16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"),
        resolutions=("480p", "720p"),
        min_duration=1,
        max_duration=15,
        default_duration=6,
        default_resolution="720p",
        max_reference_images=1,
        supports_audio_output=True,
    ),
)


_SPEC_BY_ALIAS = {
    alias.lower().replace("_", "-"): spec
    for spec in VIDEO_MODEL_SPECS
    for alias in (spec.key, *spec.aliases)
}


def get_video_model_spec(model: str) -> Optional[VideoModelSpec]:
    normalized = str(model or "").strip().lower().replace("_", "-")
    if not normalized:
        return None
    return _SPEC_BY_ALIAS.get(normalized)


def is_adapted_video_model(model: str) -> bool:
    return get_video_model_spec(model) is not None


def get_video_model_support(model: str) -> dict:
    spec = get_video_model_spec(model)
    if not spec:
        return {
            "modelId": str(model or "").strip(),
            "adapted": False,
            "status": "unadapted",
            "reason": "当前版本尚未完成该视频模型的能力适配",
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
        "capabilityLabels": [
            label for label in [
                "文生视频",
                "参考图生视频" if spec.max_reference_images else "",
                f"{spec.min_duration}-{spec.max_duration}秒",
                "有声视频" if spec.supports_audio_output else "",
                "全能参考" if "omni_reference" in spec.generation_modes else "",
                "首尾帧" if "first_last_frame" in spec.generation_modes else "",
            ] if label
        ],
        "capabilities": {
            "textToVideo": True,
            "imageToVideo": spec.max_reference_images > 0,
            "ratios": list(spec.ratios),
            "resolutions": list(spec.resolutions),
            "defaultRatio": spec.default_ratio or spec.ratios[0],
            "minDuration": spec.min_duration,
            "maxDuration": spec.max_duration,
            "defaultDuration": spec.default_duration,
            "defaultResolution": spec.default_resolution,
            "maxReferenceImages": spec.max_reference_images,
            "maxReferenceVideos": spec.max_reference_videos,
            "maxReferenceAudio": spec.max_reference_audio,
            "generationModes": list(spec.generation_modes),
            "supportsOmniReference": "omni_reference" in spec.generation_modes,
            "supportsFirstLastFrame": "first_last_frame" in spec.generation_modes,
            "supportsAudioOutput": spec.supports_audio_output,
            "supportsAudioOnlyReference": spec.supports_audio_only_reference,
        },
    }


def build_video_model_capability_map(
    models: Iterable[str],
    existing: dict[str, dict] | None = None,
) -> dict[str, dict]:
    existing_map = {
        str(model): dict(detail)
        for model, detail in (existing or {}).items()
        if model and isinstance(detail, dict)
    }
    capability_map: dict[str, dict] = {}
    for model in dict.fromkeys(str(item).strip() for item in models if str(item).strip()):
        base = get_video_model_support(model)
        override = existing_map.pop(model, {})
        capability_map[model] = {**base, **override}
    for model, override in existing_map.items():
        capability_map[model] = {**get_video_model_support(model), **override}
    return capability_map


def normalize_video_request(
    *,
    model: str,
    duration: int,
    aspect_ratio: str,
    resolution: str,
    image_count: int = 0,
    video_count: int = 0,
    audio_count: int = 0,
) -> dict:
    spec = get_video_model_spec(model)
    if not spec:
        return {
            "duration": duration,
            "aspect_ratio": aspect_ratio,
            "resolution": resolution,
            "spec": None,
        }

    try:
        normalized_duration = int(duration)
    except (TypeError, ValueError):
        normalized_duration = spec.default_duration
    if normalized_duration == -1 and spec.default_duration == -1:
        pass
    elif not spec.min_duration <= normalized_duration <= spec.max_duration:
        raise ValueError(f"{spec.label} 的视频时长必须在 {spec.min_duration} 到 {spec.max_duration} 秒之间。")

    normalized_ratio = str(aspect_ratio or spec.ratios[0]).strip().lower()
    if normalized_ratio not in {item.lower() for item in spec.ratios}:
        supported_text = "、".join(spec.ratios)
        raise ValueError(f"{spec.label} 不支持比例 {aspect_ratio or '空'}；可选比例：{supported_text}")

    supported_resolutions = {item.lower(): item for item in spec.resolutions}
    normalized_resolution = supported_resolutions.get(str(resolution or "").strip().lower())
    if not normalized_resolution:
        normalized_resolution = spec.default_resolution

    if spec.max_reference_images and image_count > spec.max_reference_images:
        raise ValueError(f"{spec.label} 最多支持 {spec.max_reference_images} 张参考图，当前有 {image_count} 张")
    if spec.max_reference_videos and video_count > spec.max_reference_videos:
        raise ValueError(f"{spec.label} 最多支持 {spec.max_reference_videos} 个参考视频，当前有 {video_count} 个")
    if spec.max_reference_audio and audio_count > spec.max_reference_audio:
        raise ValueError(f"{spec.label} 最多支持 {spec.max_reference_audio} 个参考音频，当前有 {audio_count} 个")
    if audio_count > 0 and image_count == 0 and video_count == 0 and not spec.supports_audio_only_reference:
        raise ValueError(f"{spec.label} 不能只使用参考音频，请至少增加一张参考图片或一段参考视频。")

    return {
        "duration": normalized_duration,
        "aspect_ratio": next(item for item in spec.ratios if item.lower() == normalized_ratio),
        "resolution": normalized_resolution,
        "spec": spec,
    }
