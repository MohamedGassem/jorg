# backend/tests/conftest.py
import os

# Placeholder so importing Settings succeeds. Unit tests are pure; integration
# tests run against a real Postgres via testcontainers (see integration/conftest).
# A non-sqlite URL makes any accidental DB use fail loudly instead of silently
# hitting an in-memory sqlite that masks Postgres-only behaviour.
os.environ.setdefault(
    "DATABASE_URL", "postgresql+asyncpg://unused:unused@127.0.0.1:5432/unused_placeholder"
)
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-tests-xxxxxxxxxxxxxxx")
os.environ.setdefault("ENV", "test")
os.environ.setdefault("EMAIL_BACKEND", "console")
os.environ.setdefault("FRONTEND_URL", "http://localhost:3000")
os.environ.setdefault("ALPHA_INVITE_REQUIRED", "false")
