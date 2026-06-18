# backend/services/llm/client.py
"""Anthropic client shared by LLM-backed features (templating, future CV parsing)."""

from typing import Any

from anthropic import AsyncAnthropic
from pydantic import BaseModel

from core.config import get_settings


def assisted_templating_enabled() -> bool:
    return get_settings().anthropic_api_key is not None


def get_anthropic_client() -> AsyncAnthropic | None:
    settings = get_settings()
    if settings.anthropic_api_key is None:
        return None
    return AsyncAnthropic(api_key=settings.anthropic_api_key)


class LLMRefusalError(Exception):
    """Raised when the LLM refuses the request or returns no parsable output."""


async def parse_structured[T: BaseModel](
    client: Any,
    *,
    model: str,
    prompt: str,
    output_format: type[T],
    max_tokens: int = 16000,
) -> T:
    """Single structured-output call shared by LLM-backed features."""
    response = await client.messages.parse(
        model=model,
        max_tokens=max_tokens,
        thinking={"type": "adaptive"},
        messages=[{"role": "user", "content": prompt}],
        output_format=output_format,
    )
    if getattr(response, "stop_reason", None) == "refusal":
        raise LLMRefusalError("LLM refused the request")
    parsed = response.parsed_output
    if not isinstance(parsed, output_format):
        raise LLMRefusalError("LLM returned no parsable output")
    return parsed
