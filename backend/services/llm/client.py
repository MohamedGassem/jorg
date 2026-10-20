# backend/services/llm/client.py
"""Provider-agnostic LLM access shared by LLM-backed features (templating, future CV parsing).

The provider is picked from settings.llm_model ("provider:model", Pydantic AI format),
so changing provider is a configuration change, not a code change.
"""

from typing import Any

from pydantic import BaseModel
from pydantic_ai import Agent
from pydantic_ai.exceptions import UnexpectedModelBehavior
from pydantic_ai.models import Model, infer_model
from pydantic_ai.providers import Provider, infer_provider_class

from core.config import get_settings


def assisted_templating_enabled() -> bool:
    return get_settings().llm_api_key is not None


def get_llm_model() -> Model | None:
    settings = get_settings()
    api_key = settings.llm_api_key
    if api_key is None:
        return None

    def _provider(name: str) -> Provider[Any]:
        return infer_provider_class(name)(api_key=api_key)  # type: ignore[call-arg]

    return infer_model(settings.llm_model, provider_factory=_provider)


class LLMRefusalError(Exception):
    """Raised when the LLM refuses the request or returns no parsable output."""


async def parse_structured[T: BaseModel](
    model: Model,
    *,
    prompt: str,
    output_format: type[T],
    max_tokens: int = 16000,
) -> T:
    """Single structured-output call shared by LLM-backed features."""
    agent = Agent(
        model,
        output_type=output_format,
        model_settings={"max_tokens": max_tokens, "thinking": True},
    )
    try:
        result = await agent.run(prompt)
    except UnexpectedModelBehavior as exc:  # refusal, or output still invalid after retries
        raise LLMRefusalError(str(exc)) from exc
    return result.output
