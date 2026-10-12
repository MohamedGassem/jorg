# backend/core/config.py
from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    env: Literal["development", "test", "production"] = "development"

    database_url: str

    secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 30

    email_backend: Literal["console", "smtp"] = "console"
    smtp_host: str | None = None
    smtp_port: int = 587
    smtp_user: str | None = None
    smtp_password: str | None = None
    email_from: str = "noreply@jorg.local"

    frontend_url: str = "http://localhost:3000"

    cors_origins: list[str] = ["http://localhost:3000"]

    log_level: str = "INFO"

    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str = "http://localhost:8000/auth/oauth/google/callback"

    linkedin_client_id: str | None = None
    linkedin_client_secret: str | None = None
    linkedin_redirect_uri: str = "http://localhost:8000/auth/oauth/linkedin/callback"

    # Storage backend
    storage_backend: Literal["local", "s3"] = "local"
    s3_bucket_name: str | None = None
    s3_endpoint_url: str | None = None
    s3_access_key_id: str | None = None
    s3_secret_access_key: str | None = None
    s3_region: str = "auto"

    # Gotenberg PDF service (empty = disabled)
    gotenberg_url: str | None = None

    # LLM (assisted templating - empty = feature disabled)
    anthropic_api_key: str | None = None
    llm_model: str = "claude-opus-4-8"

    # Admin secret for privileged endpoints (e.g. alpha code generation)
    admin_secret: str | None = None

    # Alpha invite gate — set to False to allow recruiter registration without a code
    alpha_invite_required: bool = True

    # E2E smoke test seam: when true, exposes a read-only test-support route
    # returning the latest invitation token so the browser test can skip email.
    # MUST stay false in production.
    e2e_test_mode: bool = False

    @field_validator("gotenberg_url")
    @classmethod
    def _validate_gotenberg_url(cls, v: str | None) -> str | None:
        if v is None:
            return v
        if not v.startswith(("http://", "https://")):
            raise ValueError("GOTENBERG_URL must start with http:// or https://")
        return v.rstrip("/")

    @field_validator("secret_key")
    @classmethod
    def _validate_secret_key(cls, v: str) -> str:
        if len(v) < 32:
            raise ValueError("SECRET_KEY must be at least 32 characters long")
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
