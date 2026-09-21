"""Remote API provider adapters."""

from .base import ProviderError, SubmissionResult, TaskResult, UnsupportedProviderError
from .registry import get_provider_adapter

__all__ = [
    "ProviderError",
    "SubmissionResult",
    "TaskResult",
    "UnsupportedProviderError",
    "get_provider_adapter",
]
