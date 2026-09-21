from __future__ import annotations

from .apimart import APIMartAdapter
from .base import ProviderAdapter, UnsupportedProviderError
from .minimax import MiniMaxAdapter
from .openai_compatible import OpenAICompatibleAdapter
from .rightcode import RightCodeAdapter


_ADAPTERS = {
    "openai": OpenAICompatibleAdapter(),
    "apimart": APIMartAdapter(),
    "minimax": MiniMaxAdapter(),
    "rightcode": RightCodeAdapter(),
}


def get_provider_adapter(protocol: str) -> ProviderAdapter:
    normalized = (protocol or "openai").strip().lower()
    adapter = _ADAPTERS.get(normalized)
    if adapter:
        return adapter
    raise UnsupportedProviderError(
        f"协议 {normalized or 'unknown'} 暂不支持图片或视频生成；"
        "请使用 OpenAI 兼容协议，或为该平台增加专用适配器"
    )
