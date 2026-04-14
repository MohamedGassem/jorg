# backend/tests/unit/test_config.py
import pytest

from core.config import Settings


def test_settings_loads_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
    monkeypatch.setenv("SECRET_KEY", "test-secret-" + "x" * 32)
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:3000")

    settings = Settings()

    assert settings.database_url == "postgresql+asyncpg://u:p@h:5432/d"
    assert settings.secret_key.startswith("test-secret-")
    assert settings.access_token_expire_minutes == 15  # default
    assert settings.refresh_token_expire_days == 30  # default


def test_settings_rejects_short_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://u:p@h:5432/d")
    monkeypatch.setenv("SECRET_KEY", "too-short")

    with pytest.raises(ValueError, match="SECRET_KEY"):
        Settings()
