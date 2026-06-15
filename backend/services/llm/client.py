# backend/services/llm/client.py
"""Anthropic client shared by LLM-backed features (templating, future CV parsing)."""

from anthropic import AsyncAnthropic

from core.config import get_settings


def assisted_templating_enabled() -> bool:
    return get_settings().anthropic_api_key is not None


def get_anthropic_client() -> AsyncAnthropic | None:
    settings = get_settings()
    if settings.anthropic_api_key is None:
        return None
    return AsyncAnthropic(api_key=settings.anthropic_api_key)
