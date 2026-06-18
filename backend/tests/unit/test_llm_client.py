# backend/tests/unit/test_llm_client.py
"""Unit tests for the shared Anthropic client gating."""

from typing import Any

import pytest
from pydantic import BaseModel

import services.llm.client as llm_client
from services.llm.client import LLMRefusalError, parse_structured


class _FakeSettings:
    def __init__(self, key: str | None) -> None:
        self.anthropic_api_key = key
        self.llm_model = "claude-opus-4-8"


def _patch_settings(monkeypatch: Any, key: str | None) -> None:
    monkeypatch.setattr(llm_client, "get_settings", lambda: _FakeSettings(key))


def test_disabled_without_api_key(monkeypatch: Any) -> None:
    _patch_settings(monkeypatch, None)
    assert llm_client.assisted_templating_enabled() is False
    assert llm_client.get_anthropic_client() is None


def test_enabled_with_api_key(monkeypatch: Any) -> None:
    _patch_settings(monkeypatch, "sk-test")
    assert llm_client.assisted_templating_enabled() is True
    assert llm_client.get_anthropic_client() is not None


class _Out(BaseModel):
    value: str


class _FakeMessages:
    def __init__(self, response: object) -> None:
        self._response = response
        self.calls: list[dict[str, object]] = []

    async def parse(self, **kwargs: object) -> object:
        self.calls.append(kwargs)
        return self._response


class _FakeClient:
    def __init__(self, response: object) -> None:
        self.messages = _FakeMessages(response)


class _Resp:
    def __init__(self, stop_reason: str | None, parsed_output: object) -> None:
        self.stop_reason = stop_reason
        self.parsed_output = parsed_output


async def test_parse_structured_returns_parsed_output() -> None:
    client = _FakeClient(_Resp(stop_reason="end_turn", parsed_output=_Out(value="ok")))
    result = await parse_structured(
        client, model="claude-opus-4-8", prompt="hello", output_format=_Out
    )
    assert result == _Out(value="ok")
    assert client.messages.calls[0]["thinking"] == {"type": "adaptive"}
    assert client.messages.calls[0]["output_format"] is _Out


async def test_parse_structured_raises_on_refusal() -> None:
    client = _FakeClient(_Resp(stop_reason="refusal", parsed_output=None))
    with pytest.raises(LLMRefusalError):
        await parse_structured(client, model="claude-opus-4-8", prompt="x", output_format=_Out)


async def test_parse_structured_raises_when_no_parsed_output() -> None:
    client = _FakeClient(_Resp(stop_reason="end_turn", parsed_output=None))
    with pytest.raises(LLMRefusalError):
        await parse_structured(client, model="claude-opus-4-8", prompt="x", output_format=_Out)
