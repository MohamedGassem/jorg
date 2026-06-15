# backend/tests/unit/test_llm_client.py
"""Unit tests for the shared Anthropic client gating."""

from typing import Any

import services.llm.client as llm_client


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
