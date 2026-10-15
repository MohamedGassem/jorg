# backend/tests/unit/test_llm_client.py
"""Unit tests for the provider-agnostic LLM client."""

import json
from typing import Any

import httpx2
import pytest
from pydantic import BaseModel
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
from pydantic_ai.models.anthropic import AnthropicModel
from pydantic_ai.models.function import AgentInfo, FunctionModel
from pydantic_ai.models.test import TestModel
from pydantic_ai.providers.anthropic import AnthropicProvider

import services.llm.client as llm_client
from services.llm.client import LLMRefusalError, parse_structured


class _FakeSettings:
    def __init__(self, key: str | None) -> None:
        self.llm_api_key = key
        self.llm_model = "anthropic:claude-opus-4-8"


def _patch_settings(monkeypatch: Any, key: str | None) -> None:
    monkeypatch.setattr(llm_client, "get_settings", lambda: _FakeSettings(key))


def test_disabled_without_api_key(monkeypatch: Any) -> None:
    _patch_settings(monkeypatch, None)
    assert llm_client.assisted_templating_enabled() is False
    assert llm_client.get_llm_model() is None


def test_enabled_with_api_key_builds_configured_model(monkeypatch: Any) -> None:
    _patch_settings(monkeypatch, "sk-test")
    assert llm_client.assisted_templating_enabled() is True
    model = llm_client.get_llm_model()
    assert isinstance(model, AnthropicModel)
    assert model.model_name == "claude-opus-4-8"


class _Out(BaseModel):
    value: str


async def test_parse_structured_returns_validated_output() -> None:
    model = TestModel(custom_output_args={"value": "ok"})
    result = await parse_structured(model, prompt="hello", output_format=_Out)
    assert result == _Out(value="ok")


async def test_parse_structured_raises_on_refusal() -> None:
    def refuse(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart("non")], finish_reason="content_filter")

    with pytest.raises(LLMRefusalError):
        await parse_structured(FunctionModel(refuse), prompt="x", output_format=_Out)


async def test_parse_structured_raises_when_output_never_valid() -> None:
    def bad_output(messages: list[ModelMessage], info: AgentInfo) -> ModelResponse:
        return ModelResponse(parts=[TextPart("pas de JSON")])

    with pytest.raises(LLMRefusalError):
        await parse_structured(FunctionModel(bad_output), prompt="x", output_format=_Out)


async def test_anthropic_request_uses_native_output_and_adaptive_thinking() -> None:
    sent: list[dict[str, Any]] = []

    def handler(request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        sent.append(body)
        return httpx2.Response(
            200,
            json={
                "id": "msg_1",
                "type": "message",
                "role": "assistant",
                "model": "claude-opus-4-8",
                "content": [{"type": "text", "text": '{"value": "ok"}'}],
                "stop_reason": "end_turn",
                "stop_sequence": None,
                "usage": {"input_tokens": 1, "output_tokens": 1},
            },
        )

    provider = AnthropicProvider(
        api_key="sk-test", http_client=httpx2.AsyncClient(transport=httpx2.MockTransport(handler))
    )
    model = AnthropicModel("claude-opus-4-8", provider=provider)

    result = await parse_structured(model, prompt="hello", output_format=_Out)

    assert result == _Out(value="ok")
    assert sent[0]["output_config"]["format"]["type"] == "json_schema"
    assert sent[0]["thinking"]["type"] == "adaptive"
    assert sent[0]["max_tokens"] == 16000
