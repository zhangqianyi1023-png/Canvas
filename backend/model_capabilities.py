"""Canonical model capability helpers shared by all relay adapters."""

from __future__ import annotations

from typing import Iterable, Mapping

from apimart_image_models import (
    APIMartImageModelSpec as ImageModelSpec,
    RATIOS_FLUX,
    RATIOS_GEMINI,
    RATIOS_GEMINI_EXTENDED,
    RATIOS_GROK_OFFICIAL,
    RATIOS_GPT_IMAGE_2,
    RATIOS_SEEDREAM,
    RATIOS_STANDARD,
    SPECS as IMAGE_MODEL_SPECS,
    get_apimart_image_model_spec as get_image_model_spec,
    apimart_image_generation_endpoint as get_image_generation_endpoint,
    apimart_mask_uses_generation_endpoint as model_uses_generation_endpoint,
    get_apimart_image_model_support as _get_apimart_image_model_support,
    is_adapted_apimart_image_model as is_adapted_image_model,
    prepare_apimart_image_payload as prepare_image_payload,
    validate_apimart_image_request as validate_image_request,
)


def get_image_model_support(model: str) -> dict:
    support = _get_apimart_image_model_support(model)
    spec = get_image_model_spec(model)
    if not spec or not support.get("adapted"):
        return support
    capabilities = dict(support.get("capabilities") or {})
    capabilities["supportsPixelSize"] = bool(spec.supports_pixel_size)
    capabilities["sizeField"] = spec.size_field
    capabilities["generationEndpoint"] = spec.generation_endpoint
    capabilities["maskViaGeneration"] = bool(spec.mask_via_generation)
    support["capabilities"] = capabilities
    return support


def build_image_model_capability_map(
    models: Iterable[str],
    existing: Mapping[str, dict] | None = None,
) -> dict[str, dict]:
    existing_map = {
        str(model): dict(detail)
        for model, detail in (existing or {}).items()
        if model and isinstance(detail, dict)
    }
    capability_map: dict[str, dict] = {}
    for model in dict.fromkeys(str(item).strip() for item in models if str(item).strip()):
        base = get_image_model_support(model)
        override = existing_map.pop(model, {})
        capability_map[model] = {**base, **override}
    for model, override in existing_map.items():
        capability_map[model] = {**get_image_model_support(model), **override}
    return capability_map


def expand_image_model_selection_aliases(models: Iterable[str]) -> list[str]:
    expanded: list[str] = []
    for model in dict.fromkeys(str(item).strip() for item in models if str(item).strip()):
        if model == "gpt-image-2.5-ext":
            expanded.extend(["gpt-image-2.5-ext-flare", "gpt-image-2.5-ext-sunburst"])
        else:
            expanded.append(model)
    return list(dict.fromkeys(expanded))


__all__ = [
    "ImageModelSpec",
    "IMAGE_MODEL_SPECS",
    "RATIOS_FLUX",
    "RATIOS_GEMINI",
    "RATIOS_GEMINI_EXTENDED",
    "RATIOS_GROK_OFFICIAL",
    "RATIOS_GPT_IMAGE_2",
    "RATIOS_SEEDREAM",
    "RATIOS_STANDARD",
    "build_image_model_capability_map",
    "expand_image_model_selection_aliases",
    "get_image_generation_endpoint",
    "get_image_model_support",
    "is_adapted_image_model",
    "model_uses_generation_endpoint",
    "prepare_image_payload",
    "validate_image_request",
]
